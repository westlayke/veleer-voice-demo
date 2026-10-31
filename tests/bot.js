// Test bot for the Citizens VCRM demo: taps through the app like a person and plays Ara's
// side of a conversation with a pretend voice line (no xAI calls, no cost).
// Run: node tests/bot.js            (tests preview-flow.html and a smoke test of index.html; JOBS=1 runs one check at a time; a failed check gets one more try on its own)
//      JOBS=4 node tests/bot.js     (4 checks side by side, the default; the whole suite takes about 3 minutes on a 4-core machine)
//      SHARD=2/3 node tests/bot.js  (only every third check, starting at the second: the GitHub workflow runs the three shards on three machines at once)
//      ONLY=substring[,substring] node tests/bot.js   (only the checks whose name contains one of them: what a preview build runs; the whole suite runs before a go-live)
//      PAGE=index.html node tests/bot.js   (full run against the live page)
// The checks themselves are in tests/checks/, one file per area; this file is the runner and its helpers.
const http = require("http"), fs = require("fs"), path = require("path");
let chromium; try { ({ chromium } = require("playwright")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright")); }

const ROOT = path.resolve(__dirname, ".."), OUT = path.join(__dirname, "results");
const PAGE = process.env.PAGE || "preview-flow.html";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".css": "text/css" };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});

// stand-ins for the voice line and the Cloudflare key holder
const FAKES = () => {
  window.__sent = [];
  window.WebSocket = class { constructor(u, protos) { window.__wsUrls = (window.__wsUrls || []).concat(String(u)); window.__wsProtos = protos || []; window.__ws = this; this.readyState = 1; setTimeout(() => this.onopen && this.onopen(), 30); } send(d) { window.__sent.push(d); try { const e = JSON.parse(d); if (e.type === "session.update" && !window.__noReceipt) setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify({ type: "session.updated" }) }), 40); /* the service confirms every update, in order (the state receipt) */ if (e.item && e.item.type === "force_message" && !window.__noAutoForce) { // xAI plays a scripted line as a response of its own
          setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify({ type: "response.created" }) }), 20); setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }), 60); } } catch (x) {} } close() { this.readyState = 3; } };
  window.__logs = [];
  const f = window.fetch; window.fetch = (u, o) => { if (/workers\.dev\/log/.test(String(u))) { if (o && o.body) window.__logs.push(JSON.parse(o.body)); return Promise.resolve(new Response('{"logging":true}', { status: 200 })); }
    return /workers\.dev/.test(String(u)) ? Promise.resolve(new Response('{"value":"test-pass"}', { status: 200 })) : f(u, o); };
};

const tests = []; const test = (name, fn, opts = {}) => tests.push({ name, fn, opts });
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
let browser, base;

async function fresh(page = PAGE) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ["microphone"] });
  await ctx.addInitScript(FAKES);
  const p = await ctx.newPage(); p.errors = [];
  // shared by the checks: the activity log so far (rows already sent and rows still queued, oldest first) and a burst of voice-service events
  p.log = () => p.evaluate(() => __logs.flatMap(l => l.events || [l]).concat(ACT.q).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)).map(a => a.text).join(" | "));
  p.fire = (evs) => p.evaluate((evs) => evs.forEach(e => __ws.onmessage({ data: JSON.stringify(e) })), evs);
  p.on("pageerror", e => p.errors.push(e.message));
  p.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) p.errors.push(m.text()); });
  await p.goto(base + page); await p.waitForTimeout(700);
  return p;
}
async function signIn(p, name = "Sam") {
  await p.tap("text=I'd rather type my name"); await p.fill("#wlName", name); await p.tap("text=Start"); await p.waitForTimeout(500);
}
const state = (p) => p.evaluate(() => window.__demo.state);
async function tab(p, name) { await p.tap(`nav >> text=${name}`); await p.waitForTimeout(350); }
// Ara asks the app to do something: send a tool call, end the turn, read the app's answer
async function ara(p, name, args, wait = 350) {
  const n = await p.evaluate(() => __sent.length);
  await p.evaluate(([name, args]) => {
    __ws.onmessage({ data: JSON.stringify({ type: "response.function_call_arguments.done", call_id: "t" + Math.random(), name, arguments: JSON.stringify(args) }) });
    __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) });
  }, [name, args]);
  await p.waitForTimeout(wait);
  // the app's answer: the tool result (data), plus what followed it: guidance riding with the reply request (status/say) or a scripted line (ask_exactly/read_back)
  const out = await p.evaluate((n) => { const xs = __sent.slice(n).map(s => JSON.parse(s)), out = [];
    xs.forEach((e, i) => { if (!(e.item && e.item.type === "function_call_output")) return; const r = JSON.parse(e.item.output);
      for (let j = i + 1; j < xs.length; j++) { const x = xs[j]; if (x.item && x.item.type === "function_call_output") break;
        if (x.type === "response.create" && x.response && x.response.instructions) { const g = x.response.instructions.replace(/^App guidance for this reply only \(never read it aloud\): /, ""); r.status = r.say = r.instructions = g; }
        if (x.item && x.item.type === "force_message") { const t = x.item.content[0].text; if (r.read_back === undefined) r.ask_exactly = t; } }
      out.push(r); });
    return out; }, n);
  ok(out.length, `the app gave Ara no answer to ${name}`); return out.at(-1);
}
// the officer says something (as Grok's transcript of their speech)
const said = (p, text) => p.evaluate((text) => __ws.onmessage({ data: JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript: text }) }), text);
const titleOf = (p) => p.evaluate(() => { const h = document.querySelector("header.top h1"); return h ? h.textContent : null; });

