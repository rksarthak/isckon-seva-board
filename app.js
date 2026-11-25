/* Seva Board. Plain JavaScript, no build step. Talks to Supabase (or the built-in demo storage). */
(function () {
"use strict";

var CFG = window.SEVA_CONFIG || {};
var demo = !!CFG.DEMO;
var configured = !!(window.supabase && (demo || (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY &&
  String(CFG.SUPABASE_URL).indexOf("YOUR-") < 0 && String(CFG.SUPABASE_ANON_KEY).indexOf("YOUR-") < 0)));
var sb = configured ? window.supabase.createClient(CFG.SUPABASE_URL || "demo", CFG.SUPABASE_ANON_KEY || "demo") : null;

/* ------------------------------------------------------------ presets */

// [name, description, people needed, start, end, slot minutes]
var COMMON = [
  ["Temple cleaning", "Clean the common areas and the toilets.", 5, "14:00", "18:00", 60],
  ["Washing dishes", "Wash and dry pots, plates and serving ware in the kitchen.", 4, "13:00", "17:00", 60],
  ["Cooking", "Cook under the guidance of the head cook.", 6, "08:00", "14:00", 60],
  ["Kitchen help", "Cut vegetables, fetch ingredients and keep the kitchen tidy.", 6, "08:00", "14:00", 60],
  ["Transportation", "Pick up supplies or guests and drive them to the temple. A car is needed.", 3, "10:00", "16:00", 120],
  ["Decoration", "Help set up flowers, lights and the altar decoration.", 6, "10:00", "16:00", 60],
  ["Flower garlands", "Make garlands for the deities and the entrance.", 4, "09:00", "12:00", 60],
  ["Hall setup", "Lay out carpets, chairs and tables before the programme.", 6, "14:00", "17:00", 60],
  ["Prasadam distribution", "Serve prasadam to guests and keep the line moving.", 8, "17:00", "20:00", 60],
  ["Parking and entrance", "Guide cars, bikes and visitors at the entrance.", 3, "15:00", "21:00", 60],
  ["Shoe stand", "Look after the shoe stand and keep it orderly.", 2, "15:00", "21:00", 60],
  ["Sound system", "Set up the sound system and look after it during the programme.", 2, "16:00", "21:00", 60],
  ["Registration desk", "Welcome guests and answer questions at the desk.", 2, "15:00", "20:00", 60],
  ["Book table", "Look after the book table.", 2, "16:00", "21:00", 60],
  ["Children's activities", "Run games and crafts for the children.", 4, "15:00", "19:00", 60],
  ["Procession marshals", "Keep the procession safe and moving: guide traffic and walk alongside the group.", 6, "12:00", "17:00", 60],
  ["Clean-up after the programme", "Clear the hall, wash up and take out the rubbish.", 8, "21:00", "23:00", 60]
];
var FEAST = ["Temple cleaning", "Washing dishes", "Cooking", "Kitchen help", "Decoration", "Flower garlands", "Hall setup",
  "Prasadam distribution", "Parking and entrance", "Shoe stand", "Registration desk", "Clean-up after the programme"];

// Festival dates change every year, so only the name, description and usual seva are filled in.
var EVENTS = [
  { id: "janmashtami", name: "Janmashtami", description: "Celebration of Lord Krishna's appearance day, with kirtan, abhisheka, a midnight arati and a festival feast.",
    seva: FEAST.concat(["Children's activities", "Book table"]) },
  { id: "gaura-purnima", name: "Gaura Purnima", description: "Celebration of the appearance day of Sri Chaitanya Mahaprabhu, with kirtan, abhisheka and a festival feast.",
    seva: FEAST.concat(["Book table"]) },
  { id: "radhashtami", name: "Radhashtami", description: "Celebration of the appearance day of Srimati Radharani, with kirtan, abhisheka and a festival feast.", seva: FEAST },
  { id: "ratha-yatra", name: "Ratha Yatra", description: "Festival of the Chariots of Lord Jagannath, with a procession and kirtan through the city.",
    seva: ["Transportation", "Procession marshals", "Sound system", "Decoration", "Flower garlands", "Prasadam distribution", "Registration desk", "Parking and entrance", "Clean-up after the programme"] },
  { id: "govardhan", name: "Govardhan Puja", description: "Annakuta: a mountain of offered foods in honour of Govardhan Hill, followed by prasadam for everyone.",
    seva: FEAST },
  { id: "diwali", name: "Diwali (Deepavali)", description: "Festival of lights, with lamp offerings, kirtan and a festival feast.",
    seva: FEAST.concat(["Children's activities"]) },
  { id: "narasimha", name: "Narasimha Chaturdashi", description: "Celebration of the appearance day of Lord Narasimha, with kirtan, abhisheka and a feast.", seva: FEAST },
  { id: "sunday-feast", name: "Sunday Love Feast", description: "The weekly Sunday programme with kirtan, a talk and a vegetarian feast.",
    seva: ["Temple cleaning", "Washing dishes", "Cooking", "Kitchen help", "Hall setup", "Prasadam distribution", "Shoe stand", "Clean-up after the programme"] }
];
var COMMON_BY_NAME = {};
COMMON.forEach(function (c) { COMMON_BY_NAME[c[0]] = c; });

/* ------------------------------------------------------------ helpers */

var S = {
  festivals: [], tasks: [], counts: new Map(), volunteers: new Map(), signups: [], admins: [], invites: [],
  user: null, isAdmin: false, loaded: false, err: "", mode: "public", tab: "overview", af: null,
  sel: new Set(), open: new Set(), cleanSel: new Set(), exportScope: "festival", submitting: false
};

function $(s) { return document.querySelector(s); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function pad(n) { return String(n).padStart(2, "0"); }
function fmtT(m) { return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }
function toMin(t) { var p = String(t || "0:0").split(":"); return (+p[0]) * 60 + (+p[1] || 0); }
function hhmm(t) { return String(t || "").slice(0, 5); }
function dparts(s) { var p = String(s || "").split("-").map(Number); return p.length === 3 && p[0] ? p : null; }
function fmtDate(s) { var p = dparts(s); return p ? new Date(p[0], p[1] - 1, p[2]).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : ""; }
function dayNum(s) { var p = dparts(s); return p ? Math.floor(Date.UTC(p[0], p[1] - 1, p[2]) / 60000) : 0; }
function fmtH(m) { return String(Math.round(m / 10) / 6); }
function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function keyTask(k) { return k.slice(0, k.lastIndexOf(":")); }
function keyIdx(k) { return +k.slice(k.lastIndexOf(":") + 1); }
function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
function lastDay(f) { return f.end_date || f.start_date; }
function isFinished(f) { return lastDay(f) < today(); }
function festOf(t) { return S.festivals.find(function (f) { return f.id === t.festival_id; }); }

function normFest(r) {
  return { id: r.id, name: r.name, description: r.description || "", start_date: String(r.start_date).slice(0, 10),
    end_date: r.end_date ? String(r.end_date).slice(0, 10) : "", image_url: r.image_url || "", is_open: r.is_open !== false };
}
function normTask(r) {
  return { id: r.id, festival_id: r.festival_id, name: r.name, description: r.description || "", image_url: r.image_url || "",
    task_date: String(r.task_date).slice(0, 10), start_time: hhmm(r.start_time), end_time: hhmm(r.end_time),
    needed: +r.needed, slot_minutes: +r.slot_minutes };
}
function taskSlots(t) {
  var s = toMin(t.start_time), e = toMin(t.end_time), len = +t.slot_minutes || 60, out = [], i = 0;
  for (var a = s; a < e; a += len) out.push({ idx: i++, s: a, e: Math.min(a + len, e) });
  return out;
}
function tasksOf(fid) {
  return S.tasks.filter(function (t) { return t.festival_id === fid; }).sort(function (a, b) {
    return (a.task_date + a.start_time).localeCompare(b.task_date + b.start_time) || a.name.localeCompare(b.name);
  });
}
function sortedFests() {
  return S.festivals.slice().sort(function (a, b) { return a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name); });
}
function buildIndex() {
  var idx = new Map();
  S.tasks.forEach(function (t) {
    var base = dayNum(t.task_date);
    taskSlots(t).forEach(function (sl) { idx.set(t.id + ":" + sl.idx, { task: t, slot: sl, as: base + sl.s, ae: base + sl.e }); });
  });
  return idx;
}
function taken(k) { return S.counts.get(k) || 0; }
function rangesOf(task, idxs) {
  var sl = taskSlots(task), sorted = idxs.slice().sort(function (a, b) { return a - b; }), out = [], cur = null;
  sorted.forEach(function (i) {
    var s = sl[i];
    if (!s) return;
    if (cur && cur.last === i - 1) { cur.e = s.e; cur.last = i; } else { cur = { s: s.s, e: s.e, last: i }; out.push(cur); }
  });
  return out.map(function (r) { return fmtT(r.s) + "–" + fmtT(r.e); });
}
function taskTotals(t) {
  var cap = 0, filled = 0, over = false, need = +t.needed || 1;
  taskSlots(t).forEach(function (sl) {
    var d = sl.e - sl.s, n = taken(t.id + ":" + sl.idx);
    cap += need * d; filled += Math.min(n, need) * d; if (n > need) over = true;
  });
  return { cap: cap, filled: filled, over: over };
}
// WhatsApp wants the full international number without + or spaces.
function waDigits(phone) {
  var raw = String(phone || "").trim().replace(/\(0\)/g, ""), cc = String(CFG.DEFAULT_COUNTRY_CODE || "").replace(/\D/g, "");
  var d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (raw.charAt(0) === "+") return d;
  if (d.indexOf("00") === 0) return d.slice(2);
  if (d.charAt(0) === "0" && cc) return cc + d.slice(1);
  return d;
}
function waLink(phone) { var d = waDigits(phone); return d.length >= 8 ? "https://wa.me/" + d : ""; }
function csvCell(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }
function vcardText(v) { return String(v || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,"); }

function toast(msg) {
  var el = $("#toast"); el.textContent = msg; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 4200);
}
var raf = 0;
function rerender() { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; render(); }); }
function errText(e, map) {
  var m = String((e && e.message) || ""), code = Object.keys(map || {}).find(function (c) { return m.indexOf(c) >= 0; });
  return code ? map[code] : "";
}

/* ---------------------------------------------------------- data */

async function refreshSession() {
  S.user = null; S.isAdmin = false;
  if (!sb) return;
  try {
    var s = await sb.auth.getSession();
    S.user = s.data && s.data.session ? s.data.session.user : null;
    if (S.user) { var r = await sb.rpc("am_i_admin"); S.isAdmin = !r.error && r.data === true; }
  } catch (e) { /* stays signed out */ }
  if (!S.isAdmin) S.mode = "public";
}

async function load(recheck) {
  if (!sb) return;
  try {
    if (recheck && S.user) await refreshSession();
    var q = [sb.from("festivals").select("*"), sb.from("tasks").select("*")];
    if (S.isAdmin) q.push(sb.from("volunteers").select("*"), sb.from("signups").select("*"), sb.from("admins").select("*"), sb.rpc("list_admin_invites"));
    else q.push(sb.rpc("slot_counts"));
    var r = await Promise.all(q);
    r.forEach(function (x) { if (x.error) throw x.error; });
    S.festivals = (r[0].data || []).map(normFest);
    S.tasks = (r[1].data || []).map(normTask);
    var counts = new Map();
    if (S.isAdmin) {
      S.volunteers = new Map((r[2].data || []).map(function (v) { return [v.id, v]; }));
      S.signups = r[3].data || [];
      S.admins = r[4].data || [];
      S.invites = r[5].data || [];
      S.signups.forEach(function (s) { var k = s.task_id + ":" + s.slot_idx; counts.set(k, (counts.get(k) || 0) + 1); });
    } else {
      (r[2].data || []).forEach(function (c) { counts.set(c.task_id + ":" + c.slot_idx, +c.taken); });
      S.volunteers = new Map(); S.signups = []; S.admins = []; S.invites = [];
    }
    S.counts = counts; S.loaded = true; S.err = "";
  } catch (e) {
    S.err = "The festival list could not be loaded. Please check your internet connection and reload the page.";
  }
  rerender();
}

/* ------------------------------------------------- volunteer view */

function pubView() {
  if (!sb) {
    return '<div class="note warn"><b>' + (window.supabase ? "The website is not connected to its database yet." : "The page could not load its database library.") + '</b>' +
      '<p style="margin-top:.3rem">' + (window.supabase ? 'Open <span class="mono">config.js</span> and fill in the Supabase details (README, step 3).' : "Please check your internet connection and reload the page.") + '</p></div>';
  }
  if (S.err) return '<div class="note warn">' + esc(S.err) + "</div>";
  if (!S.loaded) return '<div class="empty">Loading festivals…</div>';
  var fests = sortedFests().filter(function (f) { return !isFinished(f); });
  if (!fests.length) return '<div class="empty">No festivals are open for seva right now. Please check back soon.</div>';
  var idx = buildIndex(), h = "";
  Array.from(S.sel).forEach(function (k) { if (!idx.has(k)) S.sel.delete(k); });
  fests.forEach(function (f) {
    var p = dparts(f.start_date), tl = tasksOf(f.id);
    var mon = p ? new Date(p[0], p[1] - 1, p[2]).toLocaleDateString("en-GB", { month: "short" }) : "";
    var range = fmtDate(f.start_date) + (f.end_date && f.end_date !== f.start_date ? " to " + fmtDate(f.end_date) : "");
    h += '<section class="fest">' + (f.image_url ? '<img class="banner" src="' + esc(f.image_url) + '" alt="' + esc(f.name) + '" loading="lazy">' : "") +
      '<div class="fest-head">' + (p ? '<div class="dtile"><b>' + p[2] + "</b><span>" + esc(mon) + "</span></div>" : "") +
      '<div><p class="eyebrow">' + esc(range) + "</p><h2>" + esc(f.name) + "</h2>" +
      (f.description ? '<p class="desc">' + esc(f.description) + "</p>" : "") +
      (f.is_open ? "" : '<p style="margin-top:.5rem"><span class="pill warn">Sign-ups are closed</span></p>') + "</div></div>";
    if (!tl.length) h += '<div class="empty">Seva for this festival will be listed soon.</div>';
    h += foldTools("p", tl.map(function (t) { return t.id; }));
    tl.forEach(function (t) { h += taskCard(t, f, idx); });
    h += "</section>";
  });
  return h;
}
function conflictWith(k, idx) {
  var a = idx.get(k), hit = null;
  S.sel.forEach(function (j) { if (hit || j === k) return; var b = idx.get(j); if (b && a.as < b.ae && b.as < a.ae) hit = b.task.name; });
  return hit;
}
function foldCard(key, cls, title, when, pills, body) {
  var open = S.open.has(key);
  return '<article class="task fold-card' + (cls ? " " + cls : "") + (open ? " open" : "") + '"><button type="button" class="fold" data-act="fold" data-key="' + esc(key) + '" aria-expanded="' + open + '">' +
    '<span class="fold-main"><b class="fold-title">' + esc(title) + '</b><span class="when mono">' + esc(when) + '</span></span>' +
    '<span class="fold-side">' + pills + '</span><span class="chev" aria-hidden="true"></span></button>' +
    (open ? '<div class="fold-body">' + body + "</div>" : "") + "</article>";
}
function foldTools(prefix, ids) {
  if (ids.length < 2) return "";
  return '<div class="row fold-tools"><button type="button" class="btn small" data-act="foldAll" data-prefix="' + prefix + '" data-open="1" data-ids="' + esc(ids.join(",")) + '">Expand all</button>' +
    '<button type="button" class="btn small" data-act="foldAll" data-prefix="' + prefix + '" data-open="0" data-ids="' + esc(ids.join(",")) + '">Collapse all</button></div>';
}
function taskCard(t, f, idx) {
  var need = +t.needed || 1, sl = taskSlots(t), tot = taskTotals(t), allFull = true;
  var chips = sl.map(function (s) {
    var k = t.id + ":" + s.idx, n = taken(k), selected = S.sel.has(k), st, label, dis = false, title = "";
    if (n < need) allFull = false;
    if (selected) { st = "sel"; label = "Selected"; }
    else if (!f.is_open) { st = "closed"; label = "Closed"; dis = true; }
    else if (n >= need) { st = "full"; label = "Full"; dis = true; }
    else {
      var c = conflictWith(k, idx);
      if (c) { st = "block"; label = "Overlaps"; dis = true; title = "Overlaps with your choice: " + c; }
      else { st = "open"; label = (need - n) + " left"; }
    }
    return '<button type="button" class="chip st-' + st + '" data-act="toggle" data-key="' + esc(k) + '" aria-pressed="' + selected + '"' + (dis ? " disabled" : "") + (title ? ' title="' + esc(title) + '"' : "") + ">" +
      '<span class="ct mono">' + fmtT(s.s) + "–" + fmtT(s.e) + '</span><span class="cs">' + label + "</span></button>";
  }).join("");
  var pct = tot.cap ? Math.round(100 * tot.filled / tot.cap) : 0, spots = 0, mine = 0;
  sl.forEach(function (x) { spots += Math.max(need - taken(t.id + ":" + x.idx), 0); if (S.sel.has(t.id + ":" + x.idx)) mine++; });
  var pill = (mine ? '<span class="pill ok">' + mine + " selected</span> " : "") +
    (allFull ? '<span class="pill">Fully booked</span>' : '<span class="pill acc">' + plural(spots, "spot", "spots") + " left</span>");
  var body = '<div class="task-top">' + (t.image_url ? '<img class="thumb" src="' + esc(t.image_url) + '" alt="" loading="lazy">' : "") +
    '<div class="task-main">' + (t.description ? '<p class="tdesc" style="margin-top:0">' + esc(t.description) + "</p>" : "") + "</div></div>" +
    '<div class="meter"><i style="width:' + pct + '%"></i></div>' +
    '<p class="meta">' + fmtH(tot.filled) + " of " + fmtH(tot.cap) + " volunteer-hours filled · " + need + " " + (need === 1 ? "person" : "people") + " needed per slot · " + plural(spots, "spot", "spots") + " left in total</p>" +
    (allFull ? '<p class="meta" style="margin-top:.6rem">Every slot is taken. Please pick another seva.</p>' : '<div class="slots">' + chips + "</div>");
  return foldCard("p:" + t.id, allFull ? "is-full" : "", t.name, fmtDate(t.task_date) + " · " + t.start_time + "–" + t.end_time, pill, body);
}
function renderBar() {
  var bar = $("#bar"), n = S.sel.size;
  if (S.mode !== "public" || !S.loaded || n === 0) { bar.hidden = true; document.body.classList.remove("has-bar"); return; }
  var idx = buildIndex(), mins = 0;
  S.sel.forEach(function (k) { var x = idx.get(k); if (x) mins += x.slot.e - x.slot.s; });
  bar.innerHTML = '<div class="in"><div><b>' + plural(n, "slot", "slots") + " · " + fmtH(mins) + ' hours</b><p class="meta" style="margin:0">Pick as many slots as you like.</p></div>' +
    '<div class="row"><button type="button" class="btn" data-act="clearSel">Clear</button><button type="button" class="btn primary" data-act="signup">Review and sign up</button></div></div>';
  bar.hidden = false; document.body.classList.add("has-bar");
}

/* ----------------------------------------------------- admin view */

function curFest() {
  var fs = sortedFests();
  if (!fs.length) return null;
  if (S.afWant) { var w = fs.find(function (x) { return x.id === S.afWant; }); if (w) { S.af = w.id; S.afWant = null; } }
  var f = fs.find(function (x) { return x.id === S.af; });
  if (!f) { f = fs.find(function (x) { return !isFinished(x); }) || fs[fs.length - 1]; if (!S.afWant) S.af = f.id; }
  return f;
}
function adminView() {
  if (!S.isAdmin) return '<div class="note warn">Please sign in as an admin first.</div>';
  if (S.err) return '<div class="note warn">' + esc(S.err) + "</div>";
  if (!S.loaded) return '<div class="empty">Loading…</div>';
  var tabs = [["overview", "Overview"], ["plan", "Festivals and seva"], ["people", "Volunteers and export"], ["cleanup", "Finished events"], ["team", "Admins"]];
  var h = '<nav class="tabs" aria-label="Admin sections">' + tabs.map(function (x) {
    return '<button type="button" data-act="tab" data-tab="' + x[0] + '" aria-pressed="' + (S.tab === x[0]) + '">' + x[1] + "</button>";
  }).join("") + "</nav>";
  if (S.tab === "team") return h + teamTab();
  if (S.tab === "cleanup") return h + cleanupTab();
  var f = curFest();
  h += '<div class="fpick">' + sortedFests().map(function (x) {
    return '<button type="button" data-act="pickFest" data-id="' + esc(x.id) + '" aria-pressed="' + (f && f.id === x.id) + '">' + esc(x.name) + (isFinished(x) ? " (finished)" : "") + "</button>";
  }).join("") + '<button type="button" class="btn small" data-act="newFest">+ New festival</button></div>';
  if (!f) {
    return h + '<div class="empty"><p><b>Start with your first festival.</b></p><p style="margin-top:.3rem">Pick a ready-made event such as Janmashtami or Ratha Yatra, or enter your own. The usual seva list can be added automatically.</p>' +
      '<p style="margin-top:.8rem"><button type="button" class="btn primary" data-act="newFest">Create a festival</button></p></div>';
  }
  if (S.tab === "plan") return h + planTab(f);
  if (S.tab === "people") return h + peopleTab(f);
  return h + overviewTab(f);
}
function festPeopleCount(f) {
  var ids = new Set(), tids = new Set(tasksOf(f.id).map(function (t) { return t.id; }));
  S.signups.forEach(function (s) { if (tids.has(s.task_id)) ids.add(s.volunteer_id); });
  return ids.size;
}
function overviewTab(f) {
  var tl = tasksOf(f.id), cap = 0, filled = 0, full = 0;
  tl.forEach(function (t) { var x = taskTotals(t); cap += x.cap; filled += x.filled; if (x.cap && x.filled >= x.cap) full++; });
  var pct = cap ? Math.round(100 * filled / cap) : 0;
  var h = '<div class="stats"><div class="stat"><b>' + pct + '%</b><span>of volunteer-hours filled</span></div>' +
    '<div class="stat"><b>' + festPeopleCount(f) + '</b><span>volunteers signed up</span></div>' +
    '<div class="stat"><b>' + full + " / " + tl.length + '</b><span>seva fully staffed</span></div>' +
    '<div class="stat"><b>' + fmtH(cap - filled) + '</b><span>hours still needed</span></div></div>';
  if (!tl.length) return h + '<div class="empty">No seva listed for this festival yet. Add some under "Festivals and seva".</div>';
  h += foldTools("a", tl.map(function (t) { return t.id; }));
  tl.forEach(function (t) {
    var tot = taskTotals(t), need = +t.needed || 1, p = tot.cap ? Math.round(100 * tot.filled / tot.cap) : 0;
    var pill = tot.over ? '<span class="pill warn">Overbooked</span>' : (tot.cap && tot.filled >= tot.cap ? '<span class="pill ok">Fully staffed</span>' :
      (tot.filled === 0 ? '<span class="pill warn">No one yet</span>' : '<span class="pill acc">' + fmtH(tot.cap - tot.filled) + " hours open</span>"));
    var cells = taskSlots(t).map(function (s) {
      var n = taken(t.id + ":" + s.idx), c = n === 0 ? "" : (n > need ? "over" : (n === need ? "full" : "part"));
      return '<div class="cell ' + c + '"><span class="ct mono">' + fmtT(s.s) + "–" + fmtT(s.e) + '</span><b class="mono">' + n + " / " + need + "</b></div>";
    }).join("");
    var nv = volunteersOf(t).length, side = pill + ' <span class="pill">' + plural(nv, "volunteer", "volunteers") + "</span>";
    h += foldCard("a:" + t.id, "", t.name, fmtDate(t.task_date) + " · " + t.start_time + "–" + t.end_time, side,
      (t.description ? '<p class="tdesc" style="margin-top:0">' + esc(t.description) + "</p>" : "") +
      '<div class="meter' + (tot.over ? " over" : "") + '"><i style="width:' + p + '%"></i></div><p class="meta">' + fmtH(tot.filled) + " of " + fmtH(tot.cap) + " volunteer-hours filled · " + need + " per slot</p>" +
      '<div class="grid-scroll"><div class="cells">' + cells + "</div></div>");
  });
  return h;
}
function planTab(f) {
  var tl = tasksOf(f.id), range = fmtDate(f.start_date) + (f.end_date && f.end_date !== f.start_date ? " to " + fmtDate(f.end_date) : "");
  var h = '<article class="task"><div class="task-top">' + (f.image_url ? '<img class="thumb" src="' + esc(f.image_url) + '" alt="">' : "") +
    '<div class="task-main"><div class="task-head"><div><p class="eyebrow">Festival</p><h3>' + esc(f.name) + '</h3><p class="when mono">' + esc(range) + "</p></div>" +
    '<div class="row"><span class="pill ' + (f.is_open ? "ok" : "warn") + '">' + (f.is_open ? "Sign-ups open" : "Sign-ups closed") + "</span>" +
    '<button type="button" class="btn small" data-act="editFest" data-id="' + esc(f.id) + '">Edit</button>' +
    '<button type="button" class="btn small danger" data-act="delFest" data-id="' + esc(f.id) + '">Delete</button></div></div>' +
    (f.description ? '<p class="tdesc">' + esc(f.description) + "</p>" : "") + "</div></div></article>";
  h += '<h3 style="margin:1.4rem 0 .6rem">Add a service</h3><p class="meta" style="margin-bottom:.6rem">Pick a common one to start from, then adjust the day, times and number of people.</p><div class="row" style="margin-bottom:1.2rem">' +
    COMMON.map(function (c, i) { return '<button type="button" class="btn small" data-act="addCommon" data-i="' + i + '">' + esc(c[0]) + "</button>"; }).join("") +
    '<button type="button" class="btn small primary" data-act="addCustom">+ Custom service</button></div>';
  h += '<h3 style="margin:1.4rem 0 .6rem">Services in this festival</h3>';
  if (!tl.length) return h + '<div class="empty">Nothing listed yet.</div>';
  tl.forEach(function (t) {
    h += '<article class="task"><div class="task-top">' + (t.image_url ? '<img class="thumb" src="' + esc(t.image_url) + '" alt="">' : "") +
      '<div class="task-main"><div class="task-head"><div><h3>' + esc(t.name) + '</h3><p class="when mono">' + esc(fmtDate(t.task_date)) + " · " + esc(t.start_time) + "–" + esc(t.end_time) + " · " + t.needed + " per " + t.slot_minutes + " min</p></div>" +
      '<div class="row"><button type="button" class="btn small" data-act="editTask" data-id="' + esc(t.id) + '">Edit</button><button type="button" class="btn small danger" data-act="delTask" data-id="' + esc(t.id) + '">Delete</button></div></div>' +
      (t.description ? '<p class="tdesc">' + esc(t.description) + "</p>" : "") + "</div></div></article>";
  });
  return h;
}

function volunteersOf(t) {
  var by = new Map(), n = taskSlots(t).length;
  S.signups.forEach(function (s) {
    if (s.task_id !== t.id || s.slot_idx >= n) return;
    if (!by.has(s.volunteer_id)) by.set(s.volunteer_id, []);
    by.get(s.volunteer_id).push(t.id + ":" + s.slot_idx);
  });
  var out = [];
  by.forEach(function (keys, vid) { out.push({ vid: vid, keys: keys, c: S.volunteers.get(vid) || null }); });
  return out.sort(function (a, b) { return String(a.c && a.c.name).localeCompare(String(b.c && b.c.name)); });
}
function scopedRows() {
  var f = curFest(), rows = [];
  S.festivals.filter(function (x) { return S.exportScope === "all" || (f && x.id === f.id); }).forEach(function (fe) {
    tasksOf(fe.id).forEach(function (t) { volunteersOf(t).forEach(function (v) { if (v.c) rows.push({ f: fe, t: t, v: v }); }); });
  });
  return rows;
}
// One entry per person (same WhatsApp number = same person), with the seva they signed up for.
function uniqueContacts(rows) {
  var map = new Map();
  rows.forEach(function (r) {
    var d = waDigits(r.v.c.phone) || r.v.c.email, e = map.get(d);
    if (!e) { e = { name: r.v.c.name, phone: r.v.c.phone, digits: waDigits(r.v.c.phone), email: r.v.c.email, seva: [], festivals: [] }; map.set(d, e); }
    var label = r.t.name + " (" + rangesOf(r.t, r.v.keys.map(keyIdx)).join(", ") + ")";
    if (e.seva.indexOf(label) < 0) e.seva.push(label);
    if (e.festivals.indexOf(r.f.name) < 0) e.festivals.push(r.f.name);
  });
  return Array.from(map.values()).sort(function (a, b) { return a.name.localeCompare(b.name); });
}
function peopleTab(f) {
  var tl = tasksOf(f.id), rows = scopedRows(), people = uniqueContacts(rows);
  var h = '<div class="panel"><h3>Export for WhatsApp groups</h3><p class="meta" style="margin:0 0 .7rem">' + plural(people.length, "person", "people") + " in " + (S.exportScope === "all" ? "all festivals" : esc(f.name)) + ".</p>" +
    '<div class="row" style="margin-bottom:.7rem"><label for="ex-scope" class="meta" style="margin:0">Include</label><select id="ex-scope" class="sel-inline" data-act="scope"><option value="festival"' + (S.exportScope === "festival" ? " selected" : "") + ">This festival only</option><option value=\"all\"" + (S.exportScope === "all" ? " selected" : "") + ">All festivals</option></select></div>" +
    '<div class="tools" style="margin:0"><button type="button" class="btn primary" data-act="csvContacts">Download names + WhatsApp numbers (CSV)</button>' +
    '<button type="button" class="btn" data-act="vcf">Download contacts (.vcf)</button>' +
    '<button type="button" class="btn" data-act="csvFull">Download full list per seva (CSV)</button>' +
    '<button type="button" class="btn" data-act="copyNumbers">Copy names + numbers</button><button type="button" class="btn" data-act="copyMails">Copy emails</button></div>' +
    '<p class="meta" style="margin-top:.7rem">Tip: open the .vcf file on your phone to add everyone to your contacts, then create the WhatsApp group from there.</p></div>';
  if (!tl.length) return h + '<div class="empty">No seva listed for this festival yet.</div>';
  tl.forEach(function (t) {
    var vs = volunteersOf(t);
    h += '<article class="task"><div class="task-head"><div><h3>' + esc(t.name) + '</h3><p class="when mono">' + esc(fmtDate(t.task_date)) + " · " + esc(t.start_time) + "–" + esc(t.end_time) + '</p></div><div class="row"><span class="pill">' + plural(vs.length, "volunteer", "volunteers") + "</span>" +
      (vs.length ? '<button type="button" class="btn small" data-act="copySeva" data-id="' + esc(t.id) + '">Copy names + numbers</button>' : "") + "</div></div>";
    if (!vs.length) h += '<p class="meta" style="margin-top:.6rem">No one has signed up yet.</p>';
    vs.forEach(function (v) {
      var c = v.c, wa = c ? waLink(c.phone) : "";
      h += '<div class="vol"><div class="who"><b>' + esc(c ? c.name : "Details missing") + '</b> <span class="mono" style="font-size:.85rem;color:var(--muted)">' + esc(rangesOf(t, v.keys.map(keyIdx)).join(", ")) + "</span>" +
        (c ? '<p class="contact"><span class="mono">' + esc(c.phone) + "</span> · <span>" + esc(c.email) + "</span></p>" : "") + "</div>" +
        '<div class="row">' + (wa ? '<a class="btn small" href="' + esc(wa) + '" target="_blank" rel="noopener">WhatsApp</a>' : "") +
        '<button type="button" class="btn small danger" data-act="removeVol" data-vid="' + esc(v.vid) + '" data-id="' + esc(t.id) + '">Remove</button></div></div>';
    });
    h += "</article>";
  });
  return h;
}

function cleanupLists() {
  var fin = sortedFests().filter(isFinished);
  var tasks = S.tasks.filter(function (t) { var f = festOf(t); return f && !isFinished(f) && t.task_date < today(); })
    .sort(function (a, b) { return (a.task_date + a.start_time).localeCompare(b.task_date + b.start_time); });
  return { fests: fin, tasks: tasks };
}
function volunteersIn(fids, tids) {
  var tset = new Set(S.tasks.filter(function (t) { return fids.has(t.festival_id) || tids.has(t.id); }).map(function (t) { return t.id; }));
  var all = new Set(); S.signups.forEach(function (s) { if (tset.has(s.task_id)) all.add(s.volunteer_id); });
  return all.size;
}
function cleanupTab() {
  var L = cleanupLists(), h = "";
  h += '<div class="panel"><h3>Finished events</h3><p class="meta" style="margin:0">Festivals whose last day has passed, and past seva inside festivals that are still running. ' +
    'Deleting them also deletes the sign-ups and the contact details of volunteers who have no other sign-ups left. Download the list first if you need to keep it.</p>' +
    '<div class="tools" style="margin:.8rem 0 0"><button type="button" class="btn" data-act="csvAllBackup">Download backup of all volunteers (CSV)</button></div></div>';
  if (!L.fests.length && !L.tasks.length) return h + '<div class="empty">Nothing has finished yet. Past festivals and services will appear here.</div>';
  if (L.fests.length) {
    h += '<div class="panel"><h3>Finished festivals</h3>' + L.fests.map(function (f) {
      var n = volunteersIn(new Set([f.id]), new Set());
      return '<div class="check-row"><input type="checkbox" id="cf-' + esc(f.id) + '" data-act="cleanSel" data-key="f:' + esc(f.id) + '"' + (S.cleanSel.has("f:" + f.id) ? " checked" : "") + '><label for="cf-' + esc(f.id) + '"><b>' + esc(f.name) + '</b> <span class="meta">ended ' + esc(fmtDate(lastDay(f))) + " · " + plural(tasksOf(f.id).length, "service", "services") + " · " + plural(n, "volunteer", "volunteers") + "</span></label></div>";
    }).join("") + "</div>";
  }
  if (L.tasks.length) {
    h += '<div class="panel"><h3>Finished services in running festivals</h3>' + L.tasks.map(function (t) {
      var n = volunteersIn(new Set(), new Set([t.id])), f = festOf(t);
      return '<div class="check-row"><input type="checkbox" id="ct-' + esc(t.id) + '" data-act="cleanSel" data-key="t:' + esc(t.id) + '"' + (S.cleanSel.has("t:" + t.id) ? " checked" : "") + '><label for="ct-' + esc(t.id) + '"><b>' + esc(t.name) + '</b> <span class="meta">' + esc(f.name) + " · " + esc(fmtDate(t.task_date)) + " · " + plural(n, "volunteer", "volunteers") + "</span></label></div>";
    }).join("") + "</div>";
  }
  var n = S.cleanSel.size;
  h += '<div class="row"><button type="button" class="btn" data-act="cleanAll">Select all finished</button><button type="button" class="btn" data-act="cleanNone">Select none</button>' +
    '<button type="button" class="btn danger" data-act="cleanDelete"' + (n ? "" : " disabled") + ">Delete selected (" + n + ")</button></div>";
  return h;
}

function teamTab() {
  var me = S.user ? S.user.id : "", byId = {};
  S.admins.forEach(function (a) { byId[a.user_id] = a.email; });
  var h = '<div class="panel"><h3>Admins</h3><p class="meta" style="margin:0 0 .5rem">Everyone here can see all volunteers and change everything. Removing an admin ends their access immediately.</p>';
  S.admins.slice().sort(function (a, b) { return String(a.created_at).localeCompare(String(b.created_at)); }).forEach(function (a) {
    var by = a.added_by && byId[a.added_by] ? "added by " + byId[a.added_by] : (a.added_by ? "" : "first admin");
    h += '<div class="list-row"><div class="who"><b>' + esc(a.email) + "</b>" + (a.user_id === me ? '<span class="you">you</span>' : "") + '<p class="meta" style="margin:0">' + esc(by) + (a.created_at ? (by ? " · " : "") + esc(String(a.created_at).slice(0, 10)) : "") + "</p></div>" +
      (a.user_id === me ? "" : '<button type="button" class="btn small danger" data-act="revokeAdmin" data-id="' + esc(a.user_id) + '" data-email="' + esc(a.email) + '">Remove access</button>') + "</div>";
  });
  h += "</div>";
  h += '<div class="panel"><h3>Give someone admin access</h3><p class="meta" style="margin:0 0 .7rem">Create a one-time invite code and send it to them. They open this website, choose <b>Admin sign-in</b> then <b>Create admin account</b>, and enter the code. A code works once and expires after 7 days.</p>' +
    '<div class="row"><label for="inv-note" class="meta" style="margin:0">Who is it for? (optional)</label><input id="inv-note" class="sel-inline" maxlength="100" placeholder="e.g. Radha, kitchen team" style="flex:1;min-width:12rem"><button type="button" class="btn primary" data-act="newInvite">Create invite code</button></div></div>';
  if (S.invites.length) {
    h += '<div class="panel"><h3>Waiting to be used</h3>' + S.invites.map(function (i) {
      return '<div class="list-row"><div class="who"><b>' + esc(i.note || "Invite") + '</b><p class="meta" style="margin:0">created ' + esc(String(i.created_at).slice(0, 10)) + " · expires " + esc(String(i.expires_at).slice(0, 10)) + '</p></div><button type="button" class="btn small danger" data-act="revokeInvite" data-id="' + esc(i.id) + '">Cancel invite</button></div>';
    }).join("") + "</div>";
  }
  return h;
}

function renderFoot() {
  var f = $("#foot"), h = "<span>" + esc(CFG.CONTACT_TEXT || "") + "</span><span>";
  if (sb) {
    if (S.user) {
      h += esc(S.user.email || "Signed in") + (S.isAdmin ? "" : ' · <button type="button" data-act="claim">Enter invite code</button>') + ' · <button type="button" data-act="logout">Sign out</button>';
    } else h += '<button type="button" data-act="login">Admin sign-in</button>';
  }
  f.innerHTML = h + "</span>";
}
function render() {
  var sw = $("#modeSwitch"); sw.hidden = !S.isAdmin;
  if (!S.isAdmin) S.mode = "public";
  Array.prototype.forEach.call(sw.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === S.mode)); });
  $("#app").innerHTML = S.mode === "admin" ? adminView() : pubView();
  renderBar(); renderFoot();
}

