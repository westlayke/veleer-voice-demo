// Test bot for the Citizens VCRM demo: taps through the app like a person and plays Ara's
// side of a conversation with a pretend voice line (no xAI calls, no cost).
// Run: node tests/bot.js            (tests preview-flow.html and a smoke test of index.html)
//      PAGE=index.html node tests/bot.js   (full run against the live page)
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
  window.WebSocket = class { constructor() { window.__ws = this; this.readyState = 1; setTimeout(() => this.onopen && this.onopen(), 30); } send(d) { window.__sent.push(d); } close() { this.readyState = 3; } };
  const f = window.fetch; window.fetch = (u, o) => /workers\.dev/.test(String(u)) ? Promise.resolve(new Response('{"value":"test-pass"}', { status: 200 })) : f(u, o);
};

const tests = []; const test = (name, fn, opts = {}) => tests.push({ name, fn, opts });
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
let browser, base;

async function fresh(page = PAGE) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ["microphone"] });
  await ctx.addInitScript(FAKES);
  const p = await ctx.newPage(); p.errors = [];
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
async function ara(p, name, args) {
  const n = await p.evaluate(() => __sent.length);
  await p.evaluate(([name, args]) => {
    __ws.onmessage({ data: JSON.stringify({ type: "response.function_call_arguments.done", call_id: "t" + Math.random(), name, arguments: JSON.stringify(args) }) });
    __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) });
  }, [name, args]);
  await p.waitForTimeout(350);
  const out = await p.evaluate((n) => __sent.slice(n).map(s => JSON.parse(s)).filter(e => e.item && e.item.type === "function_call_output").map(e => JSON.parse(e.item.output)), n);
  ok(out.length, `the app gave Ara no answer to ${name}`); return out.at(-1);
}
const titleOf = (p) => p.evaluate(() => { const h = document.querySelector("header.top h1"); return h ? h.textContent : null; });

// ---------- first visit ----------
test("First visit shows the big mic and the short privacy line", async (p) => {
  ok(await p.isVisible("text=Meet your new voice assistant!"), "welcome heading missing");
  ok(await p.isVisible(".wl-mic.big"), "big mic missing");
  ok(await p.isVisible("text=Conversations are saved to improve the demo"), "short privacy line missing");
});
test("Typing a name saves it, shows the full privacy notice, and starts Ara", async (p) => {
  await p.tap("text=I'd rather type my name");
  ok(await p.isVisible("text=What's your first name?"), "name screen heading missing");
  ok(await p.isVisible("text=No audio is kept. Kept for 90 days."), "full privacy notice missing on the name screen");
  await p.tap("text=Start"); ok(await p.isVisible("#wlErr"), "empty name was accepted");
  await p.fill("#wlName", "Sam"); await p.press("#wlName", "Enter"); await p.waitForTimeout(500);
  ok((await state(p)).settings.userName === "Sam", "name not saved");
  ok(await p.isVisible("header >> text=Sam"), "name not in the header");
  ok(await p.evaluate(() => __sent.some(s => s.includes("session.update"))), "Ara's conversation did not start");
});

// ---------- moving around ----------
test("Every tab opens with its title centred", async (p) => {
  await signIn(p);
  for (const [t, title] of [["Contacts", "Contacts"], ["Opportunities", "Opportunities"], ["Tasks", "Tasks"]]) {
    await tab(p, t); ok(await titleOf(p) === title, `${t} tab shows "${await titleOf(p)}"`);
    const c = await p.$eval("header.top h1", h => { const r = h.getBoundingClientRect(); return r.left + r.width / 2; });
    ok(Math.abs(c - 195) < 6, `${title} title is not centred (${Math.round(c)} px)`);
  }
});
test("Contact opens from the list and the back button returns", async (p) => {
  await signIn(p); await tab(p, "Contacts");
  await p.tap("[data-contact] >> nth=0"); await p.waitForTimeout(400);
  ok(await titleOf(p) === "Contact", "contact record did not open");
  const b = await p.$eval(".back", e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, t: e.textContent.trim() }; });
  ok(b.t === "Contacts", `back button says "${b.t}"`); ok(b.w >= 44 && b.h >= 44, `back button tap area is ${Math.round(b.w)}x${Math.round(b.h)}`);
  await p.tap(".back"); await p.waitForTimeout(300); ok(await titleOf(p) === "Contacts", "back did not return to Contacts");
});
test("Opportunity opens from the list and the back button returns", async (p) => {
  await signIn(p); await tab(p, "Opportunities");
  await p.tap("[data-opp] >> nth=0"); await p.waitForTimeout(400);
  ok(await titleOf(p) === "Opportunity", "opportunity record did not open");
  await p.tap(".back"); await p.waitForTimeout(300); ok(await titleOf(p) === "Opportunities", "back did not return to Opportunities");
});
test("No screen scrolls sideways on a phone", async (p) => {
  await signIn(p);
  for (const t of ["Home", "Contacts", "Opportunities", "Tasks"]) {
    await tab(p, t); const w = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(w <= 391, `${t} is ${w} px wide on a 390 px phone`);
  }
});

