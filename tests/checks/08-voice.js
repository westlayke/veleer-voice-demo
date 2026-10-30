// Checks: Ara (voice), simulated: contacts, ratings, details, spelling, voice commands and her instructions. tests/bot.js loads this file and passes in its helpers.
module.exports = ({ test, ok, fresh, signIn, state, tab, ara, said, titleOf, PAGE, fs, path }) => {

test("Ara: a new contact gets the other contact detail, then the optional fields with the capacity rating", async (p) => {
  await signIn(p);
  await p.waitForFunction(() => G.live, null, { timeout: 8000 }); await p.evaluate(() => { G.hands = false; paintCall(); }); // this check starts in tap mode; hands-free is on by default since Oct 25
  let r = await ara(p, "show_contact_draft", { first: "Maya", last: "Lin" });
  ok(r.still_needed && r.still_needed.some(x => /Email or mobile/.test(x)) && r.ask_exactly === "What's Maya's email address or mobile number?", "the app didn't ask for an email or mobile itself: " + JSON.stringify(r));
  // after a reconnect the form's position is that question, not "that's everything the form needs" (6:58 PM call, Oct 29)
  ok(await p.evaluate(() => formPosition().ask === "What's Maya's email address or mobile number?"), "the form position with neither email nor mobile isn't the email-or-mobile question: " + JSON.stringify(await p.evaluate(() => formPosition())));
  await said(p, "No email."); ok(await p.evaluate(() => formPosition().ask === "What's Maya's mobile number?"), "after \"no email\" the position isn't the mobile question: " + JSON.stringify(await p.evaluate(() => formPosition())));
  r = await ara(p, "show_contact_draft", { first: "Maya", last: "Lin", email: "maya@example.org" });
  ok(/mobile number/.test(r.ask_exactly || r.next || ""), "Ara was not asked for the mobile too: " + JSON.stringify(r));
  // the rating an opportunity will need is asked right away, by the app's own line (Carverhill, Oct 25); then the rest of the details are offered
  r = await ara(p, "show_contact_draft", { first: "Maya", last: "Lin", email: "maya@example.org" });
  ok(r.field === "capacity" && /Maya's capacity rating, which an opportunity needs/.test(r.ask_exactly || ""), "the rating wasn't asked for after the email: " + JSON.stringify(r));
  ok((await p.textContent("#f_capacity option:checked")).trim() === "No rating set", "the rating does not default to No rating set");
  await said(p, "C.");
  r = await ara(p, "show_contact_draft", { first: "Maya", last: "Lin", email: "maya@example.org", capacity: "C" });
  ok(r.choice === "saveOrOpt" && /That's everything the new contact form needs for Maya\. Save it, or add the optional details first\?$/.test(r.ask_exactly || ""), "the optional details didn't start after the rating, led by the app: " + JSON.stringify(r));
  r = await ara(p, "show_contact_draft", { first: "Maya", last: "Lin", email: "maya@example.org", capacity: "C", howMet: "Town hall" });
  ok(/tap/.test(r.status) && !/more details/.test(r.status) && !r.ask_exactly, "a question repeated: " + JSON.stringify(r));
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  ok((await state(p)).contacts.find(c => c.first === "Maya").capacity === "C", "the rating was not saved with the contact");
});
test("Ara: no email, so only the mobile is asked for, the number the officer said is waited for, and no email is asked for as well", async (p) => {
  await signIn(p);
  await p.waitForFunction(() => G.live, null, { timeout: 8000 }); await p.evaluate(() => { G.hands = false; paintCall(); });
  await said(p, "New contact, Priya Natarajan. She has no email.");
  let r = await ara(p, "show_contact_draft", { first: "Priya", last: "Natarajan" });
  ok(r.still_needed && r.still_needed.some(x => /^Mobile number \(the officer said there is no email/.test(x)) && !r.still_needed.some(x => /Email or mobile/.test(x)), "after \"no email\" the app didn't ask for just the mobile: " + JSON.stringify(r.still_needed));
  // the officer reads the number out, but Grok's call doesn't carry it (Oct 27 spoken run): the app asks for the same call again with the number, not the officer to repeat it
  await said(p, "The mobile is two zero eight, five five five, zero one four seven.");
  r = await ara(p, "show_contact_draft", { first: "Priya", last: "Natarajan" });
  ok(/said a phone number \(the digits 2085550147\)/.test(r.status || "") && !r.still_needed, "the number the officer said wasn't waited for: " + JSON.stringify(r));
  r = await ara(p, "show_contact_draft", { first: "Priya", last: "Natarajan", mobile: "208-555-0147" });
  ok(!/email/i.test(r.status || "") && r.field === "capacity", "an email was asked for as well, or the rating wasn't asked next: " + JSON.stringify(r));
  // the other way round: no mobile, so only the email is asked for
  await p.evaluate(() => { V = null; renderOverlay(); });
  await said(p, "Another one, Tom Reyes, he doesn't have a cell phone.");
  r = await ara(p, "show_contact_draft", { first: "Tom", last: "Reyes" });
  ok(r.still_needed && r.still_needed.some(x => /^Email address \(the officer said there is no mobile/.test(x)), "after \"no cell\" the app didn't ask for just the email: " + JSON.stringify(r.still_needed));
  r = await ara(p, "show_contact_draft", { first: "Tom", last: "Reyes", email: "tom@example.org" });
  ok(!/mobile/i.test(r.status || "") && r.field === "capacity", "a mobile was asked for as well: " + JSON.stringify(r));
});
test("Jacqueline's call: a dropped rating is said to be not caught before it's asked for (never \"noted\"), and \"what fields are left?\" gets the list", async (p) => {
  await signIn(p);
  await p.waitForFunction(() => G.live, null, { timeout: 8000 }); await p.evaluate(() => { G.hands = false; paintCall(); });
  await said(p, "New contact, Dana Fox, email dana at example dot org, mobile five five five, zero one zero, zero one nine nine.");
  let r = await ara(p, "show_contact_draft", { first: "Dana", last: "Fox", email: "dana@example.org", mobile: "555-010-0199", capacity: "B" });
  ok(r.field === "capacity" && /^I didn't catch the capacity rating from you, so it's not on the form\. Next, Dana's capacity rating, which an opportunity needs\./.test(r.ask_exactly || ""), "the dropped rating wasn't owned up to before the rating question: " + JSON.stringify(r));
  let n = await p.evaluate(() => __sent.length);
  await said(p, "What fields are left?"); await p.waitForTimeout(400);
  let forced = await p.evaluate((n) => __sent.slice(n).map(s => JSON.parse(s)).filter(e => e.item && e.item.type === "force_message").map(e => e.item.content[0].text), n);
  ok(forced.length === 1 && /^Everything required is in on the new contact form\. You could still add how we met and capacity rating\. Next, Dana's capacity rating/.test(forced[0]) && /which an opportunity needs\. (A is \$250,000 and up|A to E: which fits Dana)/.test(forced[0]), "\"what fields are left?\" with everything required in didn't list the optional ones and the pending question: " + JSON.stringify(forced));
  // a form with required fields still empty: the list, then Ara asks for the first one
  await p.evaluate(() => { V = null; G.cmdAt = 0; renderOverlay(); }); // (the command's own guard against a repeated tool call is not what's checked here)
  await said(p, "Plan an ask for Ruth Abernathy.");
  r = await ara(p, "show_ask_plan_draft", { contact_name: "Ruth Abernathy" });
  ok(r.still_needed && r.still_needed.length === 2, "the planned ask didn't need its fields: " + JSON.stringify(r));
  n = await p.evaluate(() => __sent.length);
  await said(p, "Um, what's still needed?"); await p.waitForTimeout(400);
  forced = await p.evaluate((n) => __sent.slice(n).map(s => JSON.parse(s)).filter(e => e.item && e.item.type === "force_message").map(e => e.item.content[0].text), n);
  ok(forced.length === 1 && /^Still needed on the add planned ask form: planned ask date and amount\. Optional, if you want them: participants in the ask\.$/.test(forced[0]), "the list of fields left is wrong: " + JSON.stringify(forced));
  // a dropped amount the form needs: the app says it didn't catch it, then Ara asks (the tool result carries what was said)
  await p.waitForTimeout(900); await said(p, "On December first."); // the command's 800 ms guard against a repeated tool call has passed
  r = await ara(p, "show_ask_plan_draft", { contact_name: "Ruth Abernathy", plannedDate: "2026-12-01", amount: 25000 });
  ok(/^I didn't catch the amount from you, so it's not on the form\. How much is the amount\?$/.test(r.ask_exactly || "") && r.still_needed && r.still_needed.includes("Amount") && /Still needed: Amount/.test(r.next || "") && /never say "noted"/.test(r.next || ""), "a dropped required amount wasn't owned up to before the ask: " + JSON.stringify(r));
});
test("A touch on the mic button warms the voice line, and the tap's call uses it (Oct 28: a second off the greeting)", async (p) => {
  await signIn(p); await p.waitForFunction(() => G.live, null, { timeout: 8000 });
  await p.evaluate(() => endCall("test")); await p.waitForTimeout(1200); // the app sits open with a pass ready
  const before = await p.evaluate(() => (window.__wsUrls || []).length);
  await p.dispatchEvent("[data-act2=mic]", "pointerdown"); await p.waitForTimeout(150); // a finger lands on the mic: the line starts opening
  ok(await p.evaluate((n) => !!G.warm && !!G.warm.ws && (window.__wsUrls || []).length === n + 1, before), "the touch didn't start opening a line");
  const warmWs = await p.evaluateHandle(() => G.warm.ws);
  await p.tap("[data-act2=mic]"); await p.waitForFunction(() => G.live && G.ws, null, { timeout: 8000 }); await p.waitForTimeout(400);
  ok(await p.evaluate((w) => G.ws === w && !G.warm && G.ws.warmed === true, warmWs), "the call didn't take over the warmed line");
  ok(await p.evaluate(() => __sent.filter(s => /"session\.update"/.test(s)).length >= 1 && __sent.filter(s => /force_message/.test(s) && /Hi Sam/.test(s)).length === 1), "the warmed line was set up twice, or the greeting said twice: " + (await p.evaluate(() => __sent.filter(s => /force_message/.test(s)).length)));
  // a touch that never becomes a tap: the warmed line is closed unused
  await p.evaluate(() => endCall("test")); await p.waitForTimeout(1200);
  await p.dispatchEvent("[data-act2=mic]", "pointerdown"); await p.waitForTimeout(150);
  ok(await p.evaluate(() => !!G.warm && !!G.warm.ws), "the second touch didn't warm a line");
  await p.evaluate(() => { const w = G.warm; w.at -= 30000; return w; }); // older than the limit
  await p.tap("[data-act2=mic]"); await p.waitForFunction(() => G.live && G.ws, null, { timeout: 8000 }); await p.waitForTimeout(300);
  ok(await p.evaluate(() => G.ws && !G.ws.warmed && !G.warm), "a stale warmed line was used instead of a fresh one");
});
test("xAI review items (Oct 28): service idle timer, streaming transcription, truncate on interruption, one outstanding reply request, binary audio, quick thinking, error and session logs", async (p) => {
  await signIn(p); await p.waitForFunction(() => G.live && G.ws, null, { timeout: 8000 }); await p.waitForTimeout(500);
  const sent = () => p.evaluate(() => __sent.filter(s => typeof s === "string").map(s => JSON.parse(s)));
  let xs = await sent();
  const first = xs.find(e => e.type === "session.update" && e.session && e.session.turn_detection && e.session.tools);
  ok(first && first.session.turn_detection.idle_timeout_ms === 33000, "the service's idle timer isn't set 3 s after the phone's hands-free wait: " + JSON.stringify(first && first.session.turn_detection));
  ok(xs.some(e => e.type === "session.update" && e.session.audio && e.session.audio.input.transcription && e.session.audio.input.transcription.model === "grok-transcribe" && e.session.audio.input.transcription.language_hint === "en"), "streaming transcription (grok-transcribe) isn't asked for in its own update");
  ok(!xs.some(e => e.type === "session.update" && e.session.reasoning), "reasoning effort was sent although the setting is the default");
  // hands-free off: the service's idle timer follows the shorter wait
  let n = await p.evaluate(() => __sent.length); await p.evaluate(() => setHandsFree(false)); await p.waitForTimeout(100);
  ok((await sent()).slice(-6).some(e => e.type === "session.update" && e.session.turn_detection && e.session.turn_detection.idle_timeout_ms === 15000 && !e.session.tools), "hands-free off didn't shorten the service's idle timer to 15 s");
  // the officer's words as they speak, and the session.created time, are logged
  await p.evaluate(() => { __ws.onmessage({ data: JSON.stringify({ type: "session.created", session: {} }) }); __ws.onmessage({ data: JSON.stringify({ type: "conversation.item.input_audio_transcription.updated", transcript: "new contact priya" }) }); });
  ok(await p.evaluate(() => G.heardLive === "new contact priya" && VLOG.some(l => /session created \d+ ms after the tap/.test(l)) && VLOG.some(l => /officer \(so far\) "new contact priya"/.test(l))), "the live transcript or the session.created time wasn't logged");
  // interruption: Ara's audio is playing, the officer starts talking: the service is told how much was heard
  n = await p.evaluate(() => __sent.length);
  await p.evaluate(() => { const audio = btoa(String.fromCharCode(...new Array(48000).fill(0))); [{ type: "response.created" }, { type: "response.output_audio.delta", item_id: "item_7", delta: audio }, { type: "response.output_audio.delta", item_id: "item_7", delta: audio }].forEach(e => __ws.onmessage({ data: JSON.stringify(e) })); });
  await p.waitForTimeout(300); await p.evaluate(() => __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) })); await p.waitForTimeout(100);
  const tr = (await sent()).slice(n - 0).find(e => e.type === "conversation.item.truncate");
  ok(tr && tr.item_id === "item_7" && tr.content_index === 0 && tr.audio_end_ms >= 0 && tr.audio_end_ms < 1500, "the interruption wasn't reported with the heard duration: " + JSON.stringify(tr));
  await p.evaluate(() => __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "cancelled" } }) })); await p.waitForTimeout(100);
  // a reply request still outstanding when the officer speaks is dropped: one question, one answer; no cancel is sent, nothing is being generated yet (Oct 28: "Cancellation failed: no active response found")
  n = await p.evaluate(() => __sent.length);
  await p.evaluate(() => { G.asked = true; G.askedAt = Date.now(); G.responding = false; __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) }); });
  ok(await p.evaluate((n) => !__sent.slice(n).some(s => /"response\.cancel"/.test(s)) && !G.asked && ACT.q.some(a => /that request is dropped/.test(a.text)), n), "the outstanding reply request wasn't dropped (without a cancel) when the officer spoke");
  // ...except right after a hands-free save: a repeated "yes, save it" is the same answer and the save confirmation stays requested (Oct 28 12:54 PM call: the officer heard nothing)
  n = await p.evaluate(() => __sent.length);
  await p.evaluate(() => { G.asked = true; G.askedAt = Date.now(); G.responding = false; G.savedAt = Date.now() - 2000; G.savedLine = "Ask recorded"; __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) }); });
  ok(await p.evaluate((n) => !__sent.slice(n).some(s => /"response\.cancel"/.test(s)) && G.asked, n), "the save confirmation was cancelled by a yes repeated right after the save");
  await p.evaluate(() => { G.asked = false; G.savedAt = 0; });
  // the service's idle timer fired (road noise kept the phone's from firing): its check-in is dropped and the app's goodbye goes
  n = await p.evaluate(() => __sent.length);
  await p.evaluate(() => { window.__noAutoForce = true; G.lastAct = Date.now() - 40000; __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.timeout_triggered" }) }); }); await p.waitForTimeout(300); /* quiet longer than the phone allows (no form open) */
  ok(await p.evaluate((n) => __sent.slice(n).some(s => /"response\.cancel"/.test(s)) && G.idleEnding && G.dropNext, n), "the service's idle timer didn't start the hang-up");
  await p.evaluate(() => { [{ type: "response.created" }, { type: "response.output_audio.delta", delta: "AAAA" }, { type: "response.done", response: { status: "completed" } }].forEach(e => __ws.onmessage({ data: JSON.stringify(e) })); }); await p.waitForTimeout(300);
  ok(await p.evaluate((n) => !G.dropNext && !G.responding && __sent.slice(n).some(s => /force_message/.test(s) && /hang up for now/.test(s)), n), "the check-in wasn't dropped, or the goodbye line wasn't sent");
  await p.evaluate(() => { G.idleEnding = false; clearTimeout(G.idleTimer); G.forced = null; window.__noAutoForce = false; });
  // an error event is logged as a step (a refused session.update keeps the previous settings)
  await p.evaluate(() => __ws.onmessage({ data: JSON.stringify({ type: "error", error: { code: "invalid_session_update", message: "unknown field" } }) }));
  ok(await p.evaluate(() => ACT.q.some(x => /Voice service error invalid_session_update: unknown field/.test(x.text))), "the error event wasn't logged");
  // binary audio: a frame from the line is played as Ara's audio, the mic frame goes out as bytes, and the session asks for binary both ways
  await p.evaluate(() => { S.settings.binAudio = true; });
  ok(await p.evaluate(() => sessionCfg().audio.input.transport === "binary" && sessionCfg().audio.output.transport === "binary"), "the session doesn't ask for binary transport");
  await p.evaluate(() => { __ws.onmessage({ data: JSON.stringify({ type: "response.created" }) }); __ws.onmessage({ data: new ArrayBuffer(4800) }); });
  ok(await p.evaluate(() => G.audioSamples === 2400 && G.status === "Speaking"), "a binary frame wasn't played as audio: " + (await p.evaluate(() => G.audioSamples + " " + G.status)));
  n = await p.evaluate(() => __sent.length); await p.evaluate(() => sendBin(new Int16Array(2400).buffer));
  ok(await p.evaluate((n) => __sent.slice(n).some(x => x instanceof ArrayBuffer && x.byteLength === 4800), n), "the mic frame didn't go out as bytes");
  await p.evaluate(() => { delete S.settings.binAudio; __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); });
  // quick thinking: the setting sends reasoning effort none on the next call's set-up
  await p.evaluate(() => { S.settings.reasoning = "none"; save(); endCall("test"); }); await p.waitForTimeout(1200);
  await p.tap("[data-act2=mic]"); await p.waitForFunction(() => G.live && G.ws, null, { timeout: 8000 }); await p.waitForTimeout(500);
  ok((await sent()).slice(-30).some(e => e.type === "session.update" && e.session.reasoning && e.session.reasoning.effort === "none"), "quick thinking wasn't sent");
  await p.evaluate(() => { delete S.settings.reasoning; save(); });
});
test("Ara: an interaction report keeps only what the officer said (substantive, outcome, next step are dropped when invented, kept when said)", async (p) => {
  await signIn(p);
  await said(p, "I met Ken Ito this morning, we talked about the gala and the North Dakota work.");
  let r = await ara(p, "show_interaction_draft", { contact_name: "Ken Ito", date: "2026-10-25", meetingType: "In person", summary: "Met Ken this morning; talked about the gala and the North Dakota work.", substantive: true, outcome: "Interested, continue cultivation", nextStep: "Follow up on Ken's interest in the North Dakota work", nextDue: "2026-11-01" });
  let d = await p.evaluate(() => V && V.data);
  ok(d && !d.nextStep && !d.nextDue && !d.outcome && !d.substantive, "fields the officer never said stayed on the form: " + JSON.stringify(d && { nextStep: d.nextStep, outcome: d.outcome, substantive: d.substantive }));
  ok(/substantive interaction/i.test(r.ask_exactly || ""), "the app didn't ask the substantive question after dropping Grok's own answer: " + JSON.stringify(r));
  ok(/Left out of the form because the officer never said it: substantive, next step, outcome/.test(r.status || r.error || r.next || ""), "the tool reply didn't tell Ara what was left out: " + JSON.stringify(r));
  await said(p, "Yes, it was.");
  r = await ara(p, "show_interaction_draft", { contact_name: "Ken Ito", substantive: true, nextStep: "Follow up on Ken's interest in the North Dakota work", nextDue: "2026-11-01" });
  ok(r.still_needed && r.still_needed.some(x => /Next step/.test(x)), "after the officer's yes the next step wasn't asked for: " + JSON.stringify(r));
  // Carverhill's 9:14 AM call (Oct 29): the invented next step was dropped and the officer heard only "I didn't catch the next step from you", so the app now asks its own question in the same line
  ok(/^I didn't catch the next step from you, so it's not on the form\. A substantive interaction needs a next step, which becomes a Task for you\. Do you want to set that now\? If so, tell me the step and when it's due\.$/.test(r.ask_exactly || "") && /The app asked whether to set the next step itself/.test(r.next || ""), "a dropped invented next step didn't get the app's own next-step question: " + JSON.stringify(r));
  ok(/the app asks its own next-step question/.test(await p.evaluate(() => ACT.q.map(a => a.text).join(" | "))), "the app's next-step question wasn't logged");
  await said(p, "I'll give him a call next Tuesday.");
  r = await ara(p, "show_interaction_draft", { contact_name: "Ken Ito", nextStep: "Call Ken", nextDue: "2026-10-27" });
  d = await p.evaluate(() => V && V.data);
  ok(d && d.nextStep === "Call Ken" && d.substantive === true, "the next step the officer gave was not kept: " + JSON.stringify(d && { nextStep: d.nextStep, substantive: d.substantive }));
  ok(!r.still_needed || !r.still_needed.length, "something was still needed after the officer gave the next step: " + JSON.stringify(r.still_needed));
  // said outright: everything is kept and the substantive question isn't asked again
  await p.evaluate(() => { V = null; renderOverlay(); });
  await said(p, "Had a substantive meeting with Ruth Abernathy, she's interested, next step is a follow-up call next Friday.");
  r = await ara(p, "show_interaction_draft", { contact_name: "Ruth Abernathy", date: "2026-10-25", meetingType: "In person", summary: "Substantive meeting with Ruth; she is interested.", substantive: true, outcome: "Interested, continue cultivation", nextStep: "Follow-up call", nextDue: "2026-10-30" });
  d = await p.evaluate(() => V && V.data);
  ok(d && d.substantive === true && d.outcome === "Interested, continue cultivation" && d.nextStep === "Follow-up call", "fields the officer did say were dropped: " + JSON.stringify(d && { nextStep: d.nextStep, outcome: d.outcome, substantive: d.substantive }));
  ok(!r.ask_exactly && !r.still_needed?.length, "the substantive question was asked although the officer said the word: " + JSON.stringify(r));  // "we talked about his interest in the work" is not the officer calling him interested (Oct 25 rerun, 1 of 10)
  await p.evaluate(() => { V = null; G.recent = []; renderOverlay(); }); // a fresh exchange: the earlier "she's interested" about Ruth is gone
  await said(p, "Had a substantive call with Ken Ito, we talked about his interest in the North Dakota work, next step is a follow-up call Friday.");
  await ara(p, "show_interaction_draft", { contact_name: "Ken Ito", date: "2026-10-25", meetingType: "Phone call", summary: "Talked about his interest in the North Dakota work.", substantive: true, outcome: "Interested, continue cultivation", nextStep: "Follow-up call", nextDue: "2026-10-30" });
  d = await p.evaluate(() => V && V.data);
  ok(d && !d.outcome && d.substantive === true && d.nextStep === "Follow-up call", "an outcome matched on the word interest in passing was kept: " + JSON.stringify(d && { outcome: d.outcome, substantive: d.substantive, nextStep: d.nextStep }));
});

test("Ara: a rating the officer never gave is dropped and the reply says so; hands-free asked for with a task doesn't ask what to do", async (p) => {
  await signIn(p);
  await said(p, "Let's just do email. It's bg at example dot org.");
  let r = await ara(p, "show_contact_draft", { first: "Barry", last: "Good", email: "bg@example.org", ally: false, dnc: false, capacity: "E" });
  const cap = await p.evaluate(() => V && V.data && V.data.capacity);
  ok(!cap, "the rating nobody gave stayed on the form: " + JSON.stringify(cap));
  ok(/Left out of the form because the officer never said it: capacity rating/.test(r.status || r.next || ""), "Ara wasn't told the rating was left out (Oct 25: she read back her own E): " + JSON.stringify(r));
  await p.evaluate(() => { V = null; renderOverlay(); });
  await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 });
  const n = await p.evaluate(() => __sent.length);
  await said(p, "Can you put me in hands-free mode, please? And then I'd like to create a new contact.");
  await ara(p, "set_hands_free", { on: true }); await p.waitForTimeout(600);
  const forced = await p.evaluate((n) => __sent.slice(n).map(s => JSON.parse(s)).filter(e => e.item && e.item.type === "force_message").map(e => e.item.content[0].text), n);
  ok(forced.length && forced.every(t => !/What would you like to do\?/.test(t)) && /Hands-free is on/.test(forced[0]), "the hands-free line asked what to do although the officer had just said (Oct 25 call): " + JSON.stringify(forced));
});