/* ------------------------------------------------------ dialogs */

function openModal(html) {
  $("#modal").innerHTML = '<div class="scrim" data-act="close"></div>' + html;
  var f = $("#modal input:not([type=checkbox]):not([type=file]):not([tabindex='-1']),#modal textarea,#modal select"); if (f) f.focus();
}
function closeModal() { $("#modal").innerHTML = ""; }
document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

function summaryList(idx) {
  var by = {}; S.sel.forEach(function (k) { var t = keyTask(k); (by[t] = by[t] || []).push(k); });
  return '<ul class="sumlist">' + Object.keys(by).map(function (tid) {
    var x = idx.get(by[tid][0]); if (!x) return "";
    return "<li><span><b>" + esc(x.task.name) + '</b> <span class="meta">' + esc(fmtDate(x.task.task_date)) + '</span></span><span class="mono">' + esc(rangesOf(x.task, by[tid].map(keyIdx)).join(", ")) + "</span></li>";
  }).join("") + "</ul>";
}
function openSignup() {
  openModal('<form class="sheet" id="signupForm" novalidate><h2>Your sign-up</h2>' + summaryList(buildIndex()) +
    '<label for="su-name">Full name</label><input id="su-name" autocomplete="name" maxlength="120" required>' +
    '<label for="su-wa">WhatsApp number</label><input id="su-wa" type="tel" inputmode="tel" autocomplete="tel" placeholder="+31 6 12345678" maxlength="40" required>' +
    '<label for="su-mail">Email</label><input id="su-mail" type="email" autocomplete="email" placeholder="you@example.com" maxlength="200" required>' +
    '<div class="hp" aria-hidden="true"><label for="su-web">Website</label><input id="su-web" tabindex="-1" autocomplete="off"></div>' +
    '<label class="consent" for="su-ok"><input id="su-ok" type="checkbox"><span>I agree that the temple organisers may use my name, WhatsApp number and email to organise this seva (for example, to add me to a WhatsApp group). They will delete my details after the festival.</span></label>' +
    '<p class="err" id="su-err" role="alert"></p><div class="acts"><button type="button" class="btn" data-act="close">Back</button><button type="submit" class="btn primary" id="su-go">Confirm sign-up</button></div></form>');
}
var SU_ERR = {
  SLOT_FULL: "Some slots were just taken by someone else. Please review your choices.", OVERLAP: "Two of your chosen slots overlap in time.",
  INVALID_SLOTS: "Some of your slots are no longer available. Please review your choices.", INVALID_NAME: "Please enter your full name.",
  INVALID_EMAIL: "Please enter a valid email address.", INVALID_PHONE: "Please enter a WhatsApp number, with country code.",
  NO_CONSENT: "Please tick the box to agree.", TOO_MANY: "Too many sign-ups from this connection. Please try again later."
};
async function submitSignup() {
  if (S.submitting) return;
  var err = $("#su-err"), go = $("#su-go");
  var name = $("#su-name").value.trim(), phone = $("#su-wa").value.trim(), email = $("#su-mail").value.trim();
  if (name.length < 2) { err.textContent = SU_ERR.INVALID_NAME; return; }
  if (phone.replace(/\D/g, "").length < 8) { err.textContent = SU_ERR.INVALID_PHONE; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = SU_ERR.INVALID_EMAIL; return; }
  if (!$("#su-ok").checked) { err.textContent = SU_ERR.NO_CONSENT; return; }
  var idx = buildIndex(), summary = summaryList(idx);
  var slots = Array.from(S.sel).map(function (k) { return { task_id: keyTask(k), slot_idx: keyIdx(k) }; });
  if ($("#su-web").value) { finishSignup(summary); return; } // hidden field filled in: a bot
  S.submitting = true; go.disabled = true; err.textContent = "";
  var res = await sb.rpc("submit_signup", { p_name: name, p_email: email, p_phone: phone, p_slots: slots, p_consent: true });
  S.submitting = false;
  if (res.error) {
    go.disabled = false;
    var m = errText(res.error, SU_ERR);
    if (/SLOT_FULL|INVALID_SLOTS|OVERLAP/.test(res.error.message || "")) { await load(); closeModal(); toast(m); return; }
    err.textContent = m || "Could not save your sign-up. Please check your connection and try again."; return;
  }
  finishSignup(summary);
}
function finishSignup(summary) {
  S.sel.clear();
  openModal('<div class="sheet"><h2>Thank you for your seva!</h2><p>You are signed up for:</p><div style="margin-top:.6rem">' + summary + '</div><p class="hint">Please take a screenshot of this for your records. ' + esc(CFG.CONTACT_TEXT || "") + '</p><div class="acts"><button type="button" class="btn primary" data-act="close">Done</button></div></div>');
  load();
}

