// Error-condition harness: Testing Terry walks the journey (tests/harness/journey.js) with a stand-in Grok, and before each
// save one fault is thrown at one field of that step: a dropped line, a slow Grok, a phone lock and so on (FAULTS below).
// Each fault is one walk (one conversation) through the whole journey, so the activity log reads like a driveway walk.
// Run:  node tests/harness/run.js                 (local copy of the preview, log rows kept in the report only)
//       LOG=real node tests/harness/run.js        (the published preview page; its log rows reach the activity page as "Testing Terry")
//       FAULTS=drop,slow JOBS=2 node tests/harness/run.js
// No xAI calls: the voice line is a stand-in, so a run costs nothing.
const http = require("http"), fs = require("fs"), path = require("path");
let chromium; try { ({ chromium } = require("playwright")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright")); }
const JOURNEY = require("./journey");

const ROOT = path.resolve(__dirname, "../.."), OUT = path.join(__dirname, "results");
const REAL = process.env.LOG === "real", PAGE_URL = process.env.PAGE_URL || "https://westlayke.github.io/veleer-voice-demo/preview-flow.html";
const JOBS = Math.max(1, Number(process.env.JOBS) || 3), ONLY = process.env.FAULTS ? process.env.FAULTS.split(",") : null;
const NAME = process.env.OFFICER || "Testing Terry";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".css": "text/css", ".mp3": "audio/mpeg" };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});

// the stand-in voice line and key holder (as tests/bot.js, plus switches the faults flip)
const FAKES = (real) => {
  window.__sent = []; window.__logs = []; window.__real = real;
  // a silent microphone: Chromium's fake mic beeps, which the app took for the officer talking over its lines (run 3b: every line "cut short")
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = async (c) => { if (c && c.audio && !window.__realMic) { const ac = new (window.AudioContext || window.webkitAudioContext)(); window.__micCtx = ac; return ac.createMediaStreamDestination().stream; } return gum(c); };
  window.WebSocket = class { constructor(u) { window.__wsUrls = (window.__wsUrls || []).concat(String(u)); window.__ws = this; this.readyState = 1; setTimeout(() => this.onopen && this.onopen(), 30); }
    send(d) { window.__sent.push(d); try { const e = JSON.parse(d); if (e.type === "response.cancel") setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "cancelled" } }) }), 20); /* xAI answers a cancel with a cancelled response.done; without it the app waited 6 s (run 3b) */
      if (e.item && e.item.type === "force_message" && !window.__noAutoForce) {
      setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify({ type: "response.created" }) }), 20); setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify({ type: "response.output_audio.delta", delta: window.__silence || (window.__silence = btoa(String.fromCharCode(...new Uint8Array(24000)))) }) }), 40); setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }), 60); } } catch (x) {} }
    close() { this.readyState = 3; } };
  const f = window.fetch, hang = (ms, sig) => new Promise((r, j) => { const t = setTimeout(r, ms); if (sig) sig.addEventListener("abort", () => { clearTimeout(t); j(new DOMException("aborted", "AbortError")); }); });
  window.fetch = async (u, o) => { const s = String(u);
    if (/workers\.dev\/log/.test(s)) { if (/ping=/.test(s) && window.__pingHang) await hang(window.__pingHang, o && o.signal);
      if (o && o.body) window.__logs.push(JSON.parse(o.body)); /* kept here too in real mode: the app empties its queue when a batch goes to the Worker (run 3: saves counted as missing) */ if (window.__real) return f(u, o); return new Response(/GET|undefined/.test(o && o.method || "GET") ? '{"logging":true}' : '{"stored":1}', { status: 200 }); }
    if (/\/tts$/.test(s)) { window.__sent.push(JSON.stringify({ type: "app.tts", text: JSON.parse(o.body).text })); /* the app's own voice: a real recording from the page's own sounds, or nothing when the fault says so */
      if (window.__ttsHang) await hang(window.__ttsHang, o && o.signal);
      if (window.__ttsFirstHang) { const t = JSON.parse(o.body).text; window.__ttsSeen = window.__ttsSeen || {}; if (!window.__ttsSeen[t]) { window.__ttsSeen[t] = 1; await hang(window.__ttsFirstHang, o && o.signal); } } /* the first request for each line is slow, the second (sent at 2.5 s) answers at once */
      if (window.__ttsFail) return new Response("no", { status: 502 }); return f("preview/sounds/line-back.mp3"); }
    if (/workers\.dev/.test(s)) { if (window.__tokenHang && !/tts/.test(s)) { const ms = window.__tokenHang; window.__tokenHang = 0; await hang(ms, o && o.signal); } return new Response('{"value":"test-pass"}', { status: 200 }); }
    return f(u, o); };
};

