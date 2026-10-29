// Call-start harness, step 2: how long xAI takes from an open line to Ara's first sound, and which part of the setup costs it.
// Standalone: no app, no browser. Each call mints a pass, opens a line, sends a variant of the app's session configuration
// (config.json, from dump.js), scripts the greeting the way the app does (a force_message item) and times every step. Variants:
//   none    no configuration at all: the floor
//   instr   instructions only
//   tools   tool definitions only
//   full    the app's five session updates, as sent today
//   merged  the same settings in one session update
//   early   the five updates, then the greeting EARLY_MS later (the configuration sent on the warmed line while the phone opens its mic)
//   slim    the five updates with the tool descriptions cut to their first sentence and parameter descriptions dropped
// Calls rotate through the variants so a slow minute at xAI hits them all alike. Costs real money (ARA_CONSISTENCY_KEY): about
// 4 s of line and two items per call. Run: CALLS=8 node tests/call-start/run.js   (FAKE=1 runs against a local stand-in, free)
const fs = require("fs"), path = require("path");
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const KEY = process.env.ARA_CONSISTENCY_KEY, FAKE = process.env.FAKE === "1";
const CALLS = +(process.env.CALLS || 8), JOBS = +(process.env.JOBS || 3), EARLY_MS = +(process.env.EARLY_MS || 1200), CALL_WAIT_MS = 20000;
const VARIANTS = (process.env.VARIANTS || "none,instr,tools,full,merged,early,slim").split(",").map(s => s.trim()).filter(Boolean);
const PER_MIN = 0.08, PER_ITEM = 0.004;
const OUT = path.join(__dirname, "results"); fs.mkdirSync(OUT, { recursive: true });
if (!KEY && !FAKE) { console.error("ARA_CONSISTENCY_KEY is not set"); process.exit(2); }

// ---------- the variants ----------
const main = CFG.updates[0].session, extras = CFG.updates.slice(1).map(u => u.session);
const merge = (a, b) => { const o = Object.assign({}, a); for (const k of Object.keys(b)) o[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) ? merge(o[k], b[k]) : b[k]; return o; };
const firstSentence = (s) => String(s || "").split(/(?<=\.)\s/)[0].slice(0, 160);
const slimTool = (t) => { const o = Object.assign({}, t, { description: firstSentence(t.description) }); if (o.parameters && o.parameters.properties) { const props = {}; for (const [k, v] of Object.entries(o.parameters.properties)) { const q = Object.assign({}, v); delete q.description; props[k] = q; } o.parameters = Object.assign({}, o.parameters, { properties: props }); } return o; };
const PLANS = {
  none: () => ({ updates: [] }),
  instr: () => ({ updates: [{ instructions: main.instructions }] }),
  tools: () => ({ updates: [{ tools: main.tools }] }),
  full: () => ({ updates: [main, ...extras] }),
  merged: () => ({ updates: [[main, ...extras].reduce(merge, {})] }),
  early: () => ({ updates: [main, ...extras], greetAfter: EARLY_MS }),
  slim: () => ({ updates: [Object.assign({}, main, { tools: main.tools.map(slimTool) }), ...extras] }),
};
for (const v of VARIANTS) if (!PLANS[v]) { console.error("unknown variant " + v); process.exit(2); }

// ---------- one call ----------
async function mint() {
  if (FAKE) return "fake";
  const r = await fetch("https://api.x.ai/v1/realtime/client_secrets", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY }, body: JSON.stringify({ expires_after: { seconds: 300 } }) });
  if (!r.ok) throw new Error("mint " + r.status + " " + (await r.text()).slice(0, 160));
  const j = await r.json(); return j.value || (j.client_secret && (j.client_secret.value || j.client_secret));
}
function call(variant, n) {
  const plan = PLANS[variant](), m = { variant, n, at: new Date().toISOString(), updates: plan.updates.length, bytes: plan.updates.reduce((a, u) => a + JSON.stringify({ type: "session.update", session: u }).length, 0), updated: 0, items: 0, events: [] };
  return new Promise(async (resolve) => {
    let t0, ws, done = false, timer; const since = () => Date.now() - t0;
    const finish = (why) => { if (done) return; done = true; clearTimeout(timer); m.end = why; m.lineMs = since(); try { ws.close(); } catch (e) {} resolve(m); };
    try { const tm = Date.now(); const token = await mint(); m.mintMs = Date.now() - tm; t0 = Date.now();
      ws = new WebSocket(FAKE ? process.env.FAKE_URL : "wss://api.x.ai/v1/realtime?model=grok-voice-latest", ["xai-client-secret." + token]);
    } catch (e) { m.error = String(e.message || e); return resolve(m); }
    timer = setTimeout(() => finish("timeout"), CALL_WAIT_MS);
    const send = (o) => { ws.send(JSON.stringify(o)); if (o.type === "conversation.item.create") { m.items++; } };
    const greet = () => { m.greetAt = since(); send({ type: "conversation.item.create", item: { type: "force_message", role: "assistant", content: [{ type: "output_text", text: CFG.greeting }], interruptible: true } }); };
    ws.onopen = () => { m.openMs = since(); plan.updates.forEach(u => send({ type: "session.update", session: u })); m.sentMs = since(); if (plan.greetAfter) setTimeout(greet, plan.greetAfter); else greet(); };
    ws.onerror = () => { m.error = m.error || "socket error"; finish("error"); };
    ws.onclose = (e) => { if (!done) { m.error = m.error || `closed ${e.code} ${e.reason || ""}`.trim(); finish("closed"); } };
    ws.onmessage = (ev) => { let e; try { e = JSON.parse(ev.data); } catch (x) { return; } const t = since(); if (m.events.length < 60) m.events.push([t, e.type]);
      if (e.type === "session.created") m.createdMs = t;
      else if (e.type === "session.updated") { m.updated++; m.updatedMs = t; }
      else if (e.type === "response.created") m.respMs = m.respMs || t;
      else if (/audio\.delta$/.test(e.type)) { if (!m.firstMs) { m.firstMs = t; m.greetToFirstMs = t - m.greetAt; } }
      else if (e.type === "response.done") { m.doneMs = t; finish("done"); }
      else if (e.type === "error") { m.error = JSON.stringify(e.error || e).slice(0, 200); } };
  });
}

