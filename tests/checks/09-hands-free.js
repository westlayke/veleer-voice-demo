// Checks: hands-free mode. tests/bot.js loads this file and passes in its helpers.
module.exports = ({ test, ok, fresh, signIn, state, tab, ara, said, titleOf, PAGE, fs, path }) => {

test("Hands-free: Ara saves only after a read-back and the officer's yes, money gets a second yes, and undo takes it back", async (p) => {
  await signIn(p);
  await p.waitForFunction(() => G.live, null, { timeout: 8000 }); await p.evaluate(() => { G.hands = false; paintCall(); }); // this check starts in tap mode; hands-free is on by default since Oct 25
  // off by default: Ara can't save
  await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send Ruth the board deck", due: "2026-11-30" });
  let r = await ara(p, "save_form", { confirmed: false });
  ok(r.ok === false && /Hands-free mode is off/.test(r.error), "save_form worked with hands-free off: " + JSON.stringify(r));
  // the officer turns it on by voice; the draft tool now points Ara at save_form
  await said(p, "I'm driving"); await p.waitForTimeout(900); // tool calls right after a voice command are ignored
  ok(await p.isVisible(".cb-hf.on"), "the call bar does not show Hands-free on");
  r = await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send Ruth the board deck", due: "2026-11-30" });
  // the app reads a finished draft back itself, as a scripted line, without waiting for Ara to call save_form (Oct 25: she said "Tap Confirm")
  ok(r.saved === false && /Yes to save, or no to change something\?$/.test(r.read_back) && /Send Ruth the board deck/.test(r.read_back) && !/Not saved|call save_form/.test(r.read_back), "no clean read-back from the finished draft: " + JSON.stringify(r));
  ok(await p.evaluate(() => /Send Ruth the board deck.*Yes to save, or no to change something\?$/.test((__sent.map(x => JSON.parse(x)).filter(x => x.item && x.item.type === "force_message").pop() || { item: { content: [{ text: "" }] } }).item.content[0].text)), "the read-back wasn't the app's own scripted line");
  ok(/HANDS-FREE MODE IS ON/.test(await p.evaluate(() => __sent.join(" "))), "Ara's instructions do not mention hands-free");
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
  ok(r.saved === true && r.already && /undo/.test(r.said || ""), "not saved on the officer's own yes, or Ara's save_form wasn't answered as already saved: " + JSON.stringify(r)); /* since Oct 29 the yes itself saves; save_form is a late echo */
  let st = await state(p);
  ok(st.tasks.some(t => t.text === "Send Ruth the board deck"), "task missing after the hands-free save");
  ok(st.history[0].hf === true, "History does not mark the save hands-free");
  // undo takes back the save
  await said(p, "Undo"); await p.waitForTimeout(900);
  ok(!(await state(p)).tasks.some(t => t.text === "Send Ruth the board deck"), "undo did not take back the hands-free save");
  // a gift needs a second yes on the amount
  const who = await p.evaluate(() => { const S = window.__demo.state, o = S.opps.find(o => o.stage !== "Closed"); o.stage = "Commitment"; o.pledge = { amount: 1000, fund: "Citizens Alliance C3", status: "Current", confirmedBy: "Email", payments: [] }; const c = S.contacts.find(c => c.id === o.contactId); return c.first + " " + c.last; });
  await said(p, `Record a gift from ${who}, a thousand dollars by check.`);
  await ara(p, "show_gift_draft", { contact_name: who, amount: 1000, date: "2026-10-22", method: "Check" });
  await ara(p, "save_form", { confirmed: false }); await said(p, "Yes.");
  r = await ara(p, "save_form", { confirmed: true });
  ok(r.saved === true && !r.read_back, "the gift on a Commitment opportunity (amount from the pledge) should save on one yes: " + JSON.stringify(r)); // the policy (Oct 28): the second yes stays on gift and pledge, not on the routed payment
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
  await said(p, "Add a task for Ruth: send her the agenda, due November 30.");
  await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send Ruth the agenda", due: "2026-11-30" });
  await ara(p, "save_form", { confirmed: false });
  await said(p, "Yes."); const r = await ara(p, "save_form", { confirmed: true });
  ok(r.saved === true, "not saved: " + JSON.stringify(r));
  await p.evaluate(() => { window.__ws0 = __ws; __ws.onclose({ code: 1006 }); }); await p.waitForTimeout(1500);
  const line = await p.evaluate(() => ((G.justNow || {}).text || "")); /* Oct 29: the app says the sorry line itself; what Ara is told is the Right now text */
  ok(/Carry on where you were/.test(line) && /Say "Sorry, I lost you for a moment\." with no other aside, then ask just one question/.test(line) && !/went through just before the drop|Saved so far/.test(line), "the reconnect line still rebuilds Ara's memory of the save (Oct 28): " + line.slice(0, 300)); /* Oct 30: after a save the drop goes to Ara (asked and checked), not to a line of the app's */
  ok(await p.evaluate(() => ACT.q.some(a => /Reconnected: Ara is asked to say where we were herself \((saved|last line)\)/.test(a.text))), "the drop after the save didn't go to Ara: " + await p.evaluate(() => ACT.q.slice(-4).map(a => a.text).join(" | ")));
  const again = await ara(p, "save_form", { confirmed: true });
  ok(again.saved === true && again.already && /already saved/.test(again.status || again.note || ""), "saving again after the drop didn't say it was already saved: " + JSON.stringify(again));
});
test("Carverhill's 2:52 PM call (Oct 30): a replayed tool call the guard refuses keeps the where-we-were check, so Ara's \"What next?\" is caught", async (p) => {
  await signIn(p);
  await said(p, "I'm driving"); await p.waitForTimeout(900);
  const words = (text) => p.evaluate((text) => { [{ type: "response.created" }, { type: "response.output_audio_transcript.delta", delta: text }, { type: "response.done", response: { status: "completed" } }].forEach(e => __ws.onmessage({ data: JSON.stringify(e) })); }, text);
  await said(p, "Add a task for Ruth: send her the agenda, due November 30.");
  await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send Ruth the agenda", due: "2026-11-30" });
  await ara(p, "save_form", { confirmed: false });
  await said(p, "Yes."); const r = await ara(p, "save_form", { confirmed: true });
  ok(r.saved === true, "not saved: " + JSON.stringify(r));
  // the line drops right after the save; on the pickup Ara is asked to say where we were
  await p.evaluate(() => { G.forced = null; G.pendingForce = null; clearTimeout(G.forceTimer); window.__ws0 = __ws; __ws.onclose({ code: 1006 }); }); await p.waitForTimeout(1800);
  ok(await p.evaluate(() => G.ctxWatch && G.ctxWatch.kind === "reconnect"), "no where-we-were check after the drop: " + (await p.log()).slice(-300));
  await p.evaluate(() => { G.resumedAt = Date.now(); G.resumedHeardN = G.heardN || 0; }); /* the pretend service doesn't pick up the same conversation; the real one did, and replayed the call */
  // the service replays the save_form from before the drop (a reply of its own): the guard refuses it, and the check stays armed
  await p.evaluate(() => __ws.onmessage({ data: JSON.stringify({ type: "response.created" }) }));
  const again = await ara(p, "save_form", { confirmed: true });
  ok(again.ok === false && /already handled before the line dropped/.test(again.error || ""), "the replayed save wasn't refused: " + JSON.stringify(again));
  ok(/Guard: tool call replayed after a pickup \(save_form\)/.test(await p.log()) && /A tool call a guard refused while Ara was asked where we were: her words are still awaited/.test(await p.log()), "the refusal wasn't logged as keeping the check: " + (await p.log()).slice(-300));
  ok(await p.evaluate(() => !!G.ctxWatch), "the refused tool call cleared the where-we-were check");
  // her open question is caught and she is asked again; her proper line passes
  await words("Ruth's task is saved. What next?"); await p.waitForTimeout(150);
  ok(/asked an open question \("Ruth's task is saved\. What next\?"\): asked again for where we were \(2 of 3\)/.test(await p.log()), "her \"What next?\" wasn't caught: " + (await p.log()).slice(-300));
  const need = await p.evaluate(() => G.ctxWatch.need);
  await words(`Sorry, I lost you for a moment. The task for ${need.who || "Ruth"} is saved. ${need.q}`); await p.waitForTimeout(150);
  ok(/Ara said where we were on try 2/.test(await p.log()) && await p.evaluate(() => !G.ctxWatch), "her proper line didn't pass: " + (await p.log()).slice(-300));
  ok(await p.evaluate(() => grokInstructions().includes('After a save, never ask "what next?"')), "the guardrail line is missing from the instructions");
});
test("Hands-free: a line that stalls without closing (officer talking, nothing heard back) is reconnected instead of hung up", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await p.waitForFunction(() => G.live, null, { timeout: 8000 }); await p.evaluate(() => { G.hands = false; paintCall(); }); // this check starts in tap mode; hands-free is on by default since Oct 25
  await p.evaluate(() => { const f = window.fetch; window.fetch = (u, o) => /ping=/.test(String(u)) ? new Promise((res, rej) => { if (o && o.signal) o.signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))); }) : f(u, o); });
  await p.evaluate(() => { window.__ws0 = __ws; G.lastMsg = Date.now() - 7000; G.speechSince = Date.now() - 6000; G.loudAt = Date.now(); });
  await p.waitForTimeout(5500);
  const out = await p.evaluate(() => ({ newLine: __ws !== __ws0, live: G.live, log: ACT.q.concat(__logs.flatMap(l => l.events || [l])).map(a => a.text).join(" | "), heard: __sent.some(s => s.includes("talking while the line was down") || s.includes("Sorry, I lost you for a moment. Could you say that again?")) }));
  ok(out.live && out.newLine && /Line stalled \(officer talking/.test(out.log) && out.heard, "the stalled line wasn't reconnected: " + JSON.stringify({ newLine: out.newLine, live: out.live, heard: out.heard }));
});

test("Hands-free: a new opportunity always asks the campaign when the entity has two, a slow test on a live line doesn't reconnect, and a late answer calls off the quiet hang-up", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await p.waitForFunction(() => G.live, null, { timeout: 8000 }); await p.evaluate(() => { G.hands = false; paintCall(); }); // this check starts in tap mode; hands-free is on by default since Oct 25
  await said(p, "I'm driving"); await p.waitForTimeout(900);
  ok(await p.evaluate(() => idleMs() === 30000), "hands-free doesn't wait 30 seconds before the quiet hang-up");
  await p.evaluate(() => { const c = S.contacts.find(x => x.first === "James"); S.opps = S.opps.filter(o => o.contactId !== c.id); c.capacity = c.capacity || "C"; save(); });
  await said(p, "Create an opportunity for James, the Idaho C4.");
  const r = await ara(p, "show_opportunity_draft", { contact_name: "James Okafor", fund: "C.A. Idaho C4" });
  ok((r.still_needed || []).some(x => /Campaign of interest/.test(x) && /National or Idaho/.test(x)), "the campaign wasn't asked for: " + JSON.stringify(r));
  const s1 = await ara(p, "save_form", { confirmed: false });
  ok(s1.saved === false && /which campaign/.test(s1.error || ""), "a read-back went ahead without the campaign: " + JSON.stringify(s1));
  // a slow test request while the voice service is still sending is not a stall
  await p.evaluate(() => { const f = window.fetch; window.fetch = (u, o) => /ping=/.test(String(u)) ? new Promise(res => setTimeout(() => res(new Response("{}")), 2800)) : f(u, o); });
  await p.evaluate(() => { clearTimeout(G.askWatch); clearTimeout(G.tickWatch); G.asked = false; window.__noAutoForce = true; }); // the pretend service never answered the earlier reply requests, and leaves the goodbye line pending
  await p.evaluate(() => { window.__ws0 = __ws; G.lastAct = Date.now() - 61000; G.loudAt = 0; /* a form is open: the phone allows 60 s of quiet (Oct 28) */ const keep = setInterval(() => { if (!G.live) return clearInterval(keep); G.lastMsg = Date.now(); G.loudAt = 0; G.speechSince = 0; }, 100); window.__keep = keep; }); // the test browser's pretend mic beeps
  await p.waitForTimeout(4500);
  ok(await p.evaluate(() => __ws === __ws0 && G.idleEnding && G.forced && /Should I hang up now/.test(G.forced.text)), "a live line with a slow test was reconnected instead of the normal quiet hang-up (Ara's scripted question)");
  await p.evaluate(() => { clearInterval(__keep); G.responding = true; __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) }); });
  await p.waitForTimeout(3400); // long enough for a pending scripted line's fallback, which must not happen
  const off = await p.evaluate(() => ({ live: G.live, ending: G.idleEnding, forced: !!G.forced, fallback: __sent.some(s => s.includes("Should I hang up now") && JSON.parse(s).type === "response.create"), cancel: __sent.some(s => JSON.parse(s).type === "response.cancel") }));
  ok(off.live && !off.ending && !off.forced && !off.fallback && off.cancel, "the officer's late answer didn't call off the hang-up cleanly: " + JSON.stringify(off));
});

test("Hands-free: words said while the line was down make Ara ask for them again, and she doesn't start over", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send Ruth the agenda" });
  await p.evaluate(() => { G.spokeInGap = true; window.__ws0 = __ws; __ws.onclose({ code: 1006 }); }); await p.waitForTimeout(1500);
  const line = await p.evaluate(() => __sent.filter(s => s.includes("Sorry, I lost you")).pop() || ""), now = await p.evaluate(() => (G.justNow || {}).text || "");
  ok(/Sorry, I lost you for a moment\. We're on the new task for Ruth\. When is it due\?/.test(line) && /say that again/.test(now) && /"New task" form still needs/.test(now) && await p.evaluate(() => !!V), "the reconnect didn't re-ask the task's question or keep the form: " + line.slice(0, 300) + " | " + now.slice(0, 300));
  ok(await p.evaluate(() => !G.spokeInGap), "the missed-words flag stayed on after the line came back");
});

