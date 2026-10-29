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
  ok(r.saved === false && /Save it, or change something\?$/.test(r.read_back) && /Send Ruth the board deck/.test(r.read_back) && !/Not saved|call save_form/.test(r.read_back), "no clean read-back from the finished draft: " + JSON.stringify(r));
  ok(await p.evaluate(() => /Send Ruth the board deck.*Save it, or change something\?$/.test((__sent.map(x => JSON.parse(x)).filter(x => x.item && x.item.type === "force_message").pop() || { item: { content: [{ text: "" }] } }).item.content[0].text)), "the read-back wasn't the app's own scripted line");
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
  ok(/Carry on where you were/.test(line) && /The app has just said, in your voice, "Sorry, I lost you for a moment\. /.test(line) && !/went through just before the drop|Saved so far/.test(line), "the reconnect line still rebuilds Ara's memory of the save (Oct 28): " + line.slice(0, 300));
  const again = await ara(p, "save_form", { confirmed: true });
  ok(again.saved === true && again.already && /already saved/.test(again.status || again.note || ""), "saving again after the drop didn't say it was already saved: " + JSON.stringify(again));
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
  ok(await p.evaluate(() => __ws === __ws0 && G.idleEnding && G.forced && /hang up for now/.test(G.forced.text)), "a live line with a slow test was reconnected instead of the normal quiet hang-up (a scripted goodbye)");
  await p.evaluate(() => { clearInterval(__keep); G.responding = true; __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) }); });
  await p.waitForTimeout(3400); // long enough for a pending scripted line's fallback, which must not happen
  const off = await p.evaluate(() => ({ live: G.live, ending: G.idleEnding, forced: !!G.forced, fallback: __sent.some(s => s.includes("hang up for now") && JSON.parse(s).type === "response.create"), cancel: __sent.some(s => JSON.parse(s).type === "response.cancel") }));
  ok(off.live && !off.ending && !off.forced && !off.fallback && off.cancel, "the officer's late answer didn't call off the hang-up cleanly: " + JSON.stringify(off));
});

test("Hands-free: words said while the line was down make Ara ask for them again, and she doesn't start over", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send Ruth the agenda" });
  await p.evaluate(() => { G.spokeInGap = true; window.__ws0 = __ws; __ws.onclose({ code: 1006 }); }); await p.waitForTimeout(1500);
  const line = await p.evaluate(() => __sent.filter(s => s.includes("Sorry, I lost you")).pop() || ""), now = await p.evaluate(() => (G.justNow || {}).text || "");
  ok(/Sorry, I lost you for a moment\. When is it due\?/.test(line) && /say that again/.test(now) && /"New task" form still needs/.test(now) && await p.evaluate(() => !!V), "the reconnect didn't re-ask the task's question or keep the form: " + line.slice(0, 300) + " | " + now.slice(0, 300));
  ok(await p.evaluate(() => !G.spokeInGap), "the missed-words flag stayed on after the line came back");
});

