// Did the officer hear Ara? (Carverhill, Oct 25: "whenever I say are you there it means I heard nothing for quite a while")
// Three readings for every line Ara says: voice audio received from the voice service, sound produced by the phone (an
// analyser on the speaker path), and the mic hearing the speaker while it played (the echo level the barge-in guard already
// measures). A line that fails a reading is logged; "Are you there?" logs the readings of the last line and has Ara repeat it.
const HEARD_WORDS = /\b(are you (still )?there|you (still )?there\?|can you hear me|did you hear me|anyone there|are you with me|hello\?|hello, ara|ara\?)/i;
const OUT_QUIET = 0.003;   // speaker-path level below this while a line plays: the phone produced no sound from it
const SILENT_JUDGE_MS = 2000; // how long after a line should have ended before it counts as silent (Oct 28 10:03 PM: her sounded copy came 1.4 s after a words-only one)
const AUDIO_MIN_S = 0.3;   // a spoken line of two words or more has at least this much voice audio
let SILENT_STILL_MS = 6000, SILENT_RESEND_MS = 13000; /* after the judgement (2 s past the line's end): "Still waiting on Ara" at ~8 s, one resend at ~15 s (Carverhill, Oct 30: wait for the real response, fill the dead space with the recording; on the 12:45 PM call the late sound came 1-16 s after the words) */
function outLevel() {
  const a = G.outAn; if (!a) return 0;
  const d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d); let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] * d[i];
  return Math.sqrt(s / (d.length / 4));
}
function heardTick() { if (!G.live || !G.ctx || !(playingRaw() > 0)) { G.clockSeen = null; return; } clockWatch(); const l = outLevel(); if (l > (G.outPeak || 0)) G.outPeak = l; if (l > OUT_QUIET) G.soundEver = true; }
/* the phone's sound engine can say it is running while its clock stands still (Carverhill's 10:02 PM call, Oct 31: after a 15 s lock the fresh engine
   never advanced, 30 s of Ara's audio queued on it, nothing heard). Queued audio with a clock that hasn't moved for CLOCK_STILL_MS: the dead engine is
   closed and the sound and mic started afresh, up to CLOCK_RESTARTS times a call (his 11:21 PM and 12:02 AM calls, Nov 1: the one fresh engine had a
   dead clock too, and the call sat on "Speaking" with nothing heard), then Ara says her last line again word for word (asked for it in her own words
   she answered "Silence." four times out of four). While the clock is dead nothing counts as playing: the screen says Listening and the app's waits
   for her sound stand down */
