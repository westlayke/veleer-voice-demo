// Call-start harness, step 1: Ara's real session configuration, taken from the app itself (tests/call-start/config.json).
// The app is opened in a headless browser with a stand-in voice line, the officer signs in as Dana, and the exact session.update
// messages the app sends when a line opens (sessUpdate(sessionCfg()) + sendExtras()) are written out with the greeting it would
// script. run.js then sends the same bytes to xAI, so what is timed is what the phone sends. Run: node tests/call-start/dump.js
const fs = require("fs"), path = require("path"), http = require("http");
let chromium; try { ({ chromium } = require("playwright")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright")); }
const ROOT = path.resolve(__dirname, "../.."), OUT = path.join(__dirname, "config.json"), PAGE = process.env.PAGE || "preview-flow.html";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".css": "text/css" };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});
const FAKES = () => { // no voice line and no key holder are reached
  window.WebSocket = class { constructor() { this.readyState = 1; setTimeout(() => this.onopen && this.onopen(), 30); } send() {} close() { this.readyState = 3; } };
  const f = window.fetch; window.fetch = (u, o) => /workers\.dev/.test(String(u)) ? Promise.resolve(new Response(/\/log/.test(String(u)) ? '{"logging":true}' : '{"value":"test-pass"}', { status: 200 })) : f(u, o);
};
(async () => {
  await new Promise(r => server.listen(0, r)); const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, permissions: ["microphone"] });
  await ctx.addInitScript(FAKES);
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", e => errors.push(e.message));
  await p.goto(base + PAGE); await p.waitForTimeout(700);
  await p.tap("text=I'd rather type my name"); await p.fill("#wlName", "Dana"); await p.tap("text=Start"); await p.waitForTimeout(500);
  const cfg = await p.evaluate(() => {
    const sent = []; G.ws = { readyState: 1, send: (s) => sent.push(JSON.parse(s)) }; // what send() writes to the line
    sessUpdate(sessionCfg()); sendExtras(); G.ws = null;
    return { page: location.pathname.replace(/^\//, ""), officer: OFFICER, updates: sent, greeting: helloLine(OFFICER), version: (document.querySelector("#verLine") || {}).textContent || "" };
  });
  await browser.close(); server.close();
  if (errors.length) { console.error("page errors: " + errors.join(" | ")); process.exit(1); }
  cfg.bytes = cfg.updates.map(u => JSON.stringify(u).length);
  fs.writeFileSync(OUT, JSON.stringify(cfg, null, 1));
  console.log(`config.json: ${cfg.updates.length} session updates (${cfg.bytes.join(" + ")} = ${cfg.bytes.reduce((a, b) => a + b, 0)} bytes), ${(cfg.updates[0].session.tools || []).length} tools, instructions ${(cfg.updates[0].session.instructions || "").length} chars, greeting "${cfg.greeting.slice(0, 60)}…"`);
})().catch(e => { console.error(e); process.exit(1); });