test("Hands-free: after a save Ara says the undo line once per call, never 'Saved: X saved', and offers the next step", async (p) => {
  await signIn(p);
  await said(p, "I'm driving"); await p.waitForTimeout(900);
  const who = await p.evaluate(() => { const S = window.__demo.state, o = S.opps.find(o => o.stage !== "Closed"); const c = S.contacts.find(c => c.id === o.contactId); return c.first + " " + c.last; });
  const saveTask = async (text) => { await said(p, `Add a task for ${who}: ${text.toLowerCase()}, due November 30.`); await ara(p, "show_task_draft", { contact_name: who, text, due: "2026-11-30" }); await ara(p, "save_form", { confirmed: false }); await said(p, "Yes, save it."); return ara(p, "save_form", { confirmed: true }); };
  const a0 = await saveTask("Send the board deck"); await p.evaluate((t) => lineSaid(t), a0.ask_exactly || a0.said || ""); const b0 = await saveTask("Send the agenda"); /* the undo line counts as said once heard with sound (Oct 30): a typed run marks it heard here */ /* the app saved on the yes and said the line itself; save_form reports it as already said */
  const a = Object.assign({}, a0, { ask_exactly: a0.ask_exactly || a0.said }), b = Object.assign({}, b0, { ask_exactly: b0.ask_exactly || b0.said });
  ok(a.saved && /Say undo/.test(a.ask_exactly), "the first save has no undo line: " + JSON.stringify(a));
  ok(b.saved && b.ask_exactly && !/Say undo/.test(b.ask_exactly), "the second save repeats the undo line: " + JSON.stringify(b));
  ok(![a.ask_exactly, b.ask_exactly].some(s => /Saved: /.test(s)), "a save line still starts with 'Saved:': " + a.ask_exactly);
  ok(/^Task added for \w+\. Say undo if that's wrong\. The next step in the process (to move \w+ to [\w ]+ is|is to confirm \w+'s move) to .*\. Do you want to do that now, yes or no\?$/.test(a.ask_exactly), "the save line isn't the scripted save plus next step: " + a.ask_exactly);
  ok(await p.evaluate(() => !grokInstructions().includes("whether to stop")), "Ara's instructions still ask whether to stop");
  // a bare no to "Do you want to do that now?" gets the app's own "What would you like to do?"; "no, <step>" is left to Ara (Carverhill, Oct 28)
  await p.evaluate(() => { __sent.length = 0; }); await said(p, "No."); await p.waitForTimeout(600);
  ok(await p.evaluate(() => __sent.some(s => s.includes("force_message") && s.includes("What would you like to do?"))) && await p.evaluate(() => ACT.q.concat(__logs.flatMap(l => l.events || [l])).some(a => /a no to the next step: the app asks what they'd like to do/.test(a.text))), "a bare no to the next step didn't get the app's question");
  await p.evaluate(() => { __sent.length = 0; recent(botName(), "The next step in the process to move Ruth to Ask Planning is to add a planned ask. Do you want to do that now, yes or no?"); }); await said(p, "No, record a gift."); await p.waitForTimeout(600);
  ok(await p.evaluate(() => !__sent.some(s => s.includes("What would you like to do?"))), "\"no, <step>\" was taken as a bare no");
});

test("Oct 24 call fixes: email spelling, substantive asked and read back, edits need a next step, going back in optional questions", async (p) => {
  await signIn(p);
  ok(await p.evaluate(() => { G.recent = ["Officer: Yeah, it's J B at g mail dot com."]; const a = spelledWords().length === 0; G.recent = ["Officer: Bat. B A T."]; return a && spelledWords().join() === "BAT"; }), "the s of it's was read as a spelled letter");
  // a new contact for the rest
  await ara(p, "show_contact_draft", { first: "Pat", last: "Moss", email: "pat@example.org", mobile: "(555) 010-0150" });
  await said(p, "Rate them C."); await ara(p, "show_contact_draft", { first: "Pat", last: "Moss", email: "pat@example.org", mobile: "(555) 010-0150", capacity: "C" });
  for (let i = 0; i < 3 && !(await p.isVisible("[data-act=save]")); i++) await p.waitForTimeout(200);
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  // optional questions: an entity answer while the amount is asked goes to the entity, back works, no read-back mid-way
  await said(p, "Create an opportunity for Pat.");
  let r = await ara(p, "show_opportunity_draft", { contact_name: "Pat Moss" });
  ok(/Save it, or add the optional details first\?$/.test(r.ask_exactly || ""), "the opportunity draft didn't open: " + JSON.stringify(r) + JSON.stringify((await state(p)).contacts.filter(c => c.first === "Pat")));
  r = await ara(p, "optional_fields", { step: "start" });
  ok(r.field === "fund" && /entity/.test(r.ask_exactly) && !/ask exactly/i.test(r.ask_exactly), "the question isn't on its own: " + JSON.stringify(r));
  r = await ara(p, "optional_fields", { step: "skip" });
  ok(r.field === "potential" && !/Skip it and move on/.test(JSON.stringify(r)), "skip reply: " + JSON.stringify(r));
  r = await ara(p, "optional_fields", { step: "answer", value: "one of the New Hampshire entities" });
  ok((await p.inputValue("#f_fund")) === "C.A. New Hampshire C4", "the entity answer given at the amount question wasn't used: " + JSON.stringify(r));
  r = await ara(p, "optional_fields", { step: "back", field: "entity" });
  ok(r.field === "fund", "back to the entity didn't ask the entity: " + JSON.stringify(r));
  r = await ara(p, "optional_fields", { step: "answer", value: "C.A. New Hampshire C4" });
  r = await ara(p, "save_form", { confirmed: false });
  ok(r.ok === false && r.field && r.ask_exactly, "save_form read back before the optional questions finished: " + JSON.stringify(r));
  await ara(p, "optional_fields", { step: "stop" });
  for (let i = 0; i < 3 && !(await p.isVisible("[data-act=save]")); i++) await p.waitForTimeout(200);
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  // the interaction report asks whether it was substantive, takes the officer's yes, then needs a next step
  r = await ara(p, "show_interaction_draft", { contact_name: "Pat Moss", date: "2026-10-24", meetingType: "Video call", summary: "Very interested in New Hampshire." });
  ok(/substantive interaction/i.test(r.ask_exactly || "") && !r.still_needed, "the app didn't ask whether it was substantive: " + JSON.stringify(r));
  await said(p, "Yes, it was.");
  r = await ara(p, "show_interaction_draft", { contact_name: "Pat Moss" });
  ok((r.still_needed || []).some(x => /Next step/.test(x)), "a yes to substantive didn't make the next step needed: " + JSON.stringify(r));
  r = await ara(p, "show_interaction_draft", { contact_name: "Pat Moss", substantive: false });
  await said(p, "I'm driving"); await p.waitForTimeout(900);
  r = await ara(p, "save_form", { confirmed: true });
  ok(/not substantive/.test(r.read_back || ""), "the read-back doesn't say whether it was substantive: " + JSON.stringify(r));
  await said(p, "Yes."); r = await ara(p, "save_form", { confirmed: true });
  ok(r.saved, "the report wasn't saved: " + JSON.stringify(r));
  // marking it substantive later needs a next step too
  await said(p, "Actually, edit that report for Pat, it was substantive.");
  r = await ara(p, "show_interaction_edit_draft", { contact_name: "Pat Moss", substantive: true });
  ok((r.still_needed || []).some(x => /Next step/.test(x)), "the edit didn't ask for a next step: " + JSON.stringify(r));
  await said(p, "Hands-free off"); await p.waitForTimeout(900);
  await p.evaluate(() => { G.hands = false; });
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  ok(await p.isVisible("#draftErr"), "the edit saved substantive without a next step");
  await said(p, "Next step: send the New Hampshire plan, due November 5.");
  await ara(p, "show_interaction_edit_draft", { contact_name: "Pat Moss", substantive: true, nextStep: "Send the New Hampshire plan", nextDue: "2026-11-05" });
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  const st = await state(p);
  ok(st.tasks.some(t => t.text === "Send the New Hampshire plan") && st.interactions.some(i => i.substantive && /New Hampshire/.test(i.summary)), "the edit didn't save substantive with its task");
  // the tapped save is said by the app itself, with the next step
  ok(await p.evaluate(() => __sent.join(" ").includes("Changes saved for Pat. The next step in the process")), "the app didn't say the tapped save and the next step");
  await p.evaluate(() => { G.saveAck = Object.assign(G.saveAck || {}, { at: Date.now() - 1000 }); [{ type: "response.created" }, { type: "response.output_audio_transcript.delta", delta: "Go ahead and tap it." }, { type: "response.done", response: { status: "completed" } }].forEach(e => __ws.onmessage({ data: JSON.stringify(e) })); });
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => __sent.join(" ").includes("Correction: the officer already tapped Save changes")), "Ara wasn't told again about the save she missed");
});

test("Oct 24 call fixes: the phone pausing the sound doesn't end the call, and Carry on keeps hands-free on", async (p) => {
  await signIn(p);
  await said(p, "I'm driving"); await p.waitForTimeout(900);
  await p.evaluate(() => G.ctx.suspend()); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => G.live && G.ctx.state === "running" && !G.soundPausedAt), "the call ended or the sound didn't come back after a short pause");
  await p.evaluate(() => { const AC = window.AudioContext; window.__heldAC2 = AC; window.AudioContext = class extends AC { constructor() { super(); this.resume = () => Promise.resolve(); super.suspend(); } }; G.ctx.resume = () => Promise.resolve(); return G.ctx.suspend(); });
  await p.waitForTimeout(7000);
  // Oct 28: one fresh start of the sound and mic first; the phone keeps that one held too, so the call ends with the reason on the card
  ok(await p.evaluate(() => ACT.q.concat(__logs.flatMap(l => l.events || [l])).some(a => /^Starting the sound and mic afresh after the sound stayed paused/.test(a.text))), "no fresh start of the sound before giving up");
  await p.waitForFunction(() => !G.live, null, { timeout: 6000 }).catch(() => {});
  ok(await p.evaluate(() => !G.live), "the call didn't end when the sound stayed paused");
  ok(await p.isVisible("#rsmGo") && /kept the sound/.test(await p.evaluate(() => document.getElementById("modal").innerText)), "no Carry on with the reason after the sound stayed paused: " + await p.evaluate(() => document.getElementById("modal").innerText.slice(0, 200)));
  await p.evaluate(() => { window.AudioContext = window.__heldAC2; });
  await p.tap("#rsmGo"); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => G.live && G.hands), "hands-free was lost after Carry on");
  ok(await p.evaluate(() => __sent.join(" ").includes("Hands-free mode is still on")), "Ara wasn't told hands-free is still on");
});

test("Carry on with the phone's sound held (Oct 27): the app waits and says so instead of letting Ara talk unheard, and repeats her line when the sound is back", async (p) => {
  await signIn(p);
  await said(p, "I'm driving"); await p.waitForTimeout(900);
  // the phone keeps the sound engine from running after the tap (iOS "interrupted"): every new engine starts held until released
  await p.evaluate(() => { const AC = window.AudioContext; window.__heldAC = AC; window.AudioContext = class extends AC { constructor() { super(); const real = this.resume.bind(this); this.resume = () => Promise.resolve(); this.__release = () => { this.resume = real; return real(); }; super.suspend(); } }; });
  await p.evaluate(() => { G.ctx.resume = () => Promise.resolve(); return G.ctx.suspend(); });
  await p.waitForFunction(() => !G.live, null, { timeout: 14000 }).catch(() => {});
  ok(await p.isVisible("#rsmGo"), "no Carry on card after the sound stayed paused");
  const logAt = () => p.evaluate(() => ACT.q.concat(__logs.flatMap(l => l.events || [l])).map(a => a.text));
  await p.tap("#rsmGo"); await p.waitForTimeout(3500);
  ok(await p.evaluate(() => G.live && G.ctx && G.ctx.state !== "running" && G.soundPausedAt > 0), "the call didn't wait for the held sound: " + JSON.stringify(await p.evaluate(() => ({ live: G.live, state: G.ctx && G.ctx.state, paused: G.soundPausedAt }))));
  ok((await logAt()).some(t => /^Sound not running .* after the tap/.test(t)), "the held sound wasn't logged: " + JSON.stringify((await logAt()).slice(-6)));
  ok(/held by another app, a call or Siri/.test(await p.evaluate(() => document.body.innerText)), "the officer wasn't told on screen that the phone holds the sound");
  // Ara answers into the silence: the line is kept
  await p.evaluate(() => { const audio = btoa(String.fromCharCode(...new Array(960).fill(0))); [{ type: "response.created" }, { type: "response.output_audio.delta", delta: audio }, { type: "response.output_audio_transcript.delta", delta: "Welcome back. Was it in person, a phone call, or a video call?" }, { type: "response.done", response: { status: "completed" } }].forEach(e => __ws.onmessage({ data: JSON.stringify(e) })); });
  await p.waitForTimeout(4000); // past the usual 6 s pause limit in all: the call must still be up
  ok(await p.evaluate(() => G.live && G.unheard === "Welcome back. Was it in person, a phone call, or a video call?"), "the unheard line wasn't kept, or the call ended: " + JSON.stringify(await p.evaluate(() => ({ live: G.live, unheard: G.unheard }))));
  // the phone gives the sound back: the line is said again
  const n1 = await p.evaluate(() => __sent.length);
  await p.evaluate(() => G.ctx.__release()); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => G.live && !G.soundPausedAt && !G.unheard), "the sound coming back wasn't noticed: " + JSON.stringify(await p.evaluate(() => ({ live: G.live, paused: G.soundPausedAt, unheard: G.unheard }))));
  const forced = await p.evaluate((n) => __sent.slice(n).map(x => JSON.parse(x)).filter(x => x.item && x.item.type === "force_message").map(x => x.item.content[0].text), n1);
  ok(forced.some(t => /^Welcome back\. Was it in person/.test(t)), "Ara's unheard line wasn't said again: " + JSON.stringify(forced));
  await p.evaluate(() => { window.AudioContext = window.__heldAC; endCall(); });
});

