"use strict";
// Citizens VCRM demo: keeping the voice line to Grok alive (loaded after voice.js; all files share one scope).
// Voice passes, opening the line and reopening it when it drops, line tests and connection readings, stall and
// quiet detection, asking Grok again when it goes silent, and the sounds and spoken line when the service is down.
// What Ara is told after a reconnect is reconnectLine() below; the doubled-reply guard is in onEvent() in voice.js.

/* ---------- timings: tune here ---------- */
const IDLE_MS = 12000, IDLE_HF_MS = 30000;   // hang up after this much quiet (hands-free: a driver may take a while to answer)
const IDLE_FORM_MS = 60000;                  // with a form open and waiting on the officer, twice that (Carverhill Oct 28 4:12 PM: the service took 20 to 29 s a reply, then the call hung up with the form open)
const STILL_WAIT_MS = 10000;                 // while a reply is outstanding, after "Ara's taking a moment." the phone says "Still waiting on Ara." this often (never a long silence)
const NOISE_CAP_MS = 60000;                  // sound on the mic counts as talking, but not for longer than this (road noise)
const STALL_MS = 5000, SPEAK_RMS = 0.04, GAP_SPEECH_MS = 400; // GAP_SPEECH_MS: sound on the mic this long while the line is down counts as the officer talking (a bump of road noise doesn't)     // officer's voice on the mic this long with no word from the voice service: the line may be dead
const LINE_TEST_MS = 3000;                   // how long a line test (a tiny request to the key holder) may take before it counts as failed
const SLOW_LINE_MS = 2000;                   // a line test slower than this is a slow line: open a fresh one rather than ask Grok again
const STALL_SLOW_MS = 2500;                  // while the officer is talking, a line test slower than this counts as a stall
const MAX_DROPS = 3;                         // reconnect tries shown in the log as "n of 3"; the call no longer ends by count (Oct 25: a driveway dead spot took 4)
const NO_LINE_GIVE_UP_MS = 600000;           // the call ends only after this long without a word from the voice service, while the phone keeps reconnecting (10 minutes, Carverhill Oct 29; 8 minutes from Oct 28: a colleague's 8-minute dead spot; 5 minutes from Oct 25: a 3-minute driveway dead spot outlasted the old 2-minute limit by 5 s)
const RECONNECT_DELAYS = [0, 1000, 4000, 10000]; // wait before reconnect try 1, 2, 3, spread out so a short dead spot can pass
const OFFLINE_WAIT_MS = 15000;               // when the phone says it's offline, wait up to this long for it to come back
const SECOND_LINE_MS = 5000;                 // a new line not open after this long gets a second one alongside
const OPEN_TIMEOUT_MS = 10000;               // a new line not open after this long counts as a failed try
const MAX_ASKS = 1;                          // times the app asks Grok again for a reply before opening a fresh line
const TICK_MS = 4000;                        // soft tick while waiting, and the early line test when no reply has started
const ASK_AGAIN_MS = 10000;                  // ask Grok again when no reply has started by now (Grok sometimes takes 6 to 10 s)
const TURN_TEST_MS = 8000, TURN_GIVE_UP_MS = 12000; // the officer's own turn with no reply started: line test at 8 s, fresh line at 12 s (the tick at TICK_MS)
const EARLY_PING_MS = 2500;                  // the early line test's limit
const RESUME_MS = 25 * 60000;               // a line reopened within this long picks up the same conversation on xAI (kept 30 minutes)
const CANCEL_SETTLE_MS = 700;                // a scripted line waits this long after a response.cancel (Oct 28: forced in the same instant, the line came back as words with no audio)
const SOUND_WAIT_MS = 6000;                  // a scripted line whose reply was created but has no sound by now counts as not started (5:59 PM call, Oct 29: acknowledged in 0.8 s, nothing for 23 s)
const TWO_Q_MS = 12000;                      // Ara's own question stands over the scripted one only this soon after it was sent; later, the scripted line is news the officer hasn't heard
const FORCE_WAIT_MS = 8000;                  // a scripted line that hasn't started by now is said by Ara instead (3 s was too short on a slow line, Oct 25; 5 s still fell back 5 times in the 4:42 PM call, lines then played late)
const REPLAY_MS = 20000, REPLAY_BEFORE_MS = 90000; // ...and only when the earlier call came within 90 s before the drop                     // a tool call repeated this soon after a picked-up conversation, identical to one made before the drop, is the service replaying it (Oct 28)
const LATE_FORCE_MS = 90000;                 // a scripted line that then plays late, after Ara said it, is cut as a duplicate within this long (25 s until Oct 28 4:12 PM: Ara took 29 s and the officer heard the line twice)
const TOKEN_WAIT_MS = 6000;                  // a voice pass that takes longer counts as failed (Oct 25: one took 89 s, the next never came back and the call hung)
const TOKEN_RETRY_MS = 2000;                 // between tries for a voice pass while the line is down
const DOWN_GIVE_UP_MS = 600000;              // a line down this long (no voice pass to be had) ends the call with the phone's spoken notice (10 minutes, as above)
const WARN_GIVE_UP_MS = 480000, LAST_TRY_MS = 40000;  // a try that starts within 40 s of the limit is the last one, and said so              // from 8 minutes down the phone says it will stop trying at 10, and the last try is announced (Carverhill, Oct 29)
const SAY_DOWN_MS = 5000, SAY_STILL_MS = 12000, SAY_REPEAT_MS = 10000; // the phone's own spoken lines while the line is down (Carverhill, Oct 25)
const SAY_SLOW_AFTER_MS = 60000, SAY_REPEAT_LATER_MS = 30000; // after the first minute down, "Still trying" comes every 30 s instead of every 10 s (a long dead spot shouldn't nag)
const downRepeatMs = () => Date.now() - (G.downAt || Date.now()) >= SAY_SLOW_AFTER_MS ? SAY_REPEAT_LATER_MS : SAY_REPEAT_MS;
const DOWN_LINES = ["The line dropped. Reconnecting you to Ara.", "Still trying to reconnect.", "Still no signal. I'll keep trying for two more minutes, then hang up.", "This is my last try."]; // recorded in sounds/ (line-dropped, still-trying, line-back): the phone's own speech is silent during a call on an iPhone (Oct 25)
const LINE_FILES = { dropped: "line-dropped.mp3", still: "still-trying.mp3", back: "line-back.mp3", slow: "ara-slow.mp3", warn: "line-warn.mp3", last: "line-last.mp3" }, lineRaw = {}, lineBuf = {};
// the same lines with the officer's name, in the phone's stand-in voice (Eve, the same voice as the stock recordings since Oct 28: one voice for every phone line), made by the key holder's text-to-speech while the phone has signal and kept on the
// phone (Carverhill, Oct 28: a colleague driving an 8-minute dead spot should hear her name and that the app isn't giving up); the recordings above are the fallback
const NAMED_LINES = {
  dropped: (n) => `The line dropped, ${n}. Reconnecting you to Ara.`,
  still: [(n) => `Still trying, ${n}. I'm not giving up on you.`, (n) => `Hang in there, ${n}. I'll keep knocking until Ara answers.`, (n) => `No signal yet, ${n}, but I'm as determined as ever.`,
    (n) => `Still at it, ${n}. A dead spot won't beat us.`, (n) => `Not there yet, ${n}. I'll keep trying for as long as it takes.`, (n) => `Still trying, ${n}. I won't give up before the signal does.`],
  back: (n) => `You're back with Ara, ${n}.`,
  warn: (n) => `Still no signal, ${n}. I'll keep trying for two more minutes, then hang up.`, last: (n) => `This is my last try, ${n}.`,
};
const NAMED_VOICE = "eve", NAMED_KEY = "namedLines:v4", namedRaw = {}, namedBuf = {};
// phone lines without a name, made and kept the same way (the stock recordings have no words for these)
const STILL_WAIT_TEXT = "Still waiting on Ara.", HANGUP_TEXT = "I'll hang up for now. Tap the mic when you need me.", HANGUP_FORM_TEXT = "I'll hang up for now. Your form stays on the screen.";
const PHONE_LINES = [STILL_WAIT_TEXT, HANGUP_TEXT, HANGUP_FORM_TEXT];
const officerFirst = () => { const n = String((typeof S !== "undefined" && S.settings && S.settings.userName) || "").trim().split(/\s+/)[0] || ""; return n ? n[0].toUpperCase() + n.slice(1) : ""; };
const namedTexts = (n) => (n ? [NAMED_LINES.dropped(n), ...NAMED_LINES.still.map(f => f(n)), NAMED_LINES.back(n), NAMED_LINES.warn(n), NAMED_LINES.last(n)] : []).concat(PHONE_LINES);
const namedText = (kind, i) => { const n = officerFirst(); if (!n) return ""; return kind === "still" ? NAMED_LINES.still[i % NAMED_LINES.still.length](n) : NAMED_LINES[kind] ? NAMED_LINES[kind](n) : ""; };
const b64buf = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
const bufb64 = (b) => { const u = new Uint8Array(b); let s = ""; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); };
function namedLoad() { let st = null; try { st = JSON.parse(localStorage.getItem(NAMED_KEY) || "null"); } catch (e) {} if (!st || st.name !== officerFirst() || !st.lines) return; Object.entries(st.lines).forEach(([t, b]) => { if (!namedRaw[t]) { try { namedRaw[t] = b64buf(b); } catch (e) {} } }); }
function decodeNamed() { const c = G.ctx; if (!c) return; Object.entries(namedRaw).forEach(([t, b]) => { if (!namedBuf[t] && b) c.decodeAudioData(b.slice(0)).then(buf => { namedBuf[t] = buf; }).catch(() => {}); }); }
// fetched once per name (the key holder keeps each line 30 days, so the second phone with the same name waits on nobody), never while a line is down
async function prepNamedLines(why) {
  const n = officerFirst(); if (G.namedBusy || G.downAt || !navigator.onLine) return; namedLoad();
  const want = namedTexts(n).filter(t => !namedRaw[t]); if (!want.length) { decodeNamed(); return; }
  G.namedBusy = true; let got = 0, fail = "";
  for (const t of want) { try { const r = await fetch(tokenUrl() + "/tts", { method: "POST", headers: { "Content-Type": "application/json", "X-Demo-Code": S.settings.demoCode || DEMO_CODE }, body: JSON.stringify({ text: t, voice: NAMED_VOICE }), signal: AbortSignal.timeout(15000) }); /* the demo code too: without it the key holder refused every line (Oct 28, never fetched on any phone) */
    if (!r.ok || !/audio/.test(r.headers.get("content-type") || "")) { fail = "answer " + r.status; continue; } const b = await r.arrayBuffer(); if (b.byteLength) { namedRaw[t] = b; got++; } } catch (e) { fail = e && e.name === "TimeoutError" ? "no answer in 15 s" : "no connection"; } }
  G.namedBusy = false;
  if (!got && fail) vlog(`Phone lines not fetched (${why}): ${fail}; the stock recordings stand in`); /* voice log only: an activity row here kept resetting the log batch timer (the "fetched" row is the sign it worked) */
  if (got) { const lines = {}; namedTexts(n).forEach(t => { if (namedRaw[t]) lines[t] = bufb64(namedRaw[t]); }); try { localStorage.setItem(NAMED_KEY, JSON.stringify({ name: n, lines })); } catch (e) {}
    vlog(`${got} phone lines${n ? " with " + n + "'s name" : ""} fetched (${why})`); act("step", `${got} phone line${got === 1 ? "" : "s"}${n ? " with " + n + "'s name" : ""} fetched (${why}): the phone keeps them for a dead spot or a slow reply`); }
  decodeNamed();
}
const LOC_FRESH_MS = 120000;                // a position older than this is not written into a connection row
const STABLE_MS = 20000;                     // a line open this long before it drops starts the reconnect count afresh (separate drops on a drive aren't one failure)
const SOUND_BACK_MS = 6000;
const MIC_BACK_MS = 45000;
const LOCK_CLOSE_MS = 3000;                  // the phone locking (or a switch to another app) hides the page: the line is closed this long after, so nothing is charged while the phone sits locked, and reopened when the app is back (Oct 26 pocket tests: a locked iPhone mutes the mic and pauses the sound anyway)
const LOCK_MAX_MS = RESUME_MS;               // hidden longer than this (the conversation can no longer be picked up on xAI) ends the call with the Carry on card
/* MIC_BACK_MS: a muted mic gets longer than the sound, since iOS shows "Audio Recording / Stop audio recording?" and the mic is back on Cancel, which takes a reach (Oct 26 drive). SOUND_BACK_MS: when the phone pauses the app's sound (a notification, Siri, another app), keep the call this long while it comes back */

