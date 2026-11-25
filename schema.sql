-- Seva Board: database setup for Supabase.
-- Run this whole file once: Supabase -> SQL Editor -> New query -> paste -> Run.
-- It is safe to run again later (for example after an update).

-- ---------------------------------------------------------------- tables

create table if not exists public.festivals (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text not null default '',
  start_date   date not null,
  end_date     date,
  image_url    text,
  is_open      boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  festival_id   uuid not null references public.festivals(id) on delete cascade,
  name          text not null,
  description   text not null default '',
  image_url     text,
  task_date     date not null,
  start_time    time not null,
  end_time      time not null,
  needed        int  not null check (needed >= 1 and needed <= 500),
  slot_minutes  int  not null default 60 check (slot_minutes between 15 and 480),
  created_at    timestamptz not null default now(),
  check (end_time > start_time)
);

create table if not exists public.volunteers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  phone       text not null,
  consent_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create table if not exists public.signups (
  id            uuid primary key default gen_random_uuid(),
  volunteer_id  uuid not null references public.volunteers(id) on delete cascade,
  task_id       uuid not null references public.tasks(id) on delete cascade,
  slot_idx      int  not null check (slot_idx >= 0),
  unique (volunteer_id, task_id, slot_idx)
);

-- Organisers. A row here is what makes a signed-in account an admin. Remove the row and access ends at once.
create table if not exists public.admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  added_by    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- One-time invite codes. Only a fingerprint of the code is stored, never the code itself.
create table if not exists public.admin_invites (
  id          uuid primary key default gen_random_uuid(),
  code_hash   text not null unique,
  note        text not null default '',
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     uuid references auth.users(id) on delete set null
);

-- Slows down sign-up spam from one internet address. Rows are deleted after a day.
create table if not exists public.signup_throttle (
  ip  text not null,
  at  timestamptz not null default now()
);

create index if not exists tasks_festival_idx      on public.tasks(festival_id);
create index if not exists signups_task_slot_idx   on public.signups(task_id, slot_idx);
create index if not exists signups_volunteer_idx   on public.signups(volunteer_id);
create index if not exists signup_throttle_idx     on public.signup_throttle(ip, at);

-- ------------------------------------------------------- who is an admin

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.am_i_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin();
$$;

revoke all on function public.am_i_admin() from public;
grant execute on function public.am_i_admin() to anon, authenticated;

-- ------------------------------------------------- access rules (RLS)
-- Visitors can read festivals and seva. Everything else needs an admin account.
-- Volunteers add themselves only through submit_signup() below.

alter table public.festivals       enable row level security;
alter table public.tasks           enable row level security;
alter table public.volunteers      enable row level security;
alter table public.signups         enable row level security;
alter table public.admins          enable row level security;
alter table public.admin_invites   enable row level security;
alter table public.signup_throttle enable row level security;

drop policy if exists festivals_public_read on public.festivals;
drop policy if exists festivals_admin_write on public.festivals;
drop policy if exists tasks_public_read     on public.tasks;
drop policy if exists tasks_admin_write     on public.tasks;
drop policy if exists volunteers_admin_all  on public.volunteers;
drop policy if exists signups_admin_all     on public.signups;
drop policy if exists admins_admin_read     on public.admins;

create policy festivals_public_read on public.festivals for select to anon, authenticated using (true);
create policy festivals_admin_write on public.festivals for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy tasks_public_read     on public.tasks     for select to anon, authenticated using (true);
create policy tasks_admin_write     on public.tasks     for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy volunteers_admin_all  on public.volunteers for all   to authenticated using (public.is_admin()) with check (public.is_admin());
create policy signups_admin_all     on public.signups    for all   to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admins_admin_read     on public.admins     for select to authenticated using (public.is_admin());
-- admins, admin_invites and signup_throttle have no write policies: they change only through the functions below.

revoke all on public.admin_invites   from anon, authenticated;
revoke all on public.signup_throttle from anon, authenticated;
revoke insert, update, delete on public.admins from anon, authenticated;

-- ----------------------------------- remove contact details nobody needs

-- When a volunteer has no sign-ups left (a seva or festival was deleted, or an admin removed them),
-- their name, email and phone number are deleted too.
create or replace function public.remove_orphan_volunteers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.volunteers v
   where not exists (select 1 from public.signups s where s.volunteer_id = v.id);
  return null;
end;
$$;

revoke all on function public.remove_orphan_volunteers() from public, anon, authenticated;

drop trigger if exists signups_orphans on public.signups;
create trigger signups_orphans
  after delete on public.signups
  for each statement execute function public.remove_orphan_volunteers();

