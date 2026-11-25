/* Demo storage: pretends to be Supabase, keeping everything in this browser only (localStorage).
   Used by demo.html. Not used on the real website. */
(function () {
"use strict";
var KEY = "seva-demo-v1", SES = "seva-demo-session";
function uid() { return "id-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
function pad(n) { return String(n).padStart(2, "0"); }
function dstr(off) { var d = new Date(); d.setDate(d.getDate() + off); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function nowIso() { return new Date().toISOString(); }

function seed() {
  var adminId = "u-admin", f1 = uid(), f2 = uid(), f3 = uid(), db = { festivals: [], tasks: [], volunteers: [], signups: [], admins: [], invites: [], users: [] };
  db.users.push({ id: adminId, email: "admin@demo.local", password: "demo1234" });
  db.admins.push({ user_id: adminId, email: "admin@demo.local", added_by: null, created_at: nowIso() });
  db.festivals.push(
    { id: f1, name: "Janmashtami", description: "Celebration of Lord Krishna's appearance day, with kirtan, abhisheka, a midnight arati and a festival feast.", start_date: dstr(21), end_date: null, image_url: null, is_open: true },
    { id: f2, name: "Ratha Yatra", description: "Festival of the Chariots of Lord Jagannath, with a procession and kirtan through the city.", start_date: dstr(60), end_date: null, image_url: null, is_open: true },
    { id: f3, name: "Govardhan Puja (last month)", description: "Annakuta offering and prasadam for everyone.", start_date: dstr(-20), end_date: null, image_url: null, is_open: true });
  function T(f, name, desc, need, date, s, e, sl) { var t = { id: uid(), festival_id: f, name: name, description: desc, image_url: null, task_date: date, start_time: s, end_time: e, needed: need, slot_minutes: sl }; db.tasks.push(t); return t; }
  var clean = T(f1, "Temple cleaning", "Clean the common areas and the toilets.", 5, dstr(21), "14:00", "18:00", 60);
  T(f1, "Washing dishes", "Wash and dry pots, plates and serving ware in the kitchen.", 4, dstr(21), "13:00", "17:00", 60);
  T(f1, "Cooking", "Cook under the guidance of the head cook.", 6, dstr(21), "08:00", "14:00", 60);
  T(f1, "Decoration", "Help set up flowers, lights and the altar decoration.", 6, dstr(21), "10:00", "16:00", 60);
  T(f1, "Prasadam distribution", "Serve prasadam to guests.", 8, dstr(21), "17:00", "20:00", 60);
  T(f2, "Procession marshals", "Keep the procession safe and moving.", 6, dstr(60), "12:00", "17:00", 60);
  T(f2, "Sound system", "Set up the sound system and look after it.", 2, dstr(60), "11:00", "17:00", 120);
  var old = T(f3, "Kitchen help", "Cut vegetables and keep the kitchen tidy.", 4, dstr(-20), "08:00", "12:00", 60);
  function V(n, e, p) { var v = { id: uid(), name: n, email: e, phone: p, consent_at: nowIso(), created_at: nowIso() }; db.volunteers.push(v); return v; }
  function S(v, t, i) { db.signups.push({ id: uid(), volunteer_id: v.id, task_id: t.id, slot_idx: i }); }
  var a = V("Radha Devi", "radha@example.com", "+31 6 12345678"), b = V("Arjun Das", "arjun@example.com", "06 87654321"), c = V("Sita Mataji", "sita@example.com", "0031 6 11112222");
  [0, 1, 2, 3].forEach(function (i) { S(a, clean, i); });
  [0, 1].forEach(function (i) { S(b, clean, i); S(c, clean, i); });
  S(c, old, 0); S(c, old, 1);
  return db;
}
function load() { try { var s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) {} var d = seed(); save(d); return d; }
function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
function session() { try { return JSON.parse(localStorage.getItem(SES) || "null"); } catch (e) { return null; } }
function isAdminNow(db) { var s = session(); return !!(s && db.admins.some(function (a) { return a.user_id === s.user.id; })); }
function err(m) { return { data: null, error: { message: m } }; }
function norm(code) { return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }

function orphans(db) {
  var used = {}; db.signups.forEach(function (s) { used[s.volunteer_id] = 1; });
  db.volunteers = db.volunteers.filter(function (v) { return used[v.id]; });
}
function cascade(db) {
  var fids = {}; db.festivals.forEach(function (f) { fids[f.id] = 1; });
  db.tasks = db.tasks.filter(function (t) { return fids[t.festival_id]; });
  var tids = {}; db.tasks.forEach(function (t) { tids[t.id] = 1; });
  db.signups = db.signups.filter(function (s) { return tids[s.task_id]; });
  orphans(db);
}

function Query(table) {
  var q = { table: table, op: "select", filters: [], payload: null, one: false, ret: false };
  var api = {
    select: function () { if (q.op !== "select") q.ret = true; return api; },
    insert: function (p) { q.op = "insert"; q.payload = p; return api; },
    update: function (p) { q.op = "update"; q.payload = p; return api; },
    delete: function () { q.op = "delete"; return api; },
    eq: function (c, v) { q.filters.push(function (r) { return r[c] === v; }); return api; },
    in: function (c, vs) { q.filters.push(function (r) { return vs.indexOf(r[c]) >= 0; }); return api; },
    single: function () { q.one = true; return api; },
    then: function (res, rej) { return Promise.resolve().then(function () { return run(q); }).then(res, rej); }
  };
  return api;
}
function run(q) {
  var db = load(), admin = isAdminNow(db), t = q.table, open = (t === "festivals" || t === "tasks");
  if (q.op === "select") {
    if (!open && !admin) return { data: [], error: null };
    return { data: JSON.parse(JSON.stringify((db[t] || []).filter(function (r) { return q.filters.every(function (f) { return f(r); }); }))), error: null };
  }
  if (!admin || !open) return err("row-level security");
  var list = db[t], out = [];
  if (q.op === "insert") {
    (Array.isArray(q.payload) ? q.payload : [q.payload]).forEach(function (p) {
      var r = Object.assign({ id: uid() }, p);
      if (t === "festivals") { if (!r.name || !r.start_date) return; r = Object.assign({ description: "", end_date: null, image_url: null, is_open: true }, r); }
      if (t === "tasks") { if (!db.festivals.some(function (f) { return f.id === r.festival_id; })) return; r = Object.assign({ description: "", image_url: null }, r); }
      list.push(r); out.push(r);
    });
  } else if (q.op === "update") {
    list.forEach(function (r) { if (q.filters.every(function (f) { return f(r); })) { Object.assign(r, q.payload); out.push(r); } });
  } else if (q.op === "delete") {
    db[t] = list.filter(function (r) { var hit = q.filters.every(function (f) { return f(r); }); if (hit) out.push(r); return !hit; });
    cascade(db);
  }
  save(db);
  var data = q.ret ? JSON.parse(JSON.stringify(out)) : null;
  if (q.one) { data = data && data[0] ? data[0] : null; if (q.ret && !data) return err("no rows"); }
  return { data: data, error: null };
}

function rpc(name, a) {
  a = a || {};
  var db = load(), s = session(), admin = isAdminNow(db);
  if (name === "am_i_admin") return { data: admin, error: null };
  if (name === "slot_counts") {
    var c = {}; db.signups.forEach(function (x) { var k = x.task_id + ":" + x.slot_idx; c[k] = (c[k] || 0) + 1; });
    return { data: Object.keys(c).map(function (k) { var i = k.lastIndexOf(":"); return { task_id: k.slice(0, i), slot_idx: +k.slice(i + 1), taken: c[k] }; }), error: null };
  }
  if (name === "submit_signup") return submit(db, a);
  if (name === "claim_admin_invite") {
    if (!s) return err("NOT_SIGNED_IN");
    var h = norm(a.p_code), inv = db.invites.find(function (i) { return i.code === h && !i.used_at && i.expires_at > nowIso(); });
    if (!inv) return err("BAD_CODE");
    inv.used_at = nowIso(); inv.used_by = s.user.id;
    if (!db.admins.some(function (x) { return x.user_id === s.user.id; })) db.admins.push({ user_id: s.user.id, email: s.user.email, added_by: inv.created_by, created_at: nowIso() });
    save(db); return { data: true, error: null };
  }
  if (!admin) return err("NOT_ADMIN");
  if (name === "create_admin_invite") {
    var code = ""; while (code.length < 20) code += "0123456789ABCDEF"[Math.floor(Math.random() * 16)];
    db.invites.push({ id: uid(), code: code, note: String(a.p_note || "").slice(0, 100), created_at: nowIso(), expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), created_by: s.user.id, used_at: null });
    save(db); return { data: code, error: null };
  }
  if (name === "list_admin_invites") return { data: db.invites.filter(function (i) { return !i.used_at && i.expires_at > nowIso(); }).map(function (i) { return { id: i.id, note: i.note, created_at: i.created_at, expires_at: i.expires_at }; }), error: null };
  if (name === "revoke_admin_invite") { db.invites = db.invites.filter(function (i) { return i.id !== a.p_id; }); save(db); return { data: null, error: null }; }
  if (name === "revoke_admin") {
    if (a.p_user === s.user.id) return err("CANNOT_REMOVE_SELF");
    db.admins = db.admins.filter(function (x) { return x.user_id !== a.p_user; }); save(db); return { data: null, error: null };
  }
  return err("unknown function");
}
function submit(db, a) {
  var name = String(a.p_name || "").trim(), email = String(a.p_email || "").trim(), phone = String(a.p_phone || "").trim(), slots = a.p_slots;
  if (!a.p_consent) return err("NO_CONSENT");
  if (name.length < 2) return err("INVALID_NAME");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return err("INVALID_EMAIL");
  if (phone.replace(/\D/g, "").length < 8) return err("INVALID_PHONE");
  if (!Array.isArray(slots) || !slots.length || slots.length > 60) return err("INVALID_SLOTS");
  var spans = [], seen = {};
  for (var i = 0; i < slots.length; i++) {
    var sl = slots[i], t = db.tasks.find(function (x) { return x.id === sl.task_id; }), f = t && db.festivals.find(function (x) { return x.id === t.festival_id; });
    if (!t || !f || !f.is_open) return err("INVALID_SLOTS");
    var len = t.slot_minutes, st = toM(t.start_time), en = toM(t.end_time), n = Math.ceil((en - st) / len);
    if (!(sl.slot_idx >= 0 && sl.slot_idx < n) || seen[sl.task_id + ":" + sl.slot_idx]) return err("INVALID_SLOTS");
    seen[sl.task_id + ":" + sl.slot_idx] = 1;
    var base = dayNum(t.task_date);
    spans.push({ k: sl.task_id + ":" + sl.slot_idx, t: t, s: base + st + sl.slot_idx * len, e: base + Math.min(st + (sl.slot_idx + 1) * len, en) });
  }
  for (var x = 0; x < spans.length; x++) for (var y = x + 1; y < spans.length; y++) if (spans[x].s < spans[y].e && spans[y].s < spans[x].e) return err("OVERLAP");
  for (var z = 0; z < spans.length; z++) {
    var cnt = db.signups.filter(function (g) { return g.task_id === spans[z].t.id && g.slot_idx === +spans[z].k.split(":").pop(); }).length;
    if (cnt >= spans[z].t.needed) return err("SLOT_FULL");
  }
  var digits = phone.replace(/\D/g, ""), v = db.volunteers.find(function (q) { return q.email.toLowerCase() === email.toLowerCase() && q.phone.replace(/\D/g, "") === digits; });
  if (!v) { v = { id: uid(), name: name, email: email, phone: phone, consent_at: nowIso(), created_at: nowIso() }; db.volunteers.push(v); }
  for (var w = 0; w < spans.length; w++) {
    var idx = +spans[w].k.split(":").pop();
    if (db.signups.some(function (g) { return g.volunteer_id === v.id && g.task_id === spans[w].t.id && g.slot_idx === idx; })) return err("OVERLAP");
  }
  spans.forEach(function (sp) { db.signups.push({ id: uid(), volunteer_id: v.id, task_id: sp.t.id, slot_idx: +sp.k.split(":").pop() }); });
  save(db); return { data: null, error: null };
}
function toM(t) { var p = String(t).split(":"); return +p[0] * 60 + (+p[1] || 0); }
function dayNum(s) { var p = s.split("-").map(Number); return Math.floor(Date.UTC(p[0], p[1] - 1, p[2]) / 60000); }

function auth() {
  function setSes(u) { if (u) localStorage.setItem(SES, JSON.stringify({ user: { id: u.id, email: u.email } })); else localStorage.removeItem(SES); }
  return {
    getSession: function () { return Promise.resolve({ data: { session: session() }, error: null }); },
    signOut: function () { setSes(null); return Promise.resolve({ error: null }); },
    signUp: function (o) {
      var db = load(), email = String(o.email || "").toLowerCase();
      if (db.users.some(function (u) { return u.email === email; })) return Promise.resolve({ data: null, error: { message: "User already registered" } });
      if (String(o.password || "").length < 8) return Promise.resolve({ data: null, error: { message: "Password should be at least 8 characters" } });
      var u = { id: uid(), email: email, password: o.password }; db.users.push(u); save(db); setSes(u);
      return Promise.resolve({ data: { session: session(), user: { id: u.id, email: u.email } }, error: null });
    },
    signInWithPassword: function (o) {
      var db = load(), u = db.users.find(function (x) { return x.email === String(o.email || "").toLowerCase() && x.password === o.password; });
      if (!u) return Promise.resolve({ data: null, error: { message: "Invalid login credentials" } });
      setSes(u); return Promise.resolve({ data: { session: session() }, error: null });
    }
  };
}
var photos = {};
function storage() {
  return { from: function () {
    return {
      upload: function (path, blob) { photos[path] = URL.createObjectURL(blob); return Promise.resolve({ data: { path: path }, error: null }); },
      getPublicUrl: function (path) { return { data: { publicUrl: photos[path] || "" } }; },
      remove: function () { return Promise.resolve({ data: [], error: null }); }
    };
  } };
}

window.supabase = {
  createClient: function () {
    return {
      from: function (t) { return Query(t); },
      rpc: function (n, a) { return Promise.resolve().then(function () { return rpc(n, a); }); },
      auth: auth(), storage: storage()
    };
  }
};

document.addEventListener("DOMContentLoaded", function () {
  var b = document.createElement("div");
  b.style.cssText = "background:#fff3cd;color:#5c4400;padding:.5rem 1rem;font:500 14px system-ui;text-align:center;border-bottom:1px solid #e6d28a";
  b.innerHTML = "Demo mode: data stays in this browser only. Admin sign-in: <b>admin@demo.local</b> / <b>demo1234</b>. <a href='#' id='demoReset'>Reset demo</a>";
  document.body.insertBefore(b, document.body.firstChild);
  document.getElementById("demoReset").onclick = function (e) { e.preventDefault(); localStorage.removeItem(KEY); localStorage.removeItem(SES); location.reload(); };
});
})();
