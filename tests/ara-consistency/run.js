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
const DIAG = process.env.DIAG === "1"; // print every conversation's voice log (VOICELOG lines) for a diagnostic run
// SPOKEN=1 (Oct 27): the officer's lines are played into the app's microphone as speech (a second Grok voice, see officer-voice.js) instead
// of typed, so the engine's own speech recognition and turn detection are in the run; NOISE=<gain> mixes a car-like noise under the voice
// (0.1 is about a car at speed; 0 = quiet). The reply time then runs from the end of the officer's speech to the first sound of the reply.
const SPOKEN = process.env.SPOKEN === "1", NOISE = SPOKEN ? Number(process.env.NOISE || 0) : 0, OFFICER_VOICE = process.env.OFFICER_VOICE || "rex";
const { officerAudio } = require("./officer-voice");
// TURN='{"threshold":0.7,"silence_duration_ms":600}' tries turn-detection settings (the app's window.__turn), MIC_HP=<Hz> a high-pass filter on the mic
// (window.__micHp): both for the car-noise question of Oct 28 (Grok's reply time doubled in noise). Blank = the app's own defaults.
const TURN = process.env.TURN ? JSON.parse(process.env.TURN) : null, MIC_HP = Number(process.env.MIC_HP || 0);
// FAULTS=<rate> (Oct 29, Carverhill: "add those to the real grok run"): cellular drops at Patient Pat's rates times this number (0 = none). A drop
// takes the phone offline and closes the voice line, before the officer speaks or a little into Ara's reply; a dead spot keeps it offline
// 10-70 s, a plain drop 0.3-3 s. Seeded per conversation, so a rerun of the same run gets the same drops.
// A quiet mic (Carverhill: "we should be able to simulate mic going quiet"): the officer's line plays into the microphone at no volume, as when the
// phone mutes the mic in a dead spot or behind a dialog; the officer waits 4-10 s for an answer, then says the line again out loud.
// SOUNDLESS=<rate> (Oct 30, Carverhill: "run 10 real Ara calls where you simulate the fault / try the technique"): that share of Ara's replies while a scripted line is pending
// (and half that share of her other replies) reach the app as words with no sound, as in his 12:45 PM call; on half of those the sound (a copy of the whole reply, with its words) arrives 4-20 s later.
// DROP_AFTER_SAVE=<rate>: that share of saves is followed 2.5-5.5 s later by a drop (his 10:36 AM call), so Ara has to say where we were.
const SOUNDLESS = Number(process.env.SOUNDLESS || 0), DROP_AFTER_SAVE = Number(process.env.DROP_AFTER_SAVE || 0);
const FAULTS = Number(process.env.FAULTS || 0), FAULT_RATES = { drop: 0.025 /* per turn */, deadspot: 0.35 /* of drops */, quietMic: 0.025 /* per turn */ };
const RECORD = SPOKEN ? Number(process.env.RECORD == null ? 1 : process.env.RECORD) : 0; // spoken runs: keep the first RECORD conversations of each flow as a sound clip (officer, Ara, noise) with a transcript, to listen to end to end
const { execFileSync } = require("child_process");
const ANSWERS = ["Yes.", "No.", "Move on.", "Neither.", "No, that's all for now.", "Today.", "Collect the check from her.", "Yes, collect the check from her, due today.", "Yes, it was."]; // every line the pretend officer can answer with, besides the flows' own
const ENGINES = { grok: { name: "Grok (xAI)", key: "ARA_CONSISTENCY_KEY", host: /api\.x\.ai/, perMin: 0.08 }, openai: { name: "OpenAI (gpt-realtime-2.1)", key: "OPENAI_CONSISTENCY_KEY", host: /api\.openai\.com/, perMin: 0.10 },
  gemini: { name: "Gemini (gemini-3.8-live)", key: "GEMINI_CONSISTENCY_KEY", host: /generativelanguage\.googleapis\.com/, perMin: 0.03 } };
