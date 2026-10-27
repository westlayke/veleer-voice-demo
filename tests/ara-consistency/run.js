// Ara consistency run: real typed conversations with xAI Grok through the preview build (its real instructions, tools and app logic),
// many times per flow, scored against Ara's rules. Costs real money: it stops itself at BUDGET dollars.
// Run (GitHub Actions, workflow "Ara consistency run"): ARA_CONSISTENCY_KEY=... BUDGET=2 MAX_CONVS=5 node tests/ara-consistency/run.js
// The officer's words are typed (sent as text, plus the transcript event the app sees for speech); Ara still answers in her voice.
// Nothing reaches the activity log or the Cloudflare Worker: the token comes from this script and log posts stay here.
const http = require("http"), fs = require("fs"), path = require("path");
let chromium; try { ({ chromium } = require("playwright")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright")); }
const FLOWS = require("./flows");

// the voice engine (Oct 27, the provider comparison): grok (xAI, the default) or openai; each has its own key and prices
const PROVIDER = process.env.PROVIDER || "grok";
const ENGINES = { grok: { name: "Grok (xAI)", key: "ARA_CONSISTENCY_KEY", host: /api\.x\.ai/, perMin: 0.08 }, openai: { name: "OpenAI (gpt-realtime-2.1)", key: "OPENAI_CONSISTENCY_KEY", host: /api\.openai\.com/, perMin: 0.10 },
  gemini: { name: "Gemini (gemini-3.8-live)", key: "GEMINI_CONSISTENCY_KEY", host: /generativelanguage\.googleapis\.com/, perMin: 0.03 } };
const ENGINE = ENGINES[PROVIDER]; if (!ENGINE) { console.error("PROVIDER must be one of " + Object.keys(ENGINES).join(", ")); process.exit(1); }
const KEY = process.env[ENGINE.key];
const BUDGET = Number(process.env.BUDGET || 2); // dollars for this run
const MAX_CONVS = Number(process.env.MAX_CONVS || 1000);
const JOBS = Number(process.env.JOBS || 3);
const ONLY = process.env.FLOWS ? process.env.FLOWS.split(",") : null;
// xAI prices (Oct 2026): speech to speech per minute of open line, and each conversation.item.create (counted for every item, to be safe)
const PER_MIN = Number(process.env.PER_MIN || ENGINE.perMin), PER_ITEM = Number(process.env.PER_ITEM || 0.004); // OpenAI: about $0.019/min in + $0.077/min out of audio, counted as a flat per-minute rate
const MAX_CONV_MS = 6 * 60000, TURN_WAIT_MS = 25000, MAX_TURNS = 20;
const ROOT = path.resolve(__dirname, "../.."), OUT = path.join(__dirname, "results");

if (!KEY) { console.error(ENGINE.key + " is not set"); process.exit(1); }
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".css": "text/css", ".mp3": "audio/mpeg" };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});
// a silent microphone (Chromium's own pretend one beeps, which Grok would hear as speech)
function silentWav(file) {
  const rate = 48000, secs = 2, n = rate * secs, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  fs.writeFileSync(file, b);
}
// a running score while the job runs (GitHub serves a job's log only once it has finished): one row per conversation in the
// activity log, page "consistency", session = the GitHub run id, text = the numbers; nothing from the conversation but the flow id,
// the saved line (made-up names) and the timings. PROGRESS_LOG=0 turns it off.
async function progress(c, n) {
  if (process.env.PROGRESS_LOG === "0") return;
  const text = JSON.stringify({ n, flow: c.flow, turns: c.turns.length, lineMs: c.lineMs, cost: +c.cost.toFixed(4), firstMs: c.firstMs || [], saved: c.saved.map(s => s.text).join(" | "), failed: !!c.failed, cut: !!c.cut, errors: c.errors.slice(0, 2) });
  await fetch("https://veleer-voice.klaracey.workers.dev/log", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page: "consistency", name: PROVIDER, device: "consistency-" + PROVIDER, session: String(process.env.GITHUB_RUN_ID || "local"), events: [{ at: new Date().toISOString(), role: "progress", text }] }) });
}
async function mintToken() {
  if (PROVIDER === "gemini") { const at = (ms) => new Date(Date.now() + ms).toISOString().replace(/\.\d+Z$/, "Z");
    const g = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY }, body: JSON.stringify({ uses: 1, expireTime: at(10 * 60000), newSessionExpireTime: at(2 * 60000) }) });
    let j = {}; try { j = JSON.parse(await g.text()); } catch (x) {} return { status: g.ok && j.name ? 200 : g.status || 502, body: JSON.stringify(g.ok && j.name ? { value: j.name } : j) }; }
  const r = PROVIDER === "openai"
    ? await fetch("https://api.openai.com/v1/realtime/client_secrets", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY }, body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: 600 }, session: { type: "realtime", model: "gpt-realtime-2.1" } }) })
    : await fetch("https://api.x.ai/v1/realtime/client_secrets", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY }, body: JSON.stringify({ expires_after: { seconds: 300 } }) });
  return { status: r.status, body: await r.text() };
}

