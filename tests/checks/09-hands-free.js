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
  // the app reads a finished draft back itself, as a scripted line, without waiting for Ara to call save_form (Oct 25: she said "Tap Confirm")
  ok(r.saved === false && /Shall I save it\?$/.test(r.read_back) && /Send Ruth the board deck/.test(r.read_back) && !/Not saved|call save_form/.test(r.read_back), "no clean read-back from the finished draft: " + JSON.stringify(r));
  ok(await p.evaluate(() => /Send Ruth the board deck.*Shall I save it\?$/.test((__sent.map(x => JSON.parse(x)).filter(x => x.item && x.item.type === "force_message").pop() || { item: { content: [{ text: "" }] } }).item.content[0].text)), "the read-back wasn't the app's own scripted line");
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
  ok(r.saved === true && /undo/.test(r.say), "not saved after yes: " + JSON.stringify(r));
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
  await p.evaluate(() => { clearTimeout(G.askWatch); clearTimeout(G.tickWatch); G.asked = false; window.__noAutoForce = true; }); // the pretend service never answered the earlier reply requests, and leaves the goodbye line pending
  await p.evaluate(() => { window.__ws0 = __ws; G.lastAct = Date.now() - 31000; G.loudAt = 0; const keep = setInterval(() => { if (!G.live) return clearInterval(keep); G.lastMsg = Date.now(); G.loudAt = 0; G.speechSince = 0; }, 100); window.__keep = keep; }); // the test browser's pretend mic beeps
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
  const line = await p.evaluate(() => __sent.filter(s => s.includes("Sorry, I lost you")).pop() || "");
  ok(/say that again/.test(line) && /never ask \\"what would you like to do\\" while a form is open/.test(line) && /Send Ruth the agenda/.test(line), "the reconnect didn't ask for the missed words or keep the form: " + line.slice(0, 300));
  ok(await p.evaluate(() => !G.spokeInGap), "the missed-words flag stayed on after the line came back");
});

test("Hands-free: after a save Ara says the undo line once per call, never 'Saved: X saved', and offers the next step", async (p) => {
  await signIn(p);
  await said(p, "I'm driving"); await p.waitForTimeout(900);
  const who = await p.evaluate(() => { const S = window.__demo.state, o = S.opps.find(o => o.stage !== "Closed"); const c = S.contacts.find(c => c.id === o.contactId); return c.first + " " + c.last; });
  const saveTask = async (text) => { await said(p, `Add a task for ${who}: ${text.toLowerCase()}, due November 30.`); await ara(p, "show_task_draft", { contact_name: who, text, due: "2026-11-30" }); await ara(p, "save_form", { confirmed: false }); await said(p, "Yes, save it."); return ara(p, "save_form", { confirmed: true }); };
  const a = await saveTask("Send the board deck"), b = await saveTask("Send the agenda");
  ok(a.saved && /Say undo/.test(a.say), "the first save has no undo line: " + JSON.stringify(a));
  ok(b.saved && !/Say undo/.test(b.say), "the second save repeats the undo line: " + JSON.stringify(b));
  ok(![a.say, b.say].some(s => /Saved: /.test(s)), "a save line still starts with 'Saved:': " + a.say);
  ok(/Next is to .*Want to do that now\?/.test(a.say), "the save line doesn't offer the next step: " + a.say);
  ok(await p.evaluate(() => !grokInstructions().includes("whether to stop")), "Ara's instructions still ask whether to stop");
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
  ok(/one at a time/.test(r.ask_exactly || r.status || ""), "the opportunity draft didn't open: " + JSON.stringify(r) + JSON.stringify((await state(p)).contacts.filter(c => c.first === "Pat")));
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
  ok(/Substantive: no/.test(r.read_back || ""), "the read-back doesn't say whether it was substantive: " + JSON.stringify(r));
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
  await ara(p, "show_interaction_edit_draft", { contact_name: "Pat Moss", substantive: true, nextStep: "Send the New Hampshire plan", nextDue: "2026-11-05" });
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  const st = await state(p);
  ok(st.tasks.some(t => t.text === "Send the New Hampshire plan") && st.interactions.some(i => i.substantive && /New Hampshire/.test(i.summary)), "the edit didn't save substantive with its task");
  // Ara talked past the tapped save: the app tells her again
  ok(await p.evaluate(() => __sent.join(" ").includes("just tapped Save changes")), "no notice of the tapped save");
  await p.evaluate(() => { G.saveAck = Object.assign(G.saveAck || {}, { at: Date.now() - 1000 }); [{ type: "response.created" }, { type: "response.output_audio_transcript.delta", delta: "Go ahead and tap it." }, { type: "response.done", response: { status: "completed" } }].forEach(e => __ws.onmessage({ data: JSON.stringify(e) })); });
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => __sent.join(" ").includes("Correction: the officer already tapped Save changes")), "Ara wasn't told again about the save she missed");
});