// ---------- the run ----------
(async () => {
  const queue = []; for (let i = 0; i < CALLS; i++) for (const v of VARIANTS) queue.push([v, i + 1]);
  const results = []; let k = 0;
  await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => { while (k < queue.length) { const [v, n] = queue[k++]; const m = await call(v, n); results.push(m);
    console.log(`${m.variant.padEnd(6)} #${n} ${m.error ? "ERROR " + m.error : `open ${m.openMs} created ${m.createdMs} updated ${m.updatedMs || "-"} (${m.updated}/${m.updates}) greet ${m.greetAt} first ${m.firstMs || "-"} (greet→first ${m.greetToFirstMs || "-"}) done ${m.doneMs || "-"}`}`); } }));
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  fs.writeFileSync(path.join(OUT, `calls-${stamp}.json`), JSON.stringify({ config: { updates: CFG.updates.length, bytes: CFG.bytes, tools: (main.tools || []).length, instructions: (main.instructions || "").length, earlyMs: EARLY_MS }, results }, null, 1));
  // the table: per variant, the median and worst of each step (ms from the line opening, except greet→first)
  const q = (xs, p) => { const a = xs.filter(x => typeof x === "number").sort((x, y) => x - y); if (!a.length) return "-"; return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1) + 0.5))]; };
  const cell = (xs) => `${q(xs, 0.5)} / ${q(xs, 0.9)}`;
  const rows = VARIANTS.map(v => { const r = results.filter(m => m.variant === v), ok = r.filter(m => !m.error && m.firstMs);
    return `| ${v} | ${r[0] ? r[0].updates : "-"} | ${r[0] ? Math.round(r[0].bytes / 1024) : "-"} KB | ${ok.length}/${r.length} | ${cell(ok.map(m => m.createdMs))} | ${cell(ok.map(m => m.updatedMs))} | ${cell(ok.map(m => m.greetToFirstMs))} | ${cell(ok.map(m => m.firstMs))} |`; });
  const minutes = results.reduce((a, m) => a + (m.lineMs || 0), 0) / 60000, items = results.reduce((a, m) => a + m.items, 0), cost = minutes * PER_MIN + items * PER_ITEM;
  const errs = results.filter(m => m.error).map(m => `${m.variant} #${m.n}: ${m.error}`);
  const md = [`# Call start: xAI timing (${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC)`, "",
    `${CALLS} calls per variant, ${VARIANTS.length} variants, ${JOBS} at a time; early = greeting ${EARLY_MS} ms after the configuration. Config: ${CFG.updates.length} updates, ${Math.round(CFG.bytes.reduce((a, b) => a + b, 0) / 1024)} KB, ${(main.tools || []).length} tools, instructions ${(main.instructions || "").length} chars. Cost about $${cost.toFixed(2)}.`, "",
    "Milliseconds from the line opening, median / 90th percentile. greet→first = from the scripted greeting going out to the first sound back.", "",
    "| variant | updates | sent | ok | session.created | last session.updated | greet→first | first sound |", "|---|---|---|---|---|---|---|---|", ...rows, "",
    errs.length ? "Errors:\n" + errs.map(e => "- " + e).join("\n") : "No errors."].join("\n");
  fs.writeFileSync(path.join(OUT, `report-${stamp}.md`), md); console.log("\nTABLE\n" + md);
})().catch(e => { console.error(e); process.exit(1); });
