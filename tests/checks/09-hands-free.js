// Checks: hands-free mode. tests/bot.js loads this file and passes in its helpers.
module.exports = ({ test, ok, fresh, signIn, state, tab, ara, said, titleOf, PAGE, fs, path }) => {

test("Hands-free: Ara saves only after a read-back and the officer's yes, money gets a second yes, and undo takes it back", async (p) => {
  await signIn(p);
  // off by default: Ara can't save
  await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send Ruth the board deck", due: "2026-11-30" });
  let r = await ara(p, "save_form", { confirmed: false });
  ok(r.ok === false && /Hands-free mode is off/.test(r.error), "save_form worked with hands-free off: " + JSON.stringify(r));
  // the officer turns it on by voice; the draft tool now points Ara at save_form
  await said(p, "I'm driving"); await p.waitForTimeout(900); // tool calls right after a voice command are ignored
  ok(await p.isVisible(".cb-hf.on"), "the call bar does not show Hands-free on");
  r = await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send Ruth the board deck", due: "2026-11-30" });
  ok(/call save_form/.test(r.status), "the finished draft does not tell Ara to save hands-free: " + r.status);
  ok(/HANDS-FREE MODE IS ON/.test(await p.evaluate(() => __sent.join(" "))), "Ara's instructions do not mention hands-free");
  // confirmed true without a read-back is just a read-back
  r = await ara(p, "save_form", { confirmed: true });
  ok(r.saved === false && /Shall I save it\?$/.test(r.read_back) && /Send Ruth the board deck/.test(r.read_back) && !/Not saved|call save_form/.test(r.read_back), "no clean read-back: " + JSON.stringify(r));
  ok(await p.isVisible("text=Say “yes” to save"), "the screen does not say it's waiting for a yes");
  // a "no" does not save
  await said(p, "No, change the date.");
  r = await ara(p, "save_form", { confirmed: true });
  ok(r.saved === false && /isn't a clear yes/.test(r.error), "saved after a no: " + JSON.stringify(r));
  // after a no, a plain yes saves without another read-back; "don't" elsewhere in a yes still counts (from a real call)
  ok(await p.evaluate(() => { const hfYes = window.__demo.hfYes; return [hfYes("Yeah, I don't think you needed to say that last part, but yes, I do want to save."), hfYes("Save it."), !hfYes("No, change the date."), !hfYes("Don't save it yet"), !hfYes("Wait")].every(Boolean); }), "yes/no reading is wrong");
  ok(!(await state(p)).tasks.some(t => t.text === "Send Ruth the board deck"), "the task was saved after a no");
  // read back again, then yes saves it
  await said(p, "Yeah, I don't think you needed to say that, but yes, save it.");
  r = await ara(p, "save_form", { confirmed: true });
  ok(r.saved === true && /undo/.test(r.say), "not saved after yes: " + JSON.stringify(r));
  let st = await state(p);
  ok(st.tasks.some(t => t.text === "Send Ruth the board deck"), "task missing after the hands-free save");
  ok(st.history[0].hf === true, "History does not mark the save hands-free");
  // undo takes back the save
  await said(p, "Undo"); await p.waitForTimeout(900);
  ok(!(await state(p)).tasks.some(t => t.text === "Send Ruth the board deck"), "undo did not take back the hands-free save");
  // a gift needs a second yes on the amount
  const who = await p.evaluate(() => { const S = window.__demo.state, o = S.opps.find(o => o.stage !== "Closed"); o.stage = "Commitment"; o.pledge = { amount: 1000, fund: "Citizens Alliance C3", status: "Current", confirmedBy: "Email", payments: [] }; const c = S.contacts.find(c => c.id === o.contactId); return c.first + " " + c.last; });
  await ara(p, "show_gift_draft", { contact_name: who, amount: 1000, date: "2026-10-22", method: "Check" });
  await ara(p, "save_form", { confirmed: false }); await said(p, "Yes.");
  r = await ara(p, "save_form", { confirmed: true });
  ok(r.saved === false && /the amount is \$1,000/.test(r.read_back), "no second check of the amount: " + JSON.stringify(r));
  r = await ara(p, "save_form", { confirmed: true }, 2900); // the app waits a moment for the officer's words
  ok(r.saved === false && /hasn't answered/.test(r.error), "saved without a second yes: " + JSON.stringify(r));
  await said(p, "Yep, that's right.");
  r = await ara(p, "save_form", { confirmed: true });
  ok(r.saved === true, "gift not saved after the second yes: " + JSON.stringify(r));
  // Needs attention asks the officer to check the hands-free save
  await said(p, "I've parked"); await p.waitForTimeout(300);
  ok(await p.isVisible(".cb-hf:not(.on)"), "hands-free did not turn off");
  await p.tap(".cb-end"); await p.waitForTimeout(300); await tab(p, "Home");
  ok(await p.isVisible("text=Check 1 hands-free save"), "Needs attention does not list the hands-free save");
  await p.tap("[data-act2=hfcheck]"); await p.waitForTimeout(300);
  ok(await p.isVisible("text=Check your hands-free saves"), "the check list did not open");
  // each save links to where it can be corrected
  const fixes = await p.evaluate(() => [...document.querySelectorAll(".hf-fix")].map(b => b.textContent.trim()));
  ok(fixes.length >= 1 && fixes.every(t => /Open the opportunity: \S/.test(t)), "the gift has no link to its opportunity: " + JSON.stringify(fixes));
  await p.tap(".hf-fix"); await p.waitForTimeout(300);
  ok(await p.evaluate(() => S.screen === "opp" && !document.querySelector("#modal .wmodal")), "the link did not open the opportunity");
  const kinds = await p.evaluate(() => { const c = S.contacts[0], i = S.interactions.find(i => i.contactId === c.id && i.kind !== "ask");
    return [hfFix({ contactId: c.id, text: "Contact added by X" }), i && hfFix({ contactId: c.id, text: `Interaction report: ${i.type}, ${fmtDate(i.date)}` })].map(f => f && f.form); });
  ok(kinds[0] === "editContact" && (kinds[1] === undefined || kinds[1] === "editInteraction"), "contact or report saves do not open their edit form: " + JSON.stringify(kinds));
  // Back from the record, and closing a fix form, return to the check list
  await p.tap("header .back"); await p.waitForTimeout(300);
  ok(await p.evaluate(() => S.screen === "home" && !!document.querySelector("#modal .wmodal")), "Back from the opportunity did not return to the check list");
  await p.evaluate(() => { S.history.unshift({ at: new Date().toISOString(), text: "Contact added by Test", contactId: S.contacts[0].id, hf: true }); hfCheckModal(); });
  ok(await p.evaluate(() => { const c = S.contacts[0]; return [...document.querySelectorAll(".hf-fix")].some(b => b.textContent.includes(`Edit ${c.first} ${c.last}'s contact`)); }), "the fix link does not name the contact");
  ok(await p.evaluate(() => { const c = S.contacts[0]; return document.querySelector(".hf-list .row .t").textContent.startsWith(`${c.first} ${c.last} added as a contact by Test`); }), "the save's first line does not start with the contact's name");
  await p.tap(".hf-fix >> text=contact"); await p.waitForTimeout(300);
  ok(await p.isVisible("#overlay .sheet"), "Edit the contact did not open the form");
  await p.tap("#overlay [data-act=close]"); await p.waitForTimeout(300);
  ok(await p.isVisible("text=Check your hands-free saves"), "closing the fix form did not return to the check list");
  await p.tap("#hfOk"); await p.waitForTimeout(300);
  ok(!(await p.isVisible("text=Check 1 hands-free save")), "the check did not clear");
});

};