// ---------- the checks, by area (tests/checks/*.js, run in file order) ----------
for (const f of fs.readdirSync(path.join(__dirname, "checks")).filter(f => f.endsWith(".js")).sort())
  require(path.join(__dirname, "checks", f))({ test, ok, fresh, signIn, state, tab, ara, said, titleOf, PAGE, fs, path });

(async () => {
  await new Promise(r => server.listen(0, r)); base = `http://localhost:${server.address().port}/`;
  const args = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"]; // a silent pretend microphone
  browser = await chromium.launch(Object.assign({ args }, process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}));
  fs.mkdirSync(OUT, { recursive: true });
  const shard = /^(\d+)\/(\d+)$/.exec(process.env.SHARD || ""), part = shard ? Number(shard[1]) : 1, parts = shard ? Number(shard[2]) : 1;
  if (shard && !(part >= 1 && part <= parts)) { console.log("SHARD must be k/n with 1 <= k <= n"); process.exit(2); }
  const run = tests.filter(t => PAGE === "preview-flow.html" || !t.opts.page || t.opts.always).filter(t => !process.env.ONLY || process.env.ONLY.split(",").some(w => t.name.includes(w.trim()))).filter((t, i) => i % parts === part - 1);
  // checks run side by side (JOBS at a time, default 6) in separate browser windows; results print in the usual order
  let failed = 0; const lines = new Array(run.length); let next = 0, printed = 0; const done = new Array(run.length);
  const flush = () => { while (printed < run.length && done[printed]) console.log(done[printed++]); };
  const fails = [];
  async function one(i, again) {
    const t = run[i]; if (process.env.TRACE) console.error("start: " + t.name); const p = await fresh(t.opts.page || PAGE), t0 = Date.now();
    try { await t.fn(p); ok(!p.errors.length, "page error: " + p.errors[0]); lines[i] = `✓ ${t.name}${again ? " (passed on its second try, alone)" : ""}`; }
    catch (e) { if (!again) { fails.push(i); await p.context().close(); return; } failed++; const shot = path.join(OUT, t.name.replace(/[^\w]+/g, "-").slice(0, 60) + ".png"); await p.screenshot({ path: shot }).catch(() => {}); lines[i] = `✗ ${t.name}\n    ${e.message.split("\n")[0]}\n    screenshot: tests/results/${path.basename(shot)}`; }
    done[i] = `${lines[i]} (${Date.now() - t0} ms)`; if (!again) flush();
    await p.context().close();
  }
  // longest checks first (times from the last run on this machine), so no window is left with a long check at the end
  const DUR = path.join(OUT, "durations.json"); let dur = {}; try { dur = JSON.parse(fs.readFileSync(DUR, "utf8")); } catch (e) {}
  const names = new Set(tests.map(t => t.name)); Object.keys(dur).forEach(k => { if (!names.has(k)) delete dur[k]; }); // times of checks that no longer exist are dropped
  const order = run.map((t, i) => i).sort((a, b) => (dur[run[b].name] || 5000) - (dur[run[a].name] || 5000));
  // 4 at a time on a 4-core machine: the whole suite in about 3 minutes with no second tries (Oct 28); 6 is a little faster but
  // now and then a timing-sensitive check fails under the load. A check that fails is run again on its own afterwards, and only a second failure counts
  const jobs = Math.max(1, Number(process.env.JOBS) || 4), took = {};
  await Promise.all(Array.from({ length: Math.min(jobs, run.length) }, async () => { while (next < run.length) { const i = order[next++], t0 = Date.now(); await one(i); took[run[i].name] = Date.now() - t0; } }));
  try { fs.writeFileSync(DUR, JSON.stringify(Object.assign(dur, took))); } catch (e) {}
  for (const i of fails.sort((a, b) => a - b)) await one(i, true);
  for (let i = printed; i < run.length; i++) if (done[i]) console.log(done[i]);
  const summary = `${run.length - failed} of ${run.length} checks passed on ${PAGE}${shard ? ` (shard ${part} of ${parts})` : ""}` + (failed ? `, ${failed} failed` : "") + (fails.length ? ` (${fails.length} needed a second try)` : "");
  console.log("\n" + summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Test bot: ${summary}\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n`);
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})();