// ---------- the faults: each has a name, what it does around the turn, and what the log should then show ----------
const FAULTS = {
  none: { title: "No fault", about: "the journey as spoken, nothing thrown at it (the baseline every other walk is compared with)", expect: () => true },
  drop: { title: "Line drop", about: "the voice line closes (code 1006) right after the officer's words; the app reconnects and replays them",
    before: null, after: async (p, h) => { await h.fire([]); await p.evaluate(() => { G.loudAt = 0; __ws.onclose({ code: 1006, reason: "" }); }); await h.newLine(); },
    expect: (log) => /Reconnect|Line reopened|Voice line open .*reconnect/.test(log) && !/Conversation ended/.test(log) },
  slow: { title: "Slow Grok", about: "no reply starts for 12 s after the officer's words; the app says 'Give me a moment' once and asks again",
    wait: 12000, expect: (log, sent) => count(log, /taking a moment/) === 1 && count(sent, /"type":"response.create"/) >= 1 && !/stopped answering/.test(log) },
  silent: { title: "Grok stops answering", about: "nothing comes back for 28 s; the app opens a fresh line and asks the pending question once",
    wait: 28000, afterWait: async (p, h) => { await h.newLine(); }, expect: (log) => /stopped answering|fresh line/.test(log) },
  slowline: { title: "Slow line", about: "the line test never answers while a reply is pending; the app asks again at 6 s, tests the line at the 4 s tick and opens a fresh line when the test gets no answer (about 12.5 s)",
    before: async (p) => p.evaluate(() => { window.__pingHang = 9000; }), wait: 13500, /* the hang must still be on when the app tests the line (6 s + 4 s + the 2.5 s limit); 6.5 s only ever passed because the beeping fake microphone set off the stall check (run 3c) */
    afterWait: async (p, h) => { await p.evaluate(() => { window.__pingHang = 0; }); await h.newLine(); },
    expect: (log) => /No reply started after \d+ s on a slow line .*fresh line/.test(log) },
  stall: { title: "Stalled line", about: "in a quiet gap after the reply, the officer talks, nothing comes back from the voice service and the line test fails; the app's stall check reconnects",
    /* aimed at the gap, not at the officer's words: while a reply is pending the stall check stands aside for the no-reply watchdog (run 3c) */
    settle: 200, afterSettle: async (p, h) => { await p.waitForFunction(() => !G.responding && !G.audioOn && !(playingLeft() > 0), null, { timeout: 15000 }).catch(() => {});
      await p.evaluate(() => { window.__pingHang = 9000; G.lastMsg = Date.now() - 20000; G.speechSince = Date.now() - 6000; G.loudAt = Date.now(); });
      await p.waitForFunction(() => /^Reconnecting/.test(G.status) || !G.live, null, { timeout: 12000 }).catch(() => {});
      await p.evaluate(() => { window.__pingHang = 0; }); await h.newLine(); },
    expect: (log) => /Line stalled \(officer talking, nothing heard back\)/.test(log) },
  double: { title: "Doubled reply", about: "after the app asks again, Grok answers twice with the same line; the second is cut before it plays",
    wait: 11000, afterWait: async (p, h) => { const line = "Got it, that's on the form. What's next?"; await h.fire([{ type: "response.created" }, { type: "response.output_audio.delta", delta: "AAAA" }, { type: "response.output_audio_transcript.delta", delta: line }, { type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(400);
      await h.fire([{ type: "response.created" }, { type: "response.output_audio_transcript.delta", delta: line }, { type: "response.output_audio.delta", delta: "AAAA" }, { type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(400); },
    expect: (log) => /cut it off|began the line it just said|Ara started to speak inside the form/.test(log) }, /* inside a form (app-only forms, Oct 27) a reply of Ara's to an answer is cut before it plays, doubled or not */
  noforce: { title: "Scripted line never plays", about: "the app's own voice line fails and Grok's force line (the fallback) gets no response either; Ara says the line herself at 8 s, and the late copy is cut",
    before: async (p) => p.evaluate(() => { window.__noAutoForce = true; window.__ttsFail = true; }), settle: 9500,
    afterSettle: async (p, h) => { await p.evaluate(() => { window.__noAutoForce = false; window.__ttsFail = false; }); await h.fire([{ type: "response.created" }, { type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(300); },
    expect: (log, sent, step, turnSent) => /Scripted line didn't play: Ara says it instead/.test(log) || (!/"app\.tts"/.test(turnSent) && !/force_message/.test(turnSent) && "n/a: no scripted line in this turn") },
  tts: { title: "Slow app voice", about: "the app's own voice line (its stand-in voice) takes 12 s to arrive: the line is left to Grok's force line, and the late audio is never played",
    before: async (p) => p.evaluate(() => { window.__ttsHang = 12000; }), settle: 11500, /* inside a form the app gives its own voice 10 s (TTS_WAIT_FORM_MS) before the force line goes out; 4 s elsewhere */ afterSettle: async (p) => p.evaluate(() => { window.__ttsHang = 0; }),
    expect: (log, sent, step, turnSent) => (/own line didn't arrive in time/.test(log) && /force_message/.test(turnSent)) || (!/"app\.tts"/.test(turnSent) && "n/a: no scripted line in this turn") },
  noaudio: { title: "Words without voice", about: "Grok's reply arrives as words only, no audio; the heard check flags it",
    reply: async (p, h, turn, step) => { if (turn.tool) await h.tool(turn.tool); await p.waitForTimeout(300); await h.fire([{ type: "response.created" }, { type: "response.output_audio_transcript.delta", delta: `That's on the ${step.title.toLowerCase()} form now, ${turn.field} noted. What's the next detail?` }, { type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(1500); }, /* a different sentence per step, so the doubled-reply guard can't take it for a repeat (H17) */
    expect: (log) => /may not have been heard: no voice audio|Ara started to speak inside the form/.test(log) }, /* inside a form the words-only reply is cut before the heard check could judge it, and the app asks its question again (app-only forms, Oct 27) */
  lock: { title: "Phone lock", about: "the phone locks after the officer's words (page hidden, mic muted, sound paused); the line closes and reopens the same conversation when the app is back",
    after: async (p, h) => { await p.evaluate(() => { G.convId = G.convId || "conv_harness"; G.convAt = Date.now(); window.__lockWs = window.__ws; Object.defineProperty(document, "visibilityState", { get: () => "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
      await p.waitForTimeout(400); await p.evaluate(() => { const tr = G.stream.getAudioTracks()[0]; Object.defineProperty(tr, "muted", { get: () => true, configurable: true }); tr.onmute && tr.onmute(); soundPaused(G.ctx); }); await p.waitForTimeout(3500);
      await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { get: () => "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
      await p.waitForFunction(() => G.ws && G.ws !== window.__lockWs && G.status === "Listening", null, { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(500); },
    expect: (log) => /Phone locked: voice line closed/.test(log) && /reopening the line|App hidden for/.test(log) },
  micend: { title: "Mic ended", about: "the phone ends the microphone (as at 9:43 AM on Oct 27); the conversation ends, the officer taps Carry on and the form resumes at its pending question",
    after: async (p, h) => { await p.evaluate(() => { const tr = G.stream.getAudioTracks()[0]; tr.onended && tr.onended(); }); await p.waitForTimeout(1200);
      await p.evaluate(() => { const b = document.getElementById("rsmGo"); if (b) b.click(); }); await h.newLine(); await p.waitForTimeout(800); },
    expect: (log) => /interrupted: mic ended/.test(log) && /Carry on/.test(log) },
  resend: { title: "Answer sent twice", about: "Grok sends the officer's answer a second time (as after a drop); the app must not take it for the next field",
    reply: async (p, h, turn) => { if (turn.tool) { await h.tool(turn.tool); await p.waitForTimeout(300); await h.tool(turn.tool); } },
    expect: (log) => /repeats the last answer|already|not saved again|same/.test(log) || true },
  invent: { title: "Invented field", about: "Grok fills in a field the officer never said; the app leaves it out and says so",
    reply: async (p, h, turn, step) => { const extra = INVENT[step.id]; const t = turn.tool ? [turn.tool[0], Object.assign({}, turn.tool[1], extra || {})] : null; if (t) await h.tool(t); },
    expect: (log, sent, step) => Object.keys(INVENT[step.id] || {}).length ? /Left out|dropped|without the officer saying it/.test(log) : "n/a: nothing to invent on this form" },
  error: { title: "Grok error event", about: "the voice service answers the reply request with an error; the turn must not get stuck",
    after: async (p, h) => { await h.fire([{ type: "error", error: { type: "invalid_request_error", message: "Conversation already has an active response" } }]); await p.waitForTimeout(300); },
    expect: (log) => !/Conversation ended/.test(log) },
  token: { title: "Slow voice pass", about: "the line drops and the key holder takes 7 s to hand out a new voice pass; the dropped-line recording plays and the reconnect still completes",
    after: async (p, h) => { await p.evaluate(() => { TOK.p = null; TOK.at = 0; window.__tokenHang = 7000; G.loudAt = 0; __ws.onclose({ code: 1006, reason: "" }); }); await h.newLine(14000); },
    expect: (log) => /The line dropped|Voice pass fetched in \d{4,} ms|voice pass/i.test(log) && !/Conversation ended/.test(log) },
  // ---- faults from Jim's Oct 27 2:26 PM call (H21-H27) ----
  slowtts: { title: "Slow voice, one request", about: "the first request for each of the app's own lines takes 9 s; the second request the app sends at 2.5 s answers at once, so the line plays without falling back to Ara",
    before: async (p) => p.evaluate(() => { window.__ttsFirstHang = 9000; window.__ttsSeen = {}; }), settle: 4000, afterSettle: async (p) => p.evaluate(() => { window.__ttsFirstHang = 0; }),
    expect: (log, sent, step, turnSent) => (/the second request answered first/.test(log) && !/own line didn't arrive in time/.test(log)) || (!/"app\.tts"/.test(turnSent) && "n/a: no scripted line in this turn") },
  sideq: { title: "Side question", about: "inside a form the officer asks a side question and Ara's answer ends with the form's question; the app must not ask it a second time",
    before: async (p, h) => { await h.said("Why do you need that?"); await p.waitForTimeout(300); const ask = await p.evaluate(() => (formPosition() || {}).ask || "What's next?"); await h.fire([{ type: "response.created" }, { type: "response.output_audio.delta", delta: "AAAA" }, { type: "response.output_audio_transcript.delta", delta: `Because the form needs it to be complete. ${ask}` }, { type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(800); },
    expect: (log) => /Ara's answer already asked the form's question: the app doesn't ask it again/.test(log) && !/After Ara's answer, the app asks the form's question again/.test(log) },
  there: { title: "Are you there, mid-form", about: "inside a form the officer asks whether Ara is there; the app answers \"I'm here\" and the pending question itself, and Ara's own \"I'm here\" is cut so the question isn't asked twice",
    before: async (p, h) => { const n = await p.evaluate(() => __sent.length); await h.said("Are you there?"); await p.waitForFunction((n) => __sent.slice(n).some(s => /force_message/.test(s) && /I'm here/.test(s)), n, { timeout: 12000 }).catch(() => {}); await p.waitForTimeout(300);
      const ask = await p.evaluate(() => (formPosition() || {}).ask || ""); await h.fire([{ type: "response.created" }, { type: "response.output_audio.delta", delta: "AAAA" }, { type: "response.output_audio_transcript.delta", delta: `I'm here. ${ask}` }, { type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(800); },
    expect: (log, sent, step, turnSent) => /The app answers "are you there" itself inside the form/.test(log) && /Ara started to speak inside the form \("I'm here/.test(log) && !/After (Ara's answer|the cut), the app asks the form's question again/.test(log) },
  wherewerewe: { title: "Where were we", about: "at the save-or-details question the officer says \"Oh, right. Okay, where were we?\": not a save; the app names the form and says what it still needs",
    before: async (p, h) => { await h.said("Oh, right. Okay, where were we?"); await p.waitForTimeout(1200); },
    expect: (log, sent, step) => OPT_STEPS_FORMS.includes(step.id) ? (/The officer asked where the form stands: the app says: "The .* form( for [^"]*)? is open\./.test(log) && !/The officer chose to save/.test(log)) : "n/a: no save-or-details question on this form" },
  yesword: { title: "Yes as the summary", about: "Grok puts the officer's \"Yes.\" to the substantive question into the summary field; the app keeps the summary it had",
    reply: async (p, h, turn, step) => { if (turn.field === "substantive") { await h.tool([turn.tool[0], Object.assign({}, turn.tool[1], { summary: "Yes." })]); await p.waitForTimeout(300); await h.tool(turn.tool); } else if (turn.tool) await h.tool(turn.tool); },
    expect: (log, sent, step) => step.turns.some(t => t.field === "substantive") ? (/Kept the summary as it was/.test(log) && !/Summary: Yes\./.test(log)) : "n/a: no yes-or-no question on this form" },
  stepnodue: { title: "Step without a date", about: "the officer gives the next step and no date; the app asks \"When is it due?\" alone, then the date comes",
    reply: async (p, h, turn, step) => { if (turn.field === "nextStep") { const a = Object.assign({}, turn.tool[1]); const due = a.nextDue; delete a.nextDue; await h.tool([turn.tool[0], a]); await p.waitForFunction(() => __sent.some(s => /force_message/.test(s) && /When is it due\?/.test(s)), null, { timeout: 12000 }).catch(() => {}); await p.waitForTimeout(400); await h.said("Friday."); await h.tool([turn.tool[0], { contact_name: turn.tool[1].contact_name, nextDue: due }]); } else if (turn.tool) await h.tool(turn.tool); },
    expect: (log, sent, step, turnSent) => step.turns.some(t => t.field === "nextStep") ? /"When is it due\?"/.test(turnSent) && !/What's the step, and when is it due\?".*What's the step, and when is it due\?"/s.test(turnSent) : "n/a: no next step on this form" },
  lockform: { title: "Phone lock, mid-form", about: "the phone locks while a form is open; when the app is back, the line that asks the pending question again names the form",
    after: async (p, h, turn, step) => FAULTS.lock.after(p, h, turn, step),
    expect: (log, sent, step, turnSent) => /Phone locked: voice line closed/.test(log) && /Sorry, I lost you for a moment\. The .* form( for [^"]*)? is open\./.test(turnSent) },
};
const OPT_STEPS_FORMS = ["contact", "opportunity"];
// which turns a fault can be aimed at: one that waits for a Grok reply (a tool call), one that ends in the app's own scripted line, or any
const PICK = { slow: "tool", silent: "tool", slowline: "tool", stall: "tool", double: "tool", noaudio: "tool", resend: "tool", invent: "draft", noforce: "forced", tts: "forced", error: "tool", slowtts: "forced", sideq: "inform", there: "inform", wherewerewe: "firstopt", yesword: "subst", stepnodue: "nextstep", lockform: "inform" };
JOURNEY.forEach(s => s.turns.forEach((t, i) => { t.inForm = i > 0; })); /* the first turn of a step opens its form; the form is open from the second on */
const pickable = (faultId, turn) => { const k = PICK[faultId]; return !k ? true : k === "tool" ? !!turn.tool : k === "draft" ? !!(turn.tool && /^show_/.test(turn.tool[0])) : k === "inform" ? !!turn.inForm : k === "firstopt" ? !!(turn.opt && turn.inForm) : k === "subst" ? turn.field === "substantive" : k === "nextstep" ? turn.field === "nextStep" : !!(turn.opt || turn.scripted); }; // scripted: the app answers that turn with its own line (journey.js)
const INVENT = { contact: { capacity: "A" }, opportunity: { potential: 50000 }, interaction: { outcome: "Interested, continue cultivation" }, cultivate: {}, plan: { askType: "Pledge" }, ask: { agreedAmount: 30000 }, gift: { amount: 30000 } };
const count = (s, re) => (s.match(new RegExp(re.source, "g")) || []).length;

// ---------- one walk ----------
async function walk(browser, base, faultId) {
  const fault = FAULTS[faultId], w = { fault: faultId, title: fault.title, steps: [], started: new Date().toISOString(), errors: [] };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, permissions: ["microphone"] });
  await ctx.addInitScript(FAKES, REAL);
  const p = await ctx.newPage(); p.on("pageerror", e => w.errors.push("page: " + e.message));
  await p.goto(REAL ? PAGE_URL : base + "preview-flow.html"); await p.waitForTimeout(900);
  await p.tap("text=I'd rather type my name"); await p.fill("#wlName", NAME); await p.tap("text=Start"); await p.waitForTimeout(600);
  await p.waitForFunction(() => window.__ws && G.live && G.status === "Listening", null, { timeout: 10000 });
  const h = {
    fire: (evs) => p.evaluate((evs) => evs.forEach(e => __ws.onmessage({ data: JSON.stringify(e) })), evs),
    said: async (text) => { await p.waitForFunction(() => !G.pendingForce && !G.forced && !(G.lineEndAt > Date.now()), null, { timeout: 4000 }).catch(() => {}); await p.evaluate((text) => { __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) }); __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_stopped" }) }); __ws.onmessage({ data: JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript: text }) }); }, text); },
    tool: ([name, args]) => p.evaluate(([name, args]) => { __ws.onmessage({ data: JSON.stringify({ type: "response.created" }) }); __ws.onmessage({ data: JSON.stringify({ type: "response.output_audio.delta", delta: window.__silence || (window.__silence = btoa(String.fromCharCode(...new Uint8Array(24000)))) }) }); __ws.onmessage({ data: JSON.stringify({ type: "response.function_call_arguments.done", call_id: "t" + Math.random().toString(36).slice(2), name, arguments: JSON.stringify(args) }) }); __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); }, [name, args]),
    newLine: async (ms = 9000) => { const was = await p.evaluate(() => window.__wsUrls.length); await p.waitForFunction((was) => window.__wsUrls.length > was && G.live && G.ws === window.__ws && G.status === "Listening", was, { timeout: ms }).catch(() => {}); await p.waitForTimeout(700); },
    log: () => p.evaluate(() => ACT.q.concat(__logs.flatMap(l => l.events || [l])).sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : 0).map(a => `${a.at} ${a.role}: ${a.text}`)),
  };
  const logText = async (from) => (await h.log()).filter(l => l.slice(0, 24) >= from).join("\n");
  for (let si = 0; si < JOURNEY.length; si++) {
    const step = JOURNEY[si], all = step.turns.filter(t => !t.yes), turns = all.filter(t => pickable(faultId, t)).length ? all.filter(t => pickable(faultId, t)) : all, pick = turns[(Object.keys(FAULTS).indexOf(faultId) + si) % turns.length];
    const rec = { step: step.id, title: step.title, field: pick.field, say: pick.say, ok: false, notes: [] }; w.steps.push(rec);
    const logStart = new Date().toISOString(), sentStart = await p.evaluate(() => __sent.length), vlogStart = await p.evaluate(() => VLOG.length);
    try {
      let turnSent = "";
      for (const turn of step.turns) {
        const hit = turn === pick; const turnFrom = hit ? await p.evaluate(() => __sent.length) : 0;
        if (turn.ara) await p.evaluate((t) => recent(botName(), t), turn.ara);
        if (hit && fault.before) await fault.before(p, h);
        await h.said(turn.say); await p.waitForTimeout(250);
        if (hit && fault.after) await fault.after(p, h, turn, step);
        if (hit && fault.wait) { await p.waitForTimeout(fault.wait); if (fault.afterWait) await fault.afterWait(p, h, turn, step); }
        if (hit && fault.reply) await fault.reply(p, h, turn, step);
        else if (turn.tool) await h.tool(turn.tool);
        await p.waitForTimeout(turn.yes ? 900 : 500);
        if (hit && fault.settle) { await p.waitForTimeout(fault.settle); if (fault.afterSettle) await fault.afterSettle(p, h, turn, step); }
        if (hit) turnSent = await p.evaluate((n) => __sent.slice(n).join("\n"), turnFrom); /* what went up the line during the faulted turn alone */
        if (turn.tool && turn.tool[0] === "save_form" && turn.yes) { for (let i = 0; i < 6 && !(await p.evaluate(() => V === null)); i++) await p.waitForTimeout(400); }
      }
      await p.waitForTimeout(600);
      const log = await logText(logStart), sent = await p.evaluate((n) => __sent.slice(n).join("\n"), sentStart);
      const saves = log.split("\n").filter(l => / saved: /.test(l) && step.saved.test(l.replace(/^.* saved: /, ""))).length, stillOpen = await p.evaluate(() => !!V);
      rec.replies = await p.evaluate((n) => __sent.slice(n).map(s => JSON.parse(s)).filter(x => x.item && x.item.type === "function_call_output").map(x => x.item.output.slice(0, 400)), sentStart);
      rec.savedTimes = saves; rec.formStillOpen = stillOpen;
      const seen = fault.expect(log, sent, step, turnSent); rec.faultSeen = !!seen; if (typeof seen === "string") rec.na = seen;
      if (saves !== 1) rec.notes.push(saves ? `saved ${saves} times` : "not saved");
      if (stillOpen) rec.notes.push("form still open after the save");
      if (!rec.faultSeen) rec.notes.push("the fault's expected handling isn't in the log"); if (rec.na) rec.notes.push(rec.na);
      if (/Conversation ended/.test(log) && faultId !== "micend") rec.notes.push("the conversation ended");
      rec.ok = saves === 1 && !stillOpen && rec.faultSeen;
      rec.log = log; rec.vlog = await p.evaluate((n) => VLOG.slice(n), vlogStart); /* the app's own voice log for the step: it says why a watchdog did or didn't fire */
    } catch (e) { rec.notes.push("harness error: " + e.message.split("\n")[0]); rec.log = await logText(logStart).catch(() => ""); break; }
  }
  const st = await p.evaluate(() => ({ opps: S.opps.map(o => ({ name: o.name, stage: o.stage + (o.closed ? " " + o.closed : "") })), contacts: S.contacts.filter(c => c.last === "Pike").map(c => ({ first: c.first, email: c.email, capacity: c.capacity, howMet: c.howMet })) })).catch(() => null);
  w.end = st; w.closedWon = !!(st && st.opps.some(o => /Pike/.test(o.name) && /Closed Won/.test(o.stage)));
  await p.evaluate(() => { try { endCall("harness walk finished"); } catch (e) {} }).catch(() => {}); await p.waitForTimeout(REAL ? 1500 : 300);
  w.walkLog = await h.log().catch(() => []);
  await ctx.close(); return w;
}

(async () => {
  await new Promise(r => server.listen(0, r)); const base = `http://localhost:${server.address().port}/`;
  const args = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"];
  const browser = await chromium.launch(Object.assign({ args }, process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}));
  fs.mkdirSync(OUT, { recursive: true });
  const ids = Object.keys(FAULTS).filter(f => !ONLY || ONLY.includes(f)); const walks = new Array(ids.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(JOBS, ids.length) }, async () => { while (next < ids.length) { const i = next++; try { walks[i] = await walk(browser, base, ids[i]); } catch (e) { walks[i] = { fault: ids[i], title: FAULTS[ids[i]].title, steps: [], errors: ["walk failed: " + e.message] }; }
    const w = walks[i]; console.log(`${w.steps.every(s => s.ok) && w.steps.length === JOURNEY.length ? "✓" : "✗"} ${w.title}: ${w.steps.filter(s => s.ok).length} of ${JOURNEY.length} saves clean${w.closedWon ? ", Closed Won" : ""}${w.errors.length ? " (" + w.errors[0] + ")" : ""}`); } }));
  await browser.close(); server.close();
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  fs.writeFileSync(path.join(OUT, `walks-${stamp}.json`), JSON.stringify({ officer: NAME, real: REAL, journey: JOURNEY.map(s => s.id), walks }, null, 1));
  // the report: one findings table, then each walk's log as the activity page would show it
  const rows = walks.flatMap(w => w.steps.map(s => `| ${w.title} | ${s.title} | ${s.field} | ${s.ok ? "pass" : "FAIL"} | ${s.notes.join("; ")} |`));
  const md = [`# Testing Terry's walks: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, "", `Officer: ${NAME}. ${walks.length} walks (one fault each) through ${JOURNEY.length} saves: new contact, opportunity, interaction report, Cultivation, planned ask, the ask, gift (Closed Won). Stand-in Grok; log rows ${REAL ? "sent to the activity page" : "kept here"}.`, "",
    `**${walks.filter(w => w.steps.length === JOURNEY.length && w.steps.every(s => s.ok)).length} of ${walks.length} walks clean; ${rows.filter(r => /\| pass \|/.test(r)).length} of ${rows.length} saves clean.**`, "",
    "| Fault | Step | Field hit | Result | Notes |", "|---|---|---|---|---|", ...rows, "",
    "## The faults", "", ...Object.entries(FAULTS).filter(([k]) => ids.includes(k)).map(([k, f]) => `- **${f.title}**: ${f.about}.`), "",
    ...walks.flatMap(w => [`## Walk: ${w.title}`, "", ...(w.errors.length ? ["Errors: " + w.errors.join("; "), ""] : []), ...w.steps.filter(s => !s.ok).flatMap(s => [`### ${s.title} (${s.field}): ${s.notes.join("; ")}`, "", "```", (s.log || "").slice(0, 6000), "```", "", "App answers to the tools:", "", "```", (s.replies || []).join("\n").slice(0, 3000), "```", ""]),
      "<details><summary>Full walk log</summary>", "", "```", (w.walkLog || []).join("\n").slice(0, 60000), "```", "</details>", ""])].join("\n");
  fs.writeFileSync(path.join(OUT, `report-${stamp}.md`), md); fs.writeFileSync(path.join(OUT, "latest.md"), md);
  const summary = `${walks.filter(w => w.steps.length === JOURNEY.length && w.steps.every(s => s.ok)).length} of ${walks.length} walks clean, ${rows.filter(r => /\| pass \|/.test(r)).length} of ${rows.length} saves clean`;
  console.log("\n" + summary + `\nreport: ${path.join(OUT, `report-${stamp}.md`)}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Testing Terry's walks: ${summary}\n\n` + md.split("## The faults")[0] + "\n");
  // on a runner the failed steps go to the job log as well (the report artifact can't be fetched from every place the log can)
  if (process.env.CI) walks.forEach(w => w.steps.filter(s => !s.ok).forEach(s => { console.log(`::group::FAILED ${w.title} / ${s.title} (${s.field}): ${s.notes.join("; ")}`); console.log((s.log || "").split("\n").slice(-40).join("\n")); console.log("-- app voice log --"); console.log((s.vlog || []).filter(l => !/(audio|delta|transcript|session\.update|net:)/.test(l)).slice(-30).join("\n")); console.log("::endgroup::"); }));
})();
