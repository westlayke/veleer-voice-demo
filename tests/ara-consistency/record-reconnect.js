// Reconnect sound clip: one real hands-free conversation with Ara (xAI Grok) through the preview build, recorded as the
// phone would have played it, with the voice line cut during the read-back and restored a few seconds later, so the clip
// shows what a dead spot sounds like: Ara stops, the phone's own recordings play, Ara comes back and re-asks the question.
// The officer's lines are spoken by a second Grok voice (Rex), generated before the call so they fit on the timeline.
// Costs real money (about a dollar). Run (GitHub Actions, workflow "Reconnect sound clip"):
//   ARA_CONSISTENCY_KEY=... DOWN_MS=13000 node tests/ara-consistency/record-reconnect.js
// Output: tests/ara-consistency/results/reconnect/reconnect-clip.mp3 (+ .wav and a transcript with timings).
// Nothing reaches the activity log or the Cloudflare Worker: the token comes from this script and log posts stay here.
const http = require("http"), fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
let chromium; try { ({ chromium } = require("playwright")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright")); }

const KEY = process.env.ARA_CONSISTENCY_KEY;
const DOWN_MS = Number(process.env.DOWN_MS || 13000); // how long the line stays down (under the app's 15 s offline wait, so the same conversation is picked up)
const OFFICER_VOICE = process.env.OFFICER_VOICE || "rex";
const TURN_WAIT_MS = 60000, MAX_TURNS = 16, MAX_CONV_MS = 5 * 60000, RATE = 24000;
const ROOT = path.resolve(__dirname, "../.."), OUT = path.join(__dirname, "results", "reconnect");
const SOUNDS = path.join(ROOT, "preview", "sounds");
if (!KEY && !process.env.SELF_TEST) { console.error("ARA_CONSISTENCY_KEY is not set"); process.exit(1); }

// the officer's side: a real call from the activity log (Oct 25) with the names made up; the yes/no answers are given to whatever Ara asks
const LINES = ["Let's go into hands-free mode.", "Log an interaction with James Okafor.",
  "I met him yesterday at the Citizens Alliance Halloween party, in person. We talked about his interest in the North Dakota work.",
  "The next step is to call him today to talk about a donation of twenty-five thousand dollars."];
const ANSWERS = { subst: "Yes, it was.", yes: "Yes.", no: "No.", moveOn: "Move on.", neither: "Neither.", all: "No, that's all for now." };
const SAVED = /Interaction report/;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".css": "text/css", ".mp3": "audio/mpeg" };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});
function silentWav(file) {
  const rate = 48000, secs = 2, n = rate * secs, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  fs.writeFileSync(file, b);
}
async function mintToken() { // the app's own line
  const r = await fetch("https://api.x.ai/v1/realtime/client_secrets", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY }, body: JSON.stringify({ expires_after: { seconds: 300 } }) });
  return { status: r.status, body: await r.text() };
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- the officer's voice: officer-voice.js (a second Grok line reads each line out, word for word; cached on disk) ----------
const { officerAudio } = require("./officer-voice");