var AUTH_ERR = {
  "Invalid login credentials": "That email and password were not accepted.", "Email not confirmed": "Please confirm your email first (check your inbox), then sign in.",
  "User already registered": "An account with this email already exists. Use Sign in instead.", "Password should be at least": "Please choose a longer password (at least 8 characters).",
  "rate limit": "Too many attempts. Please wait a few minutes and try again.", "BAD_CODE": "That invite code was not accepted. It may be wrong, already used or expired. Ask for a new one.",
  "NOT_SIGNED_IN": "Please sign in first."
};
function openAuth(mode) {
  mode = mode === "create" ? "create" : "signin";
  openModal('<form class="sheet" id="authForm" data-mode="' + mode + '" novalidate><h2>Admin ' + (mode === "create" ? "account" : "sign-in") + "</h2>" +
    '<div class="mode-tabs"><button type="button" data-act="authMode" data-mode="signin" aria-pressed="' + (mode === "signin") + '">Sign in</button><button type="button" data-act="authMode" data-mode="create" aria-pressed="' + (mode === "create") + '">Create admin account</button></div>' +
    '<label for="au-mail">Email</label><input id="au-mail" type="email" autocomplete="email" maxlength="200">' +
    '<label for="au-pw">Password' + (mode === "create" ? " (at least 8 characters)" : "") + '</label><input id="au-pw" type="password" autocomplete="' + (mode === "create" ? "new-password" : "current-password") + '" maxlength="200">' +
    (mode === "create" ? '<label for="au-code">Invite code from an existing admin</label><input id="au-code" autocomplete="off" maxlength="40" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX">' : "") +
    '<p class="err" id="au-err" role="alert"></p><div class="acts"><button type="button" class="btn" data-act="close">Cancel</button><button type="submit" class="btn primary" id="au-go">' + (mode === "create" ? "Create account" : "Sign in") + "</button></div></form>");
}
async function submitAuth() {
  var form = $("#authForm"), mode = form.dataset.mode, err = $("#au-err"), go = $("#au-go");
  var email = $("#au-mail").value.trim(), pw = $("#au-pw").value, code = mode === "create" ? $("#au-code").value.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = "Please enter your email address."; return; }
  if (!pw) { err.textContent = "Please enter your password."; return; }
  if (mode === "create" && pw.length < 8) { err.textContent = AUTH_ERR["Password should be at least"]; return; }
  if (mode === "create" && code.replace(/[^A-Za-z0-9]/g, "").length < 12) { err.textContent = "Please enter the invite code."; return; }
  go.disabled = true; err.textContent = "";
  try {
    if (mode === "create") {
      var su = await sb.auth.signUp({ email: email, password: pw });
      if (su.error) throw su.error;
      if (!su.data || !su.data.session) {
        closeModal();
        openModal('<div class="sheet"><h2>Check your email</h2><p>Your account was created. Open the confirmation email, confirm your address, then come back, choose <b>Admin sign-in</b>, sign in and enter your invite code.</p><div class="acts"><button type="button" class="btn primary" data-act="close">OK</button></div></div>');
        return;
      }
      var cl = await sb.rpc("claim_admin_invite", { p_code: code });
      if (cl.error) {
        await refreshSession(); closeModal(); render();
        openModal('<div class="sheet"><h2>Account created</h2><p>' + esc(errText(cl.error, AUTH_ERR) || "The invite code could not be checked.") + '</p><p class="hint">You are signed in. Use "Enter invite code" at the bottom of the page when you have a valid code.</p><div class="acts"><button type="button" class="btn primary" data-act="close">OK</button></div></div>');
        return;
      }
    } else {
      var si = await sb.auth.signInWithPassword({ email: email, password: pw });
      if (si.error) throw si.error;
    }
    await refreshSession(); closeModal();
    if (S.isAdmin) { S.mode = "admin"; S.loaded = false; render(); await load(); toast("Signed in."); }
    else { render(); openClaim(); }
  } catch (e) {
    go.disabled = false;
    var m = String(e && e.message || ""), k = Object.keys(AUTH_ERR).find(function (x) { return m.indexOf(x) >= 0; });
    err.textContent = k ? AUTH_ERR[k] : "Could not complete that. Please check your details and try again.";
  }
}
function openClaim() {
  openModal('<form class="sheet" id="claimForm" novalidate><h2>Enter your invite code</h2><p>You are signed in as ' + esc(S.user ? S.user.email : "") + ', but this account is not an admin yet. Enter the one-time code an admin gave you.</p>' +
    '<label for="cl-code">Invite code</label><input id="cl-code" autocomplete="off" maxlength="40" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"><p class="err" id="cl-err" role="alert"></p>' +
    '<div class="acts"><button type="button" class="btn" data-act="close">Later</button><button type="submit" class="btn primary" id="cl-go">Become admin</button></div></form>');
}
async function submitClaim() {
  var err = $("#cl-err"), go = $("#cl-go"), code = $("#cl-code").value.trim();
  if (code.replace(/[^A-Za-z0-9]/g, "").length < 12) { err.textContent = "Please enter the invite code."; return; }
  go.disabled = true; err.textContent = "";
  var r = await sb.rpc("claim_admin_invite", { p_code: code });
  if (r.error) { go.disabled = false; err.textContent = errText(r.error, AUTH_ERR) || "Could not check the code. Please try again."; return; }
  await refreshSession(); closeModal(); S.mode = "admin"; S.loaded = false; render(); await load(); toast("You are now an admin.");
}