// ---------- typed forms ----------
test("New contact needs a name and an email or mobile, then saves", async (p) => {
  await signIn(p);
  await tab(p, "Contacts"); const before = (await state(p)).contacts.length;
  await p.tap("[data-form=contact]"); await p.waitForTimeout(300);
  await p.tap("[data-act=save]"); await p.waitForTimeout(200);
  ok(await p.isVisible("#draftErr"), "saved a contact with no name");
  await p.fill("#f_first", "Test"); await p.fill("#f_last", "Bot"); await p.tap("[data-act=save]"); await p.waitForTimeout(200);
  ok((await state(p)).contacts.length === before, "saved a contact with no email or mobile");
  await p.fill("#f_email", "test.bot@example.org"); await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  ok((await state(p)).contacts.length === before + 1, "contact was not saved");
});
test("Adding a task from a contact puts it on the Tasks list", async (p) => {
  await signIn(p); await tab(p, "Contacts"); await p.tap("[data-contact] >> nth=0"); await p.waitForTimeout(400);
  await p.tap("[data-form=task]"); await p.waitForTimeout(300);
  await p.fill("#f_text", "Bot task: send the annual report"); await p.fill("#f_due", "2026-12-01");
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  await tab(p, "Tasks"); ok(await p.isVisible("text=Bot task: send the annual report"), "new task not on the Tasks list");
});
test("Log a meeting will not save without its required fields", async (p) => {
  await signIn(p); await tab(p, "Contacts"); await p.tap("[data-contact] >> nth=0"); await p.waitForTimeout(400);
  const before = (await state(p)).interactions.length;
  await p.tap("[data-form=interaction]"); await p.waitForTimeout(300);
  await p.evaluate(() => { const s = document.getElementById("f_summary"); if (s) s.value = ""; });
  await p.tap("[data-act=save]"); await p.waitForTimeout(300);
  ok((await state(p)).interactions.length === before, "an empty interaction report was saved");
});

// ---------- task statuses ----------
test("Task circle marks Done, Undo brings it back", async (p) => {
  await signIn(p); await tab(p, "Tasks");
  const id = await p.$eval(".trow", r => r.dataset.tid);
  await p.tap(".trow .tcheck"); await p.waitForTimeout(300);
  ok((await state(p)).tasks.find(t => t.id === id).done, "task not marked done");
  ok(await p.isVisible("text=Done >> nth=0"), "no Done section");
  await p.tap("#undoBtn"); await p.waitForTimeout(300);
  ok(!(await state(p)).tasks.find(t => t.id === id).done, "Undo did not bring the task back");
});
test("Status picker sets Waiting with a check-back date", async (p) => {
  await signIn(p); await tab(p, "Tasks");
  const id = await p.$eval(".trow", r => r.dataset.tid);
  await p.tap(".trow .tstat"); await p.waitForTimeout(250);
  await p.tap("[data-ts=waiting]"); await p.fill("#tsUntil", "2026-12-15"); await p.tap("#tsWaitGo"); await p.waitForTimeout(300);
  const t = (await state(p)).tasks.find(t => t.id === id);
  ok(t.status === "waiting" && t.due === "2026-12-15", `task is ${t.status}, due ${t.due}`);
});

// ---------- settings ----------
test("Settings: speaking speed saves, Restart asks first", async (p) => {
  await signIn(p); await p.tap("[data-go=settings] >> nth=0"); await p.waitForTimeout(400);
  ok(await titleOf(p) === "Settings", "Settings did not open");
  ok(await p.isVisible("text=No audio is kept"), "privacy notice missing from Settings");
  await p.selectOption("#speedSel", { index: 3 }); await p.waitForTimeout(200);
  ok((await state(p)).settings.speed > 1, "speed not saved");
  const n = (await state(p)).tasks.length;
  await p.tap("text=Restart the demo >> nth=-1"); await p.waitForTimeout(300);
  ok(await p.isVisible("text=Restart the demo?"), "Restart did not ask first");
  await p.tap("[data-helpx] >> text=Cancel"); await p.waitForTimeout(200);
  ok((await state(p)).tasks.length === n, "Cancel still restarted");
});