// a voice pass lasts 30 minutes (5 until Oct 28; the Worker mints it): fetch one when the app opens or comes back, so tapping the mic doesn't wait for it (also wakes the Cloudflare service)
const TOK = { p: null, at: 0 }, PASS_REFRESH_MS = 20 * 60e3, PASS_FRESH_MS = 25 * 60e3;
function prefetchToken() {
  if (document.visibilityState !== "visible" || (TOK.p && Date.now() - TOK.at < PASS_REFRESH_MS)) return; // during a call too, so a dropped line reconnects without waiting for a new pass
  TOK.at = Date.now(); TOK.p = mintToken(); TOK.p.catch(() => { TOK.p = null; TOK.at = 0; });
}
function getToken() { // each pass is used once; an old or failed one is replaced by a fresh fetch
  const p = TOK.p, fresh = p && Date.now() - TOK.at < PASS_FRESH_MS; TOK.p = null; TOK.at = 0;
  return fresh ? p.catch(() => mintToken()) : mintToken();
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") prefetchToken(); });
setInterval(prefetchToken, 60000); // keeps a pass ready while the app sits open
async function mintToken(limit = TOKEN_WAIT_MS) {
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), limit); let r;
  try { r = await fetch(tokenUrl(), { method: "POST", headers: { "X-Demo-Code": S.settings.demoCode || DEMO_CODE, "Content-Type": "application/json" }, body: JSON.stringify({ provider: provider() }), signal: ac.signal }); } /* the key holder mints a pass for the chosen voice engine */
  catch (e) { throw new Error(ac.signal.aborted ? `no answer in ${limit / 1000} s` : "no connection"); } finally { clearTimeout(to); }
  if (!r.ok) throw new Error(r.status === 401 ? "bad_code" : "service_" + r.status);
  const j = await r.json();
  const t = j.value || (j.client_secret && (j.client_secret.value || j.client_secret)) || j.token || j.secret;
  if (!t || typeof t !== "string") throw new Error("token_shape");
  return t;
}
// Grok bills for every minute a conversation is open, so hang up after 12 seconds with no talking and no taps
const idleMs = () => typeof V !== "undefined" && V && ACTIONS[V.action] ? Math.max(IDLE_FORM_MS, G.hands ? IDLE_HF_MS : IDLE_MS) : G.hands ? IDLE_HF_MS : IDLE_MS;
// The officer's own turn (Oct 29, Patient Pat's first run: 34 of 135 "are you there?"s were a reply slow to start after the officer's words).
// In hands-free the voice service answers the officer on its own, so the app had asked for nothing and the tick, the line test and the fresh
// line never ran; the officer sat in silence until the hang-up. The same ladder as a scripted line: "Ara's taking a moment." at TICK_MS, a line
// test at TURN_TEST_MS (slow line: fresh line, which asks "Could you say that again?"; healthy: one reply request with their words, then the
// usual watch), a fresh line at TURN_GIVE_UP_MS whatever happened. The hang-up is held off while a turn is open. No words from the turn: noise.
function turnWatch() {
  if (!G.live || !G.turnOpen || G.asked || G.forced || G.pendingForce || G.responding || G.audioOn || G.idleEnding || /^(Connecting|Reconnecting)/.test(G.status)) return;
  const heard = G.lastHeard && G.lastHeard.at >= G.turnOpen - 1500 ? String(G.lastHeard.text || "") : "", dt = Date.now() - G.turnOpen;
  if (!heard) { if (dt > TURN_TEST_MS) G.turnOpen = 0; return; }
  if (dt >= TICK_MS && !G.turnStep) { G.turnStep = 1; if (!G.slowSaid) { if (sayLocal("Ara's taking a moment.", "slow")) { G.slowSaid = true; G.slowAt = Date.now(); } else cue("wait"); }
    act("step", `No reply started ${TICK_MS / 1000} s after the officer spoke ("${heard.slice(0, 60)}"): the phone says Ara's taking a moment`); }
  else if (dt >= TURN_TEST_MS && G.turnStep === 1) { G.turnStep = 2; const ws = G.ws, at = G.turnOpen;
    pingMs(EARLY_PING_MS).then(ms => { if (!G.live || G.turnOpen !== at || G.ws !== ws || G.responding || G.asked || /^(Connecting|Reconnecting)/.test(G.status)) return;
      G.turnOpen = 0;
      if (typeof ms !== "number" || ms > SLOW_LINE_MS) { act("step", `No reply ${TURN_TEST_MS / 1000} s after the officer spoke, on a slow line (test request ${typeof ms === "number" ? ms + " ms" : ms}): fresh line`); G.retried = 0; reconnect("the voice service stopped answering"); return; }
      act("step", `No reply ${TURN_TEST_MS / 1000} s after the officer spoke on a healthy line: asked for one with their words`); G.retriedAt = Date.now(); G.heardSinceRetry = false;
      askReply(`The officer just said: "${heard}". Answer that now, out loud in one or two sentences, or call the tool it needs.`); }); }
  else if (dt >= TURN_GIVE_UP_MS && G.turnStep === 2) { G.turnOpen = 0; act("step", `No reply ${TURN_GIVE_UP_MS / 1000} s after the officer spoke: fresh line`); G.retried = 0; reconnect("the voice service stopped answering"); }
}
function idleCheck() { if (typeof keepAlive === "function") keepAlive(); turnWatch();
  // a driver can't see the screen: a soft tick every 4 s while Ara is slow to answer or the line is reconnecting
  // Oct 27 (Carverhill), back on Oct 28 after the 1.0 reset dropped it: a spoken "Ara's taking a moment." instead of the ping the first time a reply is slow; the ping only repeats after it. While reconnecting the recorded lines speak at 5 s, so no ping
  if (G.live && G.asked && Date.now() - (G.askedAt || 0) >= TICK_MS && Date.now() - (G.tickAt || 0) >= TICK_MS) { G.tickAt = Date.now();
    if (!G.slowSaid) { if (sayLocal("Ara's taking a moment.", "slow")) { G.slowSaid = true; G.slowAt = Date.now(); } else { cue("wait"); vlog("still working: tick"); } }
    else if (Date.now() - (G.slowAt || 0) >= STILL_WAIT_MS && sayLocal(STILL_WAIT_TEXT, "", STILL_WAIT_TEXT)) G.slowAt = Date.now(); /* every 10 s until Ara answers (Oct 28: 29 s gaps with one line in them) */
    else { cue("wait"); vlog("still working: tick"); } }
  // "Speaking" is what the officer hears, not what arrived: once nothing is scheduled to play, the screen goes back to Listening (Oct 25: "I see Speaking but hear nothing")
  if (G.status === "Speaking" && G.ctx && G.playHead <= G.ctx.currentTime && !G.sources.length) { G.status = "Listening"; paintCall(); }
  if (!G.live || G.idleEnding || G.soundPausedAt || G.micMutedAt || G.hiddenAt || /^(Connecting|Reconnecting)/.test(G.status)) return;
  const playing = G.audioOn || G.responding || (G.ctx && G.playHead > G.ctx.currentTime);
  if (playing) { busy(); return; }
  if (G.probing) return;
  // the officer is talking but the voice service hasn't heard anything: the line may have stalled without closing (seen Oct 24 in a dead spot)
  const talking = G.speechSince && Date.now() - G.speechSince > STALL_MS && Date.now() - (G.lastMsg || 0) > STALL_MS;
  const since = Date.now() - (G.lastAct || Date.now());
  const quiet = since >= idleMs() && (Date.now() - (G.loudAt || 0) >= idleMs() || since >= NOISE_CAP_MS) && !G.turnOpen; /* never a goodbye while the officer's words are unanswered (turnWatch reconnects instead) */ // sound on the mic counts as talking, but not for more than a minute (road noise)
  if (!talking && !quiet) return;
  G.probing = true; const ws = G.ws;
  pingMs(LINE_TEST_MS).then(ms => { G.probing = false; if (!G.live || G.ws !== ws || G.idleEnding || /^(Connecting|Reconnecting)/.test(G.status)) return;
    const fresh = Date.now() - (G.lastMsg || 0) < LINE_TEST_MS; // the voice service is still sending: the line is alive, however slow the test (seen Oct 24: a 2.7 s test while Grok was answering)
    if (!fresh && (typeof ms !== "number" || (talking && ms > STALL_SLOW_MS))) { G.stalled = true; G.speechSince = 0; netLog(`Line stalled (${talking ? "officer talking, nothing heard back" : "12 s of quiet"})`, ms); reconnect("the line stalled"); if (talking) G.spokeInGap = true; /* what they said never reached the voice service: the new line asks them to say it again */ return; }
    if (talking) { G.speechSince = 0; return; } // the line is fine: it was background noise
    if (Date.now() - (G.lastAct || Date.now()) >= idleMs()) idleStart(); });
}
function idleStart() {
  G.idleEnding = true; G.idleAt = Date.now(); vlog(`${idleMs() / 1000} seconds quiet: hanging up`);
  const form = typeof V !== "undefined" && V && ACTIONS[V.action], text = form ? HANGUP_FORM_TEXT : HANGUP_TEXT;
  // the phone's own line when it has it (it always plays; Oct 28 4:16 PM the forced line never came), else Ara is asked to say it
  if (sayLocal(text, "", text)) { G.idleTimer = setTimeout(idleHangUp, Math.max(1500, (G.lineEndAt || Date.now()) - Date.now() + 700)); return; }
  forceSay(text);
  G.idleTimer = setTimeout(idleHangUp, 12000); // in case Grok doesn't answer
}
function idleHangUp() { clearTimeout(G.idleTimer); if (!G.live) return; const secs = idleMs() / 1000; endCall(`${secs} seconds of quiet`); toast(`Hung up after ${secs} seconds of quiet. Tap the mic when you need me.`); }
/* ---------- a line warmed on the first touch of the mic (Oct 28): the socket handshake runs while the finger is still on the button ---------- */
// The tap's click comes after pointerdown, and the call then spends its first second on the mic and the sound engine; a line already
// opening in that time takes about a second off the wait for the greeting. A warmed line nobody used closes after WARM_MAX_MS.
const WARM_MAX_MS = 20000;
function warmLine() {
  const P = PROV(); if (G.live || G.warm || P.open) return; /* Gemini opens its own kind of line */
  const w = G.warm = { at: Date.now(), ws: null, queued: [], tokP: getToken() }; w.tokP.catch(() => { if (G.warm === w) G.warm = null; });
  w.tokP.then(token => { if (G.warm !== w || G.live) return; /* the tap already started the call with this pass */
    const ws = w.ws = new WebSocket(P.url(null, token), P.protocols(token)); ws.binaryType = "arraybuffer"; vlog("line warmed on touch");
    ws.onmessage = (m) => w.queued.push(m); ws.onclose = ws.onerror = () => { if (G.warm === w) G.warm = null; };
    ws.onopen = () => { if (ws.readyState !== 1) return; /* runs until openSocket takes the line and puts its own onopen on it: the tap usually lands before the socket is open (Jim's 9:14 AM call: open 16 ms after the mic was ready), and the mic takes 2 s, so the configuration still goes up first */
      // Ara's whole configuration (about 55 KB) goes up now, while the phone is still opening its mic: the call-start harness (Oct 29) showed
      // the phone's uplink carrying it was the 1.3 s wait for session.updated, not xAI. Built as the call will start: hands-free on, nothing saved yet.
      const hands = G.hands, saves = G.saves, name = S.settings.userName, el = document.getElementById("wlName"), typed = el ? el.value.trim().replace(/\s+/g, " ").slice(0, 60) : ""; G.hands = true; G.saves = []; if (typed) S.settings.userName = typed; /* the name being typed on the welcome is the officer's name once Start is tapped */
      try { const cfg = sessionCfg(), msgs = [{ type: "session.update", session: provider() !== "openai" ? cfg : providerSession(cfg) }, ...extraUpdates()]; /* the same shaping as sessUpdate (OpenAI puts audio under audio.input and needs type/model) */ msgs.forEach(m => ws.send(JSON.stringify(m))); ws.upN = (ws.upN || 0) + msgs.length; w.cfg = { at: Date.now(), n: msgs.length, rules: G.sentRules, ctx: G.sentCtx }; vlog(`configuration sent on the warmed line (${msgs.length} updates)`); }
      catch (e) { w.cfg = null; } finally { G.hands = hands; G.saves = saves; S.settings.userName = name; } };
    setTimeout(() => { if (G.warm === w && !G.live) { G.warm = null; try { ws.close(); } catch (e) {} vlog("warmed line closed unused"); } }, WARM_MAX_MS); }).catch(() => {});
}
function takeWarm() { const w = G.warm; G.warm = null; if (!w) return null; if (w.ws && (w.ws.readyState > 1 || Date.now() - w.at > WARM_MAX_MS)) { try { w.ws.close(); } catch (e) {} w.ws = null; } return w; }
document.addEventListener("pointerdown", (e) => { if (!G.live && e.target.closest("[data-act2=mic], [data-act4=voice], [data-act4=welcome-ok], #rsmGo")) warmLine(); }, { passive: true });
/* ---------- the voice line: opened at the start, and opened again when it drops (a phone in a car loses signal) ---------- */
function openSocket(token, first, second, warm) {
  // a line opened again within 25 minutes picks up the same conversation (xAI keeps it 30 minutes)
  const P = PROV(), resume = P.resume && G.convId && Date.now() - (G.convAt || 0) < RESUME_MS ? G.convId : null;
  const useWarm = !!(warm && warm.ws && warm.ws.readyState <= 1 && !resume && !second && !P.open);
  if (!useWarm && !token) { getToken().then(tk => openSocket(tk, first, second)).catch(e => { endCall("couldn't start: " + String(e && e.message || e)); toast(callError(e)); }); return; } /* the warmed line went before the tap finished: a fresh pass */
  if (warm && warm.ws && !useWarm) { try { warm.ws.close(); } catch (e) {} warm.ws = null; } /* a warmed line not used (a resumed conversation) is closed, not left open */
  const ws = useWarm ? warm.ws : P.open ? P.open(token, resume) : new WebSocket(P.url(resume, token), P.protocols(token));
  ws.resumed = resume; if (useWarm) { ws.onerror = null; ws.warmed = true; } try { ws.binaryType = "arraybuffer"; } catch (e) {} /* audio can come as binary frames (binAudio) */
  if (second) G.tries.add(ws); else { G.ws = ws; G.tries = new Set([ws]); }
  const t0 = Date.now();
  if ((G.drops || G.lockResume) && !second) {
    // not open after 5 s: try a second line alongside, and keep whichever opens first (seen Oct 24: the first try hung for 10 s)
    setTimeout(async () => { if (!G.live || G.ws !== ws || ws.readyState !== 0) return;
      act("step", `Voice line not open after ${SECOND_LINE_MS / 1000} s: trying a second line alongside`);
      let tk; try { tk = await getToken(); } catch (e) { return; }
      if (G.live && G.ws === ws && ws.readyState === 0 && G.tries) openSocket(tk, first, true); }, SECOND_LINE_MS);
    // in a dead spot the line can neither open nor fail: give it OPEN_TIMEOUT_MS, then count it as a failed try
    setTimeout(() => { if (G.live && G.ws === ws && ws.readyState === 0) { netLog(`Voice line didn't open in ${OPEN_TIMEOUT_MS / 1000} s`); reconnect("the line didn't open"); } }, OPEN_TIMEOUT_MS);
  }
  ws.onopen = () => {
    if (ws.opened) return; ws.opened = true; /* a warmed line that was already open is told once */
    if (G.ws !== ws && !(second && G.tries && G.tries.has(ws))) return;
    if (G.tries) G.tries.forEach(o => { if (o !== ws) { try { o.onclose = null; o.close(); } catch (e) {} } }); G.tries = null; G.ws = ws; G.lockResume = false;
    if (ws.warmed && warm && warm.cfg) { G.sentRules = warm.cfg.rules; G.sentCtx = warm.cfg.ctx; /* sent at the touch; only what changed since goes again */
      if (G.sentRules !== rulesKey() || ctxNow() !== G.sentCtx) { vlog("configuration from the warmed line, instructions sent again (" + (G.sentRules !== rulesKey() ? "the rules" : "Right now") + " changed since the touch)"); sessUpdate({ instructions: sentInstructions() }); }
      else vlog("configuration from the warmed line (" + warm.cfg.n + " updates sent " + (Date.now() - warm.cfg.at) + " ms before the line was taken)");
      act("step", `Ara's configuration went up on the warmed line ${Date.now() - warm.cfg.at} ms before the tap finished${G.sentRules !== warm.cfg.rules || G.sentCtx !== warm.cfg.ctx ? " (instructions sent again: changed since)" : ""}`); }
    else { sessUpdate(sessionCfg()); sendExtras(); }
    syncMark(ws.resumed ? "line picked up" : G.drops ? "new line" : "call start"); /* the configuration just sent carries Ara's state: its receipt is logged, and resent if none comes */
    if (G.drops && P.replay) replayRecent(); if (typeof first === "function") first(); else guide(first);
    downEnd(true); G.openedAt = Date.now(); linePrep(); setTimeout(() => prepNamedLines("line open"), 4000);
    if (ws.resumed) { netLog("Picked up the same conversation"); G.resumedAt = Date.now(); G.resumedHeardN = G.heardN || 0; } /* a replayed tool call can only come before the officer's first words on the new line (Oct 29) */
    G.status = "Listening"; G.lastMsg = Date.now(); G.speechSince = 0; busy(); paintCall(); setTimeout(() => { G.stalled = false; G.spokeInGap = false; }, 0);
    vlog(`connected in ${Date.now() - G.t0} ms (voice pass ${G.passReady ? "was ready" : "fetched on tap"}${ws.warmed ? ", line warmed on touch" : ""})`);
    netLog(`Voice line open in ${Date.now() - t0} ms${ws.warmed ? " (warmed on touch)" : ""}${second ? " (the second line)" : ""}${G.drops ? ` (reconnect ${G.drops})` : ""}`);
    if (G.drops) setTimeout(prefetchToken, 2000); // the ready pass was used: have the next one ready for another drop (seen Oct 24: 7 s to fetch one)
    clearInterval(G.netTick); G.netTick = setInterval(async () => { if (!(G.live && G.ws === ws)) return; const ms = await pingMs(); netLog("Reading", ms);
      // nothing was expected from Grok (the officer was thinking), so nothing else notices a dead network: a second quick test, then a fresh line (Oct 25: 35 s of "Hello?")
      if (typeof ms === "number" || !G.live || G.ws !== ws || /^(Connecting|Reconnecting)/.test(G.status)) return;
      const again = await pingMs(LINE_TEST_MS); if (typeof again === "number" || !G.live || G.ws !== ws || /^(Connecting|Reconnecting)/.test(G.status)) return;
      act("step", "The line went quiet (two test requests unanswered): fresh line"); reconnect("the line went quiet"); }, 30000);
  };
  ws.onmessage = (m) => { if (G.ws !== ws) return; G.lastMsg = G.convAt = Date.now();
    if (m.data instanceof ArrayBuffer) { if (m.data.byteLength >= 2) onEvent({ type: "response.output_audio.delta", pcm: new Int16Array(m.data, 0, m.data.byteLength >> 1) }); return; } /* a binary frame is Ara's audio, raw PCM16 */
    let e; try { e = JSON.parse(m.data); } catch (x) { return; } onEvent(e); };
  if (useWarm) setTimeout(() => { if (G.ws !== ws) return; if (ws.readyState === 1) ws.onopen(); warm.queued.splice(0).forEach(m => ws.onmessage(m)); }, 0); /* already open: carry on as if it had just opened, with anything it was sent meanwhile */
  ws.onclose = (ev) => {
    if (G.ws !== ws || !G.live) return;
    vlog("connection closed " + (ev && ev.code));
    const opened = !!G.lastMsg && G.status !== "Connecting…";
    netLog(`Voice line closed (code ${ev && ev.code}${ev && ev.reason ? ", " + String(ev.reason).slice(0, 120) : ""})${opened ? "" : " before it opened"}`);
    if (document.visibilityState === "hidden") { if (G.hiddenAt) { lockPause("the line closed by itself"); return; } interrupted("connection closed while away", "The connection closed while the app was in the background."); return; } // locked: the line reopens when the app is back
    if (!opened && ws.resumed) { G.convId = null; act("step", "Couldn't pick up the same conversation: opening a new one"); reconnect("the conversation couldn't be picked up"); return; }
    if (!opened && !G.drops && !G.lockResume) { endCall("couldn't connect"); toast(`Couldn't connect to ${PROV().name} voice. Try again in a moment.`); return; }
    if (opened && G.drops && Date.now() - (G.openedAt || 0) > STABLE_MS) { vlog("the line had been up a while: reconnect count starts afresh"); G.drops = 0; }
    reconnect("the voice line dropped");
  };
  ws.onerror = () => {};
}
function closeTries() { if (G.tries) G.tries.forEach(o => { if (o !== G.ws) { try { o.onclose = null; o.close(); } catch (e) {} } }); G.tries = null; }
// what the phone says about its connection; iPhones don't report the network type or speed, only online or offline
// where the phone is, for connection rows only, and only while the Settings switch "Record my location in connection logs" is on
function locWanted() { return !!(S.settings.shareLocation && navigator.geolocation); }
function locStart() { locStop(); if (!locWanted()) return;
  try { G.locWatch = navigator.geolocation.watchPosition(pos => { G.pos = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, at: Date.now() }; }, err => { G.posErr = err && err.message; }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }); } catch (e) {} }
