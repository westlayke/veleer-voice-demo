"use strict";
// Citizens VCRM demo: keeping the voice line to Grok alive (loaded after voice.js; all files share one scope).
// Voice passes, opening the line and reopening it when it drops, line tests and connection readings, stall and
// quiet detection, asking Grok again when it goes silent, and the sounds and spoken line when the service is down.
// What Ara is told after a reconnect is reconnectLine() below; the doubled-reply guard is in onEvent() in voice.js.

/* ---------- timings: tune here ---------- */
const IDLE_MS = 12000, IDLE_HF_MS = 30000;   // hang up after this much quiet (hands-free: a driver may take a while to answer)
const NOISE_CAP_MS = 60000;                  // sound on the mic counts as talking, but not for longer than this (road noise)
const STALL_MS = 5000, SPEAK_RMS = 0.04;     // officer's voice on the mic this long with no word from the voice service: the line may be dead
const LINE_TEST_MS = 3000;                   // how long a line test (a tiny request to the key holder) may take before it counts as failed
const SLOW_LINE_MS = 2000;                   // a line test slower than this is a slow line: open a fresh one rather than ask Grok again
const STALL_SLOW_MS = 2500;                  // while the officer is talking, a line test slower than this counts as a stall
const MAX_DROPS = 3;                         // reconnect tries shown in the log as "n of 3"; the call no longer ends by count (Oct 25: a driveway dead spot took 4)
const NO_LINE_GIVE_UP_MS = 120000;           // the call ends only after this long without a word from the voice service, while the phone keeps reconnecting
const RECONNECT_DELAYS = [0, 1000, 4000, 10000]; // wait before reconnect try 1, 2, 3, spread out so a short dead spot can pass
const OFFLINE_WAIT_MS = 15000;               // when the phone says it's offline, wait up to this long for it to come back
const SECOND_LINE_MS = 5000;                 // a new line not open after this long gets a second one alongside
const OPEN_TIMEOUT_MS = 10000;               // a new line not open after this long counts as a failed try
const MAX_ASKS = 1;                          // times the app asks Grok again for a reply before opening a fresh line
const TICK_MS = 4000;                        // soft tick while waiting, and the early line test when no reply has started
const ASK_AGAIN_MS = 10000;                  // ask Grok again when no reply has started by now (Grok sometimes takes 6 to 10 s)
const EARLY_PING_MS = 2500;                  // the early line test's limit
const RESUME_MS = 25 * 60000;               // a line reopened within this long picks up the same conversation on xAI (kept 30 minutes)
const FORCE_WAIT_MS = 5000;                  // a scripted line that hasn't started by now is said by Ara instead (3 s was too short on a slow line, Oct 25)
const LATE_FORCE_MS = 25000;                 // a scripted line that then plays late, after Ara said it, is cut as a duplicate within this long
const TOKEN_WAIT_MS = 6000;                  // a voice pass that takes longer counts as failed (Oct 25: one took 89 s, the next never came back and the call hung)
const TOKEN_RETRY_MS = 2000;                 // between tries for a voice pass while the line is down
const DOWN_GIVE_UP_MS = 120000;              // a line down this long (no voice pass to be had) ends the call with the phone's spoken notice
const SAY_DOWN_MS = 5000, SAY_STILL_MS = 12000, SAY_REPEAT_MS = 10000; // the phone's own spoken lines while the line is down (Carverhill, Oct 25)
const DOWN_LINES = ["The line dropped. Reconnecting you to Ara.", "Still trying to reconnect."]; // recorded in sounds/ (line-dropped, still-trying, line-back): the phone's own speech is silent during a call on an iPhone (Oct 25)
const LINE_FILES = { dropped: "line-dropped.mp3", still: "still-trying.mp3", back: "line-back.mp3" }, lineRaw = {}, lineBuf = {};
const LOC_FRESH_MS = 120000;                // a position older than this is not written into a connection row
const STABLE_MS = 20000;                     // a line open this long before it drops starts the reconnect count afresh (separate drops on a drive aren't one failure)
const SOUND_BACK_MS = 6000;                  // when the phone pauses the app's sound (a notification, Siri, another app), keep the call this long while it comes back