// ---------- spending ----------
const lines = new Set(); // every open voice line: { opened, closed }
const spent = () => { let ms = 0; lines.forEach(l => { ms += (l.closed || Date.now()) - l.opened; }); return ms / 60000 * PER_MIN + items * PER_ITEM; };
let items = 0, stopAll = false;

// ---------- one conversation ----------
async function converse(browser, base, flow, n) {
  const conv = { flow: flow.id, n, turns: [], replies: [], tools: [], saved: [], acts: [], errors: [], forced: [], lineMs: 0, items: 0, started: new Date().toISOString() };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, permissions: ["microphone"] });
  await ctx.route(/veleer-voice\.klaracey\.workers\.dev/, async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (u.pathname === "/log") return route.fulfill({ status: 200, contentType: "application/json", body: req.method() === "GET" ? '{"logging":true}' : '{"stored":0}' });
    try { const t = await mintToken(); if (t.status !== 200) conv.errors.push("token " + t.status + " " + t.body.slice(0, 200)); return route.fulfill({ status: t.status, contentType: "application/json", body: t.body }); }
    catch (e) { conv.errors.push("token " + e.message); return route.fulfill({ status: 503, body: "{}" }); }
  });
  const p = await ctx.newPage();
  p.on("pageerror", e => conv.errors.push("page: " + e.message));
  let cur = null, lastFrame = Date.now(); const sentForced = [], convLines = [];
  // every event the app sends or receives, in the app's own event family whatever the engine's wire format (Gemini is translated in the page): taps installed below
  const onSent = (e) => {
      if (e.type === "conversation.item.create") { items++; conv.items++; if (e.item && e.item.type === "force_message") sentForced.push(e.item.content[0].text); if (e.item && e.item.type === "message" && e.item.role === "user") conv.askedAt = Date.now(); }
      if (e.type === "response.create" && e.response && /^Say this now, word for word/.test(e.response.instructions || "")) { const m = e.response.instructions.match(/: "([^]*)"$/); if (m) sentForced.push(m[1]); } /* a scripted line on an engine without force_message */
      if (e.type === "conversation.item.create" && e.item && e.item.type === "function_call_output") conv.tools.length && (conv.tools[conv.tools.length - 1].out = conv.tools[conv.tools.length - 1].out || e.item.output.slice(0, 600));
      if (e.type === "response.create" && e.response && e.response.instructions) { conv.lastGuide = e.response.instructions; const m = e.response.instructions.match(/Left out of the form because the officer never said it: ([^.]*)/); if (m) (conv.leftOut = conv.leftOut || []).push(m[1]); }
  };
  const onGot = (e) => { lastFrame = Date.now();
      if (/audio\.delta$/.test(e.type)) { if (conv.askedAt) { (conv.firstMs = conv.firstMs || []).push(Date.now() - conv.askedAt); conv.askedAt = 0; } return; } /* first sound of the reply, from the officer's words going out: the engine's own latency */
      if (e.type === "response.created") cur = { text: "", at: Date.now(), turn: conv.turns.length, forced: sentForced.length ? sentForced[sentForced.length - 1] : null, forcedN: sentForced.length };
      else if (/transcript\.delta$/.test(e.type) && !/input_audio/.test(e.type) && cur) { (conv.kinds = conv.kinds || {})[e.type] = 1; if (!cur.kind) cur.kind = e.type; if (cur.kind === e.type) cur.text += e.delta || ""; }
      else if (e.type === "response.function_call_arguments.done") { let a = {}; try { a = JSON.parse(e.arguments || "{}"); } catch (x) {} conv.tools.push({ name: e.name, args: a, turn: conv.turns.length, at: Date.now() }); }
      else if (e.type === "response.done") { if (cur) { cur.status = e.response && e.response.status; if (e.response && e.response.usage) cur.usage = e.response.usage; if (cur.text || cur.status !== "cancelled") conv.replies.push(cur); } cur = null; }
      else if (e.type === "error") conv.errors.push("grok: " + JSON.stringify(e.error || e).slice(0, 300));
  };
  await p.exposeFunction("__tap", (dir, s) => { let e; try { e = JSON.parse(s); } catch (x) { return; } if (e && e.type) (dir === "sent" ? onSent : onGot)(e); });
  p.on("websocket", ws => { if (!ENGINE.host.test(ws.url())) return; const line = { opened: Date.now(), closed: 0 }; lines.add(line); convLines.push(line); ws.on("close", () => { line.closed = Date.now(); }); });
  try {
    await p.goto(base + "preview-flow.html"); await p.waitForTimeout(800);
    await p.tap("text=I'd rather type my name"); await p.fill("#wlName", "Dana"); await p.tap("text=Start"); await p.waitForTimeout(600);
    await p.evaluate((prov) => { window.__provider = prov;
      window.__acts = []; const real = act; act = function (role, text, sess) { window.__acts.push({ at: Date.now(), role, text: String(text || "") }); return real.apply(this, arguments); };
      window.__drops = []; const realV = vlog; vlog = function (text) { if (/: dropped |: left out /.test(String(text))) window.__drops.push(String(text)); return realV.apply(this, arguments); }; // the evidence rule's Voice log lines
      const tapSend = (proto) => { const real = proto.send; proto.send = function (d) { try { const t = String(d); if (!t.includes('"input_audio_buffer.append"') && !t.includes('"realtimeInput"')) window.__tap("sent", t); } catch (x) {} return real.call(this, d); }; };
      tapSend(WebSocket.prototype); if (typeof GeminiSocket !== "undefined") tapSend(GeminiSocket.prototype); // what the app sends, as app events (Gemini's raw frames carry no type and are ignored by the tap)
      const realOn = onEvent; onEvent = function (e) { try { window.__tap("got", /audio\.delta$/.test(e.type) ? '{"type":"audio.delta"}' : JSON.stringify(e)); } catch (x) {} return realOn.apply(this, arguments); };
      S.settings.speed = 1.3; S.settings.provider = window.__provider; save(); // Ara talks faster (her words are the same), so each conversation costs less line time
      window.__officer = (text) => {
        send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
        onEvent({ type: "conversation.item.input_audio_transcription.completed", transcript: text }); // what the app sees when speech is transcribed
        setTimeout(() => { if (!G.qCreate && !G.responding && !G.forced && !G.pendingForce) whenIdle("create"); }, 50);
      };
      document.querySelectorAll(".scrim").forEach(s => s.remove());
      startCall(null);
    }, PROVIDER);
    const settle = async () => { // until Ara has finished her turn and the app has nothing more to say
      const t0 = Date.now(); let quietSince = 0;
      while (Date.now() - t0 < TURN_WAIT_MS && !stopAll) {
        await p.waitForTimeout(250);
        const busy = await p.evaluate(() => !!(G.responding || G.qCreate || G.qInstr || G.forced || G.pendingForce || playingLeft() > 0 || /^(Connecting|Reconnecting)/.test(G.status)));
        if (busy || Date.now() - lastFrame < 1200) { quietSince = 0; continue; }
        if (!quietSince) quietSince = Date.now(); if (Date.now() - quietSince > 900) return true;
      }
      return false;
    };
    await settle();
    const script = flow.lines.slice(); let saidNo = 0, doneAt = 0, stepAnswers = 0;
    const savedDone = () => doneAt;
    const t0 = Date.now();
    for (let turn = 0; turn < MAX_TURNS && !stopAll && Date.now() - t0 < MAX_CONV_MS; turn++) {
      const whole = (conv.replies.filter(r => r.text).pop() || { text: "" }).text.trim();
      const sents = whole.split(/(?<=[.?!])\s+/).filter(Boolean);
      const last = sents.pop() || "", tail = sents.slice(-1).concat(last).join(" "); // the officer answers the question Ara ended on (tail = its last two sentences)
      let say;
      if (savedDone()) break;
      if (/substantive/i.test(last) && /\?\s*$/.test(last.trim())) say = flow.subst || "Yes.";
      else if (/\b(save|saving)\b[^.?!]*\?|shall i (save|record)|say yes|is that (right|correct)\?|correct\?|confirm/i.test(last) && !/would you like to (add|fill)/i.test(last)) say = "Yes.";
      else if (/^rate \w+ [A-E]\b.*\?$/i.test(last)) say = "Yes."; // 1.0 confirms a named rating with its own question ("Rate James B, $100k to $250k?")
      else if (/next step|due/i.test(tail) && /\?\s*$/.test(last) && !script.length && stepAnswers++ < 3) say = /when is it due|due date\?$/i.test(last) ? "Today." : /what('s| is| should) the (next )?step/i.test(last) ? "Collect the check from her." : "Yes, collect the check from her, due today."; // 1.0 asks before taking the next step; only when the question itself is about it, and not forever if Ara keeps asking
      else if (/say neither|neither to move on/i.test(whole) && /\?|neither/i.test(last)) say = "Neither.";
      else if (/fill it in,? or move on|or move on\?/i.test(last) && !/^(Let's go with capacity|Add a capacity)/.test(script[0] || "")) { say = "Move on."; saidNo++; }
      else if (/would you like to (add|fill|include)|anything else|want to add|any (other|more) details|optional/i.test(last) && (!script.length || saidNo < 2)) { say = "No."; saidNo++; }
      else if (script.length) say = script.shift();
      else if (!/\?/.test(last) || saidNo > 6) break;
      else { say = "No, that's all for now."; saidNo++; }
      const nBefore = conv.replies.length, at = Date.now();
      conv.turns.push({ say, at, after: last.slice(0, 300) });
      await p.evaluate((t) => window.__officer(t), say);
      const settled = await settle();
      conv.turns[conv.turns.length - 1].heard = conv.replies.slice(nBefore).some(r => r.text);
      conv.turns[conv.turns.length - 1].settled = settled;
      if (flow.saved.test((await p.evaluate(() => window.__acts.filter(a => a.role === "saved").map(a => a.text))).join("\n"))) doneAt = Date.now(); // the task is done: Ara's answer to the save was heard, so hang up
    }
    conv.cut = stopAll;
    conv.hands = await p.evaluate(() => !!G.hands);
    await p.evaluate(() => { try { endCall("test done"); } catch (e) {} });
    await p.waitForTimeout(300);
    conv.acts = await p.evaluate(() => window.__acts.filter(a => a.role !== "tap"));
    conv.drops = await p.evaluate(() => window.__drops || []);
    conv.saved = conv.acts.filter(a => a.role === "saved").map(a => ({ text: a.text, at: a.at }));
  } catch (e) { conv.errors.push("run: " + e.message.slice(0, 300)); }
  conv.forced = sentForced;
  await ctx.close();
  convLines.forEach(l => { if (!l.closed) l.closed = Date.now(); conv.lineMs += l.closed - l.opened; });
  conv.cost = conv.lineMs / 60000 * PER_MIN + conv.items * PER_ITEM;
  return conv;
}

// ---------- scoring against Ara's rules ----------
const sameWords = (s) => String(s).toLowerCase().replace(/[^a-z0-9$ ]/g, " ").replace(/\s+/g, " ").trim();
const scripted = (r, forced) => r.forced && sameWords(r.text).slice(0, 30) && sameWords(r.forced).startsWith(sameWords(r.text).slice(0, 30)) || forced.some(f => sameWords(r.text).length > 10 && sameWords(f).startsWith(sameWords(r.text).slice(0, 30)));
const LABELS = /\b(first name|last name|email|mobile|capacity|entity|campaign|amount|planned (ask )?date|ask type|summary|next step|due( date)?|substantive|method|meeting type|response|type)\b/gi;
const RANGES = /\$?(1(\.0)? ?m(illion)?|250k|100k|25k|5k|1,000,000|250,000|100,000|25,000|5,000)|one million|(two hundred (and )?fifty|one hundred|twenty-five|five) thousand/gi;
const rangeKey = (m) => { m = m.toLowerCase(); return /m|million/.test(m) ? "1m" : /250|fifty/.test(m) ? "250" : /100|hundred/.test(m) ? "100" : /25|twenty/.test(m) ? "25" : "5"; };
const RULES = [
  { id: "hands_free_on", text: "Turns hands-free on when asked" },
  { id: "right_tool", text: "Calls the right tool for the task" },
  { id: "task_saved", text: "The task ends saved (read-back, yes, save)" },
  { id: "no_self_readback", text: "Doesn't read the form back herself (the app does)" },
  { id: "no_invented_rating", text: "No capacity rating the officer didn't give" },
  { id: "no_invented_entity", text: "No entity the officer didn't name" },
  { id: "rating_not_listed", text: "Doesn't list all ratings when the officer named one" },
  { id: "asks_substantive", text: "Substantive asked before an interaction is saved" },
  { id: "no_guidance_aloud", text: "Never speaks the app's guidance aloud" },
  { id: "no_false_saved", text: "Never says saved before the app saved" },
  { id: "replies_every_turn", text: "Answers every officer turn" },
  { id: "no_double_reply", text: "Doesn't say the same thing twice in a row" },
];
function score(conv, flow) {
  const res = {}; const hit = (id, ok, note) => { const r = res[id] = res[id] || { n: 0, broke: 0, notes: [] }; r.n++; if (!ok) { r.broke++; if (note && r.notes.length < 3) r.notes.push(String(note).slice(0, 240)); } };
  const own = conv.replies.filter(r => r.text && !scripted(r, conv.forced));
  const officerUpTo = (turn) => conv.turns.slice(0, turn).map(t => t.say).join(" ");
  hit("hands_free_on", conv.hands, "hands-free was off at the end");
  hit("right_tool", conv.tools.some(t => t.name === flow.tool), "tools called: " + [...new Set(conv.tools.map(t => t.name))].join(", "));
  hit("task_saved", conv.saved.some(s => flow.saved.test(s.text)), "saved: " + conv.saved.map(s => s.text).join(" | "));
  own.forEach(r => { const labels = new Set((r.text.match(LABELS) || []).map(x => x.toLowerCase())); const rb = labels.size >= 4 && /save|right\?|correct\?|all set\?/i.test(r.text) || /here's what i have|let me read|reading (it|that) back|i have:|so far i have/i.test(r.text); hit("no_self_readback", !rb, r.text); });
  conv.tools.forEach(t => {
    const said = officerUpTo(t.turn);
    if (t.args.capacity) hit("no_invented_rating", /\b(capacity|rating|rated)\b|\b[A-E]\b\.?$/i.test(said) || /\b(rating|capacity) (of )?[A-E]\b|\b[A-E] rating\b|with capacity [A-E]/i.test(said), `${t.name} capacity ${t.args.capacity} after: "${said.slice(-160)}"`);
    if (t.args.fund && t.name !== "show_gift_draft") hit("no_invented_entity", /\b(C3|C4|PAC|entity|North Dakota|New Hampshire|Pennsylvania|Idaho|national|America)\b/i.test(said), `${t.name} entity ${t.args.fund} after: "${said.slice(-160)}"`);
  });
  if (flow.rated) own.forEach(r => hit("rating_not_listed", new Set((r.text.match(RANGES) || []).map(rangeKey)).size < 4, r.text));
  if (flow.subst) { const save = conv.saved.find(s => /Interaction report/.test(s.text)); if (save) hit("asks_substantive", conv.replies.some(r => r.at < save.at && /substantive/i.test(r.text)) || conv.forced.some(f => /substantive/i.test(f)), "saved with no substantive question"); }
  own.forEach(r => hit("no_guidance_aloud", !/app guidance|never read it aloud|tool result|the app is saying|still[_ ]needed|function call/i.test(r.text), r.text));
  own.forEach(r => { if (/\b(i've|i have|it's|it is|has been|been|all) (saved|recorded|logged|added)\b|\bsaved it\b/i.test(r.text)) hit("no_false_saved", conv.saved.some(s => s.at <= r.at + 1500) && conv.saved.filter(s => s.at <= r.at + 1500).length > 0 && conv.acts.some(a => a.role === "saved" && a.at <= r.at + 1500 && a.at > r.at - 60000), r.text); });
  conv.turns.forEach(t => hit("replies_every_turn", t.heard, `no reply to "${t.say}"`));
  const heard = conv.acts.filter(a => a.role === "grok"); // what the app played and logged, as the officer heard it
  for (let i = 1; i < heard.length; i++) hit("no_double_reply", sameWords(heard[i - 1].text) !== sameWords(heard[i].text), heard[i].text);
  return res;
}

function table(convs) {
  const tot = {}; convs.forEach(c => Object.entries(c.score || {}).forEach(([id, r]) => { const t = tot[id] = tot[id] || { n: 0, broke: 0, notes: [], flows: {} }; t.n += r.n; t.broke += r.broke; if (r.broke) t.flows[c.flow] = (t.flows[c.flow] || 0) + r.broke; r.notes.forEach(x => t.notes.length < 4 && t.notes.push(`[${c.flow}] ${x}`)); }));
  return RULES.filter(r => tot[r.id]).map(r => ({ rule: r.text, id: r.id, checked: tot[r.id].n, broken: tot[r.id].broke, rate: tot[r.id].n ? Math.round(1000 * tot[r.id].broke / tot[r.id].n) / 10 : 0, flows: tot[r.id].flows, examples: tot[r.id].notes }));
}
const byFlowMsAll = {};
function report(convs, extra) {
  const rows = table(convs), money = (x) => "$" + x.toFixed(2);
  const byFlow = {}; convs.forEach(c => { const f = byFlow[c.flow] = byFlow[c.flow] || { n: 0, saved: 0, cost: 0, min: 0 }; f.n++; f.cost += c.cost; f.min += c.lineMs / 60000; if (c.score && c.score.task_saved && !c.score.task_saved.broke) f.saved++; });
  const fw = convs.flatMap(c => c.firstMs || []).sort((x, y) => x - y), pct = (q) => fw.length ? (fw[Math.min(fw.length - 1, Math.floor(q * fw.length))] / 1000).toFixed(2) + " s" : "n/a";
  let md = `# Ara consistency run: ${ENGINE.name}\n\n${extra}\n\nConversations: ${convs.length}. Estimated cost: ${money(convs.reduce((a, c) => a + c.cost, 0))} (${(convs.reduce((a, c) => a + c.lineMs, 0) / 60000).toFixed(1)} min of open line at $${PER_MIN}/min + ${convs.reduce((a, c) => a + c.items, 0)} items at $${PER_ITEM}).\n\nFirst sound of a reply after the officer's words (${fw.length} turns): median ${pct(0.5)}, 90th percentile ${pct(0.9)}, slowest ${pct(1)}, over 3 s: ${fw.filter(x => x > 3000).length}.\n\n`;
  md += `## Rule breaks\n\n| Rule | Checked | Broken | Rate |\n|---|---:|---:|---:|\n` + rows.map(r => `| ${r.rule} | ${r.checked} | ${r.broken} | ${r.rate}% |`).join("\n") + "\n\n";
  md += `## By flow\n\n| Flow | Conversations | Ended saved | Avg cost | Avg minutes |\n|---|---:|---:|---:|---:|\n` + Object.entries(byFlow).map(([k, f]) => `| ${k} | ${f.n} | ${f.saved} | ${money(f.cost / f.n)} | ${(f.min / f.n).toFixed(2)} |`).join("\n") + "\n\n";
  // reply time by flow: mean, standard deviation, median, 90th percentile (Carverhill, Oct 27: "compare standard deviation on response times too")
  const st = (arr) => { const a = arr.slice().sort((x, y) => x - y), n = a.length; if (!n) return null; const mean = a.reduce((p, q) => p + q, 0) / n, sd = Math.sqrt(a.reduce((p, q) => p + (q - mean) * (q - mean), 0) / n), q = (f) => a[Math.min(n - 1, Math.floor(f * n))]; return { n, mean, sd, med: q(0.5), p90: q(0.9), max: a[n - 1], over3: a.filter(x => x > 3000).length }; };
  const sec = (ms) => (ms / 1000).toFixed(2), rowOf = (k, v) => v ? `| ${k} | ${v.n} | ${sec(v.mean)} | ${sec(v.sd)} | ${sec(v.med)} | ${sec(v.p90)} | ${sec(v.max)} | ${v.over3} |` : `| ${k} | 0 | | | | | | |`;
  const byFlowMs = byFlowMsAll; Object.keys(byFlowMs).forEach(k => delete byFlowMs[k]); convs.forEach(c => { (byFlowMs[c.flow] = byFlowMs[c.flow] || []).push(...(c.firstMs || [])); });
  md += `## Reply time by flow (seconds from the officer's words to the first sound of the reply)\n\n| Flow | Turns | Mean | Std dev | Median | 90th pct | Slowest | Over 3 s |\n|---|---:|---:|---:|---:|---:|---:|---:|\n` + Object.entries(byFlowMs).map(([k, v]) => rowOf(k, st(v))).join("\n") + "\n" + rowOf("**all**", st(convs.flatMap(c => c.firstMs || []))) + "\n\n";
  md += `## Examples of breaks\n\n` + rows.filter(r => r.broken).map(r => `**${r.rule}**\n` + r.examples.map(x => `- ${x.replace(/\n/g, " ")}`).join("\n")).join("\n\n") + "\n";
  return { md, rows, byFlow };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const wav = path.join(OUT, "silence.wav"); silentWav(wav);
  await new Promise(r => server.listen(0, r)); const base = `http://localhost:${server.address().port}/`;
  const args = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-audio-capture=" + wav, "--autoplay-policy=no-user-gesture-required"];
  const browser = await chromium.launch(Object.assign({ args }, process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}));
  const flows = FLOWS.filter(f => !ONLY || ONLY.includes(f.id));
  const convs = []; let started = 0, running = 0, firstLogged = false, fails = 0; const avg = () => { const ok = convs.filter(c => !c.failed); return ok.length ? ok.reduce((a, c) => a + c.cost, 0) / ok.length : Number(process.env.EST || 0.3); };
  const guard = setInterval(() => { if (spent() > BUDGET && !stopAll) { stopAll = true; console.log(`Budget reached ($${spent().toFixed(3)}): stopping`); } }, 1000);
  const half = { said: false };
  async function worker() {
    while (!stopAll && started < MAX_CONVS && spent() + (running + 1) * avg() * 1.1 <= BUDGET) {
      const flow = flows[started % flows.length], n = Math.floor(started / flows.length) + 1; started++; running++;
      const c = await converse(browser, base, flow, n); running--;
      c.failed = !c.replies.some(r => r.text); if (c.cut) console.log(`(conversation ${c.flow} #${c.n} was cut off by the budget and is left out of the scores)`); else if (!c.failed) { c.score = score(c, flow); fails = 0; } else if (++fails >= 3) { stopAll = true; console.log("Three conversations in a row got no answer from Grok: stopping. " + c.errors.slice(0, 2).join("; ")); }
      convs.push(c);
      if (!firstLogged && c.replies.length) { firstLogged = true; console.log("MILESTONE first-grok-reply: " + JSON.stringify(c.replies[0].text.slice(0, 200))); }
      progress(c, convs.length).catch(() => {});
      console.log(`${convs.length}. ${c.flow} #${c.n}: ${c.turns.length} turns, ${(c.lineMs / 1000).toFixed(0)} s, $${c.cost.toFixed(3)}, saved: ${c.saved.map(s => s.text).join(" | ") || "nothing"}${c.errors.length ? ", errors: " + c.errors.slice(0, 2).join("; ") : ""}  [total $${spent().toFixed(3)}]`);
      if (!half.said && spent() >= BUDGET / 2) { half.said = true; console.log(`MILESTONE halfway: ${convs.length} conversations, $${spent().toFixed(3)}`); }
      console.log("TRANSCRIPT " + JSON.stringify({ flow: c.flow, n: c.n, kinds: c.kinds, appSaid: c.acts.filter(a => a.role === "grok").map(a => a.text.slice(0, 200)), turns: c.turns.map(t => t.say), replies: c.replies.map(r => [r.turn, scripted(r, c.forced) ? "S" : "A", r.text.slice(0, 260)]), tools: c.tools.map(t => { let err = ""; try { err = (JSON.parse(t.out || "{}").error || "").slice(0, 220); } catch (x) {} return [t.turn, t.name, JSON.stringify(t.args).slice(0, 200)].concat(err ? ["ERROR: " + err] : []); }), saved: c.saved.map(s => s.text), leftOut: c.leftOut || [], drops: c.drops || [], errors: c.errors.slice(0, 3) }));
      fs.writeFileSync(path.join(OUT, "conversations.json"), JSON.stringify(convs, null, 1));
    }
  }
  await Promise.all(Array.from({ length: JOBS }, worker));
  clearInterval(guard); await browser.close(); server.close();
  const total = spent(), okN = convs.filter(c => !c.failed).length, per = okN ? total / okN : 0;
  const extra = `Budget for this run: $${BUDGET}. Spent (estimate): $${total.toFixed(3)}. Per conversation: $${per.toFixed(3)}, so $2 buys about ${per ? Math.floor(2 / per) : "?"} and $10 about ${per ? Math.floor(10 / per) : "?"} conversations.`;
  const failed = convs.filter(c => c.failed).length;
  const { md, rows, byFlow } = report(convs.filter(c => !c.failed && !c.cut), extra + (failed ? ` ${failed} conversation(s) got no answer from Grok and are left out of the scores.` : ""));
  fs.writeFileSync(path.join(OUT, "summary.md"), md);
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ budget: BUDGET, spent: total, perConversation: per, conversations: convs.length, rows, byFlow }, null, 1));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log("\n===== SUMMARY =====\n" + md + "===== END SUMMARY =====");
  console.log("SUMMARY_JSON " + JSON.stringify({ provider: PROVIDER, firstMs: convs.flatMap(c => c.firstMs || []), firstByFlow: byFlowMsAll, spent: total, per, n: convs.length, rows: rows.map(r => [r.id, r.checked, r.broken]), byFlow }));
})().catch(e => { console.error(e); process.exit(1); });
