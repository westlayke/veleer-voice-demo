// Did the officer hear Ara? (Carverhill, Oct 25: "whenever I say are you there it means I heard nothing for quite a while")
// Three readings for every line Ara says: voice audio received from the voice service, sound produced by the phone (an
// analyser on the speaker path), and the mic hearing the speaker while it played (the echo level the barge-in guard already
// measures). A line that fails a reading is logged; "Are you there?" logs the readings of the last line and has Ara repeat it.
const HEARD_WORDS = /\b(are you (still )?there|you (still )?there\?|can you hear me|did you hear me|anyone there|are you with me|hello\?|hello, ara|ara\?)/i;
const OUT_QUIET = 0.003;   // speaker-path level below this while a line plays: the phone produced no sound from it
const AUDIO_MIN_S = 0.3;   // a spoken line of two words or more has at least this much voice audio
function outLevel() {
  const a = G.outAn; if (!a) return 0;
  const d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d); let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] * d[i];
  return Math.sqrt(s / (d.length / 4));
}
function heardTick() { if (!G.live || !G.ctx || !(playingLeft() > 0)) return; const l = outLevel(); if (l > (G.outPeak || 0)) G.outPeak = l; }
setInterval(heardTick, 250);
function heardProblem(r) {
  const words = r.text.trim().split(/\s+/).length;
  if (words >= 2 && r.audioS < AUDIO_MIN_S) return r.own ? "the phone's own line was too short to have played" : "no voice audio came from the voice service, only the words";
  if (r.state !== "running") return `the phone's sound is ${r.state}`;
  if (r.audioS >= AUDIO_MIN_S && r.out < OUT_QUIET) return `the phone produced no sound from it (speaker level ${r.out.toFixed(3)})`;
  return "";
}
const heardWords = (r) => `${r.audioS.toFixed(1)} s of voice audio, speaker level ${r.out.toFixed(3)}, mic heard ${r.echo.toFixed(3)} while it played, sound ${r.state}`;
// at the end of a line Ara said: keep its readings, and check them once it should have finished playing
function lineHeard(text, own) {
  // own: a line the phone played itself (a recording or Ara's voice fetched from the key holder), so its audio never came from the voice service
  const rec = { text, at: Date.now(), own: !!own, audioS: own ? (G.lineEndAt ? Math.max(0, (G.lineEndAt - Date.now()) / 1000) : 0) : (G.audioSamples || 0) / 24000, out: G.outPeak || 0, echo: G.echoPeak || 0, state: G.ctx ? G.ctx.state : "none", left: playingLeft() };
  if (G.lastLine && G.lastLine.check) G.lastLine.check(); // a line that follows before the last one was checked: check that one now rather than drop it (Oct 27 harness: Grok's words-only reply went unflagged when the app's own line came 300 ms later)
  G.lastLine = rec; G.outPeak = 0;
  rec.check = () => { clearTimeout(rec.timer); rec.check = null; if (!G.live || G.lastLine !== rec) return; rec.out = Math.max(rec.out, G.outPeak || 0); rec.state = G.ctx ? G.ctx.state : "none";
    const prob = heardProblem(rec); if (prob) { act("step", `Ara's line may not have been heard: ${prob} ("${text.slice(0, 80)}")`); vlog("not heard? " + prob); } };
  rec.timer = setTimeout(rec.check, Math.max(0, rec.left * 1000) + 800);
}
// the officer asks whether Ara is there: log what the phone knows about her last line, wake the sound if it's paused, and have her say it again
function heardAsk(text) {
  if (!HEARD_WORDS.test(text)) return false;
  const r = G.lastLine, ago = r ? Math.round((Date.now() - r.at) / 1000) : null;
  act("step", `The officer asked whether Ara is there: ${r ? `her last line was ${ago} s ago ("${r.text.slice(0, 80)}"): ${heardWords(r)}` : "she hasn't said anything yet"}; sound now ${G.ctx ? G.ctx.state : "none"}, ${playingLeft().toFixed(1)} s still to play`);
  if (G.ctx && G.ctx.state !== "running") G.ctx.resume().catch(() => {});
  return true;
}