function locStop() { if (G.locWatch != null) { try { navigator.geolocation.clearWatch(G.locWatch); } catch (e) {} G.locWatch = null; } }
function locInfo() { if (!locWanted()) return ""; const p = G.pos; if (!p || Date.now() - p.at > LOC_FRESH_MS) return ", location not available yet"; return `, at ${p.lat.toFixed(5)},${p.lon.toFixed(5)} (±${Math.round(p.acc || 0)} m)`; }
function netInfo() {
  const c = navigator.connection, bits = [navigator.onLine === false ? "offline" : "online"];
  if (c) { if (c.type) bits.push(c.type); if (c.effectiveType) bits.push(c.effectiveType); if (c.downlink != null) bits.push(c.downlink + " Mbps"); if (c.rtt != null) bits.push("round trip " + c.rtt + " ms"); }
  else bits.push("network type not reported by this browser");
  if (G.lastMsg) bits.push(`last word from the voice service ${Math.round((Date.now() - G.lastMsg) / 1000)} s ago`);
  return bits.join(", ");
}
// iPhones only say "online", so the app times a tiny request to the key holder itself (the /log status check)
async function pingMs(limit = 8000) {
  if (!tokenUrl()) return null; const t0 = performance.now(), ac = new AbortController(), to = setTimeout(() => ac.abort(), limit);
  try { await fetch(tokenUrl().replace(/\/$/, "") + "/log?ping=" + Date.now(), { cache: "no-store", signal: ac.signal }); return Math.round(performance.now() - t0); } catch (e) { return ac.signal.aborted ? `no answer in ${limit / 1000} s` : "failed"; } finally { clearTimeout(to); }
}
async function netLog(what, known) { const sess = G.session, info = netInfo(), ms = known !== undefined ? known : await pingMs(); act("step", `Connection: ${what}. ${info}${ms == null ? "" : typeof ms === "number" ? `, test request ${ms} ms` : `, test request ${ms}`}${locInfo()}`, sess); }
// the server's side of the conversation is gone, so a new line gets the last few lines said and the open form
const downSince = () => Date.now() - (G.lastMsg || G.heardAt || G.t0 || Date.now()); // how long since the voice service was last heard: the give-up clock
async function reconnect(why) {
  if (!G.live) return;
  if (G.lastTry || downSince() > NO_LINE_GIVE_UP_MS) { voiceUnavailable(why); return; } /* after the announced last try, no more */
  if (!G.lastTry && downSince() > NO_LINE_GIVE_UP_MS - LAST_TRY_MS) { G.lastTry = true; clearTimeout(G.downTimer); cutStatusLine("the last try is announced"); sayLocal(DOWN_LINES[3], "last", namedText("last")); } /* Carverhill, Oct 29: tell them when it's the last try */ // 2 minutes since the voice service was last heard, however many tries (G.lastHeard: Oct 25 3:42 PM, a new line that didn't open in 10 s counted from the call's start and gave up after one try)
  G.drops++; G.status = "Reconnecting…"; G.createAt = 0; G.responding = G.qInstr = G.qCreate = G.asked = false; G.retried = 0; G.turnOpen = 0;
  if (G.speechOn) { G.cutMidSpeech = true; G.speechOn = false; } /* the officer was mid-sentence when the line went: what was heard is a fragment, not their answer (real-line run, Oct 29: "You said: Record the") */
  clearTimeout(G.qTimer); clearTimeout(G.askWatch); clearTimeout(G.tickWatch); clearInterval(G.netTick); G.retriedAt = 0; G.dropNext = false; stopPlayback(); paintCall();
  const old = G.ws; G.ws = null; try { old && old.close(); } catch (e) {} closeTries();
  if (G.drops === 1) cue("drop");
  downStart();
  vlog(`reconnecting (${G.drops}): ${why}`); act("step", `Reconnecting (${G.drops}): ${why}`);
  await new Promise(r => setTimeout(r, RECONNECT_DELAYS[Math.min(G.drops, MAX_DROPS)] || RECONNECT_DELAYS[RECONNECT_DELAYS.length - 1])); // spread out, so a short dead spot can pass
  if (navigator.onLine === false) await new Promise(r => { const t = setTimeout(r, OFFLINE_WAIT_MS); window.addEventListener("online", () => { clearTimeout(t); r(); }, { once: true }); });
  if (!G.live) return;
  await openAgain();
}
// the rest of a reconnect, shared with the reopen after a lock: a voice pass, then the line, then the pending question
async function openAgain(lock) {
  // a voice pass, tried again every few seconds while the phone is in a dead spot (each try is time-limited, so the reconnect can't hang)
  let token;
  while (true) {
    const ready = !!TOK.p, tp = Date.now();
    try { token = await getToken(); act("step", `Voice pass ${ready ? "was ready" : "fetched"} in ${Date.now() - tp} ms`); break; }
    catch (e) { const msg = String(e && e.message || e).slice(0, 80); if (!G.live) return;
      if (msg === "bad_code" || /^service_/.test(msg) || Date.now() - (G.downAt || tp) > DOWN_GIVE_UP_MS) { netLog("Couldn't get a voice pass (" + msg + ")"); voiceUnavailable("no voice pass: " + msg); return; }
      act("step", `No voice pass yet (${msg}): trying again in ${TOKEN_RETRY_MS / 1000} s`); await new Promise(r => setTimeout(r, TOKEN_RETRY_MS)); }
  }
  if (!G.live) return;
  if (G.hiddenAt) { G.lockResume = false; return; } // locked again while the pass was fetched: the next unlock reopens the line
  if (G.spokeInGap) act("step", "The officer talked while the line was down: Ara will ask them to repeat it");
  G.heardAt = G.lastMsg || G.heardAt || Date.now(); G.lastMsg = 0;
  // the app says where the form stands and, when a question is pending, asks it again itself as a scripted line; the context goes in Ara's instructions (Right now)
  openSocket(token, () => { const fp = typeof formPosition === "function" ? formPosition() : null;
    const pf = G.pendingForce; G.pendingForce = null; /* a scripted line the old line never started (forceTick): said again on this one unless the form question covers it */
    const back = lock ? "Line reopened" : "Reconnected", say = (line, why) => { G.justNow = { text: reconnectLine(lock, line) + (fp ? " " + fp.where : ""), at: Date.now() }; act("step", `${back}: ${why}`); whenIdle("instr"); syncWait(() => forceSay(`Sorry, I lost you for a moment. ${line}`)); }; /* the sorry line goes once the service has confirmed Ara's state for the new line (or after SYNC_RECEIPT_MS), so she has the picture before the officer answers (Carverhill, Oct 29) */
    if (fp && fp.ask) { if (fp.arm) fp.arm(); say(`${typeof formIntro === "function" ? formIntro() + " " : ""}${fp.ask}`, `the app says where we are and asks the pending question itself (${fp.where})`); } /* "We're on the interaction report for Elon." first: the officer may have been away a while */
    else if (pf) say(pf, "the app says the scripted line the old line never started");
    else { const q = lastQuestion();
      if (q.where && q.where.kind !== "none" && RECONNECT_BY() === "ara") { G.justNow = { text: reconnectLine(lock, ""), at: Date.now() }; act("step", `${back}: Ara is asked to say where we were herself (${q.where.kind}); the app checks her reply`); whenIdle("instr"); syncWait(() => contextAsk("reconnect", q.where)); } /* Ara composes it from "Where we are" in her instructions; the app's line is the floor after CONTEXT_ASKS misses */
      else { say(q.line, q.why); if (q.then) guide(q.then); } } }); /* no form open: the app still says the whole line, so Ara can't stop after the sorry (9:45 AM call, Oct 29: 12 s of dead air); q.then = the officer's heard answer, for Ara to act on */
}
// what the app asks after a drop with no form open: the question Ara had just asked and the officer hadn't answered, "say that again" when the officer had spoken last, else the open question
function lastQuestion() {
  const bot = String(G.lastBot || "").trim().replace(/^(Sorry, I lost you for a moment\.\s*)+/, "").replace(/\s*(You said: "[^"]*"\.|I didn't catch your answer\.|Then you started to say something\. Can you repeat what you said\?)\s*$/, ""), heardAt = G.lastHeard && G.lastHeard.at || 0, answered = heardAt > 0 && heardAt >= (G.lastBotAt || 0); /* her last line may itself be the app's reconnect line: a second drop with no word from the officer must not stack the sorry (Patient Pat on the real line, Oct 29: five in a row) */
  const asked = /\?\s*$/.test(bot) && bot.length > 3 && bot.length <= 220; // Ara had asked something: the whole line is said again, so the officer knows where they were (Carverhill, 3:57 PM call Oct 29: "Could you say that again?" alone left him asking "say what again?")
  const statement = !asked && bot.length > 3 && bot.length <= 220 ? { line: `${bot} Then you started to say something. Can you repeat what you said?`, why: "the app says Ara's last line (a statement) again and asks for what the officer had started to say" } : { line: "Could you say that again?", why: "the app asks the officer to repeat what they said" }; /* Carverhill, 4:15 PM Oct 29: "Could you say that again?" after a statement sounded like a request to repeat the statement */
  const cut = G.cutMidSpeech; G.cutMidSpeech = false;
  if ((typeof V === "undefined" || !V) && G.staleRbAt && G.staleRbAt >= (G.lastBotAt || 0) - 60000 && /Yes to save, or no to change something\?\s*$/.test(bot)) return { line: G.savedByWordsLine || `It's saved. ${typeof NEXT_NO_Q === "string" ? NEXT_NO_Q : "What would you like to do?"}`, why: "that read-back's form was saved: the app says so instead of asking it again" }; /* 6:23 PM call, Oct 29 */
  if (G.spokeInGap || cut) return asked ? { line: `${bot} I didn't catch your answer.`, why: `the app says Ara's whole last line again and that the officer's answer was lost ${cut ? "(the line went while they were still talking)" : "while the line was down"}` } : statement;
  if (answered) { const heard = String(G.lastHeard.text || "").trim().replace(/[.!?]+$/, ""); return asked && heard ? { line: `${bot} You said: "${heard.slice(0, 80)}".`, why: "the app says Ara's whole last line again and the answer it heard, for Ara to act on", then: `The officer had already answered that question before the line dropped: "${heard.slice(0, 160)}". Act on that answer now, as if they had just said it; don't ask the question again.` } : statement; }
  // her whole last line when it is short and ends in her question (10:05 AM call: the last sentence alone, "which fits?", lost the choices); else just the question
  const bare = /^(what would you like to do( next)?|what'?s next)\?$/i.test(bot); /* her bare open question is never said again after a drop: where we were is (10:36 AM call, Oct 30) */
  if (/\?\s*$/.test(bot) && bot.length > 3 && bot.length <= 220 && !bare) return { line: bot, why: "the app says Ara's whole last line again itself" };
  const q = (bot.match(/[^.?!]*\?/g) || []).pop(); if (q && q.trim().length > 3 && q.trim().length <= 200 && !bare) return { line: q.trim(), why: "the app asks Ara's last question again itself" };
  const w = typeof whereWeAre === "function" ? whereWeAre() : null; if (w) return { line: w.line, why: `no question was waiting: where we were (${w.kind})`, where: w }; /* Carverhill, 10:36 AM call Oct 30: a bare "What would you like to do?" after a drop lost him the context */
  return { line: typeof NEXT_NO_Q === "string" ? NEXT_NO_Q : "What would you like to do?", why: "no question was waiting: the app asks what the officer would like to do" };
}
// after a drop the app no longer rebuilds Ara's memory of the call (what was said, what was saved): she resumes her own conversation and the
// tool guards refuse anything stale; the one thing the app adds is its own pending form question (Carverhill, Oct 28: hold the state, don't reprogram hers)
const reconnectLine = (lock, said) => `${lock ? "The officer's phone was locked for a moment and the app reopened the line to you" : "The connection to the officer dropped for a moment (they may be driving) and the app reconnected you"}. Carry on where you were. ${G.spokeInGap ? "The officer was talking while the line was down and you didn't hear it: ask them to say that again. " : ""}If they ask whether you're there, say yes in two words and carry on; don't say "welcome back"${spookyMode() || xmasMode() ? ", and don't turn the theme on again or announce it" : ""}. ${said ? `The app has just said, in your voice, "Sorry, I lost you for a moment. ${said}": don't say it or anything like it again, wait for the officer's answer.` : `Say "Sorry, I lost you for a moment." with no ${spookyMode() ? "spooky" : xmasMode() ? "festive" : "other"} aside, then ask just one question: the one still waiting for an answer, if any, else the next one needed.`} Anything already saved stays saved; never redo it.`;
// while the line is down the phone itself speaks, since Grok can't: "The line dropped..." at 5 s, "Still trying..." at 12 s and every 10 s after (Carverhill, Oct 25: he had no idea what was going on)
function linePrep() { // fetch and decode the recorded lines, so they can play the moment the line drops
  Object.entries(LINE_FILES).forEach(([k, f]) => { if (!lineRaw[k]) lineRaw[k] = fetch((ON_PREVIEW ? "preview/" : "app/") + "sounds/" + f).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null); });
  const c = G.ctx; if (!c) return;
  Object.keys(LINE_FILES).forEach(k => { if (lineBuf[k]) return; lineRaw[k].then(b => b && c.decodeAudioData(b.slice(0))).then(buf => { if (buf) lineBuf[k] = buf; }).catch(() => {}); });
  namedLoad(); decodeNamed();
}
function playBuf(buf) { // through the call's own sound, which the phone keeps open during a conversation
  const c = G.ctx; if (!c || c.state !== "running" || !buf) return false;
  try { const src = c.createBufferSource(), g = c.createGain(); g.gain.value = 1; src.buffer = buf; src.connect(g); g.connect(c.destination); src.start(c.currentTime + 0.02); G.lineSrc = src; G.lineEndAt = Date.now() + buf.duration * 1000 + 50; return true; } catch (e) { return false; }
}
const playLine = (kind) => playBuf(lineBuf[kind]);
function sayLocal(text, kind, named) {
  // only ever a recording through the call's own sound: the phone's built-in speech is never used (Oct 25: an iOS "Audio Recording / Stop audio recording?" dialog appeared after it spoke, muting the mic and ending the call)
  // named: the same line with the officer's name, when the phone has it; else the stock recording
  const own = named && namedBuf[named] && playBuf(namedBuf[named]); if (own) text = named;
  const how = own || (kind && playLine(kind)) ? "recording" : "";
  if (how) { act("step", `The phone said (${how}): "${text}"`); vlog(`phone said (${how}): ${text}`); } else vlog(`status line not played (sound not running): ${text}`);
  return !!how;
}
function downSay(kind) { // the dropped line, then the still-trying lines in turn (each with the officer's name when the phone has them); from 8 minutes, once, that it will stop at 10
  if (kind === "still" && !G.warnSaid && downSince() >= WARN_GIVE_UP_MS) { G.warnSaid = true; return sayLocal(DOWN_LINES[2], "warn", namedText("warn")); }
  if (kind === "still") { const i = G.downN || 0; G.downN = i + 1; return sayLocal(DOWN_LINES[1], "still", namedText("still", i)); }
  if (kind === "warn") { G.warnSaid = true; return sayLocal(DOWN_LINES[2], "warn", namedText("warn")); }
  return sayLocal(DOWN_LINES[0], "dropped", namedText("dropped"));
}
function downStart() {
  if (G.downAt) return; G.downAt = G.lastDropAt = Date.now(); G.downN = 0; G.slowSaid = false; linePrep();
  const again = () => { if (!G.live || !G.downAt || G.lastTry) return; downSay("still"); G.downTimer = setTimeout(again, downRepeatMs()); };
  G.downTimer = setTimeout(() => { if (!G.live || !G.downAt) return; downSay("dropped"); G.downTimer = setTimeout(again, SAY_STILL_MS - SAY_DOWN_MS); }, SAY_DOWN_MS);
}
// a status recording still playing is stopped when the line comes back, so it can't overlap Ara (Oct 25 call)
function cutStatusLine(why) {
  const cut = G.lineEndAt && Date.now() < G.lineEndAt;
  if (cut) { try { G.lineSrc && G.lineSrc.stop(); } catch (e) {} act("step", `The phone's status line was cut short: ${why}`); } G.lineSrc = null; G.lineEndAt = 0;
  return cut;
}
function downEnd(back) { clearTimeout(G.downTimer); G.downTimer = null;
  const cut = cutStatusLine("the line came back");
  if (G.downAt) { vlog(`line back after ${Math.round((Date.now() - G.downAt) / 1000)} s`); if (back && !cut && Date.now() - G.downAt >= SAY_DOWN_MS) sayLocal("You're back with Ara.", "back", namedText("back")); }
  G.downAt = 0; G.warnSaid = false; G.lastTry = false; }
// after the retries: a sound and a spoken line from the phone itself, since Grok can't speak
function voiceUnavailable(why) {
  downEnd();
  netLog(`Voice service unavailable after ${Math.round(NO_LINE_GIVE_UP_MS / 60000)} minutes without a working line, ${G.drops} tries (${why})`);
  G.resume = { at: Date.now(), lines: (G.recent || []).slice(), draft: draftSummary(), what: V && ACTIONS[V.action] ? ACTIONS[V.action].title : "" };
  cue("down");
  endCall("voice service unavailable");
  toast("The voice service isn't answering. Your form is still here. Tap the mic to try again.");
}
// short tones (and a spoken line when the phone allows it) so a driver knows without looking
function cue(kind) {
  const notes = kind === "down" ? [660, 520, 390] : kind === "wait" ? [880] : [520, 660];
  try { const ctx = G.ctx && G.ctx.state === "running" ? G.ctx : (typeof spkCtx !== "undefined" && spkCtx) || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state !== "running") ctx.resume();
    notes.forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * 0.22;
      o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === "wait" ? 0.08 : 0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.22); }); } catch (e) {}
  if (kind !== "down") return;
  // no spoken line here any more: the screen says the voice service isn't answering (see voiceUnavailable), and the phone's built-in speech is never used
}
// Now and then Grok takes a tool answer or notice and never speaks (no response, or an empty or failed one),
// which left the officer in silence until the 12-second hang-up. The app asks once more, then logs it.
const CREATE_WAIT_MS = 2500; // serial engines: a second reply request waits for the first to report started (or this long)
// a reply is running, or was asked for and hasn't reported started yet: on a serial engine nothing else may ask for one (OpenAI refuses it)
const replyBusy = () => G.responding || (PROV().serial && !!G.createAt && Date.now() - G.createAt < CREATE_WAIT_MS);
function askReply(guidance) {
  if (guidance !== undefined) G.askGuide = guidance; // the same guidance goes again if the app has to ask twice
  if (PROV().serial && replyBusy()) { // one at a time: held until the running reply is done
    G.qCreate = true; if (!G.qGuide && G.askGuide) G.qGuide = G.askGuide; clearTimeout(G.qTimer);
    const again = () => { if (!G.live || !G.qCreate) return; if (replyBusy()) { G.qTimer = setTimeout(again, 200); return; } flushQueued(); }; G.qTimer = setTimeout(again, 200); /* waits for the first request to report started (or CREATE_WAIT_MS); zeroing G.createAt after 500 ms sent the second too soon and OpenAI refused it (Oct 27, 7:03 PM run) */
    vlog("reply request held: one at a time on " + PROV().name); return; }
  G.createAt = Date.now();
  send(G.askGuide ? { type: "response.create", response: { instructions: "App guidance for this reply only (never read it aloud): " + G.askGuide } } : { type: "response.create" }); G.asked = true; G.askedAt = Date.now(); /* G.slowSaid is cleared when a reply starts, not on a re-ask: "Ara's taking a moment" once per wait, then "Still waiting on Ara" (Oct 28 4:41 PM call: it repeated every 9 s) */
  clearTimeout(G.askWatch); clearTimeout(G.tickWatch);
  G.askWatch = setTimeout(() => { G.askWatch = null; if (!G.live || !G.asked) return; G.asked = false; replyCheck({ status: "never started" }); }, ASK_AGAIN_MS);
  // no reply at the first tick: test the line then, so a bad line gets a fresh one about 9 s sooner (seen Oct 24: 13 s to notice)
  const ws = G.ws; G.tickWatch = setTimeout(() => { if (!G.live || !G.asked || G.ws !== ws) return;
    pingMs(EARLY_PING_MS).then(ms => { if (!G.live || !G.asked || G.ws !== ws || /^(Connecting|Reconnecting)/.test(G.status)) return;
      if (typeof ms === "number" && ms <= SLOW_LINE_MS) return; // a healthy line: Grok is just slow, keep waiting
      clearTimeout(G.askWatch); G.askWatch = null; G.asked = false;
      act("step", `No reply started after ${TICK_MS / 1000} s on a slow line (test request ${typeof ms === "number" ? ms + " ms" : ms}): fresh line`); G.retried = 0; reconnect("the line is too slow"); }); }, TICK_MS);
}
function replyCheck(r) {
  if (!G.live || G.idleEnding) return;
  const asked = r.status === "never started" || G.respAsked; G.respAsked = false;
  const empty = !G.bot && !G.respTool && !G.audioSamples, failed = r.status === "failed" || r.status === "never started";
  if (!asked || r.status === "cancelled" || (!empty && !failed)) { G.retried = 0; if (!empty && G.drops) G.drops = 0; return; }
  const why = r.status === "never started" ? "no reply started" : r.status === "failed" ? "reply failed" + (r.status_details && r.status_details.error ? ": " + (r.status_details.error.message || r.status_details.error.type || "") : "") : "empty reply";
  G.retried = (G.retried || 0) + 1;
  vlog(`Grok gave ${why} (${G.retried} of ${MAX_ASKS})`);
  if (PROV().silentEmpty && why === "empty reply") { // the line answered (a finished reply), it just had no words: ask once more with the officer's words, never a fresh line for it
    if (G.retried > MAX_ASKS) { vlog("empty reply: had no words twice, waiting for the officer"); act("step", "Ara's reply had no words twice; waiting for the officer"); G.retried = 0; return; }
    const heard = G.lastHeard && G.lastHeard.text; act("step", "Ara's reply had no words (the line is up): asked again with the officer's words");
    G.retriedAt = Date.now(); G.heardSinceRetry = false; askReply((heard ? `The officer just said: "${heard}". ` : "") + "Answer that now, out loud in one or two sentences, or call the tool it needs." + (G.askGuide ? " " + G.askGuide : "")); return; }
  if (G.retried > MAX_ASKS) { act("step", `Grok gave ${why} after asking again`); G.retried = 0; reconnect("the voice service stopped answering"); return; }
  // asking again on a slow line only piles up late answers (seen Oct 24: six "I'm here"s at once): test the line first, and on a slow one start a fresh line
  const ws = G.ws; busy();
  pingMs(LINE_TEST_MS).then(ms => { if (!G.live || G.ws !== ws || /^(Connecting|Reconnecting)/.test(G.status)) return;
    const slow = typeof ms !== "number" || ms > SLOW_LINE_MS;
    if (slow) { act("step", `Grok gave ${why} on a slow line (test request ${typeof ms === "number" ? ms + " ms" : ms}): fresh line`); G.retried = 0; reconnect("the line is too slow"); return; }
    act("step", `Grok gave ${why}, asked again`);
    G.retriedAt = Date.now(); G.heardSinceRetry = false; if (!G.responding) askReply(); });
}