// ---------- the conversation, recorded ----------
async function record(browser, base, voices) {
  const rec = { officer: [], ara: [], phone: [], cuts: [], steps: [], turns: [], errors: [], started: new Date().toISOString() };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, permissions: ["microphone"] });
  await ctx.route(/veleer-voice\.klaracey\.workers\.dev/, async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (u.pathname === "/log") return route.fulfill({ status: 200, contentType: "application/json", body: req.method() === "GET" ? '{"logging":true}' : '{"stored":0}' });
    try { const t = await mintToken(); if (t.status !== 200) rec.errors.push("token " + t.status + " " + t.body.slice(0, 200)); return route.fulfill({ status: t.status, contentType: "application/json", body: t.body }); }
    catch (e) { rec.errors.push("token " + e.message); return route.fulfill({ status: 503, body: "{}" }); }
  });
  const p = await ctx.newPage();
  p.on("pageerror", e => rec.errors.push("page: " + e.message));
  let cur = null, lastFrame = Date.now(), lines = 0;
  p.on("websocket", ws => {
    if (!/api\.x\.ai/.test(ws.url())) return;
    lines++; rec.steps.push({ at: Date.now(), text: `voice line ${lines} opening` });
    ws.on("close", () => rec.steps.push({ at: Date.now(), text: `voice line ${lines} closed` }));
    ws.on("framereceived", f => { const s = String(f.payload); lastFrame = Date.now(); let e; try { e = JSON.parse(s); } catch (x) { return; }
      if (e.type === "response.created") { cur = { at: 0, text: "", chunks: [], turn: rec.turns.length }; rec.ara.push(cur); }
      else if (/audio\.delta$/.test(e.type)) { if (!cur) { cur = { at: 0, text: "", chunks: [], turn: rec.turns.length }; rec.ara.push(cur); } if (!cur.at) cur.at = Date.now(); cur.chunks.push(Buffer.from(e.delta || "", "base64")); }
      else if (/transcript\.delta$/.test(e.type) && !/input_audio/.test(e.type) && cur) cur.text += e.delta || "";
      else if (e.type === "response.done") { if (cur) cur.status = e.response && e.response.status; cur = null; }
      else if (e.type === "error") rec.errors.push("grok: " + JSON.stringify(e.error || e).slice(0, 300)); });
  });
  try {
    await p.goto(base + "preview-flow.html"); await p.waitForTimeout(800);
    await p.tap("text=I'd rather type my name"); await p.fill("#wlName", "Dana"); await p.tap("text=Start"); await p.waitForTimeout(600);
    await p.evaluate(() => {
      window.__acts = []; const real = act; act = function (role, text) { window.__acts.push({ at: Date.now(), role, text: String(text || "") }); return real.apply(this, arguments); };
      window.__phone = []; const realSay = sayLocal; sayLocal = function (text, kind) { window.__phone.push({ at: Date.now(), kind, text }); return realSay.apply(this, arguments); }; // the phone's own recordings, whether or not headless Chromium could play them
      window.__cuts = []; const realStop = stopPlayback; stopPlayback = function () { if (G.sources && G.sources.length) window.__cuts.push(Date.now()); return realStop.apply(this, arguments); }; // Ara's playback cut short (a drop, or the officer speaking)
      window.__officer = (text) => {
        send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
        onEvent({ type: "conversation.item.input_audio_transcription.completed", transcript: text });
        setTimeout(() => { if (!G.qCreate && !G.responding && !G.forced && !G.pendingForce) whenIdle("create"); }, 50);
      };
      document.querySelectorAll(".scrim").forEach(s => s.remove());
      startCall(null);
    });
    const busyNow = () => p.evaluate(() => !!(G.responding || G.qCreate || G.qInstr || G.forced || G.pendingForce || playingLeft() > 0 || /^(Connecting|Reconnecting)/.test(G.status) || G.downAt));
    const settle = async () => {
      const t0 = Date.now(); let quietSince = 0;
      while (Date.now() - t0 < TURN_WAIT_MS) {
        await p.waitForTimeout(250);
        if (await busyNow() || Date.now() - lastFrame < 1200) { quietSince = 0; continue; }
        if (!quietSince) quietSince = Date.now(); if (Date.now() - quietSince > 900) return true;
      }
      return false;
    };
    // the officer "speaks": the line's audio goes on the timeline first, then the words reach Ara when it ends
    const speak = async (text) => {
      const pcm = voices[text]; const ms = pcm ? pcm.length / 2 / RATE * 1000 : 1500;
      rec.officer.push({ at: Date.now(), text, pcm: pcm || Buffer.alloc(0) });
      await sleep(ms + 150);
      rec.turns.push({ at: Date.now(), text });
      await p.evaluate((t) => window.__officer(t), text);
    };
    // the drop: a little into the read-back, the phone goes offline and the line closes; DOWN_MS later the network is back
    let dropped = false;
    const dropWatch = async () => {
      while (!dropped) {
        await sleep(200);
        const reading = await p.evaluate(() => !!(G.saveCheck && G.audioOn && G.audioSamples > 24000 * 2.5)).catch(() => false);
        if (!reading) continue;
        dropped = true; rec.dropAt = Date.now(); rec.steps.push({ at: rec.dropAt, text: "network cut (the phone went offline, the line closed)" });
        await ctx.setOffline(true);
        await p.evaluate(() => { try { G.ws && G.ws.close(); } catch (e) {} });
        await sleep(DOWN_MS);
        rec.backAt = Date.now(); rec.steps.push({ at: rec.backAt, text: "network back" });
        await ctx.setOffline(false);
        await p.evaluate(() => window.dispatchEvent(new Event("online")));
      }
    };
    dropWatch();
    await settle();
    const script = LINES.slice(); let saidNo = 0; const t0 = Date.now();
    for (let turn = 0; turn < MAX_TURNS && Date.now() - t0 < MAX_CONV_MS; turn++) {
      const whole = (rec.ara.filter(r => r.text).pop() || { text: "" }).text.trim();
      const last = whole.split(/(?<=[.?!])\s+/).filter(Boolean).pop() || "";
      const saved = (await p.evaluate(() => window.__acts.filter(a => a.role === "saved").map(a => a.text))).join("\n");
      if (SAVED.test(saved)) break;
      let say;
      if (/substantive/i.test(last) && /\?\s*$/.test(last.trim())) say = ANSWERS.subst;
      else if (/\b(save|saving)\b[^.?!]*\?|shall i (save|record)|say yes|is that (right|correct)\?|correct\?|confirm/i.test(last) && !/would you like to (add|fill)/i.test(last)) say = ANSWERS.yes;
      else if (/say neither|neither to move on/i.test(whole) && /\?|neither/i.test(last)) say = ANSWERS.neither;
      else if (/fill it in,? or move on|or move on\?/i.test(last)) { say = ANSWERS.moveOn; saidNo++; }
      else if (/would you like to (add|fill|include)|anything else|want to add|any (other|more) details|optional/i.test(last) && (!script.length || saidNo < 2)) { say = ANSWERS.no; saidNo++; }
      else if (script.length) say = script.shift();
      else if (!/\?/.test(last) || saidNo > 6) break;
      else { say = ANSWERS.all; saidNo++; }
      await speak(say);
      await settle();
      if (dropped && rec.backAt) await settle(); // the sorry line and the re-asked question come a moment after the line is back
    }
    await sleep(1500); // Ara's last words
    rec.endAt = Date.now();
    await p.evaluate(() => { try { endCall("recording done"); } catch (e) {} });
    await p.waitForTimeout(300);
    rec.acts = await p.evaluate(() => window.__acts.filter(a => a.role !== "tap"));
    rec.phone = await p.evaluate(() => window.__phone);
    rec.cuts = await p.evaluate(() => window.__cuts);
  } catch (e) { rec.errors.push("run: " + e.message.slice(0, 300)); }
  await ctx.close();
  return rec;
}

