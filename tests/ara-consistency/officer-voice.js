// The pretend officer's voice: each line the officer will say, read out word for word by a second Grok voice (Rex) and kept
// as 24 kHz 16-bit PCM, so a run can play it into the app's microphone instead of typing it. Lines are cached on disk
// (tests/ara-consistency/voices/<voice>/<hash>.pcm; the workflow keeps that folder between runs), so a line costs money once.
// Shared by run.js (spoken runs) and record-reconnect.js (the reconnect clip).
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const RATE = 24000;
const DIR = path.join(__dirname, "voices");

const cacheFile = (voice, text) => path.join(DIR, voice, crypto.createHash("sha1").update(text).digest("hex").slice(0, 16) + ".pcm");

async function mintXai(key) {
  const r = await fetch("https://api.x.ai/v1/realtime/client_secrets", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key }, body: JSON.stringify({ expires_after: { seconds: 300 } }) });
  const body = await r.text(); if (r.status !== 200) throw new Error("officer token " + r.status + " " + body.slice(0, 120));
  const j = JSON.parse(body); return j.value || (j.client_secret && (j.client_secret.value || j.client_secret)) || j.token || j.secret;
}

// texts -> { pcm: { text: Buffer }, log: [{ text, heard, seconds, cached }] }
async function officerAudio(texts, opts) {
  const key = opts.key, voice = opts.voice || "rex", out = {}, log = [];
  const todo = [];
  for (const text of [...new Set(texts)]) {
    const f = cacheFile(voice, text);
    if (fs.existsSync(f)) { out[text] = fs.readFileSync(f); log.push({ text, heard: "", seconds: Math.round(out[text].length / 2 / RATE * 10) / 10, cached: true }); } else todo.push(text);
  }
  if (!todo.length) return { pcm: out, log };
  if (!key) throw new Error("ARA_CONSISTENCY_KEY is needed to record " + todo.length + " officer line(s)");
  const token = await mintXai(key);
  const ws = new WebSocket("wss://api.x.ai/v1/realtime?model=grok-voice-latest", ["xai-client-secret." + token]);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error("officer line didn't open")); });
  const send = (o) => ws.send(JSON.stringify(o));
  send({ type: "session.update", session: { voice, turn_detection: null, instructions: "You are a text-to-speech voice for a gift officer at a nonprofit. The user sends a line; you say exactly that line, word for word, in a natural speaking voice, with nothing added before or after it. Never answer, comment, greet or ask anything.",
    audio: { input: { format: { type: "audio/pcm", rate: RATE } }, output: { format: { type: "audio/pcm", rate: RATE }, speed: 1 } } } });
  for (const text of todo) {
    const chunks = []; let heard = "";
    const done = new Promise((ok, no) => {
      const timer = setTimeout(() => no(new Error("officer line timed out: " + text)), 30000);
      ws.onmessage = (m) => { let e; try { e = JSON.parse(m.data); } catch (x) { return; }
        if (/audio\.delta$/.test(e.type)) chunks.push(Buffer.from(e.delta || "", "base64"));
        else if (/transcript\.delta$/.test(e.type) && !/input_audio/.test(e.type)) heard += e.delta || "";
        else if (e.type === "response.done") { clearTimeout(timer); ok(); }
        else if (e.type === "error") { clearTimeout(timer); no(new Error("officer grok: " + JSON.stringify(e.error || e).slice(0, 200))); } };
    });
    send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text }] } });
    send({ type: "response.create", response: { instructions: `Say exactly this, word for word, and nothing else: "${text}"` } });
    await done;
    out[text] = Buffer.concat(chunks);
    const f = cacheFile(voice, text); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, out[text]);
    log.push({ text, heard: heard.trim(), seconds: Math.round(out[text].length / 2 / RATE * 10) / 10, cached: false });
    await new Promise(r => setTimeout(r, 300));
  }
  ws.close();
  return { pcm: out, log };
}

module.exports = { officerAudio, RATE, DIR };