test("Oct 25 call notes: a new form opens only on the officer's word, a repeated optional answer after a drop is ignored and the campaign is asked, next step explained then asked, Speaking follows the sound, a cut status line", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  // 5. after "Yes." to "Shall I save it?" Grok opened the ask-result form: refused until Ara offers it and the officer says yes
  await p.evaluate(() => { G.lastSaved = { at: Date.now() }; recent(botName(), "Add planned ask for Ruth Abernathy. Amount: $10,000. Shall I save it?"); }); await said(p, "Yes.");
  let r = await ara(p, "show_ask_result_draft", { contact_name: "Ruth Abernathy", amount: 10000 });
  ok(r.ok === false && /hasn't asked for the .* form/.test(r.error || "") && /Want to do that now/.test(r.error || "") && !(await p.evaluate(() => V && V.action === "ask")), "an unasked form opened: " + JSON.stringify(r));
  // "let's go add an ask" asks for the planned ask form by name (refused on the Oct 26 drive)
  await said(p, "Yeah, let's go add an ask."); ok(await p.evaluate(() => formAskedFor("plan")), "\"let's go add an ask\" didn't count as asking for the planned ask form");
  await p.evaluate(() => recent(botName(), "Next could be recording the ask. Want to do that now?")); await said(p, "Yes, let's do that.");
  r = await ara(p, "show_ask_result_draft", { contact_name: "Ruth Abernathy", amount: 10000 });
  ok(await p.evaluate(() => V && V.action === "ask"), "the form didn't open after the officer's yes to Ara's offer: " + JSON.stringify(r));
  await p.evaluate(() => { V = null; renderOverlay(); });
  await said(p, "I met Ken Ito at the Halloween party yesterday.");
  r = await ara(p, "show_interaction_draft", { contact_name: "Ken Ito", date: "2026-10-24", meetingType: "Event", summary: "Met Ken at the Halloween party." });
  ok(await p.evaluate(() => V && V.action === "interaction"), "a form the officer asked for in their own words didn't open: " + JSON.stringify(r));
  // 3. the next step is explained, then asked, never suggested
  await said(p, "Yes, it was substantive.");
  r = await ara(p, "show_interaction_draft", { contact_name: "Ken Ito", substantive: true });
  const need = (r.still_needed || []).find(x => /^Next step/.test(x)) || "";
  ok(/becomes a Task for the officer/.test(need) && /ask whether they want to set it now/.test(need) && /never suggest/.test(need) && !/follow-up call next week/.test(need), "the next-step prompt still suggests a step or doesn't explain it: " + need);
  // 1. the optional campaign question: a repeat of the entity answer after a drop is not a campaign answer
  await p.evaluate(() => { V = null; renderOverlay(); const c = S.contacts.find(x => x.first === "Ken"); c.capacity = "B"; S.opps = S.opps.filter(o => o.contactId !== c.id); save(); });
  await said(p, "Yes, create an opportunity for Ken.");
  r = await ara(p, "show_opportunity_draft", { contact_name: "Ken Ito" });
  ok(/Save it, or add the optional details first\?$/.test(r.ask_exactly || ""), "the opportunity form didn't offer its optional details: " + JSON.stringify(r)); // the policy's one question (Oct 28)
  await said(p, "The details."); r = await ara(p, "optional_fields", { step: "start" });
  ok(/entity/.test(r.ask_exactly || ""), "the opportunity's optional questions didn't start with the entity: " + JSON.stringify(r));
  await said(p, "The Idaho entity."); r = await ara(p, "optional_fields", { step: "answer", value: "The Idaho entity" });
  await said(p, "The PAC."); r = await ara(p, "optional_fields", { step: "answer", value: "C.A. Idaho PAC" });
  ok(/Which campaign: National, or Idaho\?/.test(r.ask_exactly || ""), "the campaign wasn't asked after the entity: " + JSON.stringify(r));
  r = await ara(p, "optional_fields", { step: "answer", value: "The PAC. C.A. Idaho PAC." }); // Grok re-sent the entity answer after a reconnect (Oct 25)
  let d = await p.evaluate(() => V && V.data);
  ok(!d.campaign && /Which campaign: National, or Idaho\?/.test(r.ask_exactly || ""), "the repeated entity answer filled the campaign: " + JSON.stringify({ campaign: d.campaign, r }));
  await said(p, "Idaho."); r = await ara(p, "optional_fields", { step: "answer", value: "Idaho" });
  d = await p.evaluate(() => V && V.data);
  ok(d.campaign === "Idaho" && /potential amount/.test(r.ask_exactly || ""), "the campaign the officer gave wasn't taken: " + JSON.stringify({ campaign: d.campaign, r }));
  // 2. "Speaking" only while sound is scheduled to play
  const st = await p.evaluate(() => { G.status = "Speaking"; G.playHead = 0; G.sources = []; idleCheck(); return G.status; });
  ok(st === "Listening", "the screen kept saying Speaking with nothing playing: " + st);
  // 4. a status recording still playing when the line returns is cut, and "You're back" isn't said over it
  const back = await p.evaluate(() => { const n = ACT.q.length; G.downAt = Date.now() - 6000; G.lineEndAt = Date.now() + 2000; G.lineSrc = { stop() { window.__lineStopped = true; } }; downEnd(true); return { stopped: window.__lineStopped, log: ACT.q.slice(n).map(a => a.text).join(" | ") }; });
  ok(back.stopped && /status line was cut short/.test(back.log) && !/You're back with Ara/.test(back.log), "the status recording wasn't cut when the line returned: " + JSON.stringify(back));
});

test("A $0 amount from the voice model counts as missing: the form shows it blank, Ara is told, and Save asks for it", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await said(p, "Plan an ask for Ruth, the C3, December first.");
  const r = await ara(p, "show_ask_plan_draft", { contact_name: "Ruth Abernathy", fund: "Citizens Alliance C3", campaign: "National", plannedDate: "2026-12-01", amount: 0 });
  ok((r.still_needed || []).some(x => /^Amount/.test(x)), "a $0 amount was not asked for: " + JSON.stringify(r).slice(0, 300));
  ok(/amount of \$0/.test(JSON.stringify(r)), "Ara wasn't told the $0 was left out: " + JSON.stringify(r).slice(0, 300));
  ok((await p.inputValue("#f_amount")) === "", "the form shows the $0: " + (await p.inputValue("#f_amount")));
  await p.fill("#f_amount", "0"); await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  ok((await p.isVisible("#draftErr")) && /Amount/.test(await p.textContent("#draftErr")), "Save accepted a $0 amount");
  await p.fill("#f_amount", "25000"); await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  ok((await state(p)).opps.some(o => o.asks && o.asks.some(a => a.amount === 25000)), "the real amount did not save");
});

test("Evidence rule: a value the officer never said is left off the form and named to Ara (meeting type, amount, entity, payment method), said values stay", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await said(p, "Log an interaction with Ruth. I met her for lunch today and we talked about the Idaho campaign.");
  let r = await ara(p, "show_interaction_draft", { contact_name: "Ruth Abernathy", meetingType: "Phone call", date: new Date().toISOString().slice(0, 10), summary: "Lunch, talked about the Idaho campaign." });
  ok((await p.inputValue("#f_meetingType")) === "", "a meeting type the officer never gave stayed on the form: " + (await p.inputValue("#f_meetingType")));
  ok(/type/.test(JSON.stringify(r)) && /Left out/.test(JSON.stringify(r)), "Ara wasn't told the meeting type was left out: " + JSON.stringify(r).slice(0, 300));
  ok((await p.inputValue("#f_summary")).length > 5, "the summary (free text) was wrongly dropped");
  await said(p, "It was in person."); r = await ara(p, "show_interaction_draft", { contact_name: "Ruth Abernathy", meetingType: "In person" });
  ok((await p.inputValue("#f_meetingType")) === "In person", "a meeting type the officer gave was not kept");
  await p.tap("[data-act=cancel]").catch(() => {}); await p.waitForTimeout(300);
  await said(p, "Plan an ask for Ruth, the Idaho C4, ten thousand dollars, in December.");
  r = await ara(p, "show_ask_plan_draft", { contact_name: "Ruth Abernathy", fund: "C.A. Idaho PAC", amount: 25000, plannedDate: "2026-12-01" });
  ok((await p.inputValue("#f_amount")) === "", "an amount the officer never said stayed on the form: " + (await p.inputValue("#f_amount")));
  ok((await p.inputValue("#f_fund")) !== "C.A. Idaho PAC", "an entity the officer never named stayed on the form: " + (await p.inputValue("#f_fund"))); // the opportunity's own entity fills in instead
  ok(/amount asked \(ask for it\)/.test(JSON.stringify(r)) || /amount \(ask for it\)/.test(JSON.stringify(r)), "Ara wasn't told the amount was left out: " + JSON.stringify(r).slice(0, 400));
  r = await ara(p, "show_ask_plan_draft", { contact_name: "Ruth Abernathy", fund: "C.A. Idaho C4", amount: 10000, plannedDate: "2026-12-01" });
  ok((await p.inputValue("#f_amount")) !== "" && (await p.inputValue("#f_fund")) === "C.A. Idaho C4", "the amount and entity the officer said were not kept: " + JSON.stringify(r).slice(0, 300));
  ok((await p.inputValue("#f_plannedDate")) === "2026-12-01", "a date the officer gave (December) was not kept");
});

