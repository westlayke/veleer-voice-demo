// Cloudflare Worker for the Citizens VCRM voice demo.
// 1. POST /          hands the demo a 5-minute Grok voice session token (keeps the xAI key off the page).
// 2. GET/POST /log   saves each conversation (phone ID, name, rough location, what was said) to a D1 database.
// 3. GET /activity   a password-protected page listing phones and their conversations.
// 4. POST /tts       speaks a short line the app itself knows (a save acknowledgement) in Ara's own voice, with xAI text-to-speech
//                    (Carverhill, Oct 27: no waiting for Grok at the slowest moment, and no second voice).
//
// Secrets (set in the Worker's Settings > Variables and Secrets, never in this file):
//   XAI_API_KEY     your xAI API key
//   OPENAI_API_KEY  an OpenAI API key, only for the voice-engine comparison (preview Settings "Voice engine": OpenAI); optional
//   GEMINI_API_KEY  a Google Gemini API key, same purpose; optional
//   DEMO_CODE       the access code built into the demo page
//   ADMIN_PASSWORD  the password for the activity page (user name: admin)
// Bindings (wrangler.toml):
//   DB              the D1 database that holds the activity log
//   LINES           a KV namespace that keeps the audio of each spoken line for 30 days (one xAI text-to-speech call per line and voice, ever)
const ALLOWED_ORIGIN = "https://westlayke.github.io";
const KEEP_DAYS = 90; // conversations older than this are deleted

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Demo-Code",
      "Vary": "Origin",
    };
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (url.pathname === "/activity") return activity(request, env, url);
    if (url.pathname === "/log" && request.method === "GET") return json({ logging: !!env.DB });
    if (url.pathname === "/providers" && request.method === "GET") return json({ grok: !!env.XAI_API_KEY, openai: !!env.OPENAI_API_KEY, gemini: !!env.GEMINI_API_KEY }); // which voice engines this key holder can open (true/false only, never the keys)
    if (request.method !== "POST") return new Response("Not found", { status: 404, headers: cors });
    if (request.headers.get("Origin") !== ALLOWED_ORIGIN) return new Response("Forbidden", { status: 403, headers: cors });
    if (env.DEMO_CODE && request.headers.get("X-Demo-Code") !== env.DEMO_CODE) return json({ error: "bad_code" }, 401);
    if (url.pathname === "/log") return saveLog(request, env, json);
    if (url.pathname === "/tts") return speak(request, env, cors, json);

    const r = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.XAI_API_KEY },
      body: JSON.stringify({ expires_after: { seconds: 300 } }),
    });
    return new Response(await r.text(), { status: r.status, headers: { ...cors, "Content-Type": "application/json" } });
  },
};