// ---------- Ara (voice), simulated ----------
test("Ara: reading open tasks matches the Tasks list", async (p) => {
  await signIn(p);
  const r = await ara(p, "get_my_tasks", { which: "all" });
  const open = (await state(p)).tasks.filter(t => !t.done).length;
  ok(r.ok && r.open_tasks_total === open, `Ara heard ${r.open_tasks_total} open tasks, the app has ${open}`);
  ok(await titleOf(p) === "Tasks", "Tasks screen did not open");
});
test("Ara: changing a task's status asks first, then saves", async (p) => {
  await signIn(p);
  const ask = await ara(p, "set_task_status", { task: "Pennsylvania update", status: "done", confirmed: false });
  ok(ask.ok && /Mark/.test(ask.say), "Ara was not told to ask first");
  ok(!(await state(p)).tasks.find(t => /Pennsylvania/.test(t.text)).done, "saved before the officer said yes");
  const yes = await ara(p, "set_task_status", { task: "Pennsylvania update", status: "done", confirmed: true });
  ok(yes.saved, "not saved after yes");
  ok((await state(p)).tasks.find(t => /Pennsylvania/.test(t.text)).done, "task not done after yes");
  const none = await ara(p, "set_task_status", { task: "zebra crossing", status: "done", confirmed: false });
  ok(!none.ok, "a task that doesn't exist was matched");
});
test("Ara: a task draft opens on screen and nothing saves until Save", async (p) => {
  await signIn(p); const n = (await state(p)).tasks.length;
  await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send Ruth the board deck", due: "2026-11-30" });
  ok(await p.isVisible("[data-act=save]"), "draft sheet did not open");
  ok((await p.inputValue("#f_text")) === "Send Ruth the board deck", "draft text not filled in");
  ok((await state(p)).tasks.length === n, "task saved without tapping Save");
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  ok((await state(p)).tasks.length === n + 1, "task not saved after Save");
});
test("Ara: a new contact gets the other contact detail, a capacity rating, then the optional-fields question", async (p) => {
  await signIn(p);
  let r = await ara(p, "show_contact_draft", { first: "Maya", last: "Lin" });
  ok(r.still_needed && r.still_needed.some(x => /Email or mobile/.test(x)), "Ara was not asked for an email or mobile");
  r = await ara(p, "show_contact_draft", { first: "Maya", last: "Lin", email: "maya@example.org" });
  ok(/mobile number/.test(r.status), "Ara was not asked for the mobile too");
  r = await ara(p, "show_contact_draft", { first: "Maya", last: "Lin", email: "maya@example.org" });
  ok(/capacity rating/.test(r.status) && r.ratings, "Ara was not told to offer a capacity rating");
  r = await ara(p, "show_contact_draft", { first: "Maya", last: "Lin", email: "maya@example.org", capacity: "C" });
  ok(/optional details/.test(r.status) && r.optional_fields && r.optional_fields.length >= 5, "Ara was not told to offer the optional fields");
  r = await ara(p, "show_contact_draft", { first: "Maya", last: "Lin", email: "maya@example.org", capacity: "C", howMet: "Town hall" });
  ok(/tap/.test(r.status) && !/optional details|capacity rating/.test(r.status), "a question repeated");
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  ok((await state(p)).contacts.find(c => c.first === "Maya").capacity === "C", "the rating was not saved with the contact");
});
test("Opportunity: an unrated contact gets the checklist, not the form (voice and touch)", async (p) => {
  await signIn(p);
  await ara(p, "show_contact_draft", { first: "Noor", last: "Haddad", email: "noor@example.org", mobile: "(555) 010-0199" });
  for (let i = 0; i < 3 && !(await p.isVisible("[data-act=save]")); i++) await p.waitForTimeout(200);
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  const r = await ara(p, "show_opportunity_draft", { contact_name: "Noor Haddad" });
  ok(r.ok === false && /only when all of these are true/.test(r.error) && /capacity rating \(not yet/.test(r.error), "Ara was not given the checklist: " + JSON.stringify(r).slice(0, 160));
  ok(!(await p.isVisible("[data-act=save]")), "the opportunity form opened anyway");
  await p.tap("text=Create opportunity"); await p.waitForTimeout(300);
  ok(await p.isVisible("text=isn't ready for an opportunity yet"), "tapping Create opportunity did not show the checklist");
  ok(await p.isVisible(".gate li.no"), "the missing item is not marked");
  ok(await p.isVisible("text=Path to opportunity"), "the record has no Path to opportunity panel");
  await p.tap("#ogRate"); await p.waitForTimeout(200); await p.tap("[data-rt=B]"); await p.waitForTimeout(400);
  ok((await state(p)).contacts.find(c => c.first === "Noor").capacity === "B", "rating not saved");
  ok(await p.isVisible("[data-act=save]"), "the opportunity form did not open after rating");
  await p.tap("[data-act=close]"); await p.waitForTimeout(300);
  ok(await p.isVisible(".oppready"), "the record does not say Ready for opportunity");
  await tab(p, "Contacts");
  ok(await p.isVisible(".row:has-text('Haddad, Noor') .alert.ok"), "the list does not show Ready for opportunity");
});
test("Ara: setting a capacity rating asks first, then saves", async (p) => {
  await signIn(p);
  await ara(p, "show_contact_draft", { first: "Omar", last: "Reyes", email: "omar@example.org", mobile: "(555) 010-0177" });
  for (let i = 0; i < 3 && !(await p.isVisible("[data-act=save]")); i++) await p.waitForTimeout(200);
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  const c0 = (await state(p)).contacts.find(c => c.first === "Omar"), name = "Omar Reyes";
  ok(c0 && !c0.capacity, "test contact not added unrated");
  const ask = await ara(p, "set_capacity_rating", { contact_name: name, rating: "D", confirmed: false });
  ok(/Rate/.test(ask.say) && !(await state(p)).contacts.find(c => c.id === c0.id).capacity, "saved before yes");
  const yes = await ara(p, "set_capacity_rating", { contact_name: name, rating: "D", confirmed: true });
  ok(yes.saved && (await state(p)).contacts.find(c => c.id === c0.id).capacity === "D", "not saved after yes");
});
test("Ara: giving history and screens", async (p) => {
  await signIn(p);
  const g = await ara(p, "get_giving", { contact_name: "Ruth Abernathy" }); ok(g.ok !== false, "giving lookup failed: " + JSON.stringify(g).slice(0, 120));
  ok(await titleOf(p) === "Contact", "Ruth's record did not open");
  await ara(p, "show_screen", { screen: "opportunities" }); ok(await titleOf(p) === "Opportunities", "show_screen did not open Opportunities");
});
test("Ara: talk faster is remembered", async (p) => {
  await signIn(p); const before = (await state(p)).settings.speed || 1;
  await ara(p, "set_speaking_speed", { change: "faster" });
  ok(((await state(p)).settings.speed || 1) > before, "speed did not go up");
});

// ---------- the live page ----------
test("Live page loads as Citizens VCRM and checks version.json", async (p) => {
  ok((await p.title()) === "Citizens VCRM", `live title is "${await p.title()}"`);
  ok(await p.evaluate(() => document.documentElement.outerHTML.includes('VERSION_FILE = "version.json"')), "live page reads the preview version file");
  ok(await p.isVisible("text=Meet your new voice assistant!"), "live welcome missing");
}, { page: "index.html", always: true });

(async () => {
  await new Promise(r => server.listen(0, r)); base = `http://localhost:${server.address().port}/`;
  const args = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"]; // a silent pretend microphone
  browser = await chromium.launch(Object.assign({ args }, process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}));
  fs.mkdirSync(OUT, { recursive: true });
  const run = tests.filter(t => PAGE === "preview-flow.html" || !t.opts.page || t.opts.always);
  let failed = 0; const lines = [];
  for (const t of run) {
    const p = await fresh(t.opts.page || PAGE); const t0 = Date.now();
    try { await t.fn(p); ok(!p.errors.length, "page error: " + p.errors[0]); lines.push(`✓ ${t.name}`); }
    catch (e) { failed++; const shot = path.join(OUT, t.name.replace(/[^\w]+/g, "-").slice(0, 60) + ".png"); await p.screenshot({ path: shot }).catch(() => {}); lines.push(`✗ ${t.name}\n    ${e.message.split("\n")[0]}\n    screenshot: tests/results/${path.basename(shot)}`); }
    console.log(lines.at(-1), `(${Date.now() - t0} ms)`);
    await p.context().close();
  }
  const summary = `${run.length - failed} of ${run.length} checks passed on ${PAGE}` + (failed ? `, ${failed} failed` : "");
  console.log("\n" + summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Test bot: ${summary}\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n`);
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
})();