const ENGINE = ENGINES[PROVIDER]; if (!ENGINE) { console.error("PROVIDER must be one of " + Object.keys(ENGINES).join(", ")); process.exit(1); }
const KEY = process.env[ENGINE.key], XAI_KEY = process.env.ARA_CONSISTENCY_KEY; // the officer's voice is always xAI's, whatever engine Ara runs on
const BUDGET = Number(process.env.BUDGET || 2); // dollars for this run
const MAX_CONVS = Number(process.env.MAX_CONVS || 1000);
const JOBS = Number(process.env.JOBS || 3);
const ONLY = process.env.FLOWS ? process.env.FLOWS.split(",") : null;
// xAI prices (Oct 2026): speech to speech per minute of open line, and each conversation.item.create (counted for every item, to be safe)
const PER_MIN = Number(process.env.PER_MIN || ENGINE.perMin), PER_ITEM = Number(process.env.PER_ITEM || 0.004); // OpenAI: about $0.019/min in + $0.077/min out of audio, counted as a flat per-minute rate
const MAX_CONV_MS = 6 * 60000, TURN_WAIT_MS = 25000, MAX_TURNS = 20, DOWN_WAIT_MS = 100000; // DOWN_WAIT_MS: how long the officer waits for a line that dropped (FAULTS)
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
  // the Worker takes a POST only from the app's own address with the built-in demo code (the same two the phone sends)
  await fetch("https://veleer-voice.klaracey.workers.dev/log", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://westlayke.github.io", "X-Demo-Code": "veleer2026" },
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
let voices = {}; // officer line -> 24 kHz PCM, in spoken mode
async function converse(browser, base, flow, n) {
  const conv = { flow: flow.id, n, turns: [], replies: [], tools: [], saved: [], acts: [], errors: [], forced: [], faults: [], lineMs: 0, items: 0, started: new Date().toISOString() };
  let rnd = (() => { let a = 0; for (const ch of flow.id + "#" + n) a = (a * 31 + ch.charCodeAt(0)) >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
  let offline = false; // during a simulated drop: the phone has no network at all, so a token request fails too
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, permissions: ["microphone"] });
  await ctx.route(/veleer-voice\.klaracey\.workers\.dev/, async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (offline) return route.abort("internetdisconnected");
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
      if (/audio\.delta$/.test(e.type)) { if (cur) cur.audioN = (cur.audioN || 0) + 1; if (conv.askedAt) { (conv.firstMs = conv.firstMs || []).push(Date.now() - conv.askedAt); conv.askedAt = 0; } return; } /* first sound of the reply, from the officer's words going out: the engine's own latency */
      if (e.type === "response.created") cur = { text: "", at: Date.now(), turn: conv.turns.length, forced: sentForced.length ? sentForced[sentForced.length - 1] : null, forcedN: sentForced.length };
      else if (/transcript\.delta$/.test(e.type) && !/input_audio/.test(e.type) && cur) { (conv.kinds = conv.kinds || {})[e.type] = 1; if (!cur.kind) cur.kind = e.type; if (cur.kind === e.type) cur.text += e.delta || ""; }
      else if (e.type === "response.function_call_arguments.done") { let a = {}; try { a = JSON.parse(e.arguments || "{}"); } catch (x) {} conv.tools.push({ name: e.name, args: a, turn: conv.turns.length, at: Date.now() }); if (cur) cur.tool = true; }
      else if (e.type === "response.done") { if (cur) { cur.status = e.response && e.response.status; if (e.response && e.response.usage) cur.usage = e.response.usage; if (cur.text || (cur.status !== "cancelled" && !cur.tool)) conv.replies.push(cur); } cur = null; } /* a reply that only called a tool is not a wordless reply (OpenAI calls the tool first, then speaks in the next one) */
      else if (e.type === "error") conv.errors.push("grok: " + JSON.stringify(e.error || e).slice(0, 300));
      else if (/input_audio_transcription\.completed$/.test(e.type) && conv.turns.length) { const t = conv.turns[conv.turns.length - 1]; t.heardText = (t.heardText ? t.heardText + " " : "") + (e.transcript || ""); } /* the engine's own transcript of the officer's speech (spoken runs) */
  };
  await p.exposeFunction("__tap", (dir, s) => { let e; try { e = JSON.parse(s); } catch (x) { return; } if (e && e.type) (dir === "sent" ? onSent : onGot)(e); });
  p.on("websocket", ws => { if (!ENGINE.host.test(ws.url())) return; const line = { opened: Date.now(), closed: 0 }; lines.add(line); convLines.push(line); ws.on("close", () => { line.closed = Date.now(); }); });
  try {
    await p.goto(base + "preview-flow.html"); await p.waitForTimeout(800);
    await p.tap("text=I'd rather type my name"); await p.fill("#wlName", "Dana"); await p.tap("text=Start"); await p.waitForTimeout(600);
    await p.evaluate(({ prov, spoken, noise, turn, micHp, plan }) => { window.__provider = prov; if (turn) window.__turn = turn; if (micHp) window.__micHp = micHp;
      if (spoken) { // the microphone is a stream this script plays the officer's lines into (plus a steady noise), through the app's own capture path
        const mctx = new AudioContext({ sampleRate: 24000 }), dst = mctx.createMediaStreamDestination();
        if (noise > 0) { const n = mctx.createBuffer(1, 24000 * 4, 24000), d = n.getChannelData(0); let last = 0, sq = 0; for (let i = 0; i < d.length; i++) { last = 0.97 * last + 0.03 * (Math.random() * 2 - 1); d[i] = last; sq += last * last; }
          const rms = Math.sqrt(sq / d.length); for (let i = 0; i < d.length; i++) d[i] = d[i] / rms * 0.3; /* a dull, car-like rumble, normalised so NOISE is its level: 0.1 = rms 0.03 */
          const src = mctx.createBufferSource(); src.buffer = n; src.loop = true; const g = mctx.createGain(); g.gain.value = noise; src.connect(g).connect(dst); src.start(); }
        window.__mic = { ctx: mctx, dst, played: 0 }; window.__ara = []; // Ara's audio as it arrives, kept for the clip: [at, base64 pcm] with [at, null] marking each new reply
        navigator.mediaDevices.getUserMedia = async () => dst.stream;
        window.__speak = (b64, gain) => new Promise((res) => { mctx.resume(); const bin = atob(b64), n = bin.length >> 1, buf = mctx.createBuffer(1, n, 24000), d = buf.getChannelData(0);
          for (let i = 0; i < n; i++) { const v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); d[i] = (v >= 0x8000 ? v - 0x10000 : v) / 32768; }
          const s = mctx.createBufferSource(); s.buffer = buf; const g = mctx.createGain(); g.gain.value = gain == null ? 1 : gain; s.connect(g).connect(dst); s.onended = () => { window.__mic.played++; res(n / 24); }; s.start(); }); /* gain 0: a quiet mic (FAULTS) */
      }
      window.__acts = []; const real = act; act = function (role, text, sess) { window.__acts.push({ at: Date.now(), role, text: String(text || "") }); return real.apply(this, arguments); };
      window.__forms = []; const realSave = saveDraft; saveDraft = function () { try { if (typeof V !== "undefined" && V && V.data) window.__forms.push(Object.assign({}, readDraft())); } catch (x) {} return realSave.apply(this, arguments); }; /* the form as saved: fields the app filled itself (an optional answer, a pick-list from the officer's answer) never pass through Grok's arguments */
      window.__drops = []; window.__vlog = []; const vt0 = Date.now(); const realV = vlog; vlog = function (text) { if (/: dropped |: left out /.test(String(text))) window.__drops.push(String(text)); if (window.__vlog.length < 900) window.__vlog.push(((Date.now() - vt0) / 1000).toFixed(1) + " " + String(text).slice(0, 220)); return realV.apply(this, arguments); }; // the evidence rule's Voice log lines, and the whole voice log for a diagnostic run (DIAG=1)
      const tapSend = (proto) => { const real = proto.send; proto.send = function (d) { try { const t = String(d); if (!t.includes('"input_audio_buffer.append"') && !t.includes('"realtimeInput"')) window.__tap("sent", t); } catch (x) {} return real.call(this, d); }; };
      tapSend(WebSocket.prototype); if (typeof GeminiSocket !== "undefined") tapSend(GeminiSocket.prototype); // what the app sends, as app events (Gemini's raw frames carry no type and are ignored by the tap)
      const realOn = onEvent; onEvent = function (e) { try { if (window.__ara && (e.type === "response.created" || /audio\.delta$/.test(e.type) && e.delta)) window.__ara.push([Date.now(), e.type === "response.created" ? null : e.delta]); window.__tap("got", /audio\.delta$/.test(e.type) ? '{"type":"audio.delta"}' : JSON.stringify(e)); } catch (x) {} return realOn.apply(this, arguments); };
      if (plan) { // SOUNDLESS: a reply reaches the app as words only; its sound comes later as a whole copy, or never (the app has to ask for it)
        window.__soundless = []; let mute = null, drawn = 0;
        const prevOn = onEvent; onEvent = function (e) {
          if (e && !e.__copy) {
            if (e.type === "response.created") { const forced = !!(G.forced || G.pendingForce); const d = plan.draw[drawn++], ft = (G.forced && G.forced.text) || G.pendingForce || "", again = forced && window.__soundless.some(m => m.forcedText && m.forcedText === ft && Date.now() - m.at < 60000); mute = !again && d != null && d < (forced ? plan.rate : plan.rate / 2) ? { id: e.response && e.response.id, forced, forcedText: ft, events: [], text: "", at: Date.now(), late: plan.late[drawn % plan.late.length], delay: plan.delay[drawn % plan.delay.length], audioN: 0 } : null; if (mute) window.__soundless.push(mute); }
            if (mute) { mute.events.push(e); if (/audio_transcript\.delta$/.test(e.type)) mute.text += e.delta || ""; if (/audio\.delta$/.test(e.type)) { mute.audioN++; return; } /* the sound is withheld */
              if (e.type === "response.done") { const m = mute; mute = null; m.doneAt = Date.now(); if (!m.audioN) { m.late = false; m.skipped = true; } /* a reply with no sound of its own (a tool call) is nothing to withhold */
                else if (m.late) setTimeout(() => { m.copyAt = Date.now(); m.events.forEach(x => { const c = Object.assign({}, x, { __copy: true }); onEvent(c); }); }, m.delay); } }
          }
          return prevOn.apply(this, arguments); };
      }
      S.settings.speed = spoken ? 1 : 1.3; S.settings.provider = window.__provider; save(); // typed runs: Ara talks faster (her words are the same) so each conversation costs less line time; spoken runs keep her normal speed, so the clips sound as the officer would hear them (Gemini ignores the setting either way)
      window.__officer = (text) => {
        send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
        onEvent({ type: "conversation.item.input_audio_transcription.completed", transcript: text }); // what the app sees when speech is transcribed
        setTimeout(() => { if (!G.qCreate && !G.responding && !G.forced && !G.pendingForce) whenIdle("create"); }, 50);
      };
      document.querySelectorAll(".scrim").forEach(s => s.remove());
      startCall(null);
    }, { prov: PROVIDER, spoken: SPOKEN, noise: NOISE, turn: TURN, micHp: MIC_HP, plan: SOUNDLESS ? { rate: SOUNDLESS, draw: Array.from({ length: 60 }, () => rnd()), late: Array.from({ length: 7 }, () => rnd() < 0.5), delay: Array.from({ length: 7 }, () => 4000 + Math.round(rnd() * 16000)) } : null });
    conv.record = SPOKEN && n <= RECORD; if (!conv.record) await p.evaluate(() => { window.__ara = null; });
    const t0 = Date.now();
    const drop = async (when) => { // a cellular drop: offline, line closed, back after downMs; recovery = the first reply sound after the network is back
      const dead = rnd() < FAULT_RATES.deadspot, downMs = dead ? 10000 + Math.round(rnd() * 60000) : 300 + Math.round(rnd() * 2700);
      const f = { at: Date.now() - t0, kind: dead ? "dead spot" : "drop", when, downMs, repliesBefore: conv.replies.length }; conv.faults.push(f);
      offline = true; await ctx.setOffline(true);
      await p.evaluate(() => { try { G.ws && G.ws.close(); } catch (e) {} }).catch(() => {});
      await p.waitForTimeout(downMs);
      offline = false; await ctx.setOffline(false); f.backAt = Date.now();
      await p.evaluate(() => window.dispatchEvent(new Event("online"))).catch(() => {});
    };
    const settle = async () => { // until Ara has finished her turn and the app has nothing more to say
      const t0 = Date.now(); let quietSince = 0;
      while ((Date.now() - t0 < TURN_WAIT_MS || offline || Date.now() - t0 < DOWN_WAIT_MS && await p.evaluate(() => /^(Connecting|Reconnecting)/.test(G.status) || !!G.downAt).catch(() => false)) && !stopAll) { // after a drop the officer waits for the line, as a real one would
        await p.waitForTimeout(250);
        const busy = await p.evaluate(() => !!(G.responding || G.qCreate || G.qInstr || G.forced || G.pendingForce || playingLeft() > 0 || /^(Connecting|Reconnecting|Thinking)/.test(G.status)));
        if (busy || Date.now() - lastFrame < 1200) { quietSince = 0; continue; }
        if (!quietSince) quietSince = Date.now(); if (Date.now() - quietSince > 900) return true;
      }
      return false;
    };
    await settle();
    const script = flow.lines.slice(); let saidNo = 0, doneAt = 0, stepAnswers = 0;
    const savedDone = () => doneAt;
    for (let turn = 0; turn < MAX_TURNS && !stopAll && Date.now() - t0 < MAX_CONV_MS; turn++) {
      if (SOUNDLESS) { const t1 = Date.now(); while (Date.now() - t1 < 45000 && !stopAll) { const last = conv.replies.filter(r => r.text).pop(); if (!last || (last.audioN || 0) >= 3) break; await p.waitForTimeout(500); } if (Date.now() - t1 > 1000) await settle(); } // a line that came as words only is not heard: the officer waits for its sound (the late copy, or the app's resend), as a real one would
      const whole = (conv.replies.filter(r => r.text && (!SOUNDLESS || (r.audioN || 0) >= 3)).pop() || { text: "" }).text.trim();
      const sents = whole.split(/(?<=[.?!])\s+/).filter(Boolean);
      const last = sents.pop() || "", tail = sents.slice(-1).concat(last).join(" "); // the officer answers the question Ara ended on (tail = its last two sentences)
      let say;
      if (savedDone()) break;
      if (/say that again|lost you for a moment\.\s*$|didn't catch (that|your answer)|repeat what you said/i.test(last) && conv.turns.length) say = conv.turns[conv.turns.length - 1].say; // after a drop the app asks the officer to repeat: they say their last line again (the probe at FAULTS 30 ended three calls on "No, that's all for now")
      else if (/substantive/i.test(last) && /\?\s*$/.test(last.trim())) say = flow.subst || "Yes.";
      else if (/^Which one: /i.test(last)) say = last.replace(/^Which one: /i, "").split(/,|\?/)[0].trim() + "."; // the app's two-to-five-way entity question (Oct 29): the first one named
      else if (/\b(save|saving)\b[^.?!]*\?|shall i (save|record)|say yes|is that (right|correct)\?|correct\?|confirm/i.test(last) && !/would you like to (add|fill)/i.test(last)) say = "Yes.";
      else if (/^rate \w+ [A-E]\b.*\?$/i.test(last)) say = "Yes."; // 1.0 confirms a named rating with its own question ("Rate James B, $100k to $250k?")
      else if (/next step|due/i.test(tail) && /\?\s*$/.test(last) && !script.length && stepAnswers++ < 3) say = /when is it due|due date\?$/i.test(last) ? "Today." : /what('s| is| should) the (next )?step/i.test(last) ? "Collect the check from her." : "Yes, collect the check from her, due today."; // 1.0 asks before taking the next step; only when the question itself is about it, and not forever if Ara keeps asking
      else if (/say neither|neither to move on/i.test(whole) && /\?|neither/i.test(last)) say = "Neither.";
      else if (/fill it in,? or move on|or move on\?/i.test(last) && !/^(Let's go with capacity|Add a capacity)/.test(script[0] || "")) { say = "Move on."; saidNo++; }
      else if (/would you like to (add|fill|include)|anything else|want to add|any (other|more) details|optional/i.test(last) && (!script.length || saidNo < 2)) { say = "No."; saidNo++; }
      else if (script.length) say = script.shift();
      else if (!/\?/.test(last) || saidNo > 6) break;
      else { say = "No, that's all for now."; saidNo++; }
      if (!await p.evaluate(() => G.live)) { conv.errors.push("call ended: " + (await p.evaluate(() => (window.__acts.filter(a => a.role === "end").pop() || { text: "?" }).text)).slice(0, 160)); break; } // nobody to talk to (Oct 27 7:03 PM run: three calls ended at once with "couldn't connect" and the officer went on talking for two minutes)
      const nBefore = conv.replies.length, at = Date.now();
      if (FAULTS && rnd() < FAULT_RATES.drop * FAULTS && rnd() < 0.5) { await drop("before the officer's words"); await settle(); continue; } // the line goes while the officer is about to speak: they wait for it, then answer whatever Ara says next
      const midReply = FAULTS && rnd() < FAULT_RATES.drop * FAULTS; // the other half: a little into Ara's reply (a read-back, a question)
      if (midReply) setTimeout(() => { if (!stopAll) drop("during Ara's reply"); }, 1500 + Math.round(rnd() * 3000));
      conv.turns.push({ say, at, after: last.slice(0, 300) });
      if (SPOKEN) { // the line plays into the microphone; the engine hears it, decides when the officer has finished and answers on its own
        const pcm = voices[say]; if (!pcm) { conv.errors.push("no voice for: " + say); break; }
        if (FAULTS && rnd() < FAULT_RATES.quietMic * FAULTS) { // the mic is quiet: the line goes in silently, the officer waits, then says it again
          const f = { at: Date.now() - t0, kind: "quiet mic", when: "the officer's words", downMs: 0, repliesBefore: conv.replies.length }; conv.faults.push(f);
          await p.evaluate((b) => window.__speak(b, 0), pcm.toString("base64")); const wait = 4000 + Math.round(rnd() * 6000); await p.waitForTimeout(wait);
          f.backAt = Date.now(); f.downMs = f.backAt - (f.at + t0); f.meanwhile = (await p.evaluate(() => window.__acts.filter(a => a.role === "grok").map(a => [a.at, a.text]))).filter(([a]) => a > f.at + t0).map(([, x]) => x).join(" | ").slice(0, 300); }
        if (conv.record) (conv.officer = conv.officer || []).push({ at: Date.now(), text: say, pcm });
        const ms = await p.evaluate((b) => window.__speak(b), pcm.toString("base64"));
        conv.askedAt = Date.now(); conv.turns[conv.turns.length - 1].spokenMs = Math.round(ms);
        await p.waitForTimeout(1500); // the engine's silence wait before it decides the officer has finished
      } else await p.evaluate((t) => window.__officer(t), say);
      const settled = await settle();
      conv.turns[conv.turns.length - 1].heard = conv.replies.slice(nBefore).some(r => r.text);
      conv.turns[conv.turns.length - 1].settled = settled;
      if (DROP_AFTER_SAVE && !stopAll) { const saves = await p.evaluate(() => window.__acts.filter(a => a.role === "saved").map(a => a.at)); const s = saves[saves.length - 1];
        if (s && s > at && rnd() < DROP_AFTER_SAVE) { const wait = s + 2500 + Math.round(rnd() * 3000) - Date.now(); if (wait > 0) await p.waitForTimeout(wait); await drop("after a save"); await settle(); } } // the line goes right after a save (Carverhill's 10:36 AM call): Ara should say where we were
      if (flow.saved.test((await p.evaluate(() => window.__acts.filter(a => a.role === "saved").map(a => a.text))).join("\n"))) doneAt = Date.now(); // the task is done: Ara's answer to the save was heard, so hang up
    }
    conv.cut = stopAll;
    if (conv.record) { await p.waitForTimeout(1500); conv.araAudio = await p.evaluate(() => window.__ara || []); conv.endAt = Date.now(); } /* Ara's last words */
    conv.hands = await p.evaluate(() => !!G.hands);
    conv.sync = await p.evaluate(() => { const s = G.sync || { sent: 0, confirmed: 0, ms: [], missed: 0, resent: 0, guards: {}, guardsAfterReceipt: 0 }; const ms = s.ms.slice().sort((a, b) => a - b); return { sent: s.sent, confirmed: s.confirmed, medianMs: ms.length ? ms[Math.floor(ms.length / 2)] : 0, maxMs: ms.length ? ms[ms.length - 1] : 0, missed: s.missed, resent: s.resent, guards: s.guards, guardsAfterReceipt: s.guardsAfterReceipt }; }).catch(() => null); /* Ara's state sync and the guards (Carverhill, Oct 29) */
    await p.evaluate(() => { try { endCall("test done"); } catch (e) {} });
    await p.waitForTimeout(300);
    conv.acts = await p.evaluate(() => window.__acts.filter(a => a.role !== "tap"));
    conv.forms = await p.evaluate(() => window.__forms || []);
    conv.drops = await p.evaluate(() => window.__drops || []);
    conv.soundless = (await p.evaluate(() => (window.__soundless || []).map(m => ({ id: m.id, forced: m.forced, text: m.text, at: m.at, doneAt: m.doneAt, late: m.late, delay: m.delay, copyAt: m.copyAt, skipped: m.skipped, audioN: m.audioN })))).filter(m => !m.skipped);
    conv.faults.forEach(f => { if (!f.backAt) return; const next = conv.replies.find(r => r.at > f.backAt); f.recoverMs = next ? next.at - f.backAt : null; f.lostLine = !!next && /lost you|line dropped|reconnect/i.test(next.text); const heard = conv.acts.filter(a => a.role === "grok" && a.at > f.backAt).slice(0, 2).map(a => a.text); f.said = heard.join(" | ").slice(0, 300); }); // what the officer heard first once the network was back
    if (DIAG) conv.vlog = await p.evaluate(() => window.__vlog || []);
    // the engine closing the line with a reason (code 1011 "prepayment credits are depleted" on Gemini, Oct 28, which two runs reported only as "no answer") is an error of this conversation
    (await p.evaluate(() => (window.__vlog || []).filter(l => /Voice line closed \(code (?!1000\b)\d+/.test(l)))).slice(0, 2).forEach(l => conv.errors.push("line: " + l.replace(/^.*Voice line closed /, "").slice(0, 200)));
    conv.saved = conv.acts.filter(a => a.role === "saved").map(a => ({ text: a.text, at: a.at }));
  } catch (e) { conv.errors.push("run: " + e.message.slice(0, 300)); }
  conv.forced = sentForced;
  await ctx.close();
  convLines.forEach(l => { if (!l.closed) l.closed = Date.now(); conv.lineMs += l.closed - l.opened; });
  conv.cost = conv.lineMs / 60000 * PER_MIN + conv.items * PER_ITEM;
  return conv;
}

// ---------- the clip: officer, Ara and the noise on one timeline (spoken runs, the first conversation of each flow) ----------
const CLIP_RATE = 24000, CLIPS = path.join(OUT, "clips");
const FFMPEG = (() => { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return "ffmpeg"; } catch (e) { return null; } })();
function writeClip(conv) {
  if (!conv.record || !(conv.officer || []).length) return null;
  const replies = []; let cur = null; // Ara's audio grouped per reply: [at, null] starts one, chunks follow
  (conv.araAudio || []).forEach(([at, d]) => { if (d == null) { cur = { at: 0, chunks: [] }; replies.push(cur); return; } if (!cur) { cur = { at: 0, chunks: [] }; replies.push(cur); } if (!cur.at) cur.at = at; cur.chunks.push(Buffer.from(d, "base64")); });
  const ara = replies.filter(r => r.at && r.chunks.length).map(r => ({ at: r.at, pcm: Buffer.concat(r.chunks) }));
  const t0 = Math.min(...conv.officer.map(o => o.at), ...ara.map(a => a.at)) - 500, end = (conv.endAt || Date.now()) + 300;
  const total = Math.ceil((end - t0) / 1000 * CLIP_RATE), out = new Float32Array(total);
  const put = (pcm, atMs, gain, untilMs) => { let n = pcm.length >> 1; if (untilMs) n = Math.min(n, Math.max(0, Math.floor((untilMs - atMs) / 1000 * CLIP_RATE))); const o = Math.floor((atMs - t0) / 1000 * CLIP_RATE); for (let i = 0; i < n && o + i < total; i++) if (o + i >= 0) out[o + i] += pcm.readInt16LE(i * 2) / 32768 * gain; };
  if (NOISE > 0) { let last = 0, sq = 0; const nz = new Float32Array(total); for (let i = 0; i < total; i++) { last = 0.97 * last + 0.03 * (Math.random() * 2 - 1); nz[i] = last; sq += last * last; } const rms = Math.sqrt(sq / total); for (let i = 0; i < total; i++) out[i] += nz[i] / rms * 0.3 * NOISE; } /* the same rumble the engine heard under the officer */
  conv.officer.forEach(o => put(o.pcm, o.at, 0.9));
  ara.forEach((a, i) => { const next = ara[i + 1], cut = next && next.at < a.at + a.pcm.length / 2 / CLIP_RATE * 1000 ? next.at : 0; put(a.pcm, a.at, 1, cut); }); /* a reply still playing when the next starts is cut there, as the app cuts it */
  let peak = 0; for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0.98 ? 0.98 / peak : 1, wav = Buffer.alloc(44 + total * 2);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + total * 2, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(CLIP_RATE, 24); wav.writeUInt32LE(CLIP_RATE * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(total * 2, 40);
  for (let i = 0; i < total; i++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i] * g)) * 32767), 44 + i * 2);
  fs.mkdirSync(CLIPS, { recursive: true });
  const name = `${PROVIDER}-${conv.flow}-${conv.n}-${NOISE ? "car-noise" : "quiet"}`, wavFile = path.join(CLIPS, name + ".wav");
  fs.writeFileSync(wavFile, wav);
  let file = wavFile;
  if (FFMPEG) { try { execFileSync(FFMPEG, ["-v", "error", "-y", "-i", wavFile, "-codec:a", "libmp3lame", "-b:a", "48k", path.join(CLIPS, name + ".mp3")]); fs.unlinkSync(wavFile); file = path.join(CLIPS, name + ".mp3"); } catch (e) { console.log("clip: ffmpeg failed, keeping the wav: " + String(e.message).split("\n")[0]); } }
  const stamp = (at) => { const s = (at - t0) / 1000; return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`; };
  const pieces = conv.officer.map(o => ({ at: o.at, who: "Officer", text: o.text })).concat(conv.replies.filter(r => r.text).map(r => ({ at: r.at, who: "Ara", text: r.text.trim() }))).sort((a, b) => a.at - b.at);
  const md = `# ${ENGINE.name}: ${conv.flow} #${conv.n} (${NOISE ? "car noise " + NOISE : "quiet"})\n\nRecorded ${conv.started}; ${(total / CLIP_RATE).toFixed(0)} s. The officer is Grok's ${OFFICER_VOICE} voice; Ara's replies are the engine's own audio as the app received it. Saved: ${conv.saved.map(s => s.text).join(" | ") || "nothing"}.\n\n| Time | Who | Said |\n|---|---|---|\n` + pieces.map(x => `| ${stamp(x.at)} | ${x.who} | ${x.text.replace(/\|/g, "/").replace(/\n/g, " ")} |`).join("\n") + "\n";
  fs.writeFileSync(path.join(CLIPS, name + ".md"), md);
  return path.basename(file);
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
  { id: "heard_right", text: "Fields reach the form as the officer said them (names, emails, amounts)" },
  { id: "state_honoured", text: "Acts on the state she was given (no guard fired after a confirmed receipt)" },
  { id: "step_yes_opens", text: "A yes to the app's next-step question opens that step (not save_form)" },
  { id: "tool_called", text: "Calls the form's tool when the officer asks for a form or answers its question (never words only)" },
  { id: "tool_after_ask", text: "Sends the missing tool call when the app asks again (within three asks)" },
];
const fieldOk = (want, got) => got != null && (want instanceof RegExp ? want.test(String(got)) : typeof want === "number" ? Number(got) === want : String(got).trim().toLowerCase() === String(want).trim().toLowerCase());
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
  if (flow.heard) { const got = {}; conv.tools.forEach(t => Object.entries(t.args || {}).forEach(([k, v]) => { if (v !== "" && v != null) got[k] = v; })); /* the last value the engine put in each field */
    (conv.forms || []).forEach(f => Object.entries(f).forEach(([k, v]) => { if (v !== "" && v != null && v !== false) got[k] = v; })); /* and what the form held when it was saved (Oct 29: a capacity answered to the app's own question, a campaign the app filled from the answer, were scored as missing) */
    Object.entries(flow.heard).forEach(([k, want]) => hit("heard_right", fieldOk(want, got[k]), `${k}: wanted ${want}, got ${JSON.stringify(got[k] === undefined ? null : got[k])}; heard: ${conv.turns.map(t => t.heardText || "").filter(Boolean).join(" / ").slice(0, 200)}`)); }
  if (conv.sync && conv.sync.confirmed) hit("state_honoured", !conv.sync.guardsAfterReceipt, "guards after a confirmed receipt: " + JSON.stringify(conv.sync.guards));
  conv.acts.forEach((a, i) => { if (a.role !== "grok" || !/Do you want to do that now, yes or no\?\s*$/.test(a.text)) return; const after = conv.acts.slice(i + 1); const u = after.find(x => x.role === "user"); if (!u || !/^(yes|yeah|yep|sure|ok|okay)\b/i.test(u.text)) return;
    const t = after.find(x => x.role === "step" && /^(show_|save_form|set_capacity)/.test(x.text)); if (t) hit("step_yes_opens", !/^save_form/.test(t.text), `after "${u.text}": ${t.text.slice(0, 80)}`); });
  conv.acts.forEach((a, i) => { if (a.role !== "step" || !/^Guard: Ara talked but didn't/.test(a.text)) return; hit("tool_called", false, a.text.slice(0, 120)); const after = conv.acts.slice(i + 1); const end = after.findIndex(x => x.role === "step" && /^(Ara called \S+ on ask|Ara still didn't call the tool|The officer spoke: the ask for the tool call stands down)/.test(x.text)); const r = end >= 0 ? after[end] : null; hit("tool_after_ask", !!r && /^Ara called/.test(r.text), r ? r.text.slice(0, 120) : "no outcome logged"); });
  conv.acts.forEach(a => { if (a.role === "step" && /^(show_|set_capacity)/.test(a.text)) hit("tool_called", true); });
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
  let md = `# Ara consistency run: ${ENGINE.name}${SPOKEN ? " (spoken" + (NOISE ? ", noise " + NOISE : ", quiet") + ")" : ""}${FAULTS ? " with cellular drops x" + FAULTS : ""}\n\n${extra}${SPOKEN ? "\n\nThe officer's lines were spoken into the microphone (Grok's " + OFFICER_VOICE + " voice" + (NOISE ? ", with car-like noise at level " + NOISE : ", no noise") + "); reply time runs from the end of the officer's speech." + (TURN ? " Turn detection: " + JSON.stringify(TURN) + "." : "") + (MIC_HP ? " Mic high-pass: " + MIC_HP + " Hz." : "") : ""}\n\nConversations: ${convs.length}. Estimated cost: ${money(convs.reduce((a, c) => a + c.cost, 0))} (${(convs.reduce((a, c) => a + c.lineMs, 0) / 60000).toFixed(1)} min of open line at $${PER_MIN}/min + ${convs.reduce((a, c) => a + c.items, 0)} items at $${PER_ITEM}).\n\nFirst sound of a reply after the officer's words (${fw.length} turns): median ${pct(0.5)}, 90th percentile ${pct(0.9)}, slowest ${pct(1)}, over 3 s: ${fw.filter(x => x > 3000).length}.\n\n`;
  if (FAULTS) { const fs_ = convs.flatMap(c => c.faults.map(f => Object.assign({ flow: c.flow, n: c.n, saved: c.score && c.score.task_saved && !c.score.task_saved.broke }, f))), hit = convs.filter(c => c.faults.length);
    const rec = fs_.filter(f => f.recoverMs != null).map(f => f.recoverMs).sort((x, y) => x - y), q = (k) => rec.length ? (rec[Math.min(rec.length - 1, Math.floor(k * rec.length))] / 1000).toFixed(1) + " s" : "n/a";
    md += `## Drops and quiet mics (FAULTS ${FAULTS}: drops at ${FAULT_RATES.drop * FAULTS} per turn, ${Math.round(FAULT_RATES.deadspot * 100)}% of them dead spots of 10-70 s; quiet mics at ${FAULT_RATES.quietMic * FAULTS} per turn)\n\n${fs_.length} faults in ${hit.length} of ${convs.length} conversations (${fs_.filter(f => f.kind === "drop").length} drops, ${fs_.filter(f => f.kind === "dead spot").length} dead spots, ${fs_.filter(f => f.kind === "quiet mic").length} quiet mics; for a quiet mic, "down" is how long the officer waited before repeating and "back to first words" counts from the repeat). Of the conversations with a drop, ${hit.filter(c => c.score && c.score.task_saved && !c.score.task_saved.broke).length} still ended saved. From the network coming back to Ara's first words: median ${q(0.5)}, 90th percentile ${q(0.9)}, slowest ${q(1)}; ${fs_.filter(f => f.recoverMs == null).length} never answered. First line after the drop was the app's "lost you" line ${fs_.filter(f => f.lostLine).length} times.\n\n| Flow | When | Kind | Down | Back to first words | Officer then heard |\n|---|---|---|---:|---:|---|\n` + fs_.map(f => `| ${f.flow} #${f.n} | ${f.when} at ${(f.at / 1000).toFixed(0)} s | ${f.kind} | ${(f.downMs / 1000).toFixed(1)} s | ${f.recoverMs == null ? "never" : (f.recoverMs / 1000).toFixed(1) + " s"} | ${((f.meanwhile ? "(while quiet: " + f.meanwhile + ") " : "") + (f.said || "")).replace(/\|/g, "/")} |`).join("\n") + "\n\n"; }
  { const ss = convs.map(c => c.sync).filter(Boolean); if (ss.length) { const sum = (k) => ss.reduce((a, s) => a + (s[k] || 0), 0), meds = ss.map(s => s.medianMs).filter(Boolean).sort((a, b) => a - b), guards = {}; ss.forEach(s => Object.entries(s.guards || {}).forEach(([k, v]) => { guards[k] = (guards[k] || 0) + v; }));
    md += `## Ara's state sync and the guards\n\nState updates sent ${sum("sent")}, confirmed ${sum("confirmed")} (median receipt ${meds.length ? meds[Math.floor(meds.length / 2)] : 0} ms, slowest ${Math.max(0, ...ss.map(s => s.maxMs))} ms), missed ${sum("missed")}, resent ${sum("resent")}.\n\n| Guard | Fired | Conversations |\n|---|---:|---:|\n` + Object.entries(guards).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} | ${ss.filter(s => s.guards && s.guards[k]).length} |`).join("\n") + `\n| all guards | ${Object.values(guards).reduce((a, b) => a + b, 0)} | ${ss.filter(s => Object.keys(s.guards || {}).length).length} |\n| of which after a confirmed receipt | ${sum("guardsAfterReceipt")} | ${ss.filter(s => s.guardsAfterReceipt).length} |\n\n`; } }
  if (SOUNDLESS) { const ms = convs.flatMap(c => (c.soundless || []).map(m => Object.assign({ flow: c.flow, n: c.n, conv: c }, m)));
    const rowsAfter = (c, at, secs) => c.acts.filter(a => a.role === "step" && a.at >= at && a.at < at + secs * 1000).map(a => a.text);
    const tell = (m) => { const rows = rowsAfter(m.conv, m.at, 45); const seen = {}; const pick = (re) => rows.filter(r => re.test(r)).map(r => r.replace(/ ?\(".*$/, "").slice(0, 150)).filter(r => { seen[r] = (seen[r] || 0) + 1; return seen[r] === 1; }).map(r => r + (seen[r] > 1 ? "" : "")); const out = [].concat(pick(/came without sound/), pick(/sound for Ara's line arrived/), pick(/No sound for Ara's line/), pick(/Late copy cut/), pick(/arrived again, this time with sound/), pick(/scripted line played late|resend stands down|not asked again|false alarm|treated as dead|Still waiting/i)); return out.map(r => seen[r] > 1 ? r + " (x" + seen[r] + ")" : r).join("; ") || "(nothing logged)"; };
    const sounded = (m) => m.conv.replies.filter(r => r.at >= m.at && r.status !== "cancelled" && (r.audioN || 0) >= 3 && sameWords(r.text).slice(0, 30) && sameWords(r.text).slice(0, 30) === sameWords(m.text).slice(0, 30)).length; /* tellings of the line the officer heard with sound after the fault */
    const heardOnce = ms.filter(m => sounded(m) === 1).length, never = ms.filter(m => sounded(m) === 0).length, twice = ms.filter(m => sounded(m) >= 2).length;
    const idRows = convs.flatMap(c => c.acts.filter(a => a.role === "step" && /^Scripted line ids: /.test(a.text)).map(a => a.text)), echoed = idRows.filter(r => /our id echoed: yes/.test(r)).length, refused = convs.flatMap(c => c.acts.filter(a => a.role === "step" && /Scripted line with our own id refused/.test(a.text))).length;
    md += `## Words without sound (SOUNDLESS ${SOUNDLESS}): the app waits for Ara's sound, asks once, cuts a late copy\n\n${ms.length} replies reached the app as words only (${ms.filter(m => m.forced).length} of them scripted lines; ${ms.filter(m => m.late).length} got their sound 4-20 s later as a whole copy, ${ms.filter(m => !m.late).length} never did). Heard with sound exactly once afterwards: ${heardOnce}; never heard with sound: ${never}; heard twice or more: ${twice}.\n\n| Flow | Line | Scripted | Sound | Heard with sound | What the app did |\n|---|---|---|---|---:|---|\n` + ms.map(m => `| ${m.flow} #${m.n} | ${m.text.replace(/\|/g, "/").slice(0, 70)} | ${m.forced ? "yes" : "no"} | ${m.late ? "copy after " + (m.delay / 1000).toFixed(0) + " s" : "never"} | ${sounded(m)} | ${tell(m).replace(/\|/g, "/")} |`).join("\n") + "\n\n";
    md += `### Our own id on scripted lines\n\n${idRows.length} scripted lines logged their ids (the first three per call); our id came back on ${echoed} of them; xAI refused a line with our id ${refused} times.\n\n` + idRows.slice(0, 6).map(r => `- ${r}`).join("\n") + "\n\n"; }
  if (DROP_AFTER_SAVE) { const rows = convs.flatMap(c => c.acts.filter(a => a.role === "step" && /where we were|^(Reconnected|Line reopened): /.test(a.text)).map(a => `${c.flow} #${c.n}: ${a.text.slice(0, 160)}`)), n = convs.flatMap(c => c.faults.filter(f => f.when === "after a save")).length;
    md += `## Drops after a save (DROP_AFTER_SAVE ${DROP_AFTER_SAVE}): Ara says where we were\n\n${n} drops right after a save. Ara said where we were herself on the first try ${rows.filter(r => /said where we were on try 1/.test(r)).length} times, on a later try ${rows.filter(r => /said where we were on try [2-9]/.test(r)).length}, and the app said it itself ${rows.filter(r => /didn't say where we were in/.test(r)).length} times.\n\n` + rows.map(r => `- ${r.replace(/\|/g, "/")}`).join("\n") + "\n\n"; }
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
  if (SPOKEN) { // every line the officer may say, as speech, before any conversation starts
    const texts = flows.flatMap(f => f.lines.concat(f.subst ? [f.subst] : [])).concat(ANSWERS);
    const v = await officerAudio(texts, { key: XAI_KEY, voice: OFFICER_VOICE }); voices = v.pcm;
    console.log(`Officer voice (${OFFICER_VOICE}): ${v.log.length} lines, ${v.log.filter(l => l.cached).length} from the cache, ${v.log.reduce((a, l) => a + l.seconds, 0).toFixed(0)} s of speech`);
    v.log.filter(l => !l.cached && l.heard && l.heard.replace(/\W/g, "").toLowerCase() !== l.text.replace(/\W/g, "").toLowerCase()).forEach(l => console.log(`  said differently: "${l.text}" -> "${l.heard}"`));
  }
  const convs = []; let started = 0, running = 0, firstLogged = false, fails = 0; const avg = () => { const ok = convs.filter(c => !c.failed); return ok.length ? ok.reduce((a, c) => a + c.cost, 0) / ok.length : Number(process.env.EST || 0.3); };
  const guard = setInterval(() => { if (spent() > BUDGET && !stopAll) { stopAll = true; console.log(`Budget reached ($${spent().toFixed(3)}): stopping`); } }, 1000);
  const half = { said: false };
  async function worker() {
    while (!stopAll && started < MAX_CONVS && spent() + (running + 1) * avg() * 1.1 <= BUDGET) {
      const flow = flows[started % flows.length], n = Math.floor(started / flows.length) + 1; started++; running++;
      const c = await converse(browser, base, flow, n); running--;
      c.failed = !c.replies.some(r => r.text); if (c.cut) console.log(`(conversation ${c.flow} #${c.n} was cut off by the budget and is left out of the scores)`); else if (!c.failed) { c.score = score(c, flow); fails = 0; } else if (++fails >= 3) { stopAll = true; console.log("Three conversations in a row got no answer from " + ENGINE.name + ": stopping. " + c.errors.slice(0, 2).join("; ")); }
      convs.push(c);
      try { const clip = writeClip(c); if (clip) console.log("CLIP " + clip + " (" + ((c.endAt - (c.officer[0].at)) / 1000).toFixed(0) + " s)"); } catch (e) { console.log("clip failed: " + e.message.slice(0, 200)); }
      c.araAudio = null; c.officer = null; /* the audio is on disk now */
      if (!firstLogged && c.replies.length) { firstLogged = true; console.log("MILESTONE first-grok-reply: " + JSON.stringify(c.replies[0].text.slice(0, 200))); }
      progress(c, convs.length).catch(() => {});
      console.log(`${convs.length}. ${c.flow} #${c.n}: ${c.turns.length} turns, ${(c.lineMs / 1000).toFixed(0)} s, $${c.cost.toFixed(3)}, saved: ${c.saved.map(s => s.text).join(" | ") || "nothing"}${c.errors.length ? ", errors: " + c.errors.slice(0, 2).join("; ") : ""}  [total $${spent().toFixed(3)}]`);
      if (!half.said && spent() >= BUDGET / 2) { half.said = true; console.log(`MILESTONE halfway: ${convs.length} conversations, $${spent().toFixed(3)}`); }
      console.log("TRANSCRIPT " + JSON.stringify({ flow: c.flow, n: c.n, kinds: c.kinds, appSaid: c.acts.filter(a => a.role === "grok").map(a => a.text.slice(0, 200)), turns: c.turns.map(t => t.say), replies: c.replies.map(r => [r.turn, scripted(r, c.forced) ? "S" : "A", r.text.slice(0, 260)]), tools: c.tools.map(t => { let err = ""; try { err = (JSON.parse(t.out || "{}").error || "").slice(0, 220); } catch (x) {} return [t.turn, t.name, JSON.stringify(t.args).slice(0, 200)].concat(err ? ["ERROR: " + err] : []); }), saved: c.saved.map(s => s.text), leftOut: c.leftOut || [], drops: c.drops || [], faults: c.faults, errors: c.errors.slice(0, 3), heard: SPOKEN ? c.turns.map(t => [t.say, t.heardText || "", t.spokenMs || 0]) : undefined }));
      if (DIAG) console.log("VOICELOG " + JSON.stringify({ flow: c.flow, n: c.n, steps: c.acts.filter(a => a.role === "step").map(a => [a.at, a.text.slice(0, 220)]), vlog: c.vlog || [] })); /* the app's own voice log, for reading an engine's behaviour line by line */
      fs.writeFileSync(path.join(OUT, "conversations.json"), JSON.stringify(convs, null, 1));
    }
  }
  await Promise.all(Array.from({ length: JOBS }, worker));
  clearInterval(guard); await browser.close(); server.close();
  const total = spent(), okN = convs.filter(c => !c.failed).length, per = okN ? total / okN : 0;
  const extra = `Budget for this run: $${BUDGET}. Spent (estimate): $${total.toFixed(3)}. Per conversation: $${per.toFixed(3)}, so $2 buys about ${per ? Math.floor(2 / per) : "?"} and $10 about ${per ? Math.floor(10 / per) : "?"} conversations.`;
  const failed = convs.filter(c => c.failed).length;
  const { md, rows, byFlow } = report(convs.filter(c => !c.failed && !c.cut), extra + (failed ? ` ${failed} conversation(s) got no answer from ${ENGINE.name} and are left out of the scores${(() => { const e = convs.filter(c => c.failed).flatMap(c => c.errors).find(x => /^line: /.test(x)); return e ? " (" + e + ")" : ""; })()}.` : ""));
  fs.writeFileSync(path.join(OUT, "summary.md"), md);
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ budget: BUDGET, spent: total, perConversation: per, conversations: convs.length, rows, byFlow }, null, 1));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log("\n===== SUMMARY =====\n" + md + "===== END SUMMARY =====");
  console.log("SUMMARY_JSON " + JSON.stringify({ provider: PROVIDER, firstMs: convs.flatMap(c => c.firstMs || []), firstByFlow: byFlowMsAll, spent: total, per, n: convs.length, rows: rows.map(r => [r.id, r.checked, r.broken]), byFlow }));
})().catch(e => { console.error(e); process.exit(1); });
