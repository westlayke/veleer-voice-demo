// Checks: forms, by touch and by voice: fields, rules, edits and History. tests/bot.js loads this file and passes in its helpers.
module.exports = ({ test, ok, fresh, signIn, state, tab, ara, said, titleOf, PAGE, fs, path }) => {

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
  for (const label of ["Log a meeting or call", "Schedule a meeting", "Add a task", "Add a contact", "Plan an ask", "Record a gift"]) ok(await p.locator(`[data-qa] >> text=${label}`).count(), "menu is missing " + label);
  ok(!(await p.locator("[data-qa] >> text=Record a payment").count()), "the menu still has a separate Record a payment");
  // Record the ask says why each opportunity is there
  await p.tap("[data-qa=ask]"); await p.waitForTimeout(250);
  const askList = await p.evaluate(() => [...document.querySelectorAll("[data-pick] small")].map(s => s.textContent));
  const heads = await p.$$eval(".qa-h", hs => hs.filter(h => h.closest("#modal")).map(h => h.textContent));
  ok(heads[0] === "Planned asks (Ask Planning)" && heads[1] === "Other opportunities" && /^Ask Planning/.test(askList[0]), "Record the ask does not group planned asks first: " + heads.join(" | "));
  ok(askList.some(x => /^Ask Planning · planned for/.test(x)) && askList.includes("Ask Made · record the answer") && askList.includes("Cultivation · unplanned ask"), "Record the ask list doesn't say why: " + askList.join(" | "));
  await p.evaluate(() => document.getElementById("modal").innerHTML = ""); await p.tap("header.top .addbtn"); await p.waitForTimeout(250);
  await p.tap("[data-qa=task]"); await p.waitForTimeout(250);
  ok(await p.locator("#pkTitle").isVisible(), "Add a task did not ask who it is for");
  // the list is A to Z by last name, shown "Last, First", with a search box at the top
  const names = await p.evaluate(() => [...document.querySelectorAll("[data-pick]")].map(b => b.textContent.trim()));
  ok(names.every(n => /^[^,]+, /.test(n)) && names.join("|") === names.slice().sort((a, b) => a.localeCompare(b)).join("|"), "the picker is not A to Z as Last, First: " + names.join(" | "));
  ok(await p.isVisible(".pick-q"), "the picker has no search box");
  await p.fill(".pick-q", "ken ito"); await p.waitForTimeout(100);
  ok((await p.$$eval("[data-pick]", bs => bs.filter(b => !b.hidden).map(b => b.textContent.trim()))).join("|") === "Ito, Ken", "searching ken ito did not find just Ito, Ken");
  await p.tap("[data-pick] >> text=Ito, Ken"); await p.waitForTimeout(300);
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
  await p.waitForFunction(() => G.live, null, { timeout: 8000 }); await p.evaluate(() => { G.hands = false; paintCall(); }); // this check starts in tap mode; hands-free is on by default since Oct 25
  if (await p.evaluate(() => G.live)) { await p.tap(".cb-end"); await p.waitForTimeout(300); } // the welcome conversation may still be open
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
test("New contact, new opportunity and the other forms show every field (no More details fold), and Ara offers the opportunity's optional fields", async (p) => {
  await signIn(p);
  await p.waitForFunction(() => G.live, null, { timeout: 8000 }); await p.evaluate(() => { G.hands = false; paintCall(); }); // this check starts in tap mode; hands-free is on by default since Oct 25
  await ara(p, "show_contact_draft", { first: "Ana", last: "Ruiz" });
  ok(!(await p.isVisible("details.more")) && (await p.isVisible("#f_howMet")), "the new contact form still hides fields under More details");
  await p.tap("[data-act=close]"); await p.waitForTimeout(300);
  await ara(p, "show_contact_draft", { first: "Ana", last: "Ruiz", email: "ana@example.org", mobile: "(555) 010-0142" });
  await said(p, "Rate her B."); await ara(p, "show_contact_draft", { first: "Ana", last: "Ruiz", email: "ana@example.org", mobile: "(555) 010-0142", capacity: "B" });
  for (let i = 0; i < 3 && !(await p.isVisible("[data-act=save]")); i++) await p.waitForTimeout(200);
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  const ready = "Ana Ruiz";
  await said(p, "Create an opportunity for Ana.");
  let r = await ara(p, "show_opportunity_draft", { contact_name: ready });
  ok(!(await p.isVisible("details.more")) && (await p.isVisible("#f_potential")) && (await p.isVisible("#f_notes")), "the new opportunity form still hides fields under More details");
  ok(/Save it, or add the optional details first\?$/.test(r.ask_exactly || ""), "the opportunity's optional fields weren't offered: " + JSON.stringify(r));
  r = await ara(p, "optional_fields", { step: "start" });
  ok(r.field === "fund", "the opportunity's first optional question wasn't the entity");
  r = await ara(p, "optional_fields", { step: "answer", value: "Citizens Alliance C3" });
  ok(r.field === "potential" && (await p.inputValue("#f_fund")) === "Citizens Alliance C3", "the entity wasn't filled in, or the potential amount didn't come next");
  r = await ara(p, "optional_fields", { step: "answer", value: "50k" });
  ok(r.field === "notes", "notes didn't come last");
  r = await ara(p, "optional_fields", { step: "stop" });
  ok(r.done && /tap/.test(r.status), "stop didn't end the questions");
  r = await ara(p, "show_opportunity_draft", { contact_name: ready, potential: 50000 });
  ok(/tap/.test(r.status) && !/one at a time/.test(r.status), "the optional-fields question repeated");
  // the other forms have no More details fold either (the open opportunity draft is closed first, then the call ended so the tab bar is plain)
  await p.tap("[data-act=close]").catch(() => {}); await p.evaluate(() => { try { endCall(); } catch (e) {} }); await p.waitForTimeout(400); await p.evaluate(() => { const m = document.getElementById("modal"); if (m) m.innerHTML = ""; });
  await tab(p, "Contacts"); await p.tap("text=Ito, Ken"); await p.waitForTimeout(300);
  for (const a of ["interaction", "meeting", "task", "pledge"]) {
    await p.tap("header.top .addbtn"); await p.waitForTimeout(250); await p.tap(`[data-qa=${a}]`); await p.waitForTimeout(300);
    const r = await p.evaluate(() => ({ fold: !!document.querySelector("#overlay details"), title: document.querySelector("#overlay h3") && document.querySelector("#overlay h3").textContent }));
    ok(r.title && !r.fold, `${a}: ${r.title ? "fields are still folded under More details" : "the form did not open"}`);
    await p.tap("[data-act=close]"); await p.waitForTimeout(200);
  }
});
test("Interaction report: Next step is a three-line box, and Summary and Next step have no field mics", async (p) => {
  await signIn(p); await tab(p, "Contacts"); await p.tap("text=Abernathy, Ruth"); await p.waitForTimeout(300);
  await p.tap("header.top .addbtn"); await p.waitForTimeout(250); await p.tap("[data-qa=interaction]"); await p.waitForTimeout(300);
  ok(await p.evaluate(() => { const t = document.getElementById("f_nextStep"); return t && t.tagName === "TEXTAREA" && t.rows === 3; }), "Next step is not a three-line box");
  ok(!(await p.$(".fmic, [data-dict]")), "the field mics are still there");
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
test("Contact form: Texting permission source shows only while Texting permitted is ticked", async (p) => {
  await signIn(p);
  await ara(p, "show_contact_draft", { first: "Lee", last: "Park", email: "lee.park@example.org" });
  ok(!(await p.$("#f_permSource")), "the permission source showed with texting off");
  await p.check("#f_permText"); await p.waitForTimeout(200);
  ok(await p.$("#f_permSource"), "ticking Texting permitted did not show the permission source");
  await p.fill("#f_permSource", "Told Dana at the town hall");
  await p.uncheck("#f_permText"); await p.waitForTimeout(200);
  ok(!(await p.$("#f_permSource")), "unticking Texting permitted did not hide the permission source");
  await p.check("#f_permText"); await p.waitForTimeout(200);
  ok((await p.inputValue("#f_permSource")) === "Told Dana at the town hall", "the typed source was lost when texting was toggled");
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  const c = (await state(p)).contacts.find(x => x.first === "Lee" && x.last === "Park");
  ok(c && c.permText && c.permSource === "Told Dana at the town hall", "the source was not saved");
  ok(/Texting permission source: Told Dana/.test(await p.textContent("body")), "the record does not show the texting permission source");
});

};
