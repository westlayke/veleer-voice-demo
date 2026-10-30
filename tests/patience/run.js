// "Are you there?" harness (phase one, text only): a simulated officer with Jim's patience talks the app through a journey
// against a stand-in voice service, while seeded random faults (latency, dropped lines, stalls, dead spots, words without
// sound) are thrown at the line. Every "Are you there?" the officer says is logged with the silence before it and the app's
// state at that moment (the cause), so a build can be scored: asks per 10 minutes, by cause, longest silence, hang-ups.
// Run:  node tests/patience/run.js                       (10 conversations, faults at Jim's rates, seed 1)
//       CONVS=30 SEED=7 RATE=0 node tests/patience/run.js  (RATE=0 faults off: the floor; RATE=2 twice Jim's rates)
//       JOBS=4 node tests/patience/run.js                 (conversations at once)
// Timers run at real speed (a conversation is 2 to 5 minutes); no xAI calls, so a run costs nothing.
const http = require("http"), fs = require("fs"), path = require("path");
let chromium; try { ({ chromium } = require("playwright")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright")); }
const ROOT = path.resolve(__dirname, "../.."), OUT = path.join(__dirname, "results");
const CONVS = Math.max(1, Number(process.env.CONVS) || 10), JOBS = Math.max(1, Number(process.env.JOBS) || 3), SEED = Number(process.env.SEED) || 1, RATE = process.env.RATE === undefined ? 1 : Number(process.env.RATE);
const NAME = process.env.OFFICER || "Patient Pat", MAX_MS = Number(process.env.MAX_MS) || 10 * 60e3;
const DROP_AFTER_SAVE = Number(process.env.DROP_AFTER_SAVE) || 0; /* per save: the line drops 2.5-5.5 s after the save line starts (Carverhill's 10:36 AM call, Oct 30: three drops with no form open) */
// Jim's 45 measured waits before "Are you there?" (Oct 27-28, seconds): the officer's patience is drawn from these
const WAITS = [24.4, 9.9, 20.0, 2.6, 2.9, 7.6, 2.6, 13.7, 16.3, 9.8, 7.2, 15.6, 11.5, 5.0, 8.3, 5.5, 6.3, 8.4, 22.1, 5.7, 4.0, 5.0, 12.5, 30.2, 15.4, 2.6, 6.7, 2.6, 22.7, 28.3, 20.3, 11.4, 21.6, 4.8, 33.6, 2.6, 34.4, 5.1, 4.7, 6.3, 25.2, 25.0, 7.2, 14.8, 37.4];
// fault rates per officer turn at RATE=1 (Jim's calls: about 55 connection problems in 38 conversations, one problem every 6 to 7 minutes, a turn is about 12 s)
const RATES = { wordsOnly: 0.08 /* per draft tool call: the stand-in answers in words and sends no tool call (Carverhill's 8:58 AM call, Oct 30); it sends the held call when the app asks again, 30% of asks miss again */, drop: 0.025, stall: 0.012, deadspot: 0.35 /* of drops: the voice pass then hangs 10-70 s */, noaudio: 0.06 /* per line of Ara's */, slow: 0.06 /* per reply: 10-25 s before it starts */, slowline: 0.02, lostReceipt: 0.05 /* per state update: the service never confirms it (and never applied it) */, staleAra: 0.1 /* per next-step yes: the stand-in acts on its old picture and calls save_form, as Grok did on Oct 29 */ };

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".css": "text/css", ".mp3": "audio/mpeg" };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});