-- ------------------------------------------- public functions (no personal data)

-- How many people have taken each slot. Contains no names or contact details.
create or replace function public.slot_counts()
returns table (task_id uuid, slot_idx int, taken bigint)
language sql
stable
security definer
set search_path = public
as $$
  select s.task_id, s.slot_idx, count(*)::bigint
  from public.signups s
  group by s.task_id, s.slot_idx;
$$;

revoke all on function public.slot_counts() from public;
grant execute on function public.slot_counts() to anon, authenticated;

-- Internal helper: turns chosen slots into time spans. Not callable from the website.
create or replace function public._chosen_spans(p_slots jsonb)
returns table (tid uuid, idx int, festival_id uuid, is_open boolean, needed int, s timestamp, e timestamp, tend timestamp)
language sql
stable
security definer
set search_path = public
as $$
  with chosen as (
    select (x->>'task_id')::uuid as tid, (x->>'slot_idx')::int as idx
    from jsonb_array_elements(p_slots) x
  )
  select c.tid, c.idx, t.festival_id, f.is_open, t.needed,
         (t.task_date + t.start_time) + make_interval(mins => c.idx * t.slot_minutes),
         least((t.task_date + t.start_time) + make_interval(mins => (c.idx + 1) * t.slot_minutes),
               (t.task_date + t.end_time)),
         (t.task_date + t.end_time)
  from chosen c
  left join public.tasks t on t.id = c.tid
  left join public.festivals f on f.id = t.festival_id;
$$;

revoke all on function public._chosen_spans(jsonb) from public, anon, authenticated;

-- Saves one volunteer and all their slots in one step.
-- Refuses the whole request if a slot is full, unknown, duplicated, overlaps another chosen slot,
-- the festival is closed, the details look wrong, or consent was not given.
-- Requests are handled one at a time, so two people cannot take the last place together.
drop function if exists public.submit_signup(text, text, text, jsonb);