function photoField(prefix, url) {
  return '<label for="' + prefix + '-photo">Photo (optional)</label><input id="' + prefix + '-photo" type="file" accept="image/*">' +
    (url ? '<img class="photo-prev" src="' + esc(url) + '" alt=""><label class="check" for="' + prefix + '-rm"><input id="' + prefix + '-rm" type="checkbox"> Remove current photo</label>' : "");
}
function resizeImage(file, maxW) {
  return new Promise(function (resolve, reject) {
    var img = new Image(), u = URL.createObjectURL(file);
    img.onload = function () {
      var sc = Math.min(1, maxW / img.naturalWidth), c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
      var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u); c.toBlob(function (b) { b ? resolve(b) : reject(new Error("blob")); }, "image/jpeg", 0.82);
    };
    img.onerror = function () { URL.revokeObjectURL(u); reject(new Error("img")); };
    img.src = u;
  });
}
function photoPath(url) { var m = String(url || "").match(/\/photos\/([^?]+)$/); return m ? decodeURIComponent(m[1]) : ""; }
async function removePhotos(urls) {
  var paths = urls.map(photoPath).filter(Boolean);
  if (paths.length) { try { await sb.storage.from("photos").remove(paths); } catch (e) { /* best effort */ } }
}
async function photoValue(prefix, old, maxW) {
  var inp = $("#" + prefix + "-photo"), rm = $("#" + prefix + "-rm");
  if (inp && inp.files && inp.files[0]) {
    var blob = await resizeImage(inp.files[0], maxW);
    var path = Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
    var up = await sb.storage.from("photos").upload(path, blob, { contentType: "image/jpeg" });
    if (up.error) throw up.error;
    if (old) await removePhotos([old]);
    return sb.storage.from("photos").getPublicUrl(path).data.publicUrl;
  }
  if (rm && rm.checked) { if (old) await removePhotos([old]); return null; }
  return old || null;
}