/* ---------- the phone pauses the app's sound ---------- */
// An iPhone pauses a web page's sound when something else takes the speaker for a moment: a notification sound, Siri, another
// app's audio, a headset or Bluetooth change. Seen twice on Oct 24 with the line still healthy. Ending the call at once cut the
// officer off mid-sentence, so keep the line open and try to restart the sound; end only if it doesn't come back.
// The page went hidden: on an iPhone that is usually the phone locking, which mutes the mic and pauses the sound anyway (Oct 26 pocket
// tests), so an open line would only cost money. Lock = pause: the line is closed LOCK_CLOSE_MS after the page hides and reopened on the
// same conversation the moment the app is back, with the pending question asked again (like a reconnect after a dead spot, no Carry on tap).
// Hidden longer than LOCK_MAX_MS, the call ends and the Carry on card shows. The call used to end the moment the phone locked.
function appHidden() {
  if (G.hiddenAt || !G.live) return; G.hiddenAt = Date.now(); G.lockPaused = 0; vlog("app hidden"); netLog(`App hidden (phone locked or switched away): the line closes in ${LOCK_CLOSE_MS / 1000} s and reopens when the app is back`);
  const tick = setInterval(() => {
    if (!G.live) { clearInterval(tick); G.hiddenAt = 0; G.lockPaused = 0; return; }
    if (document.visibilityState === "visible") {
      clearInterval(tick); const s = ((Date.now() - G.hiddenAt) / 1000).toFixed(1), paused = G.lockPaused; G.hiddenAt = 0; G.lockPaused = 0; vlog("app visible again after " + s + " s");
      if (G.soundPausedAt) G.soundPausedAt = Date.now(); if (G.micMutedAt) G.micMutedAt = Date.now(); // their waits start again now: the phone brings both back on unlock, in its own time
      if (G.ctx && G.ctx.state !== "running") G.ctx.resume().catch(() => {});
      if (paused) { act("step", `App hidden for ${s} s: reopening the line on the same conversation`); lockResume(); } else act("step", "App hidden for " + s + " s, then back (line still open)");
      return; }
    if (!G.lockPaused && Date.now() - G.hiddenAt > LOCK_CLOSE_MS) lockPause();
    if (Date.now() - G.hiddenAt > LOCK_MAX_MS) { clearInterval(tick); G.hiddenAt = 0; G.lockPaused = 0; G.endedByLock = true; interrupted("app hidden for " + Math.round(LOCK_MAX_MS / 60000) + " minutes", `The app was in the background for ${Math.round(LOCK_MAX_MS / 60000)} minutes, longer than a paused conversation is kept.`); }
  }, 500);
}
function lockPause(why) { // close the line while the phone is locked; the conversation is kept on xAI for RESUME_MS
  if (G.lockPaused) return; G.lockPaused = Date.now(); G.status = "Paused (phone locked)"; G.responding = G.qInstr = G.qCreate = G.asked = false; G.retried = 0; G.retriedAt = 0; G.dropNext = false;
  clearTimeout(G.qTimer); clearTimeout(G.askWatch); clearTimeout(G.tickWatch); clearInterval(G.netTick); clearTimeout(G.forceTimer); clearTimeout(G.forceTick); G.forced = null; G.pendingForce = null; stopPlayback();
  const old = G.ws; G.ws = null; try { old && old.close(); } catch (e) {} closeTries(); paintCall();
  if (typeof keepResume === "function") keepResume("Your phone closed the app while it was locked."); /* Oct 28: the page was discarded during a lock and the card came up on a fresh page with no explanation */
  netLog(why ? `Voice line closed while the phone was locked (${why}): it reopens when the app is back` : `Phone locked: voice line closed after ${((Date.now() - G.hiddenAt) / 1000).toFixed(1)} s (nothing is charged while the phone is locked); the conversation is kept for ${RESUME_MS / 60000} minutes`);
}
async function lockResume() { // the app is back: reopen the line on the same conversation, no tone, no "line dropped" recording
  if (!G.live || G.ws) return;
  G.status = "Reconnecting…"; G.lockResume = true; G.lastMsg = Date.now(); G.spokeInGap = false; G.stalled = false; G.audioRetried = false; paintCall();
  if (typeof restartAudio === "function") await restartAudio(); // iOS brings the sound back on the earpiece after a lock: a fresh start puts it on the speaker again (Carverhill, Oct 26)
  if (G.live && typeof keepAwake === "function") keepAwake(); // the wake lock was released at the lock: ask for it again
  if (!G.live || G.ws || !G.lockResume) return;
  await openAgain(true);
}
const hiddenLimit = (ms) => document.visibilityState === "hidden" || G.hiddenAt ? Math.max(ms, LOCK_MAX_MS) : ms; // while the page is hidden, the hidden wait decides (the sound and mic are the phone's doing)
function soundPaused(ctx, limit = SOUND_BACK_MS) { // limit: how long to wait for the phone (longer right after a tap, see soundRunning)
  if (G.soundPausedAt) return; G.soundPausedAt = Date.now();
  const why = `Sound paused by the phone (${ctx.state}; app ${document.visibilityState}${document.hasFocus && !document.hasFocus() ? ", not in focus" : ""})`;
  vlog(why); netLog(why);
  const tick = setInterval(() => {
    if (!G.live || G.ctx !== ctx) { clearInterval(tick); G.soundPausedAt = 0; return; }
    if (!G.soundPausedAt) { clearInterval(tick); return; }
    if (ctx.state === "running") { clearInterval(tick); const s = ((Date.now() - G.soundPausedAt) / 1000).toFixed(1); G.soundPausedAt = 0; vlog("sound back after " + s + " s"); act("step", "Sound paused by the phone for " + s + " s, then came back"); if (typeof soundBack === "function") soundBack(); return; }
    if (document.visibilityState === "visible") ctx.resume().catch(() => {});
    if (Date.now() - G.soundPausedAt > hiddenLimit(limit)) { clearInterval(tick); const s = ((Date.now() - G.soundPausedAt) / 1000).toFixed(0); G.soundPausedAt = 0;
      if (audioRetry(`after the sound stayed paused for ${s} s`)) return; /* one fresh start before giving up (Oct 28: the card came up after the unlock wait) */
      interrupted("audio " + ctx.state + ", sound didn't come back", "Your phone kept the sound paused after it came back."); }
  }, 500);
}
// the same for the mic: an iPhone mutes it for a moment (seen Oct 24, 4 s into a call); end only if it stays muted
// one fresh start of the sound and mic when the phone keeps either held after it is visible again; a second time in the same call the call ends
function audioRetry(why) {
  if (G.audioRetried || document.visibilityState !== "visible" || typeof restartAudio !== "function") return false;
  G.audioRetried = true; act("step", `Starting the sound and mic afresh ${why}`);
  restartAudio(why).then(ok => { if (!ok && G.live) interrupted("sound and mic couldn't be started afresh " + why, "Your phone kept the sound and microphone after it came back."); });
  return true;
}
function micMuted(tr) {
  if (G.micMutedAt) return; G.micMutedAt = Date.now(); vlog("mic muted by the phone"); netLog("Mic muted by the phone");
  const tick = setInterval(() => {
    if (!G.live || !G.stream || !G.stream.getAudioTracks().includes(tr)) { clearInterval(tick); G.micMutedAt = 0; return; }
    if (!G.micMutedAt) { clearInterval(tick); return; }
    if (!tr.muted) { clearInterval(tick); const s = ((Date.now() - G.micMutedAt) / 1000).toFixed(1); G.micMutedAt = 0; act("step", "Mic muted by the phone for " + s + " s, then came back"); return; }
    if (Date.now() - G.micMutedAt > hiddenLimit(MIC_BACK_MS)) { clearInterval(tick); G.micMutedAt = 0;
      if (audioRetry(`after the mic stayed muted for ${Math.round(MIC_BACK_MS / 1000)} s`)) return;
      interrupted("mic muted, didn't come back in " + Math.round(MIC_BACK_MS / 1000) + " s", "Your phone kept the microphone muted."); }
  }, 500);
}