// ---------- in the page: the stand-in line with its faults, the silent mic, the key holder ----------
const FAKES = (cfg) => {
  window.__sent = []; window.__logs = []; window.__lines = []; window.__events = []; window.__cfg = cfg; window.__reconnectBy = cfg.reconnect || "ara"; /* who says where we were after a drop: Ara (checked by the app) or the app's scripted line */
  let s = cfg.seed >>> 0; const rnd = () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; window.__rnd = rnd;
  const R = cfg.rate, P = cfg.rates;
  // the voice service's reply delay: lognormal around Jim's measured median (1.7 s quiet), with a long tail; a "slow" draw adds 10-25 s
  window.__latency = () => { const z = Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd()); let ms = Math.round(1700 * Math.exp(0.55 * z)); if (R && rnd() < P.slow * R) { ms += 10000 + Math.round(rnd() * 15000); window.__events.push({ at: Date.now(), fault: "slow reply", ms }); } return Math.max(250, ms); };
  window.__fault = { stalled: 0, tokenHang: 0, pingHang: 0 };
  window.__silence = (() => { const n = 12000, b = new Int16Array(n); for (let i = 0; i < n; i++) b[i] = Math.round(4000 * Math.sin(i * 2 * Math.PI * 220 / 24000)); return btoa(String.fromCharCode(...new Uint8Array(b.buffer))); })(); /* 0.5 s of a quiet tone: the phone measures its own speaker level */
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = async (c) => { if (c && c.audio) { const ac = new (window.AudioContext || window.webkitAudioContext)(); window.__micCtx = ac; const dst = ac.createMediaStreamDestination(); return dst.stream; } return gum(c); };
  window.__quietMic = true;
  window.WebSocket = class {
    constructor(u) { window.__wsUrls = (window.__wsUrls || []).concat(String(u)); window.__ws = this; this.readyState = 1; this.q = []; this.held = false; this.openedAt = Date.now();
      setTimeout(() => this.onopen && this.onopen(), 30 + Math.round(rnd() * 300)); }
    deliver(e, ms) { const w = this; setTimeout(() => { if (w.readyState !== 1) return; if (w.held) { w.q.push(e); return; } w.onmessage && w.onmessage({ data: JSON.stringify(e) }); }, ms || 0); }
    // a line said by the voice service, as audio + words (or words only when the fault says so)
    say(text, ms, forced, sounded) { const w = this; if (window.__standIn && !/^I'm here\.|^Okay\.$/.test(text)) window.__standIn.lastLine = text; /* the last line said in Ara's voice, scripted ones included: what she repeats after "are you there" */ const noaudio = !sounded && R && rnd() < P.noaudio * R; if (noaudio) { const late = rnd() < 0.5 ? 5000 + Math.round(rnd() * 11000) : 0; window.__events.push({ at: Date.now(), fault: late ? "words without sound, the sound " + Math.round(late / 1000) + " s later" : "words without sound", text: text.slice(0, 50) }); if (late) setTimeout(() => { if (w.readyState === 1) w.say(text, 0, forced, true); }, ms + late); } /* Carverhill's 12:45 PM call, Oct 30: the sound came 1-16 s after the words, as a response of its own */
      w.deliver({ type: "response.created" }, ms); if (!noaudio) w.deliver({ type: "response.output_audio.delta", delta: window.__silence }, ms + 40); w.deliver({ type: "response.output_audio_transcript.delta", delta: text }, ms + 50);
      setTimeout(() => { if (w.readyState !== 1) return; const cut = !!(window.G && G.dropNext); w.deliver({ type: "response.done", response: { status: "completed" } }, 0); if (!cut) window.__lines.push({ text, at: Date.now(), from: forced ? "app" : "ara", noaudio }); else window.__events.push({ at: Date.now(), fault: "late copy cut by the app" }); }, ms + 80); } /* a copy the app cut (lateForcedCheck sets G.dropNext on its words) is never heard: not a line said twice */
    send(d) { window.__sent.push(d); let e; try { e = JSON.parse(d); } catch (x) { return; }
      if (e.type === "session.update") { const w = this, instr = e.session && e.session.instructions; if (R && rnd() < P.lostReceipt * R) { window.__events.push({ at: Date.now(), fault: "lost receipt", bytes: d.length }); (window.__receipts = window.__receipts || []).push({ at: Date.now(), lost: true }); }
        else { const ms = 50 + Math.round(d.length / 50) + Math.round(rnd() * 150); setTimeout(() => { if (w.readyState !== 1) return; if (instr && window.__standIn) window.__standIn.applyState(instr); (window.__receipts = window.__receipts || []).push({ at: Date.now(), ms }); w.deliver({ type: "session.updated" }, 0); }, ms); } } /* one receipt per update, in order (the state sync, Oct 29) */
      if (e.type === "response.cancel") this.deliver({ type: "response.done", response: { status: "cancelled" } }, 20);
      if (e.item && e.item.type === "force_message") this.say(e.item.content[0].text, window.__latency(), true);
      if (e.item && e.item.type === "message" && window.__standIn) { const m = String(e.item.content && e.item.content[0] && e.item.content[0].text || "").match(/Say exactly this[^"]*"([^"]+)"/); if (m) window.__standIn.pendingLine = m[1]; }
      if (e.type === "response.create" && window.__standIn) window.__standIn.reply(this, e); /* the stand-in Grok answers a reply request */
      if (e.item && e.item.type === "function_call_output" && window.__standIn) { let out = {}; try { out = JSON.parse(e.item.output); } catch (x) {} window.__standIn.toolResult(this, out); } }
    close() { this.readyState = 3; }
    drop() { if (this.readyState !== 1) return; this.readyState = 3; this.onclose && this.onclose({ code: 1006, reason: "" }); }
    stall(ms) { const w = this; w.held = true; window.__fault.pingHang = ms; setTimeout(() => { window.__fault.pingHang = 0; w.drop(); }, ms); } };
  const f = window.fetch, hang = (ms, sig) => new Promise((r, j) => { const t = setTimeout(r, ms); if (sig) sig.addEventListener("abort", () => { clearTimeout(t); j(new DOMException("aborted", "AbortError")); }); });
  window.fetch = async (u, o) => { const s = String(u);
    if (/workers\.dev\/log/.test(s)) { if (/ping=/.test(s) && window.__fault.pingHang) await hang(window.__fault.pingHang, o && o.signal); if (o && o.body) window.__logs.push(JSON.parse(o.body)); return new Response(/GET|undefined/.test(String(o && o.method)) ? '{"logging":true}' : '{"ok":true}', { status: 200 }); }
    if (/\/tts$/.test(s)) return new Response("no", { status: 502 });
    if (/workers\.dev/.test(s)) { if (window.__fault.tokenHang) { const ms = window.__fault.tokenHang; await hang(Math.min(ms, 5900), o && o.signal); if (Date.now() < window.__fault.tokenUntil) throw new TypeError("Failed to fetch"); window.__fault.tokenHang = 0; } return new Response('{"value":"test-pass"}', { status: 200 }); }
    return f(u, o); };
  // the phone's own recordings count as sound the officer heard
  window.__phoneSaid = []; const origAct = window.act; /* act() is defined later by the app: wrap it once it exists */
  const wrapAct = () => { if (typeof window.act !== "function" || window.act.__wrapped) return false; const a = window.act; const w = function (role, text, sess) { (window.__acts = window.__acts || []).push({ at: Date.now(), role, text: String(text || "") }); if (/^The phone said/.test(String(text))) window.__phoneSaid.push({ at: Date.now(), text: String(text) }); if (/where we were|^(Reconnected|Line reopened): /.test(String(text))) (window.__ctxRows = window.__ctxRows || []).push({ at: Date.now(), text: String(text).slice(0, 160) }); return a.apply(this, arguments); }; w.__wrapped = true; window.act = w; return true; };
  const iv = setInterval(() => { if (wrapAct()) clearInterval(iv); }, 50);
};

// ---------- the stand-in Grok (runs in the page): it answers reply requests and tool results the way Ara would, after a latency draw ----------
const STAND_IN = () => {
  window.__standIn = {
    pendingTool: null, /* the tool call the officer's last words call for; sent when the app asks for a reply (response.create) or straight away in hands-free */
    state: { formOpen: false, saved: 0, version: 0 }, /* Ara's picture of the form, from the instructions the service confirmed (applyState); a draft tool she sent opens a form in her picture until the state says it closed */
    applyState(instr) { const where = (instr.match(/Where we are: ([^\n]*)/) || [, ""])[1]; if (this.state.where && this.state.where !== where) this.prevWhere = this.state.where; /* her picture before this update: a stale answer draws on it */
      this.state = { formOpen: !/No form is open now/.test(instr), saved: ((instr.match(/Saved so far in this conversation: ([^\n]*)/) || [, ""])[1].split("; ").filter(Boolean).length), version: Number((instr.match(/State version (\d+)/) || [, 0])[1]), where }; },
    // the app asks Ara to say where we were (after a drop, or a late yes after a save): the stand-in composes it from the state the service confirmed; on a draw it misses
    // the way Grok did on Oct 30 (a bare "what would you like to do?", or a stale line from its old picture), and the app's retry gets a fresh draw
    context(ws, instr) { const retry = /Your last reply \(/.test(instr), late = /already saved, then ask this question/.test(instr); const rec = (window.__ctxAsks = window.__ctxAsks || []); let a = rec[rec.length - 1];
      if (!a || a.done || !retry) { a = { at: Date.now(), kind: late ? "late-yes" : "reconnect", asks: 0, done: false, misses: [] }; rec.push(a); } a.asks++;
      if (!retry && this.lastSent && window.__cfg.rate && window.__rnd() < 0.3 * window.__cfg.rate) { /* Carverhill's 2:52 PM call (Oct 30): on the pickup the service replayed the save_form from before the drop; the app refuses it and its result makes the stand-in answer with an open question, which the app's check must catch */
        const t = this.lastSent; a.misses.push("replayed tool call"); window.__events.push({ at: Date.now(), fault: "where-we-were miss (replayed tool call)" }); const ms = window.__latency();
        setTimeout(() => { if (ws.readyState !== 1) return; ws.deliver({ type: "response.created" }, 0); ws.deliver({ type: "response.output_audio.delta", delta: window.__silence }, 20); ws.deliver({ type: "response.function_call_arguments.done", call_id: "t" + Math.random().toString(36).slice(2), name: t[0], arguments: JSON.stringify(t[1]) }, 40); ws.deliver({ type: "response.done", response: { status: "completed" } }, 60); }, ms); return; }
      const q = (instr.match(/word for word: "([^"]+)"/) || [])[1] || "What would you like to do?", R = window.__cfg.rate, draw = window.__rnd(), missRate = (retry ? 0.3 : 0.25) * (R || 0); let line, miss = "";
      if (draw < missRate * 0.6) { miss = "bare"; line = late ? "That's saved. What's next?" : "Sorry, I lost you for a moment. What would you like to do?"; }
      else if (draw < missRate && this.prevWhere) { miss = "stale"; line = "Sorry, I lost you for a moment. " + this.prevWhere; }
      else line = late ? "That was already saved. " + q : "Sorry, I lost you for a moment. " + (this.state.where || q);
      if (miss) { a.misses.push(miss); window.__events.push({ at: Date.now(), fault: "where-we-were miss (" + miss + ")" }); } else { a.done = true; a.on = a.asks; } ws.say(line, window.__latency()); },
    // the tool the stand-in actually sends for a next-step yes: save_form when its picture still has the form open (no state yet, or lost) or on the stale-Ara draw, as Grok did on Oct 29
    pick(tool) { if (!tool || !/^show_|^set_capacity/.test(tool[0]) || !this.stepYes) return tool; this.stepYes = false; const stale = this.state.formOpen, draw = window.__cfg.rate && window.__rnd() < window.__cfg.rates.staleAra * window.__cfg.rate;
      if (!stale && !draw) return tool; this.intended = tool; (window.__staleSaves = window.__staleSaves || []).push({ at: Date.now(), why: stale ? "the state still showed the form open" : "stale-Ara draw", intended: tool[0], recovered: false }); window.__events.push({ at: Date.now(), fault: stale ? "stale picture (no state yet)" : "stale Ara" }); return ["save_form", { confirmed: true }]; },
    reply(ws, e) { const t = this.pendingTool; const instr = (e.response && e.response.instructions) || "";
      { const CTX = /say in one sentence where we were|already saved, then ask this question word for word/, note = this.lastOut && this.lastOut.note || ""; /* the first late-yes ask rides in the tool result's note ("Reply to the officer from the tool result"); the retries come as guidance */
        if (CTX.test(instr)) { this.context(ws, instr); return; } if (/Reply to the officer from the tool result/.test(instr) && CTX.test(note)) { this.context(ws, note); return; } }
      if (/your last reply had no tool call/.test(instr)) { const held = this.heldTool, w = (window.__wordsOnly || []).slice(-1)[0]; /* the app's ask for the missing tool call */
        if (!held || !w || w.recovered) { (window.__falseNudges = window.__falseNudges || []).push({ at: Date.now(), instr: instr.slice(0, 160) }); ws.say("Okay.", window.__latency()); return; }
        w.asks++; if (w.asks < 3 && window.__rnd() < 0.3) { ws.say("Okay.", window.__latency()); return; } /* misses again */
        this.heldTool = null; w.recovered = true; w.recoveredOn = w.asks; const tl = this.pick(held); this.lastTool = tl[0]; this.lastSent = tl; const ms = window.__latency(); setTimeout(() => { if (ws.readyState !== 1) return; ws.deliver({ type: "response.created" }, 0); ws.deliver({ type: "response.output_audio.delta", delta: window.__silence }, 20); ws.deliver({ type: "response.function_call_arguments.done", call_id: "t" + Math.random().toString(36).slice(2), name: tl[0], arguments: JSON.stringify(tl[1]) }, 40); ws.deliver({ type: "response.done", response: { status: "completed" } }, 60); }, ms); return; }
      if (this.pendingLine) { const l = this.pendingLine; this.pendingLine = null; ws.say(l, window.__latency()); return; }
      if (this.pendingSay) { const l = this.pendingSay; this.pendingSay = null; ws.say(l, window.__latency()); return; }
      if (t) { this.pendingTool = null; const ms = window.__latency(); setTimeout(() => { if (ws.readyState !== 1) return; ws.deliver({ type: "response.created" }, 0); ws.deliver({ type: "response.output_audio.delta", delta: window.__silence }, 20);
        ws.deliver({ type: "response.function_call_arguments.done", call_id: "t" + Math.random().toString(36).slice(2), name: t[0], arguments: JSON.stringify(t[1]) }, 40); ws.deliver({ type: "response.done", response: { status: "completed" } }, 60); }, ms); return; }
      // guidance that asks Ara to say something: say the gist (a stand-in can't compose; it answers "are you there" and repeats a line it is asked to repeat)
      const m = instr.match(/Say (?:this now|it again now), word for word[^"]*"([^"]+)"/); if (m) { ws.say(m[1], window.__latency()); return; }
      if (/whether you.?re there|whether you are there|are you there/i.test(instr) || /whether Ara is there/.test(instr)) { ws.say("I'm here." + (this.lastLine ? " " + this.lastLine : ""), window.__latency()); return; }
      if (/Say in a few words that it's saved|Confirm it once/.test(instr)) { ws.say("That's saved. What's next?", window.__latency()); return; }
      if (/The app just said|don't say it (or anything like it )?again|The app is saying so itself/.test(instr)) { const ms = window.__latency(); setTimeout(() => { if (ws.readyState !== 1) return; ws.deliver({ type: "response.created" }, 0); ws.deliver({ type: "response.done", response: { status: "completed" } }, 30); }, ms); return; } /* the app said the line itself: Ara stays quiet (the stand-in used to read the quoted question out, and the line was heard twice) */
      if (this.intended && this.lastOut && /Open that step now with its tool/.test(this.lastOut.note || "")) { const t = this.intended; this.intended = null; const sv = (window.__staleSaves || []).slice(-1)[0]; if (sv) sv.recovered = true; this.pendingTool = null; const ms = window.__latency();
        setTimeout(() => { if (ws.readyState !== 1) return; ws.deliver({ type: "response.created" }, 0); ws.deliver({ type: "response.output_audio.delta", delta: window.__silence }, 20); ws.deliver({ type: "response.function_call_arguments.done", call_id: "t" + Math.random().toString(36).slice(2), name: t[0], arguments: JSON.stringify(t[1]) }, 40); ws.deliver({ type: "response.done", response: { status: "completed" } }, 60); }, ms); return; } /* the app's guard routed the yes to the next step: Ara opens it */
      { const sn = instr.match(/Still needed: ([^.]+)\./); if (sn) { ws.say(`What's the ${sn[1].split(/,| and /)[0].replace(/\s*\(.*$/, "").trim().toLowerCase()}?`, window.__latency()); return; } }
      if (/never read it aloud/.test(instr) && /question/.test(instr)) { const q = (instr.match(/"([^"]+\?)"/) || [])[1]; if (q) { ws.say(q, window.__latency()); return; } }
      // nothing the stand-in understands: it says a short line (Grok never answers with nothing) and the guidance is kept for the report
      (window.__guidance = window.__guidance || []).push(instr.slice(0, 200) + " | last tool result: " + JSON.stringify(this.lastOut || {}).slice(0, 300)); ws.say("Okay.", window.__latency()); },
    toolResult(ws, out) { this.lastOut = out; if (this.lastTool && /^show_/.test(this.lastTool)) this.state.formOpen = true; if (out.already && /Open that step now/.test(out.note || "")) { this.pendingSay = null; return; } if (out.ask_exactly || out.asked || out.read_back || out.already) { this.pendingSay = null; return; } /* the app says those lines itself (forced), or wants silence */
      const q = out.still_needed && out.still_needed.length ? `What's the ${String(out.still_needed[0]).replace(/\s*\(.*$/, "").toLowerCase()}?` : out.say ? out.say : out.saved ? "Saved. What's next?" : out.error ? `${String(out.error).split(/(?<=\.)\s/)[0]} What would you like to do?` : "";
      if (!q) return; this.pendingSay = q; const me = this; setTimeout(() => { if (me.pendingSay === q) { me.pendingSay = null; ws.say(q, window.__latency()); } }, 1500); /* said as the answer to the app's reply request, or on its own when none comes */ } };
};

// ---------- the officer's answer book: what Patient Pat says to each question, and the tool the stand-in Grok then calls ----------
const C = "Jordan Pike", iso = (d) => d.toISOString().slice(0, 10), today = new Date(), friday = new Date(today); friday.setDate(today.getDate() + ((5 - today.getDay() + 7) % 7 || 7)); const T = iso(today), F = iso(friday);
const STEP_TOOL = (line) => /capacity rating/i.test(line) ? null /* the officer declines and names the next form instead (see BOOK) */ : /create an opportunity/i.test(line) ? ["show_opportunity_draft", { contact_name: C }] : /substantive interaction/i.test(line) ? ["show_interaction_draft", { contact_name: C }] : /planned ask/i.test(line) ? ["show_ask_plan_draft", { contact_name: C }] : /record the ask/i.test(line) ? ["show_ask_result_draft", { contact_name: C, date: T }] : /move to Cultivation|Cultivation\?/i.test(line) ? ["show_cultivation_decision", { contact_name: C, decision: "Move to Cultivation" }] : /planned ask/i.test(line) ? ["show_ask_plan_draft", { contact_name: C }] : /record the ask/i.test(line) ? ["show_ask_result_draft", { contact_name: C, date: T }] : /gift|answer/i.test(line) ? ["show_gift_draft", { contact_name: C }] : null;
const FORM_TOOL = { contact: "show_contact_draft", opportunity: "show_opportunity_draft", interaction: "show_interaction_draft", ask: "show_ask_result_draft", plan: "show_ask_plan_draft", gift: "show_gift_draft", cultivate: "show_cultivation_decision", response: "show_ask_response_draft" };
const forForm = (ctx, args) => [FORM_TOOL[ctx.form] || "show_interaction_draft", Object.assign({ contact_name: C }, args)]; /* the stand-in sends only what the officer just said: the app's evidence guard drops anything else */
const ND = "C.A. North Dakota Fed PAC";
const BOOK = [
  { q: /Just to be sure, the amount is/i, say: "Yes." },
  { q: /Save it, or change something\?|Yes to save, or no to change something\?|Shall I save it\?/i, say: "Yes.", tool: ["save_form", { confirmed: true }] },
  { q: /Save it, or add the optional details first\?/i, say: "Save it.", tool: ["save_form", {}] },
  { q: /set a capacity rating\. Do you want to do that now\??/i, say: "No. Create an opportunity for Jordan Pike.", tool: ["show_opportunity_draft", { contact_name: C }] },
  { q: /Do you want to do that now\??/i, say: "Yes.", tool: (line) => STEP_TOOL(line) },
  { q: /What would you like to do\?|What's next\?/i, say: (ctx) => ctx.agenda() },
  { q: /first and last name/i, say: "Jordan Pike, P I K E.", tool: ["show_contact_draft", { first: "Jordan", last: "Pike" }] },
  { q: /Type: In person/i, say: "In person.", tool: (line, ctx) => forForm(ctx, { meetingType: "In person" }) },
  { q: /When was (it|the ask made), and was it in person/i, say: "Today, in person.", tool: (line, ctx) => forForm(ctx, { date: T, meetingType: "In person" }) },
  { q: /email or mobile|email address|What's the email/i, say: "J Pike at gmail dot com.", tool: ["show_contact_draft", { first: "Jordan", last: "Pike", email: "jpike@gmail.com" }] },
  { q: /mobile number/i, say: "No.", tool: ["show_contact_draft", { first: "Jordan", last: "Pike", email: "jpike@gmail.com" }] },
  { q: /Set \w+'s capacity to .*yes or no\?/i, say: "Yes.", tool: ["set_capacity_rating", { contact_name: C, rating: "C", confirmed: true }] }, // the app's own confirmation of a rating (Oct 30)
  { q: /capacity rating|which fits/i, say: "C.", tool: ["optional_fields", { step: "answer", value: "C" }] },
  { q: /Fill it in, or move on\?|skip it|or move on\?/i, say: "Move on.", tool: ["optional_fields", { step: "skip" }] },
  { q: /What was the (response|answer)/i, say: "He accepted.", tool: (line, ctx) => forForm(ctx, { response: "Accepted" }) },
  { q: /What happened\?|How did it go\?|A sentence or two/i, say: "We talked about his interest in the North Dakota work, and he's keen.", tool: (line, ctx) => forForm(ctx, { summary: "Talked about his interest in the North Dakota work; he's keen." }) },
  { q: /substantive interaction, one that moved/i, say: "Yes, it was.", tool: (line, ctx) => forForm(ctx, { substantive: true }) },
  { q: /What's the next step, and when is it due/i, say: "Call him on Friday about the donation.", tool: (line, ctx) => forForm(ctx, { nextStep: "Call Jordan about the donation", nextDue: F }) },
  { q: /next step/i, say: "Yes. Call him on Friday about the donation.", tool: (line, ctx) => forForm(ctx, { nextStep: "Call Jordan about the donation", nextDue: F }) },
  { q: /What should the task say/i, say: "Call Jordan about the ask, due Friday.", tool: (line, ctx) => forForm(ctx, { nextStep: "Call Jordan about the ask", nextDue: F }) },
  { q: /Should I hang up now/i, say: "No.", tool: null },
  { q: /Shall I use that/i, say: "Use that.", tool: (line, ctx) => forForm(ctx, { nextStep: "Follow up with Jordan to get an answer on the ask", nextDue: F }) },
  { q: /Move \w+ to Cultivation, or defer\?/i, say: "Move to Cultivation.", tool: ["show_cultivation_decision", { contact_name: C, decision: "Move to Cultivation" }] },
  { q: /Move \w+ to Cultivation\?/i, say: "Yes.", tool: ["save_form", { confirmed: true }] },
  { q: /Which entity, and which campaign/i, say: "The North Dakota Fed PAC, North Dakota.", tool: (line, ctx) => forForm(ctx, { fund: ND, campaign: "North Dakota" }) },
  { q: /Which campaign/i, say: "North Dakota.", tool: (line, ctx) => forForm(ctx, { campaign: "North Dakota" }) },
  { q: /Which entity\?/i, say: "The North Dakota Fed PAC.", tool: (line, ctx) => forForm(ctx, { fund: ND }) },
  { q: /planned ask date/i, say: "Today, twenty-five thousand dollars.", tool: ["show_ask_plan_draft", { contact_name: C, plannedDate: T, amount: 25000 }] },
  { q: /How much (was the ask|is the gift|is the pledge), and for which entity/i, say: "Twenty-five thousand dollars, for the North Dakota Fed PAC.", tool: (line, ctx) => forForm(ctx, { amount: 25000, fund: ND }) },
  { q: /When was it received, and how was it paid/i, say: "Today, by check.", tool: (line, ctx) => forForm(ctx, { date: T, method: "Check" }) },
  { q: /Ally - Do Not Solicit, or Do Not Contact/i, say: "Neither.", tool: ["optional_fields", { step: "answer", value: "neither" }] },
  { q: /What's the type\?/i, say: "In person.", tool: (line, ctx) => forForm(ctx, { meetingType: "In person" }) },
  { q: /Payment method: Check/i, say: "By check.", tool: (line, ctx) => forForm(ctx, { method: "Check" }) },
  { q: /How much|the amount\?/i, say: "Twenty-five thousand dollars.", tool: (line, ctx) => forForm(ctx, { amount: 25000 }) },
  { q: /When (was|is) it|what date/i, say: "Today.", tool: (line, ctx) => forForm(ctx, { date: T }) },
  { q: /Could you say that again\?|say that again/i, say: (ctx) => ctx.again() },
  { q: /\?$/, say: "Yes." }, /* anything else: a yes, and the question is logged as unanswered-by-the-book */
];
const AGENDA = ["Let's add a new contact. Jordan Pike, P I K E.", "Create an opportunity for Jordan Pike.", "Log an interaction with Jordan Pike.", "Move Jordan to Cultivation.", "Plan an ask for Jordan Pike.", "Record the ask for Jordan Pike.", "Jordan sent a check for twenty-five thousand dollars, record the gift."];
const AGENDA_TOOL = [["show_contact_draft", { first: "Jordan", last: "Pike" }], ["show_opportunity_draft", { contact_name: C }], ["show_interaction_draft", { contact_name: C }], ["show_cultivation_decision", { contact_name: C, decision: "Move to Cultivation" }], ["show_ask_plan_draft", { contact_name: C }], ["show_ask_result_draft", { contact_name: C, date: T }], ["show_gift_draft", { contact_name: C, amount: 25000, method: "Check" }]];

// ---------- one conversation ----------
async function conversation(browser, base, n) {
  const seed = SEED * 1000 + n, cfg = { seed, rate: RATE, rates: RATES, reconnect: process.env.RECONNECT || "ara" };
  const conv = { n, seed, asks: [], faults: [], saves: [], unanswered: [], started: Date.now(), errors: [], turns: 0, hungUp: false, closedWon: false };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, permissions: ["microphone"] });
  await ctx.addInitScript(FAKES, cfg); await ctx.addInitScript(STAND_IN);
  const p = await ctx.newPage(); p.on("pageerror", e => conv.errors.push("page: " + e.message));
  await p.goto(base + "preview-flow.html"); await p.waitForTimeout(900);
  await p.tap("text=I'd rather type my name"); await p.waitForTimeout(400); await p.fill("#wlName", NAME); await p.tap("text=Start");
  await p.waitForFunction(() => window.__ws && G.live && G.status === "Listening", null, { timeout: 15000 });
  // a seeded random number stream in Node for the officer's side (patience, turn faults)
  let s = (seed * 7919) >>> 0; const rnd = () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const patience = () => WAITS[Math.floor(rnd() * WAITS.length)] * 1000;
  let agendaAt = 0, lastSaid = "", answered = 0, lastAnswerAt = Date.now(), waitLimit = patience() + 10000 /* the greeting is expected: the officer gives it 10 s more */, asksInRow = 0, form = "";
  const firstOpen = await p.evaluate(() => window.__ws.openedAt);
  const state = () => p.evaluate(() => { const last = (window.__lines || []).slice(-1)[0] || null; const ps = (window.__phoneSaid || []).slice(-1)[0] || null; const ws = window.__ws;
    return { lines: (window.__lines || []).length, last, phoneAt: ps ? ps.at : 0, phone: ps ? ps.text : "", status: G.status, live: G.live, forced: !!G.forced, forcedStarted: !!(G.forced && G.forced.started), pendingForce: !!G.pendingForce, asked: !!G.asked, responding: !!G.responding, playing: playingLeft() > 0, openedAt: ws ? ws.openedAt : 0, form: typeof V !== "undefined" && V ? V.action : "", saves: (G.saves || []).length, events: window.__events.length, lastHeardAt: G.lastHeard ? G.lastHeard.at : 0 }; });
  const said = (text, tool) => p.evaluate(([text, tool]) => { window.__standIn.pendingTool = tool || null; window.__standIn.stepYes = /^yes\.?$/i.test(text) && /Do you want to do that now, yes or no\?\s*$/.test(window.__standIn.lastLine || ""); window.__lines.push({ text, at: Date.now(), from: "officer" });
    __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) }); __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_stopped" }) });
    __ws.onmessage({ data: JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript: text }) });
    // hands-free: the app asks for no reply itself after a transcript, the service answers on its own; the stand-in sends the tool call now, after its latency
    if (tool) setTimeout(() => { const ws = __ws; if (ws.readyState !== 1 || window.__standIn.pendingTool !== tool) return; window.__standIn.pendingTool = null;
      if (window.__cfg.rate && /^show_/.test(tool[0]) && window.__rnd() < window.__cfg.rates.wordsOnly * window.__cfg.rate) { window.__standIn.heldTool = tool; (window.__wordsOnly = window.__wordsOnly || []).push({ at: Date.now(), tool: tool[0], asks: 0, recovered: false }); window.__events.push({ at: Date.now(), fault: "words only, no tool call" });
        ws.say(/^show_contact_draft$/.test(tool[0]) && !tool[1].first ? "We'll fill in the form together as you talk." : /^show_/.test(tool[0]) && Object.keys(tool[1] || {}).length <= 1 ? "Sure, let's add that." : "Got it.", 0); return; } /* Ara talks but doesn't call the tool: the app asks her again (toolCheck) */
      tool = window.__standIn.pick(tool); window.__standIn.lastTool = tool[0]; window.__standIn.lastSent = tool; ws.deliver({ type: "response.created" }, 0); ws.deliver({ type: "response.output_audio.delta", delta: window.__silence }, 20); ws.deliver({ type: "response.function_call_arguments.done", call_id: "t" + Math.random().toString(36).slice(2), name: tool[0], arguments: JSON.stringify(tool[1]) }, 40); ws.deliver({ type: "response.done", response: { status: "completed" } }, 60); }, window.__latency()); }, [text, tool]);
  const bookCtx = { form: "", saves: 0, agenda: () => AGENDA[Math.min(bookCtx.saves, AGENDA.length - 1)], again: () => lastSaid && !/^(yes|no|save it|move on|in person)\.?$/i.test(lastSaid) ? lastSaid : bookCtx.agenda() /* a bare yes means nothing on its own: the officer says what they were doing */ };
  const spokenMs = (text) => Math.round((String(text).split(/\s+/).filter(Boolean).length / 2.7) * 1000) + 300; /* about 160 words a minute */
  const t0 = Date.now(); let seenLines = 0, seenEvents = 0;
  try {
    while (true) { if (Date.now() - t0 >= MAX_MS) { conv.ended = `ran out of time (${Math.round(MAX_MS / 60000)} min cap)`; break; }
      await p.waitForTimeout(150); const st = await state(); if (!st.live) { conv.ended = "the app ended the call: " + ((await p.evaluate(() => (ACT.q.filter(a => a.role === "end").pop() || { text: "" }).text).catch(() => "")) || "?").replace(/^Conversation ended\s*/, "").slice(0, 80); break; }
      bookCtx.form = st.form; form = st.form; bookCtx.saves = st.saves;
      if (st.events > seenEvents) { const ev = await p.evaluate((n) => window.__events.slice(n), seenEvents); conv.faults.push(...ev.map(e => Object.assign({}, e, { at: e.at - t0 }))); seenEvents = st.events; } /* the page's faults are stamped in page time; the report counts from the start */
      if (st.saves > conv.saves.length) { const sv = await p.evaluate(() => G.saves.slice()); conv.saves = sv; asksInRow = 0;
        if (DROP_AFTER_SAVE && rnd() < DROP_AFTER_SAVE) { conv.faults.push({ at: Date.now() - t0, fault: "drop after a save" }); await p.waitForTimeout(2500 + Math.round(rnd() * 3000)); await p.evaluate(() => { window.__events.push({ at: Date.now(), fault: "drop after a save" }); __ws.drop(); }); } /* no form is open: the reconnect must say where we were */ if (/Closed Won|Gift recorded/.test(sv.join(" "))) { conv.closedWon = true; } }
      if (conv.closedWon) { await p.waitForTimeout(2500); break; }
      // the last thing heard: Ara's line (its sound ends after its words), a phone recording, or the officer's own words
      const lastHeardEnd = Math.max(st.last ? st.last.at + (st.last.noaudio ? 0 : spokenMs(st.last.text)) : t0, st.phoneAt ? st.phoneAt + 1800 : 0);
      const silence = Date.now() - lastHeardEnd;
      // a new question from the app or Ara: the officer answers it once the sound would have finished
      if (st.lines > seenLines) { const fresh = await p.evaluate((n) => window.__lines.slice(n), seenLines); seenLines = st.lines;
        const qs = fresh.filter(l => l.from !== "officer"), q = qs.filter(l => /\?\s*$/.test(l.text)).pop() || qs.pop();
        if (q && Date.now() >= lastHeardEnd - 200) { await answer(q); continue; } else if (q) { seenLines -= fresh.length - fresh.indexOf(q); /* not finished playing: look again next tick */ continue; } }
      // the officer's patience: silence since the last sound, with nothing of his own left unanswered for less than the draw
      if (silence > waitLimit && Date.now() - lastAnswerAt > waitLimit) {
        const cause = st.status.startsWith("Reconnecting") || st.status.startsWith("Connecting") ? "line down (reconnecting)" : st.forced && !st.forcedStarted ? "scripted line not started" : st.pendingForce ? "scripted line waiting to be sent" : st.asked ? "reply requested, none started" : st.responding ? "reply started, no words yet" : st.openedAt > firstOpen && Date.now() - st.openedAt < 15000 ? "silent after a reconnect" : st.last && st.last.from !== "officer" && !/\?\s*$/.test(st.last.text) ? "no question asked (wording)" : "waiting on the voice service";
        conv.asks.push({ at: Date.now() - t0, silence: Math.round(silence / 100) / 10, cause, status: st.status, form: st.form, lastHeard: (st.phoneAt > (st.last ? st.last.at : 0) ? st.phone : st.last ? st.last.text : "").slice(0, 90), phoneLast: st.phoneAt > (st.last ? st.last.at : 0) });
        asksInRow++; lastAnswerAt = Date.now(); waitLimit = Math.max(patience(), 4000);
        if (asksInRow >= 3) { conv.hungUp = true; conv.ended = "hung up after three asks"; break; }
        await said("Are you there?", null); continue; }
      // officer turn faults
    }
  } catch (e) { conv.errors.push("harness: " + e.message.split("\n")[0]); }
  async function answer(q) {
    const line = q.text; let entry = BOOK.find(b => b.q.test(line)); if (!entry) { conv.unanswered.push(line.slice(0, 120)); return; }
    if (entry.q.source === "\\?$") conv.unanswered.push(line.slice(0, 120));
    const say = typeof entry.say === "function" ? entry.say(bookCtx) : entry.say; let tool = typeof entry.tool === "function" ? entry.tool(line, bookCtx) : entry.tool || null;
    if (/What would you like to do|What's next/i.test(line) || (say === bookCtx.agenda() && !tool)) tool = AGENDA_TOOL[Math.min(bookCtx.saves, AGENDA_TOOL.length - 1)];
    await p.waitForTimeout(800 + Math.round(rnd() * 1200)); /* a person takes a moment */
    const st = await state(); if (!st.live) return;
    conv.turns++; lastSaid = say; lastAnswerAt = Date.now(); waitLimit = patience(); asksInRow = 0;
    // faults thrown around this turn
    if (RATE && rnd() < RATES.drop * RATE) { const dead = rnd() < RATES.deadspot; const ms = 300 + Math.round(rnd() * 2500); conv.faults.push({ at: Date.now() - t0, fault: dead ? "drop + dead spot" : "drop" });
      setTimeout(() => {}, 0); await said(say, tool); await p.waitForTimeout(ms);
      await p.evaluate((dead) => { if (dead) { const h = 10000 + Math.round(window.__rnd() * 60000); window.__fault.tokenHang = h; window.__fault.tokenUntil = Date.now() + h; } __ws.drop(); }, dead); return; }
    if (RATE && rnd() < RATES.stall * RATE) { conv.faults.push({ at: Date.now() - t0, fault: "stall" }); await said(say, tool); await p.evaluate(() => __ws.stall(5000 + Math.round(window.__rnd() * 40000))); return; }
    if (RATE && rnd() < RATES.slowline * RATE) { conv.faults.push({ at: Date.now() - t0, fault: "slow line test" }); await p.evaluate(() => { window.__fault.pingHang = 9000; setTimeout(() => { window.__fault.pingHang = 0; }, 15000); }); }
    await said(say, tool);
  }
  conv.minutes = Math.round((Date.now() - t0) / 6000) / 10;
  conv.log = await p.evaluate(() => VLOG.slice(-400)).catch(() => []); conv.lines = await p.evaluate(() => window.__lines.map(l => `${l.at} ${l.from}: ${l.text}`)).catch(() => []); conv.guidance = await p.evaluate(() => window.__guidance || []).catch(() => []);
  if (process.env.DEBUG) { console.log(conv.lines.join("\n")); console.log(conv.log.join("\n")); console.log("GUIDANCE\n" + conv.guidance.join("\n")); if (conv.sync && conv.sync.falseNudgeNotes && conv.sync.falseNudgeNotes.length) console.log("ASKS WITH NO TOOL MISSING\n" + conv.sync.falseNudgeNotes.join("\n")); }
  conv.longest = Math.max(0, ...conv.asks.map(a => a.silence));
  conv.steps = await p.evaluate(stepsInPage).catch(() => null);
  conv.quiet = await p.evaluate(() => { /* stretches of silence: between one sound starting and the next (Ara's sounded lines, the officer's words, the phone's recordings), less the estimated length of the earlier one (2.5 words a second, recordings 2 s); Carverhill, Oct 30: never more than 5 or 6 s */
    const ev = (window.__lines || []).filter(l => !l.noaudio).map(l => ({ at: l.at, len: l.from === "officer" ? 0 : Math.min(12000, 400 * String(l.text).split(/\s+/).length) })).concat((window.__phoneSaid || []).map(s => ({ at: s.at, len: 2000 }))).sort((a, b) => a.at - b.at);
    const gaps = []; for (let i = 1; i < ev.length; i++) gaps.push(Math.max(0, ev[i].at - ev[i - 1].at - ev[i - 1].len) / 1000); return { longest: Math.round(10 * Math.max(0, ...gaps)) / 10, over: gaps.filter(g => g > 6.5).length, n: gaps.length }; }).catch(() => null);
  conv.sync = await p.evaluate(() => { const s = G.sync || { sent: 0, confirmed: 0, ms: [], missed: 0, resent: 0, guards: {}, guardsAfterReceipt: 0 }; const ms = s.ms.slice().sort((a, b) => a - b);
    const lines = (window.__lines || []).filter(l => l.from !== "officer"); let twice = 0; for (let i = 1; i < lines.length; i++) if (lines[i].text === lines[i - 1].text && lines[i].at - lines[i - 1].at < 30000 && !lines[i - 1].noaudio) twice++; /* the same line said twice within 30 s, the first with sound (the 7:41 PM repeat) */
    return { sent: s.sent, confirmed: s.confirmed, medianMs: ms.length ? ms[Math.floor(ms.length / 2)] : 0, maxMs: ms.length ? ms[ms.length - 1] : 0, missed: s.missed, resent: s.resent, guards: s.guards, guardsAfterReceipt: s.guardsAfterReceipt, lostReceipts: (window.__receipts || []).filter(r => r.lost).length, staleSaves: (window.__staleSaves || []).map(x => ({ why: x.why, recovered: x.recovered })), wordsOnly: (window.__wordsOnly || []).map(x => ({ tool: x.tool, asks: x.asks, recovered: x.recovered, on: x.recoveredOn || 0 })), falseNudges: (window.__falseNudges || []).length, falseNudgeNotes: (window.__falseNudges || []).map(x => x.instr), linesTwice: twice,
      ctx: { mode: window.__reconnectBy, asks: (window.__ctxAsks || []).map(a => ({ kind: a.kind, asks: a.asks, done: a.done, on: a.on || 0, misses: a.misses })), rows: (window.__ctxRows || []).map(r => r.text),
        // each reopen with no form open: what the officer heard next and how long after the line came back (the app's scripted line or Ara's composed one)
        heard: (window.__ctxRows || []).filter(r => /^(Reconnected|Line reopened): /.test(r.text) && !/the app says where we are and asks the pending question|the app says the scripted line the old line never started/.test(r.text)).map(r => { const l = (window.__lines || []).find(x => x.at > r.at && /^Sorry, I lost you for a moment/.test(x.text)); return { how: /where we were/.test(r.text) ? "where we were" : /whole last line|last question/.test(r.text) ? "Ara's last line again" : r.text.replace(/^(Reconnected|Line reopened): /, "").slice(0, 60), secs: l ? Math.round((l.at - r.at) / 100) / 10 : null, from: l ? l.from : "", bare: !!l && /^Sorry, I lost you for a moment\. What would you like to do\?$/.test(l.text), text: l ? l.text.slice(0, 120) : "" }; }) } }; }).catch(() => null);
  await p.evaluate(() => { try { endCall("harness conversation finished"); } catch (e) {} }).catch(() => {});
  await ctx.close(); return conv;
}

const { stateSection } = require("./state-section.js");
const { stepsInPage, stepsLines } = require("../steps.js");
if (require.main === module) (async () => {
  await new Promise(r => server.listen(0, r)); const base = `http://localhost:${server.address().port}/`;
  const args = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"];
  const browser = await chromium.launch(Object.assign({ args }, process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}));
  fs.mkdirSync(OUT, { recursive: true });
  const convs = new Array(CONVS); let next = 0;
  await Promise.all(Array.from({ length: Math.min(JOBS, CONVS) }, async () => { while (next < CONVS) { const i = next++; try { convs[i] = await conversation(browser, base, i + 1); } catch (e) { convs[i] = { n: i + 1, asks: [], faults: [], saves: [], errors: ["conversation failed: " + e.message], minutes: 0, unanswered: [] }; }
    const c = convs[i]; console.log(`${c.closedWon ? "✓" : c.hungUp ? "✗" : "·"} conversation ${c.n}: ${c.minutes} min, ${c.saves.length} saves, ${c.asks.length} asks${c.asks.length ? " (" + c.asks.map(a => a.silence + " s " + a.cause).join("; ") + ")" : ""}, ${c.faults.length} faults${c.sync ? `, state ${c.sync.confirmed}/${c.sync.sent} confirmed (median ${c.sync.medianMs} ms${c.sync.missed ? ", " + c.sync.missed + " missed" : ""})${c.sync.staleSaves.length ? ", stale save_form " + c.sync.staleSaves.filter(x => x.recovered).length + "/" + c.sync.staleSaves.length + " recovered" : ""}${c.sync.linesTwice ? ", " + c.sync.linesTwice + " line(s) said twice" : ""}` : ""}${c.ended ? ", " + c.ended : ""}${c.errors.length ? " [" + c.errors[0] + "]" : ""}`); } }));
  await browser.close(); server.close();
  const mins = convs.reduce((a, c) => a + (c.minutes || 0), 0), asks = convs.flatMap(c => c.asks), per10 = mins ? Math.round(asks.length / mins * 100) / 10 : 0;
  const by = {}; asks.forEach(a => { by[a.cause] = (by[a.cause] || 0) + 1; });
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const sil = asks.map(a => a.silence).sort((a, b) => a - b), med = sil.length ? sil[Math.floor(sil.length / 2)] : 0;
  const md = [`# "Are you there?" harness: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, "",
    `Officer: ${NAME}. ${convs.length} conversations, seed ${SEED}, fault rate ${RATE} (1 = Jim's calls). Stand-in voice service with lognormal reply delays (median 1.7 s). Timers at real speed.`, "",
    `**${asks.length} asks in ${mins} minutes: ${per10} per 10 minutes.** Median silence before an ask ${med} s, longest ${Math.max(0, ...sil)} s. ${convs.filter(c => c.closedWon).length} of ${convs.length} conversations reached Closed Won; ${convs.filter(c => c.hungUp).length} hung up after three asks. ${convs.flatMap(c => c.faults).length} faults thrown.`, "",
    "| Cause | Asks |", "|---|---|", ...Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`), "",
    "| Conversation | Minutes | Saves | Asks | Faults | Ended |", "|---|---|---|---|---|---|", ...convs.map(c => `| ${c.n} | ${c.minutes} | ${c.saves.length} | ${c.asks.map(a => `${a.silence} s (${a.cause})`).join("; ") || "none"} | ${c.faults.map(f => f.fault).join(", ") || "none"} | ${c.closedWon ? "Closed Won" : c.ended || ""}${c.errors.length ? " " + c.errors.join("; ") : ""} |`), "",
    "## Discrete steps and the app's scripted lines", "", ...stepsLines(convs), "",
    "## Silence", "", `Stretches with no sound (estimated, speaking time taken off): longest ${Math.max(0, ...convs.map(c => c.quiet ? c.quiet.longest : 0))} s; over 6.5 s: ${convs.reduce((a, c) => a + (c.quiet ? c.quiet.over : 0), 0)} of ${convs.reduce((a, c) => a + (c.quiet ? c.quiet.n : 0), 0)} stretches, in ${convs.filter(c => c.quiet && c.quiet.over).length} of ${convs.length} conversations.`, "",
    ...stateSection(convs),
    "## Each ask", "", "| Conv | At | Silence | Cause | Status | Form | Last heard |", "|---|---|---|---|---|---|---|", ...convs.flatMap(c => c.asks.map(a => `| ${c.n} | ${Math.round(a.at / 1000)} s | ${a.silence} s | ${a.cause} | ${a.status} | ${a.form || ""} | ${a.lastHeard.replace(/\|/g, "/")} |`)), "",
    "## Questions the answer book had no entry for", "", ...[...new Set(convs.flatMap(c => c.unanswered))].map(q => `- ${q}`), "",
    ...convs.flatMap(c => [`<details><summary>Conversation ${c.n} log</summary>`, "", "```", (c.log || []).join("\n").slice(0, 40000), "```", "</details>", ""])].join("\n");
  fs.writeFileSync(path.join(OUT, `report-${stamp}.md`), md); fs.writeFileSync(path.join(OUT, "latest.md"), md);
  fs.writeFileSync(path.join(OUT, `convs-${stamp}.json`), JSON.stringify({ officer: NAME, seed: SEED, rate: RATE, convs: convs.map(c => Object.assign({}, c, { log: undefined })) }, null, 1));
  console.log(`\n${asks.length} asks in ${mins} min: ${per10} per 10 min; causes ${JSON.stringify(by)}\nreport: ${path.join(OUT, `report-${stamp}.md`)}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.split("## Each ask")[0] + "\n");
})();