// ---------- the timeline, mixed into one sound file ----------
const FFMPEG = process.env.FFMPEG || (() => { // the system ffmpeg (installed by the workflow) first; Playwright's own build can't read mp3
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return "ffmpeg"; } catch (e) {}
  try { const d = path.join(process.env.HOME || "", ".cache", "ms-playwright"); return fs.readdirSync(d).filter(x => x.startsWith("ffmpeg-")).map(x => path.join(d, x, "ffmpeg-linux")).find(fs.existsSync) || "ffmpeg"; } catch (e) { return "ffmpeg"; } })();
function decodeMp3(file) { return execFileSync(FFMPEG, ["-v", "error", "-i", file, "-f", "s16le", "-ac", "1", "-ar", String(RATE), "-"], { maxBuffer: 64 << 20 }); }
function mix(rec) {
  const t0 = Math.min(...rec.officer.map(o => o.at), ...rec.ara.filter(a => a.at).map(a => a.at)) - 500;
  const end = (rec.endAt || Date.now()) + 500, total = Math.ceil((end - t0) / 1000 * RATE), out = new Float32Array(total);
  const put = (pcm, atMs, gain, untilMs) => {
    let n = pcm.length >> 1; if (untilMs) n = Math.min(n, Math.max(0, Math.floor((untilMs - atMs) / 1000 * RATE)));
    const o = Math.floor((atMs - t0) / 1000 * RATE);
    for (let i = 0; i < n && o + i < total; i++) if (o + i >= 0) out[o + i] += pcm.readInt16LE(i * 2) / 32768 * gain;
  };
  const pieces = [];
  rec.officer.forEach(o => { put(o.pcm, o.at, 0.9); pieces.push({ at: o.at, who: "Officer", text: o.text }); });
  rec.ara.filter(a => a.at && a.chunks.length).forEach(a => {
    const pcm = Buffer.concat(a.chunks), dur = pcm.length / 2 / RATE * 1000;
    const cut = rec.cuts.find(c => c > a.at + 200 && c < a.at + dur) || (rec.dropAt && rec.dropAt > a.at && rec.dropAt < a.at + dur ? rec.dropAt : 0);
    put(pcm, a.at, 1, cut); pieces.push({ at: a.at, who: "Ara", text: a.text.trim() + (cut ? ` [cut off after ${((cut - a.at) / 1000).toFixed(1)} s]` : "") });
  });
  const files = { dropped: "line-dropped.mp3", still: "still-trying.mp3", back: "line-back.mp3" }, dec = {};
  rec.phone.forEach(l => { const f = files[l.kind]; if (!f) return;
    try { dec[f] = dec[f] || decodeMp3(path.join(SOUNDS, f)); put(dec[f], l.at, 1); } catch (e) { console.error("couldn't decode " + f + ": " + String(e.message).split("\n")[0]); }
    pieces.push({ at: l.at, who: "Phone (recording)", text: l.text }); });
  if (rec.dropAt) pieces.push({ at: rec.dropAt, who: "—", text: "the network is cut" });
  if (rec.backAt) pieces.push({ at: rec.backAt, who: "—", text: "the network is back" });
  let peak = 0; for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0.98 ? 0.98 / peak : 1, wav = Buffer.alloc(44 + total * 2);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + total * 2, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(total * 2, 40);
  for (let i = 0; i < total; i++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[i] * g)) * 32767), 44 + i * 2);
  pieces.sort((a, b) => a.at - b.at);
  return { wav, pieces, t0, seconds: total / RATE };
}