// a spoken line: at most 400 characters (about $0.006), mp3 at 24 kHz; the audio is cached by the browser per text and voice.
// voice: one of xAI's multilingual voices; the app asks for its stand-in voice (leo) so the officer can tell the app from Ara (Oct 27)
const VOICES = ["ara", "eve", "leo", "rex", "sal"];
async function speak(request, env, cors, json) {
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  const text = String(b.text || "").trim().slice(0, 400), voice = VOICES.includes(b.voice) ? b.voice : "ara";
  if (!text) return json({ error: "no_text" }, 400);
  // the audio of a line is kept in KV (LINES) for 30 days: the first phone to need a line waits on xAI (0.6 to 10 s, Jim's Oct 27 2:26 PM call), every later fetch of the same words in the same voice is instant for everyone
  const key = voice + ":" + await sha(text), hit = env.LINES ? await env.LINES.get(key, "arrayBuffer").catch(() => null) : null;
  if (hit) return new Response(hit, { status: 200, headers: { ...cors, "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600", "X-Line-Cache": "hit", "Access-Control-Expose-Headers": "X-Line-Cache" } });
  const r = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.XAI_API_KEY },
    body: JSON.stringify({ text, voice_id: voice, language: "en", output_format: { codec: "mp3", sample_rate: 24000, bit_rate: 64000 } }),
  });
  if (!r.ok) return json({ error: "tts_" + r.status }, 502);
  const buf = await r.arrayBuffer();
  if (env.LINES && buf.byteLength > 0) await env.LINES.put(key, buf, { expirationTtl: 30 * 86400 }).catch(() => {});
  return new Response(buf, { status: 200, headers: { ...cors, "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600", "X-Line-Cache": "miss", "Access-Control-Expose-Headers": "X-Line-Cache" } });
}
async function sha(text) { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join(""); }

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, device TEXT, name TEXT,
    session TEXT, page TEXT, role TEXT, text TEXT, city TEXT, region TEXT, country TEXT)`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS events_session ON events (session, id)").run();
  // each event carries an id from the phone, so a batch sent twice (a reply lost to a bad patch of signal) is stored once (Oct 25)
  try { await db.prepare("ALTER TABLE events ADD COLUMN bid TEXT").run(); } catch (e) {}
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS events_bid ON events (bid)").run();
}

async function saveLog(request, env, json) {
  if (!env.DB) return json({ stored: false });
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  const cut = (s, n) => String(s == null ? "" : s).slice(0, n);
  const events = Array.isArray(b.events) ? b.events.slice(0, 200) : [];
  if (!events.length) return json({ stored: 0 });
  const cf = request.cf || {};
  await ensureTable(env.DB);
  const ins = env.DB.prepare("INSERT OR IGNORE INTO events (at, device, name, session, page, role, text, city, region, country, bid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  await env.DB.batch(events.map(e => ins.bind(cut(e.at, 30), cut(b.device, 64), cut(b.name, 80), cut(b.session, 64), cut(b.page, 20),
    cut(e.role, 20), cut(e.text, 4000), cut(cf.city, 80), cut(cf.region, 80), cut(cf.country, 8), e.id ? cut(e.id, 40) : null)));
  if (Math.random() < 0.05) await env.DB.prepare("DELETE FROM events WHERE at < ?").bind(new Date(Date.now() - KEEP_DAYS * 864e5).toISOString()).run();
  return json({ stored: events.length });
}

async function activity(request, env, url) {
  const ok = (() => {
    const h = request.headers.get("Authorization") || "";
    if (!env.ADMIN_PASSWORD || !h.startsWith("Basic ")) return false;
    try { const [u, p] = atob(h.slice(6)).split(":"); return u === "admin" && p === env.ADMIN_PASSWORD; } catch (e) { return false; }
  })();
  if (!ok) return new Response("Sign in with user name admin and the activity password.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Citizens VCRM activity"' } });
  const page = (body) => new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Citizens VCRM activity</title>
<style>body{font:15px/1.4 system-ui,sans-serif;margin:0;padding:16px;background:#f4f6f9;color:#1d232b}h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px}
table{border-collapse:collapse;width:100%;background:#fff}td,th{border-bottom:1px solid #e3e7ec;padding:6px 8px;text-align:left;vertical-align:top;font-size:14px}th{background:#eef1f5}
.conv{background:#fff;border:1px solid #e3e7ec;border-radius:8px;margin:10px 0;padding:10px 12px}.meta{color:#5b6470;font-size:13px}.r{margin:4px 0}.user b{color:#1f5fbf}.grok b{color:#2f7d4f}.step{color:#8a5a00;font-size:13px}.sys{color:#5b6470;font-size:13px}.q{background:#fff6e0;padding:2px 4px;border-radius:4px}
a{color:#1f5fbf}</style></head><body>${body}</body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (!env.DB) return page("<h1>Citizens VCRM activity</h1><p>No database is connected to this Worker yet (binding DB).</p>");
  await ensureTable(env.DB);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const when = (s) => { try { return new Date(s).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) { return s; } };
  const place = (r) => [r.city, r.region, r.country].filter(Boolean).join(", ") || "unknown";
  const device = url.searchParams.get("device");
  const phones = (await env.DB.prepare(`SELECT device, MAX(at) AS last, COUNT(DISTINCT session) AS convs,
      (SELECT name FROM events e2 WHERE e2.device = e.device ORDER BY id DESC LIMIT 1) AS name,
      (SELECT city FROM events e2 WHERE e2.device = e.device ORDER BY id DESC LIMIT 1) AS city,
      (SELECT region FROM events e2 WHERE e2.device = e.device ORDER BY id DESC LIMIT 1) AS region,
      (SELECT country FROM events e2 WHERE e2.device = e.device ORDER BY id DESC LIMIT 1) AS country
    FROM events e GROUP BY device ORDER BY last DESC LIMIT 200`).all()).results;
  const sessions = (await env.DB.prepare(`SELECT session, device, MIN(at) AS start, MAX(name) AS name, MAX(page) AS page, MAX(city) AS city, MAX(region) AS region, MAX(country) AS country
    FROM events ${device ? "WHERE device = ?" : ""} GROUP BY session ORDER BY start DESC LIMIT ${device ? 200 : 50}`).bind(...(device ? [device] : [])).all()).results;
  const ids = sessions.map(s => s.session);
  const rows = ids.length ? (await env.DB.prepare(`SELECT session, at, role, text FROM events WHERE session IN (${ids.map(() => "?").join(",")}) ORDER BY id`).bind(...ids).all()).results : [];
  const mapLinks = t => t.replace(/at (-?\d+\.\d+),(-?\d+\.\d+) \(/g, (m, a, b) => `at <a href="https://maps.google.com/?q=${a},${b}" target="_blank" rel="noopener">${a},${b}</a> (`); // "at 40.12345,-74.56789 (±12 m)" from the app's location switch
  const label = { user: "They said", grok: "Grok", step: "Step", saved: "Saved", start: "Started", end: "Ended", tap: "Tapped", open: "Opened", form: "Form saved", question: "Question for the team", tts: "App voice fetch" };
  let h = `<h1>Citizens VCRM activity</h1><div class="meta">Times are US Eastern. Location is approximate, from the phone's internet connection. Kept ${KEEP_DAYS} days.</div>`;
  const day = (t) => { try { return new Date(t).toLocaleDateString("en-US", { timeZone: "America/New_York" }); } catch (e) { return ""; } };
  const today = day(new Date());
  const recentRows = (await env.DB.prepare("SELECT device, at, name, page, city, region, country FROM events WHERE at >= ? ORDER BY id")
    .bind(new Date(Date.now() - 30 * 3600e3).toISOString()).all()).results.filter(r => day(r.at) === today);
  const todays = {}; recentRows.forEach(r => { const t = todays[r.device] = todays[r.device] || { device: r.device, first: r.at }; Object.assign(t, { last: r.at, name: r.name || t.name, page: r.page, city: r.city, region: r.region, country: r.country }); });
  const tl = Object.values(todays);
  h += `<h2>Today: ${tl.length} device${tl.length === 1 ? "" : "s"}</h2><table><tr><th>Name</th><th>First seen</th><th>Last seen</th><th>Location</th><th>Page</th></tr>`
    + tl.map(t => `<tr><td>${esc(t.name || "no name")}</td><td>${when(t.first)}</td><td>${when(t.last)}</td><td>${esc(place(t))}</td><td>${esc(t.page || "")}</td></tr>`).join("") + "</table>";
  // questions Ara passed to the team (the officer said yes to passing them on)
  const qs = (await env.DB.prepare("SELECT device, name, at, text, city, region, country FROM events WHERE role = 'question' ORDER BY id DESC LIMIT 100").all()).results;
  h += `<h2>Questions for the team (${qs.length})</h2>` + (qs.length ? `<table><tr><th>When</th><th>Name</th><th>Question</th><th>Phone</th></tr>`
    + qs.map(q => `<tr><td>${when(q.at)}</td><td>${esc(q.name || "no name")}</td><td>${esc(q.text)}</td><td><a href="?device=${encodeURIComponent(q.device)}">${esc(String(q.device).slice(0, 8))}</a></td></tr>`).join("") + "</table>"
    : `<p class="meta">None yet. When Ara can't answer something, she offers to pass it on, and it appears here.</p>`);
  h += `<h2>Phones (${phones.length})</h2><table><tr><th>Name</th><th>Last seen</th><th>Conversations</th><th>Location</th><th>Phone ID</th></tr>`
    + phones.map(p => `<tr><td>${esc(p.name || "no name")}</td><td>${when(p.last)}</td><td>${p.convs}</td><td>${esc(place(p))}</td><td><a href="?device=${encodeURIComponent(p.device)}">${esc(String(p.device).slice(0, 8))}</a></td></tr>`).join("") + "</table>";
  h += `<h2>${device ? `Conversations from phone ${esc(device.slice(0, 8))} · <a href="/activity">show all</a>` : "Latest conversations"}</h2>`;
  h += sessions.map(s => `<div class="conv"><div class="meta"><b>${esc(s.name || "no name")}</b> · ${when(s.start)} · ${esc(place(s))} · ${esc(s.page || "")} · phone ${esc(String(s.device).slice(0, 8))}</div>`
    + rows.filter(r => r.session === s.session).map(r => `<div class="r ${r.role === "user" ? "user" : r.role === "grok" ? "grok" : r.role === "step" ? "step" : r.role === "question" ? "q" : "sys"}"><b>${label[r.role] || esc(r.role)}:</b> ${mapLinks(esc(r.text))}</div>`).join("") + "</div>").join("") || "<p>No conversations yet.</p>";
  return page(h);
}