test("Hands-free: after a save Ara says the undo line once per call, never 'Saved: X saved', and offers the next step", async (p) => {
  await signIn(p);
  await said(p, "I'm driving"); await p.waitForTimeout(900);
  const who = await p.evaluate(() => { const S = window.__demo.state, o = S.opps.find(o => o.stage !== "Closed"); const c = S.contacts.find(c => c.id === o.contactId); return c.first + " " + c.last; });
  const saveTask = async (text) => { await said(p, `Add a task for ${who}: ${text.toLowerCase()}, due November 30.`); await ara(p, "show_task_draft", { contact_name: who, text, due: "2026-11-30" }); await ara(p, "save_form", { confirmed: false }); await said(p, "Yes, save it."); return ara(p, "save_form", { confirmed: true }); };
  const a0 = await saveTask("Send the board deck"), b0 = await saveTask("Send the agenda"); /* the app saved on the yes and said the line itself; save_form reports it as already said */
  const a = Object.assign({}, a0, { ask_exactly: a0.ask_exactly || a0.said }), b = Object.assign({}, b0, { ask_exactly: b0.ask_exactly || b0.said });
  ok(a.saved && /Say undo/.test(a.ask_exactly), "the first save has no undo line: " + JSON.stringify(a));
  ok(b.saved && b.ask_exactly && !/Say undo/.test(b.ask_exactly), "the second save repeats the undo line: " + JSON.stringify(b));
  ok(![a.ask_exactly, b.ask_exactly].some(s => /Saved: /.test(s)), "a save line still starts with 'Saved:': " + a.ask_exactly);
  ok(/^Task added for \w+\. Say undo if that's wrong\. The next step in the process (to move \w+ to [\w ]+ is|is to confirm \w+'s move) to .*\. Do you want to do that now\?$/.test(a.ask_exactly), "the save line isn't the scripted save plus next step: " + a.ask_exactly);
  ok(await p.evaluate(() => !grokInstructions().includes("whether to stop")), "Ara's instructions still ask whether to stop");
  // a bare no to "Do you want to do that now?" gets the app's own "What would you like to do?"; "no, <step>" is left to Ara (Carverhill, Oct 28)
  await p.evaluate(() => { __sent.length = 0; }); await said(p, "No."); await p.waitForTimeout(600);
  ok(await p.evaluate(() => __sent.some(s => s.includes("force_message") && s.includes("What would you like to do?"))) && await p.evaluate(() => ACT.q.concat(__logs.flatMap(l => l.events || [l])).some(a => /a no to the next step: the app asks what they'd like to do/.test(a.text))), "a bare no to the next step didn't get the app's question");
  await p.evaluate(() => { __sent.length = 0; recent(botName(), "The next step in the process to move Ruth to Ask Planning is to add a planned ask. Do you want to do that now?"); }); await said(p, "No, record a gift."); await p.waitForTimeout(600);
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
  ok(r.saved === false && /Do you want to set that now\? If so, tell me the step and when it.s due/.test(r.ask_exactly || "") && (await p.isChecked("#f_substantive")), "the yes wasn't taken, or the next step wasn't asked: " + JSON.stringify(r));
  const today = await p.evaluate(() => todayISO());
  await said(p, "Make the ask, today."); // the officer answers the next-step question (Oct 25: a next step the officer never said is dropped)
  r = await ara(p, "show_interaction_draft", { contact_name: "Ruth Abernathy", nextStep: "Make the ask", nextDue: today });
  ok(/due [A-Z][a-z]+ \d+, today\. Save it, or change something\?$/.test(r.read_back || ""), "the read-back doesn't say the due date is today: " + JSON.stringify(r));
  ok(await p.evaluate((d) => dateSaid(d).endsWith("(today)"), today), "dateSaid has no day word");
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
  ok(/Save it, or change something\?$/.test(r.read_back || ""), "the finished report wasn't read back: " + JSON.stringify(r));
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
  ok(r.saved === false && /Save it, or change something\?$/.test(r.read_back || "") && !(await state(p)).contacts.some(c => c.last === "Moss"), "an incomplete read-back by Ara was accepted: " + JSON.stringify(r));
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
  const log = () => p.evaluate(() => ACT.q.concat(__logs.flatMap(l => l.events || [l])).map(a => a.text).join(" | "));
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
  ok(/Save it, or change something\?$/.test(r.read_back || ""), "the second form wasn't read back: " + JSON.stringify(r));
  await p.evaluate(() => { G.convId = "c-oct29"; G.convAt = Date.now(); G.loudAt = 0; window.__ws0 = __ws; __ws.onclose({ code: 1006, reason: "" }); });
  await p.waitForFunction(() => G.live && G.ws === window.__ws && window.__ws !== window.__ws0 && G.status === "Listening", null, { timeout: 9000 }); await p.waitForTimeout(500);
  ok(await p.evaluate(() => !!G.resumedAt && G.resumedHeardN === G.heardN), "the pickup didn't note how much the officer had said: " + JSON.stringify(await p.evaluate(() => ({ at: G.resumedAt, n: G.resumedHeardN, heard: G.heardN }))));
  // before the officer says anything on the new line, the service's replay of the last call is still refused
  r = await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send Ruth the agenda", due: "2026-11-30" });
  ok(r.ok === false && /already handled before the line dropped/.test(r.error || ""), "the replayed draft call wasn't refused: " + JSON.stringify(r));
  // the officer's yes on the new line saves the form, from their words; Ara's save_form (the same words as the first form's save a minute earlier) is a late echo
  await said(p, "Save it."); await p.waitForTimeout(300);
  const st = await state(p), l = await log();
  ok(st.tasks.some(t => t.text === "Send Ruth the agenda") && await p.evaluate(() => V === null) && /saved the New task form itself, from their words/.test(l), "the yes after the pickup didn't save the second form: " + l.slice(-600));
  r = await ara(p, "save_form", { confirmed: true });
  ok(r.saved === true && r.already && !/save_form came again after the line was picked up/.test(await log()) && !/didn't go through/.test(await p.evaluate(() => __sent.join(" "))), "Ara's save_form after the officer's yes was refused as a replay: " + JSON.stringify(r));
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
  await p.evaluate(() => { G.responding = false; G.respAsked = false; }); /* the pretend reply is left unfinished so the reply watch doesn't take it for an empty one */
  // a slow line: the test fails and a fresh line asks the officer to say it again
  await p.evaluate(() => { window.__pingMs = 2800; window.__ws0 = __ws; G.slowSaid = false; G.asked = false; clearTimeout(G.askWatch); clearTimeout(G.tickWatch); G.retried = 0; G.spokeInGap = false; G.lastAct = Date.now(); __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) }); __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_stopped" }) }); });
  await said(p, "J Pike at gmail dot com.");
  await p.waitForFunction(() => __ws !== __ws0 && G.live, null, { timeout: 14000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const out = await p.evaluate(() => ({ newLine: __ws !== __ws0, live: G.live, log: ACT.q.concat(__logs.flatMap(l => l.events || [l])).map(a => a.text).join(" | "), again: (G.justNow && G.justNow.text) || "" }));
  ok(out.newLine && out.live && /on a slow line \(test request .*: fresh line/.test(out.log) && /Could you say that again\?/.test(out.again), "a slow line 8 s after the officer's words didn't get a fresh line that asks them to say it again: " + JSON.stringify({ newLine: out.newLine, live: out.live, again: out.again, tail: out.log.slice(-700) }));
});
};