test("Oct 24 call fixes: the phone pausing the sound doesn't end the call, and Carry on keeps hands-free on", async (p) => {
  await signIn(p);
  await said(p, "I'm driving"); await p.waitForTimeout(900);
  await p.evaluate(() => G.ctx.suspend()); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => G.live && G.ctx.state === "running" && !G.soundPausedAt), "the call ended or the sound didn't come back after a short pause");
  await p.evaluate(() => { G.ctx.resume = () => Promise.resolve(); return G.ctx.suspend(); });
  await p.waitForTimeout(7000);
  ok(await p.evaluate(() => !G.live), "the call didn't end when the sound stayed paused");
  ok(await p.isVisible("#rsmGo"), "no Carry on after the sound stayed paused");
  await p.tap("#rsmGo"); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => G.live && G.hands), "hands-free was lost after Carry on");
  ok(await p.evaluate(() => __sent.join(" ").includes("Hands-free mode is still on")), "Ara wasn't told hands-free is still on");
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
  // if xAI doesn't play a scripted line within 5 s, Ara is asked to say it; if it then plays late, the repeat is cut
  await p.evaluate(() => { window.__noAutoForce = true; forceSay("Test line here please.", "", "FALLBACK please say Test line."); }); await p.waitForTimeout(3400);
  ok(!(await p.evaluate(() => __sent.some(x => x.includes("FALLBACK please say Test line.")))), "the fallback came before 5 s");
  await p.waitForTimeout(2000);
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
});

test("Hands-free: an interaction report is never read back without the substantive answer, and a due date today is said as today", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await said(p, "I'm driving"); await p.waitForTimeout(900);
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
  ok(/Next step due: [A-Z][a-z]+ \d+, today\. Shall I save it\?$/.test(r.read_back || ""), "the read-back doesn't say the due date is today: " + JSON.stringify(r));
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
  ok(/Shall I save it\?$/.test(r.read_back || ""), "the finished report wasn't read back: " + JSON.stringify(r));
  await said(p, "Yes, let's go ahead and do that."); await p.waitForTimeout(200);
  r = await ara(p, "show_cultivation_decision", { contact_name: "James Okafor", decision: "Move to Cultivation" });
  const after = await p.evaluate(() => ({ n: S.interactions.length, form: V && V.action, hf: S.history[0] && S.history[0].hf, log: ACT.q.concat(__logs.flatMap(l => l.events || [l])).map(a => a.text).join(" | ") }));
  ok(after.n === n0 + 1 && !after.form && /saved the Interaction report form before the next one opened/.test(after.log) && /refused: the officer hasn't asked for the Move to Cultivation\? form/.test(after.log), "the yes didn't save the report, or the unasked Cultivation form opened anyway (Oct 25: a form opens only on the officer's word): " + JSON.stringify(after));
  ok(await p.evaluate(() => __sent.some(s => s.includes("The officer's yes saved the Interaction report form first"))), "Ara wasn't told the report was saved first");
  await p.evaluate(() => recent(botName(), "Next is to confirm the move to Cultivation. Want to do that now?")); await said(p, "Yes.");
  r = await ara(p, "show_cultivation_decision", { contact_name: "James Okafor", decision: "Move to Cultivation" });
  ok(await p.evaluate(() => V && V.action === "cultivate"), "the Cultivation form didn't open after the officer's yes to Ara's offer: " + JSON.stringify(r));
  // the Cultivation decision read back, no yes yet: another form has to wait
  r = await ara(p, "save_form", { confirmed: false });
  ok(/Moving James to Cultivation means you, as the gift officer/.test(r.read_back || ""), "the Cultivation read-back lacks its explanation: " + JSON.stringify(r));
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
  ok(r.saved === false && /Shall I save it\?$/.test(r.read_back || "") && !(await state(p)).contacts.some(c => c.last === "Moss"), "an incomplete read-back by Ara was accepted: " + JSON.stringify(r));
});
};