create or replace function public.submit_signup(
  p_name text, p_email text, p_phone text, p_slots jsonb, p_consent boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_name  text := btrim(coalesce(p_name, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_hdr   text;
  v_ip    text := 'unknown';
  bad     int;
begin
  if p_consent is not true then raise exception 'NO_CONSENT'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'INVALID_NAME'; end if;
  if char_length(v_email) > 200 or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then raise exception 'INVALID_EMAIL'; end if;
  if char_length(v_phone) > 40 or char_length(regexp_replace(v_phone, '\D', '', 'g')) < 8 then raise exception 'INVALID_PHONE'; end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) < 1 or jsonb_array_length(p_slots) > 80 then
    raise exception 'INVALID_SLOTS';
  end if;

  -- one sign-up at a time
  perform pg_advisory_xact_lock(hashtext('seva_board_signup'));

  -- at most 30 sign-ups per hour from one internet address
  v_hdr := current_setting('request.headers', true);
  if v_hdr is not null and v_hdr <> '' then
    begin
      v_ip := coalesce(nullif(btrim(split_part(coalesce(v_hdr::jsonb ->> 'x-forwarded-for', ''), ',', 1)), ''), 'unknown');
    exception when others then
      v_ip := 'unknown';
    end;
  end if;
  if random() < 0.05 then
    delete from public.signup_throttle where at < now() - interval '1 day';
  end if;
  if v_ip <> 'unknown' and
     (select count(*) from public.signup_throttle where ip = v_ip and at > now() - interval '1 hour') >= 30 then
    raise exception 'TOO_MANY';
  end if;

  -- every slot must exist, belong to an open festival, and fall inside the seva's time range
  select count(*) into bad from public._chosen_spans(p_slots)
   where festival_id is null or is_open is not true or idx < 0 or s >= tend;
  if bad > 0 then raise exception 'INVALID_SLOTS'; end if;

  -- no slot twice
  select count(*) - count(distinct (tid, idx)) into bad from public._chosen_spans(p_slots);
  if bad > 0 then raise exception 'INVALID_SLOTS'; end if;

  -- no overlaps between the chosen slots
  select count(*) into bad
    from public._chosen_spans(p_slots) a
    join public._chosen_spans(p_slots) b on (a.tid, a.idx) < (b.tid, b.idx) and a.s < b.e and b.s < a.e;
  if bad > 0 then raise exception 'OVERLAP'; end if;

  -- room left in every slot
  select count(*) into bad
    from public._chosen_spans(p_slots) c
   where (select count(*) from public.signups su where su.task_id = c.tid and su.slot_idx = c.idx) >= c.needed;
  if bad > 0 then raise exception 'SLOT_FULL'; end if;

  insert into public.volunteers (name, email, phone) values (v_name, v_email, v_phone) returning id into v_id;
  insert into public.signups (volunteer_id, task_id, slot_idx) select v_id, tid, idx from public._chosen_spans(p_slots);
  insert into public.signup_throttle (ip) values (v_ip);
  return v_id;
end;
$$;

revoke all on function public.submit_signup(text, text, text, jsonb, boolean) from public;
grant execute on function public.submit_signup(text, text, text, jsonb, boolean) to anon, authenticated;

-- ------------------------------------------------- admin team management

-- Handy for the very first admin (see README). Run it in the SQL Editor, not from the website.
create or replace function public.create_setup_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if char_length(v_norm) < 12 then raise exception 'CODE_TOO_SHORT'; end if;
  insert into public.admin_invites (code_hash, note, expires_at)
  values (encode(sha256(convert_to(v_norm, 'UTF8')), 'hex'), 'First admin', now() + interval '2 days');
  return 'Setup code saved. It works for 2 days, once.';
end;
$$;

revoke all on function public.create_setup_code(text) from public, anon, authenticated;

-- An admin creates a one-time code (valid 7 days) to share with the new admin.
create or replace function public.create_admin_invite(p_note text default '')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  v_code := upper(substr(md5(gen_random_uuid()::text || gen_random_uuid()::text), 1, 20));
  insert into public.admin_invites (code_hash, note, created_by, expires_at)
  values (encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), left(btrim(coalesce(p_note, '')), 100), auth.uid(), now() + interval '7 days');
  return v_code;
end;
$$;

revoke all on function public.create_admin_invite(text) from public, anon;
grant execute on function public.create_admin_invite(text) to authenticated;

-- The new admin signs in with their own account and enters the code.
create or replace function public.claim_admin_invite(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_hash  text := encode(sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex');
  v_inv   public.admin_invites%rowtype;
  v_email text;
begin
  if v_user is null then raise exception 'NOT_SIGNED_IN'; end if;
  if exists (select 1 from public.admins where user_id = v_user) then return true; end if;

  select * into v_inv from public.admin_invites
   where code_hash = v_hash and used_at is null and expires_at > now()
   for update;
  if not found then
    perform pg_sleep(1);
    raise exception 'BAD_CODE';
  end if;

  select email into v_email from auth.users where id = v_user;
  insert into public.admins (user_id, email, added_by) values (v_user, coalesce(v_email, ''), v_inv.created_by)
  on conflict (user_id) do nothing;
  update public.admin_invites set used_at = now(), used_by = v_user where id = v_inv.id;
  return true;
end;
$$;

revoke all on function public.claim_admin_invite(text) from public, anon;
grant execute on function public.claim_admin_invite(text) to authenticated;

-- Invites that have not been used or expired yet (never returns the codes).
create or replace function public.list_admin_invites()
returns table (id uuid, note text, created_by_email text, created_at timestamptz, expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  return query
    select i.id, i.note, a.email, i.created_at, i.expires_at
      from public.admin_invites i
      left join public.admins a on a.user_id = i.created_by
     where i.used_at is null and i.expires_at > now()
     order by i.created_at desc;
end;
$$;

revoke all on function public.list_admin_invites() from public, anon;
grant execute on function public.list_admin_invites() to authenticated;

create or replace function public.revoke_admin_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  delete from public.admin_invites where id = p_id and used_at is null;
end;
$$;

revoke all on function public.revoke_admin_invite(uuid) from public, anon;
grant execute on function public.revoke_admin_invite(uuid) to authenticated;

-- Takes away another admin's access. You cannot remove yourself, so at least one admin always remains.
create or replace function public.revoke_admin(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_user = auth.uid() then raise exception 'CANNOT_REMOVE_SELF'; end if;
  delete from public.admins where user_id = p_user;
end;
$$;

revoke all on function public.revoke_admin(uuid) from public, anon;
grant execute on function public.revoke_admin(uuid) to authenticated;

-- ------------------------------------------------------------ photos
-- A public bucket for festival and seva photos. Anyone can view; only admins can upload or delete.

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists photos_public_read  on storage.objects;
drop policy if exists photos_admin_insert on storage.objects;
drop policy if exists photos_admin_update on storage.objects;
drop policy if exists photos_admin_delete on storage.objects;

create policy photos_public_read  on storage.objects for select to anon, authenticated using (bucket_id = 'photos');
create policy photos_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'photos' and public.is_admin());
create policy photos_admin_update on storage.objects for update to authenticated using (bucket_id = 'photos' and public.is_admin());
create policy photos_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'photos' and public.is_admin());