if (process.env.SELF_TEST) { // no network: a made-up recording through the mix, to check the sound tools
  fs.mkdirSync(OUT, { recursive: true });
  const tone = (secs, hz) => { const b = Buffer.alloc(secs * RATE * 2); for (let i = 0; i < secs * RATE; i++) b.writeInt16LE(Math.round(Math.sin(i / RATE * hz * 2 * Math.PI) * 8000), i * 2); return b; };
  const t = Date.now() - 40000, rec = { officer: [{ at: t + 1000, text: "Hello", pcm: tone(1.5, 220) }], ara: [{ at: t + 3000, text: "Hi there, reading back", chunks: [tone(6, 440)], status: "completed" }, { at: t + 22000, text: "Sorry, I lost you", chunks: [tone(3, 440)] }],
    phone: [{ at: t + 11000, kind: "dropped", text: "The line dropped." }, { at: t + 18000, kind: "still", text: "Still trying." }, { at: t + 20000, kind: "back", text: "You're back." }], cuts: [], steps: [], dropAt: t + 6000, backAt: t + 19000, endAt: t + 26000, errors: [], acts: [] };
  const m = mix(rec); fs.writeFileSync(path.join(OUT, "self-test.wav"), m.wav);
  execFileSync(FFMPEG, ["-v", "error", "-y", "-i", path.join(OUT, "self-test.wav"), "-codec:a", "libmp3lame", "-q:a", "4", path.join(OUT, "self-test.mp3")]);
  console.log(`self test: ${m.seconds.toFixed(1)} s, ${m.pieces.length} pieces, ffmpeg ${FFMPEG}`); m.pieces.forEach(x => console.log(" ", ((x.at - m.t0) / 1000).toFixed(1), x.who, x.text)); process.exit(0);
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const wavSilent = path.join(OUT, "silence.wav"); silentWav(wavSilent);
  console.log("Recording the officer's lines with the " + OFFICER_VOICE + " voice...");
  const voices = await officerAudio(LINES.concat(Object.values(ANSWERS)), { key: KEY, voice: OFFICER_VOICE });
  voices.log.forEach(l => console.log(`  ${l.seconds}s  "${l.text}"${l.heard && l.heard.replace(/\W/g, "").toLowerCase() !== l.text.replace(/\W/g, "").toLowerCase() ? `  (said: "${l.heard}")` : ""}`));
  await new Promise(r => server.listen(0, r)); const base = `http://localhost:${server.address().port}/`;
  const args = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-audio-capture=" + wavSilent, "--autoplay-policy=no-user-gesture-required"];
  const browser = await chromium.launch(Object.assign({ args }, process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}));
  console.log("Talking to Ara (the line is cut for " + DOWN_MS / 1000 + " s during the read-back)...");
  const rec = await record(browser, base, voices.pcm);
  await browser.close(); server.close();
  fs.writeFileSync(path.join(OUT, "recording.json"), JSON.stringify({ officer: rec.officer.map(o => ({ at: o.at, text: o.text })), ara: rec.ara.map(a => ({ at: a.at, text: a.text, status: a.status, chunks: a.chunks.length })), phone: rec.phone, cuts: rec.cuts, steps: rec.steps, dropAt: rec.dropAt, backAt: rec.backAt, acts: rec.acts, errors: rec.errors }, null, 1)); // kept before the mix, so a sound-tool failure loses nothing
  const m = mix(rec);
  fs.writeFileSync(path.join(OUT, "reconnect-clip.wav"), m.wav);
  execFileSync(FFMPEG, ["-v", "error", "-y", "-i", path.join(OUT, "reconnect-clip.wav"), "-codec:a", "libmp3lame", "-q:a", "4", path.join(OUT, "reconnect-clip.mp3")]);
  const stamp = (at) => { const s = (at - m.t0) / 1000; return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`; };
  const md = `# Reconnect sound clip\n\nRecorded ${rec.started} from a real conversation with Ara (preview build), the officer spoken by Grok's ${OFFICER_VOICE} voice. ` +
    `The network was cut ${rec.dropAt ? stamp(rec.dropAt) : "(not cut)"} into the clip during the read-back and restored ${DOWN_MS / 1000} s later. Length ${m.seconds.toFixed(0)} s.\n\n` +
    `| Time | Who | Said |\n|---|---|---|\n` + m.pieces.map(x => `| ${stamp(x.at)} | ${x.who} | ${x.text.replace(/\|/g, "/").replace(/\n/g, " ")} |`).join("\n") + "\n\n" +
    `## What the app logged\n\n` + (rec.acts || []).filter(a => a.role === "step" || a.role === "saved").map(a => `- ${stamp(a.at)} ${a.text.replace(/\n/g, " ").slice(0, 200)}`).join("\n") + "\n" +
    (rec.errors.length ? `\n## Errors\n\n${rec.errors.map(e => "- " + e).join("\n")}\n` : "");
  fs.writeFileSync(path.join(OUT, "reconnect-clip.md"), md);
  console.log(md);
  const saved = (rec.acts || []).some(a => a.role === "saved" && SAVED.test(a.text));
  console.log(`CLIP ${m.seconds.toFixed(0)} s, drop ${rec.dropAt ? "yes" : "NO"}, back ${rec.backAt ? "yes" : "NO"}, saved ${saved ? "yes" : "NO"}, errors ${rec.errors.length}`);
  if (!rec.dropAt || !saved) process.exitCode = 2;
})().catch(e => { console.error(e); process.exit(1); });