function festForm(f) {
  f = f || {};
  var tpl = f.id ? "" : '<label for="ff-tpl">Start from a ready-made event</label><select id="ff-tpl"><option value="">Custom (enter everything myself)</option>' +
    EVENTS.map(function (e) { return '<option value="' + e.id + '">' + esc(e.name) + "</option>"; }).join("") + '</select>' +
    '<label class="check" for="ff-addseva"><input id="ff-addseva" type="checkbox" checked> Also add the usual list of services for this event</label><p class="tpl-note" id="ff-tplnote">Dates change every year, so choose the date below. You can edit the services afterwards.</p>';
  openModal('<form class="sheet" id="festForm" data-id="' + esc(f.id || "") + '" novalidate><h2>' + (f.id ? "Edit festival" : "New festival") + "</h2>" + tpl +
    '<label for="ff-name">Festival name</label><input id="ff-name" value="' + esc(f.name || "") + '" maxlength="200" placeholder="Janmashtami">' +
    '<label for="ff-desc">Short description</label><textarea id="ff-desc" maxlength="2000" placeholder="Celebration of Krishna\'s birthday">' + esc(f.description || "") + "</textarea>" +
    '<div class="fields2"><div><label for="ff-date">First day</label><input id="ff-date" type="date" value="' + esc(f.start_date || "") + '"></div><div><label for="ff-end">Last day (optional)</label><input id="ff-end" type="date" value="' + esc(f.end_date || "") + '"></div></div>' +
    photoField("ff", f.image_url) +
    '<label class="check" for="ff-open"><input id="ff-open" type="checkbox"' + (f.is_open === false ? "" : " checked") + '> Volunteers can sign up</label>' +
    '<p class="err" id="ff-err" role="alert"></p><div class="acts"><button type="button" class="btn" data-act="close">Cancel</button><button type="submit" class="btn primary" id="ff-go">Save festival</button></div></form>');
}
function applyTemplate() {
  var sel = $("#ff-tpl"); if (!sel) return;
  var e = EVENTS.find(function (x) { return x.id === sel.value; });
  if (e) { $("#ff-name").value = e.name; $("#ff-desc").value = e.description; }
}
async function saveFest() {
  var form = $("#festForm"), id = form.dataset.id, err = $("#ff-err"), go = $("#ff-go");
  var d = { name: $("#ff-name").value.trim(), description: $("#ff-desc").value.trim(), start_date: $("#ff-date").value, end_date: $("#ff-end").value || null, is_open: $("#ff-open").checked };
  if (!d.name) { err.textContent = "Please enter a festival name."; return; }
  if (!d.start_date) { err.textContent = "Please choose the first day."; return; }
  if (d.end_date && d.end_date < d.start_date) { err.textContent = "The last day is before the first day."; return; }
  var tplId = $("#ff-tpl") ? $("#ff-tpl").value : "", addSeva = !!($("#ff-addseva") && $("#ff-addseva").checked && tplId);
  go.disabled = true; err.textContent = "";
  try {
    var old = id ? S.festivals.find(function (x) { return x.id === id; }) : null;
    d.image_url = await photoValue("ff", old && old.image_url, 1600);
    var r = id ? await sb.from("festivals").update(d).eq("id", id).select().single() : await sb.from("festivals").insert(d).select().single();
    if (r.error) throw r.error;
    S.afWant = r.data.id;
    if (!id && addSeva) {
      var ev = EVENTS.find(function (x) { return x.id === tplId; }), rows = [];
      ev.seva.forEach(function (n) {
        var c = COMMON_BY_NAME[n]; if (!c) return;
        rows.push({ festival_id: r.data.id, name: c[0], description: c[1], needed: c[2], task_date: d.start_date, start_time: c[3], end_time: c[4], slot_minutes: c[5] });
      });
      if (rows.length) { var tr = await sb.from("tasks").insert(rows); if (tr.error) throw tr.error; }
    }
    closeModal(); S.tab = (!id && addSeva) ? "plan" : S.tab; toast(!id && addSeva ? "Festival saved with its usual services. Please check the day and times." : "Festival saved."); await load();
  } catch (e) { go.disabled = false; err.textContent = "Could not save. Please try again."; }
}
function taskForm(t, festId) {
  t = t || {}; var f = S.festivals.find(function (x) { return x.id === festId; }) || {}, sm = +t.slot_minutes || 60;
  openModal('<form class="sheet" id="taskForm" data-id="' + esc(t.id || "") + '" data-fest="' + esc(festId) + '" novalidate><h2>' + (t.id ? "Edit service" : "Add service") + "</h2>" +
    '<label for="tf-name">Service name</label><input id="tf-name" value="' + esc(t.name || "") + '" maxlength="200" placeholder="Temple cleaning">' +
    '<label for="tf-desc">What will volunteers do?</label><textarea id="tf-desc" maxlength="2000" placeholder="Your main tasks are to clean the common areas and the toilets.">' + esc(t.description || "") + "</textarea>" +
    '<div class="fields2"><div><label for="tf-date">Day</label><input id="tf-date" type="date" value="' + esc(t.task_date || f.start_date || "") + '"></div><div><label for="tf-need">People needed per slot</label><input id="tf-need" type="number" min="1" max="500" value="' + (+t.needed || 1) + '"></div></div>' +
    '<div class="fields2"><div><label for="tf-start">Starts</label><input id="tf-start" type="time" value="' + esc(t.start_time || "14:00") + '"></div><div><label for="tf-end">Ends</label><input id="tf-end" type="time" value="' + esc(t.end_time || "18:00") + '"></div></div>' +
    '<label for="tf-slot">Slot length for volunteers</label><select id="tf-slot">' + [30, 60, 90, 120, 180].map(function (m) { return '<option value="' + m + '"' + (m === sm ? " selected" : "") + ">" + (m < 60 ? m + " minutes" : (m / 60) + (m === 60 ? " hour" : " hours")) + "</option>"; }).join("") + "</select>" +
    photoField("tf", t.image_url) +
    '<p class="hint" id="tf-hint"></p><p class="err" id="tf-err" role="alert"></p><div class="acts"><button type="button" class="btn" data-act="close">Cancel</button><button type="submit" class="btn primary" id="tf-go">Save service</button></div></form>');
  updHint();
}
function updHint() {
  var h = $("#tf-hint"); if (!h) return;
  var s = toMin($("#tf-start").value), e = toMin($("#tf-end").value), L = +$("#tf-slot").value, n = +$("#tf-need").value || 1;
  if (e <= s) { h.textContent = ""; return; }
  var slots = Math.ceil((e - s) / L);
  h.textContent = plural(slots, "slot", "slots") + " × " + n + " people = " + fmtH(slots * n * Math.min(L, e - s)) + " volunteer-hours in total.";
}
async function saveTask() {
  var form = $("#taskForm"), id = form.dataset.id, err = $("#tf-err"), go = $("#tf-go");
  var d = { festival_id: form.dataset.fest, name: $("#tf-name").value.trim(), description: $("#tf-desc").value.trim(), task_date: $("#tf-date").value,
    start_time: $("#tf-start").value, end_time: $("#tf-end").value, needed: Math.max(1, Math.round(+$("#tf-need").value || 1)), slot_minutes: +$("#tf-slot").value };
  if (!d.name) { err.textContent = "Please enter a name for this service."; return; }
  if (!d.task_date) { err.textContent = "Please choose the day."; return; }
  if (!d.start_time || !d.end_time || toMin(d.end_time) <= toMin(d.start_time)) { err.textContent = "The end time must be after the start time."; return; }
  if (d.needed > 500) { err.textContent = "People needed can be at most 500."; return; }
  var old = id ? S.tasks.find(function (x) { return x.id === id; }) : null;
  if (old && (old.task_date !== d.task_date || old.start_time !== d.start_time || old.end_time !== d.end_time || old.slot_minutes !== d.slot_minutes) &&
      S.signups.some(function (s) { return s.task_id === id; })) {
    err.textContent = "Volunteers have already signed up, so the day, times and slot length cannot change. Remove the volunteers first, or add a new service."; return;
  }
  go.disabled = true; err.textContent = "";
  try {
    d.image_url = await photoValue("tf", old && old.image_url, 900);
    var r = id ? await sb.from("tasks").update(d).eq("id", id) : await sb.from("tasks").insert(d);
    if (r.error) throw r.error;
    closeModal(); toast("Service saved."); await load();
  } catch (e) { go.disabled = false; err.textContent = "Could not save. Please try again."; }
}
function confirmBox(title, msg, act, id, label, extra) {
  openModal('<div class="sheet"><h2>' + esc(title) + "</h2><p>" + esc(msg) + '</p><div class="acts"><button type="button" class="btn" data-act="close">Cancel</button><button type="button" class="btn danger" data-act="' + act + '" data-id="' + esc(id || "") + '"' + (extra ? ' data-extra="' + esc(extra) + '"' : "") + ">" + esc(label) + "</button></div></div>");
}
function copyText(text, what) {
  if (!text) { toast("Nothing to copy yet."); return; }
  var fall = function () {
    openModal('<div class="sheet"><h2>Copy ' + esc(what) + '</h2><textarea id="cp-area" readonly style="min-height:9rem">' + esc(text) + '</textarea><div class="acts"><button type="button" class="btn primary" data-act="close">Done</button></div></div>');
    var a = $("#cp-area"); if (a) { a.focus(); a.select(); }
  };
  try { navigator.clipboard.writeText(text).then(function () { toast("Copied " + what + "."); }, fall); } catch (e) { fall(); }
}
function saveFile(name, text, type) {
  var blob = new Blob([text], { type: type }), a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function fileSlug(s) { return String(s || "volunteers").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "volunteers"; }
function exportName(kind) {
  var f = curFest(); return fileSlug(S.exportScope === "all" || !f ? "all-festivals" : f.name) + "-" + kind;
}
function csvContacts(rows) {
  var out = [["Name", "WhatsApp (international)", "WhatsApp (as entered)", "Email", "Festival", "Seva"].map(csvCell).join(",")];
  uniqueContacts(rows).forEach(function (p) { out.push([p.name, p.digits ? "+" + p.digits : "", p.phone, p.email, p.festivals.join("; "), p.seva.join("; ")].map(csvCell).join(",")); });
  return "\ufeff" + out.join("\r\n");
}
function csvFull(rows) {
  var out = [["Festival", "Seva", "Date", "Time slots", "Name", "WhatsApp (international)", "WhatsApp (as entered)", "Email"].map(csvCell).join(",")];
  rows.forEach(function (r) { var c = r.v.c; out.push([r.f.name, r.t.name, r.t.task_date, rangesOf(r.t, r.v.keys.map(keyIdx)).join("; "), c.name, waDigits(c.phone) ? "+" + waDigits(c.phone) : "", c.phone, c.email].map(csvCell).join(",")); });
  return "\ufeff" + out.join("\r\n");
}
function vcf(rows) {
  return uniqueContacts(rows).map(function (p) {
    return "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:" + vcardText(p.name) + "\r\nN:" + vcardText(p.name) + ";;;;\r\n" + (p.digits ? "TEL;TYPE=CELL:+" + p.digits + "\r\n" : "") +
      (p.email ? "EMAIL:" + vcardText(p.email) + "\r\n" : "") + "NOTE:" + vcardText("Seva: " + p.seva.join("; ")) + "\r\nEND:VCARD\r\n";
  }).join("");
}
function allRows() {
  var rows = [];
  sortedFests().forEach(function (fe) { tasksOf(fe.id).forEach(function (t) { volunteersOf(t).forEach(function (v) { if (v.c) rows.push({ f: fe, t: t, v: v }); }); }); });
  return rows;
}
async function run(p, okMsg) {
  var r = await p;
  if (r.error) { toast("That did not work. Please try again."); return false; }
  if (okMsg) toast(okMsg);
  await load(); return true;
}
async function doCleanDelete() {
  var fids = [], tids = [];
  S.cleanSel.forEach(function (k) { (k.charAt(0) === "f" ? fids : tids).push(k.slice(2)); });
  var urls = [];
  S.festivals.forEach(function (f) { if (fids.indexOf(f.id) >= 0 && f.image_url) urls.push(f.image_url); });
  S.tasks.forEach(function (t) { if ((fids.indexOf(t.festival_id) >= 0 || tids.indexOf(t.id) >= 0) && t.image_url) urls.push(t.image_url); });
  if (fids.length) { var a = await sb.from("festivals").delete().in("id", fids); if (a.error) { toast("That did not work. Please try again."); return; } }
  if (tids.length) { var b = await sb.from("tasks").delete().in("id", tids); if (b.error) { toast("That did not work. Please try again."); return; } }
  await removePhotos(urls);
  S.cleanSel.clear(); closeModal(); toast("Finished events deleted."); await load();
}

/* -------------------------------------------------------- events */

document.addEventListener("click", function (ev) {
  var el = ev.target.closest("[data-act]"); if (!el) return;
  var a = el.dataset.act, f = S.mode === "admin" ? curFest() : null;
  if (el.tagName === "SELECT" || (el.tagName === "INPUT" && el.type === "checkbox" && a === "cleanSel")) return;
  if (a === "close") { closeModal(); return; }
  if (a === "mode") { S.mode = el.dataset.mode; render(); return; }
  if (a === "fold") { var fk = el.dataset.key; if (S.open.has(fk)) S.open.delete(fk); else S.open.add(fk); render(); return; }
  if (a === "foldAll") { el.dataset.ids.split(",").forEach(function (i) { var k3 = el.dataset.prefix + ":" + i; if (el.dataset.open === "1") S.open.add(k3); else S.open.delete(k3); }); render(); return; }
  if (a === "tab") { S.tab = el.dataset.tab; render(); return; }
  if (a === "pickFest") { S.af = el.dataset.id; render(); return; }
  if (a === "toggle") { var k = el.dataset.key; if (S.sel.has(k)) S.sel.delete(k); else S.sel.add(k); render(); return; }
  if (a === "clearSel") { S.sel.clear(); render(); return; }
  if (a === "signup") { openSignup(); return; }
  if (a === "login") { openAuth("signin"); return; }
  if (a === "authMode") { openAuth(el.dataset.mode); return; }
  if (a === "claim") { openClaim(); return; }
  if (a === "logout") { sb.auth.signOut().then(async function () { S.user = null; S.isAdmin = false; S.mode = "public"; S.loaded = false; S.signups = []; S.volunteers = new Map(); render(); await load(); }); return; }
  if (a === "newFest") { festForm(); return; }
  if (a === "editFest") { festForm(S.festivals.find(function (x) { return x.id === el.dataset.id; })); return; }
  if (a === "delFest") { confirmBox("Delete this festival?", "This deletes the festival, all its services and every volunteer sign-up for it, together with the contact details of volunteers who have no other sign-ups.", "doDelFest", el.dataset.id, "Delete festival"); return; }
  if (a === "doDelFest") {
    var fe = S.festivals.find(function (x) { return x.id === el.dataset.id; }), urls = [];
    if (fe && fe.image_url) urls.push(fe.image_url);
    S.tasks.forEach(function (t) { if (t.festival_id === el.dataset.id && t.image_url) urls.push(t.image_url); });
    run(sb.from("festivals").delete().eq("id", el.dataset.id), "Festival deleted.").then(function (ok) { if (ok) { S.af = null; closeModal(); removePhotos(urls); render(); } });
    return;
  }
  if (a === "addCommon" && f) { var c = COMMON[+el.dataset.i]; taskForm({ name: c[0], description: c[1], needed: c[2], start_time: c[3], end_time: c[4], slot_minutes: c[5] }, f.id); return; }
  if (a === "addCustom" && f) { taskForm(null, f.id); return; }
  if (a === "editTask") { var t = S.tasks.find(function (x) { return x.id === el.dataset.id; }); if (t) taskForm(t, t.festival_id); return; }
  if (a === "delTask") { confirmBox("Delete this service?", "This removes the service and its volunteer sign-ups.", "doDelTask", el.dataset.id, "Delete service"); return; }
  if (a === "doDelTask") {
    var tk = S.tasks.find(function (x) { return x.id === el.dataset.id; });
    run(sb.from("tasks").delete().eq("id", el.dataset.id), "Service deleted.").then(function (ok) { if (ok) { closeModal(); if (tk && tk.image_url) removePhotos([tk.image_url]); } });
    return;
  }
  if (a === "removeVol") { run(sb.from("signups").delete().eq("volunteer_id", el.dataset.vid).eq("task_id", el.dataset.id), "Volunteer removed from this service."); return; }
  if (a === "scope") return;
  if (a === "csvContacts") { saveFile(exportName("contacts") + ".csv", csvContacts(scopedRows()), "text/csv;charset=utf-8"); return; }
  if (a === "csvFull") { saveFile(exportName("full-list") + ".csv", csvFull(scopedRows()), "text/csv;charset=utf-8"); return; }
  if (a === "vcf") { saveFile(exportName("contacts") + ".vcf", vcf(scopedRows()), "text/vcard;charset=utf-8"); return; }
  if (a === "csvAllBackup") { saveFile("all-volunteers-backup.csv", csvFull(allRows()), "text/csv;charset=utf-8"); return; }
  if (a === "copyNumbers") { copyText(uniqueContacts(scopedRows()).map(function (p) { return p.name + ": " + (p.digits ? "+" + p.digits : p.phone); }).join("\n"), "names and numbers"); return; }
  if (a === "copyMails") { copyText(uniqueContacts(scopedRows()).map(function (p) { return p.email; }).join(", "), "email addresses"); return; }
  if (a === "copySeva") {
    var ts = S.tasks.find(function (x) { return x.id === el.dataset.id; }), fx = ts && festOf(ts);
    copyText(ts ? uniqueContacts(volunteersOf(ts).filter(function (v) { return v.c; }).map(function (v) { return { f: fx, t: ts, v: v }; })).map(function (p) { return p.name + ": " + (p.digits ? "+" + p.digits : p.phone); }).join("\n") : "", "names and numbers");
    return;
  }
  if (a === "cleanAll") { var L = cleanupLists(); S.cleanSel = new Set(L.fests.map(function (x) { return "f:" + x.id; }).concat(L.tasks.map(function (x) { return "t:" + x.id; }))); render(); return; }
  if (a === "cleanNone") { S.cleanSel.clear(); render(); return; }
  if (a === "cleanDelete") {
    var fids = new Set(), tids = new Set(); S.cleanSel.forEach(function (k2) { (k2.charAt(0) === "f" ? fids : tids).add(k2.slice(2)); });
    confirmBox("Delete the selected finished events?", "This permanently deletes " + plural(fids.size, "festival", "festivals") + " and " + plural(tids.size, "service", "services") + " with all sign-ups, and the contact details of " + plural(volunteersIn(fids, tids), "volunteer", "volunteers") + " who have no other sign-ups. This cannot be undone.", "doCleanDelete", "", "Delete permanently");
    return;
  }
  if (a === "doCleanDelete") { doCleanDelete(); return; }
  if (a === "newInvite") {
    sb.rpc("create_admin_invite", { p_note: ($("#inv-note").value || "").trim() }).then(function (r) {
      if (r.error) { toast("Could not create the invite. Please try again."); return; }
      var code = String(r.data).replace(/(.{4})(?=.)/g, "$1-"), url = location.href.split("#")[0];
      var msg = "You are invited to be an admin of the ISKCON Amsterdam Seva Board.\n1. Open " + url + "\n2. Choose Admin sign-in, then Create admin account\n3. Use your own email and a password, and enter this one-time invite code: " + code + "\nThe code works once and expires in 7 days.";
      openModal('<div class="sheet"><h2>Invite code created</h2><p class="meta" style="margin-bottom:.6rem">This code is shown only now. Send it to the new admin, for example on WhatsApp.</p><div class="code-box">' + esc(code) + '</div>' +
        '<label for="inv-msg">Message to send</label><textarea id="inv-msg" readonly style="min-height:9rem">' + esc(msg) + '</textarea><div class="acts"><button type="button" class="btn" data-act="copyInvite">Copy message</button><button type="button" class="btn primary" data-act="close">Done</button></div></div>');
      load();
    });
    return;
  }
  if (a === "copyInvite") { var ta = $("#inv-msg"); if (ta) { ta.select(); try { navigator.clipboard.writeText(ta.value).then(function () { toast("Copied."); }, function () { toast("Press Ctrl+C to copy."); }); } catch (e) { toast("Press Ctrl+C to copy."); } } return; }
  if (a === "revokeInvite") { run(sb.rpc("revoke_admin_invite", { p_id: el.dataset.id }), "Invite cancelled."); return; }
  if (a === "revokeAdmin") { confirmBox("Remove admin access?", el.dataset.email + " will no longer be able to see volunteers or change anything. Their account stays, but without admin rights.", "doRevokeAdmin", el.dataset.id, "Remove access"); return; }
  if (a === "doRevokeAdmin") { run(sb.rpc("revoke_admin", { p_user: el.dataset.id }), "Access removed.").then(function (ok) { if (ok) closeModal(); }); return; }
});
document.addEventListener("change", function (ev) {
  var el = ev.target;
  if (el.id === "ex-scope") { S.exportScope = el.value; render(); return; }
  if (el.id === "ff-tpl") { applyTemplate(); return; }
  if (el.dataset && el.dataset.act === "cleanSel") { if (el.checked) S.cleanSel.add(el.dataset.key); else S.cleanSel.delete(el.dataset.key); render(); return; }
  if (el.closest && el.closest("#taskForm")) updHint();
});
document.addEventListener("input", function (ev) { if (ev.target.closest && ev.target.closest("#taskForm")) updHint(); });
document.addEventListener("submit", function (ev) {
  ev.preventDefault(); var id = ev.target.id;
  if (id === "signupForm") submitSignup();
  else if (id === "authForm") submitAuth();
  else if (id === "claimForm") submitClaim();
  else if (id === "festForm") saveFest();
  else if (id === "taskForm") saveTask();
});
document.addEventListener("visibilitychange", function () { if (!document.hidden && sb && !$("#modal").innerHTML) load(true); });

/* ---------------------------------------------------------- start */

async function boot() {
  render();
  if (!sb) return;
  await refreshSession();
  if (S.isAdmin) S.mode = "admin";
  await load();
  if (location.hash === "#admin" && !S.user) openAuth("signin");
  setInterval(function () { if (!document.hidden && !$("#modal").innerHTML && S.mode === "public") load(); }, 60000);
}
window.addEventListener("hashchange", function () { if (location.hash === "#admin" && sb && !S.user) openAuth("signin"); });
boot();
})();
