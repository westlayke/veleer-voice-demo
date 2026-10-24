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


test("Hands-free: a drop right after a save tells Ara it went through, and saving again just says it's saved", async (p) => {
  await signIn(p);
  await said(p, "I'm driving"); await p.waitForTimeout(900);
  await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send Ruth the agenda", due: "2026-11-30" });
  await ara(p, "save_form", { confirmed: false });
  await said(p, "Yes."); const r = await ara(p, "save_form", { confirmed: true });
  ok(r.saved === true, "not saved: " + JSON.stringify(r));
  await p.evaluate(() => { window.__ws0 = __ws; __ws.onclose({ code: 1006 }); }); await p.waitForTimeout(1500);
  const line = await p.evaluate(() => __sent.filter(s => s.includes("Sorry, I lost you")).pop() || "");
  ok(/went through just before the drop/.test(line) && /Send Ruth the agenda|Task added/.test(line), "the reconnect didn't say the last save went through");
  const again = await ara(p, "save_form", { confirmed: true });
  ok(again.saved === true && again.already && /already saved/.test(again.status), "saving again after the drop didn't say it was already saved: " + JSON.stringify(again));
});
test("Hands-free: a line that stalls without closing (officer talking, nothing heard back) is reconnected instead of hung up", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await p.evaluate(() => { const f = window.fetch; window.fetch = (u, o) => /ping=/.test(String(u)) ? new Promise((res, rej) => { if (o && o.signal) o.signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))); }) : f(u, o); });
  await p.evaluate(() => { window.__ws0 = __ws; G.lastMsg = Date.now() - 7000; G.speechSince = Date.now() - 6000; G.loudAt = Date.now(); });
  await p.waitForTimeout(5500);
  const out = await p.evaluate(() => ({ newLine: __ws !== __ws0, live: G.live, log: ACT.q.concat(__logs.flatMap(l => l.events || [l])).map(a => a.text).join(" | "), heard: __sent.some(s => s.includes("may have answered while the line was down") || s.includes("talking while the line was down")) }));
  ok(out.live && out.newLine && /Line stalled \(officer talking/.test(out.log) && out.heard, "the stalled line wasn't reconnected: " + JSON.stringify({ newLine: out.newLine, live: out.live, heard: out.heard }));
});

test("Hands-free: a new opportunity always asks the campaign when the entity has two, a slow test on a live line doesn't reconnect, and a late answer calls off the quiet hang-up", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await said(p, "I'm driving"); await p.waitForTimeout(900);
  ok(await p.evaluate(() => idleMs() === 30000), "hands-free doesn't wait 30 seconds before the quiet hang-up");
  await p.evaluate(() => { const c = S.contacts.find(x => x.first === "James"); S.opps = S.opps.filter(o => o.contactId !== c.id); c.capacity = c.capacity || "C"; save(); });
  const r = await ara(p, "show_opportunity_draft", { contact_name: "James Okafor", fund: "C.A. Idaho C4" });
  ok((r.still_needed || []).some(x => /Campaign of interest/.test(x) && /National or Idaho/.test(x)), "the campaign wasn't asked for: " + JSON.stringify(r));
  const s1 = await ara(p, "save_form", { confirmed: false });
  ok(s1.saved === false && /which campaign/.test(s1.error || ""), "a read-back went ahead without the campaign: " + JSON.stringify(s1));
  // a slow test request while the voice service is still sending is not a stall
  await p.evaluate(() => { const f = window.fetch; window.fetch = (u, o) => /ping=/.test(String(u)) ? new Promise(res => setTimeout(() => res(new Response("{}")), 2800)) : f(u, o); });
  await p.evaluate(() => { window.__ws0 = __ws; G.lastAct = Date.now() - 31000; G.loudAt = 0; const keep = setInterval(() => { if (!G.live) return clearInterval(keep); G.lastMsg = Date.now(); G.loudAt = 0; G.speechSince = 0; }, 100); window.__keep = keep; }); // the test browser's pretend mic beeps
  await p.waitForTimeout(4500);
  ok(await p.evaluate(() => __ws === __ws0 && G.idleEnding), "a live line with a slow test was reconnected instead of the normal quiet hang-up");
  await p.evaluate(() => { clearInterval(__keep); G.responding = true; __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) }); });
  await p.waitForTimeout(200);
  const off = await p.evaluate(() => ({ live: G.live, ending: G.idleEnding, note: __sent.some(s => s.includes("NOT hanging up")), cancel: __sent.slice(-5).some(s => JSON.parse(s).type === "response.cancel") }));
  ok(off.live && !off.ending && off.note && off.cancel, "the officer's late answer didn't call off the hang-up: " + JSON.stringify(off));
});

test("Hands-free: words said while the line was down make Ara ask for them again, and she doesn't start over", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send Ruth the agenda" });
  await p.evaluate(() => { G.spokeInGap = true; window.__ws0 = __ws; __ws.onclose({ code: 1006 }); }); await p.waitForTimeout(1500);
  const line = await p.evaluate(() => __sent.filter(s => s.includes("Sorry, I lost you")).pop() || "");
  ok(/say that again/.test(line) && /never ask \\"what would you like to do\\" while a form is open/.test(line) && /Send Ruth the agenda/.test(line), "the reconnect didn't ask for the missed words or keep the form: " + line.slice(0, 300));
  ok(await p.evaluate(() => !G.spokeInGap), "the missed-words flag stayed on after the line came back");
});
};