// a voice pass lasts 5 minutes: fetch one when the app opens or comes back, so tapping the mic doesn't wait for it (also wakes the Cloudflare service)
const TOK = { p: null, at: 0 };
function prefetchToken() {
  if (document.visibilityState !== "visible" || (TOK.p && Date.now() - TOK.at < 180000)) return; // during a call too, so a dropped line reconnects without waiting for a new pass
  TOK.at = Date.now(); TOK.p = mintToken(); TOK.p.catch(() => { TOK.p = null; TOK.at = 0; });
}
function getToken() { // each pass is used once; an old or failed one is replaced by a fresh fetch
  const p = TOK.p, fresh = p && Date.now() - TOK.at < 240000; TOK.p = null; TOK.at = 0;
  return fresh ? p.catch(() => mintToken()) : mintToken();
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") prefetchToken(); });
setInterval(prefetchToken, 60000); // keeps a pass ready while the app sits open
async function mintToken(limit = TOKEN_WAIT_MS) {
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), limit); let r;
  try { r = await fetch(tokenUrl(), { method: "POST", headers: { "X-Demo-Code": S.settings.demoCode || DEMO_CODE }, signal: ac.signal }); }
  catch (e) { throw new Error(ac.signal.aborted ? `no answer in ${limit / 1000} s` : "no connection"); } finally { clearTimeout(to); }
  if (!r.ok) throw new Error(r.status === 401 ? "bad_code" : "service_" + r.status);
  const j = await r.json();
  const t = j.value || (j.client_secret && (j.client_secret.value || j.client_secret)) || j.token || j.secret;
  if (!t || typeof t !== "string") throw new Error("token_shape");
  return t;
}
// Grok bills for every minute a conversation is open, so hang up after 12 seconds with no talking and no taps
const idleMs = () => G.hands ? IDLE_HF_MS : IDLE_MS;
function idleCheck() {
  // a driver can't see the screen: a soft tick every 4 s while Ara is slow to answer or the line is reconnecting
  if (G.live && ((G.asked && Date.now() - (G.askedAt || 0) >= TICK_MS) || (/^Reconnecting/.test(G.status) && !(G.downAt && Date.now() - G.downAt >= SAY_DOWN_MS))) && Date.now() - (G.tickAt || 0) >= TICK_MS) { G.tickAt = Date.now(); cue("wait"); vlog("still working: tick"); }
  // "Speaking" is what the officer hears, not what arrived: once nothing is scheduled to play, the screen goes back to Listening (Oct 25: "I see Speaking but hear nothing")
  if (G.status === "Speaking" && G.ctx && G.playHead <= G.ctx.currentTime && !G.sources.length) { G.status = "Listening"; paintCall(); }
  if (!G.live || G.idleEnding || G.soundPausedAt || G.micMutedAt || /^(Connecting|Reconnecting)/.test(G.status)) return;
  const playing = G.audioOn || G.responding || (G.ctx && G.playHead > G.ctx.currentTime);
  if (playing) { busy(); return; }
  if (G.probing) return;
  // the officer is talking but the voice service hasn't heard anything: the line may have stalled without closing (seen Oct 24 in a dead spot)
  const talking = G.speechSince && Date.now() - G.speechSince > STALL_MS && Date.now() - (G.lastMsg || 0) > STALL_MS;
  const since = Date.now() - (G.lastAct || Date.now());
  const quiet = since >= idleMs() && (Date.now() - (G.loudAt || 0) >= idleMs() || since >= NOISE_CAP_MS); // sound on the mic counts as talking, but not for more than a minute (road noise)
  if (!talking && !quiet) return;
  G.probing = true; const ws = G.ws;
  pingMs(LINE_TEST_MS).then(ms => { G.probing = false; if (!G.live || G.ws !== ws || G.idleEnding || /^(Connecting|Reconnecting)/.test(G.status)) return;
    const fresh = Date.now() - (G.lastMsg || 0) < LINE_TEST_MS; // the voice service is still sending: the line is alive, however slow the test (seen Oct 24: a 2.7 s test while Grok was answering)
    if (!fresh && (typeof ms !== "number" || (talking && ms > STALL_SLOW_MS))) { G.stalled = true; G.speechSince = 0; netLog(`Line stalled (${talking ? "officer talking, nothing heard back" : "12 s of quiet"})`, ms); reconnect("the line stalled"); return; }
    if (talking) { G.speechSince = 0; return; } // the line is fine: it was background noise
    if (Date.now() - (G.lastAct || Date.now()) >= idleMs()) idleStart(); });
}
function idleStart() {
  G.idleEnding = true; G.idleAt = Date.now(); vlog(`${idleMs() / 1000} seconds quiet: hanging up`);
  forceSay("I'll hang up for now. Tap the mic when you need me.");
  G.idleTimer = setTimeout(idleHangUp, 12000); // in case Grok doesn't answer
}
function idleHangUp() { clearTimeout(G.idleTimer); if (!G.live) return; const secs = idleMs() / 1000; endCall(`${secs} seconds of quiet`); toast(`Hung up after ${secs} seconds of quiet. Tap the mic when you need me.`); }
/* ---------- the voice line: opened at the start, and opened again when it drops (a phone in a car loses signal) ---------- */
function openSocket(token, first, second) {
  // a line opened again within 25 minutes picks up the same conversation (xAI keeps it 30 minutes)
  const resume = G.convId && Date.now() - (G.convAt || 0) < RESUME_MS ? G.convId : null;
  const ws = new WebSocket("wss://api.x.ai/v1/realtime?model=grok-voice-latest" + (resume ? "&conversation_id=" + encodeURIComponent(resume) : ""), ["xai-client-secret." + token]);
  ws.resumed = resume;
  if (second) G.tries.add(ws); else { G.ws = ws; G.tries = new Set([ws]); }
  const t0 = Date.now();
  if (G.drops && !second) {
    // not open after 5 s: try a second line alongside, and keep whichever opens first (seen Oct 24: the first try hung for 10 s)
    setTimeout(async () => { if (!G.live || G.ws !== ws || ws.readyState !== 0) return;
      act("step", `Voice line not open after ${SECOND_LINE_MS / 1000} s: trying a second line alongside`);
      let tk; try { tk = await getToken(); } catch (e) { return; }
      if (G.live && G.ws === ws && ws.readyState === 0 && G.tries) openSocket(tk, first, true); }, SECOND_LINE_MS);
    // in a dead spot the line can neither open nor fail: give it OPEN_TIMEOUT_MS, then count it as a failed try
    setTimeout(() => { if (G.live && G.ws === ws && ws.readyState === 0) { netLog(`Voice line didn't open in ${OPEN_TIMEOUT_MS / 1000} s`); reconnect("the line didn't open"); } }, OPEN_TIMEOUT_MS);
  }
  ws.onopen = () => {
    if (G.ws !== ws && !(second && G.tries && G.tries.has(ws))) return;
    if (G.tries) G.tries.forEach(o => { if (o !== ws) { try { o.onclose = null; o.close(); } catch (e) {} } }); G.tries = null; G.ws = ws;
    send({ type: "session.update", session: sessionCfg() }); sendExtras(); if (typeof first === "function") first(); else guide(first);
    downEnd(true); G.openedAt = Date.now(); linePrep();
    if (ws.resumed) netLog("Picked up the same conversation");
    G.status = "Listening"; G.lastMsg = Date.now(); G.speechSince = 0; busy(); paintCall(); setTimeout(() => { G.stalled = false; G.spokeInGap = false; }, 0);
    vlog(`connected in ${Date.now() - G.t0} ms (voice pass ${G.passReady ? "was ready" : "fetched on tap"})`);
    netLog(`Voice line open in ${Date.now() - t0} ms${second ? " (the second line)" : ""}${G.drops ? ` (reconnect ${G.drops})` : ""}`);
    if (G.drops) setTimeout(prefetchToken, 2000); // the ready pass was used: have the next one ready for another drop (seen Oct 24: 7 s to fetch one)
    clearInterval(G.netTick); G.netTick = setInterval(async () => { if (!(G.live && G.ws === ws)) return; const ms = await pingMs(); netLog("Reading", ms);
      // nothing was expected from Grok (the officer was thinking), so nothing else notices a dead network: a second quick test, then a fresh line (Oct 25: 35 s of "Hello?")
      if (typeof ms === "number" || !G.live || G.ws !== ws || /^(Connecting|Reconnecting)/.test(G.status)) return;
      const again = await pingMs(LINE_TEST_MS); if (typeof again === "number" || !G.live || G.ws !== ws || /^(Connecting|Reconnecting)/.test(G.status)) return;
      act("step", "The line went quiet (two test requests unanswered): fresh line"); reconnect("the line went quiet"); }, 30000);
  };
  ws.onmessage = (m) => { if (G.ws !== ws) return; G.lastMsg = G.convAt = Date.now(); let e; try { e = JSON.parse(m.data); } catch (x) { return; } onEvent(e); };
  ws.onclose = (ev) => {
    if (G.ws !== ws || !G.live) return;
    vlog("connection closed " + (ev && ev.code));
    const opened = !!G.lastMsg && G.status !== "Connecting…";
    netLog(`Voice line closed (code ${ev && ev.code}${ev && ev.reason ? ", " + String(ev.reason).slice(0, 120) : ""})${opened ? "" : " before it opened"}`);
    if (document.visibilityState === "hidden") { interrupted("connection closed while away"); return; }
    if (!opened && ws.resumed) { G.convId = null; act("step", "Couldn't pick up the same conversation: opening a new one"); reconnect("the conversation couldn't be picked up"); return; }
    if (!opened && !G.drops) { endCall("couldn't connect"); toast("Couldn't connect to Grok voice. Try again in a moment."); return; }
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
async function reconnect(why) {
  if (!G.live) return;
  if (Date.now() - (G.lastMsg || G.t0 || Date.now()) > NO_LINE_GIVE_UP_MS) { voiceUnavailable(why); return; } // 2 minutes with no usable line, however many tries
  G.drops++; G.status = "Reconnecting…"; G.responding = G.qInstr = G.qCreate = G.asked = false; G.retried = 0;
  clearTimeout(G.qTimer); clearTimeout(G.askWatch); clearTimeout(G.tickWatch); clearInterval(G.netTick); G.retriedAt = 0; G.dropNext = false; stopPlayback(); paintCall();
  const old = G.ws; G.ws = null; try { old && old.close(); } catch (e) {} closeTries();
  if (G.drops === 1) cue("drop");
  downStart();
  vlog(`reconnecting (${G.drops}): ${why}`); act("step", `Reconnecting (${G.drops}): ${why}`);
  await new Promise(r => setTimeout(r, RECONNECT_DELAYS[Math.min(G.drops, MAX_DROPS)] || RECONNECT_DELAYS[RECONNECT_DELAYS.length - 1])); // spread out, so a short dead spot can pass
  if (navigator.onLine === false) await new Promise(r => { const t = setTimeout(r, OFFLINE_WAIT_MS); window.addEventListener("online", () => { clearTimeout(t); r(); }, { once: true }); });
  if (!G.live) return;
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
  if (G.spokeInGap) act("step", "The officer talked while the line was down: Ara will ask them to repeat it");
  G.lastMsg = 0; openSocket(token, () => guide(reconnectLine()));
}
const reconnectLine = () => { const d = draftSummary(), l = G.recent || [], sv = (G.saves || []).length ? `Saved so far in this conversation, all done and NOT to be saved again: ${G.saves.join("; ")}. ` : "",
    justSaved = G.savedAt && Date.now() - G.savedAt < 2 * 60e3 && !V ? `The last save (${G.savedLine}) went through just before the drop and its form closed; don't call save_form for it. ` : "",
    carryOn = !V && G.lastSaved && Date.now() - G.lastSaved.at < 10 * 60e3 ? `You were working on ${G.lastSaved.who}: after the sorry line, ${G.lastSaved.next} Never ask whether they want to work on someone else. ` : "",
    hf = G.hands ? "Hands-free is on: the app reads each finished form back and asks \"Shall I save it?\" itself, so never read a form back or ask whether it's correct yourself. " : "";
  return `The connection to the officer dropped for a moment (they may be driving) and the app reconnected you. ${l.length ? `The last things said were:\n${l.join("\n")}\n` : ""}${sv}${justSaved}${carryOn}${hf}${d ? d + " " : ""}${G.spokeInGap ? "The officer was talking while the line was down and you didn't hear it: right after the sorry line, ask them to say that again. " : G.stalled ? "The officer may have answered while the line was down and you didn't hear it. " : ""}If they ask whether you're there, say yes in two words and carry on with what you were doing; never ask "what would you like to do" while a form is open, and don't say "welcome back". Say "Sorry, I lost you for a moment."${spookyMode() ? " in your haunted-house host voice" : xmasMode() ? " in your warm Christmas host voice" : ""} with no ${spookyMode() ? "spooky" : xmasMode() ? "festive" : "other"} aside in this reply. Then ask just one question: if the last thing said was a question to the officer and they haven't answered it in the lines above, ask it again; otherwise ask the next question needed to finish. If the officer's answer is in the lines above, use it (call the draft tool with it) instead of asking. Do not start over or ask for anything already filled in. Anything already done stays done; never redo it${spookyMode() || xmasMode() ? ", and don't turn the theme on again or announce it" : ""}.`; };
// while the line is down the phone itself speaks, since Grok can't: "The line dropped..." at 5 s, "Still trying..." at 12 s and every 10 s after (Carverhill, Oct 25: he had no idea what was going on)
function linePrep() { // fetch and decode the recorded lines, so they can play the moment the line drops
  Object.entries(LINE_FILES).forEach(([k, f]) => { if (!lineRaw[k]) lineRaw[k] = fetch((ON_PREVIEW ? "preview/" : "app/") + "sounds/" + f).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null); });
  const c = G.ctx; if (!c) return;
  Object.keys(LINE_FILES).forEach(k => { if (lineBuf[k]) return; lineRaw[k].then(b => b && c.decodeAudioData(b.slice(0))).then(buf => { if (buf) lineBuf[k] = buf; }).catch(() => {}); });
}
function playLine(kind) { // through the call's own sound, which the phone keeps open during a conversation
  const c = G.ctx; if (!c || c.state !== "running" || !lineBuf[kind]) return false;
  try { const src = c.createBufferSource(), g = c.createGain(); g.gain.value = 1; src.buffer = lineBuf[kind]; src.connect(g); g.connect(c.destination); src.start(c.currentTime + 0.02); G.lineSrc = src; G.lineEndAt = Date.now() + lineBuf[kind].duration * 1000 + 50; return true; } catch (e) { return false; }
}
function sayLocal(text, kind) {
  const how = kind && playLine(kind) ? "recording" : (() => { try { if (!window.speechSynthesis) return ""; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1; speechSynthesis.speak(u); return "phone's speech"; } catch (e) { return ""; } })();
  if (how) { act("step", `The phone said (${how}): "${text}"`); vlog(`phone said (${how}): ${text}`); }
  return !!how;
}
function downStart() {
  if (G.downAt) return; G.downAt = Date.now(); linePrep();
  const again = () => { if (!G.live || !G.downAt) return; sayLocal(DOWN_LINES[1], "still"); G.downTimer = setTimeout(again, SAY_REPEAT_MS); };
  G.downTimer = setTimeout(() => { if (!G.live || !G.downAt) return; sayLocal(DOWN_LINES[0], "dropped"); G.downTimer = setTimeout(again, SAY_STILL_MS - SAY_DOWN_MS); }, SAY_DOWN_MS);
}
function downEnd(back) { clearTimeout(G.downTimer); G.downTimer = null;
  const cut = G.lineEndAt && Date.now() < G.lineEndAt; // a status recording still playing is stopped so it can't overlap Ara (Oct 25 call)
  if (cut) { try { G.lineSrc && G.lineSrc.stop(); } catch (e) {} act("step", "The phone's status line was cut short: the line came back"); } G.lineSrc = null; G.lineEndAt = 0;
  if (G.downAt) { try { speechSynthesis.cancel(); } catch (e) {} vlog(`line back after ${Math.round((Date.now() - G.downAt) / 1000)} s`); if (back && !cut && Date.now() - G.downAt >= SAY_DOWN_MS) sayLocal("You're back with Ara.", "back"); }
  G.downAt = 0; }
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
  try { if (window.speechSynthesis) setTimeout(() => { const u = new SpeechSynthesisUtterance("The voice service isn't answering right now. Tap the mic to try again."); u.rate = 1; speechSynthesis.speak(u); }, 750); } catch (e) {}
}
// Now and then Grok takes a tool answer or notice and never speaks (no response, or an empty or failed one),
// which left the officer in silence until the 12-second hang-up. The app asks once more, then logs it.
function askReply(guidance) {
  if (guidance !== undefined) G.askGuide = guidance; // the same guidance goes again if the app has to ask twice
  send(G.askGuide ? { type: "response.create", response: { instructions: "App guidance for this reply only (never read it aloud): " + G.askGuide } } : { type: "response.create" }); G.asked = true; G.askedAt = Date.now();
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
function soundPaused(ctx) {
  if (G.soundPausedAt) return; G.soundPausedAt = Date.now();
  const why = `Sound paused by the phone (${ctx.state}; app ${document.visibilityState}${document.hasFocus && !document.hasFocus() ? ", not in focus" : ""})`;
  vlog(why); netLog(why);
  const tick = setInterval(() => {
    if (!G.live || G.ctx !== ctx) { clearInterval(tick); G.soundPausedAt = 0; return; }
    if (ctx.state === "running") { clearInterval(tick); const s = ((Date.now() - G.soundPausedAt) / 1000).toFixed(1); G.soundPausedAt = 0; vlog("sound back after " + s + " s"); act("step", "Sound paused by the phone for " + s + " s, then came back"); return; }
    if (document.visibilityState === "visible") ctx.resume().catch(() => {});
    if (Date.now() - G.soundPausedAt > SOUND_BACK_MS) { clearInterval(tick); G.soundPausedAt = 0; interrupted("audio " + ctx.state + ", sound didn't come back"); }
  }, 500);
}
// the same for the mic: an iPhone mutes it for a moment (seen Oct 24, 4 s into a call); end only if it stays muted
function micMuted(tr) {
  if (G.micMutedAt) return; G.micMutedAt = Date.now(); vlog("mic muted by the phone"); netLog("Mic muted by the phone");
  const tick = setInterval(() => {
    if (!G.live || !G.stream || !G.stream.getAudioTracks().includes(tr)) { clearInterval(tick); G.micMutedAt = 0; return; }
    if (!tr.muted) { clearInterval(tick); const s = ((Date.now() - G.micMutedAt) / 1000).toFixed(1); G.micMutedAt = 0; act("step", "Mic muted by the phone for " + s + " s, then came back"); return; }
    if (Date.now() - G.micMutedAt > SOUND_BACK_MS) { clearInterval(tick); G.micMutedAt = 0; interrupted("mic muted, didn't come back"); }
  }, 500);
}

/* ---------- scripted lines: xAI speaks the exact words (force_message), then Ara carries on ---------- */
// Used where the words matter and Ara used to stop or change them (Oct 24: "Say only ..." left her silent mid-form).
// If xAI doesn't play it, Ara is asked to say it instead (fallback), so the officer always hears it.
function forceSay(text, then, fallback, waited = 0) {
  if (!G.live) { G.pendingForce = null; return; }
  if (!waited) G.pendingForce = text;
  if ((G.responding || playingLeft() > 0 || G.forced) && waited < 8000) { setTimeout(() => forceSay(text, then, fallback, waited + 200), 200); return; }
  G.forced = { text, then, fallback: fallback || `Say exactly: "${text}"`, started: false }; if (G.pendingForce === text) G.pendingForce = null;
  send({ type: "conversation.item.create", item: { type: "force_message", role: "assistant", content: [{ type: "output_text", text }], interruptible: true } });
  vlog("scripted line: " + text);
  clearTimeout(G.forceTimer); G.forceTimer = setTimeout(() => { const f = G.forced; if (f && !f.started) { G.forced = null; G.lateForced = { text: f.text, said: 0, at: Date.now() }; act("step", "Scripted line didn't play: Ara says it instead"); guide(f.fallback); } }, FORCE_WAIT_MS);
}
function forcedEvent(t) {
  const f = G.forced;
  if (t === "response.created") { f.started = true; clearTimeout(G.forceTimer); }
  else if (t === "response.done" && f.started) { G.forced = null; G.lastForcedText = f.text; if (!G.bot) G.bot = f.text; if (f.then) setTimeout(() => guide(f.then), 0); }
}
