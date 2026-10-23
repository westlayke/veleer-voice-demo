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
// the officer says something (as Grok's transcript of their speech)
const said = (p, text) => p.evaluate((text) => __ws.onmessage({ data: JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript: text }) }), text);
const titleOf = (p) => p.evaluate(() => { const h = document.querySelector("header.top h1"); return h ? h.textContent : null; });

// ---------- first visit ----------
test("First visit shows the big mic and the short privacy line", async (p) => {
  ok(await p.isVisible("text=Meet your new voice assistant!"), "welcome heading missing");
  ok(await p.isVisible(".wl-mic.big"), "big mic missing");
  ok(await p.isVisible("text=Conversations and taps are saved to improve the demo"), "short privacy line missing");
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
test("The + button on every screen opens one menu to log, add or record anything", async (p) => {
  await signIn(p);
  for (const t of ["Home", "Contacts", "Opportunities", "Tasks"]) { if (t !== "Home") await tab(p, t); ok(await p.locator("header.top .addbtn").isVisible(), `no + button on ${t}`); }
  // a small phone: the initials sit on the left and the title clears the + button
  await p.setViewportSize({ width: 375, height: 700 }); await tab(p, "Opportunities");
  const [h1, add, chip] = await Promise.all(["header.top h1", "header.top .addbtn", "header.top .chip"].map(s => p.locator(s).boundingBox()));
  ok(chip && chip.x < h1.x && h1.x + h1.width + 8 < add.x, `the Opportunities title runs into the + button: ${JSON.stringify({ h1, add, chip })}`);
  await p.setViewportSize({ width: 390, height: 844 }); await tab(p, "Home");
  // from a list: pick the contact, then the form opens for them
  await p.tap("header.top .addbtn"); await p.waitForTimeout(250);
  for (const label of ["Log a meeting or call", "Schedule a meeting", "Add a task", "Add a contact", "Plan an ask", "Record a payment"]) ok(await p.locator(`[data-qa] >> text=${label}`).count(), "menu is missing " + label);
  // Record the ask lists Ask Planning first and says why each opportunity is there
  await p.tap("[data-qa=ask]"); await p.waitForTimeout(250);
  const askList = await p.evaluate(() => [...document.querySelectorAll("[data-pick] small")].map(s => s.textContent));
  ok(/^Ask Planning · planned for/.test(askList[0]) && askList.includes("Ask Made · record the answer") && askList.includes("Cultivation · unplanned ask"), "Record the ask list doesn't say why: " + askList.join(" | "));
  await p.evaluate(() => document.getElementById("modal").innerHTML = ""); await p.tap("header.top .addbtn"); await p.waitForTimeout(250);
  await p.tap("[data-qa=task]"); await p.waitForTimeout(250);
  ok(await p.locator("#pkTitle").isVisible(), "Add a task did not ask who it is for");
  await p.tap("[data-pick] >> text=Ken Ito"); await p.waitForTimeout(300);
  ok(await p.evaluate(() => /New task/.test(document.getElementById("overlay").textContent) && /Ken Ito/.test(document.getElementById("overlay").textContent)), "the task form did not open for Ken Ito");
  await p.tap("[data-act=close]"); await p.waitForTimeout(200);
  // on a contact: the menu is for that contact, with no picker
  await tab(p, "Contacts"); await p.tap("text=Abernathy, Ruth"); await p.waitForTimeout(300);
  await p.tap("header.top .addbtn"); await p.waitForTimeout(250);
  ok(/For Ruth Abernathy/.test(await p.locator(".qa-for").textContent()), "the menu on Ruth's record is not for Ruth");
  await p.tap("[data-qa=interaction]"); await p.waitForTimeout(300);
  ok(await p.evaluate(() => /Interaction report/.test(document.getElementById("overlay").textContent) && /Ruth Abernathy/.test(document.getElementById("overlay").textContent)), "Log a meeting did not open for Ruth");
  await p.tap("[data-act=close]"); await p.waitForTimeout(200);
  await p.tap("header.top .addbtn"); await p.waitForTimeout(250); await p.tap("[data-qaany]"); await p.waitForTimeout(200);
  ok(!(await p.locator(".qa-for").count()), "Someone else did not clear the contact");
  await p.tap("[data-qa=contact]"); await p.waitForTimeout(300);
  ok(await p.evaluate(() => /New contact/.test(document.getElementById("overlay").textContent)), "Add a contact did not open the New contact form");
});
test("Ending a conversation with a form open brings back the voice button, keeping what was filled in", async (p) => {
  await signIn(p); await tab(p, "Contacts"); await p.tap("text=Ito, Ken"); await p.waitForTimeout(300);
  await p.tap("header.top .addbtn"); await p.waitForTimeout(250); await p.tap("[data-qa=meeting]"); await p.waitForTimeout(300);
  await p.tap("[data-act=voicefill]"); await p.waitForTimeout(600);
  ok(!(await p.locator(".vfill").count()), "the voice button stayed during the conversation");
  await ara(p, "show_meeting_draft", { contact_name: "Ken Ito", title: "Coffee with Ken" });
  await p.tap(".cb-end"); await p.waitForTimeout(400);
  ok(await p.locator(".vfill").isVisible() && /Continue by voice/.test(await p.locator(".vfill").textContent()), "no Continue by voice button after End");
  ok(await p.inputValue("#f_title") === "Coffee with Ken", "the title filled in by voice was lost");
  await p.tap(".vfill"); await p.waitForTimeout(600);
  const start = await p.evaluate(() => __sent.map(s => JSON.parse(s)).filter(e => e.type === "conversation.item.create").map(e => JSON.stringify(e)).join(" "));
  ok(/Coffee with Ken/.test(start), "the new conversation was not told what is already on the form");
});
test("Every form shows all its fields, with no More details fold", async (p) => {
  await signIn(p); await tab(p, "Contacts"); await p.tap("text=Ito, Ken"); await p.waitForTimeout(300);
  for (const a of ["interaction", "meeting", "task", "pledge"]) {
    await p.tap("header.top .addbtn"); await p.waitForTimeout(250); await p.tap(`[data-qa=${a}]`); await p.waitForTimeout(300);
    const r = await p.evaluate(() => ({ fold: !!document.querySelector("#overlay details"), title: document.querySelector("#overlay h3") && document.querySelector("#overlay h3").textContent }));
    ok(r.title && !r.fold, `${a}: ${r.title ? "fields are still folded under More details" : "the form did not open"}`);
    await p.tap("[data-act=close]"); await p.waitForTimeout(200);
  }
});
test("An interaction report shows the contact's saved capacity rating", async (p) => {
  await signIn(p); await tab(p, "Contacts"); await p.tap("text=Add a contact"); await p.waitForTimeout(300);
  await p.fill("#f_first", "Lee"); await p.fill("#f_last", "Park"); await p.fill("#f_email", "lee.park@example.org");
  await p.selectOption("#f_capacity", "B"); await p.tap("text=Save contact"); await p.waitForTimeout(400);
  await p.tap("header.top .addbtn"); await p.waitForTimeout(250); await p.tap("[data-qa=interaction]"); await p.waitForTimeout(300);
  ok(await p.inputValue("#f_capacity") === "B", "the interaction report shows no capacity rating for a contact rated B");
  await p.fill("#f_summary", "Coffee to talk about the year"); await p.selectOption("#f_meetingType", "Phone call");
  const count = () => p.evaluate(() => ({ rated: (JSON.stringify(window.__demo.state).match(/Capacity rated/g) || []).length, reports: window.__demo.state.interactions.length }));
  const before = await count(); await p.tap("[data-act=save]"); await p.waitForTimeout(400); const after = await count();
  ok(after.reports === before.reports + 1, "the interaction report did not save");
  ok(after.rated === before.rated, "saving the report logged the unchanged rating again");
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
test("Ara: a new contact gets the other contact detail, then the optional fields with the capacity rating", async (p) => {
  await signIn(p);
  let r = await ara(p, "show_contact_draft", { first: "Maya", last: "Lin" });
  ok(r.still_needed && r.still_needed.some(x => /Email or mobile/.test(x)), "Ara was not asked for an email or mobile");
  r = await ara(p, "show_contact_draft", { first: "Maya", last: "Lin", email: "maya@example.org" });
  ok(/mobile number/.test(r.status), "Ara was not asked for the mobile too");
  r = await ara(p, "show_contact_draft", { first: "Maya", last: "Lin", email: "maya@example.org" });
  ok(/optional details/.test(r.status) && r.optional_fields && r.optional_fields.length >= 6 && /Capacity rating/.test(r.optional_fields[0]) && /opportunity/.test(r.status), "Ara was not told to offer the optional fields with the capacity rating first");
  ok((await p.textContent("#f_capacity option:checked")).trim() === "No rating set", "the rating does not default to No rating set");
  await said(p, "C.");
  r = await ara(p, "show_contact_draft", { first: "Maya", last: "Lin", email: "maya@example.org", capacity: "C", howMet: "Town hall" });
  ok(/tap/.test(r.status) && !/optional details/.test(r.status), "a question repeated");
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  ok((await state(p)).contacts.find(c => c.first === "Maya").capacity === "C", "the rating was not saved with the contact");
});
test("New contact and new opportunity forms show every field, and Ara offers the opportunity's optional fields", async (p) => {
  await signIn(p);
  await ara(p, "show_contact_draft", { first: "Ana", last: "Ruiz" });
  ok(!(await p.isVisible("details.more")) && (await p.isVisible("#f_howMet")), "the new contact form still hides fields under More details");
  await p.tap("[data-act=close]"); await p.waitForTimeout(300);
  await ara(p, "show_contact_draft", { first: "Ana", last: "Ruiz", email: "ana@example.org", mobile: "(555) 010-0142" });
  await said(p, "Rate her B."); await ara(p, "show_contact_draft", { first: "Ana", last: "Ruiz", email: "ana@example.org", mobile: "(555) 010-0142", capacity: "B" });
  for (let i = 0; i < 3 && !(await p.isVisible("[data-act=save]")); i++) await p.waitForTimeout(200);
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  const ready = "Ana Ruiz";
  let r = await ara(p, "show_opportunity_draft", { contact_name: ready });
  ok(!(await p.isVisible("details.more")) && (await p.isVisible("#f_potential")) && (await p.isVisible("#f_notes")), "the new opportunity form still hides fields under More details");
  ok(/enough information yet/.test(r.status) && /entity of interest/.test(r.status) && /potential amount/.test(r.status), "Ara was not told to offer the opportunity's optional fields");
  r = await ara(p, "show_opportunity_draft", { contact_name: ready, potential: 50000 });
  ok(/tap/.test(r.status) && !/enough information yet/.test(r.status), "the optional-fields question repeated");
});
test("A save is acknowledged by Ara and listed for her, and a pledge payment sets off confetti and balloons", async (p) => {
  await signIn(p);
  const who = await p.evaluate(() => { const S = window.__demo.state, o = S.opps.find(o => o.stage !== "Closed"); o.stage = "Commitment"; o.pledge = { amount: 1000, fund: "Citizens Alliance C3", status: "Current", confirmedBy: "Email", payments: [] }; const c = S.contacts.find(c => c.id === o.contactId); return c.first + " " + c.last; });
  await ara(p, "show_payment_draft", { contact_name: who, amount: 1000, date: "2026-10-22", method: "Check" });
  const n = await p.evaluate(() => __sent.length);
  await p.tap("[data-act=save]"); await p.waitForTimeout(500);
  ok(await p.isVisible(".party .bl"), "no balloons after recording the payment");
  ok(await p.isVisible(".party .cf"), "no confetti after recording the payment");
  const sent = await p.evaluate((n) => __sent.slice(n).join(" "), n);
  ok(/out loud that you saw the save/.test(sent) && /Payment recorded/.test(sent), "Ara was not told to acknowledge the save");
  ok(/Saved so far in this conversation: Payment recorded/.test(sent), "the save is not listed in Ara's instructions");
  await p.waitForTimeout(6800);
  ok(!(await p.isVisible(".party")), "the celebration did not clear away");
});
test("Ara has a friendly personality and congratulates the officer when a pledge is recorded", async (p) => {
  await signIn(p);
  const who = await p.evaluate(() => { const S = window.__demo.state, o = S.opps.find(o => o.stage === "Ask Made") || S.opps.find(o => o.stage !== "Closed"); o.stage = "Ask Made"; const c = S.contacts.find(c => c.id === o.contactId); return c.first + " " + c.last; });
  const r = await ara(p, "show_pledge_draft", { contact_name: who, amount: 5000, fund: "Citizens Alliance C3", confirmedBy: "Email", confirmedOn: "2026-10-22", firstDue: "2026-11-10" });
  ok(r.ok !== false, "the pledge draft did not open: " + JSON.stringify(r).slice(0, 160));
  const n = await p.evaluate(() => __sent.length);
  await p.tap("[data-act=save]"); await p.waitForTimeout(500);
  const sent = await p.evaluate((n) => __sent.slice(n).join(" "), n);
  ok(/Pledge recorded/.test(sent) && /Congrats/.test(sent) && /Well done/.test(sent), "Ara was not told to congratulate the officer");  const instr = await p.evaluate(() => __sent.map(s => JSON.parse(s)).filter(e => e.type === "session.update" && e.session.instructions).map(e => e.session.instructions).pop());
  ok(/Your personality: friendly, upbeat/.test(instr) && /Never joke about investors/.test(instr), "Ara has no personality line");
});
test("Planning an ask: the entity set on the opportunity is on the form, and Ara is told not to ask for it", async (p) => {
  await signIn(p);
  await ara(p, "show_contact_draft", { first: "Lee", last: "Park", email: "lee@example.org", capacity: "B" });
  await said(p, "B."); await ara(p, "show_contact_draft", { first: "Lee", last: "Park", email: "lee@example.org", capacity: "B" });
  for (let i = 0; i < 3 && !(await p.isVisible("[data-act=save]")); i++) await p.waitForTimeout(200);
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  await ara(p, "show_opportunity_draft", { contact_name: "Lee Park" });
  await p.selectOption("#f_fund", "C.A. North Dakota C4"); await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  await p.evaluate(() => { window.__demo.state.opps.find(o => o.name.startsWith("Park")).stage = "Cultivation"; });
  const r = await ara(p, "show_ask_plan_draft", { contact_name: "Lee Park" });
  ok((await p.inputValue("#f_fund")) === "C.A. North Dakota C4", "the planned ask form did not take the opportunity's entity");
  ok(/Already on the form[^.]*Entity: C\.A\. North Dakota C4/.test(r.status) && /Never ask for these again/.test(r.status), "Ara was not told the entity is already set");
  ok(!r.still_needed.includes("Entity") && /already set/.test(r.still_needed[0]), "Ara was asked for the entity again");
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
  await p.tap("[data-act2=cfilt][data-v=ready]"); await p.waitForTimeout(300);
  ok(await p.isVisible("text=Haddad, Noor") && !(await p.isVisible("text=Abernathy, Ruth")), "the Ready for opportunity filter is wrong");
  await tab(p, "Home");
  ok(await p.isVisible("text=Noor meets every requirement"), "Needs attention does not list Noor as ready");
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
test("Opportunity: Next step panel on the record and a Next: line in the list", async (p) => {
  await signIn(p); await tab(p, "Opportunities");
  ok(await p.isVisible(".row:has-text('Ken Ito') .nextline"), "the list has no Next: line for Ken");
  ok(/record Ken's answer/.test(await p.textContent(".row:has-text('Ken Ito') .nextline")), "Ken's Next: line is wrong");
  await p.tap(".row:has-text('James Okafor')"); await p.waitForTimeout(400);
  ok(await p.isVisible(".nextp") && /to Cultivation/.test(await p.textContent(".nextp .ph")), "James's record has no Next step panel to Cultivation");
  ok(await p.locator(".nextp li").count() === 3, "Qualification should list three steps");
});
test("Ask planning: the campaign choices follow the entity (touch and voice)", async (p) => {
  await signIn(p);
  let r = await ara(p, "show_ask_plan_draft", { contact_name: "Ruth Abernathy", fund: "Citizens Alliance C3", campaign: "Pennsylvania", plannedDate: "2026-12-01", amount: 50000 });
  ok(r.still_needed && r.still_needed.some(x => /Pennsylvania isn't a campaign for Citizens Alliance C3.*National/.test(x)), "Ara was not told the campaign doesn't suit the entity: " + JSON.stringify(r).slice(0, 200));
  const opts = async () => p.$$eval("#f_campaign option", os => os.map(o => o.value).filter(Boolean));
  ok((await opts()).join() === "National", "C3 should offer National only");
  await p.selectOption("#f_fund", "C.A. Idaho C4"); await p.waitForTimeout(300);
  ok((await opts()).join() === "National,Idaho", "Idaho C4 should offer National and Idaho: " + (await opts()).join());
  const ents = await p.$$eval("#f_fund option", os => os.map(o => o.value).filter(Boolean));
  ok(ents.length === 11 && !ents.some(e => / - Citizens Alliance$/.test(e)), "the entity list is not the new 11");
});
test("Ara: an interaction report keeps the spoken summary (new contact)", async (p) => {
  await signIn(p);
  await ara(p, "show_contact_draft", { first: "Jenny", last: "Arena", email: "jenny@example.org", mobile: "(555) 010-0123" });
  for (let i = 0; i < 3 && !(await p.isVisible("[data-act=save]")); i++) await p.waitForTimeout(200);
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  let r = await ara(p, "show_interaction_draft", { contact_name: "Jenny Arena", date: "2026-10-20", meetingType: "In person" });
  ok(/summary parameter/.test(r.status), "Ara was not told where the summary goes");
  r = await ara(p, "show_interaction_draft", { contact_name: "Jenny Arena", date: "2026-10-20", meetingType: "In person", notes: "Met Jenny for coffee; she is keen on the Pennsylvania program.", substantive: true });
  const v = await p.inputValue("#f_summary");
  ok(/coffee/.test(v), "the spoken summary is not in the Summary field");
});
test("Ara: a planned ask takes a spoken date in any common form", async (p) => {
  await signIn(p);
  const y = new Date().getFullYear(), want = (m, d) => { let iso = `${y}-${m}-${d}`; if (iso < new Date().toISOString().slice(0, 10)) iso = `${y + 1}-${m}-${d}`; return iso; };
  for (const [said, iso] of [["December 1", want("12", "01")], ["12/15/2026", "2026-12-15"], ["2026-11-3", "2026-11-03"]]) {
    await ara(p, "show_ask_plan_draft", { contact_name: "Ruth Abernathy", fund: "Citizens Alliance C3", campaign: "National", plannedDate: said, amount: 50000 });
    ok((await p.inputValue("#f_plannedDate")) === iso, `"${said}" did not become ${iso}: got ${await p.inputValue("#f_plannedDate")}`);
    await p.tap("[data-act=close]"); await p.waitForTimeout(250);
  }
  await ara(p, "show_ask_plan_draft", { contact_name: "Ruth Abernathy", fund: "Citizens Alliance C3", campaign: "National", planned_ask_date: "2026-12-20", amount: 50000 });
  ok((await p.inputValue("#f_plannedDate")) === "2026-12-20", "a date sent under another name was dropped");
});
test("Ara: sets a capacity rating on a new contact (in the draft, any wording, or with set_capacity_rating)", async (p) => {
  await signIn(p);
  await said(p, "Add Lou Ng, lou@example.org, 555 010 0111.");
  await ara(p, "show_contact_draft", { first: "Lou", last: "Ng", email: "lou@example.org", mobile: "(555) 010-0111", capacity: "E" });
  ok(!(await p.inputValue("#f_capacity")), "a rating the officer never gave was kept");
  await said(p, "Give him a capacity of C.");
  await ara(p, "show_contact_draft", { first: "Lou", last: "Ng", capacity: "c · $25k to $100k" });
  ok((await p.inputValue("#f_capacity")) === "C", "a rating in other words was not set: " + await p.inputValue("#f_capacity"));
  await said(p, "Actually about 150 thousand.");
  await ara(p, "show_contact_draft", { first: "Lou", last: "Ng", capacity: "$150,000" });
  ok((await p.inputValue("#f_capacity")) === "B", "a dollar amount did not become B");
  const r = await ara(p, "set_capacity_rating", { contact_name: "Lou Ng", rating: "A", confirmed: true });
  ok(r.on_draft && (await p.inputValue("#f_capacity")) === "A", "set_capacity_rating did not reach the open New contact form");
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  ok((await state(p)).contacts.find(c => c.first === "Lou").capacity === "A", "the rating was not saved with the contact");
});
test("Activity log records opening the app and taps outside a conversation", async (p) => {
  await signIn(p); await tab(p, "Contacts"); await p.tap("text=Abernathy, Ruth"); await p.waitForTimeout(4600);
  const ev = (await p.evaluate(() => __logs)).flatMap(b => b.events.map(e => e.role + ": " + e.text));
  ok(ev.filter(x => x === "open: Opened the app").length === 1, "opening the app was not logged exactly once: " + ev.slice(0, 4).join(" | "));
  ok(ev.some(x => /^tap: .*Contacts/.test(x)) && ev.some(x => /^tap: .*Abernathy/.test(x)), "taps were not sent to the activity log: " + ev.slice(0, 6).join(" | "));
});
test("Activity log records what is in a form when Save is tapped", async (p) => {
  await signIn(p);
  ok(!(await p.isVisible("#fmbar")), "a new user was shown the form-logging notice again");
  await tab(p, "Contacts"); await p.tap("text=Abernathy, Ruth"); await p.waitForTimeout(300);
  await p.tap("[data-form=task]"); await p.waitForTimeout(300);
  await p.fill("#f_text", "Mail the gala invitation"); await p.fill("#f_due", "2026-11-30");
  await p.tap("[data-act=save]"); await p.waitForTimeout(4600);
  const ev = (await p.evaluate(() => __logs)).flatMap(b => b.events.map(e => e.role + ": " + e.text));
  ok(ev.some(x => /^form: New task \(opened by tapping\)\. .*Task: Mail the gala invitation; Due date: 2026-11-30/.test(x)), "the saved form was not logged: " + ev.filter(x => x.startsWith("form")).join(" | "));
});
test("Ara reads a spoken name back, spelled, and saves it only once confirmed; the header name opens Settings", async (p) => {
  await p.tap(".wl-mic.big"); await p.waitForTimeout(600);
  let r = await ara(p, "set_user_name", { first_name: "Eve" });
  ok(r.saved === false && /E V E/.test(r.status), "the name was not read back spelled: " + JSON.stringify(r));
  ok(!(await state(p)).settings.userName, "the name was saved before it was confirmed");
  r = await ara(p, "set_user_name", { first_name: "Matt", confirmed: true });
  ok(r.saved === false && /M A T T/.test(r.status), "a corrected name skipped the read-back");
  r = await ara(p, "set_user_name", { first_name: "Matt", confirmed: true });
  ok(r.ok && r.saved !== false && (await state(p)).settings.userName === "Matt", "the confirmed name was not saved");
  await p.waitForTimeout(300); await p.evaluate(() => document.getElementById("modal").innerHTML = "");
  await p.tap("header.top .who"); await p.waitForTimeout(300);
  ok((await titleOf(p)) === "Settings" && (await p.evaluate(() => document.activeElement && document.activeElement.id)) === "userName", "tapping the header name did not open the name field");
});
test("Ara: a spelled-out name the update missed is sent back to her to apply", async (p) => {
  await signIn(p);
  await said(p, "Add Katherine Hudson, katherine@example.org.");
  await ara(p, "show_contact_draft", { first: "Katherine", last: "Hudson", email: "katherine@example.org" });
  await said(p, "The last name is actually Tudzin. T U D Z I N.");
  const r = await ara(p, "show_contact_draft", { email: "katherine@example.org", ally: false, dnc: false });
  ok(/T U D Z I N/.test(r.status || "") && /spelled/.test(r.status), "the missed spelling was not flagged: " + JSON.stringify(r));
  await said(p, "The last name is actually Tudzin. T U D Z I N.");
  const r2 = await ara(p, "show_contact_draft", { last: "Tudzin" });
  ok(!/spelled out/.test(r2.status || "") && (await p.inputValue("#f_last")) === "Tudzin", "the applied spelling was still flagged or not on the form");
});
test("Contacts can be edited by touch and voice; changes go to History; Do Not Contact stays locked on", async (p) => {
  await signIn(p); await tab(p, "Contacts"); await p.tap("text=Abernathy, Ruth"); await p.waitForTimeout(300);
  await p.tap(".editbtn"); await p.waitForTimeout(300);
  ok((await p.inputValue("#f_email")) === "ruth.abernathy@example.org", "the edit form is not filled in from the record");
  await p.fill("#f_mobile", "(555) 010-0199"); await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  const st = await state(p), ruth = st.contacts.find(c => c.first === "Ruth");
  ok(ruth.mobile === "(555) 010-0199", "the new mobile was not saved");
  ok(st.history.some(h => /Mobile changed from .* to \(555\) 010-0199/.test(h.text)), "the change is not in History");
  await p.tap(".editbtn"); await p.waitForTimeout(300); await p.fill("#f_email", ""); await p.fill("#f_mobile", ""); await p.tap("[data-act=save]"); await p.waitForTimeout(300);
  ok(await p.isVisible("text=A contact needs at least one"), "clearing both email and mobile was allowed");
  await p.tap("[data-act=close]"); await p.waitForTimeout(250);
  await ara(p, "show_contact_edit_draft", { contact_name: "Ruth Abernathy", dnc: true });
  ok(await p.isChecked("#f_dnc"), "voice edit did not tick Do Not Contact");
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  ok((await state(p)).contacts.find(c => c.first === "Ruth").dnc, "Do Not Contact not saved");
  await p.tap(".editbtn"); await p.waitForTimeout(300);
  ok(await p.isDisabled("#f_dnc"), "a gift officer could turn Do Not Contact off");
});
test("Ara: giving history and screens", async (p) => {
  await signIn(p);
  const g = await ara(p, "get_giving", { contact_name: "Ruth Abernathy" }); ok(g.ok !== false, "giving lookup failed: " + JSON.stringify(g).slice(0, 120));
  ok(await titleOf(p) === "Contact", "Ruth's record did not open");
  await ara(p, "show_screen", { screen: "opportunities" }); ok(await titleOf(p) === "Opportunities", "show_screen did not open Opportunities");
});
test("Ara answers what changed in the demo, and passes a question she can't answer to the team", async (p) => {
  await signIn(p);
  const sent = await p.evaluate(() => __sent.map(s => JSON.parse(s)).filter(e => e.type === "session.update").at(-1).session);
  ok(sent.tools.some(t => t.name === "get_demo_changes") && sent.tools.some(t => t.name === "pass_question_to_team"), "Ara was not given the demo changes or pass-to-team tools");
  ok(/Shall I pass that to the demo team\?/.test(sent.instructions), "Ara is not told to offer passing a question on");
  const c = await ara(p, "get_demo_changes", { topic: "confetti balloons" });
  ok(c.ok && c.total_changes > 100 && c.changes.length && /confetti/i.test(c.changes[0].change), "the change log lookup did not find the confetti change: " + JSON.stringify(c).slice(0, 160));
  const latest = await ara(p, "get_demo_changes", {}); ok(latest.ok && latest.changes.length === 8, "the latest changes were not returned");
  const q = await ara(p, "pass_question_to_team", { question: "Can the app show pledges by entity?" });
  ok(q.ok, "the question was not passed on: " + JSON.stringify(q)); await p.waitForTimeout(4400);
  const ev = (await p.evaluate(() => __logs)).flatMap(b => b.events.map(e => e.role + ": " + e.text));
  ok(ev.includes("question: Can the app show pledges by entity?"), "the question did not reach the activity log: " + ev.slice(-4).join(" | "));
});
test("Ara: reads contact and opportunity details, with who can change each field", async (p) => {
  await signIn(p);
  const elena = (await state(p)).contacts.find(c => c.first === "Elena");
  const d = await ara(p, "get_contact_details", { contact_name: "Elena Vasquez" });
  ok(d.ok && d.fields.email.value === (elena.email || "Not given"), "Elena's email was not returned: " + JSON.stringify(d).slice(0, 160));
  ok(/Chief Gift Officer/.test(d.fields.gift_officer.who_can_change), "gift officer change rule missing");
  const o = await ara(p, "get_opportunity_details", { contact_name: "Ken Ito" });
  ok(o.ok && o.fields.stage.value === "Ask Made", "Ken's stage was not returned: " + JSON.stringify(o).slice(0, 160));
  ok(/system/i.test(o.fields.stage.who_can_change) && /system/i.test(o.fields.asked_tile.who_can_change), "stage and Asked are not marked system-controlled");
  ok(o.fields.asks.value[0].planned_ask_date && await titleOf(p) !== "Contact", "planned ask date missing or opportunity did not open");
  const v = await ara(p, "get_opportunity_details", { contact_name: "Elena Vasquez" });
  ok(/You can edit a planned ask/.test(v.fields.asks.value[0].who_can_change), "a planned ask is not marked editable");
});
test("Edit a saved meeting, task and planned ask, by tapping and by voice; recorded money stays locked", async (p) => {
  await signIn(p);
  // planned ask, typed: Elena's opportunity is in Ask Planning
  await tab(p, "Opportunities"); await p.tap("text=Elena Vasquez >> nth=0"); await p.waitForTimeout(300);
  await p.tap("[data-form=editPlan]"); await p.waitForTimeout(300);
  await p.fill("#f_amount", "45000"); await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  let st = await state(p), el = st.contacts.find(c => c.first === "Elena"), o = st.opps.find(x => x.contactId === el.id);
  ok(o.asks[0].amount === 45000 && o.asks[0].status === "Planned", "typed planned-ask edit not saved: " + JSON.stringify(o.asks[0]));
  ok(st.history.some(h => /Planned ask edited .*Amount changed from \$40,000 to \$45,000/.test(h.text)), "planned-ask edit not in History");
  // planned ask, voice: move the date; the reminder task follows
  await ara(p, "show_ask_plan_edit_draft", { contact_name: "Elena Vasquez", plannedDate: "2026-12-15" });
  ok(await p.isVisible("text=Edit planned ask"), "voice planned-ask edit form did not open");
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  st = await state(p); o = st.opps.find(x => x.contactId === el.id);
  ok(o.asks[0].plannedDate === "2026-12-15", "voice planned-ask date not saved");
  const rem = st.tasks.find(k => k.oppId === o.id && /^Make the ask/.test(k.text) && !k.done);
  ok(!rem || rem.due === "2026-12-08", "reminder task did not move with the planned date: " + (rem && rem.due));
  // recorded ask: Ken's is Ask Made, so it can't be edited
  const r = await ara(p, "show_ask_plan_edit_draft", { contact_name: "Ken Ito", amount: 1 });
  ok(r.ok === false && /Chief Gift Officer/.test(r.error), "a recorded ask could be edited: " + JSON.stringify(r).slice(0, 160));
  // meeting, typed: Ruth's latest report
  await tab(p, "Contacts"); await p.tap("text=Abernathy, Ruth"); await p.waitForTimeout(300);
  await p.tap("[data-form=editInteraction] >> nth=0"); await p.waitForTimeout(300);
  await p.fill("#f_summary", "Edited summary for the test."); await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  st = await state(p); const ruth = st.contacts.find(c => c.first === "Ruth");
  ok(st.interactions.some(i => i.contactId === ruth.id && i.summary === "Edited summary for the test."), "typed meeting edit not saved");
  // meeting, voice
  await ara(p, "show_interaction_edit_draft", { contact_name: "Ruth Abernathy", meetingType: "Video call" });
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  st = await state(p);
  ok(st.interactions.some(i => i.contactId === ruth.id && i.summary === "Edited summary for the test." && i.type === "Video call"), "voice meeting edit not saved");
  // task, voice then typed
  await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send the annual report", due: "2026-11-20" }); await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  await ara(p, "show_task_edit_draft", { contact_name: "Ruth Abernathy", which: "annual report", due: "2026-11-27" });
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  st = await state(p); let tk = st.tasks.find(k => k.text === "Send the annual report");
  ok(tk && tk.due === "2026-11-27", "voice task edit not saved: " + JSON.stringify(tk));
  await tab(p, "Tasks"); await p.tap(`[data-form=editTask][data-item="${tk.id}"]`); await p.waitForTimeout(300);
  await p.fill("#f_text", "Send the annual report and a thank-you note"); await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  st = await state(p); tk = st.tasks.find(k => k.id === tk.id);
  ok(tk.text === "Send the annual report and a thank-you note", "typed task edit not saved");
});
test("Ara: talk faster is remembered", async (p) => {
  await signIn(p); const before = (await state(p)).settings.speed || 1;
  await ara(p, "set_speaking_speed", { change: "faster" });
  ok(((await state(p)).settings.speed || 1) > before, "speed did not go up");
});

test("Voice commands: undo, start over, cancel and go back are carried out by the app", async (p) => {
  await signIn(p);
  await said(p, "Add Lou Ng."); await ara(p, "show_contact_draft", { first: "Lou", last: "Ng" });
  await said(p, "Email lou@example.org."); await ara(p, "show_contact_draft", { email: "lou@example.org" });
  await said(p, "Undo that."); await p.waitForTimeout(900);
  ok(!(await p.inputValue("#f_email")) && (await p.inputValue("#f_first")) === "Lou", "undo did not take back the last change");
  await said(p, "Start over"); await p.waitForTimeout(900);
  ok(!(await p.inputValue("#f_first")), "start over did not clear the form");
  await said(p, "Never mind."); await p.waitForTimeout(900);
  ok(!(await p.isVisible(".sheet")), "cancel did not close the form");
  await p.evaluate(() => window.__demo && 0); await tab(p, "Contacts"); await p.tap("text=Abernathy, Ruth"); await p.waitForTimeout(300);
  await said(p, "Go back."); await p.waitForTimeout(900);
  ok((await titleOf(p)) === "Contacts", "go back did not return to Contacts");
  const notices = await p.evaluate(() => __sent.map(s => JSON.parse(s)).filter(e => e.item && e.item.type === "message").map(e => e.item.content[0].text).join(" | "));
  ok(/said "undo"/.test(notices) && /said "cancel"/.test(notices) && /said "go back"/.test(notices), "Ara was not told what the app did");
});
test("Voice commands: everyday ways of saying cancel or start over work, and Ara can close a form herself", async (p) => {
  await signIn(p);
  const open = async () => { await said(p, "Add Pat Lee."); await ara(p, "show_contact_draft", { first: "Pat", last: "Lee", email: "pat@example.org" }); };
  const closed = async (line) => { await open(); await said(p, line); await p.waitForTimeout(900); ok(!(await p.isVisible(".sheet")), `"${line}" did not close the form`); };
  for (const line of ["Let's cancel this contact.", "I don't want to do this anymore. Let's cancel.", "Can you clear my screen, please?", "Close this form.", "Okay, get rid of it."]) await closed(line);
  await open(); await said(p, "Cancel this contact and start a new one."); await p.waitForTimeout(900);
  ok((await p.isVisible(".sheet")) && !(await p.inputValue("#f_first")), "cancel-and-start-a-new-one did not clear the form");
  await said(p, "Never mind."); await p.waitForTimeout(900);
  await open(); await said(p, "Cancel Ken's pledge from last week."); await p.waitForTimeout(900);
  ok(await p.isVisible(".sheet"), "a sentence about something else was taken as cancel");
  const r = await ara(p, "close_form", { change: "close" });
  ok(!(await p.isVisible(".sheet")) && r.ok, "Ara could not close the form herself");
  const r2 = await ara(p, "close_form", { change: "close" });
  ok(!r2.ok, "close_form said ok with no form open");
});
test("Ara: a rating said while the contact's Edit form is open goes on the form, then saves with it", async (p) => {
  await signIn(p); await tab(p, "Contacts"); await p.tap("text=Ito, Ken"); await p.waitForTimeout(300);
  const before = (await state(p)).contacts.find(c => c.first === "Ken").capacity;
  await ara(p, "show_contact_edit_draft", { contact_name: "Ken" });
  await said(p, "How about let's take him to A.");
  const want = before === "A" ? "B" : "A";
  const r = await ara(p, "set_capacity_rating", { contact_name: "Ken", rating: want, confirmed: true });
  ok(r.on_draft && (await p.inputValue("#f_capacity")) === want, "the open Edit form did not show the new rating");
  ok((await state(p)).contacts.find(c => c.first === "Ken").capacity === before, "the rating was saved without the officer tapping Save");
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  ok((await state(p)).contacts.find(c => c.first === "Ken").capacity === want, "Save changes did not save the rating");
});
// ---------- replays of real sessions (tests/replays/*.json; names and contact details changed) ----------
for (const f of fs.readdirSync(path.join(__dirname, "replays")).filter(f => f.endsWith(".json"))) {
  const r = JSON.parse(fs.readFileSync(path.join(__dirname, "replays", f), "utf8"));
  test("Replay: " + r.name, async (p) => {
    if (r.start === "no-name") { await p.tap(".wl-mic.big"); await p.waitForTimeout(600); } else await signIn(p);
    for (const [i, st] of r.steps.entries()) {
      const at = `step ${i + 1}`;
      if (st.said) { await said(p, st.said); await p.waitForTimeout(50); continue; }
      const out = await ara(p, st.tool, st.args); const x = st.expect || {};
      if (x.status) ok(String(out.status || "").includes(x.status), `${at}: Ara was not told "${x.status}": ${out.status || out.error}`);
      if (x.notSaved) ok(out.saved === false, `${at}: saved without confirming`);
      if (x.userName) ok((await state(p)).settings.userName === x.userName, `${at}: name is not ${x.userName}`);
      for (const [sel, want] of Object.entries(x.field || {})) { const got = await p.inputValue(sel); ok(got === want, `${at}: ${sel} is "${got}", expected "${want}"`); }
    }
  });
}
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
  const run = tests.filter(t => PAGE === "preview-flow.html" || !t.opts.page || t.opts.always).filter(t => !process.env.ONLY || t.name.includes(process.env.ONLY));
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
