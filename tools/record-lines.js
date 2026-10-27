// Records the phone's own spoken lines (tools/ara-lines.json) in Ara's voice with xAI text-to-speech, into preview/sounds/.
// Run by the "Record Ara's lines" workflow with the xAI key in XAI_KEY (never from a phone, never with the key in the repo).
// Usage: XAI_KEY=... node tools/record-lines.js [file ...]   (no files = every line)
const fs = require("fs"), path = require("path");
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "ara-lines.json"), "utf8"));
const only = process.argv.slice(2), out = path.join(__dirname, "..", "preview", "sounds");
(async () => {
  const key = process.env.XAI_KEY; if (!key) { console.error("XAI_KEY is not set"); process.exit(1); }
  for (const l of cfg.lines) { if (only.length && !only.includes(l.file)) continue;
    const r = await fetch("https://api.x.ai/v1/tts", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ text: l.text, voice_id: cfg.voice, language: "en", output_format: { codec: "mp3", sample_rate: 24000, bit_rate: 64000 } }) });
    if (!r.ok) { console.error(`${l.file}: ${r.status} ${(await r.text()).slice(0, 300)}`); process.exit(1); }
    const b = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(path.join(out, l.file), b);
    console.log(`${l.file}: ${b.length} bytes, "${l.text}"`); }
})();