test("Ara: the phone checks whether each line could be heard, and \"Are you there?\" logs the readings of the last line and has Ara repeat it", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  const logged = () => p.evaluate(() => ACT.q.concat(__logs.flatMap(l => l.events || [l])).map(a => a.text).join(" | "));
  // a line with words but no voice audio is flagged (the readings: audio received, speaker level, mic echo, sound state)
  await p.evaluate(() => { [{ type: "response.created" }, { type: "response.output_audio_transcript.delta", delta: "What's her last name?" }, { type: "response.done", response: { status: "completed" } }].forEach(e => __ws.onmessage({ data: JSON.stringify(e) })); });
  await p.waitForTimeout(2600);
  ok(/Ara's line may not have been heard: no voice audio came from the voice service, only the words \("What's her last name\?"\)/.test(await logged()), "a line without voice audio wasn't flagged: " + (await logged()).slice(-300));
  ok(await p.evaluate(() => !!(G.out && G.outAn) && G.lastLine && G.lastLine.text === "What's her last name?"), "the speaker-path analyser or the last-line record is missing");
  // a line with sound is not flagged
  await p.evaluate(() => { [{ type: "response.created" }, { type: "response.output_audio.delta", delta: btoa(String.fromCharCode(...new Uint8Array(4800))) }, { type: "response.output_audio_transcript.delta", delta: "Smith, got it." }].forEach(e => __ws.onmessage({ data: JSON.stringify(e) })); G.audioSamples = 30000; G.outPeak = 0.2; __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); });
  await p.waitForTimeout(2600);
  ok(!/may not have been heard: [^|]*Smith, got it/.test(await logged()), "a line with sound was flagged as not heard");
  // "Are you there?" (Carverhill, Oct 25: it always means he heard nothing for a while)
  const n0 = await p.evaluate(() => __sent.length);
  await said(p, "Are you there?"); await p.waitForTimeout(400);
  const out = await p.evaluate((n) => ({ log: ACT.q.map(a => a.text).join(" | "), guide: __sent.slice(n).map(s => JSON.parse(s)).filter(x => x.type === "response.create").map(x => x.response.instructions).join(" ") }), n0);
  ok(/The officer asked whether Ara is there: her last line was \d+ s ago \("Smith, got it\."\): 1\.3 s of voice audio, speaker level 0\.2\d\d, mic heard [\d.]+ while it played, sound running; sound now running/.test(out.log), "the readings of the last line weren't logged: " + out.log.slice(-400));
  ok(/asked whether you are there\. Say "I'm here\." and then say your last line again, word for word/.test(out.guide), "Ara wasn't asked to repeat her last line: " + out.guide);
  // every log event carries an id, so the key holder can drop a batch that arrives twice
  ok(await p.evaluate(() => ACT.q.every(e => /^[a-z0-9]{10,}$/.test(e.id || ""))), "log events have no ids");
  // a form left open from an earlier conversation is in Right now, so a fresh conversation knows about it (Oct 25: "Weren't we working on a form for Pauline?")
  await ara(p, "show_contact_draft", { first: "Pauline", last: "Smith" });
  ok(/The "New contact" form is still open on screen, not saved yet\. Filled in so far: First name: Pauline; Last name: Smith[^\n]*If the officer asks about it, carry on with it/.test(await p.evaluate(() => ctxNow())), "the open form isn't in Right now: " + await p.evaluate(() => ctxNow().replace(/\n/g, " / ").slice(0, 400)));
  // a line with words and no sound, once a line has been heard in the call: "Ara's taking a moment", then the line is asked for again; a second silent copy reconnects (Carverhill, Oct 28)
  const nS = await p.evaluate(() => { G.audioEver = true; __sent.length = 0; return __sent.length; });
  await p.evaluate(() => { [{ type: "response.created" }, { type: "response.output_audio_transcript.delta", delta: "Which campaign: National, or Idaho?" }, { type: "response.done", response: { status: "completed" } }].forEach(e => __ws.onmessage({ data: JSON.stringify(e) })); });
  await p.waitForTimeout(5000);
  ok(/came without sound: the phone says she's taking a moment, then asks for it again/.test(await logged()) && await p.evaluate(() => __sent.some(s => /Say it again now, word for word: \\"Which campaign: National, or Idaho\?\\"/.test(s))), "a silent line wasn't asked for again: " + (await logged()).slice(-300));
  // her sound already on the clock when the judgement runs (Oct 28 10:03 PM: the recording played over her sounded copy): a false alarm, no recording, no resend
  await p.evaluate(() => { __sent.length = 0; G.silentAgain = null; [{ type: "response.created" }, { type: "response.output_audio_transcript.delta", delta: "Which campaign: National, or Idaho?" }, { type: "response.done", response: { status: "completed" } }, { type: "response.created" }, { type: "response.output_audio.delta", delta: btoa(String.fromCharCode(...new Uint8Array(4800))) }].forEach(e => __ws.onmessage({ data: JSON.stringify(e) })); });
  await p.waitForTimeout(2600);
  ok(/false alarm, nothing said/.test(await logged()) && await p.evaluate(() => !__sent.some(s => /Idaho/.test(s))), "a judged-silent line with sound already queued wasn't treated as a false alarm: " + (await logged()).slice(-300));
  await p.evaluate(() => { __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); G.audioOn = false; });
  // a reply with sound starting before the resend goes out: the resend stands down (Oct 28 10:03 PM: a line heard twice)
  await p.evaluate(() => { __sent.length = 0; G.silentAgain = null; [{ type: "response.created" }, { type: "response.output_audio_transcript.delta", delta: "Which campaign: National, or Pennsylvania?" }, { type: "response.done", response: { status: "completed" } }].forEach(e => __ws.onmessage({ data: JSON.stringify(e) })); });
  await p.waitForTimeout(2600);
  await p.evaluate(() => { [{ type: "response.created" }, { type: "response.output_audio.delta", delta: btoa(String.fromCharCode(...new Uint8Array(4800))) }, { type: "response.output_audio_transcript.delta", delta: "Which campaign: National, or Pennsylvania?" }].forEach(e => __ws.onmessage({ data: JSON.stringify(e) })); G.audioSamples = 30000; G.outPeak = 0.2; __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); });
  await p.waitForTimeout(3000);
  ok(/resend stands down/.test(await logged()) && await p.evaluate(() => !__sent.some(s => /Pennsylvania/.test(s))), "the resend went out although a reply had started: " + (await logged()).slice(-300));
  await p.evaluate(() => { G.silentAgain = { text: "Which campaign: National, or Idaho?", at: Date.now() }; window.__wsS = __ws; [{ type: "response.created" }, { type: "response.output_audio_transcript.delta", delta: "Which campaign: National, or Idaho?" }, { type: "response.done", response: { status: "completed" } }].forEach(e => __ws.onmessage({ data: JSON.stringify(e) })); });
  await p.waitForFunction(() => __ws !== __wsS, null, { timeout: 8000 }).catch(() => {});
  ok(/came without sound twice: the line is treated as dead/.test(await logged()) && await p.evaluate(() => __ws !== __wsS), "a second silent copy didn't reconnect: " + (await logged()).slice(-300));
});
test("Ara: after a reconnect the app says where the form stands and asks the pending question itself (an optional question, or the read-back waiting for a yes)", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await ara(p, "show_contact_draft", { first: "Nora", last: "Quist", email: "nora@example.org", mobile: "(555) 010-0188" });
  ok(await p.evaluate(() => V && V.opt && V.opt.cur === "capacity"), "the capacity question isn't pending after the required details");
  const forced = (n) => p.evaluate((n) => __sent.slice(n).map(s => JSON.parse(s)).filter(x => x.item && x.item.type === "force_message").map(x => x.item.content[0].text), n);
  const instr = (n) => p.evaluate((n) => __sent.slice(n).map(s => JSON.parse(s)).filter(x => x.type === "session.update" && x.session.instructions).map(x => x.session.instructions).join(" "), n);
  let n0 = await p.evaluate(() => __sent.length);
  await p.evaluate(() => { G.drops = 0; G.loudAt = 0; __ws.onclose({ code: 1006, reason: "" }); }); await p.waitForTimeout(1800);
  let f = await forced(n0), i = await instr(n0);
  ok(f.some(t => /^Sorry, I lost you for a moment\. We're on the new contact for Nora\. Next, Nora's capacity rating, which an opportunity needs\. (A is \$250,000 and up|A to E: which fits Nora)/.test(t)), "the pending optional question wasn't asked again by the app after the reconnect: " + JSON.stringify(f));
  ok(/Just now: The connection to the officer dropped[^]*The optional questions for the "New contact" form are at "Capacity rating" \(the earlier ones are done\); the app asks it again itself\./.test(i), "Ara's instructions don't say where the optional questions stand: " + i.slice(-500));
  ok(!(await p.evaluate((n) => __sent.slice(n).some(s => { const x = JSON.parse(s); return x.type === "response.create" && /Sorry, I lost you/.test(x.response.instructions || ""); }), n0)), "Ara was also asked to say the sorry line herself (a doubled turn)");
  // the read-back waiting for a yes is read again by the app
  await p.evaluate(() => { window.__noAutoForce = false; });
  await ara(p, "optional_fields", { step: "stop" }, 600);
  ok(await p.evaluate(() => !!(G.saveCheck && G.hands)), "the form wasn't read back and waiting for a yes");
  n0 = await p.evaluate(() => __sent.length);
  await p.evaluate(() => { G.drops = 0; G.loudAt = 0; __ws.onclose({ code: 1006, reason: "" }); }); await p.waitForTimeout(1800);
  f = await forced(n0); i = await instr(n0);
  ok(f.some(t => /^Sorry, I lost you for a moment\. We're on the new contact for Nora\. New contact: Nora Quist, email, nora@example\.org[^]*Yes to save, or no to change something\?$/.test(t)), "the read-back wasn't repeated by the app after the reconnect: " + JSON.stringify(f));
  ok(/has been read back in full and is waiting for the officer's yes to save it/.test(i), "Ara's instructions don't say the form is waiting for a yes: " + i.slice(-400));
  // a form with required fields still missing: Ara is guided as before, told what's still needed
  await p.evaluate(() => { V = null; G.saveCheck = null; renderOverlay && renderOverlay(); });
  await p.evaluate(() => { V = null; });
  await ara(p, "show_ask_plan_draft", { contact_name: "Ruth Abernathy" });
  n0 = await p.evaluate(() => __sent.length);
  await p.evaluate(() => { G.drops = 0; G.loudAt = 0; __ws.onclose({ code: 1006, reason: "" }); }); await p.waitForTimeout(1800);
  ok(await p.evaluate((n) => __sent.slice(n).some(s => { const x = JSON.parse(s); return /Sorry, I lost you for a moment\. We're on the add planned ask for \w+\. (Which entity, and which campaign|When is the planned ask date|Which campaign)/.test(s); }), n0), "a form with required fields missing wasn't asked its first required question after the reconnect");
});
test("Ara: a task named in full is found even when another task shares a word with it; the hands-free filter lists the saves to check; Ara's own answer isn't taken for a scripted line", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  // two tasks for Ruth sharing the word Ruth (Oct 25: "Record the pledge or gift from Joey" also matched "Follow up with Joey on the $50,000 ask")
  await p.evaluate(() => { const c = S.contacts.find(x => x.last === "Abernathy"); S.tasks.push({ id: "tk_a1", contactId: c.id, text: "Record the pledge or gift from Ruth", due: "2026-10-31" }, { id: "tk_a2", contactId: c.id, text: "Follow up with Ruth on the $50,000 ask", due: "2026-10-31" }); save(); });
  let r = await ara(p, "show_task_edit_draft", { contact_name: "Ruth Abernathy", which: "Follow up with Ruth on the $50,000 ask", due: "2026-11-20" });
  ok(!r.error && await p.evaluate(() => V && V.action === "editTask" && V.target.item.id === "tk_a2"), "the task named in full wasn't found: " + JSON.stringify(r));
  await p.evaluate(() => { V = null; document.getElementById("overlay").innerHTML = ""; });
  r = await ara(p, "show_task_edit_draft", { contact_name: "Ruth Abernathy", which: "record the pledge", due: "2026-11-24" });
  ok(!r.error && await p.evaluate(() => V && V.target.item.id === "tk_a1"), "a few words from the task didn't find it: " + JSON.stringify(r));
  await p.evaluate(() => { V = null; document.getElementById("overlay").innerHTML = ""; });
  r = await ara(p, "show_task_edit_draft", { contact_name: "Ruth Abernathy", which: "Ruth", due: "2026-11-24" });
  ok(r.error && /Which of Ruth Abernathy's tasks\?/.test(r.error), "a name alone picked a task: " + JSON.stringify(r));
  // the hands-free saves still to be checked (Oct 25: "read off all of the hands-free decisions that I made that I need to approve")
  await p.evaluate(() => { const c = S.contacts.find(x => x.last === "Abernathy"); S.history.unshift({ id: "h_hf1", contactId: c.id, text: "Capacity rated B ($100k to $250k)", hf: true, at: new Date().toISOString() }); save(); });
  r = await ara(p, "show_needs_attention", { filter: "hands_free" });
  ok(r.ok && r.count === 1 && r.items[0] === "Ruth Abernathy's capacity rated B ($100k to $250k)" && /checks them off on the phone/.test(r.status), "the hands-free filter didn't list the save to check: " + JSON.stringify(r));
  // a scripted line is pending; Ara answers on her own instead (Oct 25 6:04 PM: a read-back heard twice, 8 s apart)
  await p.evaluate(() => { window.__noAutoForce = true; forceSay("Edit task for Joe Paratore. Task: Meet 10/23; Due date: Nov 10. Shall I save it?"); });
  await p.waitForTimeout(300);
  const tell = (text) => p.evaluate((text) => { [{ type: "response.created" }, { type: "response.output_audio_transcript.delta", delta: text }].forEach(e => __ws.onmessage({ data: JSON.stringify(e) })); G.audioSamples = 30000; __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); }, text);
  await tell("The weather is lovely today, isn't it, with the leaves turning.");
  let f = await p.evaluate(() => ({ pending: !!G.forced, started: G.forced && G.forced.started, late: !!G.lateForced, log: ACT.q.map(a => a.text).join(" | ") }));
  ok(f.pending && !f.started && !f.late && /Ara answered on her own while the scripted line was still to come/.test(f.log), "an unrelated answer was taken for the scripted line: " + JSON.stringify([f.pending, f.started, f.late]));
  await tell("Edit task for Joe Paratore. Task: Meet ten twenty three; Due date: Nov ten. Shall I save it?");
  f = await p.evaluate(() => ({ pending: !!G.forced, late: G.lateForced && G.lateForced.text, log: ACT.q.map(a => a.text).join(" | ") }));
  ok(!f.pending && /^Edit task for Joe Paratore/.test(f.late || "") && /Ara said the scripted line in her own words before it played: its late copy will be cut/.test(f.log), "Ara's own telling of the read-back wasn't recognised: " + JSON.stringify(f));
  const n0 = await p.evaluate(() => __sent.length);
  await p.evaluate(() => { [{ type: "response.created" }, { type: "response.output_audio_transcript.delta", delta: "Edit task for Joe Paratore. Task: Meet 10/23; Due date: Nov 10. Shall I save it?" }].forEach(e => __ws.onmessage({ data: JSON.stringify(e) })); });
  await p.waitForTimeout(150);
  ok(await p.evaluate((n) => __sent.slice(n).some(x => JSON.parse(x).type === "response.cancel") && G.dropNext, n0), "the late scripted copy wasn't cut");
  await p.evaluate(() => __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "cancelled" } }) }));
});
test("Ara: optional fields one at a time, filled in by the app (rating, how met, texting and its source, flags)", async (p) => {
  await signIn(p);
  await said(p, "I've parked, I'll tap myself."); await ara(p, "set_hands_free", { on: false }); // this check is the tap flow; hands-free is on by default since Oct 25
  let r = await ara(p, "show_contact_draft", { first: "Jack", last: "Lantern", email: "jack@example.org", mobile: "(555) 010-0199" });
  ok(r.field === "capacity" && /which an opportunity needs/.test(r.ask_exactly || ""), "the rating wasn't asked first: " + JSON.stringify(r));
  r = await ara(p, "optional_fields", { step: "skip" });
  ok(r.choice === "saveOrOpt" && /^No problem\. That's everything the new contact form needs for Jack\. Save it, or add the optional details first\?$/.test(r.ask_exactly || ""), "skipping the rating didn't lead on to the save-or-details question: " + JSON.stringify(r)); // the policy's one question (Oct 28)
  r = await ara(p, "optional_fields", { step: "back", field: "the rating" });
  ok(r.field === "capacity" && /Sure, back to that\. First, Jack's capacity rating\./.test(r.ask_exactly) && /(under \$5,000\. Which fits Jack|A to E: which fits Jack), or move on\?$/.test(r.ask_exactly), "going back to the rating didn't ask it with its bands (or the short A to E form once the bands were said): " + JSON.stringify(r));
  r = await ara(p, "optional_fields", { step: "answer", value: "D" });
  ok((await p.inputValue("#f_capacity")) === "D" && r.field === "howMet" && /how you met Jack\. Fill it in, or move on\?/.test(r.ask_exactly), "the rating wasn't filled in, or How we met didn't come next");
  r = await ara(p, "optional_fields", { step: "answer", value: "In the pumpkin patch" });
  ok(/pumpkin patch/.test(await p.inputValue("#f_howMet")) && r.field === "permText", "How we met wasn't filled in, or texting didn't come next");
  r = await ara(p, "optional_fields", { step: "answer", value: "Yes, that's fine" });
  ok(await p.isChecked("#f_permText") && r.field === "permSource", "texting wasn't turned on, or its source wasn't asked next");
  r = await ara(p, "optional_fields", { step: "answer", value: "Move on." }); // said to a fill-in field, that means skip (Carverhill, Oct 25)
  ok(r.field === "flags" && /Most people are neither/.test(r.ask_exactly), "the flags question didn't come last");
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
  ok(/force_message/.test(sent) && /Congrats! Pledge recorded/.test(sent), "the save line doesn't open with a congratulation: " + sent.slice(-300));  const instr = await p.evaluate(() => __sent.map(s => JSON.parse(s)).filter(e => e.type === "session.update" && e.session.instructions).map(e => e.session.instructions).pop());
  ok(/## Voice & Communication Style\n- Speak warmly and briefly/.test(instr) && /Friendly, upbeat and a little playful/.test(instr) && /Never joke about investors/.test(instr), "Ara has no personality section");
});
test("Ara: an interaction report keeps the spoken summary (new contact)", async (p) => {
  await signIn(p);
  await ara(p, "show_contact_draft", { first: "Jenny", last: "Arena", email: "jenny@example.org", mobile: "(555) 010-0123" });
  for (let i = 0; i < 3 && !(await p.isVisible("[data-act=save]")); i++) await p.waitForTimeout(200);
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  let r = await ara(p, "show_interaction_draft", { contact_name: "Jenny Arena", date: "2026-10-20", meetingType: "In person" });
  ok(/summary parameter/.test(r.status || r.next || ""), "Ara was not told where the summary goes: " + JSON.stringify(r));
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
  const sent = await p.evaluate(() => __sent.map(s => JSON.parse(s)).filter(e => e.type === "session.update" && e.session.tools).at(-1).session);
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
  const gap = await p.evaluate(async () => { const o = S.opps.find(x => x.contactId === S.contacts.find(c => c.first === "Elena").id); const keep = { fund: o.fund, campaign: o.campaign, potential: o.potential }; o.fund = null; o.campaign = null; o.potential = 0; window.__gapKeep = keep; return true; });
  const g = await ara(p, "get_opportunity_details", { contact_name: "Elena Vasquez" });
  ok(gap && g.fields.entity.value === g.fields.asks.value[0].entity && g.fields.campaign.value === g.fields.asks.value[0].campaign && g.fields.potential.value === "Not set", "a blank opportunity entity, campaign or potential isn't read from the planned ask / as Not set: " + JSON.stringify({ e: g.fields.entity.value, c: g.fields.campaign.value, p: g.fields.potential.value }));
  await p.evaluate(() => { const o = S.opps.find(x => x.contactId === S.contacts.find(c => c.first === "Elena").id); Object.assign(o, window.__gapKeep); save(); });
});
test("Ara's instructions stay short and the Process FAQ is looked up with get_process_faq", async (p) => {
  await signIn(p);
  const instr = await p.evaluate(() => __sent.map(s => JSON.parse(s)).filter(e => e.session && e.session.instructions).map(e => e.session.instructions).at(-1));
  ok(instr && instr.length < 20000, "instructions are " + (instr || "").length + " characters");
  ok(!/\nQ: /.test(instr) && /get_process_faq/.test(instr) && /Ally - Do Not Solicit/.test(instr), "the FAQ is still sent whole, or the topics are missing");
  let r = await ara(p, "get_process_faq", { question: "Who can clear the ally flag?" });
  ok(r.ok && /clear the Ally - Do Not Solicit flag/.test(r.answers[0].q), "FAQ lookup missed: " + JSON.stringify(r.answers && r.answers[0]));
  r = await ara(p, "get_process_faq", { question: "What are the status choices for a task?" });
  ok(r.ok && /status choices for a Task/.test(r.answers[0].q) && /To do, In progress, Waiting/.test(r.answers[0].a), "the task status FAQ entry is missing: " + JSON.stringify(r.answers && r.answers[0]));
  r = await ara(p, "get_process_faq", { question: "zebra xylophone" });
  ok(r.ok && !r.answers.length && /isn't covered/.test(r.say), "an unmatched question returned answers");
});
test("During a call, a save or a rule change refreshes Ara's instructions (a session update), never a message in the conversation", async (p) => {
  await signIn(p);
  const full = () => p.evaluate(() => __sent.map(s => JSON.parse(s)).filter(e => e.type === "session.update" && e.session && e.session.instructions).length);
  const msgs = () => p.evaluate(() => __sent.map(s => JSON.parse(s)).filter(e => e.item && e.item.type === "message").length);
  const f0 = await full(), m0 = await msgs();
  await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send Ruth the board deck", due: "2026-11-30" });
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  const upd = await p.evaluate(() => __sent.map(s => JSON.parse(s)).filter(e => e.type === "session.update" && e.session && e.session.instructions).at(-1).session.instructions);
  ok(await full() === f0 + 1 && /Saved so far in this conversation: Task added/.test(upd), "the save did not refresh the Right now section");
  ok(await msgs() === m0, "the save was sent as a message in the conversation");
  await said(p, "I'm driving"); await p.waitForTimeout(900);
  ok(/HANDS-FREE MODE IS ON/.test(await p.evaluate(() => __sent.map(s => JSON.parse(s)).filter(e => e.type === "session.update" && e.session && e.session.instructions).at(-1).session.instructions)), "turning on hands-free did not send the new rules");
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
  const sent = await p.evaluate(() => __sent.map(s => JSON.parse(s)));
  const guided = sent.filter(e => e.type === "response.create" && e.response && e.response.instructions).map(e => e.response.instructions).join(" | ");
  const forced = sent.filter(e => e.item && e.item.type === "force_message").map(e => e.item.content[0].text).join(" | ");
  ok(/said "undo"/.test(guided) && /said "start over"/.test(guided), "Ara was not told what the app did: " + guided.slice(-300));
  ok(/Cancelled, nothing was saved/.test(forced) && /Back on Contacts\./.test(forced), "the cancel and go back lines weren't said by the app itself: " + forced);
  ok(!sent.some(e => e.item && e.item.type === "message" && /App notice/.test(e.item.content[0].text)), "an app notice was still sent as a message");
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


test("Ara: when Grok goes silent after the app asks for a reply, the app asks once more on a healthy line, then opens a fresh line; on a slow line it goes straight to a fresh line; Grok errors are logged", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  const fire = (evs) => p.evaluate((evs) => evs.forEach(e => __ws.onmessage({ data: JSON.stringify(e) })), evs);
  const creates = () => p.evaluate(() => __sent.filter(s => JSON.parse(s).type === "response.create").length);
  const logged = () => p.evaluate(() => ACT.q.concat(__logs.flatMap(l => l.events || [l])).map(a => a.text).join(" | "));
  await fire([{ type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(100);
  await p.evaluate(() => notice("Ask the officer the next question."));
  const c0 = await creates(); await p.evaluate(() => { window.__ws0 = __ws; });
  await fire([{ type: "response.created" }, { type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(600);
  ok(await creates() === c0 + 1 && await p.evaluate(() => __ws === __ws0), "an empty reply on a healthy line was not asked for again");
  await fire([{ type: "error", error: { message: "Something broke upstream" } }]); await p.waitForTimeout(100);
  await fire([{ type: "response.created" }, { type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => __ws !== __ws0 && G.live), "a second silent reply did not open a fresh line");
  const q = await logged();
  ok(/empty reply, asked again/.test(q) && /after asking again/.test(q) && /Reconnecting \(1\)/.test(q) && /Grok error: Something broke upstream/.test(q), "the silent replies, the reconnect or the Grok error were not logged");
  // a slow line: no asking again, a fresh line straight away
  await p.waitForFunction(() => G.status === "Listening", null, { timeout: 5000 });
  await p.evaluate(() => { const f = window.fetch; window.fetch = (u, o) => /ping=/.test(String(u)) ? new Promise(res => setTimeout(() => res(new Response("{}")), 2500)) : f(u, o); window.__ws1 = __ws; G.drops = 0; });
  await p.evaluate(() => notice("Ask the officer the next question."));
  const c1 = await creates();
  await fire([{ type: "response.created" }, { type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(4000);
  ok(await p.evaluate(() => __ws !== __ws1) && await creates() >= c1, "a silent reply on a slow line didn't go straight to a fresh line");
  ok(/on a slow line \(test request \d+ ms\): fresh line/.test(await logged()), "the slow-line reconnect wasn't logged");
});
test("Ara: a dropped voice line reconnects and picks up where it left off; it keeps reconnecting past 3 tries, and only 10 minutes without a working line ends the call (warned at 8, last try announced)", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await ara(p, "show_ask_plan_draft", { contact_name: "Ruth Abernathy" });
  await p.evaluate(() => recent(botName(), "Which entity is the ask for?"));
  await p.evaluate(() => { window.__ws0 = __ws; __ws.onclose({ code: 1006, reason: "" }); }); await p.waitForTimeout(1200);
  const back = await p.evaluate(() => ({ newLine: __ws !== __ws0, live: G.live, sorry: __sent.some(s => /Sorry, I lost you for a moment\. We're on the add planned ask for Ruth\. (Which entity|When is the planned ask date|Which campaign)/.test(s)) }));
  ok(back.newLine && back.live && back.sorry, "the dropped line wasn't reopened with the last question and the open form");
  ok(await p.evaluate(() => !!document.getElementById("draftForm")), "the planned ask form closed when the line dropped");
  await p.evaluate(() => { window.speechSynthesis.speak = (u) => { window.__spoke = u.text; }; }); // the phone's built-in speech must never be used (Oct 25: iOS "Stop audio recording?" dialog)
  // a fourth drop with the line heard from recently keeps reconnecting (Oct 25: a driveway dead spot took 4 tries and the call was hung up)
  await p.evaluate(() => { G.drops = 3; G.lastMsg = Date.now() - 20000; window.__ws1 = __ws; __ws.onclose({ code: 1006 }); }); await p.waitForTimeout(1200);
  const four = await p.evaluate(() => ({ live: G.live, drops: G.drops, log: ACT.q.map(a => a.text).join(" | ") }));
  ok(four.live && four.drops === 4 && /Reconnecting \(4\)/.test(four.log), "the fourth drop ended the call instead of reconnecting: " + JSON.stringify({ live: four.live, drops: four.drops }));
  // a new line that doesn't open (G.lastMsg is 0 while it opens) counts from when the service was last heard, not from the call's start (Oct 25 3:42 PM: gave up after one try)
  await p.evaluate(() => { G.t0 = Date.now() - 300000; G.lastMsg = 0; G.heardAt = Date.now() - 15000; reconnect("the line didn't open"); }); await p.waitForTimeout(600);
  ok(await p.evaluate(() => G.live && G.drops === 5), "a line that didn't open ended the call although the service was heard 15 s ago");
  await p.waitForFunction(() => window.__ws !== window.__ws1, null, { timeout: 12000 }); await p.waitForTimeout(300);
  // 5 minutes without a word (Carverhill, Oct 25: a 3-minute dead spot in the driveway outlasted the old 2-minute limit by 5 s)
  await p.evaluate(() => { G.lastMsg = Date.now() - 200000; __ws.onclose({ code: 1006 }); }); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => G.live), "3 minutes without a word ended the call; the limit is 10 minutes");
  await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 12000 }); await p.waitForTimeout(300);
  await p.evaluate(() => { G.lastMsg = Date.now() - 400000; __ws.onclose({ code: 1006 }); }); await p.waitForTimeout(600);
  ok(await p.evaluate(() => G.live), "6.7 minutes without a word ended the call; the limit is 10 minutes (Carverhill, Oct 29; an 8-minute dead spot, Oct 28)");
  await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 12000 }); await p.waitForTimeout(300);
  // from 8 minutes the next "still trying" is the warning that it stops at 10; a try within 40 s of the limit is announced as the last, and the drop after it ends the call (Carverhill, Oct 29)
  await p.evaluate(() => { window.__said = []; window.sayLocal = (t, k, n) => { __said.push(k + ": " + (n || t)); return true; }; G.lastMsg = Date.now() - 500000; G.downAt = Date.now() - 500000; G.warnSaid = false; downSay("still"); downSay("still"); });
  ok(await p.evaluate(() => __said.length === 2 && /^warn: Still no signal/.test(__said[0]) && /^still: /.test(__said[1])), "at 8 minutes down the phone didn't warn once that it will hang up at 10: " + JSON.stringify(await p.evaluate(() => __said)));
  await p.evaluate(() => { __said.length = 0; G.lastMsg = Date.now() - 570000; __ws.onclose({ code: 1006 }); }); await p.waitForTimeout(800);
  ok(await p.evaluate(() => G.live && G.lastTry && __said.some(x => /^last: This is my last try/.test(x))), "a try 30 s before the limit wasn't announced as the last: " + JSON.stringify(await p.evaluate(() => [G.live, G.lastTry, __said])));
  await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 12000 }).catch(() => {}); await p.waitForTimeout(300);
  await p.evaluate(() => { G.lastMsg = Date.now() - 610000; __ws.onclose({ code: 1006 }); }); await p.waitForTimeout(1500);
  const out = await p.evaluate(() => ({ live: G.live, spoke: window.__spoke || "", log: ACT.q.map(a => a.text).join(" | ") + __logs.map(l => JSON.stringify(l)).join(" ") }));
  ok(!out.live && out.spoke === "", "after the tries ran out the call didn't end, or the phone's built-in speech was used (never allowed since Oct 25): " + out.spoke);
  ok(await p.isVisible("text=The voice service isn't answering"), "the screen doesn't say the voice service isn't answering");
  ok(/Voice line closed \(code 1006\)/.test(out.log) && /online/.test(out.log) && /unavailable after 10 minutes without a working line/.test(out.log) && /Conversation ended \(voice service unavailable\)/.test(out.log), "the drop, the connection reading or the reason the call ended weren't logged");
});
test("Ara: no reply at the first tick on a slow line gets a fresh line at once, and a new line that won't open gets a second line alongside", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  const logged = () => p.evaluate(() => ACT.q.concat(__logs.flatMap(l => l.events || [l])).map(a => a.text).join(" | "));
  await p.evaluate(() => { const f = window.fetch; window.__fetch0 = f; window.fetch = (u, o) => /ping=/.test(String(u)) ? new Promise((res, rej) => { const t = setTimeout(() => res(new Response("{}")), 2800); o && o.signal && o.signal.addEventListener("abort", () => { clearTimeout(t); rej(new Error("aborted")); }); }) : f(u, o); window.__ws1 = __ws; G.drops = 0; G.loudAt = 0; G.speechSince = 0; G.responding = false; });
  await p.evaluate(() => notice("Ask the officer the next question."));
  // 4 s tick + 2.5 s line test + 1 s before the reconnect; the log line below proves it came from the early test, not the 10 s re-ask
  await p.waitForFunction(() => __ws !== __ws1, null, { timeout: 11000 }).catch(() => {});
  ok(await p.evaluate(() => __ws !== __ws1 && G.live), "no reply at the first tick on a slow line didn't get a fresh line before the 10 s re-ask");
  ok(/No reply started after 4 s on a slow line \(test request no answer in 2.5 s\): fresh line/.test(await logged()), "the early slow-line check wasn't logged");
  // the next line hangs without opening: after 5 s a second one is tried alongside, and the first to open is kept
  await p.waitForFunction(() => G.status === "Listening", null, { timeout: 8000 });
  await p.evaluate(() => { window.fetch = window.__fetch0; window.__quietMic = true; const Orig = window.WebSocket; let n = 0;
    window.WebSocket = function (...a) { n++; if (n === 1) { const w = { readyState: 0, send() {}, close() { this.closed = true; } }; window.__hung = w; return w; } window.WebSocket = Orig; return new Orig(...a); };
    window.__ws2 = __ws; G.drops = 0; G.loudAt = 0; G.speechSince = 0; G.spokeInGap = false; G.lastHeard = null; __ws.onclose({ code: 1006, reason: "" }); });
  await p.waitForTimeout(8000);
  const st = await p.evaluate(() => ({ live: G.live, status: G.status, onSecond: G.ws === __ws && __ws !== __ws2, hungClosed: !!__hung.closed }));
  ok(st.live && st.status === "Listening" && st.onSecond && st.hungClosed, "a line that wouldn't open didn't get a second line alongside: " + JSON.stringify(st));
  const q = await logged();
  ok(/trying a second line alongside/.test(q) && /\(the second line\)/.test(q), "the second line wasn't logged");
  // Oct 29: with no form open the app says the whole line itself (sorry + the open question); Ara is told not to say it again
  await p.waitForFunction(() => __sent.some(s => /force_message/.test(s) && s.includes("Sorry, I lost you")), null, { timeout: 6000 }).catch(() => {}); /* the sorry line waits for the state receipt, 3 s at most when the line never confirms (Oct 29) */
  const sorry = await p.evaluate(() => ({ forced: __sent.filter(s => /force_message/.test(s) && s.includes("Sorry, I lost you")).pop() || "", told: __sent.some(s => /don't say it or anything like it again/.test(s)), oneQ: __sent.some(s => /then ask just one question/.test(s)) }));
  ok(/Sorry, I lost you for a moment\. We hadn't started anything yet\. What would you like to do\?/.test(sorry.forced) && sorry.told && !sorry.oneQ, "after a drop with no form open the app didn't say the whole reconnect line itself: " + JSON.stringify(sorry).slice(0, 400));
});
test("Reconnect with no form open (Oct 29): the app says the sorry and the question itself, so Ara can't stop after the sorry", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  const fire = (evs) => p.evaluate((evs) => evs.forEach(e => __ws.onmessage({ data: JSON.stringify(e) })), evs);
  const lastForced = () => p.evaluate(() => __sent.map(s => { try { return JSON.parse(s); } catch (e) { return {}; } }).filter(e => e.item && e.item.type === "force_message").map(e => e.item.content[0].text).pop() || "");
  const logged = () => p.evaluate(() => ACT.q.map(a => a.text).join(" | "));
  await p.evaluate(() => { window.__quietMic = true; }); /* the fake mic is loud: it would count as the officer talking while the line is down */
  const drop = async () => { await p.evaluate(() => { G.drops = 0; G.loudAt = 0; G.speechSince = 0; G.spokeInGap = false; __ws.onclose({ code: 1006, reason: "" }); }); await p.waitForFunction(() => G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(600); };
  // Ara had just asked a question and the officer hadn't answered: the line comes back with that question (the 9:45 AM call: Ara said only the sorry, then 12 s of dead air)
  await fire([{ type: "response.created" }, { type: "response.output_audio_transcript.delta", delta: "Billy is now in Cultivation. The next step is to add a planned ask. Do you want to do that now?" }, { type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(300);
  await drop();
  ok((await lastForced()) === "Sorry, I lost you for a moment. Billy is now in Cultivation. The next step is to add a planned ask. Do you want to do that now?" && /the app says Ara's whole last line again itself/.test(await logged()), "Ara's whole last line wasn't said again by the app (Oct 29 10:05 AM call): " + (await lastForced()));
  // a second drop before the officer says anything (the real-line probe, Oct 29): the same question again, the sorry said once, not stacked
  await p.evaluate(() => { G.lastBot = "Sorry, I lost you for a moment. Billy is now in Cultivation. The next step is to add a planned ask. Do you want to do that now?"; G.lastBotAt = Date.now(); G.lastHeard = null; });
  await drop();
  ok((await lastForced()) === "Sorry, I lost you for a moment. Billy is now in Cultivation. The next step is to add a planned ask. Do you want to do that now?", "a second drop stacked the sorry: " + (await lastForced()));
  const instr = await p.evaluate(() => __sent.filter(s => /instructions/.test(s) && s.includes("Sorry, I lost you")).pop() || "");
  ok(/Carry on where you were/.test(instr) && /don't say it or anything like it again/.test(instr), "Ara wasn't told the app said the line: " + instr.slice(0, 300));
  // the officer had answered after Ara's last line and the app heard it, but Ara never replied (the 3:57 PM call, Oct 29): the whole line again, the answer the app heard, and Ara told to act on it
  await p.evaluate(() => { G.lastHeard = { text: "Yes, let's do it.", n: (G.heardN || 0) + 1, at: Date.now() }; window.__sentN = __sent.length; });
  await drop();
  ok((await lastForced()) === "Sorry, I lost you for a moment. Billy is now in Cultivation. The next step is to add a planned ask. Do you want to do that now? You said: \"Yes, let's do it\".", "the heard answer wasn't said back with the question: " + (await lastForced()));
  ok(await p.evaluate(() => __sent.slice(window.__sentN).some(s => /response\.create/.test(s) && /had already answered that question before the line dropped: \\"Yes, let's do it\\"/.test(s))), "Ara wasn't asked to act on the heard answer");
  // the officer talked while the line was down (nothing heard): the whole line again, and that the answer was lost
  await p.evaluate(() => { G.lastBot = "Billy is now in Cultivation. The next step is to add a planned ask. Do you want to do that now?"; G.lastBotAt = Date.now(); G.lastHeard = null; G.drops = 0; G.loudAt = 0; G.speechSince = 0; G.spokeInGap = false; __ws.onclose({ code: 1006, reason: "" }); G.spokeInGap = true; });
  await p.waitForFunction(() => G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(600);
  ok((await lastForced()) === "Sorry, I lost you for a moment. Billy is now in Cultivation. The next step is to add a planned ask. Do you want to do that now? I didn't catch your answer.", "words lost in the gap didn't get the whole line plus 'I didn't catch your answer': " + (await lastForced()));
  // the line went while the officer was still talking (speech started, never stopped): what was heard is a fragment, so the answer counts as lost (real-line run, Oct 29: "You said: Record the")
  await p.evaluate(() => { G.lastBot = "Billy is now in Cultivation. The next step is to add a planned ask. Do you want to do that now?"; G.lastBotAt = Date.now(); G.lastHeard = { text: "Record the", n: (G.heardN || 0) + 1, at: Date.now() }; G.speechOn = true; });
  await drop();
  ok((await lastForced()) === "Sorry, I lost you for a moment. Billy is now in Cultivation. The next step is to add a planned ask. Do you want to do that now? I didn't catch your answer." && await p.evaluate(() => !G.speechOn && !G.cutMidSpeech), "a fragment heard as the line went was taken for the officer's answer: " + (await lastForced()));
  // the officer had spoken after a statement (no question): the app asks them to say it again
  await p.evaluate(() => { G.lastBot = "Noted, Billy's rating is C."; G.lastBotAt = Date.now(); G.lastHeard = { text: "Yes, let's do it.", n: (G.heardN || 0) + 1, at: Date.now() }; });
  await drop();
  ok((await lastForced()) === "Sorry, I lost you for a moment. Noted, Billy's rating is C. Then you started to say something. Can you repeat what you said?", "after a statement the app didn't say it again and ask for what the officer had started to say (Carverhill, 4:15 PM Oct 29): " + (await lastForced()));
  // nothing waiting: the open question
  await p.evaluate(() => { G.lastBot = "Noted."; G.lastBotAt = Date.now(); G.lastHeard = null; });
  await drop();
  ok((await lastForced()) === "Sorry, I lost you for a moment. We hadn't started anything yet. What would you like to do?", "with nothing waiting the app didn't say so and ask what to do: " + (await lastForced()));
});
test("Scripted line (Oct 29): nothing back 4 s after it gets \"Ara's taking a moment\" and a line test; a slow line gets a fresh one that says the line again", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  const logged = () => p.evaluate(() => ACT.q.concat(__logs.flatMap(l => l.events || [l])).map(a => a.text).join(" | "));
  await p.evaluate(() => { window.__noAutoForce = true; window.__said = []; window.__cues = []; window.sayLocal = (t, k) => { __said.push(k + ": " + t); return true; }; window.cue = (k) => { __cues.push(k); };
    const f = window.fetch; window.__fetch0 = f; window.__pingMs = 200; window.fetch = (u, o) => /ping=/.test(String(u)) ? new Promise((res, rej) => { const t = setTimeout(() => res(new Response("{}")), window.__pingMs); o && o.signal && o.signal.addEventListener("abort", () => { clearTimeout(t); rej(new Error("aborted")); }); }) : f(u, o); window.__ws1 = __ws; G.drops = 0; G.loudAt = 0; G.speechSince = 0; G.responding = false; G.slowSaid = false; });
  // a healthy line (test request 200 ms): the phone says the line once at 4 s, the line is kept, and the 8 s fallback still hands the words to Ara
  await p.evaluate(() => forceSay("Task added for Ruth. What's next?")); await p.waitForTimeout(4600);
  ok(await p.evaluate(() => __said.length === 1 && __said[0] === "slow: Ara's taking a moment." && __ws === __ws1 && G.forced && !G.forced.started), "4 s after a scripted line with nothing back the phone didn't say \"Ara's taking a moment.\" once and keep the healthy line: " + JSON.stringify(await p.evaluate(() => [__said, __ws === __ws1, !!G.forced])));
  ok(/Nothing back 4 s after a scripted line: the phone says Ara's taking a moment and tests the line/.test(await logged()), "the 4 s check wasn't logged");
  await p.waitForTimeout(4000);
  ok(await p.evaluate(() => __ws === __ws1 && !G.forced && G.lateForced && G.lateForced.text === "Task added for Ruth. What's next?" && __said.length === 1), "on a healthy line the 8 s fallback didn't hand the line to Ara, or the phone spoke twice: " + JSON.stringify(await p.evaluate(() => [__said, !!G.forced, G.lateForced])));
  await p.evaluate(() => { __ws.onmessage({ data: JSON.stringify({ type: "response.created" }) }); __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); }); await p.waitForTimeout(300);
  // a slow line (the test request gets no answer in 2.5 s): a fresh line at about 6.5 s, which says the scripted line itself with "Sorry, I lost you for a moment"
  await p.evaluate(() => { window.__pingMs = 2800; window.__said = []; G.slowSaid = false; G.lateForced = null; G.cancelAt = 0; G.asked = false; G.qCreate = false; G.responding = false; clearTimeout(G.askWatch); clearTimeout(G.tickWatch); G.askWatch = null; }); /* the fallback's own reply request is out of the way: this half is about the scripted line's check alone */
  const n = await p.evaluate(() => __sent.length);
  await p.evaluate(() => forceSay("Task added for Ruth. What's next?"));
  await p.waitForFunction(() => __ws !== __ws1, null, { timeout: 9000 }).catch(() => {});
  ok(await p.evaluate(() => __ws !== __ws1 && G.live), "a scripted line with nothing back on a slow line didn't get a fresh line before the 8 s fallback");
  ok(/Scripted line not started after 4 s on a slow line \(test request no answer in 2.5 s\): fresh line/.test(await logged()), "the slow-line check after a scripted line wasn't logged: " + (await logged()).slice(-900));
  await p.waitForFunction(() => G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(1200);
  const forced = await p.evaluate((n) => __sent.slice(n).map(s => { try { return JSON.parse(s); } catch (e) { return {}; } }).filter(e => e.item && e.item.type === "force_message").map(e => e.item.content[0].text), n);
  ok(forced.length === 2 && forced[1] === "Sorry, I lost you for a moment. Task added for Ruth. What's next?" && /the app says the scripted line the old line never started/.test(await logged()), "the fresh line didn't say the scripted line the old one never started: " + JSON.stringify(forced));
  ok(await p.evaluate(() => __said.length === 1 && __said[0] === "slow: Ara's taking a moment."), "the phone's line before the fresh line is wrong: " + JSON.stringify(await p.evaluate(() => __said)));
  await p.evaluate(() => { window.fetch = window.__fetch0; window.__noAutoForce = false; });
});
test("Scripted line (5:59 PM call, Oct 29): the app fills a pick-list from the answer; a reply with no sound in 6 s counts as not started; Ara's own question stands only within 12 s", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  const logged = () => p.evaluate(() => ACT.q.concat(__logs.flatMap(l => l.events || [l])).map(a => a.text).join(" | "));
  // 1. the app asked the type, the officer answered, Grok's call leaves the type out: the app fills it from the answer
  await said(p, "Log an interaction with Ken Ito.");
  let r = await ara(p, "show_interaction_draft", { contact_name: "Ken Ito", date: "2026-10-28", summary: "We talked about the gala." });
  ok(/^Type: In person, Phone call, Video call, Event, Email\?$/.test(r.ask_exactly || ""), "the type question wasn't asked by the app: " + JSON.stringify(r));
  await p.waitForFunction(() => !G.forced, null, { timeout: 5000 }); await said(p, "In person."); await p.waitForTimeout(200);
  r = await ara(p, "show_interaction_draft", { contact_name: "Ken Ito", response: "Awaiting", summary: "" });
  ok((await p.inputValue("#f_meetingType")) === "In person" && /The app filled the type from the officer's answer to the question just asked/.test(await logged()) && !/^Type:/.test(r.ask_exactly || ""), "the type the officer answered wasn't filled in by the app when Grok left it out: " + JSON.stringify(r).slice(0, 300) + " " + (await p.inputValue("#f_meetingType")));
  await p.waitForFunction(() => !G.forced, null, { timeout: 5000 }).catch(() => {});
  await p.evaluate(() => { window.__noAutoForce = true; window.__said = []; window.sayLocal = (t, k) => { __said.push(k + ": " + t); return true; }; window.cue = () => {}; G.forced = null; G.lateForced = null; G.slowSaid = false; G.bot = ""; G.lastBot = "";
    const f = window.fetch; window.__fetch0 = f; window.fetch = (u, o) => /ping=/.test(String(u)) ? new Promise((res) => setTimeout(() => res(new Response("{}")), 200)) : f(u, o); window.__ws1 = __ws; G.drops = 0; G.loudAt = 0; G.speechSince = 0; });
  // 2. the reply is created at once but no sound comes: 6 s later the phone says Ara's taking a moment, and the fallback hands the words to Ara 4 s after that
  await p.evaluate(() => { forceSay("Ask recorded for Charlie. Do you want to do that now, yes or no?"); __ws.onmessage({ data: JSON.stringify({ type: "response.created" }) }); });
  await p.waitForTimeout(4600);
  ok(await p.evaluate(() => __said.length === 0 && G.forced && G.forced.started), "the 4 s tick fired although the reply had started: " + JSON.stringify(await p.evaluate(() => __said)));
  await p.waitForTimeout(2000);
  ok(await p.evaluate(() => __said.length === 1 && __said[0] === "slow: Ara's taking a moment." && G.forced && !G.forced.started && __ws === __ws1) && /Scripted line's reply started but no sound in 6 s: treated as not started/.test(await logged()), "a started reply with no sound for 6 s wasn't treated as not started: " + JSON.stringify(await p.evaluate(() => [__said, !!G.forced, G.forced && G.forced.started])));
  await p.waitForTimeout(4300);
  ok(await p.evaluate(() => !G.forced && G.lateForced && /Ask recorded for Charlie/.test(G.lateForced.text)), "the fallback didn't hand the silent line to Ara: " + JSON.stringify(await p.evaluate(() => [!!G.forced, G.lateForced])));
  await p.evaluate(() => { __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); G.lateForced = null; __said.length = 0; G.slowSaid = false; }); await p.waitForTimeout(300);
  // 3. sound within 6 s: the line counts as started, no tick
  await p.evaluate(() => { forceSay("Task added for Ruth. What's next?"); __ws.onmessage({ data: JSON.stringify({ type: "response.created" }) }); __ws.onmessage({ data: JSON.stringify({ type: "response.output_audio.delta", delta: btoa("\0\0\0\0") }) }); });
  await p.waitForTimeout(6600);
  ok(await p.evaluate(() => __said.length === 0 && G.forced && G.forced.started && G.forced.sound), "a line whose sound came was treated as not started: " + JSON.stringify(await p.evaluate(() => [__said, G.forced])));
  // 4. Ara asks her own question while the scripted line is 15 s old: the scripted line is news the officer hasn't heard, so it is not cut
  await p.evaluate(() => { G.forced.at = Date.now() - 15000; G.bot = "The read-back is still waiting on you. Shall I save it, yes or no?"; __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); }); await p.waitForTimeout(300);
  ok(await p.evaluate(() => G.forced && !G.forced.started && !G.lateForced) && /Ara answered on her own while the scripted line was still to come/.test(await logged()), "a stale question of Ara's cut a 15 s old scripted line: " + JSON.stringify(await p.evaluate(() => [!!G.forced, G.lateForced])));
  // and within 12 s: hers stands, the copy is cut (the 10:05 AM rule)
  await p.evaluate(() => { G.forced.at = Date.now() - 3000; G.forced.started = true; G.bot = "Which contact is this task for?"; __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); }); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !G.forced && G.lateForced && G.lateForced.text === "Task added for Ruth. What's next?"), "two questions within 12 s: hers didn't stand: " + JSON.stringify(await p.evaluate(() => [!!G.forced, G.lateForced])));
  await p.evaluate(() => { G.lateForced = null; clearTimeout(G.forceTimer); window.fetch = window.__fetch0; window.__noAutoForce = false; });
});
test("Ara: sees opportunities closed this year, passes a question on after any yes, and hands-free read-backs skip long text", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  const snap = await p.evaluate(() => { const o = S.opps.find(x => x.stage !== "Closed"); o.stage = "Closed"; o.closed = "Won"; o.closedOn = todayISO(); return crmSnapshot(); });
  ok(/closed this year: Closed Won on /.test(snap), "Ara's records don't show opportunities closed this year");
  ok(await p.evaluate(() => /even when they ask for something else in the same breath: call pass_question_to_team first/.test(grokInstructions())), "Ara isn't told to pass a question on after a yes in other words");
  await ara(p, "show_interaction_draft", { contact_name: "Ken Ito", date: "2026-10-21", meetingType: "Phone call", summary: "Talked at length about the spring gala and her new grandchild" });
  const rb = await p.evaluate(() => hfReadback());
  ok(/summary noted/.test(rb) && !/grandchild/.test(rb), "the hands-free read-back still reads out the summary: " + rb);
});
test("Ara: a planned ask for an entity with a state campaign leaves the campaign blank so Ara asks for it", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  const r = await ara(p, "show_ask_plan_draft", { contact_name: "Ruth Abernathy", fund: "C.A. Pennsylvania C4" });
  ok(await p.inputValue("#f_campaign") === "", "the campaign was filled in without asking");
  ok((r.still_needed || r.missing || []).some(x => /Campaign/.test(x) && /National or Pennsylvania/.test(x)), "Ara wasn't told to ask National or Pennsylvania");
});

test("Ara: a slow reply gets a soft tick, a doubled reply is cut off, readings time a test request, and a voice pass stays ready during a call", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await p.waitForFunction(() => G.live, null, { timeout: 8000 }); await p.evaluate(() => { G.hands = false; paintCall(); }); // this check starts in tap mode; hands-free is on by default since Oct 25
  const fire = (evs) => p.evaluate((evs) => evs.forEach(e => __ws.onmessage({ data: JSON.stringify(e) })), evs);
  await fire([{ type: "response.done", response: { status: "completed" } }]); await p.waitForTimeout(100);
  await p.evaluate(() => { window.__cues = []; window.__said = []; const c = cue; window.cue = (k) => { __cues.push(k); }; window.sayLocal = (t, k) => { __said.push(k + ": " + t); return true; }; });
  await p.evaluate(() => notice("Ask the officer the next question."));
  await p.waitForTimeout(4400);
  // Oct 27/28 (Carverhill): the first slow tick is the recorded "Ara's taking a moment.", not a beep; the beep only repeats after it
  ok(await p.evaluate(() => __said.includes("slow: Ara's taking a moment.") && !__cues.includes("wait")), "the first slow tick wasn't the spoken \"Ara's taking a moment.\": " + JSON.stringify(await p.evaluate(() => [__said, __cues])));
  await p.waitForTimeout(4200);
  ok(await p.evaluate(() => __cues.includes("wait") && __said.length === 1), "no soft tick after the spoken line, or the line was said twice");
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


test("Ara: an entity comes from the state the officer names, a rating is never invented, and the Cultivation decision is explained", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  const instr = await p.evaluate(() => __sent.map(s => JSON.parse(s)).filter(e => e.session && e.session.instructions).map(e => e.session.instructions).at(-1));
  ok(/Pennsylvania: Pennsylvania C4, Pennsylvania State PAC[;.]/.test(instr) && /Never name any other/.test(instr), "the entities by state aren't in Ara's instructions");
  await p.evaluate(() => { const c = S.contacts.find(x => x.first === "James"); S.opps = S.opps.filter(o => o.contactId !== c.id); c.capacity = c.capacity || "C"; save(); });
  // one entity in that state: filled in; several: exactly those are named
  await said(p, "Create an opportunity for James. Let's pick the New Hampshire entity.");
  let r = await ara(p, "show_opportunity_draft", { contact_name: "James Okafor" });
  ok((await p.inputValue("#f_fund")) === "C.A. New Hampshire C4", "the New Hampshire entity wasn't filled in from the state: " + JSON.stringify(r));
  await said(p, "Cancel."); await p.waitForTimeout(900);
  await said(p, "The North Dakota entity.");
  r = await ara(p, "show_opportunity_draft", { contact_name: "James Okafor" });
  ok(/named North Dakota, which has exactly these entities: North Dakota C4, North Dakota State PAC, North Dakota Federal PAC\. Ask which one of those, and name no other/.test(r.status || ""), "the North Dakota entities weren't listed exactly: " + JSON.stringify(r));
  await said(p, "Cancel."); await p.waitForTimeout(900);
  // a rating the officer never said is asked for, not proposed
  await said(p, "Let's take the next step for Ruth.");
  r = await ara(p, "set_capacity_rating", { contact_name: "Ruth Abernathy", rating: "A", confirmed: false });
  ok((r.ok === false || r.already) && (/What's Ruth's capacity rating\? A is \$250,000 and up/.test(r.ask_exactly || "") || (r.already && /already rated/.test(r.ask_exactly || ""))), "an invented rating wasn't turned into the question: " + JSON.stringify(r));
  await said(p, "Let's do C.");
  r = await ara(p, "set_capacity_rating", { contact_name: "Ruth Abernathy", rating: "C", confirmed: false });
  ok(r.ok && /^Rate Ruth C, \$25,000 to \$100,000\?$/.test(r.ask_exactly || ""), "a rating the officer did say wasn't asked with the letter and the range: " + JSON.stringify(r));
  // the Cultivation read-back opens with what the decision means
  await p.evaluate(() => { const c = S.contacts.find(x => x.first === "James"); S.opps = S.opps.filter(o => o.contactId !== c.id); c.capacity = "C"; S.opps.unshift({ id: "o_cult", contactId: c.id, name: "Okafor, James - 2026", stage: "Qualification", asks: [], fund: "C.A. Idaho C4", campaign: "Idaho", officer: OFFICER, participants: "", createdOn: todayISO() }); S.interactions.unshift({ id: "i_cult", contactId: c.id, date: todayISO(), type: "In person", summary: "Good talk.", substantive: true, kind: "interaction" }); save(); });
  await said(p, "I'm driving"); await p.waitForTimeout(900); await said(p, "Move James to Cultivation.");
  r = await ara(p, "show_cultivation_decision", { contact_name: "James Okafor", decision: "Move to Cultivation" });
  ok(/^Move James to Cultivation\? That means you, as the gift officer, believe they're ready to be pursued for a gift\. Yes to save, or no to change something\?$/.test(r.read_back || ""), "the Cultivation read-back isn't the decision with its meaning and the save question (Oct 29): " + JSON.stringify(r));
  await said(p, "Yes.");
  r = await ara(p, "save_form", { confirmed: true });
  ok(r.saved && /^James is now in Cultivation\. (Say undo if that's wrong\. )?The next step in the process to move James to Ask Planning is to add a planned ask\. Do you want to do that now, yes or no\?$/.test(r.ask_exactly || r.said || ""), "the Cultivation save line isn't \"James is now in Cultivation\": " + JSON.stringify(r));
  // a deferral reads back and saves as what it is
  await p.evaluate(() => { const c = S.contacts.find(x => x.first === "James"); const o = S.opps.find(o => o.id === "o_cult"); o.stage = "Qualification"; G.lastSaved = null; });
  await said(p, "Let's defer James's move, he's travelling until the new year, reconsider on January 15th.");
  r = await ara(p, "show_cultivation_decision", { contact_name: "James Okafor", decision: "Defer", reason: "Travelling until the new year", reconsiderOn: "2027-01-15" });
  ok(/^Defer James's move to Cultivation, reason: Travelling until the new year, reconsider on Jan 15, 2027\. Yes to save, or no to change something\?$/.test(r.read_back || ""), "the deferral read-back: " + JSON.stringify(r));
  await said(p, "Yes.");
  r = await ara(p, "save_form", { confirmed: true });
  ok(r.saved && /^James's move to Cultivation is deferred until Jan 15, 2027\. /.test(r.ask_exactly || ""), "the deferral save line: " + JSON.stringify(r));
});
test("Carverhill's Bugs call (Oct 28): \"in-person\" is in person; \"a follow-up in seven days\" keeps the date the officer gave; a three-word echo isn't the scripted line; a replayed tool call after a pick-up isn't done twice", async (p) => {
  await signIn(p);
  await p.waitForFunction(() => G.live, null, { timeout: 8000 }); await p.evaluate(() => { G.hands = false; G.cmdAt = 0; paintCall(); });
  await p.evaluate(() => { const S = window.__demo.state, o = S.opps.find(x => x.stage !== "Closed"); o.stage = "Ask Planning"; o.asks = [{ fund: "Citizens Alliance C3", campaign: "National", amount: 50000, askType: "Outright", status: "Planned", plannedDate: "2026-10-28" }]; delete o.pledge; S.tasks = S.tasks.filter(t => t.oppId !== o.id); window.__who = (() => { const c = S.contacts.find(c => c.id === o.contactId); return [c.first + " " + c.last, c.first]; })(); });
  const [name, first] = await p.evaluate(() => window.__who);
  await said(p, `Let's record the ask for ${name}.`);
  let r = await ara(p, "show_ask_result_draft", { contact_name: name, date: "2026-10-28" });
  await said(p, "In-person.");
  r = await ara(p, "show_ask_result_draft", { contact_name: name, date: "2026-10-28", meetingType: "In person" });
  let d = await p.evaluate(() => V.data);
  ok(d.meetingType === "In person" && !/Left out/.test(r.status || ""), "\"In-person.\" (with the hyphen) was not taken as the type: " + JSON.stringify({ type: d.meetingType, status: r.status }));
  await said(p, "He's going to think about it and talk to his wife.");
  r = await ara(p, "show_ask_result_draft", { contact_name: name, date: "2026-10-28", meetingType: "In person", response: "Awaiting", summary: "He needs to talk to his wife about it." });
  const in14 = (() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); })(); /* not a fixed date: the check ran past midnight UTC once (Oct 29) */
  ok(new RegExp("due in 14 days, on " + in14).test(r.ask_exactly || ""), "the suggestion didn't offer 14 days when no date was given: " + JSON.stringify(r));
  await said(p, "How about if it's a follow-up in seven days?");
  r = await ara(p, "show_ask_result_draft", { contact_name: name, date: "2026-10-28", meetingType: "In person", response: "Awaiting", summary: "He needs to talk to his wife about it.", nextDue: "2026-11-04" });
  d = await p.evaluate(() => V.data);
  ok(d.nextDue === "2026-11-04" && !/Left out/.test(r.status || "") && /due on Nov 4 as you said/.test(r.ask_exactly || ""), "the officer's seven days was dropped or the suggestion ignored it: " + JSON.stringify({ due: d.nextDue, r }));
  await said(p, "Yes, use that.");
  r = await ara(p, "show_ask_result_draft", { contact_name: name, date: "2026-10-28", meetingType: "In person", response: "Awaiting", summary: "He needs to talk to his wife about it.", nextStep: `Follow up with ${first} to get an answer on the ask`, nextDue: "2026-11-04" });
  d = await p.evaluate(() => V.data);
  ok(d.nextDue === "2026-11-04" && d.nextStep === `Follow up with ${first} to get an answer on the ask` && !r.still_needed, "the yes didn't keep the task with the officer's date: " + JSON.stringify({ step: d.nextStep, due: d.nextDue, still: r.still_needed }));
  // a short echo of the officer ("For the date.") shares words with the read-back but isn't Ara saying it: the scripted line stays pending
  await p.evaluate(() => { window.__noAutoForce = true; forceSay("Interaction report, the ask for Bugs Bunny. Date: Oct 28, today; Type: In person; Amount asked: $50,000; Response: Awaiting; Next step due: Nov 4. Shall I save it?"); });
  await p.waitForTimeout(300);
  await p.evaluate(() => { [{ type: "response.created" }, { type: "response.output_audio_transcript.delta", delta: "For the date." }].forEach(e => __ws.onmessage({ data: JSON.stringify(e) })); G.audioSamples = 30000; __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); });
  const f = await p.evaluate(() => ({ pending: !!G.forced, late: !!G.lateForced, log: ACT.q.map(a => a.text).join(" | ") }));
  ok(f.pending && !f.late && /Ara answered on her own while the scripted line was still to come/.test(f.log), "a three-word echo was taken for the scripted read-back (its real telling would then be cut): " + JSON.stringify(f));
  await p.evaluate(() => { G.forced = null; G.lateForced = null; window.__noAutoForce = false; });
  // the voice service replays its last tool call when the conversation is picked up after a drop: the same call, identical, is not done again
  await p.evaluate(() => { G.resumedAt = Date.now(); G.resumedHeardN = G.heardN || 0; }); /* nothing said yet on the new line */
  r = await ara(p, "show_ask_result_draft", { contact_name: name, date: "2026-10-28", meetingType: "In person", response: "Awaiting", summary: "He needs to talk to his wife about it.", nextStep: `Follow up with ${first} to get an answer on the ask`, nextDue: "2026-11-04" });
  ok(r.ok === false && /already handled before the line dropped/.test(r.error || "") && /Every required field of the "Interaction report · the ask" form is in|form has been read back|still needs/.test(r.error || ""), "the replayed call wasn't refused with where the form stands: " + JSON.stringify(r));
  ok(/Guard: tool call replayed after a pickup/.test(await p.evaluate(() => ACT.q.map(a => a.text).join(" | "))), "the replay wasn't logged");
  await p.evaluate(() => { G.resumedAt = 0; });
  r = await ara(p, "show_ask_result_draft", { contact_name: name, date: "2026-10-28", meetingType: "In person", response: "Awaiting", summary: "He needs to talk to his wife about it.", nextStep: `Follow up with ${first} to get an answer on the ask`, nextDue: "2026-11-04", amount: 50000 });
  ok(r.ok !== false, "a different call after the replay window was refused: " + JSON.stringify(r));
});
test("Ara: guidance sent while a scripted line is pending tells her not to say that line herself", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await p.evaluate(() => { G.responding = true; forceSay("A scripted line."); guide("Answer the officer."); G.responding = false; flushQueued(); });
  await p.waitForTimeout(300);
  const g = await p.evaluate(() => __sent.map(s => JSON.parse(s)).filter(e => e.type === "response.create" && e.response && e.response.instructions).map(e => e.response.instructions).pop() || "");
  ok(/don't say it or anything like it: "A scripted line\."/.test(g), "the guidance doesn't mention the pending scripted line: " + g);
});

test("Ara: a dead spot while reconnecting: the voice pass is tried again every few seconds instead of hanging, the phone says what's happening, and the line comes back", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  // Oct 25, 9:09 and 9:18 AM: the reconnect waited 89 s for a voice pass, then for ever; the officer heard nothing and had to end the call
  await p.evaluate(() => { window.__spoken = []; speechSynthesis.speak = (u) => __spoken.push(u.text); speechSynthesis.cancel = () => {}; TOK.p = null; TOK.at = 0;
    const f = window.fetch; window.__hang = true; window.fetch = (u, o) => (window.__hang && o && o.method === "POST" && /workers\.dev/.test(String(u)) && !/\/log/.test(String(u))) ? new Promise((_, rej) => { if (o.signal) o.signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))); }) : f(u, o); // a dead spot: the request never answers, only the app's own time limit ends it
    __ws.onclose({ code: 1006, reason: "" }); });
  await p.waitForTimeout(8500);
  const logged = () => p.evaluate(() => __logs.flatMap(l => l.events || [l]).concat(ACT.q).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)).map(a => a.text).join(" | "));
  const mid = await p.evaluate(() => ({ spoken: __spoken.slice(), status: G.status, live: G.live })); mid.log = await logged();
  ok(mid.live && /^Reconnecting/.test(mid.status) && /No voice pass yet \(no answer in 6 s\): trying again in 2 s/.test(mid.log), "a hanging voice pass fetch wasn't given up on and tried again: " + mid.status + " " + mid.log.slice(-300));
  const saidLines = (log) => (log.match(/The phone said \((recording|phone's speech)\): "[^"]*"/g) || []).map(x => x.replace(/^[^"]*"/, "").replace(/"$/, ""));
  ok(saidLines(mid.log).join("|") === "The line dropped. Reconnecting you to Ara.", "the phone didn't say the line dropped at 5 s: " + JSON.stringify(saidLines(mid.log)));
  await p.waitForTimeout(5000);
  const s2 = saidLines(await logged());
  ok(s2.length === 2 && s2[1] === "Still trying to reconnect.", "the phone didn't say it's still trying at 12 s: " + JSON.stringify(s2));
  await p.evaluate(() => { window.__hang = false; }); await p.waitForTimeout(4500);
  const end = await p.evaluate(() => ({ live: G.live, status: G.status, downAt: G.downAt, timer: G.downTimer, spoken: __spoken.length })); end.log = await logged();
  ok(end.live && end.status === "Listening" && /Voice pass fetched in \d+ ms/.test(end.log) && /Voice line open in/.test(end.log), "the line didn't come back once a voice pass could be fetched: " + end.status + " " + end.log.slice(-300));
  ok(!end.downAt && !end.timer && saidLines(end.log).join("|") === "The line dropped. Reconnecting you to Ara.|Still trying to reconnect.|You're back with Ara.", "the spoken reconnect lines didn't stop when the line came back, or the back line wasn't said: " + JSON.stringify(saidLines(end.log)));
  ok(/\(recording\)/.test(end.log), "the lines were not played as recordings through the call's own sound: " + end.log.slice(-400));
  // after the first minute down, "Still trying" comes every 30 s instead of every 10 s (Oct 25 4:38 PM: a 3-minute dead spot got the line 13 times)
  const gaps = await p.evaluate(() => { G.downAt = Date.now() - 20000; const a = downRepeatMs(); G.downAt = Date.now() - 70000; const b = downRepeatMs(); G.downAt = 0; return [a, b]; });
  ok(gaps[0] === 10000 && gaps[1] === 30000, "the still-trying line isn't every 10 s in the first minute and every 30 s after: " + JSON.stringify(gaps));
});
test("Ara: a drop with no form open comes back to the person just worked on, and a rating said before the questions is taken", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  let r = await ara(p, "show_contact_draft", { first: "Nora", last: "Quist", email: "nora@example.org", mobile: "(555) 010-0188" });
  ok(r.field === "capacity", "the rating wasn't asked first: " + JSON.stringify(r));
  // the officer answers before the questions have started (Oct 25: "a capacity rating of C" got every option read out)
  await p.evaluate(() => { V.opt = null; });
  r = await ara(p, "optional_fields", { step: "answer", value: "C" });
  ok((await p.inputValue("#f_capacity")) === "C" && r.field === "howMet" && /^Rating C is on the form\. Next field: how you met Nora/.test(r.ask_exactly || ""), "the rating said before the questions wasn't taken: " + JSON.stringify(r));
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  ok((await state(p)).contacts.find(c => c.first === "Nora").capacity === "C", "the contact didn't save with the rating");
  // the line drops with no form open: Ara carries on with Nora, never "anyone else" (Carverhill, Oct 25)
  await p.evaluate(() => { window.__ws0 = __ws; __ws.onclose({ code: 1006, reason: "" }); }); await p.waitForTimeout(1200);
  const line = await p.evaluate(() => ((G.justNow || {}).text || "")); /* Oct 29: the app says the line itself; what Ara is told is the Right now text */
  ok(/Carry on where you were/.test(line) && /The app has just said, in your voice, "Sorry, I lost you for a moment\. [^"]+\?"/.test(line) && !/You were working on|Saved so far|last things said/.test(line), "the reconnect line rebuilds Ara's memory instead of letting her carry on (Oct 28): " + line.slice(0, 600));
});
test("Ara: Move to Cultivation is refused while the criteria are missing, by voice and at the save", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await ara(p, "show_contact_draft", { first: "Vera", last: "Quill", email: "vera@example.org", capacity: "C" });
  for (let i = 0; i < 3 && !(await p.isVisible("[data-act=save]")); i++) await p.waitForTimeout(200);
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  await p.evaluate(() => { const c = S.contacts.find(x => x.first === "Vera"); S.opps.push({ id: "o_vq", contactId: c.id, name: "Quill, Vera - 2026", stage: "Qualification", asks: [], fund: "", campaign: "", officer: OFFICER, participants: "", createdOn: todayISO() }); save(); });
  const r = await ara(p, "show_cultivation_decision", { contact_name: "Vera Quill", decision: "Move to Cultivation" });
  ok(r.ok === false && /still needs .*a substantive interaction/.test(r.error || ""), "the move was offered without a substantive interaction: " + JSON.stringify(r));
  ok(!(await p.evaluate(() => !!document.getElementById("draftForm"))), "the Cultivation form opened anyway");
});
test("A voice pass refused by the key holder ends the call with the reason in the activity log and on screen", async (p) => {
  await signIn(p); await p.tap(".cb-end").catch(() => {}); await p.waitForTimeout(400);
  await p.evaluate(() => { TOK.p = null; TOK.t = 0; const f = window.fetch; window.fetch = (u, o) => /workers\.dev\/log/.test(String(u)) ? f(u, o) : Promise.resolve(new Response('{"error":"rate"}', { status: 429 })); });
  await p.tap("nav .micbtn"); await p.waitForTimeout(1500);
  ok(!(await p.evaluate(() => G.live)), "the call stayed live without a voice pass");
  ok(await p.isVisible("text=The voice service didn't answer (429)"), "the screen didn't name the refusal");
  await p.waitForTimeout(4600); const ends = (await p.evaluate(() => __logs)).flatMap(b => b.events.filter(e => e.role === "end").map(e => e.text));
  ok(ends.some(t => /couldn't start: service_429/.test(t)), "the end row doesn't carry the reason: " + ends.join(" | "));
});

test("OpenAI voice engine (Oct 27): the pass, the socket, the session shape, scripted lines by reply (one request at a time, no second copy), the replay after a drop", async (p) => {
  // the engine is chosen before the call: the pass is minted for it and the socket address, subprotocols and session body follow the provider table (preview/provider.js)
  await p.evaluate(() => { S.settings.provider = "openai"; save(); });
  await signIn(p);
  await p.waitForFunction(() => G.live, null, { timeout: 8000 });
  const url = await p.evaluate(() => __wsUrls[__wsUrls.length - 1]), protos = await p.evaluate(() => __wsProtos);
  ok(/^wss:\/\/api\.openai\.com\/v1\/realtime\?model=gpt-realtime-2\.1$/.test(url), "the socket isn't OpenAI's: " + url);
  ok(protos[0] === "realtime" && /^openai-insecure-api-key\.test-pass$/.test(protos[1] || ""), "the subprotocols don't carry the pass: " + JSON.stringify(protos));
  const sess = await p.evaluate(() => __sent.map(s => JSON.parse(s)).filter(x => x.type === "session.update").map(x => x.session));
  ok(sess.length >= 1 && sess[0].type === "realtime" && sess[0].model === "gpt-realtime-2.1" && sess[0].audio.input.turn_detection.type === "server_vad" && sess[0].audio.input.transcription.model && sess[0].audio.output.voice === "marin" && sess[0].tools.length > 10 && sess[0].instructions.length > 1000, "the OpenAI session body is wrong: " + JSON.stringify(sess.map(x => ({ type: x.type, model: x.model, td: x.audio && x.audio.input && x.audio.input.turn_detection, tr: x.audio && x.audio.input && x.audio.input.transcription, voice: x.audio && x.audio.output && x.audio.output.voice, tools: x.tools && x.tools.length, il: x.instructions && x.instructions.length }))).slice(0, 600));
  ok(!sess.some(x => x.resumption || x.replace || x.keyterms), "xAI-only extras were sent to OpenAI: " + JSON.stringify(sess.map(x => Object.keys(x))));
  ok(!sess.some(x => x.instructions && !x.type), "a session update went out without the session type: " + JSON.stringify(sess.map(x => Object.keys(x))));
  // a scripted line: no force_message on this engine, so the assistant is asked in a reply of its own to say it word for word
  let n0 = await p.evaluate(() => __sent.length);
  await p.evaluate(() => { G.responding = false; G.createAt = 0; forceSay("Contact saved for Nora."); }); // a free line: nothing asked for and not yet started
  await p.waitForTimeout(300);
  const sent = (n) => p.evaluate((n) => __sent.slice(n).map(s => JSON.parse(s)), n);
  let out = await sent(n0);
  ok(!out.some(x => x.item && x.item.type === "force_message"), "a force_message was sent to OpenAI");
  ok(out.some(x => x.type === "response.create" && /word for word[^]*"Contact saved for Nora\."/.test(x.response.instructions || "")), "the scripted line wasn't asked for by reply: " + JSON.stringify(out).slice(0, 300));
  // the assistant says it in its own words: accepted as said, no late copy expected
  await p.evaluate(() => { __ws.onmessage({ data: JSON.stringify({ type: "response.created" }) }); __ws.onmessage({ data: JSON.stringify({ type: "response.output_audio_transcript.delta", delta: "Okay, contact saved for Nora, all set." }) }); __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); });
  await p.waitForTimeout(200);
  ok(await p.evaluate(() => !G.forced && !G.lateForced && G.lastForcedText === "Contact saved for Nora."), "the line said in the assistant's own words wasn't taken as said: " + JSON.stringify(await p.evaluate(() => ({ forced: G.forced, late: G.lateForced }))));
  // one reply request at a time (run 1, Oct 27: "conversation_already_has_active_response" six times): the second waits for the first to finish
  const creates = (n) => p.evaluate((n) => __sent.slice(n).map(s => JSON.parse(s)).filter(x => x.type === "response.create"), n);
  n0 = await p.evaluate(() => __sent.length);
  await p.evaluate(() => { G.responding = false; G.createAt = 0; askReply("first guidance"); askReply("second guidance"); });
  await p.waitForTimeout(900); // the engine can take over half a second to report the first reply started: the second still waits
  ok((await creates(n0)).length === 1, "two reply requests went out at once: " + JSON.stringify(await creates(n0)).slice(0, 200));
  await p.evaluate(() => { __ws.onmessage({ data: JSON.stringify({ type: "response.created" }) }); __ws.onmessage({ data: JSON.stringify({ type: "response.output_audio_transcript.delta", delta: "Sure." }) }); __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); });
  await p.waitForTimeout(400);
  let cr = await creates(n0);
  ok(cr.length === 2 && /second guidance/.test(cr[1].response.instructions || ""), "the held request didn't go out after the reply finished: " + JSON.stringify(cr).slice(0, 300));
  // a refused request goes again after the running reply, not lost
  n0 = await p.evaluate(() => __sent.length);
  await p.evaluate(() => { __ws.onmessage({ data: JSON.stringify({ type: "response.created" }) }); __ws.onmessage({ data: JSON.stringify({ type: "error", error: { type: "invalid_request_error", code: "conversation_already_has_active_response", message: "Conversation already has an active response in progress" } }) }); });
  await p.waitForTimeout(100);
  ok((await creates(n0)).length === 0, "a request went out while the engine said one was running");
  await p.evaluate(() => { __ws.onmessage({ data: JSON.stringify({ type: "response.output_audio_transcript.delta", delta: "One moment." }) }); __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); });
  await p.waitForTimeout(400);
  ok((await creates(n0)).length === 1, "the refused request wasn't sent again after the running reply: " + JSON.stringify(await creates(n0)).slice(0, 200));
  ok(!(await p.evaluate(() => VLOG)).some(l => /Grok error/.test(l)), "the refusal was logged as an engine error");
  // a finished reply with no words is silence, not a dead line: asked again with the officer's words, and never a fresh line for it
  await said(p, "Move on.");
  await p.waitForTimeout(200);
  const urlsBefore = await p.evaluate(() => __wsUrls.length), dropsBefore = await p.evaluate(() => G.drops);
  n0 = await p.evaluate(() => __sent.length);
  const emptyReply = () => p.evaluate(() => { G.asked = true; __ws.onmessage({ data: JSON.stringify({ type: "response.created" }) }); __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); });
  await emptyReply(); await p.waitForTimeout(700);
  cr = await creates(n0);
  ok(cr.length === 1 && /The officer just said: "Move on\."/.test(cr[0].response.instructions || ""), "an empty reply wasn't asked again with the officer's words: " + JSON.stringify(cr).slice(0, 300));
  await emptyReply(); await p.waitForTimeout(1500);
  ok((await p.evaluate(() => __wsUrls.length)) === urlsBefore && (await p.evaluate(() => G.drops)) === dropsBefore && (await p.evaluate(() => G.live)) === true, "a second empty reply opened a fresh line");
  ok((await p.evaluate(() => VLOG.join("\n"))).includes("had no words twice"), "the second empty reply wasn't logged as waiting for the officer");
  // a scripted line is a reply request too: it waits while another request is pending (run 2, Oct 27: the line's request raced the tool-result request and was refused)
  n0 = await p.evaluate(() => __sent.length);
  await p.evaluate(() => { G.responding = false; G.createAt = 0; G.lastBot = ""; askReply("tool guidance"); forceSay("What's the first name?"); });
  await p.waitForTimeout(300);
  cr = await creates(n0);
  ok(cr.length === 1 && /tool guidance/.test(cr[0].response.instructions || ""), "the scripted line's request went out while the tool-result request was pending: " + JSON.stringify(cr).slice(0, 300));
  // the engine answers the tool result with the question itself: the scripted copy is dropped, not said a second time
  await p.evaluate(() => { __ws.onmessage({ data: JSON.stringify({ type: "response.created" }) }); __ws.onmessage({ data: JSON.stringify({ type: "response.output_audio_transcript.delta", delta: "What's the first name?" }) }); __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); });
  await p.waitForTimeout(600);
  cr = await creates(n0);
  ok(cr.length === 1 && !(await p.evaluate(() => G.forced || G.pendingForce)), "the question the engine had just asked was sent again as a scripted line: " + JSON.stringify(cr).slice(0, 300));
  ok((await p.evaluate(() => VLOG.join("\n"))).includes("scripted line already said"), "the dropped copy wasn't logged");
  // a scripted line refused because a reply was running goes again as a scripted line after it, not as a plain reply
  n0 = await p.evaluate(() => __sent.length);
  await p.evaluate(() => { G.responding = false; G.createAt = 0; G.lastBot = ""; forceSay("Shall I save it?"); });
  await p.waitForTimeout(100);
  ok((await creates(n0)).length === 1, "the scripted line didn't go out on a free line");
  await p.evaluate(() => { __ws.onmessage({ data: JSON.stringify({ type: "error", error: { type: "invalid_request_error", code: "conversation_already_has_active_response", message: "Conversation already has an active response in progress" } }) }); __ws.onmessage({ data: JSON.stringify({ type: "response.created" }) }); __ws.onmessage({ data: JSON.stringify({ type: "response.output_audio_transcript.delta", delta: "Got it, capacity C." }) }); __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); });
  await p.waitForTimeout(600);
  cr = await creates(n0);
  ok(cr.length === 2 && /word for word[^]*"Shall I save it\?"/.test(cr[1].response.instructions || ""), "the refused scripted line didn't go again as a scripted line: " + JSON.stringify(cr).slice(0, 400));
  await p.evaluate(() => { __ws.onmessage({ data: JSON.stringify({ type: "response.created" }) }); __ws.onmessage({ data: JSON.stringify({ type: "response.output_audio_transcript.delta", delta: "Shall I save it?" }) }); __ws.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed" } }) }); });
  await p.waitForTimeout(200);
  // the engine's own rule: tool first, no preamble (Grok's rules don't carry it)
  ok(/Call the tool first, with no words before it/.test(sess[0].instructions), "OpenAI's rules lack the no-preamble line");
  // a drop: no resumption on this engine, so the new line carries the last lines as text
  await said(p, "Let's add Nora Quist as a contact.");
  n0 = await p.evaluate(() => __sent.length);
  await p.evaluate(() => { G.drops = 0; G.loudAt = 0; __ws.onclose({ code: 1006, reason: "" }); }); await p.waitForTimeout(1800);
  const url2 = await p.evaluate(() => __wsUrls[__wsUrls.length - 1]);
  ok(/api\.openai\.com/.test(url2) && !/conversation_id/.test(url2), "the new line isn't a plain OpenAI socket: " + url2);
  out = await sent(n0);
  const items = out.filter(x => x.type === "conversation.item.create" && x.item.type === "message");
  ok(items.some(x => x.item.role === "user" && /Let's add Nora Quist/.test(x.item.content[0].text)) && items.some(x => x.item.role === "assistant" && /contact saved for Nora/i.test(x.item.content[0].text)) && items[items.length - 1].item.content[0].text.startsWith("(The line dropped"), "the last lines weren't replayed into the new session: " + JSON.stringify(items.map(x => x.item.content[0].text)));
  // Grok keeps everything as it was
  await p.evaluate(() => { endCall(); S.settings.provider = "grok"; save(); });
});

test("Gemini voice engine (Oct 27): the setup message, transcripts and tool calls translated, audio at 16 kHz, a scripted line and typed words as turns", async (p) => {
  await p.evaluate(() => { S.settings.provider = "gemini"; save(); });
  await signIn(p);
  await p.waitForFunction(() => G.live, null, { timeout: 8000 }).catch(async () => { throw new Error("the call never went live: " + JSON.stringify({ errors: p.errors, status: await p.evaluate(() => G.status), urls: await p.evaluate(() => window.__wsUrls), vlog: await p.evaluate(() => (G.vlog || []).slice(-6)) })); });
  const url = await p.evaluate(() => __wsUrls[__wsUrls.length - 1]);
  ok(/^wss:\/\/generativelanguage\.googleapis\.com\/ws\/google\.ai\.generativelanguage\.v1beta\.GenerativeService\.BidiGenerateContentConstrained\?access_token=test-pass$/.test(url), "the socket isn't Gemini's: " + url);
  const raw = (n) => p.evaluate((n) => __sent.slice(n).map(s => JSON.parse(s)), n);
  let out = await raw(0); const setup = out.find(x => x.setup);
  ok(setup && setup.setup.model === "models/gemini-3.8-live" && setup.setup.generationConfig.responseModalities[0] === "AUDIO" && setup.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName === "Kore" && setup.setup.systemInstruction.parts[0].text.length > 1000 && setup.setup.tools[0].functionDeclarations.length > 10 && setup.setup.inputAudioTranscription && setup.setup.outputAudioTranscription, "the setup message is wrong: " + JSON.stringify(setup).slice(0, 300));
  ok(!JSON.stringify(setup.setup.tools).includes('"additionalProperties"'), "a tool schema still carries additionalProperties, which Gemini refuses");
  ok(!out.some(x => x.type), "an app event reached Gemini's socket untranslated: " + JSON.stringify(out.filter(x => x.type).map(x => x.type)));
  // the line is ready; the officer's words come as transcript pieces, then a tool call
  const gem = (o) => p.evaluate((o) => __ws.onmessage({ data: JSON.stringify(o) }), o);
  await gem({ setupComplete: {} });
  ok(await p.evaluate(() => G.ws.ready === true), "setupComplete didn't mark the line ready");
  let n0 = await p.evaluate(() => __sent.length);
  await gem({ serverContent: { inputTranscription: { text: "Show me " } } }); await gem({ serverContent: { inputTranscription: { text: "the contacts." } } });
  await gem({ toolCall: { functionCalls: [{ id: "c1", name: "show_screen", args: { screen: "contacts" } }] } });
  await p.waitForTimeout(500);
  ok((await p.evaluate(() => G.recent)).some(l => l === "Officer: Show me the contacts."), "the officer's transcript pieces weren't joined into one heard line: " + JSON.stringify(await p.evaluate(() => G.recent)));
  ok(await titleOf(p) === "Contacts", "the tool call didn't open the Contacts screen: " + await titleOf(p));
  out = await raw(n0); const tr = out.find(x => x.toolResponse);
  ok(tr && tr.toolResponse.functionResponses[0].id === "c1" && tr.toolResponse.functionResponses[0].name === "show_screen" && typeof tr.toolResponse.functionResponses[0].response === "object" && tr.toolResponse.functionResponses[0].response.app_guidance, "the tool result didn't go back as a toolResponse with the app's guidance inside: " + JSON.stringify(tr).slice(0, 300));
  ok(!out.some(x => x.clientContent && x.clientContent.turnComplete), "a reply was requested as a user turn on top of the tool result (two replies)");
  // the model's turn: audio and its transcript, then the end of the turn
  const pcm = await p.evaluate(() => b64FromInt16(new Int16Array(480)));
  await gem({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: pcm } }] }, outputTranscription: { text: "Here are your contacts." } } });
  await p.waitForTimeout(100);
  ok(await p.evaluate(() => G.responding && /Here are your contacts\./.test(G.bot)), "the model turn didn't reach the app as a reply with its transcript: " + JSON.stringify(await p.evaluate(() => ({ responding: G.responding, bot: G.bot }))));
  await gem({ serverContent: { turnComplete: true } }); await p.waitForTimeout(200);
  ok(await p.evaluate(() => !G.responding), "turnComplete didn't end the reply");
  // a scripted line and typed words become user turns; the microphone goes out at 16 kHz
  n0 = await p.evaluate(() => __sent.length);
  await p.evaluate(() => { forceSay("Contact saved for Nora."); send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: "Hello there." }] } }); send({ type: "input_audio_buffer.append", audio: b64FromInt16(new Int16Array(240)) }); });
  await p.waitForTimeout(300);
  out = await raw(n0);
  ok(out.some(x => x.clientContent && x.clientContent.turnComplete && x.clientContent.turns[0].role === "user" && /word for word[^]*Contact saved for Nora\./.test(x.clientContent.turns[0].parts[0].text)), "the scripted line wasn't asked for as a user turn: " + JSON.stringify(out).slice(0, 300));
  ok(out.some(x => x.clientContent && x.clientContent.turnComplete && x.clientContent.turns[0].parts[0].text === "Hello there."), "typed words weren't sent as a whole user turn");
  const au = out.find(x => x.realtimeInput && x.realtimeInput.audio);
  ok(au && au.realtimeInput.audio.mimeType === "audio/pcm;rate=16000" && atob(au.realtimeInput.audio.data).length === 320, "the microphone audio wasn't sent at 16 kHz: " + JSON.stringify(au && { mime: au.realtimeInput.audio.mimeType, bytes: atob(au.realtimeInput.audio.data).length }));
  await p.evaluate(() => { endCall(); S.settings.provider = "grok"; save(); });
});


test("Ara: a tool call that lands before the officer's transcript waits for it (OpenAI sends the call first), and goes ahead without it after 2 s", async (p) => {
  await signIn(p);
  await p.waitForFunction(() => G.live, null, { timeout: 8000 });
  const ev = (p, e) => p.evaluate((e) => __ws.onmessage({ data: JSON.stringify(e) }), e);
  // the officer's speech ends, the engine's tool call arrives, and the transcript only 600 ms later: the meeting type must survive the evidence rule
  await ev(p, { type: "input_audio_buffer.speech_started" }); await ev(p, { type: "input_audio_buffer.speech_stopped" });
  await ev(p, { type: "response.function_call_arguments.done", call_id: "hold1", name: "show_interaction_draft", arguments: JSON.stringify({ contact_name: "Ken Ito", date: "2026-10-25", meetingType: "In person", summary: "Met Ken this morning; talked about the gala." }) });
  await p.waitForTimeout(600);
  ok(await p.evaluate(() => !V), "the form opened before the officer's transcript arrived");
  await said(p, "I met Ken Ito this morning, we talked about the gala.");
  await ev(p, { type: "response.done", response: { status: "completed" } }); await p.waitForTimeout(500);
  let d = await p.evaluate(() => V && V.data);
  ok(d && d.meetingType === "In person", "the meeting type the officer said was dropped (the call did not wait for the transcript): " + JSON.stringify(d && { meetingType: d.meetingType }));
  ok(await p.evaluate(() => VLOG.some(l => /show_interaction_draft: held \d+ ms for the officer's transcript$/.test(l))), "the hold was not logged");
  // no transcript at all: the call goes ahead after HEARD_WAIT_MS and the unsaid value is dropped as before
  await p.evaluate(() => { V = null; renderOverlay(); });
  await ev(p, { type: "input_audio_buffer.speech_started" }); await ev(p, { type: "input_audio_buffer.speech_stopped" });
  await ev(p, { type: "response.function_call_arguments.done", call_id: "hold2", name: "show_interaction_draft", arguments: JSON.stringify({ contact_name: "Ken Ito", date: "2026-10-25", meetingType: "Phone call", summary: "Met Ken this morning; talked about the gala." }) });
  await ev(p, { type: "response.done", response: { status: "completed" } });
  await p.waitForTimeout(1500); ok(await p.evaluate(() => !V), "the call did not wait when no transcript came");
  await p.waitForTimeout(1200);
  d = await p.evaluate(() => V && V.data);
  ok(d && !d.meetingType, "a meeting type the officer never said stayed on the form after the wait: " + JSON.stringify(d && { meetingType: d.meetingType }));
  ok(await p.evaluate(() => VLOG.some(l => /show_interaction_draft: held \d+ ms for the officer's transcript \(it didn't come\)$/.test(l))), "the give-up was not logged");
});

test("Carverhill's Ruth call (Oct 28): \"change the amount of the ask\" is the amount asked, not an agreed amount, and the next-step line has no day count", async (p) => {
  await signIn(p);
  await p.waitForFunction(() => G.live, null, { timeout: 8000 }); await p.evaluate(() => { G.hands = false; G.cmdAt = 0; paintCall(); });
  await said(p, "Let's go record the ask for Ruth Abernathy. It was an in-person meeting.");
  let r = await ara(p, "show_ask_result_draft", { contact_name: "Ruth Abernathy", date: "2026-10-28", meetingType: "In person" });
  ok(r.ok && (await p.evaluate(() => V && V.action === "ask")), "the ask form didn't open: " + JSON.stringify(r));
  await said(p, "Well, she accepted, but can we change the amount of the ask? It was for 75,000 dollars.");
  r = await ara(p, "show_ask_result_draft", { contact_name: "Ruth Abernathy", date: "2026-10-28", meetingType: "In person", response: "Accepted", agreedAmount: 75000, summary: "Ruth accepted the ask in person." });
  const d = await p.evaluate(() => V.data);
  ok(d.amount === 75000 && !d.agreedAmount, "the changed ask amount landed in Agreed instead of Amount asked: " + JSON.stringify({ amount: d.amount, agreedAmount: d.agreedAmount }));
  ok(/\$75,000 is now the Amount asked/.test(r.status || ""), "Ara wasn't told the amount moved: " + JSON.stringify(r.status));
  // a genuine counter figure stays an agreed amount
  await said(p, "Actually she countered at 50,000.");
  r = await ara(p, "show_ask_result_draft", { contact_name: "Ruth Abernathy", date: "2026-10-28", meetingType: "In person", response: "Countered", agreedAmount: 50000, summary: "Ruth countered." });
  const d2 = await p.evaluate(() => V.data);
  ok(d2.amount === 75000 && d2.agreedAmount === 50000, "a counter figure was moved out of Agreed: " + JSON.stringify({ amount: d2.amount, agreedAmount: d2.agreedAmount }));
  // the spoken next step for an ask awaiting its answer carries no "(N days)"
  const line = await p.evaluate(() => { const o = S.opps.find(x => x.stage === "Ask Made" && latestAsk(x) && latestAsk(x).status === "Made"); return o ? nextStep(o).line : "none"; });
  ok(/^record \w+'s answer$/.test(line), "the next-step line still carries a day count: " + JSON.stringify(line));
});

test("Awaiting answer (Oct 28): Ara explains the follow-up task is required and suggests the words; the officer's yes fills it; hands-free asks the same way", async (p) => {
  await signIn(p);
  await p.waitForFunction(() => G.live, null, { timeout: 8000 }); await p.evaluate(() => { G.hands = false; G.cmdAt = 0; paintCall(); });
  await p.evaluate(() => { const S = window.__demo.state, o = S.opps.find(x => x.stage !== "Closed"); o.stage = "Ask Planning"; o.asks = [{ fund: "Citizens Alliance C3", campaign: "National", amount: 5800, askType: "Outright", status: "Planned", plannedDate: "2026-10-23" }]; delete o.pledge; S.tasks = S.tasks.filter(t => t.oppId !== o.id); window.__who = (() => { const c = S.contacts.find(c => c.id === o.contactId); return [c.first + " " + c.last, c.first]; })(); });
  const [name, first] = await p.evaluate(() => window.__who);
  await said(p, `Let's record the ask for ${name}. It was in person yesterday. He's going to think about it.`);
  let r = await ara(p, "show_ask_result_draft", { contact_name: name, date: "2026-10-27", meetingType: "In person", response: "Awaiting", summary: "He needs to talk to his wife about it." });
  const want = `Follow up with ${first} to get an answer on the ask`;
  ok(r.field === "nextStep" && (r.ask_exactly || "").includes(`needs a follow-up task, which becomes a Task for you. I suggest "${want}", due in 14 days, on Nov 10. Shall I use that, or do you want different words?`) && /nextDue 2026-11-10/.test(r.next || ""), "the app didn't ask the follow-up question with the suggested words: " + JSON.stringify(r));
  await said(p, "Yes, use that.");
  r = await ara(p, "show_ask_result_draft", { contact_name: name, date: "2026-10-27", meetingType: "In person", response: "Awaiting", summary: "He needs to talk to his wife about it.", nextStep: want, nextDue: "2026-11-10" });
  let d = await p.evaluate(() => V.data);
  ok(d.nextStep === want && d.nextDue === "2026-11-10" && !r.still_needed, "the officer's yes didn't keep the suggested task (the evidence rule dropped Ara's words?): " + JSON.stringify({ nextStep: d.nextStep, nextDue: d.nextDue, still: r.still_needed }));
  // hands-free: the app asks the same question itself at the read-back, and a bare yes fills the task
  await p.evaluate(() => { V = null; G.recent = []; G.hands = true; renderOverlay(); });
  await said(p, `Record the ask for ${name}, in person yesterday, awaiting his answer, he'll talk to his wife.`);
  r = await ara(p, "show_ask_result_draft", { contact_name: name, date: "2026-10-27", meetingType: "In person", response: "Awaiting", summary: "He'll talk to his wife." });
  ok(r.field === "nextStep" && /needs a follow-up task, which becomes a Task for you\. I suggest "Follow up with \w+ to get an answer on the ask", due in 14 days, on Nov 10\. Shall I use that, or do you want different words\?$/.test(r.ask_exactly || ""), "hands-free didn't ask with the suggestion: " + JSON.stringify(r));
  await said(p, "Yes.");
  r = await ara(p, "save_form", { confirmed: false });
  d = await p.evaluate(() => V.data);
  ok(d.nextStep === want && d.nextDue === "2026-11-10" && /next step, Follow up with/.test(r.ask_exactly || r.read_back || ""), "a bare yes didn't fill the suggested task before the read-back: " + JSON.stringify({ nextStep: d.nextStep, r }));
});
// Carverhill's Oct 28 11:51 AM call: "B. B." refused as a rating, his yes to Ara's own opportunity offer refused, a saved rating re-asked after a reconnect, the A to E ranges read twice
test("Oct 28 11:51 AM call: a repeated letter rates, a yes to Ara's offer opens the form, a saved rating isn't re-asked, the ranges are read once", async (p) => {
  await signIn(p);
  await ara(p, "show_contact_draft", { first: "Horatio", last: "Alger", email: "ha@example.org" });
  for (let i = 0; i < 3 && !(await p.isVisible("[data-act=save]")); i++) await p.waitForTimeout(200);
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  const c0 = (await state(p)).contacts.find(c => c.first === "Horatio"), name = "Horatio Alger";
  ok(c0 && !c0.capacity, "test contact not added unrated");
  // the first rating question reads the ranges; the officer answers "B" and the service sends the transcript three times as it grows
  await p.evaluate(() => { G.rangesSaid = false; recent("Ara", "What rating would you give him, A through E?"); });
  const first = await ara(p, "set_capacity_rating", { contact_name: name, rating: "B", confirmed: false });
  ok(/A is \$250,000 and up/.test(first.ask_exactly || ""), "the first rating question didn't read the ranges: " + JSON.stringify(first));
  await said(p, "B"); await said(p, "B"); await said(p, "B. B.");
  ok((await p.evaluate(() => officerLines(3))).join("|") === "b. b.", "the growing transcript piled up as several officer lines: " + (await p.evaluate(() => officerLines(3))).join("|"));
  const bb = await ara(p, "set_capacity_rating", { contact_name: name, rating: "B", confirmed: false });
  ok(/^Rate Horatio B, \$100,000 to \$250,000\?$/.test(bb.ask_exactly || ""), "\"B. B.\" wasn't taken as the officer's rating: " + JSON.stringify(bb));
  // a bare letter right after Ara's rating question counts too
  await p.evaluate(() => { recent("Ara", "What's Horatio's capacity rating, A to E?"); }); await said(p, "C.");
  const c = await ara(p, "set_capacity_rating", { contact_name: name, rating: "C", confirmed: false });
  ok(/^Rate Horatio C, \$25,000 to \$100,000\?$/.test(c.ask_exactly || ""), "a bare letter after the rating question wasn't taken: " + JSON.stringify(c));
  // a later rating question is short
  await said(p, "Let's take the next step."); await said(p, "What else is there?"); await said(p, "Go on.");
  const again = await ara(p, "set_capacity_rating", { contact_name: name, rating: "A", confirmed: false });
  ok(again.ask_exactly === "What's Horatio's capacity rating, A to E?", "the second rating question read the ranges again: " + JSON.stringify(again));
  await said(p, "B."); const yes = await ara(p, "set_capacity_rating", { contact_name: name, rating: "B", confirmed: true });
  ok(yes.saved && (await state(p)).contacts.find(x => x.id === c0.id).capacity === "B", "not saved after yes");
  // the resumed line asks about the saved rating again: the app answers "already B" instead of asking
  const already = await ara(p, "set_capacity_rating", { contact_name: name, rating: "B", confirmed: false });
  ok(already.already && /^Horatio is already rated B, \$100,000 to \$250,000\. The next step in the process to move Horatio to Qualification is to create an opportunity\. Do you want to do that now, yes or no\?$/.test(already.ask_exactly || ""), "a saved rating was re-asked, or the line lacks the letter, range and next step: " + JSON.stringify(already));
  // Ara offers the opportunity, the officer says yes (sent three times as the transcript grows): the form opens
  await p.evaluate(() => { G.lastSaved = { at: Date.now(), who: "Horatio Alger", next: "" }; recent("Ara", "It's saved. Would you like to create an opportunity for him?"); });
  await said(p, "Yes."); await said(p, "Yes."); await said(p, "Yes.");
  const opp = await ara(p, "show_opportunity_draft", { contact_name: name });
  ok(opp.opened !== false && !/hasn't asked for/.test(opp.error || "") && await p.evaluate(() => !!(V && V.action === "opportunity")), "the yes to Ara's own offer didn't open the opportunity form: " + JSON.stringify(opp));
});

test("Reconnect lines with the officer's name (Oct 28): fetched once from the key holder and kept on the phone, said in turn while the line is down, the stock recordings when the phone has none", async (p) => {
  await signIn(p, "Pat"); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  // the fetch: one request per line, in the stand-in voice, stored under the name; a reply that isn't audio is not kept
  await p.evaluate(() => { window.__tts = []; const f = window.fetch; window.fetch = (u, o) => { if (/workers\.dev\/tts/.test(String(u))) { const b = JSON.parse(o.body); b.code = (o.headers || {})["X-Demo-Code"]; __tts.push(b); return Promise.resolve(new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "Content-Type": "audio/mpeg" } })); } return f(u, o); };
    localStorage.removeItem("namedLines:v4"); Object.keys(namedRaw).forEach(k => delete namedRaw[k]); });
  await p.evaluate(() => prepNamedLines("test")); await p.waitForTimeout(400);
  const fetched = await p.evaluate(() => ({ n: __tts.length, voices: [...new Set(__tts.map(b => b.voice))], texts: __tts.map(b => b.text), stored: JSON.parse(localStorage.getItem("namedLines:v4") || "null"), log: ACT.q.map(a => a.text).join(" | ") }));
  ok(await p.evaluate(() => __tts.every(b => b.code === "veleer2026")), "the line fetch didn't carry the demo code (the key holder refuses it without one; Oct 28)");
  ok(fetched.n === 13 && fetched.voices.join() === "eve" && fetched.texts[0] === "The line dropped, Pat. Reconnecting you to Ara." && fetched.texts.includes("Still trying, Pat. I'm not giving up on you.") && fetched.texts.includes("Hang in there, Pat. I'll keep knocking until Ara answers.") && fetched.texts[7] === "You're back with Ara, Pat." && fetched.texts.includes("Still waiting on Ara.") && fetched.texts.includes("I'll hang up for now. Your form stays on the screen."), "the named and phone lines weren't fetched as expected: " + JSON.stringify(fetched.texts));
  ok(fetched.stored && fetched.stored.name === "Pat" && Object.keys(fetched.stored.lines).length === 13 && /13 phone lines with Pat's name fetched \(test\)/.test(fetched.log), "the lines weren't kept on the phone under the name: " + JSON.stringify(fetched.stored && Object.keys(fetched.stored.lines).length) + " " + fetched.log.slice(-200));
  await p.evaluate(() => { __tts.length = 0; }); await p.evaluate(() => prepNamedLines("again")); await p.waitForTimeout(200);
  ok(await p.evaluate(() => __tts.length === 0), "the lines were fetched a second time although the phone has them");
  // with the lines decoded, the dropped line and the still-trying lines come with the name, in turn; back too
  const saidLines = (log) => (log.match(/The phone said \(recording\): "[^"]*"/g) || []).map(x => x.replace(/^[^"]*"/, "").replace(/"$/, ""));
  await p.evaluate(() => { namedTexts("Pat").forEach(t => { namedBuf[t] = G.ctx.createBuffer(1, 240, 24000); }); G.live = true; G.downAt = Date.now() - 6000; G.downN = 0; downSay("dropped"); downSay("still"); downSay("still"); downSay("still"); });
  await p.waitForTimeout(150); await p.evaluate(() => downEnd(true)); /* a status line still playing would be cut instead */
  let said = saidLines(await p.evaluate(() => ACT.q.map(a => a.text).join(" | ")));
  ok(said.join("|") === "The line dropped, Pat. Reconnecting you to Ara.|Still trying, Pat. I'm not giving up on you.|Hang in there, Pat. I'll keep knocking until Ara answers.|No signal yet, Pat, but I'm as determined as ever.|You're back with Ara, Pat.", "the named lines weren't said in turn: " + JSON.stringify(said));
  // a phone without the named lines falls back to the stock recordings
  await p.evaluate(() => { Object.keys(namedBuf).forEach(k => delete namedBuf[k]); ACT.q.length = 0; G.downAt = Date.now() - 6000; G.downN = 0; downSay("dropped"); downSay("still"); });
  await p.waitForTimeout(150); await p.evaluate(() => { G.lineEndAt = 0; downEnd(true); }); /* as if the recording had finished */
  said = saidLines(await p.evaluate(() => ACT.q.map(a => a.text).join(" | ")));
  ok(said.join("|") === "The line dropped. Reconnecting you to Ara.|Still trying to reconnect.|You're back with Ara.", "without the named lines the stock recordings weren't used: " + JSON.stringify(said));
  // the give-up is 10 minutes, warned from 8 (Carverhill Oct 29; an 8-minute dead spot, Oct 28)
  ok(await p.evaluate(() => NO_LINE_GIVE_UP_MS === 600000 && DOWN_GIVE_UP_MS === 600000 && WARN_GIVE_UP_MS === 480000), "the give-up isn't 10 minutes with the warning at 8");
  // 4:12 PM call: while a reply is outstanding, after "Ara's taking a moment." the phone says "Still waiting on Ara." every 10 s; with a form open the quiet allowance is 60 s and the hang-up line is the phone's own
  await p.evaluate(() => { namedTexts("Pat").forEach(t => { namedBuf[t] = G.ctx.createBuffer(1, 240, 24000); }); ACT.q.length = 0; G.asked = true; G.askedAt = Date.now() - 5000; G.slowSaid = true; G.slowAt = Date.now() - 11000; G.tickAt = 0; idleCheck(); G.asked = false; });
  ok(await p.evaluate(() => ACT.q.some(a => a.text === 'The phone said (recording): "Still waiting on Ara."') && Date.now() - G.slowAt < 2000), "the still-waiting line wasn't said 10 s after the slow line: " + JSON.stringify(await p.evaluate(() => ACT.q.map(a => a.text))));
  await p.evaluate(() => { G.slowAt = Date.now() - 4000; G.tickAt = 0; ACT.q.length = 0; G.asked = true; idleCheck(); G.asked = false; });
  ok(await p.evaluate(() => !ACT.q.some(a => /Still waiting on Ara/.test(a.text))), "the still-waiting line repeated sooner than 10 s");
  const idle = await p.evaluate(() => { const a = idleMs(); V = { action: "task", data: {}, target: {}, fromVoice: new Set() }; const b = idleMs(); G.hands = false; const c = idleMs(); G.hands = true; return [a, b, c]; });
  ok(idle[0] === 30000 && idle[1] === 60000 && idle[2] === 60000, "the quiet allowance isn't 30 s, and 60 s with a form open: " + JSON.stringify(idle));
  await p.evaluate(() => { ACT.q.length = 0; G.lastAct = Date.now(); __ws.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.timeout_triggered" }) }); });
  ok(await p.evaluate(() => !G.idleEnding && ACT.q.some(a => /its idle timer\): ignored, a form is open and the phone allows 60 s/.test(a.text))), "the service's idle timer hung up although a form is open and the phone allows 60 s: " + JSON.stringify(await p.evaluate(() => [G.idleEnding, ACT.q.map(a => a.text)])));
  await p.evaluate(() => { ACT.q.length = 0; idleStart(); });
  ok(await p.evaluate(() => G.idleEnding && !!G.idleTimer && ACT.q.some(a => a.text === 'The phone said (recording): "I\'ll hang up for now. Your form stays on the screen."') && !G.forced), "the hang-up line with a form open wasn't the phone's own recording: " + JSON.stringify(await p.evaluate(() => ACT.q.map(a => a.text))));
  await p.evaluate(() => { clearTimeout(G.idleTimer); G.idleEnding = false; G.idleAt = 0; V = null; });
  // Ara's audio arriving while a phone line still plays is queued until the line ends (no overlap)
  const q = await p.evaluate(() => { G.lineEndAt = Date.now() + 1500; G.playHead = 0; const t0 = G.ctx.currentTime; playPcm(new Int16Array(2400)); const d = G.playHead - 0.1 - t0; G.lineEndAt = 0; G.playHead = 0; return d; });
  ok(q > 2.4 && q < 3.2, /* the line's 1.5 s plus the 1 s gap (LINE_GAP_S, Oct 28 10:43 PM) */ "Ara's audio wasn't held until the phone's line had finished: started " + q.toFixed(2) + " s out");
});

test("Call start (Oct 29): Ara's configuration goes up on the warmed line at the touch, and the tap sends it again only if something changed", async (p) => {
  // a finger rests on the button before the tap lands (on a phone the mic then takes about a second): the warm-up has time to open
  await p.tap("text=I'd rather type my name"); await p.waitForTimeout(400); /* the welcome clears an autofilled name 300 ms after it opens; a name typed before that goes with it (the quick signIn helper taps Start before then) */ await p.fill("#wlName", "Sam"); { const b = (await p.$("[data-act4=welcome-ok]")), box = await b.boundingBox(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(300); await p.mouse.up(); } await p.waitForTimeout(500);
  await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }).catch(async () => { throw new Error("no live line: " + JSON.stringify(await p.evaluate(() => ({ status: G.status, live: G.live, name: S.settings.userName, vlog: VLOG.slice(-8) })))); }); await p.waitForTimeout(400);
  const f = await p.evaluate(() => { const sent = __sent.map(s => { try { return JSON.parse(s); } catch (e) { return {}; } }); const ups = sent.filter(x => x.type === "session.update");
    return { full: ups.filter(x => x.session && x.session.instructions && x.session.tools).length, instrOnly: ups.filter(x => x.session && x.session.instructions && !x.session.tools).length, extras: ups.filter(x => x.session && (x.session.resumption || x.session.replace)).length,
      log: ACT.q.map(a => a.text).join(" | "), vlog: VLOG.join(" | "), rules: G.sentRules === rulesKey(), ctx: G.sentCtx === ctxNow() }; });
  ok(/configuration sent on the warmed line \(5 updates\)/.test(f.vlog) && /Ara's configuration went up on the warmed line \d+ ms before the tap finished/.test(f.log), "the configuration didn't go up on the warmed line: " + f.vlog.slice(0, 600));
  ok(f.full === 1 && f.extras === 2 && f.instrOnly === 0 && f.rules && f.ctx, "the tap sent the configuration again, or the rules/Right now markers don't match the live call: " + JSON.stringify({ full: f.full, extras: f.extras, instrOnly: f.instrOnly, rules: f.rules, ctx: f.ctx }));
  // a line opened without a warm-up (a reconnect, a Carry on) still sends the whole configuration itself
  await p.evaluate(() => { __sent.length = 0; G.loudAt = 0; __ws.onclose({ code: 1006, reason: "" }); });
  await p.waitForFunction(() => G.live && G.ws === window.__ws && G.status === "Listening" && __sent.some(s => s.includes('"session.update"')), null, { timeout: 9000 }); await p.waitForTimeout(300);
  ok(await p.evaluate(() => __sent.map(s => { try { return JSON.parse(s); } catch (e) { return {}; } }).filter(x => x.type === "session.update" && x.session && x.session.tools).length === 1), "the fresh line after a drop didn't send the full configuration");
});
};

