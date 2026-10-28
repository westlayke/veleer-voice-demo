// Checks: opportunities: stages, next steps, money, Needs attention and lists. tests/bot.js loads this file and passes in its helpers.
module.exports = ({ test, ok, fresh, signIn, state, tab, ara, said, titleOf, PAGE, fs, path }) => {

test("A save is acknowledged by Ara and listed for her, and a gift on a pledge sets off confetti and balloons", async (p) => {
  await signIn(p);
  const who = await p.evaluate(() => { const S = window.__demo.state, o = S.opps.find(o => o.stage !== "Closed"); o.stage = "Commitment"; o.pledge = { amount: 1000, fund: "Citizens Alliance C3", status: "Current", confirmedBy: "Email", payments: [] }; const c = S.contacts.find(c => c.id === o.contactId); return c.first + " " + c.last; });
  const gone = await ara(p, "show_payment_draft", { contact_name: who, amount: 1000, date: "2026-10-22", method: "Check" });
  ok(gone && gone.ok === false, "Ara still has a separate payment tool");
  await ara(p, "show_gift_draft", { contact_name: who, amount: 1000, date: "2026-10-22", method: "Check", fund: "Citizens Alliance C3" });
  ok(/applied to the (pledge|commitment)/.test(await p.evaluate(() => document.body.innerText)), "Record gift in Commitment does not say it is applied to the pledge");
  const n = await p.evaluate(() => __sent.length);
  await p.tap("[data-act=save]"); await p.waitForTimeout(500);
  ok(await p.isVisible(".party .bl"), "no balloons after recording the payment");
  ok(await p.isVisible(".party .cf"), "no confetti after recording the payment");
  const sent = await p.evaluate((n) => __sent.slice(n).join(" "), n);
  ok(/out loud that you saw the save/.test(sent) && /Gift recorded/.test(sent), "Ara was not told to acknowledge the save");
  ok(/Saved so far in this conversation: Gift recorded/.test(sent), "the save is not listed in Ara's instructions");
  await p.waitForTimeout(6800);
  ok(!(await p.isVisible(".party")), "the celebration did not clear away");
});
test("Recording an outright gift by tapping also sets off confetti and balloons", async (p) => {
  await signIn(p); await tab(p, "Contacts"); await p.tap("text=Ito, Ken"); await p.waitForTimeout(300);
  await p.tap("header.top .addbtn"); await p.waitForTimeout(250); await p.tap("[data-qa=gift]"); await p.waitForTimeout(300);
  for (const sel of await p.$$("#draftForm select")) { if (!(await sel.inputValue())) { const v = await sel.evaluate(s => [...s.options].map(o => o.value).find(Boolean)); if (v) await sel.selectOption(v); } }
  await p.tap("[data-act=save]"); await p.waitForTimeout(500);
  ok((await state(p)).opps.some(o => o.name === "Ito, Ken - 2026" && o.closed === "Won"), "the gift did not close Ken's opportunity as Closed Won");
  ok(await p.isVisible(".party .bl") && await p.isVisible(".party .cf"), "no confetti and balloons after recording a gift by tapping");
  // a gift with no pledge is an implied commitment: it passes through Commitment and the screen says so
  const o = (await state(p)).opps.find(o => o.name === "Ito, Ken - 2026");
  ok(o.pledge && o.pledge.implied && o.pledge.status === "Paid in full", "the gift did not record an implied commitment");
  const hist = (await state(p)).history.filter(h => h.oppId === o.id).map(h => h.text).join(" | ");
  ok(/Implied commitment of/.test(hist) && /Closed Won/.test(hist), "History does not show the implied commitment: " + hist);
  const body = await p.evaluate(() => document.body.innerText);
  ok(/Implied commitment/.test(body) && /Committed/.test(body), "the opportunity does not show the implied commitment");
});
test("A yes to an outright ask moves the opportunity to Commitment; a yes to a pledge ask waits for Record pledge", async (p) => {
  await signIn(p);
  const [who, other] = await p.evaluate(() => { const S = window.__demo.state, open = S.opps.filter(o => o.stage !== "Closed").slice(0, 2);
    open.forEach((o, i) => { o.stage = "Ask Made"; o.asks = [{ fund: "Citizens Alliance C3", campaign: "National", amount: 5000, askType: i ? "Pledge" : "Outright", status: "Made", plannedDate: "2026-10-01", askedOn: "2026-10-01" }]; delete o.pledge; });
    return open.map(o => { const c = S.contacts.find(c => c.id === o.contactId); return c.first + " " + c.last; }); });
  for (const name of [who, other]) {
    await ara(p, "show_ask_result_draft", { contact_name: name, date: "2026-10-23", meetingType: "Phone call", amount: 5000, fund: "Citizens Alliance C3", response: "Accepted", summary: "Said yes on the call.", nextStep: "Thank them", nextDue: "2026-10-30" });
    for (let i = 0; i < 3 && !(await p.isVisible("[data-act=save]")); i++) await p.waitForTimeout(200);
    await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  }
  const st = await state(p), oid = (n) => st.opps.find(o => o.stage !== "Closed" && st.contacts.find(c => c.id === o.contactId && c.first + " " + c.last === n));
  const o1 = oid(who), o2 = oid(other);
  ok(o1 && o1.stage === "Commitment" && o1.pledge && o1.pledge.outright, "an accepted outright ask did not move to Commitment: " + (o1 && o1.stage));
  ok(o2 && o2.stage === "Ask Made" && !o2.pledge, "an accepted pledge ask did not stay in Ask Made for Record pledge: " + (o2 && o2.stage));
  ok(st.tasks.some(k => k.oppId === o1.id && /^Follow up on agreed gift/.test(k.text)), "no Follow up on agreed gift task");
  const body = await p.evaluate(() => document.body.innerText);
  ok(/Agreed, gift to follow/.test(body) || /Commitment/.test(body), "the opportunity does not show the agreed gift");
  await ara(p, "show_gift_draft", { contact_name: who, amount: 5000, date: "2026-10-24", method: "Check" });
  await p.tap("[data-act=save]"); await p.waitForTimeout(500);
  const o3 = (await state(p)).opps.find(o => o.id === o1.id);
  ok(o3.stage === "Closed" && o3.closed === "Won" && (await state(p)).tasks.filter(k => k.oppId === o1.id && /^Follow up on agreed gift/.test(k.text)).every(k => k.done), "Record gift did not close the agreed outright gift as Closed Won");
});
test("Home: Needs attention has filter chips and urgency groups; the overview panel is last", async (p) => {
  await signIn(p); await tab(p, "Home");
  const chips = await p.$$eval(".na-chips button", bs => bs.map(b => b.textContent.trim()));
  ok(["All", "Overdue", "Opportunities", "Tasks", "Contacts"].every((k, i) => chips[i] && chips[i].startsWith(k)), "Needs attention chips missing: " + chips.join(" | "));
  ok(await p.evaluate(() => { const ps = [...document.querySelectorAll("main > section.panel")]; return /From first contact to Closed Won/.test(ps[ps.length - 1].textContent); }), "the overview panel is not last on Home");
  await p.tap(".na-chips button >> text=Tasks"); await p.waitForTimeout(250);
  ok(await p.evaluate(() => [...document.querySelectorAll(".na-chips ~ .row")].every(r => r.dataset.go === "tasks" || r.dataset.form === "response")), "the Tasks chip shows more than tasks"); // a Check on the answer task links to the response form (Oct 28)
  ok((await state(p)).naFilter === "tasks", "the chip choice is not remembered");
  const r = await ara(p, "show_needs_attention", { filter: "overdue" });
  ok(r.ok && r.filter === "Overdue" && (await state(p)).naFilter === "overdue", "Ara cannot filter Needs attention");
});
test("Ask Made shows Record gift beside Record pledge, and Record gift in Commitment applies to the pledge", async (p) => {
  await signIn(p);
  const name = await p.evaluate(() => { const S = window.__demo.state, o = S.opps.find(o => o.stage === "Ask Made" && (o.asks[0] || {}).askType !== "Outright"); const c = o && S.contacts.find(c => c.id === o.contactId); return o && c.first + " " + c.last; });
  ok(name, "no Ask Made pledge opportunity in the seed");
  await tab(p, "Opportunities"); await p.tap(`text=${name}`); await p.waitForTimeout(300);
  ok(await p.locator("button.btn.blue[data-form=response] >> text=Record the response").count() && await p.locator("button.btn.out[data-form=gift] >> text=Record gift").count(), "Ask Made awaiting its answer is missing Record the response (Oct 28) or the Record gift button");
  await p.evaluate((name) => { const S = window.__demo.state, c = S.contacts.find(c => c.first + " " + c.last === name), o = S.opps.find(o => o.contactId === c.id && o.stage !== "Closed"); o.stage = "Commitment"; o.pledge = { amount: 3000, fund: "Citizens Alliance C3", confirmedBy: "Email", installments: 3, frequency: "Annual", firstAmount: 1000, firstDue: "2026-12-01" }; }, name);
  await tab(p, "Home"); await tab(p, "Opportunities"); await p.tap(`text=${name}`); await p.waitForTimeout(300);
  ok(await p.locator("button.btn.blue >> text=Record gift").count(), "Commitment's button is not Record gift");
  await p.tap("button.btn.blue >> text=Record gift"); await p.waitForTimeout(300);
  ok(await p.inputValue("#f_amount").then(v => /1,?000/.test(v)), "Record gift in Commitment did not fill in the scheduled first gift");
  ok(/applied to the (pledge|commitment)/.test(await p.evaluate(() => document.body.innerText)), "the form does not say the gift is applied to the pledge");
});
test("Planning an ask: the entity set on the opportunity is on the form, and Ara is told not to ask for it", async (p) => {
  await signIn(p);
  await ara(p, "show_contact_draft", { first: "Lee", last: "Park", email: "lee@example.org", capacity: "B" });
  await said(p, "B."); await ara(p, "show_contact_draft", { first: "Lee", last: "Park", email: "lee@example.org", capacity: "B" });
  for (let i = 0; i < 3 && !(await p.isVisible("[data-act=save]")); i++) await p.waitForTimeout(200);
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  await said(p, "Create an opportunity for Lee.");
  await ara(p, "show_opportunity_draft", { contact_name: "Lee Park" });
  await p.selectOption("#f_fund", "C.A. North Dakota C4"); await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  await p.evaluate(() => { window.__demo.state.opps.find(o => o.name.startsWith("Park")).stage = "Cultivation"; });
  await said(p, "Plan an ask for Lee.");
  const r = await ara(p, "show_ask_plan_draft", { contact_name: "Lee Park" });
  ok((await p.inputValue("#f_fund")) === "C.A. North Dakota C4", "the planned ask form did not take the opportunity's entity");
  ok(/Already on the form[^.]*Entity: C\.A\. North Dakota C4/.test(r.status) && /Never ask for these again/.test(r.status), "Ara was not told the entity is already set: " + JSON.stringify(r));
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
  ok(await p.isVisible("text=To create an opportunity"), "the record has no To create an opportunity panel");
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
test("Opportunity: Next step panel on the record and a Next: line in the list", async (p) => {
  await signIn(p); await tab(p, "Opportunities");
  ok(await p.isVisible(".row:has-text('Ken Ito') .nextline"), "the list has no Next: line for Ken");
  ok(/record Ken's answer/.test(await p.textContent(".row:has-text('Ken Ito') .nextline")), "Ken's Next: line is wrong");
  await p.tap(".row:has-text('James Okafor')"); await p.waitForTimeout(400);
  ok(await p.isVisible(".nextp") && /To reach Cultivation/.test(await p.textContent(".nextp .ph")), "James's record has no Next step panel to Cultivation");
  ok(await p.locator(".nextp li").count() === 3, "Qualification should list three steps");
  const btns = await p.evaluate(() => [...document.querySelectorAll(".nextblk button")].map(b => b.textContent.trim()));
  ok(btns.length === 1 && /Move to Cultivation/.test(btns[0]), "a ready opportunity should offer one next step, Move to Cultivation: " + JSON.stringify(btns));
});
test("Guided flow: one Next block on each record (stepper, Next: line, blue button), the save shown in it, and checklists that explain", async (p) => {
  await signIn(p); await tab(p, "Opportunities");
  await p.tap(".row:has-text('James Okafor')"); await p.waitForTimeout(400);
  ok(await p.locator(".track div").count() === 7 && /Qualif/.test(await p.textContent(".track div.on")), "the stepper does not mark Qualification as the current stage");
  ok(/^Next: /.test(await p.textContent(".nextblk .stepnext")) && await p.locator("main >> text=/^Next/").count() === 1, "the record should say Next once, in its Next block");
  await ara(p, "show_ask_plan_draft", { contact_name: "Ruth Abernathy", fund: "Citizens Alliance C3", campaign: "National", plannedDate: "2026-12-01", amount: 50000 });
  await p.tap("[data-act=save]"); await p.waitForTimeout(500);
  ok(/Planned ask saved/.test(await p.textContent(".nextblk .justsaved")) && /Next: record the ask/.test(await p.textContent(".nextblk .stepnext")), "the Next block does not show the save and the next step");
  ok(/Record the ask/.test(await p.textContent(".nextblk")) && /To reach Ask Made/.test(await p.textContent(".nextp .ph")), "the Next block has no Record the ask button, or the checklist is not titled To reach Ask Made");
  ok(!(await p.$(".whatnext")), "the old What's next card is still there");
  await p.tap(".nextblk .btn.blue"); await p.waitForTimeout(400);
  ok(/the ask/.test(await p.textContent("#overlay")), "the Next block's button did not open the Record the ask form");
  await p.tap("[data-act=close]"); await p.waitForTimeout(300);
  await ara(p, "show_contact_draft", { first: "Lee", last: "Park", email: "lee.park@example.org" });
  await p.tap("[data-act=save]"); await p.waitForTimeout(500);
  ok(/Contact saved/.test(await p.textContent(".nextblk .justsaved")) && /Next: set a capacity rating for Lee/.test(await p.textContent(".nextblk .stepnext")) && /Contact/.test(await p.textContent(".track div.on")), "the new contact's Next block is wrong");
  ok(/Set capacity rating/.test(await p.textContent(".nextblk .btn.blue")) && /To create an opportunity/.test(await p.textContent("main")), "the contact's blue button is not the next step, or the checklist is not renamed");
  await p.tap(".nextblk .btn.blue"); await p.waitForTimeout(250); await p.tap("[data-rt=C]"); await p.waitForTimeout(400);
  ok(/Capacity rated C/.test(await p.textContent(".nextblk .justsaved")) && /Create opportunity/.test(await p.textContent(".nextblk .btn.blue")), "after the rating the Next block does not offer Create opportunity");
  await tab(p, "Home"); await tab(p, "Contacts"); await p.tap("text=Park, Lee"); await p.waitForTimeout(300);
  ok(!(await p.$(".justsaved")), "the saved line stayed after leaving the record");
});
test("Opportunities and Tasks have search and filter chips like Contacts, and Ara can open a view", async (p) => {
  await signIn(p);
  await tab(p, "Opportunities");
  ok(await p.isVisible("#oSearch"), "Opportunities has no search box");
  for (const c of ["Open", "Needs attention", "Asks this quarter", "Pledges to record", "Closed this year"]) ok(await p.isVisible(`.cfilt button:has-text("${c}")`), "missing chip " + c);
  const openN = await p.evaluate(() => window.__demo.state.opps.filter(o => o.stage !== "Closed").length);
  ok((await p.$$("main [data-opp]")).length === openN, "Open view doesn't list every open opportunity");
  await p.fill("#oSearch", "ruth"); await p.waitForTimeout(150);
  const vis = await p.$$eval("main [data-opp]", rs => rs.filter(r => r.style.display !== "none").map(r => r.textContent));
  ok(vis.length === 1 && /Ruth/.test(vis[0]), "search didn't narrow to Ruth: " + vis.length);
  await p.tap('.cfilt button:has-text("Pledges to record")'); await p.waitForTimeout(250);
  const want = await p.evaluate(() => window.__demo.state.opps.filter(o => o.stage === "Ask Made" && o.asks && o.asks[0] && (o.asks[0].status === "Accepted" || /Agreed/.test(o.asks[0].status))).length);
  ok((await p.$$("main [data-opp]")).length === want, "Pledges to record shows the wrong opportunities");
  await p.tap('.seg button:has-text("Board")'); await p.waitForTimeout(250);
  ok((await p.$$("main .card[data-opp]")).length === want, "Board doesn't follow the chip");
  // Tasks
  await tab(p, "Tasks");
  ok(await p.isVisible("#tSearch"), "Tasks has no search box");
  for (const c of ["Open", "Overdue", "This week", "Waiting", "Done"]) ok(await p.isVisible(`.cfilt button:has-text("${c}")`), "missing task chip " + c);
  ok(!(await p.isVisible(".ph h2:has-text('Done')")), "the separate Done panel is still there");
  await p.tap('.cfilt button:has-text("Overdue")'); await p.waitForTimeout(250);
  const od = await p.evaluate(() => window.__demo.state.tasks.filter(t => !t.done && t.due && t.due < new Date().toISOString().slice(0, 10)).length);
  ok((await p.$$("main .trow")).length === od, "Overdue shows the wrong tasks");
  // Ara opens a view
  const r = await ara(p, "show_list", { list: "tasks", view: "done" });
  ok(r.ok && /Done/.test(r.showing), "show_list failed: " + JSON.stringify(r));
  ok((await state(p)).tFilter === "done" && await p.isVisible(".cfilt button.on:has-text('Done')"), "Ara didn't open the Done view");
});

test("Ken's last gift gives its year once, and a defer reason ending in a full stop isn't doubled in History", async (p) => {
  await signIn(p);
  const r = await ara(p, "get_giving", { contact_name: "Ken Ito" });
  ok(/^\$12,000 on Oct 2, 2025 to /.test(r.last_gift), "the last gift's date is wrong: " + r.last_gift);
  await tab(p, "Opportunities"); await p.tap(".row:has-text('James Okafor')"); await p.waitForTimeout(400);
  await p.tap(".nextblk button:has-text('Move to Cultivation')"); await p.waitForTimeout(400);
  await p.selectOption("#f_decision", "Defer"); await p.fill("#f_reason", "Wait for his board meeting."); await p.fill("#f_reconsiderOn", "2026-11-07");
  await p.tap("[data-act=save]"); await p.waitForTimeout(500);
  const h = (await state(p)).history.map(x => x.text).find(t => /deferred/.test(t));
  ok(h && /board meeting\. Reconsider on/.test(h) && !/\.\./.test(h), "the defer reason is wrong in History: " + h);
});

test("Oct 28 ask follow-up: an awaiting ask creates the 14-day check task, its text links to the response field, the answer or a gift marks it done", async (p) => {
  await signIn(p);
  // two open opportunities with a planned ask; the ask is recorded with the answer still to come
  const [who, other] = await p.evaluate(() => { const S = window.__demo.state, open = S.opps.filter(o => o.stage !== "Closed").slice(0, 2);
    open.forEach((o, i) => { o.stage = "Ask Planning"; o.asks = [{ fund: "Citizens Alliance C3", campaign: "National", amount: 5000, askType: i ? "Pledge" : "Outright", status: "Planned", plannedDate: "2026-10-20" }]; delete o.pledge; });
    S.tasks = S.tasks.filter(t => !open.some(o => o.id === t.oppId)); return open.map(o => { const c = S.contacts.find(c => c.id === o.contactId); return c.first + " " + c.last; }); });
  for (const name of [who, other]) {
    const r = await ara(p, "show_ask_result_draft", { contact_name: name, date: "2026-10-21", meetingType: "Phone call", response: "Awaiting", summary: "Made the ask on the call; they'll think it over.", nextStep: "Send the proposal", nextDue: "2026-10-25" });
    ok(/Awaiting/.test(await p.inputValue("#f_response")), "the ask draft didn't take Awaiting: " + JSON.stringify(r));
    await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  }
  let st = await state(p); const oid = (n) => st.opps.find(o => o.stage !== "Closed" && st.contacts.find(c => c.id === o.contactId && c.first + " " + c.last === n));
  // the officer's next step on an awaiting ask is the follow-up task itself (one task, linked to Record the response); with no next step the app adds "Check on the answer" 14 days on
  const o1 = oid(who), o2 = oid(other), check = (o) => st.tasks.find(k => k.oppId === o.id && k.askCheck && k.text === "Send the proposal");
  ok(o1.stage === "Ask Made" && o1.asks[0].status === "Made" && check(o1) && !check(o1).done && check(o1).due === "2026-10-25" && !st.tasks.some(k => k.oppId === o1.id && /^Check on the answer/.test(k.text)), "an awaiting ask's next step isn't its one follow-up task: " + JSON.stringify(st.tasks.filter(k => k.oppId === o1.id)));
  ok(/Task added: Send the proposal by Oct 25 \(the follow-up on this ask\)/.test((await p.evaluate(() => document.body.innerText))), "History doesn't state the task was added");
  const auto = await p.evaluate(() => { const S = window.__demo.state, o = S.opps.find(x => x.stage === "Ask Made"), c = S.contacts.find(x => x.id === o.contactId), a = latestAsk(o); const keep = S.tasks; S.tasks = S.tasks.filter(k => k.oppId !== o.id); const out = askOutcome(o, c, a, { response: "Awaiting", date: "2026-10-21" }, "Ask recorded") + " | " + JSON.stringify(S.tasks.filter(k => k.oppId === o.id && /^Check on the answer/.test(k.text)).map(k => [k.text, k.due])); S.tasks = keep; return out; });
  ok(/A task to check on \w+'s answer by Nov 4 was added\. \| \[\["Check on the answer to the \$5,000 ask","2026-11-04"\]\]/.test(auto), "without a next step the app didn't add the 14-day check task: " + auto);
  // Tasks list: the task's text is a link that opens the opportunity with Record the response over it, Response focused
  await tab(p, "Tasks"); await p.waitForTimeout(300);
  const link = p.locator(`.trow[data-tid="${check(o1).id}"] .fchip[data-form=response]`);
  ok(await p.locator(`.trow[data-tid="${check(o1).id}"] .ttext .ftext[data-form=response]`).count() === 1 && /Response: Awaiting/.test(await link.evaluate(e => e.textContent)), "the check task's text isn't tappable or the field chip doesn't show Response: Awaiting");
  ok(await link.count() === 1, "the check task's text isn't a link to the response form");
  await link.first().tap(); await p.waitForTimeout(500);
  // cancel takes the officer back to the Tasks list they came from (Oct 28); then open it again for the rest of the check
  await p.tap("#overlay [data-act=close]"); await p.waitForTimeout(400);
  ok(await p.evaluate(() => S.screen === "tasks" && !V), "cancelling the form opened from a task didn't return to the Tasks list");
  await link.first().tap(); await p.waitForTimeout(500);
  ok(await p.evaluate(() => S.screen === "opp") && (await state(p)).sel.opp === o1.id, "the task link didn't land on the opportunity");
  ok(await p.evaluate(() => /Record the response/.test(document.getElementById("overlay").textContent)), "the Record the response form isn't open");
  ok(await p.evaluate(() => document.activeElement && document.activeElement.id === "f_response"), "the Response field isn't focused: " + (await p.evaluate(() => document.activeElement && document.activeElement.id)));
  ok(await p.evaluate(() => V && V.action === "response" && V.data.date === new Date().toISOString().slice(0, 10)), "the date heard doesn't default to today");
  // Accepted (outright): Commitment, the agreed-gift follow-up, and the check task done
  await p.selectOption("#f_response", "Accepted"); await p.tap("[data-act=save]"); await p.waitForTimeout(500);
  st = await state(p); const o1b = st.opps.find(o => o.id === o1.id);
  ok(o1b.stage === "Commitment" && o1b.pledge && o1b.pledge.outright && o1b.asks[0].status === "Accepted", "an accepted outright response didn't move the opportunity to Commitment: " + o1b.stage);
  ok(st.tasks.find(k => k.id === check(o1).id).done && st.tasks.some(k => k.oppId === o1.id && /^Follow up on agreed gift/.test(k.text)), "the check task wasn't marked done, or no agreed-gift follow-up was added");
  ok(/Response recorded: Accepted/.test(await p.evaluate(() => document.body.innerText)), "History doesn't show the response");
  // the opportunity record: Asks panel row has the Record the response button while awaiting, the stage button too, both gone once answered
  await tab(p, "Opportunities"); await p.tap(`text=${other}`); await p.waitForTimeout(300);
  ok(await p.locator(".rowedit[data-form=response]").count() === 1 && await p.locator("button.btn.blue[data-form=response]").count() === 1, "the awaiting opportunity lacks the Record the response buttons");
  ok(await p.locator("button.btn.out[data-form=gift]").count() === 1, "Record gift isn't beside it");
  // a gift that arrives while the ask is out answers it: Closed Won and the check task done
  await ara(p, "show_gift_draft", { contact_name: other, amount: 5000, date: "2026-10-24", method: "Check" });
  await p.tap("[data-act=save]"); await p.waitForTimeout(500);
  st = await state(p); const o2b = st.opps.find(o => o.id === o2.id);
  ok(o2b.stage === "Closed" && o2b.closed === "Won" && st.tasks.find(k => k.id === check(o2).id).done, "a gift while awaiting didn't close the opportunity and the check task");
  // Needs attention: a check task due this week links to the response form too (not just the Tasks list)
  const nm = await p.evaluate(([a, b]) => { const S = window.__demo.state, o = S.opps.find(o => o.stage !== "Closed" && o.id !== a && o.id !== b) || null; if (!o) return null; // a third opportunity, set up as an ask out for a while
    o.stage = "Ask Made"; o.asks = [{ fund: "Citizens Alliance C3", campaign: "National", amount: 12000, askType: "Pledge", status: "Made", plannedDate: "2026-09-28", askedOn: "2026-09-28" }]; delete o.pledge;
    S.tasks = S.tasks.filter(k => k.oppId !== o.id); S.tasks.unshift({ id: uid(), contactId: o.contactId, oppId: o.id, text: "Check on the answer to the $12,000 ask", due: new Date().toISOString().slice(0, 10), done: false, auto: true });
    save(); S.screen = "home"; render(); return o.name; }, [o1.id, o2.id]);
  ok(nm && await p.locator(`.row.tap[data-form=response][data-cid]`).count() >= 1, "Needs attention doesn't link the check task to the response form (seed opportunity: " + nm + ")");
  // the voice tool: Countered creates the follow-on ask and marks the check task done
  const seed = await p.evaluate(() => { const S = window.__demo.state, o = S.opps.find(o => o.stage !== "Closed" && o.asks && o.asks[0] && o.asks[0].status === "Made"); const c = S.contacts.find(c => c.id === o.contactId); return { name: c.first + " " + c.last, oid: o.id }; });
  await said(p, `${seed.name} got back to me, they countered at twenty thousand.`);
  const r = await ara(p, "show_ask_response_draft", { contact_name: seed.name, response: "Countered", agreedAmount: 20000, date: "2026-10-28" });
  ok(r.ok !== false && await p.evaluate(() => V && V.action === "response" && V.data.response === "Countered"), "the voice response draft didn't open: " + JSON.stringify(r));
  await p.tap("[data-act=save]"); await p.waitForTimeout(500);
  st = await state(p); const o3 = st.opps.find(o => o.id === seed.oid);
  ok(o3.stage === "Ask Made" && o3.asks[0].status === "Agreed, pledge to follow" && o3.asks[0].amount === 20000 && o3.asks[1].status === "Countered" && st.tasks.filter(k => k.oppId === o3.id && /^Check on the answer/.test(k.text)).every(k => k.done), "a countered response didn't create the follow-on ask and settle the check task: " + JSON.stringify(o3.asks));
  // a phone with an older ask still awaiting gets the task from the data upgrade, and the example task takes the standard wording
  const mig = await p.evaluate(() => { const st = { opps: [{ id: "o1", contactId: "c1", stage: "Ask Made", asks: [{ amount: 30000, status: "Made", askedOn: "2026-09-30" }] }, { id: "o2", contactId: "c2", stage: "Ask Made", asks: [{ amount: 8000, status: "Made", askedOn: "2026-10-10" }] }], tasks: [{ id: "t1", oppId: "o1", contactId: "c1", text: "Follow up on Ken's pledge decision", due: "2026-10-24", done: false }], contacts: [] };
    MIGRATIONS[6](st); return st.tasks.map(t => [t.oppId, t.text, t.due]); });
  ok(mig.length === 2 && mig[0][1] === "Check on the answer to the $8,000 ask" && mig[0][2] === "2026-10-24" && mig[1][1] === "Check on the answer to the $30,000 ask" && mig[1][2] === "2026-10-24", "the data upgrade didn't add or rename the check tasks: " + JSON.stringify(mig));
});
};
