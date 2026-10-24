// Checks: Ara (voice), simulated: contacts, ratings, details, spelling, voice commands and her instructions. tests/bot.js loads this file and passes in its helpers.
module.exports = ({ test, ok, fresh, signIn, state, tab, ara, said, titleOf, PAGE, fs, path }) => {

test("Ara: a new contact gets the other contact detail, then the optional fields with the capacity rating", async (p) => {
  await signIn(p);
  let r = await ara(p, "show_contact_draft", { first: "Maya", last: "Lin" });
  ok(r.still_needed && r.still_needed.some(x => /Email or mobile/.test(x)), "Ara was not asked for an email or mobile");
  r = await ara(p, "show_contact_draft", { first: "Maya", last: "Lin", email: "maya@example.org" });
  ok(/mobile number/.test(r.status), "Ara was not asked for the mobile too");
  r = await ara(p, "show_contact_draft", { first: "Maya", last: "Lin", email: "maya@example.org" });
  ok(/add more details\? I can take you through them one at a time/.test(r.status), "Ara was not told to offer the optional fields one at a time");
  ok((await p.textContent("#f_capacity option:checked")).trim() === "No rating set", "the rating does not default to No rating set");
  await said(p, "C.");
  r = await ara(p, "show_contact_draft", { first: "Maya", last: "Lin", email: "maya@example.org", capacity: "C", howMet: "Town hall" });
  ok(/tap/.test(r.status) && !/more details/.test(r.status), "a question repeated");
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  ok((await state(p)).contacts.find(c => c.first === "Maya").capacity === "C", "the rating was not saved with the contact");
});
test("Ara: optional fields one at a time, filled in by the app (rating, how met, texting and its source, flags)", async (p) => {
  await signIn(p);
  let r = await ara(p, "show_contact_draft", { first: "Jack", last: "Lantern", email: "jack@example.org", mobile: "(555) 010-0199" });
  ok(/one at a time/.test(r.status), "Ara was not told to offer the optional fields one at a time");
  r = await ara(p, "optional_fields", { step: "start" });
  ok(r.field === "capacity" && /Capacity rating first/.test(r.say) && /under \$5,000/.test(r.say), "the first question wasn't the capacity rating with its bands");
  r = await ara(p, "optional_fields", { step: "answer", value: "D" });
  ok((await p.inputValue("#f_capacity")) === "D" && r.field === "howMet" && /How did you meet Jack/.test(r.say), "the rating wasn't filled in, or How we met didn't come next");
  r = await ara(p, "optional_fields", { step: "answer", value: "In the pumpkin patch" });
  ok(/pumpkin patch/.test(await p.inputValue("#f_howMet")) && r.field === "permText", "How we met wasn't filled in, or texting didn't come next");
  r = await ara(p, "optional_fields", { step: "answer", value: "Yes, that's fine" });
  ok(await p.isChecked("#f_permText") && r.field === "permSource", "texting wasn't turned on, or its source wasn't asked next");
  r = await ara(p, "optional_fields", { step: "skip" });
  ok(r.field === "flags" && /Most people are neither/.test(r.say), "the flags question didn't come last");
  r = await ara(p, "optional_fields", { step: "answer", value: "maybe" });
  ok(r.ok === false && /didn't catch/.test(r.say), "an unclear answer wasn't asked again");
  r = await ara(p, "optional_fields", { step: "answer", value: "Neither" });
  ok(r.done && /tap "Save contact"/.test(r.status) && !(await p.isChecked("#f_ally")) && !(await p.isChecked("#f_dnc")), "the steps didn't finish by asking to tap Save contact");
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  const c = (await state(p)).contacts.find(c => c.first === "Jack");
  ok(c && c.capacity === "D" && c.permText === true && /pumpkin/.test(c.howMet), "the answers weren't saved with the contact");
});
test("Ara: a new opportunity's optional fields understand \"the C-3\" and \"one hundred thousand\", and ask the campaign when there's a choice", async (p) => {
  await signIn(p);
  const who = "Noor Haddad";
  let r = await ara(p, "show_contact_draft", { first: "Noor", last: "Haddad", email: "noor@example.org" });
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  await p.evaluate(() => { S.contacts.find(c => c.first === "Noor").capacity = "B"; save(); render(); });
  r = await ara(p, "show_opportunity_draft", { contact_name: who });
  r = await ara(p, "optional_fields", { step: "start" });
  ok(r.field === "fund", "the first question wasn't the entity");
  r = await ara(p, "optional_fields", { step: "answer", value: "The C, the C-3." });
  ok(r.ok !== false && (await p.inputValue("#f_fund")) === "Citizens Alliance C3", "\"The C, the C-3\" wasn't read as Citizens Alliance C3: " + JSON.stringify(r).slice(0, 200));
  ok(/National campaign/.test(JSON.stringify(r)) && (await p.inputValue("#f_campaign")) === "National" && r.field === "potential", "the campaign wasn't filled in as National, or the amount didn't come next");
  r = await ara(p, "optional_fields", { step: "answer", value: "One hundred thousand." });
  ok(r.ok !== false && /100,000/.test(await p.inputValue("#f_potential")) && r.field === "notes", "\"One hundred thousand\" wasn't read as $100,000: " + JSON.stringify(r).slice(0, 200));
  const idaho = await p.evaluate(() => { optSet("fund", "C.A. Idaho PAC"); optSet("campaign", ""); return [optNext() && optNext().k, optParse("campaign", "the state one"), optParse("campaign", "National"), matchEntity("Idaho").hits.length, matchEntity("C.A. Fed PAC").hits.join()]; });
  ok(idaho[0] === "campaign" && idaho[1] === "Idaho" && idaho[2] === "National", "an Idaho entity didn't ask for its campaign: " + JSON.stringify(idaho));
  ok(idaho[3] === 2 && idaho[4] === "C.A. Fed PAC", "entity matching is wrong: " + JSON.stringify(idaho));
  await p.evaluate(() => optSet("fund", "Citizens Alliance C3"));
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  const o = (await state(p)).opps.find(o => o.name.startsWith(who.split(" ").slice(-1)[0]));
  ok(o && o.campaign === "National" && o.potential === 100000, "the opportunity wasn't saved with its campaign and amount: " + JSON.stringify(o && { c: o.campaign, p: o.potential }));
});
test("Ara: texting permitted said by the officer reaches a new contact's form even when Ara leaves it out", async (p) => {
  await signIn(p);
  await ara(p, "show_contact_draft", { first: "Ivy", last: "Moss", email: "ivy@example.org", mobile: "(555) 010-0177" });
  await said(p, "Sure, texting should be permitted.");
  await ara(p, "show_contact_draft", { first: "Ivy", last: "Moss", email: "ivy@example.org", mobile: "(555) 010-0177" });
  ok(await p.isChecked("#f_permText"), "texting permitted didn't reach the form");
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
test("Ara: giving history and screens", async (p) => {
  await signIn(p);
  const g = await ara(p, "get_giving", { contact_name: "Ruth Abernathy" }); ok(g.ok !== false, "giving lookup failed: " + JSON.stringify(g).slice(0, 120));
  ok(await titleOf(p) === "Contact", "Ruth's record did not open");
  await ara(p, "show_screen", { screen: "opportunities" }); ok(await titleOf(p) === "Opportunities", "show_screen did not open Opportunities");
});
test("Ara answers what changed in the proof of concept, and passes a question she can't answer to the team", async (p) => {
  await signIn(p);
  const sent = await p.evaluate(() => __sent.map(s => JSON.parse(s)).filter(e => e.type === "session.update").at(-1).session);
  ok(sent.tools.some(t => t.name === "get_demo_changes") && sent.tools.some(t => t.name === "pass_question_to_team"), "Ara was not given the demo changes or pass-to-team tools");
  ok(/Shall I pass that to the project team\?/.test(sent.instructions), "Ara is not told to offer passing a question on");
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
test("Ara's instructions stay short and the Process FAQ is looked up with get_process_faq", async (p) => {
  await signIn(p);
  const instr = await p.evaluate(() => __sent.map(s => JSON.parse(s)).filter(e => e.session && e.session.instructions).map(e => e.session.instructions).at(-1));
  ok(instr && instr.length < 20000, "instructions are " + (instr || "").length + " characters");
  ok(!/\nQ: /.test(instr) && /get_process_faq/.test(instr) && /Ally - Do Not Solicit/.test(instr), "the FAQ is still sent whole, or the topics are missing");
  let r = await ara(p, "get_process_faq", { question: "Who can clear the ally flag?" });
  ok(r.ok && /clear the Ally - Do Not Solicit flag/.test(r.answers[0].q), "FAQ lookup missed: " + JSON.stringify(r.answers && r.answers[0]));
  r = await ara(p, "get_process_faq", { question: "zebra xylophone" });
  ok(r.ok && !r.answers.length && /isn't covered/.test(r.say), "an unmatched question returned answers");
});
test("During a call, changes reach Ara as short Right now notes; the full instructions go again only when her rules change", async (p) => {
  await signIn(p);
  const full = () => p.evaluate(() => __sent.map(s => JSON.parse(s)).filter(e => e.type === "session.update" && e.session && e.session.instructions).length);
  const notes = () => p.evaluate(() => __sent.filter(s => s.includes("Right now update")).length);
  const f0 = await full(), n0 = await notes();
  await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send Ruth the board deck", due: "2026-11-30" });
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  ok(await full() === f0, "a save sent the full instructions again");
  ok(await notes() > n0 && await p.evaluate(() => __sent.some(s => s.includes("Right now update") && s.includes("Task added"))), "the save was not sent as a Right now note");
  await said(p, "I'm driving"); await p.waitForTimeout(900);
  ok(await full() === f0 + 1, "turning on hands-free did not send the new rules");
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


test("Ara: an interaction's summary is taken from the officer's answer when Ara never sends it; a misplaced next-step date is dropped; \"neither\" flags", async (p) => {
  await signIn(p);
  await ara(p, "show_interaction_draft", { contact_name: "Ken Ito", meetingType: "Phone call" });
  await p.evaluate(() => recent(botName(), "Date is October twenty-first now. What was the gist of the call?"));
  await said(p, "Uh, we talked about the alliance and how he liked our work");
  const r = await ara(p, "show_interaction_draft", { contact_name: "Ken Ito", date: "2026-10-21", meetingType: "Phone call", nextStep: "", nextDue: "2026-10-21" });
  ok(await p.inputValue("#f_summary") === "We talked about the alliance and how he liked our work.", "the officer's answer didn't become the summary");
  ok(!(r.still_needed || []).some(x => /summary/i.test(x)), "the summary was still listed as needed");
  ok(!(await p.inputValue("#f_nextDue").catch(() => "")), "the meeting date was kept as a next-step due date");
  await p.tap(".cb-end").catch(() => {});
  ok(await p.evaluate(() => JSON.stringify(optParse("flags", "neither Ally - Do Not Solicit nor Do Not Contact")) === JSON.stringify({ ally: false, dnc: false }) && optParse("flags", "Ally - Do Not Solicit").ally === true && optParse("flags", "No, that's none of those").dnc === false), "\"neither\" was read as both flags");
});


test("Ara: when Grok goes silent after the app asks for a reply, the app asks up to 3 more times, then reconnects; Grok errors are logged", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  const fire = (evs) => p.evaluate((evs) => evs.forEach(e => __ws.onmessage({ data: JSON.stringify(e) })), evs);
  const creates = () => p.evaluate(() => __sent.filter(s => JSON.parse(s).type === "response.create").length);
  await fire([{ type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(100);
  await p.evaluate(() => notice("Ask the officer the next question."));
  const c0 = await creates(), ws0 = await p.evaluate(() => { window.__ws0 = __ws; return true; });
  for (let i = 1; i <= 3; i++) { await fire([{ type: "response.created" }, { type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(300 * i + 200);
    ok(await creates() === c0 + i, `empty reply ${i} was not asked for again`); }
  await fire([{ type: "error", error: { message: "Something broke upstream" } }]); await p.waitForTimeout(100);
  await fire([{ type: "response.created" }, { type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => __ws !== __ws0 && G.live), "after 3 more silent replies the app did not open a new voice line");
  const q = await p.evaluate(() => ACT.q.map(a => a.text).join(" | ") + " | " + __logs.map(l => JSON.stringify(l)).join(" "));
  ok(/empty reply, asked again \(1 of 3\)/.test(q) && /after 3 more asks/.test(q) && /Reconnecting \(1 of 3\)/.test(q) && /Grok error: Something broke upstream/.test(q), "the silent replies, the reconnect or the Grok error were not logged");
});
test("Ara: a dropped voice line reconnects and picks up where it left off; after 3 failed tries the phone says the voice service is unavailable", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await ara(p, "show_ask_plan_draft", { contact_name: "Ruth Abernathy" });
  await p.evaluate(() => recent(botName(), "Which entity is the ask for?"));
  await p.evaluate(() => { window.__ws0 = __ws; __ws.onclose({ code: 1006, reason: "" }); }); await p.waitForTimeout(1200);
  const back = await p.evaluate(() => ({ newLine: __ws !== __ws0, live: G.live, sorry: __sent.some(s => s.includes("Sorry, I lost you") && s.includes("Which entity is the ask for?")) }));
  ok(back.newLine && back.live && back.sorry, "the dropped line wasn't reopened with the last question and the open form");
  ok(await p.evaluate(() => !!document.getElementById("draftForm")), "the planned ask form closed when the line dropped");
  await p.evaluate(() => { window.speechSynthesis.speak = (u) => { window.__spoke = u.text; }; });
  await p.evaluate(() => { G.drops = 3; __ws.onclose({ code: 1006 }); }); await p.waitForTimeout(1500);
  const out = await p.evaluate(() => ({ live: G.live, spoke: window.__spoke || "", log: ACT.q.map(a => a.text).join(" | ") + __logs.map(l => JSON.stringify(l)).join(" ") }));
  ok(!out.live && /isn't answering/.test(out.spoke), "after the tries ran out the call didn't end with a spoken line");
  ok(/Voice line closed \(code 1006\)/.test(out.log) && /online/.test(out.log) && /unavailable after 3 tries/.test(out.log) && /Conversation ended \(voice service unavailable\)/.test(out.log), "the drop, the connection reading or the reason the call ended weren't logged");
});
test("Ara: a planned ask for an entity with a state campaign leaves the campaign blank so Ara asks for it", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  const r = await ara(p, "show_ask_plan_draft", { contact_name: "Ruth Abernathy", fund: "C.A. Pennsylvania C4" });
  ok(await p.inputValue("#f_campaign") === "", "the campaign was filled in without asking");
  ok((r.still_needed || r.missing || []).some(x => /Campaign/.test(x) && /National or Pennsylvania/.test(x)), "Ara wasn't told to ask National or Pennsylvania");
});

test("Ara: a slow reply gets a soft tick, a doubled reply is cut off, readings time a test request, and a voice pass stays ready during a call", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  const fire = (evs) => p.evaluate((evs) => evs.forEach(e => __ws.onmessage({ data: JSON.stringify(e) })), evs);
  await fire([{ type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(100);
  await p.evaluate(() => { window.__cues = []; const c = cue; window.cue = (k) => { __cues.push(k); }; });
  await p.evaluate(() => notice("Ask the officer the next question."));
  await p.waitForTimeout(4400);
  ok(await p.evaluate(() => __cues.includes("wait")), "no soft tick after 4 seconds without a reply");
  // the first ask comes back empty, the app asks again, then both answers arrive: the second is cut off
  await fire([{ type: "response.created" }, { type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(600);
  await fire([{ type: "response.created" }, { type: "response.output_audio.delta", delta: "AAAA" }, { type: "response.output_audio_transcript.delta", delta: "Just to be sure?" }, { type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(200);
  const n = await p.evaluate(() => __sent.length);
  await fire([{ type: "response.created" }, { type: "response.output_audio_transcript.delta", delta: "Just to be sure again?" }, { type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(300);
  const cut = await p.evaluate((n) => ({ cancel: __sent.slice(n).some(s => JSON.parse(s).type === "response.cancel"), said: ACT.q.concat(__logs.flatMap(l => l.events || [l])).map(a => a.text).join(" | ") }), n);
  ok(cut.cancel && !/Just to be sure again/.test(cut.said) && /second answer to the same ask/.test(cut.said), "the doubled reply wasn't cut off");
  await p.evaluate(() => netLog("Reading")); await p.waitForTimeout(300);
  ok(/test request \d+ ms/.test(await p.evaluate(() => ACT.q.concat(__logs.flatMap(l => l.events || [l])).map(a => a.text).join(" | "))), "the reading didn't time a test request");
  await p.evaluate(() => { TOK.p = null; TOK.at = 0; prefetchToken(); }); await p.waitForTimeout(200);
  ok(await p.evaluate(() => G.live && !!TOK.p), "no voice pass was kept ready during the call");
});
test("Ara: \"he handed me the check\" records the ask as Accepted, and a new ask's response starts blank", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  const st = await state(p); const o = st.opps.find(x => x.stage === "Ask Planning"); const c = st.contacts.find(x => x.id === o.contactId);
  const who = c.first + " " + c.last;
  await ara(p, "show_ask_result_draft", { contact_name: who });
  ok(await p.inputValue("#f_response") === "", "the response started as " + await p.inputValue("#f_response"));
  await p.evaluate(() => recent(botName(), "What was his response?"));
  await said(p, "He was enthusiastic and he, uh, handed me the check for one hundred thousand dollars.");
  await ara(p, "show_ask_result_draft", { contact_name: who, summary: "Enthusiastic." });
  ok(await p.inputValue("#f_response") === "Accepted", "a check handed over wasn't read as Accepted");
});
};