/* ---------- scripted lines: xAI speaks the exact words (force_message), then Ara carries on ---------- */
// Used where the words matter and Ara used to stop or change them (Oct 24: "Say only ..." left her silent mid-form).
// If xAI doesn't play it, Ara is asked to say it instead (fallback), so the officer always hears it.
function forceSay(text, then, fallback, waited = 0) {
  if (/A is \$250,000 and up/.test(String(text || ""))) G.rangesSaid = true; /* the A to E ranges are read once per call (Oct 28) */
  if (!G.live) { G.pendingForce = null; return; }
  if (!waited) G.pendingForce = text;
  if ((replyBusy() || playingLeft() > 0 || G.forced || Date.now() - (G.cancelAt || 0) < CANCEL_SETTLE_MS) && waited < 8000) { setTimeout(() => forceSay(text, then, fallback, waited + 200), 200); return; }
  // the reply just finished already said it (the engine answered the tool result with the question itself): no second copy (OpenAI, Oct 27: "What's the first name?" three times)
  if (!PROV().forceItem && G.lastBot && Date.now() - G.lastBotAt < 4000 && saidLine(sameWords(G.lastBot), sameWords(text))) { if (G.pendingForce === text) G.pendingForce = null; G.lastForcedText = text; vlog("scripted line already said: " + text); act("step", `${PROV().name} had just said the scripted line in its own words: not sent again`); if (then) setTimeout(() => guide(then), 0); return; }
  G.forced = { at: Date.now(), events: [], text, then, fallback: fallback || `The app's own line didn't play. Say this now, word for word, with nothing before or after it: "${text}"`, started: false }; if (G.pendingForce === text) G.pendingForce = null;
  if (PROV().forceItem) send({ type: "conversation.item.create", item: { type: "force_message", role: "assistant", content: [{ type: "output_text", text }], interruptible: true } });
  else { G.forced.viaReply = true; G.createAt = Date.now(); forceByReply(text); } /* an engine without force_message is asked to say it in a reply of its own: a reply request like any other, so the next one waits for it */
  vlog("scripted line: " + text);
  clearTimeout(G.forceTimer); G.forceTimer = setTimeout(() => { const f = G.forced; if (f && !f.started) { G.forced = null; G.lateForced = { text: f.text, said: 0, at: Date.now() }; act("step", `Scripted line didn't play in ${FORCE_WAIT_MS / 1000} s: Ara says it instead (${forcedTrace(f)})`); guide(f.fallback); } }, FORCE_WAIT_MS);
  forceTick();
}
// a scripted line is not a reply request, so the 4 s tick and the early line test above didn't cover it: 12.7 s of silence before "Ara's taking a moment" after a save line (Carverhill's 7:39 AM call, Oct 29)
// Nothing started 4 s after the line went out: the phone says "Ara's taking a moment." and tests the line; a slow line gets a fresh one (which re-asks the pending question), a healthy one keeps waiting for the 8 s fallback
function forceTick(now) {
  clearTimeout(G.forceTick); const f = G.forced, ws = G.ws; if (!f || f.viaReply) return; /* a line said through a reply request is covered by askReply's own watch */
  G.forceTick = setTimeout(() => { if (!G.live || G.forced !== f || f.started || G.ws !== ws || /^(Connecting|Reconnecting)/.test(G.status)) return;
    if (!G.slowSaid) { if (sayLocal("Ara's taking a moment.", "slow")) { G.slowSaid = true; G.slowAt = Date.now(); } else cue("wait"); }
    act("step", `Nothing back ${TICK_MS / 1000} s after a scripted line: the phone says Ara's taking a moment and tests the line (${forcedTrace(f)})`);
    pingMs(EARLY_PING_MS).then(ms => { if (!G.live || G.forced !== f || f.started || G.ws !== ws || /^(Connecting|Reconnecting)/.test(G.status)) return;
      if (typeof ms === "number" && ms <= SLOW_LINE_MS) return; // a healthy line: the voice service is just slow, the 8 s fallback still applies
      clearTimeout(G.forceTimer); G.forced = null; G.pendingForce = f.text; /* the fresh line asks the pending question itself (formPosition), so the scripted line isn't lost */
      act("step", `Scripted line not started after ${TICK_MS / 1000} s on a slow line (test request ${typeof ms === "number" ? ms + " ms" : ms}): fresh line`); G.retried = 0; reconnect("the line is too slow"); }); }, now ? 0 : TICK_MS);
}
// the flattened event stream around a scripted line (Carverhill, Oct 28: does the service acknowledge a force message before the reply starts?)
function forcedTrace(f) { const ev = f.events || [], out = []; ev.forEach(x => { const l = out[out.length - 1]; if (l && l.t === x.t) { l.n++; l.last = x.dt; } else out.push({ t: x.t, n: 1, dt: x.dt, last: x.dt }); });
  return `sent 0 ms` + out.map(x => `; ${x.t.replace(/^conversation\./, "conv.").replace(/^response\./, "resp.")}${x.n > 1 ? ` x${x.n}` : ""} +${x.dt} ms${x.n > 1 ? `..${x.last}` : ""}`).join("") + (ev.length ? "" : "; nothing received"); }