test("Turning on hands-free mid-form: Ara says she'll read back all the information, then asks the form's next question", async (p) => {
  await signIn(p);
  await ara(p, "show_contact_draft", {});
  await p.evaluate(() => recent("Ara", "Mind the cobwebs. What's the first name?"));
  await ara(p, "set_hands_free", { on: true }); await p.waitForTimeout(300);
  const forced = await p.evaluate(() => __sent.map(x => JSON.parse(x)).filter(x => x.item && x.item.type === "force_message").pop());
  // the line carries the form's last question itself, so no second turn is needed (Oct 25: Ara went quiet after the line until the officer spoke)
  ok(forced && /read back all the information on the form and save it when you say yes\. What's the first name\?$/.test(forced.item.content[0].text), "the hands-free line wasn't sent word for word with the form's question: " + JSON.stringify(forced));
  ok(!(await p.evaluate(() => __sent.some(x => x.includes("The app just said")))), "a second turn was still requested after the line");
  // if xAI doesn't play a scripted line within 8 s, Ara is asked to say it; if it then plays late, the repeat is cut
  await p.evaluate(() => { window.__noAutoForce = true; forceSay("Test line here please.", "", "FALLBACK please say Test line."); }); await p.waitForTimeout(3400);
  ok(!(await p.evaluate(() => __sent.some(x => x.includes("FALLBACK please say Test line.")))), "the fallback came before 8 s");
  await p.waitForTimeout(5000);
  ok(await p.evaluate(() => __sent.some(x => x.includes("FALLBACK please say Test line."))), "a scripted line that didn't play had no fallback");
  const tell = (n) => p.evaluate((n) => { [{ type: "response.created" }, { type: "response.output_audio_transcript.delta", delta: "Test line here " }, { type: "response.output_audio_transcript.delta", delta: "please." }].forEach(e => __ws.onmessage({ data: JSON.stringify(e) }));
    if (n === 1) { G.audioSamples = 30000; __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); } }, n); // the first telling had over half a second of sound, so it was heard
  const n0 = await p.evaluate(() => __sent.length);
  await tell(1); await p.waitForTimeout(100);
  ok(!(await p.evaluate((n) => __sent.slice(n).some(x => JSON.parse(x).type === "response.cancel"), n0)), "the first telling of the line was cut");
  await tell(2); await p.waitForTimeout(100);
  ok(await p.evaluate((n) => __sent.slice(n).some(x => JSON.parse(x).type === "response.cancel") && G.dropNext, n0), "the late repeat of the scripted line wasn't cut");
  await p.evaluate(() => __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "cancelled" } }) }));
  // xAI extras: resumption, words to listen for, pronunciation fixes; a dropped line picks up the same conversation
  const ups = await p.evaluate(() => __sent.map(x => JSON.parse(x)).filter(x => x.type === "session.update").map(x => x.session));
  ok(ups.some(u => u.resumption && u.resumption.enabled) && ups.some(u => u.replace && u.replace["C.A."]) && ups.some(u => u.audio && u.audio.input.transcription && u.audio.input.transcription.keyterms.includes("Ruth Abernathy") && u.audio.input.transcription.keyterms.length <= 100) && ups[0].instructions, "the xAI extras weren't sent after the main settings");
  await p.evaluate(() => { __ws.onmessage({ data: JSON.stringify({ type: "conversation.created", conversation: { id: "conv_test1" } }) }); G.drops = 0; G.loudAt = 0; __ws.onclose({ code: 1006, reason: "" }); }); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => /conversation_id=conv_test1/.test(__wsUrls[__wsUrls.length - 1])), "the reopened line didn't ask for the same conversation: " + await p.evaluate(() => __wsUrls.join(" ")));
  // a mic muted for a moment doesn't end the call
  const kept = await p.evaluate(async () => { const tr = { muted: true }; G.stream = { getAudioTracks: () => [tr], getTracks: () => [] }; micMuted(tr); await new Promise(r => setTimeout(r, 700)); tr.muted = false; await new Promise(r => setTimeout(r, 700)); return G.live && !G.micMutedAt; });
  ok(kept, "a short mic mute ended the call");
  // the iOS "Stop audio recording?" dialog mutes the mic until the officer taps Cancel: the call waits well past the 6 s sound wait (Oct 26 drive)
  const kept2 = await p.evaluate(async () => { const tr = { muted: true }; G.stream = { getAudioTracks: () => [tr], getTracks: () => [] }; micMuted(tr); await new Promise(r => setTimeout(r, 7500)); const still = G.live && !!G.micMutedAt; tr.muted = false; await new Promise(r => setTimeout(r, 700)); return still && G.live && MIC_BACK_MS >= 30000; });
  ok(kept2, "a mic muted for 7 s ended the call (the Stop audio recording dialog needs a reach)");
});

test("Hands-free: an interaction report is never read back without the substantive answer, and a due date today is said as today", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await said(p, "I'm driving"); await p.waitForTimeout(900);
  await said(p, "Log an interaction with Ruth, I met her at the Halloween party yesterday.");
  let r = await ara(p, "show_interaction_draft", { contact_name: "Ruth Abernathy", date: "2026-10-24", meetingType: "Event", summary: "Met Ruth at the Halloween party." });
  ok(/substantive interaction/i.test(r.ask_exactly || "") && !r.read_back, "the finished report was read back before the substantive question: " + JSON.stringify(r));
  await p.evaluate(() => { V.askedSubst = false; }); // as if Ara had skipped the question (Oct 25)
  r = await ara(p, "save_form", { confirmed: false });
  ok(r.saved === false && /substantive interaction/i.test(r.ask_exactly || "") && !r.read_back, "save_form read back without the substantive answer: " + JSON.stringify(r));
  await said(p, "Yes, it was.");
  r = await ara(p, "save_form", { confirmed: false });
  ok(r.saved === false && /Do you want to set it now, yes or no\?$/.test(r.ask_exactly || "") && (await p.isChecked("#f_substantive")), "the yes wasn't taken, or the next step wasn't asked as a yes-or-no decision (Oct 30): " + JSON.stringify(r));
  await said(p, "Sure."); // a short answer that isn't a no is a yes
  r = await ara(p, "save_form", { confirmed: false });
  ok(r.saved === false && r.ask_exactly === "What's the next step, and when is it due?" && await p.evaluate(() => V.askedNext === "own" && formPosition().ask === "What's the next step, and when is it due?"), "a yes to the next-step question didn't get the own-words question (and the reconnect line with it): " + JSON.stringify([r.ask_exactly, await p.evaluate(() => [V.askedNext, formPosition().ask])]));
  const today = await p.evaluate(() => todayISO());
  await said(p, "Make the ask, today."); // the officer answers the next-step question (Oct 25: a next step the officer never said is dropped)
  r = await ara(p, "show_interaction_draft", { contact_name: "Ruth Abernathy", nextStep: "Make the ask", nextDue: today });
  ok(/due [A-Z][a-z]+ \d+, today\. Yes to save, or no to change something\?$/.test(r.read_back || ""), "the read-back doesn't say the due date is today: " + JSON.stringify(r));
  ok(await p.evaluate((d) => dateSaid(d).endsWith("(today)"), today), "dateSaid has no day word");
  // a no to the next-step question: the report goes to the read-back without one (Oct 30)
  await p.evaluate(() => { V = null; G.recent = []; renderOverlay(); });
  await said(p, "Log a phone call with Ken Ito today, we talked about the gala.");
  r = await ara(p, "show_interaction_draft", { contact_name: "Ken Ito", date: today, meetingType: "Phone call", summary: "Talked about the gala." });
  await said(p, "Yes, it was."); r = await ara(p, "save_form", { confirmed: false });
  ok(/Do you want to set it now, yes or no\?$/.test(r.ask_exactly || ""), "the second report didn't ask the next-step question: " + JSON.stringify(r));
  await said(p, "No."); r = await ara(p, "save_form", { confirmed: false });
  ok(/Yes to save, or no to change something\?$/.test(r.read_back || "") && !/next step/.test(r.read_back || "") && await p.evaluate(() => V.nextSkipped && !formPosition().ask.includes("next step")) && /The officer said no to setting a next step now: the report goes on without one/.test(await p.evaluate(() => ACT.q.concat(__logs.flatMap(l => l.events || [l])).map(a => a.text).join(" | "))), "a no to the next-step question didn't go on to the read-back without one: " + JSON.stringify([r.read_back, r.ask_exactly, await p.evaluate(() => [V.nextSkipped, formPosition().ask])]));
});

test("Hands-free: a yes to a read-back saves the form even when Ara opens another form instead of calling save_form; without the yes the other form waits", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await said(p, "I'm driving"); await p.waitForTimeout(900);
  // Oct 25, 9:16 AM: "Yes, let's go ahead and do that" to an interaction report's read-back became show_cultivation_decision; the report was never saved
  await p.evaluate(() => { const c = S.contacts.find(x => x.first === "James"); S.opps = S.opps.filter(o => o.contactId !== c.id); S.interactions = S.interactions.filter(i => i.contactId !== c.id); c.capacity = "C";
    S.opps.push({ id: "o_jo", contactId: c.id, name: "Okafor, James - 2026", stage: "Qualification", asks: [], fund: "", campaign: "", officer: OFFICER, participants: "", createdOn: todayISO() }); save(); });
  const today = await p.evaluate(() => todayISO()), n0 = await p.evaluate(() => S.interactions.length);
  await said(p, "I met James at the Halloween party, it was substantive, and I'll follow up with him today."); // said by the officer, so the fields are kept (Oct 25)
  let r = await ara(p, "show_interaction_draft", { contact_name: "James Okafor", date: today, meetingType: "Event", summary: "Met James at the Halloween party.", substantive: true, nextStep: "Follow up with James", nextDue: today });
  ok(/Yes to save, or no to change something\?$/.test(r.read_back || ""), "the finished report wasn't read back: " + JSON.stringify(r));
  await said(p, "Yes, let's go ahead and do that."); await p.waitForTimeout(200);
  r = await ara(p, "show_cultivation_decision", { contact_name: "James Okafor", decision: "Move to Cultivation" });
  const after = await p.evaluate(() => ({ n: S.interactions.length, form: V && V.action, hf: S.history[0] && S.history[0].hf, log: ACT.q.concat(__logs.flatMap(l => l.events || [l])).map(a => a.text).join(" | ") }));
  ok(after.n === n0 + 1 && !after.form && /saved the Interaction report form (before the next one opened|itself, from their words)/.test(after.log) && /refused: the officer hasn't asked for the Move to Cultivation\? form/.test(after.log), "the yes didn't save the report, or the unasked Cultivation form opened anyway (Oct 25: a form opens only on the officer's word): " + JSON.stringify(after));
  ok(await p.evaluate(() => __sent.some(s => s.includes("The officer's yes saved the Interaction report form first") || s.includes("Interaction report saved"))), "Ara wasn't told the report was saved first");
  await p.evaluate(() => recent(botName(), "The next step in the process is to confirm James's move to Cultivation. Do you want to do that now, or something else?")); await said(p, "Yes.");
  r = await ara(p, "show_cultivation_decision", { contact_name: "James Okafor", decision: "Move to Cultivation" });
  ok(await p.evaluate(() => V && V.action === "cultivate"), "the Cultivation form didn't open after the officer's yes to Ara's offer: " + JSON.stringify(r));
  // the Cultivation decision read back, no yes yet: another form has to wait
  r = await ara(p, "save_form", { confirmed: false });
  ok(/^Move James to Cultivation\? That means you, as the gift officer/.test(r.read_back || ""), "the Cultivation read-back lacks its explanation: " + JSON.stringify(r));
  r = await ara(p, "show_task_draft", { contact_name: "James Okafor", text: "Call James" });
  ok(r.ok === false && /waiting for the officer's yes; it is NOT saved/.test(r.error || "") && (await p.evaluate(() => V && V.action === "cultivate")), "another form opened over an unsettled read-back: " + JSON.stringify(r));
});

test("Hands-free: when Ara reads a form back herself, in full, and the officer says yes, the app saves instead of reading it back again", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await said(p, "I'm driving"); await p.waitForTimeout(900);
  // Oct 25, 10:04 AM: Ara read the new contact back herself, the officer said yes, and the app read it all back again
  let r = await ara(p, "show_contact_draft", { first: "Jack", last: "Baloney", email: "jb@example.org" });
  await p.evaluate(() => recent("Ara", "Here's the read-back. New contact: Jack Baloney, email jb at example dot org, email and calls permitted. Shall I save it?"));
  await said(p, "Yes");
  r = await ara(p, "save_form", { confirmed: true });
  ok(r.saved === true && !r.read_back && (await state(p)).contacts.some(c => c.last === "Baloney"), "a complete read-back by Ara plus a yes wasn't taken as the read-back: " + JSON.stringify(r));
  // but a read-back that left a field out still gets the app's own
  await said(p, "New contact: Rita Moss, rita at example dot org, mobile 555 010 0166.");
  r = await ara(p, "show_contact_draft", { first: "Rita", last: "Moss", email: "rita@example.org", mobile: "(555) 010-0166" });
  await p.evaluate(() => { V.opt = null; recent("Ara", "New contact: Rita Moss, rita at example dot org. Shall I save it?"); }); // the mobile was left out (and Ara skipped the app's rating question)
  await said(p, "Yes");
  r = await ara(p, "save_form", { confirmed: true });
  ok(r.saved === false && /Yes to save, or no to change something\?$/.test(r.read_back || "") && !(await state(p)).contacts.some(c => c.last === "Moss"), "an incomplete read-back by Ara was accepted: " + JSON.stringify(r));
});
test("Hands-free: a planned ask with no entity said is read back without one and the entity is asked (never the first in the list)", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await said(p, "Plan an ask for Ruth for today, seventy-five thousand dollars.");
  await p.evaluate(() => { const c = S.contacts.find(x => x.last === "Abernathy"); S.opps.filter(o => o.contactId === c.id).forEach(o => { o.fund = null; o.campaign = null; }); save(); }); // an opportunity with no entity of interest yet
  const r = await ara(p, "show_ask_plan_draft", { contact_name: "Ruth Abernathy", plannedDate: "2026-10-26", amount: 75000, fund: "C.A. Idaho PAC" }, 900);
  const d = await p.evaluate(() => readDraft());
  ok(d.fund === "" || d.fund === undefined, "a blank entity became the first in the list (the Oct 26 drive saved Citizens Alliance C3 for an Idaho PAC ask): " + JSON.stringify(d.fund));
  const txt = [r.ask_exactly, r.read_back, r.status, r.say, (r.still_needed || []).join(" ")].join(" ");
  ok(/entity/i.test(txt) && !/Citizens Alliance C3/.test(txt), "the app didn't ask for the entity, or named one: " + txt.slice(0, 300));
});

