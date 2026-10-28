// Builds the listen-to page for one spoken consistency run: clips/spoken/<run id>/index.html, with every conversation's mp3 on a
// tap-to-play control and its transcript beside it (the .md written by the run). Used by the "Publish spoken clips" workflow.
//   node tools/clips-page.js clips/spoken/<run id> "<title>"
const fs = require("fs"), path = require("path");
const dir = process.argv[2], title = process.argv[3] || "Spoken test clips";
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const files = fs.readdirSync(dir).filter(f => /\.(mp3|wav)$/.test(f)).sort();
const engineName = { grok: "Grok (xAI)", openai: "OpenAI gpt-realtime", gemini: "Gemini Live" };
const byEngine = {};
files.forEach(f => { const m = f.match(/^(\w+)-(.+)-(\d+)-(quiet|car-noise)\.(mp3|wav)$/); if (!m) return; (byEngine[m[1]] = byEngine[m[1]] || []).push({ file: f, flow: m[2], n: m[3], cond: m[4] }); });
const section = (eng, list) => `<h2>${esc(engineName[eng] || eng)}</h2>` + list.map(c => {
  const md = path.join(dir, c.file.replace(/\.(mp3|wav)$/, ".md"));
  let rows = "", saved = "", secs = "";
  if (fs.existsSync(md)) { const t = fs.readFileSync(md, "utf8"); const s = t.match(/Saved: ([^\n]*)/); if (s) saved = s[1]; const d = t.match(/; (\d+) s\./); if (d) secs = d[1] + " s";
    rows = t.split("\n").filter(l => /^\| \d/.test(l)).map(l => { const [, time, who, said] = l.split("|").map(x => x.trim()); return `<tr class="${who === "Ara" ? "ara" : "off"}"><td>${esc(time)}</td><td>${esc(who)}</td><td>${esc(said)}</td></tr>`; }).join(""); }
  return `<details class="clip"><summary><b>${esc(c.flow)}</b> <span class="meta">${esc(c.cond.replace("-", " "))}${secs ? ", " + secs : ""}</span><br><audio controls preload="none" src="${esc(c.file)}"></audio></summary>
<p class="meta">Saved: ${esc(saved || "nothing")}</p><table>${rows}</table></details>`; }).join("\n");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:16px/1.45 system-ui,sans-serif;margin:0;padding:16px;max-width:720px;margin:auto;background:#f4f6f9;color:#1d232b}h1{font-size:22px;margin:8px 0}h2{font-size:18px;margin:24px 0 8px}
.clip{background:#fff;border:1px solid #e3e7ec;border-radius:10px;padding:10px 12px;margin:10px 0}summary{cursor:pointer}audio{width:100%;margin-top:6px}.meta{color:#5b6470;font-size:14px}
table{border-collapse:collapse;width:100%;font-size:14px}td{border-top:1px solid #eef1f5;padding:4px 6px;vertical-align:top}td:first-child{white-space:nowrap;color:#5b6470}tr.ara td:nth-child(2){color:#2f7d4f;font-weight:600}tr.off td:nth-child(2){color:#1f5fbf;font-weight:600}</style></head>
<body><h1>${esc(title)}</h1><p class="meta">Each clip is one test conversation end to end: the pretend officer (a second Grok voice), Ara's replies as the app received them, and the car noise when it was on. Tap a title to see the transcript. Names and details are made up.</p>
${Object.entries(byEngine).map(([e, l]) => section(e, l)).join("\n")}
</body></html>`;
fs.writeFileSync(path.join(dir, "index.html"), html);
console.log(`${files.length} clips on ${path.join(dir, "index.html")}`);