const CLOCK_STILL_MS = 1500, CLOCK_RESTARTS = 1; /* one fresh start, then the Carry on card (Carverhill's 12:25 and 12:58 AM calls, Nov 1: three fresh starts in a row never helped and the card came 21 s after the unlock; one brings it to about 8 s) */
function clockDead() { const s = G.clockSeen; return !!(s && G.ctx && s.ctx === G.ctx && G.ctx.currentTime === s.t && Date.now() - s.at >= CLOCK_STILL_MS); }
function clockWatch() {
  const now = Date.now(), t = G.ctx.currentTime, seen = G.clockSeen;
  if (!seen || seen.ctx !== G.ctx || t !== seen.t) { G.clockSeen = { ctx: G.ctx, t, at: now }; return; }
  if (now - seen.at < CLOCK_STILL_MS || G.ctx.state !== "running" || (G.clockStuckAt && now - G.clockStuckAt < CLOCK_STILL_MS + 2000)) return;
  const n = G.clockStuckN || 0, line = G.lastBot || "";
  if (!seen.resumed) { /* first a pause and resume of the engine itself (cheap; a second judgement follows CLOCK_STILL_MS later) */
    const still = ((now - seen.at) / 1000).toFixed(1); seen.resumed = true; seen.at = now; const ctx = G.ctx;
    act("step", `The phone's sound clock stood still for ${still} s with ${playingRaw().toFixed(1)} s of Ara's audio queued: pausing and resuming the engine`);
    G.selfSuspend = ctx; ctx.suspend().then(() => ctx.resume()).catch(() => {}).then(() => { if (G.selfSuspend === ctx) G.selfSuspend = null; }); return; }
  if (n >= CLOCK_RESTARTS) { if (!G.clockGaveUp) { G.clockGaveUp = true;
      act("step", `The phone's sound clock stood still again with ${playingRaw().toFixed(1)} s of Ara's audio queued: ${CLOCK_RESTARTS} fresh start${CLOCK_RESTARTS === 1 ? " had a dead clock" : "s had dead clocks"} too, so the Carry on card is shown (sound started inside a tap is honoured by the phone; Carverhill, Nov 1: the usual card, not a new button)`);
      interrupted("the phone kept its sound engine stopped after the lock", "Your phone kept its sound off after the lock. Tap Carry on to bring it back."); } return; }
  G.clockStuckAt = now; G.clockStuckN = n + 1;
  act("step", `The phone's sound clock stood still for ${((now - seen.at) / 1000).toFixed(1)} s with ${playingRaw().toFixed(1)} s of Ara's audio queued (sound ${G.ctx.state}${n ? `; fresh start ${n} of ${CLOCK_RESTARTS} had a dead clock too` : ""}): nothing was heard`);
  if (typeof restartAudio !== "function") return;
  act("step", `Starting the sound and mic afresh after the sound clock stood still (${n + 1} of ${CLOCK_RESTARTS}; the dead engine is closed first)`);
  restartAudio("after the sound clock stood still", { closeFirst: true }).then(ok => {
    if (!G.live) return;
    if (!ok) { interrupted("sound couldn't be started afresh after its clock stood still", "Your phone's sound engine stopped and couldn't be started again."); return; }
    if (!line) return;
    setTimeout(() => { if (!G.live || !line) return;
      act("step", `Sound started afresh: Ara says her last line again, word for word ("${line.slice(0, 80)}")`);
      G.lastBot = ""; /* else the repeat is cut as a doubled reply */ forceSay(line, undefined, undefined, 0, true); }, 1200); }); /* a repeat of a line already said: kept scripted whichever way the setting goes */
}
setInterval(heardTick, 250);
function heardProblem(r) {
  const words = r.text.trim().split(/\s+/).length;
  if (words >= 2 && r.audioS < AUDIO_MIN_S) return "no voice audio came from the voice service, only the words";
  if (r.state !== "running") return `the phone's sound is ${r.state}`;
  if (r.audioS >= AUDIO_MIN_S && r.out < OUT_QUIET) return `the phone produced no sound from it (speaker level ${r.out.toFixed(3)})`;
  return "";
}
const heardWords = (r) => `${r.audioS.toFixed(1)} s of voice audio, speaker level ${r.out.toFixed(3)}, mic heard ${r.echo.toFixed(3)} while it played, sound ${r.state}`;
// at the end of a line Ara said: keep its readings, and check them once it should have finished playing
function lineHeard(text) {
  const rec = { text, at: Date.now(), resp: G.respSeq, audioS: (G.audioSamples || 0) / 24000, out: G.outPeak || 0, echo: G.echoPeak || 0, state: G.ctx ? G.ctx.state : "none", left: playingLeft() };
  /* a line with no sound has nothing left to play, but the officer can't have heard it: words count as an answer only once it would have finished (5:34 PM call, Oct 31: "Save it." 1.4 s after a soundless next-step line was taken as the answer) */
  rec.sayS = rec.audioS < 0.3 ? String(text).trim().split(/\s+/).length / 2.6 : 0; /* how long it would have taken to say */
  G.lastLine = rec; G.outPeak = 0;
  setTimeout(() => { if (!G.live || G.lastLine !== rec) return; rec.out = Math.max(rec.out, G.outPeak || 0); rec.state = G.ctx ? G.ctx.state : "none";
    const prob = heardProblem(rec); if (prob) { act("step", `${/^no voice audio/.test(prob) ? "(no sound) " : ""}Ara's line may not have been heard: ${prob} ("${text.slice(0, 80)}")`); vlog("not heard? " + prob); if (/^no voice audio|^the phone produced no sound/.test(prob) && rec.state === "running") silentLine(rec); }
    else { G.silentAgain = null; if (rec.audioS >= AUDIO_MIN_S) { G.audioEver = true; lineSaid(text); } } }, Math.max(0, rec.left * 1000) + SILENT_JUDGE_MS);
}
// a line counts as said only here, once it was heard with sound (Carverhill, Oct 30 4:50 PM call: the A to E ranges came as text only, and the
// next rating question was the short "A to E?"): the once-per-call flags are set from the heard line, never when a line is built or sent
function lineSaid(text) {
  const s = String(text || "");
  if (/\$250,000 and up/.test(s)) G.rangesSaidAt = Date.now();
  if (/say undo if that's wrong/i.test(s)) G.undoSaid = true;
  if (/National has C3/.test(s)) G.entityListAt = Date.now();
}
// the officer answered the line: only a new utterance of theirs after the line would have finished playing counts (the service transcribes the same
// words two or three times over a few seconds; on the 4:50 PM call a late copy of "No." to the question before made the resend stand down)
const answeredAfter = (rec) => !!(G.lastHeard && !G.lastHeard.repeat && G.lastHeard.at > rec.at + Math.max(rec.left, rec.sayS || 0) * 1000);
// her line came with words but no sound (Carverhill, Oct 28: 33 s of silence until "are you there?"): the phone says "Ara's taking a moment", then asks for the line again,
// once; a second silent copy means the line is dead and the phone reconnects. Only once a line of hers has been heard in this call (a typed test sends no audio).
function silentLine(rec) {
  if (!G.live || (!G.audioEver && !G.soundEver)) return; /* a typed run has neither voice audio nor sound; a real call has sound from its first recording */
  if (answeredAfter(rec)) { act("step", "Ara's line came without sound, but the officer answered after it: not asked again"); return; }
  if (G.silentAgain && G.silentAgain.text === rec.text) { G.silentAgain = null; act("step", "Ara's line came without sound twice: the line is treated as dead"); reconnect("her line came without sound twice"); return; }
  if (playingLeft() > 0 || araSounding()) { act("step", "Ara's line came without sound, but her sound is already playing or queued: a false alarm, nothing said"); return; } /* Oct 28 10:03 PM: her sounded copy was on the clock before the judgement, and the recording played over it */
  G.silentAgain = { text: rec.text, at: Date.now() }; act("step", `Ara's line came without sound: the phone says she's taking a moment and waits for the sound; it asks for the line again only after ${Math.round((SILENT_RESEND_MS + SILENT_JUDGE_MS) / 1000)} s ("${rec.text.slice(0, 60)}")`);
  quietSay("the sound of Ara's line"); /* and the quiet clock keeps the recordings coming every 5 s while G.silentWait stands (Oct 30) */
  const w = { rec, at: Date.now() }; G.silentWait = w;
  w.resend = setTimeout(() => { if (!G.live || G.silentWait !== w) return; G.silentWait = null; if (answeredAfter(rec)) { act("step", "Ara's line came without sound, but the officer answered after it: the resend stands down"); return; }
    const same = (t) => typeof sameWords === "function" && t && sameWords(t) === sameWords(rec.text);
    if (G.respSeq !== rec.resp || playingLeft() > 0 || araSounding() || same(G.forced && G.forced.text) || same(G.pendingForce)) { act("step", "Ara's line is being said again already: the phone's resend stands down"); return; } /* 10:05 AM call: the app's own copy was already on its way */
    const own = typeof sameWords === "function" ? sameWords(rec.text) === sameWords(G.lastForcedText || "") : rec.text === G.lastForcedText; G.lastBot = ""; /* else the resend is cut as a doubled reply */ /* the transcript's trailing space made every app line "not own" (diagnostic run, Oct 30): the resend went as a reply request the service never answered, and the line reconnected */
    act("step", `No sound for Ara's line in ${Math.round((Date.now() - rec.at) / 1000)} s: asked for it again, once (a late copy of either telling is cut)`); G.resend = { text: rec.text, at: Date.now(), seq: G.respSeq, resp: 0, firstAudio: 0, viaForce: own };
    if (own) forceSay(rec.text, undefined, undefined, 0, true); else askReply(`Your last line reached the officer as text only, with no sound. Say it again now, word for word: "${rec.text}"`); }, SILENT_RESEND_MS);
}
// the sound arrived after all (a sounded copy of the words-only line): the wait ends, nothing is asked again
function silentSoundArrived(text) {
  const w = G.silentWait; if (!w || sameWords(w.rec.text) !== sameWords(text)) return;
  clearTimeout(w.resend); G.silentWait = null; G.silentAgain = null; act("step", `The sound for Ara's line arrived ${((Date.now() - w.rec.at) / 1000).toFixed(1)} s after the words: nothing asked again`);
}
// the officer asks whether Ara is there: log what the phone knows about her last line, wake the sound if it's paused, and have her say it again
function heardAsk(text) {
  if (!HEARD_WORDS.test(text)) return false;
  const r = G.lastLine, ago = r ? Math.round((Date.now() - r.at) / 1000) : null;
  act("step", `The officer asked whether Ara is there: ${r ? `her last line was ${ago} s ago ("${r.text.slice(0, 80)}"): ${heardWords(r)}` : "she hasn't said anything yet"}; sound now ${G.ctx ? G.ctx.state : "none"}, ${playingLeft().toFixed(1)} s still to play`);
  if (G.ctx && G.ctx.state !== "running") G.ctx.resume().catch(() => {});
  if (typeof watchOff === "function") watchOff("the officer asked whether Ara is there"); /* her repeat of the last line must play, even within the watch */
  return true;
}