test("The phone locking (page hidden) closes the line a few seconds later and reopens the same conversation when the app is back, no Carry on tap", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await p.evaluate(() => { G.convId = "conv_locktest"; G.convAt = Date.now(); window.__lockWs = window.__ws; window.__lockCtx = G.ctx; window.__lockStream = G.stream; Object.defineProperty(document, "visibilityState", { get: () => "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await p.waitForTimeout(1500);
  ok(await p.evaluate(() => G.live && !!G.hiddenAt && !G.lockPaused && G.ws === window.__lockWs), "the line was closed within 1.5 s of the page going hidden (a quick app switch shouldn't drop it)");
  await p.evaluate(() => { const tr = G.stream.getAudioTracks()[0]; Object.defineProperty(tr, "muted", { get: () => true, configurable: true }); tr.onmute && tr.onmute(); soundPaused(G.ctx); }); /* the phone mutes the mic and pauses the sound at the lock (Oct 26) */
  await p.waitForTimeout(3000);
  ok(await p.evaluate(() => G.live && !!G.hiddenAt && !G.lockPaused && G.ws === window.__lockWs), "the line was closed within 4.5 s of the page going hidden (Oct 30: an auto-lock undone within 7 s keeps the line)");
  await p.waitForTimeout(7000);
  ok(await p.evaluate(() => G.live && !!G.lockPaused && G.ws === null && window.__lockWs.readyState === 3 && /Paused/.test(G.status)), "the line wasn't closed after the lock (xAI would charge for a locked phone): " + await p.evaluate(() => G.status));
  await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { get: () => "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await p.waitForFunction(() => G.ws && G.ws !== window.__lockWs && G.status === "Listening", null, { timeout: 5000 }).catch(() => {});
  ok(await p.evaluate(() => G.live && !G.hiddenAt && !G.lockPaused && G.ws && G.ws !== window.__lockWs && G.status === "Listening" && !document.querySelector(".scrim")), "the line didn't reopen when the page came back, or a Carry on card appeared: " + await p.evaluate(() => G.status));
  ok(await p.evaluate(() => G.ctx && G.ctx !== window.__lockCtx && G.ctx.state === "running" && G.stream && G.stream !== window.__lockStream && window.__lockStream.getTracks().every(t => t.readyState === "ended") && G.outAn && G.outAn.context === G.ctx), "the sound and mic weren't started afresh after the lock (iOS brings the sound back on the earpiece otherwise)");
  ok(await p.evaluate(() => /conversation_id=conv_locktest/.test(window.__wsUrls[window.__wsUrls.length - 1])), "the reopened line didn't pick up the same conversation: " + await p.evaluate(() => window.__wsUrls.slice(-1)[0]));
  const steps = await p.evaluate(() => __logs.flatMap(b => b.events.map(e => e.text)).concat(ACT.q.map(e => e.text))); /* sent rows plus the ones still queued (the 4 s flush restarts on every row) */
  ok(steps.some(t => /Phone locked: voice line closed after [\d.]+ s/.test(t)) && steps.some(t => /App hidden for [\d.]+ s: reopening the line/.test(t)) && steps.some(t => /Sound and mic started afresh after the lock/.test(t)), "the lock pause or the audio restart wasn't logged: " + steps.slice(-6).join(" | "));
});


test("Hands-free greeting (Oct 27): the first calls say hands-free is on and how it works, later calls say it in a word, the button names the switch", async (p) => {
  await signIn(p);
  await p.waitForFunction(() => G.live, null, { timeout: 8000 });
  // a typed name starts the call with the greeting as Ara's opening instruction (an exact line); a plain mic tap says it as a scripted line
  await p.waitForFunction(() => __sent.some(x => /Hands-free is on, so you don't need to look at your phone/.test(x)), null, { timeout: 8000 }).catch(() => {});
  const hello = await p.evaluate(() => (__sent.find(x => /Hi Sam, I'm/.test(x)) || "").match(/Hi Sam, I'm [^"]*\?/) ? __sent.find(x => /Hi Sam, I'm/.test(x)).match(/Hi Sam, I'm [^"]*\?/)[0] : "");
  ok(/^Hi Sam, I'm \w+\. Hands-free is on, so you don't need to look at your phone: I'll read each form back and save it when you say yes\. What would you like to do\?$/.test(hello), "the first greeting doesn't explain hands-free: " + hello);
  ok((await p.evaluate(() => S.settings.hfGreeted)) === 1, "the greeting count didn't move");
  ok(/Turn hands-free off/.test(await p.textContent(".cb-hf")), "the button doesn't read Turn hands-free off");
  await p.evaluate(() => { G.hands = false; paintCall(); });
  ok(/Turn hands-free on/.test(await p.textContent(".cb-hf")), "the button doesn't read Turn hands-free on when it's off");
  // a phone past its first three calls hears the short line; the call-bar tap flips the label back
  ok(await p.evaluate(() => { S.settings.hfGreeted = 3; G.hands = true; return /^Hi \w+, I'm \w+, hands-free is on\. What would you like to do\?$/.test(helloLine(S.settings.userName)); }), "the later greeting isn't the short line");
  ok(await p.evaluate(() => { G.hands = false; return /^Hi \w+, I'm \w+, what would you like to do\?$/.test(helloLine(S.settings.userName)); }), "the tap-mode greeting mentions hands-free");
});
// Oct 28: the phone discarded the page while the conversation was paused at a lock; the next page offers Carry on and says why
test("A page the phone closed while a conversation was paused offers Carry on on the next open, with the reason", async (p) => {
  await signIn(p);
  await p.evaluate(() => localStorage.setItem("resumeKeep", JSON.stringify({ at: Date.now() - 20000, lines: ["Ara: What's the last name?", "Officer: Smith"], draft: "x", where: "", what: "New contact", hands: true, plain: "Your phone closed the app while it was locked." })));
  await p.reload(); await p.waitForTimeout(1500);
  const txt = await p.evaluate(() => document.getElementById("modal").innerText);
  ok(await p.isVisible("#rsmGo") && /closed the app while it was locked/.test(txt) && /“New contact” form went with it/.test(txt), "the kept conversation wasn't offered with the reason: " + txt.slice(0, 200));
  ok(await p.evaluate(() => !localStorage.getItem("resumeKeep")), "the kept copy wasn't cleared once offered");
  await p.tap("#rsmGo"); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => G.live && G.hands && __sent.join(" ").includes("Officer: Smith")), "Carry on from the kept copy didn't start with the last lines");
  await p.evaluate(() => endCall());
  // a normal call start or end leaves nothing kept behind
  ok(await p.evaluate(() => !localStorage.getItem("resumeKeep")), "a kept copy survived a normal end");
});
test("A page the phone closed in the middle of a call (no end logged) is noticed on the next open: the silent end is logged against that call and Carry on is offered", async (p) => {
  await signIn(p); await p.waitForFunction(() => G.live, null, { timeout: 8000 });
  await said(p, "Let's add a task for Ruth."); await p.evaluate(() => act("step", "breadcrumb check")); await p.waitForTimeout(2300); /* the copy is refreshed by the 1 s tick */
  const kept = await p.evaluate(() => { const r = JSON.parse(localStorage.getItem("resumeKeep") || "null"); return r && { killed: r.killed, same: r.session === G.session, last: r.last, lines: r.lines.length }; });
  ok(kept && kept.killed && kept.same && /breadcrumb check/.test(kept.last) && kept.lines > 0, "the live call isn't kept on the phone with its session and last row: " + JSON.stringify(kept));
  const oldSession = await p.evaluate(() => G.session);
  await p.reload(); await p.waitForTimeout(1500);
  const txt = await p.evaluate(() => document.getElementById("modal").innerText);
  ok(await p.isVisible("#rsmGo") && /closed the app in the middle of the conversation/.test(txt), "the cut-off call wasn't offered as Carry on: " + txt.slice(0, 200));
  await p.waitForTimeout(4600);
  const batch = (await p.evaluate(() => __logs)).find(b => b.events.some(e => /ended without the app noticing/.test(e.text)));
  ok(batch && batch.session === oldSession && batch.events.some(e => /after "step: breadcrumb check"/.test(e.text)), "the silent end wasn't logged against the cut-off call: " + JSON.stringify(batch && { session: batch.session, old: oldSession }));
  await p.tap("#rsmX"); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !localStorage.getItem("resumeKeep")), "the kept copy stayed after Not now");
});

test("Carverhill's 7:39 AM call (Oct 29): a yes said after a pickup saves the second form, even when the first form's save was a minute before the drop, and the replay guard stops at the officer's first words", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  // first form, saved on the officer's yes (hands-free is on by default)
  await said(p, "Add a task for Ruth: send her the board deck, due November 30.");
  await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send Ruth the board deck", due: "2026-11-30" });
  await ara(p, "save_form", { confirmed: false }); await said(p, "Save it."); await p.waitForTimeout(300);
  let r = await ara(p, "save_form", { confirmed: true });
  ok(r.saved === true && r.already && (await state(p)).tasks.some(t => t.text === "Send Ruth the board deck"), "the first form wasn't saved on the yes: " + JSON.stringify(r));
  // second form, read back and waiting for the yes when the line drops; the new line picks the conversation up
  await said(p, "And another task for Ruth: send her the agenda, due November 30.");
  await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send Ruth the agenda", due: "2026-11-30" });
  r = await ara(p, "save_form", { confirmed: false });
  ok(/Yes to save, or no to change something\?$/.test(r.read_back || ""), "the second form wasn't read back: " + JSON.stringify(r));
  await p.evaluate(() => { G.convId = "c-oct29"; G.convAt = Date.now(); G.loudAt = 0; window.__ws0 = __ws; __ws.onclose({ code: 1006, reason: "" }); });
  await p.waitForFunction(() => G.live && G.ws === window.__ws && window.__ws !== window.__ws0 && G.status === "Listening", null, { timeout: 9000 }); await p.waitForTimeout(500);
  ok(await p.evaluate(() => !!G.resumedAt && G.resumedHeardN === G.heardN), "the pickup didn't note how much the officer had said: " + JSON.stringify(await p.evaluate(() => ({ at: G.resumedAt, n: G.resumedHeardN, heard: G.heardN }))));
  // before the officer says anything on the new line, the service's replay of the last call is still refused
  r = await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send Ruth the agenda", due: "2026-11-30" });
  ok(r.ok === false && /already handled before the line dropped/.test(r.error || ""), "the replayed draft call wasn't refused: " + JSON.stringify(r));
  // the officer's yes on the new line saves the form, from their words; Ara's save_form (the same words as the first form's save a minute earlier) is a late echo
  await said(p, "Save it."); await p.waitForTimeout(300);
  const st = await state(p), l = await p.log();
  ok(st.tasks.some(t => t.text === "Send Ruth the agenda") && await p.evaluate(() => V === null) && /saved the New task form itself, from their words/.test(l), "the yes after the pickup didn't save the second form: " + l.slice(-600));
  r = await ara(p, "save_form", { confirmed: true });
  ok(r.saved === true && r.already && !/save_form came again after the line was picked up/.test(await p.log()) && !/didn't go through/.test(await p.evaluate(() => __sent.join(" "))), "Ara's save_form after the officer's yes was refused as a replay: " + JSON.stringify(r));
  ok(await p.evaluate(() => __sent.filter(s => s.includes("force_message") && s.includes("Task added for Ruth")).length === 2), "the saved line wasn't said by the app itself, once per save");
});

test("Officer's turn watch (Oct 29): no reply after the officer's words gets the taking-a-moment line at 4 s, a line test at 8 s (healthy: a reply request with their words; slow: a fresh line), and no goodbye meanwhile", async (p) => {
  const fire = (p, evs) => p.evaluate((evs) => evs.forEach(e => __ws.onmessage({ data: JSON.stringify(e) })), evs);
  await signIn(p); await p.waitForFunction(() => window.__ws && G.live && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await p.evaluate(() => { const f = window.fetch; window.__fetch0 = f; window.__pingMs = 200; window.fetch = (u, o) => /ping=/.test(String(u)) ? new Promise(res => setTimeout(() => res(new Response("{}")), window.__pingMs)) : f(u, o); window.__said = []; window.__quietMic = true; /* the test browser's pretend mic is loud: the stall watch (officer talking, nothing back) must not run instead */ });
  // a healthy line that is just slow: tick, then a reply request with the officer's words
  await p.evaluate(() => { __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) }); __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_stopped" }) }); G.lastAct = Date.now() - 40000; });
  await said(p, "Let's add a new contact, Jordan Pike.");
  await p.waitForTimeout(5200);
  let log = await p.evaluate(() => ACT.q.concat(__logs.flatMap(l => l.events || [l])).map(a => a.text).join(" | "));
  ok(/No reply started 4 s after the officer spoke \("Let's add a new contact/.test(log) && !/seconds quiet: hanging up/.test(await p.evaluate(() => VLOG.join("\n"))) && await p.evaluate(() => G.live && !G.idleEnding), "no taking-a-moment tick 4 s after the officer's words, or the goodbye fired meanwhile: " + log.slice(-300));
  await p.waitForTimeout(4200);
  const asked = await p.evaluate(() => __sent.filter(s => /response\.create/.test(s) && /The officer just said: \\"Let's add a new contact/.test(s)).length);
  log = await p.evaluate(() => ACT.q.concat(__logs.flatMap(l => l.events || [l])).map(a => a.text).join(" | "));
  ok(asked === 1 && /healthy line: asked for one with their words/.test(log) && await p.evaluate(() => G.asked && !G.turnOpen), "8 s after the officer's words on a healthy line, the app didn't ask once for a reply with their words: " + JSON.stringify({ asked, tail: log.slice(-200) }));
  // a reply arrives: the watch is over
  await fire(p, [{ type: "response.created" }]); await p.waitForTimeout(200);
  ok(await p.evaluate(() => !G.turnOpen), "a reply that started didn't close the officer's turn");
  // the officer's "yes" is answered by the app's own save line before the service reports their speech stopped (the real-line runs, Oct 29): no turn opens, and a finished reply closes one
  await p.evaluate(() => { G.slowSaid = false; __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_stopped" }) }); });
  ok(await p.evaluate(() => !G.turnOpen && G.responding), "speech stopping while the save line was already playing opened a turn");
  await p.evaluate(() => { G.responding = false; G.turnOpen = Date.now() - 1000; G.turnStep = 0; G.respTool = true; __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); }); /* a reply that called a tool: an empty one, or words without the form the officer asked for, is asked again, and that wait is the quiet clock's (Oct 30) */
  await p.waitForTimeout(4500);
  ok(await p.evaluate(() => !G.turnOpen && !G.slowSaid), "a finished reply didn't close the officer's turn (the taking-a-moment line played after the save line)");
  // a partial transcript while the officer is still talking (a long sentence) opens no turn; the turn opens when their speech stops
  await p.evaluate(() => { G.responding = false; G.slowSaid = false; __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) }); __ws.onmessage({ data: JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript: "I met him yesterday at the party, in person. We talked about" }) }); });
  await p.waitForTimeout(4500);
  ok(await p.evaluate(() => !G.turnOpen && !G.slowSaid), "a partial transcript mid-sentence opened the officer's turn (taking-a-moment played while they were still talking)");
  await p.evaluate(() => { __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_stopped" }) }); });
  ok(await p.evaluate(() => !!G.turnOpen), "the officer's speech stopping didn't open their turn");
  await p.evaluate(() => { G.turnOpen = 0; G.responding = false; G.respAsked = false; }); /* the pretend reply is left unfinished so the reply watch doesn't take it for an empty one */
  // a slow line: the test fails and a fresh line asks the officer to say it again
  await p.evaluate(() => { window.__pingMs = 2800; window.__ws0 = __ws; G.slowSaid = false; G.asked = false; clearTimeout(G.askWatch); clearTimeout(G.tickWatch); G.retried = 0; G.spokeInGap = false; G.lastAct = Date.now(); __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) }); __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_stopped" }) }); });
  await said(p, "J Pike at gmail dot com.");
  await p.waitForFunction(() => __ws !== __ws0 && G.live, null, { timeout: 14000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const out = await p.evaluate(() => ({ newLine: __ws !== __ws0, live: G.live, log: ACT.q.concat(__logs.flatMap(l => l.events || [l])).map(a => a.text).join(" | "), again: (G.justNow && G.justNow.text) || "" }));
  ok(out.newLine && out.live && /on a slow line \(test request .*: fresh line/.test(out.log) && /Could you say that again\?/.test(out.again), "a slow line 8 s after the officer's words didn't get a fresh line that asks them to say it again: " + JSON.stringify({ newLine: out.newLine, live: out.live, again: out.again, tail: out.log.slice(-700) }));
});

test("Carverhill's 1:14 PM call (Oct 29): a form with every required field in still has a pending question after a drop, and the reconnect line says where we are first", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.live && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await p.evaluate(() => { window.__quietMic = true; });
  await said(p, "Log an interaction with James Okafor.");
  await ara(p, "show_interaction_draft", { contact_name: "James Okafor" });
  await said(p, "In person."); await ara(p, "show_interaction_draft", { contact_name: "James Okafor", date: "2026-10-29", meetingType: "In person" });
  await said(p, "He's excited about giving to Citizens Alliance."); await ara(p, "show_interaction_draft", { contact_name: "James Okafor", summary: "He's excited about giving to Citizens Alliance." });
  await said(p, "Yes."); await ara(p, "show_interaction_draft", { contact_name: "James Okafor", substantive: true }); await p.waitForTimeout(300);
  // the line drops before the next-step question went out: the fresh line says the form and asks the next step itself, never "say that again"
  await p.evaluate(() => { window.__ws0 = __ws; G.forced = null; G.pendingForce = null; clearTimeout(G.forceTimer); __ws.onclose({ code: 1006 }); }); await p.waitForTimeout(1800);
  const out = await p.evaluate(() => ({ forced: __sent.filter(s => /force_message/.test(s)).map(s => JSON.parse(s).item.content[0].text).pop() || "", told: (G.justNow || {}).text || "", log: ACT.q.concat(__logs.flatMap(l => l.events || [l])).map(a => a.text).join(" | ") }));
  ok(/^Sorry, I lost you for a moment\. We're on the interaction report for James\. A substantive interaction needs a next step/.test(out.forced) && !/say that again/i.test(out.forced) && /says where we are and asks the pending question itself/.test(out.log), "after the drop the app didn't say where we are and ask the form's next-step question: " + JSON.stringify({ forced: out.forced.slice(0, 200), tail: out.log.slice(-200) }));
  ok(/needs its next step; the app asks its own next-step question itself/.test(out.told), "Ara wasn't told the form's position: " + out.told.slice(-300));
  // the next step answered: the read-back follows as usual
  await said(p, "Yes. Call him Friday about the donation."); const r = await ara(p, "show_interaction_draft", { contact_name: "James Okafor", nextStep: "Call James about the donation", nextDue: "2026-10-30" });
  ok(/Yes to save, or no to change something\?$/.test(r.read_back || r.ask_exactly || ""), "the form didn't go on to its read-back after the next step: " + JSON.stringify(r).slice(0, 300));
  // a contact form with everything in and the optional details not yet offered: the position is the save-or-optional question
  await p.evaluate(() => { try { closeOverlay(); } catch (e) {} V = null; });
  await said(p, "New contact, Jordan Pike, email jpike at example dot com."); await ara(p, "show_contact_draft", { first: "Jordan", last: "Pike", email: "jpike@example.com" }); await p.waitForTimeout(300);
  const fp = await p.evaluate(() => { V.askedCap = true; V.opt = null; V.askedOptional = false; V.choice = null; return formPosition(); });
  ok(/^That's everything the new contact form needs for Jordan\. Save it, or add the optional details first\?$/.test(fp.ask), "a complete contact form's position isn't the save-or-optional question: " + JSON.stringify(fp));
});
test("Carverhill's 6:22 and 6:23 PM calls (Oct 29): a question is never a yes, a muted mic blocks the idle hang-up, a save drops the stale read-back", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  // 1. the read-back is waiting for a yes; "Are you there?" (and any question) is not one
  await said(p, "Add a task for Ruth: send her the board deck, due November 30.");
  await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send Ruth the board deck", due: "2026-11-30" });
  let r = await ara(p, "save_form", { confirmed: false });
  ok(/Yes to save, or no to change something\?$/.test(r.read_back || ""), "the form wasn't read back: " + JSON.stringify(r));
  ok(await p.evaluate(() => ["Are you there?", "Is it saved?", "Can you hear me?", "Hello?", "Ara?", "Did you get that?"].every(t => !appYes(t)) && appYes("Yes.") && appYes("Go ahead.") && appYes("That's right.")), "a question counted as a yes");
  await said(p, "Are you there?"); await p.waitForTimeout(400);
  ok(!(await state(p)).tasks.some(t => t.text === "Send Ruth the board deck") && await p.evaluate(() => !!G.saveCheck), "\"Are you there?\" saved the form (6:23 PM call)");
  // 2. the service's idle timer while the phone has the mic muted: no hang-up
  await p.evaluate(() => { G.micMutedAt = Date.now() - 5000; G.lastAct = Date.now() - 40000; __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.timeout_triggered" }) }); }); await p.waitForTimeout(300);
  ok(await p.evaluate(() => G.live && !G.idleEnding && !G.idleAt) && /idle timer\): ignored, (the phone has the microphone muted|a form is open)/.test(await p.log()), "the idle timer hung up while the phone had the mic muted (6:22 PM call): " + JSON.stringify(await p.evaluate(() => [G.live, G.idleEnding])));
  await p.evaluate(() => { const v = V; V = null; G.micMutedAt = Date.now() - 5000; G.lastAct = Date.now() - 40000; G.dropIdle = 0; __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.timeout_triggered" }) }); V = v; }); await p.waitForTimeout(300);
  ok(await p.evaluate(() => G.live && !G.idleEnding && !G.idleAt) && /idle timer\): ignored, the phone has the microphone muted/.test(await p.log()), "with no form open the idle timer hung up while the mic was muted: " + JSON.stringify(await p.evaluate(() => [G.live, G.idleEnding])));
  await p.evaluate(() => { G.micMutedAt = 0; G.dropIdle = 0; });
  // 3. the yes saves; a read-back still waiting to play is dropped, Ara's late telling of it is cut, and the reconnect line says it's saved
  await p.evaluate(() => { window.__noAutoForce = true; });
  await ara(p, "save_form", { confirmed: false }); /* the read-back is forced again and, on this slow line, never starts */
  ok(await p.evaluate(() => G.forced && /Yes to save, or no to change something\?$/.test(G.forced.text)), "no read-back waiting to play");
  await said(p, "Yes."); await p.waitForTimeout(400);
  ok((await state(p)).tasks.some(t => t.text === "Send Ruth the board deck") && await p.evaluate(() => !G.forced || !/Yes to save/.test(G.forced.text)) && /Guard: stale read-back dropped after the save/.test(await p.log()), "the save didn't drop the waiting read-back: " + JSON.stringify(await p.evaluate(() => G.forced && G.forced.text)));
  await p.evaluate(() => { window.__noAutoForce = false; G.forced = null; });
  await p.evaluate(() => { G.bot = ""; G.respSeq = (G.respSeq || 0) + 1; __ws.onmessage({ data: JSON.stringify({ type: "response.created" }) }); __ws.onmessage({ data: JSON.stringify({ type: "response.output_audio_transcript.delta", delta: "New task for Ruth Abernathy: Send Ruth the board deck, due Nov 30. Yes to save, or no to change something?" }) }); }); await p.waitForTimeout(200);
  ok(/scripted line played late: duplicate cut|Scripted line played late after Ara said it: cut the repeat/.test(await p.log()) || await p.evaluate(() => G.dropNext), "Ara's late telling of the saved read-back wasn't cut");
  await p.evaluate(() => { __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "cancelled" } }) }); G.dropNext = false; G.lastBot = "New task for Ruth Abernathy: Send Ruth the board deck, due Nov 30. Yes to save, or no to change something?"; G.lastBotAt = Date.now(); G.lastHeard = null; });
  ok(await p.evaluate(() => !V && /^(Task added for Ruth|It's saved)/.test(lastQuestion().line)), "the reconnect line after a save still asks the old read-back: " + JSON.stringify(await p.evaluate(() => lastQuestion())));
});
test("Carverhill's 7:41 PM call (Oct 29): the state goes to Ara at the save with a receipt, a late save_form after the next-step yes opens the step, the save line is never said twice", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(400);
  ok(/Ara's state confirmed by the voice service in \d+ ms \(call start\)/.test(await p.log()), "the call-start configuration got no receipt: " + (await p.log()).slice(-300));
  // 1. the ask is saved by the officer's yes; the state goes up at that instant and is confirmed
  await said(p, "Record the ask for Elena Vasquez. It was a video call yesterday and she accepted the forty thousand. She's excited to write the check. Next step, pick up the check from Elena, due today.");
  await ara(p, "show_ask_result_draft", { contact_name: "Elena Vasquez", date: new Date(Date.now() - 864e5).toISOString().slice(0, 10), meetingType: "Video call", amount: 40000, response: "Accepted", summary: "She's excited to write the check.", nextStep: "Pick up the check from Elena", nextDue: new Date().toISOString().slice(0, 10) });
  let r = await ara(p, "save_form", { confirmed: false });
  ok(/Yes to save, or no to change something\?$/.test(r.read_back || ""), "no read-back: " + JSON.stringify(r));
  const sentBefore = await p.evaluate(() => __sent.length);
  await said(p, "Yes."); await p.waitForTimeout(500);
  ok((await state(p)).opps.some(o => /Vasquez/.test(o.name) && o.stage === "Commitment"), "the yes didn't save the ask: " + JSON.stringify(await p.evaluate(() => [G.hands, G.saveCheck, !!V, (window.__demo.state.opps || []).map(o => o.name + " " + o.stage), ACT.q.slice(-6).map(a => a.text.slice(0, 100))])));
  const sync = await p.evaluate((n) => __sent.slice(n).map(s => JSON.parse(s)).filter(e => e.type === "session.update" && e.session && e.session.instructions), sentBefore);
  ok(sync.length >= 1 && /No form is open now/.test(sync[0].session.instructions) && /Just now: the app saved and closed the .*Never call save_form/.test(sync[0].session.instructions), "the state didn't go up at the save: " + sync.length);
  ok(/Ara's state sent \(form saved\)/.test(await p.log()) && /Ara's state confirmed by the voice service in \d+ ms \(form saved\)/.test(await p.log()), "no receipt logged for the save: " + (await p.log()).slice(-400));
  ok(await p.evaluate(() => G.sync && G.sync.confirmed >= 2 && G.sync.missed === 0), "the tally is off: " + JSON.stringify(await p.evaluate(() => G.sync)));
  // 2. the save line plays; 13 s later the officer says yes to its next-step question; Grok answers with a late save_form (16 s after the save)
  const line = await p.evaluate(() => G.savedByWordsLine); ok(/Do you want to do that now, yes or no\?$/.test(line) && /record the gift/.test(line), "the save line doesn't end with the next-step question: " + line);
  await p.evaluate((line) => { G.lastBot = line; G.lastBotAt = Date.now(); G.savedAt -= 13000; G.savedByWords -= 13000; G.lastBotAt -= 2000; }, line);
  await said(p, "Yes."); await p.waitForTimeout(300);
  const forcedBefore = await p.evaluate(() => __sent.filter(s => /force_message/.test(s)).length);
  r = await ara(p, "save_form", { confirmed: true });
  ok(r.already && r.saved && /answers the app's question .*a yes to the next step\. Open that step now with its tool/.test(r.note || ""), "the late save_form wasn't routed to the next step: " + JSON.stringify(r));
  ok(await p.evaluate((n) => __sent.filter(s => /force_message/.test(s)).length === n, forcedBefore), "the save line was said again (the 7:41 PM repeat)");
  ok(await p.evaluate(() => __sent.filter(x => !/input_audio_buffer/.test(x)).slice(-3).some(s => /response\.create/.test(s))), "Ara wasn't asked to act on the yes: " + JSON.stringify(await p.evaluate(() => [__sent.slice(-4).map(x => x.slice(0, 120)), G.qCreate, !!G.qTimer, playingLeft(), G.responding, G.asked, G.qGuide])));
  ok(/Guard: late save_form after the save, officer had spoken \("Yes\." to the next-step question\); Ara had the state confirmed \d+ s before, so she acted on an old picture/.test(await p.log()), "the guard wasn't counted as after a confirmed receipt: " + (await p.log()).slice(-300));
  // 3. the same late save_form when the officer said something else: answered silently with their words, never the save line
  await said(p, "What's Elena's capacity?"); await p.waitForTimeout(200);
  r = await ara(p, "save_form", { confirmed: true });
  ok(r.already && /the officer heard it\. Don't say it again\. Answer their last words instead: "What's Elena's capacity\?"/.test(r.note || ""), "other words after the save weren't answered: " + JSON.stringify(r));
  ok(await p.evaluate((n) => __sent.filter(s => /force_message/.test(s)).length === n, forcedBefore), "the save line was said again after other words");
  // 4. the officer silent since the save: the line is still said again (they may not have heard it), and counted
  await p.evaluate(() => { G.lastHeard = { text: "Yes.", n: G.heardN, at: G.savedAt + 100 }; });
  r = await ara(p, "save_form", { confirmed: true });
  ok(r.already && r.said === line && /Guard: save_form after a save, officer silent since/.test(await p.log()), "the re-say for a silent officer is gone: " + JSON.stringify(r));
  // 5. no receipt: the state goes again after 3 s, then the call carries on; the tally shows the miss
  await p.evaluate(() => { window.__noReceipt = true; });
  await p.evaluate(() => syncState("test"));
  await p.waitForTimeout(3400);
  ok(/No receipt for Ara's state in 3 s \(test\): sent again/.test(await p.log()) && await p.evaluate(() => G.sync.resent === 1 && G.sync.missed === 1), "no resend after a missed receipt: " + (await p.log()).slice(-300));
  await p.evaluate(() => { window.__noReceipt = false; });
  await p.waitForTimeout(3400);
  ok(/Ara's state not confirmed after the resend \(test\)/.test(await p.log()) && await p.evaluate(() => !G.syncPending), "the second miss didn't stand down: " + (await p.log()).slice(-200));
  // 6. a reconnect waits for the receipt before the sorry line (and goes on without one)
  await p.evaluate(() => { window.__noReceipt = true; });
  const openBefore = await p.evaluate(() => __sent.length);
  await p.evaluate(() => { __ws.onclose && __ws.onclose({ code: 1006, reason: "" }); });
  await p.waitForFunction((n) => __sent.length > n && __sent.slice(n).some(s => /session\.update/.test(s)), openBefore, { timeout: 8000 }); await p.waitForTimeout(400);
  ok(await p.evaluate(() => !__sent.filter(x => !/input_audio_buffer/.test(x)).slice(-6).some(s => /force_message/.test(s) && /Sorry, I lost you/.test(s))) && /Ara's state sent \((line picked up|new line)\)/.test(await p.log()), "the sorry line didn't wait for the receipt: " + (await p.log()).slice(-300));
  await p.evaluate(() => { window.__noReceipt = false; for (let i = __ws.ackN || 0; i < (__ws.upN || 0); i++) __ws.onmessage({ data: JSON.stringify({ type: "session.updated" }) }); }); await p.waitForTimeout(300); /* one receipt per update the new line was sent */
  ok(await p.evaluate(() => __sent.filter(x => !/input_audio_buffer/.test(x)).slice(-4).some(s => /force_message/.test(s) && /Sorry, I lost you/.test(s))) || (/Ara is asked to say where we were herself \(reconnect, 1 of 3\)/.test(await p.log()) && await p.evaluate(() => __sent.filter(x => !/input_audio_buffer/.test(x)).slice(-4).some(s => /response\.create/.test(s) && /App guidance/.test(s)))), "neither the sorry line nor the where-we-were ask (the Ara route since the 1:51 PM build) followed the receipt: " + JSON.stringify(await p.evaluate(() => __sent.filter(x => !/input_audio_buffer/.test(x)).slice(-4).map(x => x.slice(0, 100)))));
  ok(/State syncs \d+, confirmed \d+ \(median \d+ ms\), missed \d+, resent \d+; guards .*after a confirmed receipt \d+\./.test(await p.evaluate(() => syncSummary())), "no tally for the end row: " + await p.evaluate(() => syncSummary()));
  // 7. a quick yes: the next-step question answered 5 s after the save, inside the 8 s same-yes window, but after the save line started playing (Patient Pat, Oct 29: 6 lost)
  await p.evaluate(() => { G.savedAt = Date.now() - 5000; G.savedByWords = Date.now() - 5000; G.forceStartAt = Date.now() - 3000; G.lastHeard = { text: "Yes.", n: G.heardN, at: Date.now() - 200 }; G.lastBot = G.savedByWordsLine; G.lastBotAt = Date.now() - 3000; });
  r = await ara(p, "save_form", { confirmed: true });
  ok(r.already && /a yes to the next step\. Open that step now with its tool/.test(r.note || ""), "a quick yes inside the 8 s window wasn't routed to the next step: " + JSON.stringify(r));
  // 7b. the save line fell back to Ara (no scripted start): her finished line counts the same way
  await p.evaluate(() => { G.savedAt = Date.now() - 5000; G.savedByWords = Date.now() - 5000; G.forceStartAt = 0; G.lastBot = G.savedByWordsLine; G.lastBotAt = Date.now() - 1000; G.lastHeard = { text: "Yes.", n: G.heardN, at: Date.now() - 200 }; });
  r = await ara(p, "save_form", { confirmed: true });
  ok(r.already && /a yes to the next step\. Open that step now with its tool/.test(r.note || ""), "a quick yes after Ara's own telling of the save line wasn't routed: " + JSON.stringify(r));
  // 8. the same words again with sound, after a words-only copy: one line, not two rows
  const rows = () => p.evaluate(() => ACT.q.filter(a => a.role === "grok").length);
  const before = await rows();
  await p.evaluate(() => { G.lastLine = { text: "Gift recorded for Elena. What would you like to do next?", at: Date.now() - 1500, resp: G.respSeq, audioS: 0, out: 0, echo: 0, state: "running", left: 0 }; G.bot = "Gift recorded for Elena. What would you like to do next?"; G.audioSamples = 48000; __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); });
  ok(await rows() === before && /Ara's line arrived again, this time with sound \(2\.0 s\): the officer hears it once/.test(await p.log()), "the sounded copy was logged as a second telling: " + (await p.log()).slice(-200));
  await p.evaluate(() => { G.bot = "Gift recorded for Elena. What would you like to do next?"; G.audioSamples = 48000; __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); });
  ok(await rows() === before + 1, "a real second telling (after a sounded one) wasn't logged");
});

test("Carverhill's 8:58 AM call (Oct 30): Ara talks but doesn't call the tool; the app asks her again for the tool call at once, up to three times, never opens or fills the form itself", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  const words = (text) => p.evaluate((text) => { [{ type: "response.created" }, { type: "response.output_audio_transcript.delta", delta: text }, { type: "response.done", response: { status: "completed" } }].forEach(e => __ws.onmessage({ data: JSON.stringify(e) })); }, text);
  const asks = () => p.evaluate(() => __sent.map(s => JSON.parse(s)).filter(e => e.type === "response.create" && e.response && e.response.instructions).map(e => e.response.instructions));
  const forced = () => p.evaluate(() => __sent.filter(s => /force_message/.test(s)).length);
  // 1. "Let's create a new contact form": Ara promises the form, no tool call: asked again at once, no form opened by the app, no scripted line
  await said(p, "Let's create a new contact form."); await words("We'll fill in the form together as you talk."); await p.waitForTimeout(150);
  let a = await asks(); ok(a.length === 1 && /Your reply \("We'll fill in the form together as you talk\."\) promised a form but had no tool call, so nothing opened on the screen\. Call that form's tool now/.test(a[0]), "no retry for the promised form: " + JSON.stringify(a));
  ok(await p.evaluate(() => !V), "the app opened the form itself (split brain)"); ok(await forced() === 0, "a scripted line went out instead of the retry: " + await forced());
  ok(/Guard: Ara talked but didn't open the form/.test(await p.log()) && /asked again for the tool call \(1 of 3\)/.test(await p.log()), "the first ask wasn't logged: " + (await p.log()).slice(-300));
  // 2. the retry comes back as words again: asked a second time, no "taking a moment" (the retry was fast)
  await words("Sure, let's add them."); await p.waitForTimeout(150);
  a = await asks(); ok(a.length === 2 && a[1] === a[0], "no second ask: " + a.length); ok(!/taking a moment/.test(await p.log()), "the phone said taking a moment on a fast retry");
  ok(/Ara answered again without the tool call .*asked again \(2 of 3\)/.test(await p.log()), "the second ask wasn't logged");
  // 3. the tool call arrives on the second ask: the ask stands down and the form's scripted first question plays as usual
  let r = await ara(p, "show_contact_draft", {});
  ok(/Ara called show_contact_draft on ask 2 of 3/.test(await p.log()), "the tool call didn't close the ask: " + (await p.log()).slice(-200));
  ok(await p.evaluate(() => V && V.action === "contact"), "the contact form isn't open"); ok(/first and last name/.test(r.ask_exactly || ""), "no name question: " + JSON.stringify(r));
  ok(await p.evaluate(() => !G.nudge), "the ask is still pending after the tool call");
  // 4. "Joe Jones" answered with words only and nothing filled: asked again to fill the form with what they said
  await said(p, "Joe Jones."); await words("Joe Jones it is."); await p.waitForTimeout(150);
  a = await asks(); ok(a.length === 3 && /answered the open New contact form's question with "Joe Jones\.", and your last reply had no tool call, so nothing was filled in\. Call show_contact_draft now with what they said/.test(a[2]), "no retry for the unfilled answer: " + JSON.stringify(a.slice(2)));
  ok(await p.evaluate(() => !(V.data && V.data.first)), "the app filled the name itself (split brain)");
  r = await ara(p, "show_contact_draft", { first: "Joe", last: "Jones" }); ok(/Ara called show_contact_draft on ask 1 of 3/.test(await p.log()), "the fill didn't close the ask");
  ok(/email/i.test(r.ask_exactly || r.status || ""), "the next question didn't follow the fill: " + JSON.stringify(r));
  // 4b. an answer already filled by a tool call, then words to the app's guidance: no ask (Patient Pat drew three on "In person.")
  await said(p, "The mobile is 555 0100."); await ara(p, "show_contact_draft", { first: "Joe", last: "Jones", mobile: "555 0100" }); await words("Okay."); await p.waitForTimeout(150);
  ok((await asks()).length === 3, "words after a tool call that already took the answer drew an ask");
  // 4c. no form open, a bare yes to the next-step question, Ara promises the form in words with no tool call: her own promise draws the ask
  await p.evaluate(() => { V = null; });
  await said(p, "Yes."); await words("Sure, let's add that."); await p.waitForTimeout(150);
  a = await asks(); ok(a.length === 4 && /Your reply \("Sure, let's add that\."\) promised a form but had no tool call, so nothing opened/.test(a[3]), "Ara's promise after a yes drew no ask: " + JSON.stringify(a.slice(3)));
  await ara(p, "show_contact_draft", {}); ok(await p.evaluate(() => !G.nudge), "the ask didn't close on the tool call");
  await said(p, "Joe Jones."); await ara(p, "show_contact_draft", { first: "Joe", last: "Jones" });
  // 5. a side question answered in words is not a missing tool call; a question from Ara isn't either
  const n = (await asks()).length;
  await said(p, "What's the capacity rating for?"); await words("It's the gift range you think they could give."); await p.waitForTimeout(150);
  ok((await asks()).length === n, "a side question was taken for an unfilled answer");
  await said(p, "joe@example.com"); await words("Is that joe at example dot com?"); await p.waitForTimeout(150);
  ok((await asks()).length === n, "Ara's own question was taken for an unfilled answer");
  // 6. three misses: the app stops asking and waits for the officer; the officer speaking stands an ask down
  await said(p, "The email is joe at example dot com."); await words("Got it."); await words("Noted."); await words("Okay."); await words("Fine."); await p.waitForTimeout(150);
  ok((await asks()).length === n + 3 && /Ara still didn't call the tool after 3 asks .*waiting for the officer/.test(await p.log()), "the asks didn't stop at three: " + ((await asks()).length - n));
  ok(await p.evaluate(() => !G.nudge), "an ask is still pending after three misses");
  await said(p, "Mobile is 555 0100."); await words("Thanks."); await p.waitForTimeout(100);
  await p.evaluate(() => __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) })); await p.waitForTimeout(100);
  ok(await p.evaluate(() => !G.nudge) && /The officer spoke: the ask for the tool call stands down/.test(await p.log()), "the officer's words didn't stand the ask down");
});
test("Carverhill's 10:36 AM call (Oct 30): after a drop with no form open Ara says where we were herself (the app checks her reply, asks again, then says it itself); a late yes after a save; Closed Won recommends the next item", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.live && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await p.evaluate(() => { window.__quietMic = true; });
  const words = (text) => p.evaluate((text) => { [{ type: "response.created" }, { type: "response.output_audio_transcript.delta", delta: text }, { type: "response.done", response: { status: "completed" } }].forEach(e => __ws.onmessage({ data: JSON.stringify(e) })); }, text);
  const asks = () => p.evaluate(() => __sent.map(s => JSON.parse(s)).filter(e => e.type === "response.create" && e.response && e.response.instructions).map(e => e.response.instructions));
  const forcedAll = () => p.evaluate(() => __sent.filter(s => /force_message/.test(s)).map(s => JSON.parse(s).item.content[0].text));
  const drop = () => p.evaluate(() => { G.lastBot = ""; G.lastBotAt = Date.now() - 5000; G.lastHeard = { text: "yes", at: Date.now() - 20000 }; G.forced = null; G.pendingForce = null; clearTimeout(G.forceTimer); window.__ws0 = __ws; __ws.onclose({ code: 1006 }); });
  // where we are, by state: nothing yet; a contact on screen; a save; an open form
  let w = await p.evaluate(() => whereWeAre()); ok(w.kind === "none" && /^We hadn't started anything yet\. What would you like to do\?$/.test(w.line), "nothing started: " + JSON.stringify(w));
  const first = await p.evaluate(() => { const c = S.contacts.find(x => !x.capacity && !x.dnc && !x.ally) || S.contacts[0]; S.screen = "contact"; S.sel.contact = c.id; return c.first; });
  w = await p.evaluate(() => whereWeAre()); ok(w.kind === "focus" && new RegExp("^We were on " + first + "\\. ").test(w.line) && /\?$/.test(w.q) && w.who === first, "contact on screen: " + JSON.stringify(w));
  const saved = await p.evaluate(() => { const c = contactById(S.sel.contact); grokSaved("contact", { contact: c }); G.saveAck = null; /* a tapped save's own check is not under test */ return { line: G.savedLine, next: G.lastSaved.nextLine }; }); await p.waitForTimeout(400);
  w = await p.evaluate(() => whereWeAre()); ok(w.kind === "saved" && w.line === saved.line + ". " + saved.next && w.q === (saved.next.match(/[^.?!]*\?/g) || []).pop().trim(), "after a save: " + JSON.stringify(w));
  ok(/Where we are: Contact saved for /.test(await p.evaluate(() => ctxNow())), "Right now doesn't carry where we are: " + await p.evaluate(() => ctxNow()));
  // 1. the line drops after the save line with Ara's last line gone (as on the call): Ara is asked to say where we were; her bare "what would you like to do?" is caught and asked again; her proper line passes
  let n0 = (await asks()).length, f0 = (await forcedAll()).length; await drop(); await p.waitForTimeout(1800);
  let a = await asks(); ok(a.length === n0 + 1 && /say in one sentence where we were \(name \w+\): Contact saved for .*Then ask this question word for word: "Do you want to do that now, yes or no\?"\. Never ask what they'd like to do/.test(a[n0]), "no ask for where we were: " + JSON.stringify(a.slice(n0)));
  ok((await forcedAll()).length === f0, "the app said the line itself in Ara mode: " + JSON.stringify((await forcedAll()).slice(f0)));
  ok(/Reconnected: Ara is asked to say where we were herself \(saved\)/.test(await p.log()), "the reconnect wasn't logged as Ara's: " + (await p.log()).slice(-300));
  await words("Sorry, I lost you for a moment. What would you like to do?"); await p.waitForTimeout(150);
  a = await asks(); ok(a.length === n0 + 2 && /Your last reply \("Sorry, I lost you for a moment\. What would you like to do\?"\) asked an open question\./.test(a[n0 + 1]), "the bare open question wasn't caught: " + JSON.stringify(a.slice(n0 + 1)));
  await words(`Sorry about that. We just saved ${first} as a contact. The next step is to set a capacity rating. Do you want to do that now, yes or no?`); await p.waitForTimeout(150);
  ok(/Ara said where we were on try 2 \(/.test(await p.log()) && await p.evaluate(() => !G.ctxWatch), "her proper line didn't pass: " + (await p.log()).slice(-300));
  ok((await asks()).length === n0 + 2 && (await forcedAll()).length === f0, "asked again after a good line");
  // 2. three misses: a stale line (another person), a line without the question, an open question: the app says the line itself (the floor)
  n0 = (await asks()).length; f0 = (await forcedAll()).length; await drop(); await p.waitForTimeout(1800);
  ok((await asks()).length === n0 + 1, "no ask after the second drop");
  await words("Sorry, I lost you for a moment. We were on Elena Vasquez. Do you want to do that now, yes or no?"); await p.waitForTimeout(150);
  ok(/didn't name \w+ \("Sorry, I lost you for a moment\. We were on Elena/.test(await p.log()), "the stale person wasn't caught: " + (await p.log()).slice(-200));
  await words(`Sorry, I lost you for a moment. We saved ${first}. Let's carry on.`); await p.waitForTimeout(150);
  ok(/didn't ask the pending question \("Sorry, I lost you for a moment\. We saved/.test(await p.log()), "the missing question wasn't caught: " + (await p.log()).slice(-200));
  await words(`Sorry, I lost you for a moment. We saved ${first}. What's next?`); await p.waitForTimeout(500);
  ok(/Ara didn't say where we were in 3 tries \(asked an open question/.test(await p.log()) && /Guard: Ara didn't say where we were/.test(await p.log()), "the floor wasn't logged: " + (await p.log()).slice(-300));
  let f = await forcedAll(); ok(f.length === f0 + 1 && f[f0] === `Sorry, I lost you for a moment. ${saved.line}. ${saved.next}`, "the app's floor line is wrong: " + JSON.stringify(f.slice(f0)));
  ok((await asks()).length === n0 + 3 && await p.evaluate(() => !G.ctxWatch), "asks didn't stop at three: " + ((await asks()).length - n0));
  // 3. the officer speaking stands the ask down
  await drop(); await p.waitForTimeout(1800); await p.evaluate(() => __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) })); await p.waitForTimeout(100);
  await p.evaluate(() => { __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_stopped" }) }); G.speechOn = false; G.cutMidSpeech = false; });
  ok(/The officer spoke: the ask for where we were stands down/.test(await p.log()) && await p.evaluate(() => !G.ctxWatch), "the officer's words didn't stand the ask down");
  // 4. a late yes after the save with her last line gone: Ara is told it was already saved and asked for the next-step question word for word, checked the same way
  await p.evaluate(() => { G.lastBot = ""; G.savedAt = Date.now() - 20000; G.lastSaved.at = Date.now() - 20000; G.staleRbAt = 0; });
  await said(p, "Yes."); let r = await ara(p, "save_form", { confirmed: true });
  ok(r.already && /Say in a few words that it was already saved, then ask this question word for word: "Do you want to do that now, yes or no\?"\. Never ask what's next/.test(r.note || ""), "the late yes wasn't routed to the next-step question: " + JSON.stringify(r));
  ok(await p.evaluate(() => G.ctxWatch && G.ctxWatch.kind === "late-yes"), "no check armed for the late yes");
  await words("That's saved. What's next?"); await p.waitForTimeout(150);
  ok(/asked an open question \("That's saved\. What's next\?"\): asked again for where we were \(2 of 3\)/.test(await p.log()), "the late-yes miss wasn't caught: " + (await p.log()).slice(-200));
  await words("That was already saved. Do you want to do that now, yes or no?"); await p.waitForTimeout(150);
  ok(/Ara said where we were on try 2/.test(await p.log()) && await p.evaluate(() => !G.ctxWatch), "the late-yes line didn't pass: " + (await p.log()).slice(-200));
  // 5. app mode: the scripted line carries where we were after the drop, and after a late yes
  await p.evaluate(() => { window.__reconnectBy = "app"; });
  n0 = (await asks()).length; f0 = (await forcedAll()).length; await p.evaluate(() => { G.lastSaved.at = Date.now(); }); await drop(); await p.waitForTimeout(1800);
  f = await forcedAll(); ok(f.length === f0 + 1 && f[f0] === `Sorry, I lost you for a moment. ${saved.line}. ${saved.next}` && /Reconnected: no question was waiting: where we were \(saved\)/.test(await p.log()), "app mode didn't say where we were: " + JSON.stringify({ f: f.slice(f0), tail: (await p.log()).slice(-200) }));
  ok(!/What would you like to do\?$/.test(f[f0]), "the app's line ended in the open question");
  await p.evaluate(() => { G.lastBot = ""; G.savedAt = Date.now() - 20000; G.lastSaved.at = Date.now() - 20000; });
  await said(p, "Yes."); r = await ara(p, "save_form", { confirmed: true }); await p.waitForTimeout(300);
  f = await forcedAll(); ok(/the app is saying so itself now, with the next step\. Say nothing/.test(r.note || "") && f[f.length - 1] === `That was already saved. ${saved.next}`, "app mode late yes: " + JSON.stringify({ note: r.note, last: f[f.length - 1] }));
  await p.evaluate(() => { window.__reconnectBy = ""; });
  // 6. Closed Won: the top Needs attention item is recommended, with the yes-or-no question, instead of "what would you like to do next?"
  const cw = await p.evaluate(() => ({ line: nextStepLine(S.contacts[0], true), top: (attentionItems()[0] || {}).say || "", first: S.contacts[0].first }));
  ok(cw.top ? cw.line === `That completes the process for ${cw.first}. Next on your list: ${cw.top}. Do you want to do that now, yes or no?` : /What would you like to do next\?$/.test(cw.line), "Closed Won line: " + JSON.stringify(cw));
  // 8. the line drops right after the save line, which is still Ara's last line: she is asked to say it herself (the drop-after-save runs, Oct 30: every one took the app's path)
  await p.evaluate(() => { G.lastSaved.at = Date.now(); G.lastBot = `${G.savedLine}. ${G.lastSaved.nextLine}`; G.lastBotAt = Date.now() - 2000; G.lastHeard = { text: "yes", at: Date.now() - 30000 }; G.staleRbAt = 0; });
  n0 = (await asks()).length; f0 = (await forcedAll()).length; await p.evaluate(() => { G.forced = null; G.pendingForce = null; clearTimeout(G.forceTimer); __ws.onclose({ code: 1006 }); }); await p.waitForTimeout(1800);
  a = await asks(); ok(a.length === n0 + 1 && new RegExp(`say in one sentence where we were \\(name ${first}\\): .*Then ask this question word for word: "Do you want to do that now, yes or no\\?"`).test(a[n0]) && /Reconnected: Ara is asked to say where we were herself \(last line\)/.test(await p.log()), "the save line wasn't handed to Ara after the drop: " + JSON.stringify({ asks: a.slice(n0), tail: (await p.log()).slice(-200) }));
  ok((await forcedAll()).length === f0, "the app said its save line again itself: " + JSON.stringify((await forcedAll()).slice(f0)));
  await words(`Sorry, I lost you for a moment. We saved ${first}. ${saved.next}`); await p.waitForTimeout(150);
  ok(/Ara said where we were on try 1/.test(await p.log()) && await p.evaluate(() => !G.ctxWatch), "her save line didn't pass: " + (await p.log()).slice(-200));
  // 7. a bare "what would you like to do?" from Ara is never said again after a drop: where we were is
  await p.evaluate(() => { G.lastSaved.at = Date.now(); G.lastBot = "What would you like to do?"; G.lastBotAt = Date.now() - 2000; G.lastHeard = { text: "ok", at: Date.now() - 30000 }; });
  const q = await p.evaluate(() => lastQuestion()); ok(q.where && q.where.kind === "saved", "the bare question came back after a drop: " + JSON.stringify(q));
});
// Carverhill, Oct 30 4:09 PM: he opened the app, said nothing, and got the "I'll hang up for now" recording. Now Ara asks first, as a yes-or-no decision, and says goodbye before the hang-up.
test("Quiet hang-up (Oct 30): at 20 s Ara asks whether to hang up, yes or no; no carries on; no answer in 10 s gets her goodbye, the recording when it doesn't play, then the hang-up; yes gets the goodbye at once", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.live && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  const quietStart = () => p.evaluate(() => { window.__noAutoForce = true; window.__quietMic = true; const f = window.__fetch0 || window.fetch; window.__fetch0 = f; window.fetch = (u, o) => /ping=/.test(String(u)) ? new Promise(res => setTimeout(() => res(new Response("{}")), 50)) : f(u, o);
    clearInterval(window.__keep); window.__keep = setInterval(() => { if (!G.live) return clearInterval(window.__keep); G.lastMsg = Date.now(); G.loudAt = 0; G.speechSince = 0; }, 100); /* the test browser's pretend mic beeps */ });
  await quietStart();
  ok(await p.evaluate(() => IDLE_MS === 30000 && IDLE_HF_MS === 30000 && IDLE_ASK_BEFORE_MS === 10000 && idleAskMs() === 20000), "the quiet allowance isn't 30 s in both modes with the question 10 s before");
  // 1. 20 s of quiet: Ara asks, as a scripted line; nothing hangs up yet
  await p.evaluate(() => { G.lastAct = Date.now() - 20500; }); await p.waitForTimeout(2500);
  ok(await p.evaluate(() => G.live && G.idleEnding && !G.goodbye && G.idleAsked > 0 && G.forced && G.forced.text === "Should I hang up now, yes or no?") && /Quiet for 20 s: Ara asks whether to hang up, yes or no/.test(await p.log()), "20 s of quiet didn't get Ara's hang-up question: " + JSON.stringify(await p.evaluate(() => [G.live, G.idleEnding, G.forced && G.forced.text])) + (await p.log()).slice(-300));
  // 2. "No.": the call carries on, the clock starts over
  await p.fire([{ type: "input_audio_buffer.speech_started" }, { type: "input_audio_buffer.speech_stopped" }]); await said(p, "No."); await p.waitForTimeout(300);
  ok(await p.evaluate(() => G.live && !G.idleEnding && !G.idleAt && !G.goodbye && !G.idleAsked && !G.forced) && /The officer answered the hang-up question: their words decide/.test(await p.log()) && /The officer answered the hang-up question with other words: the call carries on/.test(await p.log()), "a no to the hang-up question didn't keep the call going: " + JSON.stringify(await p.evaluate(() => [G.live, G.idleEnding, G.idleAt, G.goodbye, G.idleAsked, !!G.forced])) + (await p.log()).slice(-300));
  await p.fire([{ type: "response.created" }, { type: "response.output_audio.delta", delta: btoa("\0\0\0\0") }, { type: "response.done", response: { status: "completed" } }]); /* Ara answers the no; the officer's turn is over */
  await p.waitForTimeout(3000);
  ok(await p.evaluate(() => G.live && !G.idleEnding && !G.turnOpen), "the hang-up came back although the officer said no: " + JSON.stringify(await p.evaluate(() => [G.idleEnding, G.turnOpen])));
  // 3. the question again, no answer for 10 s: Ara's goodbye; her line doesn't start in 8 s, so the phone's recording stands in, then the hang-up
  await p.evaluate(() => { G.lastAct = Date.now() - 20500; G.forced = null; clearTimeout(G.forceTimer); }); await p.waitForTimeout(2500);
  ok(await p.evaluate(() => G.idleEnding && G.forced && G.forced.text === "Should I hang up now, yes or no?"), "the question wasn't asked a second time");
  await p.evaluate(() => { G.forced = null; clearTimeout(G.forceTimer); window.__said = []; window.__sayLocal0 = window.sayLocal; window.sayLocal = (t, k, name) => { __said.push(t); G.lineEndAt = Date.now() + 1500; return true; }; }); /* the question's own line is out of the way; the recording is pretend */
  await p.waitForTimeout(10500);
  ok(await p.evaluate(() => G.live && G.goodbye && G.forced && G.forced.text === "Goodbye for now. Tap the mic when you need me.") && /Hanging up \(no answer in 10 s\): Ara says goodbye first/.test(await p.log()), "10 s without an answer didn't get Ara's goodbye: " + JSON.stringify(await p.evaluate(() => [G.live, G.goodbye, G.forced && G.forced.text])) + (await p.log()).slice(-300));
  await p.waitForTimeout(8500);
  ok(await p.evaluate(() => __said.includes("I'll hang up for now. Tap the mic when you need me.")) && /Ara's goodbye didn't play: the phone's recording stands in/.test(await p.log()), "the phone's recording didn't stand in for a goodbye that never played: " + JSON.stringify(await p.evaluate(() => __said)) + (await p.log()).slice(-300));
  await p.waitForFunction(() => !G.live, null, { timeout: 5000 }).catch(() => {});
  ok(await p.evaluate(() => !G.live) && /Conversation ended \(30 seconds of quiet\)/.test(await p.log()), "the call didn't end after the stand-in recording: " + (await p.log()).slice(-200));
  await p.evaluate(() => { window.sayLocal = window.__sayLocal0; });
  // 4. a fresh call, the question, "Yes.": the goodbye at once, and the hang-up once it has played
  if (await p.isVisible("#rsmGo")) await p.tap("#rsmGo"); else await p.tap("[data-act2=mic]");
  await p.waitForFunction(() => window.__ws && G.live && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(500);
  await quietStart(); await p.evaluate(() => { G.forced = null; clearTimeout(G.forceTimer); G.lastAct = Date.now() - 20500; }); await p.waitForTimeout(2500);
  ok(await p.evaluate(() => G.idleEnding && G.forced && G.forced.text === "Should I hang up now, yes or no?"), "the fresh call didn't ask at 20 s: " + JSON.stringify(await p.evaluate(() => [G.live, G.idleEnding, G.forced && G.forced.text])));
  await p.fire([{ type: "input_audio_buffer.speech_started" }, { type: "input_audio_buffer.speech_stopped" }]); await said(p, "Yes."); await p.waitForTimeout(400);
  ok(await p.evaluate(() => G.live && G.goodbye && G.idleEnding && G.forced && G.forced.text === "Goodbye for now. Tap the mic when you need me.") && /Hanging up \(the officer said yes \("Yes\."\)\): Ara says goodbye first/.test(await p.log()), "a yes didn't get the goodbye line: " + JSON.stringify(await p.evaluate(() => [G.live, G.goodbye, G.forced && G.forced.text])) + (await p.log()).slice(-300));
  await p.fire([{ type: "response.created" }, { type: "response.output_audio.delta", delta: btoa("\0\0\0\0") }, { type: "response.done", response: { status: "completed" } }]);
  await p.waitForFunction(() => !G.live, null, { timeout: 5000 }).catch(() => {});
  ok(await p.evaluate(() => !G.live) && /Conversation ended \(30 seconds of quiet\)/.test(await p.log()), "the call didn't end after Ara's goodbye played: " + (await p.log()).slice(-200));
  await p.evaluate(() => { clearInterval(window.__keep); window.fetch = window.__fetch0; window.__noAutoForce = false; });
});
test("Carverhill's 5:50 PM call (Oct 30): the late-copy watch ends on a new line, on 'are you there?' and on 'say that again'; with a form open, 13 s of quiet has Ara put the pending question again, once", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.live && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await p.evaluate(() => { window.__noAutoForce = true; window.__quietMic = true; const f = window.__fetch0 || window.fetch; window.__fetch0 = f; window.fetch = (u, o) => /ping=/.test(String(u)) ? new Promise(res => setTimeout(() => res(new Response("{}")), 50)) : f(u, o);
    clearInterval(window.__keep); window.__keep = setInterval(() => { if (!G.live) return clearInterval(window.__keep); G.lastMsg = Date.now(); G.loudAt = 0; G.speechSince = 0; }, 100); });
  const line = "Sorry, I lost you for a moment. We're on the interaction report for Jack. Interaction report for Jack Skeleton: Oct 30, today, Event, summary noted. Yes to save, or no to change something?";
  const arm = () => p.evaluate((line) => { G.lateForced = { text: line, said: 0, at: Date.now(), resp: 7, firstAudio: 30000 }; G.resend = { text: "Which campaign: National, or Idaho?", at: Date.now(), seq: 1, resp: 2, firstAudio: 30000 }; }, line); /* as after a first telling heard with sound */
  // 1. "are you there?" ends both watches, so Ara's repeat of her last line plays
  await arm(); await said(p, "Are you there?"); await p.waitForTimeout(200);
  ok(await p.evaluate(() => !G.lateForced && !G.resend) && /The late-copy watch is off \(the officer asked whether Ara is there\): a repeat of the line is wanted/.test(await p.log()), "'are you there?' didn't end the watch: " + (await p.log()).slice(-300));
  // 2. "say that again" ends them too
  await arm(); await p.evaluate(() => recent(botName(), "Which campaign: National, or Idaho?")); await said(p, "Say that again."); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !G.lateForced && !G.resend) && /watch is off \(the officer asked for the line again\)/.test(await p.log()), "'say that again' didn't end the watch: " + (await p.log()).slice(-300));
  // 3. a new line after a drop ends them: the re-ask on it is its first telling (the 5:50 PM call: it was cut, and 38 s of dead air followed)
  await arm(); const n0 = await p.evaluate(() => __sent.length);
  await p.evaluate(() => { G.drops = 0; G.loudAt = 0; __ws.onclose({ code: 1006, reason: "" }); }); await p.waitForTimeout(1800);
  await p.waitForFunction(() => G.ws && G.status === "Listening", null, { timeout: 8000 }).catch(() => {});
  ok(await p.evaluate(() => !G.lateForced && !G.resend) && /watch is off \(a new line\)/.test(await p.log()), "a new line didn't end the watch: " + (await p.log()).slice(-300));
  await p.evaluate((line) => forceSay(line), line); await p.waitForTimeout(100);
  await p.fire([{ type: "response.created", response: { id: "r9" } }, { type: "response.output_audio_transcript.delta", delta: line }]); await p.waitForTimeout(200);
  ok(await p.evaluate((n0) => !__sent.slice(n0).some(s => /response\.cancel/.test(s)), n0) && !/cut the repeat/.test(await p.log()), "the re-ask on the new line was cut as a duplicate: " + (await p.log()).slice(-300));
  await p.fire([{ type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(200);
  // 4. without a repeat wanted, a late copy is still cut; the after-save watch survives "are you there?"
  await arm(); const n1 = await p.evaluate(() => __sent.length);
  await p.fire([{ type: "response.created", response: { id: "r10" } }, { type: "response.output_audio_transcript.delta", delta: line }]); await p.waitForTimeout(200);
  ok(await p.evaluate((n1) => __sent.slice(n1).some(s => /response\.cancel/.test(s)), n1) && /cut the repeat/.test(await p.log()), "a plain late copy wasn't cut any more: " + (await p.log()).slice(-300));
  await p.fire([{ type: "response.done", response: { status: "cancelled" } }]); await p.waitForTimeout(200);
  await p.evaluate((line) => { G.lateForced = { text: line, said: 0, at: Date.now(), resp: 7, firstAudio: 99999, keep: true }; }, line); await said(p, "Are you there?"); await p.waitForTimeout(200);
  ok(await p.evaluate(() => G.lateForced && G.lateForced.keep), "the after-save watch was ended by 'are you there?'");
  await p.evaluate(() => { G.lateForced = null; });
  // 5. a form open and 13 s of quiet: Ara is asked to put the pending question again, in her own words, once per quiet spell; the app says nothing itself
  await p.evaluate(() => { window.__noAutoForce = false; }); /* the form's own scripted question plays, as on a phone */
  await said(p, "Create a new contact for Jack Skeleton."); await ara(p, "show_contact_draft", { first: "Jack", last: "Skeleton" }); await p.evaluate(() => { G.turnOpen = 0; }); /* the fake service answered the turn with the tool call */
  await p.waitForFunction(() => G.status === "Listening" && !G.forced && !G.pendingForce && !G.downAt, null, { timeout: 8000 }).catch(() => {}); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => FORM_REASK_MS === 13000), "the form re-ask isn't at 13 s");
  const n2 = await p.evaluate(() => __sent.length);
  await p.evaluate(() => { G.asked = false; G.forced = null; G.pendingForce = null; G.turnOpen = 0; G.downAt = 0; if (G.silentWait) { clearTimeout(G.silentWait.resend); G.silentWait = null; } G.lastAct = Date.now() - 13500; clearTimeout(G.forceTimer); }); /* the soundless lines above left a sound wait behind */ await p.waitForTimeout(2500);
  ok(/Quiet for 1[34] s with the New contact form open: Ara is asked to put the pending question again/.test(await p.log()), "13 s of quiet with a form open didn't get the re-ask: " + JSON.stringify(await p.evaluate(() => [!!V, G.turnOpen, G.asked, !!G.forced, !!G.pendingForce, !!G.silentWait, G.downAt, G.status, G.idleEnding])) + (await p.log()).slice(-300));
  ok(await p.evaluate((n2) => __sent.slice(n2).some(s => { const x = JSON.parse(s); return x.type === "response.create" && /quiet for 1[34] seconds/.test(x.response && x.response.instructions || "") && /email address or mobile number/.test(x.response.instructions); }), n2), "Ara wasn't asked for the pending question with its words: " + JSON.stringify(await p.evaluate((n2) => __sent.slice(n2).slice(-2), n2)).slice(0, 400));
  ok(await p.evaluate((n2) => !__sent.slice(n2).some(s => /force_message/.test(s)), n2), "the app put the question itself as a scripted line: " + JSON.stringify(await p.evaluate((n2) => __sent.slice(n2).filter(s => /force_message/.test(s)).map(s => s.slice(0, 200)), n2)) + (await p.log()).slice(-500));
  await p.evaluate(() => { G.asked = false; }); await p.waitForTimeout(2500);
  ok((await p.log()).split("Ara is asked to put the pending question again").length === 2, "the re-ask came twice in one quiet spell: " + (await p.log()).split(" | ").filter(t => /Quiet for|asked to put|Reconnect|taking a moment/.test(t)).slice(-8).join(" | "));
  await p.evaluate(() => { clearInterval(window.__keep); window.fetch = window.__fetch0; V = null; });
});
};