function forcedEvent(t) {
  const f = G.forced;
  if (f.events && f.events.length < 60) f.events.push({ t, dt: Date.now() - f.at });
  if (t === "response.created") { f.started = true; G.forceStartAt = Date.now(); G.respForcedSeq = G.respSeq; clearTimeout(G.forceTimer); clearTimeout(G.forceTick); /* forceStartAt: a yes after this is an answer to the line, whatever the clock since the save says (Patient Pat, Oct 29: 6 next-step yeses inside the 8 s same-yes window were lost) */
    clearTimeout(f.soundTimer); f.soundTimer = setTimeout(() => { if (G.forced !== f || f.sound || !G.live) return; f.started = false; act("step", `Scripted line's reply started but no sound in ${SOUND_WAIT_MS / 1000} s: treated as not started`); /* 5:59 PM call, Oct 29: acknowledged at once, silent for 23 s, the watchdogs stood down */
      G.forceTimer = setTimeout(() => { const g = G.forced; if (g && !g.started) { G.forced = null; G.lateForced = { text: g.text, said: 0, at: Date.now() }; act("step", `Scripted line didn't play in ${FORCE_WAIT_MS / 1000} s: Ara says it instead (${forcedTrace(g)})`); guide(g.fallback); } }, FORCE_WAIT_MS / 2); forceTick(true); }, SOUND_WAIT_MS); }
  else if (/audio\.delta$/.test(t) && f.started) { f.sound = true; clearTimeout(f.soundTimer); }
  else if (t === "response.done" && f.started) {
    const said = sameWords(G.bot || ""), want = sameWords(f.text);
    if (said.length >= 12 && !want.startsWith(said.slice(0, 40)) && !said.startsWith(want.slice(0, 40))) {
      // Ara answered on her own (to the tool result) and the app took that for the scripted line starting (Oct 25 6:04 PM: a read-back heard twice, 8 s apart)
      if (f.viaReply && saidLine(said, want)) { G.forced = null; G.lastForcedText = f.text; act("step", `${PROV().name} said the scripted line in its own words`); if (f.then) setTimeout(() => guide(f.then), 0); return; } /* no late copy is coming on this engine */
      if (saidLine(said, want)) { G.forced = null; G.lateForced = { text: f.text, said: 0, at: Date.now(), resp: G.respSeq, firstAudio: G.audioSamples || 0 }; act("step", "Ara said the scripted line in her own words before it played: its late copy will be cut"); if (f.then) setTimeout(() => guide(f.then), 0); }
      else if (/\?\s*$/.test(G.bot || "") && /\?\s*$/.test(f.text) && Date.now() - f.at <= TWO_Q_MS) { G.forced = null; G.lateForced = { text: f.text, said: 0, at: Date.now(), resp: G.respSeq, firstAudio: G.audioSamples || 0 }; act("step", `Ara asked her own question while the app's scripted question was still to come: hers stands, the scripted copy will be cut (${forcedTrace(f)})`); if (f.then) setTimeout(() => guide(f.then), 0); } /* 10:05 AM call: two questions in a row */
      else { f.started = false; act("step", `Ara answered on her own while the scripted line was still to come (${forcedTrace(f)})`); clearTimeout(G.forceTimer); G.forceTimer = setTimeout(() => { const g = G.forced; if (g && !g.started) { G.forced = null; G.lateForced = { text: g.text, said: 0, at: Date.now() }; act("step", `Scripted line didn't play in ${FORCE_WAIT_MS / 1000} s: Ara says it instead (${forcedTrace(g)})`); guide(g.fallback); } }, FORCE_WAIT_MS); }
      return; }
    G.forced = null; G.lastForcedText = f.text; if (!G.bot) G.bot = f.text; { const st = (f.events || []).find(x => x.t === "response.created"); G.traceN = (G.traceN || 0) + 1; if (G.traceN <= 2 || !st || st.dt > 2500) act("step", `Scripted line played (${forcedTrace(f)})`); } /* the first two per call and every slow one: enough to see the ack without flooding the log */ if (f.then) setTimeout(() => guide(f.then), 0); }
}
// did Ara say the scripted line in her own words? Most of the shorter line's words shared, and enough of them: a three-word echo
// ("For the date.") shares "the" and "date" with an 18 s read-back and is not that read-back (Oct 28: the real read-back was then cut as a late copy)
function saidLine(said, want) { const n = said.split(" ").filter(Boolean).length, w = want.split(" ").filter(Boolean).length; return wordOverlap(said, want) >= 0.6 && n >= Math.min(8, Math.ceil(w / 2)); }
// how much two lines share, as a fraction of the shorter one's words
function wordOverlap(a, b) { const A = new Set(a.split(" ").filter(Boolean)), B = new Set(b.split(" ").filter(Boolean)); if (!A.size || !B.size) return 0; let n = 0; A.forEach(w => { if (B.has(w)) n++; }); return n / Math.min(A.size, B.size); }
