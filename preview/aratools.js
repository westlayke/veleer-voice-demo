"use strict";
// Ara's tools: what the app does when Ara calls a lookup, an app action or a draft form (loaded after voice.js, sharing its scope)
// Ara's lookup and app tools: one function each (the draft tools share draftTool below)
const TOOL_HANDLERS = {
  set_user_name(callId, data, name) {
    const v = String(data.first_name || "").trim().split(/\s+/)[0].replace(/\s+/g, " ").slice(0, 60);
    if (!v) { toolReply(callId, { ok: false, error: "No name given. Ask the officer who they mean." }); return; }
    // names are easy to mishear (Matt came through as "Eve"): read it back, spelled, and save only once they say yes
    if (data.confirmed !== true || !G.nameCheck || norm(G.nameCheck) !== norm(v)) { G.nameCheck = v;
      toolReply(callId, { ok: true, saved: false, status: `Not saved yet. Say exactly: "Did I get that right: ${v}, ${spellOut(v)}?" and wait. If they say yes, call set_user_name again with "${v}" and confirmed true. If they correct it or spell it, call set_user_name with their spelling and confirmed false, and read that back the same way.` }); return; }
    G.nameCheck = null;
    const wasAsking = !!document.getElementById("wlName"); // the name screen was open
    S.settings.userName = v; S.settings.seenPrivacy = true; S.settings.seenFormLog = true; S.seenWelcome = true; if (wasAsking) S.screen = "home"; save(); applyName(); welcomeModal(); render(); if (wasAsking) window.scrollTo(0, 0); whenIdle("instr");
    toolReply(callId, { ok: true, status: `Saved. You already introduced yourself, so don't say your name or role again. If they haven't asked for anything yet, say exactly: "Nice to meet you, ${v}. What would you like to do?" If they ask what you can do, say exactly: "${CAN_DO}" If they ask for the process, walk them through it as you would for "Walk me through the process". If they already asked for something, say "Thanks, ${v}" and carry on with it.` }); return;
  },
  set_capacity_rating(callId, data, name) {
    const r = normCap(data.rating);
    // a contact still being added: the rating goes on the open New contact form and saves with it
    if (V && V.action === "contact") { const nm = norm(data.contact_name || ""), d = readDraft();
      const hit = (x) => !!norm(x) && nm.includes(norm(x));
      if (!nm || hit(d.first) || hit(d.last) || !findContacts(data.contact_name).length) {
        if (!r) { askRating(callId, d.first || "this contact"); return; }
        d.capacity = r; V.data = d; V.fromVoice.add("capacity"); renderOverlay();
        toolReply(callId, { ok: true, on_draft: true, say: `The rating ${capSaid(r)} is on the New contact form now. It saves with the contact when they tap "${ACTIONS.contact.saveLabel}". Say "Rating ${capSaid(r)}, is on the form.", with the letter, then carry on.` }); return; } }
    // that contact's Edit form is open: the rating goes on the form, otherwise the form keeps showing (and would save back) the old one
    if (V && V.action === "editContact" && V.target.contact) { const ec = V.target.contact, nm = norm(data.contact_name || "");
      if (!nm || nm.includes(norm(ec.first)) || nm.includes(norm(ec.last))) {
        if (!r) { askRating(callId, ec.first); return; }
        const d = readDraft(); d.capacity = r; V.data = d; V.fromVoice.add("capacity"); renderOverlay();
        toolReply(callId, { ok: true, on_draft: true, saved: false, say: `The rating ${capSaid(r)} is on ${ec.first}'s Edit contact form now. It is NOT saved yet: say "Rating ${capSaid(r)}, is on the form.", with the letter, and ask them to check it and tap "${ACTIONS.editContact.saveLabel}".` }); return; } }
    const t = resolveTarget("interaction", data.contact_name || "");
    if (t.error) { toolReply(callId, { ok: false, error: t.error }); return; }
    const c = t.contact, was = c.capacity;
    if (!r) { askRating(callId, c.first); return; }
    if (was === r) { toolReply(callId, { ok: true, saved: true, already: true, contact: nameOf(c), rating: capSaid(r), said: "The app said this itself; never ask about the rating again.", ask_exactly: `${c.first} is already rated ${capSaid(r)}. ${nextStepLine(c)}` }); return; } /* Oct 28: a resumed line re-asked a saved rating */
    // a rating the officer never said (Oct 25: "Let's take the next step" became "Rate Joseph A?"): the app asks them instead
    if (!data.confirmed && !officerRated()) { vlog(`${name}: rating ${r} not from the officer; asking`); toolReply(callId, { ok: false, saved: false, error: "The officer hasn't said a rating; the app is asking them which. After the answer, call set_capacity_rating again with that rating.", ask_exactly: rateQ(c.first) }); return; }
    S.sel.contact = c.id; if (S.screen !== "contact") go("contact"); else render();
    // the app says the rating lines itself, letter then range in full (Carverhill, Oct 28: Ara's own wording dropped the letter)
    if (!data.confirmed) { toolReply(callId, { ok: true, contact: nameOf(c), now: was ? capSaid(was) : "not rated", will_become: capSaid(r), said: "The app asked the officer this itself. After their yes, call set_capacity_rating again with confirmed true.", ask_exactly: `Rate ${c.first} ${capSaid(r)}?` }); return; }
    c.capacity = r; log(`Capacity rated ${r} (${CAPACITY[r]})`, { contactId: c.id }); save(); render(); toast(`${nameOf(c)}: capacity ${r} · ${CAPACITY[r]}`);
    toolReply(callId, { ok: true, saved: true, rating: capSaid(r), said: "The app said the save and the next step itself; wait for the officer's answer.", ask_exactly: `${c.first} is rated ${capSaid(r)}. ${nextStepLine(c)}` }); return;
  },
  // "What's the next step?" for a contact or opportunity: the app says it, word for word (Carverhill, Oct 28)
  say_next_step(callId, data, name) {
    let c = null;
    if (data.contact_name) { const t = resolveTarget("interaction", data.contact_name); if (t.error) { toolReply(callId, { ok: false, error: t.error }); return; } c = t.contact; }
    else { const o = S.screen === "opp" ? oppById(S.sel.opp) : null;
      c = (V && V.target && V.target.contact) || (S.screen === "contact" && contactById(S.sel.contact)) || (o && contactById(o.contactId)) || (G.lastSaved && G.lastSaved.contactId && contactById(G.lastSaved.contactId)) || null; }
    if (!c) { toolReply(callId, { ok: false, error: "No contact is open. Ask which contact or opportunity they mean, then call say_next_step with the name." }); return; }
    act("step", `${name}: ${nameOf(c)}`); toolReply(callId, { ok: true, contact: nameOf(c), said: "The app said the next step itself; wait for the officer's answer.", ask_exactly: nextStepLine(c) });
  },
  set_task_status(callId, data, name) {
    const words = (data.task || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !["the", "and", "for", "task", "with", "about"].includes(w));
    const who = data.contact_name ? resolveTarget("interaction", data.contact_name) : null;
    let pool = S.tasks.filter(t => !who || who.error || t.contactId === who.contact.id);
    if (data.status !== "done" && data.status !== "to_do") pool = pool.filter(t => !t.done);
    const score = (t) => { const tx = (t.text + " " + taskWhere(t)).toLowerCase(); return words.filter(w => tx.includes(w)).length; };
    const ranked = pool.map(t => [t, score(t)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1] || (a[0].done - b[0].done));
    if (!ranked.length) { toolReply(callId, { ok: false, error: "No task matches that. Ask which task they mean, or offer to read their open tasks." }); return; }
    if (ranked.length > 1 && ranked[1][1] === ranked[0][1]) { toolReply(callId, { ok: false, matches: ranked.slice(0, 4).map(x => ({ task: x[0].text, for: taskWhere(x[0]), status: TSTAT[taskStatus(x[0])] })), error: "More than one task matches. Read these briefly and ask which one." }); return; }
    const t = ranked[0][0], st = { to_do: "todo", in_progress: "doing", waiting: "waiting", done: "done" }[data.status] || "done";
    const until = st === "waiting" ? (/^\d{4}-\d{2}-\d{2}$/.test(data.check_back_on || "") ? data.check_back_on : addDays(todayISO(), 7)) : null;
    const change = st === "waiting" ? `Waiting, check back ${fmtDate(until)}` : TSTAT[st];
    if (!data.confirmed) { go("tasks"); whenIdle("instr"); setTimeout(() => { const r = document.querySelector(`.trow[data-tid="${t.id}"]`); if (r) { r.classList.add("tflash"); r.scrollIntoView({ block: "center", behavior: "smooth" }); } }, 150);
      toolReply(callId, { ok: true, task: t.text, for: taskWhere(t), now: TSTAT[taskStatus(t)], will_become: change, ask_exactly: `Mark '${t.text}'${taskWhere(t) ? " for " + taskWhere(t) : ""}${t.due ? ", due " + fmtDate(t.due) : ""}, as ${change.toLowerCase()}?${st === "waiting" && !data.check_back_on ? " The check-back date would be a week from today unless you want another day." : ""}`, next: "The app asked the question itself; don't ask it again. Wait for yes before calling again with confirmed true." }); return; } // the question is scripted (Oct 25 6:03 PM: Ara announced it and then asked it, "Didn't you just ask me that?")
    const undo = setTaskStatus(t, st, until); go("tasks"); toast(`${change}: ${t.text}`, undo);
    const meetingish = /follow|call|meet|visit|lunch|coffee|pledge|ask/i.test(t.text);
    toolReply(callId, { ok: true, saved: true, task: t.text, status: change, say: `Confirm in one short sentence that it's saved${st === "done" && meetingish ? ", then ask whether they'd like to log an interaction for it (for example a call or meeting report)" : ""}.` }); return;
  },
  save_form(callId, data, name) {
    hfSave(callId, data); return;
  },
  set_hands_free(callId, data, name) {
    setHandsFree(!!data.on);
    toolReply(callId, { ok: true, hands_free: G.hands, status: "The app now says the confirmation line itself, word for word, then tells you what's next. Don't say anything yet." }, false); hfAnnounce(); return;
  },
  optional_fields(callId, data, name) { optStep(callId, data); return; },
  show_visitor(callId, data, name) {
    const SPOOKY = ["spider", "pumpkin", "ghost", "bat", "owl", "skeleton"], XMAS = ["snow", "gift", "elf", "reindeer", "sleigh", "tree"], v = data.visitor;
    const okNow = SPOOKY.includes(v) ? spookyMode() : XMAS.includes(v) ? xmasMode() : false;
    if (!okNow) { toolReply(callId, { ok: false, error: `${v || "That visitor"} only comes by in ${SPOOKY.includes(v) ? "spooky" : "Christmas"} mode.`, say: `Say in one short sentence that the ${v || "visitor"} only comes by in ${SPOOKY.includes(v) ? "spooky" : "Christmas"} mode, and offer to turn it on.` }); return; }
    spookyOnce(v); // sounds stay off during a call: the visitor is silent while the line is open
    toolReply(callId, { ok: true, visitor: v, say: `In one short, playful sentence say the ${v} is on its way across the screen.` }); return;
  },
  set_spooky_mode(callId, data, name) {
    if (!spookySeason()) { toolReply(callId, { ok: false, error: "Spooky mode is only around in October.", say: "Say in one short sentence that spooky mode is only around in October." }); return; }
    if (!!data.on === spookyMode()) { toolReply(callId, { ok: true, spooky: spookyMode(), already: true, status: `Spooky mode is already ${spookyMode() ? "on" : "off"}. Don't announce it again.` }, false); return; } // e.g. after Carry on: nothing to redo, and no second welcome
    setSpooky(!!data.on); sessUpdate(sessionCfg()); // new rules and a slower voice straight away
    toolReply(callId, { ok: true, spooky: spookyMode(), say: spookyMode() ? `In your haunted-house host voice, say one short welcome, such as "Mwahaha... spooky mode is on. Welcome to the haunted CRM!", then ask what they'd like to do.` : `Say only "Back to normal. The ghosts have gone home."` }); return;
  },
  set_christmas_mode(callId, data) {
    if (!!data.on === xmasMode()) { toolReply(callId, { ok: true, christmas: xmasMode(), already: true, status: `Christmas mode is already ${xmasMode() ? "on" : "off"}. Don't announce it again.` }, false); return; } // e.g. after Carry on: no second welcome
    setXmas(!!data.on); sessUpdate(sessionCfg()); // new rules straight away
    toolReply(callId, { ok: true, christmas: xmasMode(), say: xmasMode() ? `In your warm Christmas host voice, say one short welcome, such as "Ho ho ho! Christmas mode is on. Merry Christmas, and welcome to the Christmas CRM!", then ask what they'd like to do.` : `Say only "Back to normal. Merry Christmas!"` }); return;
  },
  set_speaking_speed(callId, data, name) {
    const now = talkSpeed(), next = data.change === "normal" ? 1 : SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(nearSpeed(now)) + (data.change === "faster" ? 1 : -1)))];
    S.settings.speed = next; save(); sessUpdate(sessionCfg());
    toolReply(callId, { ok: true, speed: next, status: next === now ? `You're already at the ${data.change === "faster" ? "fastest" : data.change === "slower" ? "slowest" : "normal"} speed. Say so in one short sentence.` : `Saved: you now talk at ${speedName(next)} speed, and it's remembered on this phone (also in Settings). Confirm in one short sentence, then carry on.` }); return;
  },
  get_process_faq(callId, data, name) {
    const hits = faqLookup(data.question || "");
    toolReply(callId, hits.length ? { ok: true, answers: hits.map(h => ({ topic: h.section, q: h.q, a: h.a })), say: "Answer in one to three spoken sentences from these only, using their exact names. If none of them answers the question, say it isn't covered in this proof of concept and offer to pass it to the project team." }
      : { ok: true, answers: [], say: "Nothing in the Process FAQ matches. Say it isn't covered in this proof of concept and offer to pass the question to the project team." }); return;
  },
  get_demo_changes(callId, data, name) {
    demoChanges().then(all => {
      if (!all.length) { toolReply(callId, { ok: false, error: "The change list couldn't be loaded. Say you can't look that up right now and offer to pass the question to the project team." }); return; }
      const words = String(data.topic || "").toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2).map(w => w.replace(/(es|s)$/, ""));
      const scored = all.map((c, i) => ({ c, i, n: words.filter(w => (c.change + " " + c.area).toLowerCase().includes(w)).length }));
      const hits = words.length ? scored.filter(x => x.n).sort((a, b) => b.n - a.n || a.i - b.i).slice(0, 8) : scored.slice(0, 8);
      act("step", "get_demo_changes " + (data.topic || "latest") + " (" + hits.length + ")");
      toolReply(callId, { ok: true, first_release: "Oct 18, 2026", total_changes: all.length,
        changes: hits.map(x => ({ date: x.c.date, change: x.c.change })),
        say: hits.length ? "Answer the question from these in one to three sentences, with the date. They are newest first." : "Nothing in the change log matches. Say so and offer to pass the question to the project team." });
    }); return;
  },
  pass_question_to_team(callId, data, name) {
    const q = String(data.question || "").trim();
    if (!q) { toolReply(callId, { ok: false, error: "No question given. Ask the officer what they'd like to pass on." }); return; }
    act("question", q); logReady().then(on => toolReply(callId, on ? { ok: true, status: "Passed to the project team. Say so in one short sentence and ask what they'd like to do next." }
      : { ok: false, error: "The question couldn't be sent from this phone. Say so and suggest they tell the person who shared the proof of concept." })); return;
  },
  close_form(callId, data, name) {
    if (!V) { toolReply(callId, { ok: false, error: "No form is open, so there is nothing to close or clear. Say so in one short sentence." }); return; }
    if (data.change === "clear") { const what = restartForm(); act("step", "close_form clear"); toolReply(callId, { ok: true, status: `Cleared the ${what} form. Ask for the first detail again.` }); }
    else { const what = cancelForm(); act("step", "close_form close"); toolReply(callId, { ok: true, status: `Closed the ${what} form without saving. Say only "Cancelled, nothing was saved. What would you like to do?"` }); }
    return;
  },
  stop_conversation(callId, data, name) {
    toolReply(callId, { ok: true }, false);
    G.status = "Ending…"; paintCall();
    const waitEnd = Date.now() + 8000;
    const tick = () => { if (!G.live) return; const playing = G.ctx && G.playHead > G.ctx.currentTime; if (playing && Date.now() < waitEnd) setTimeout(tick, 300); else { endCall("Ara said goodbye"); toast("Conversation ended. Tap the mic any time to carry on."); } };
    setTimeout(tick, 1200); return;
  },
  call_contact(callId, data, name) {
    const r = resolveTarget("interaction", data.contact_name);
    if (r.error) { toolReply(callId, { ok: false, error: r.error }); return; }
    const c = r.contact; S.sel.contact = c.id; go("contact");
    if (!c.mobile) { toolReply(callId, { ok: false, error: `${nameOf(c)} has no phone number on record. Say so and offer to add one to the contact.` }); return; }
    if (c.dnc) { toolReply(callId, { ok: false, error: `${nameOf(c)} is marked Do Not Contact, so the app can't place the call. Say so; only a Chief Gift Officer can change that.` }); return; }
    if (!c.permCalls) { toolReply(callId, { ok: false, error: `Calls aren't permitted for ${nameOf(c)} (Calls permitted is off on the contact). Say so and offer another way to reach them.` }); return; }
    callPromptModal(c); whenIdle("instr");
    toolReply(callId, { ok: true, status: `A Call button for ${nameOf(c)} is on screen. In one short sentence, tell the officer to tap Call, and that you'll help write up the call when they're back. Our conversation ends when the call starts.` }); return;
  },
  get_contact_details(callId, data, name) {
    const r = resolveTarget("interaction", data.contact_name);
    if (r.error) { toolReply(callId, { ok: false, error: r.error }); return; }
    const c = r.contact; S.sel.contact = c.id; go("contact"); whenIdle("instr");
    const F = (value, change) => ({ value, who_can_change: change }), yn = (b) => b ? "Yes" : "No", OFF = "You (the gift officer), on Edit contact";
    toolReply(callId, { ok: true, contact: nameOf(c), fields: {
      name: F(nameOf(c), OFF), email: F(c.email || "Not given", OFF), mobile: F(c.mobile || "Not given", OFF),
      email_permitted: F(yn(c.permEmail), OFF), calls_permitted: F(yn(c.permCalls), OFF), texting_permitted: F(yn(c.permText), OFF),
      texting_permission_source: c.permText ? F(c.permSource || "Not given", OFF) : "Only recorded when texting is permitted", how_we_met: F(c.howMet || "Not given", OFF),
      capacity_rating: F(c.capacity || "Not rated", OFF + ", or by voice with set_capacity_rating"),
      ally_do_not_solicit: F(yn(c.ally), c.ally ? (lockedOff(c, "ally") ? "Only the officer who set it, or the Chief Gift Officer, can turn it off; you can't" : "You set it, so you or the Chief Gift Officer can turn it off") : OFF),
      do_not_contact: F(yn(c.dnc), c.dnc ? "Only the Chief Gift Officer can clear it" : OFF),
      status: F(c.status || "Prospect", "The system: a contact becomes an Investor when a pledge or gift is recorded"),
      gift_officer: F(OFFICER, "Only the Chief Gift Officer can reassign a contact"),
      added: F(fmtDate(c.added) || "Not known", "The system") },
      say: "Answer only what the officer asked, from these fields. If they ask to change a field, say who can change it; for fields they can change, offer to open Edit contact. Never claim to change a field that says only the system or the Chief Gift Officer can change it." }); return;
  },
  get_opportunity_details(callId, data, name) {
    const r = resolveTarget("interaction", data.contact_name);
    if (r.error) { toolReply(callId, { ok: false, error: r.error }); return; }
    const c = r.contact, o = openOpp(c.id) || S.opps.filter(x => x.contactId === c.id).slice(-1)[0];
    if (!o) { toolReply(callId, { ok: false, error: `${nameOf(c)} has no opportunity yet. Offer to create one.` }); return; }
    S.sel.contact = c.id; S.sel.opp = o.id; go("opp"); whenIdle("instr");
    const F = (value, change) => ({ value, who_can_change: change }), SYS = "The system, from what you record", MONEY = "Recorded amounts can only be corrected by a Veleer administrator";
    const NEXT = { Qualification: "Log interaction, or Move to Cultivation when Ready for Cultivation shows", Cultivation: "Add planned ask", "Ask Planning": "Record the ask", "Ask Made": "Record the response when the investor answers (a Check on the answer task is due 30 days after the ask), then Record pledge, or Record gift when money comes in", Commitment: "Record gift" };
    const asks = o.asks.slice().reverse().map((a, i, all) => ({ order: i === 0 ? "original ask" : i === all.length - 1 ? "latest (revised) ask" : "revised ask " + i,
      amount: money(a.amount), ask_type: a.askType || "Outright", entity: a.fund, campaign: a.campaign || "National", planned_ask_date: a.plannedDate ? fmtDate(a.plannedDate) : "Not set",
      asked_on: a.askedOn ? fmtDate(a.askedOn) : "Not asked yet", participants: a.participants || "None", status: a.status, response: a.response || "", decline_reason: a.reason || "",
      who_can_change: a.status === "Planned" ? "You can edit a planned ask; it becomes fixed once you record the ask" : SYS + "; a new response is recorded as a new ask, the earlier ones stay in the ask history" }));
    const p = o.pledge, paid = p ? (p.payments || []).reduce((n, x) => n + (x.amount || 0), 0) : 0;
    toolReply(callId, { ok: true, contact: nameOf(c), fields: {
      name: F(o.name, "The system names it from the contact and year"),
      stage: F(o.stage === "Closed" ? `Closed ${o.closed || ""}`.trim() : o.stage, "The system moves the stage only when something is recorded (an ask, pledge, gift or payment). The only manual move is Move to Cultivation, or Defer with a reason. Nobody sets the stage directly."),
      next_action_button: F(o.stage === "Closed" ? "None, it's closed" : NEXT[o.stage], "Follows the stage"),
      gift_officer: F(OFFICER, "Only the Chief Gift Officer can reassign an opportunity"),
      potential: F(o.potential ? money(o.potential) : "Not set", "You (the gift officer)"), entity: F(o.fund || (latestAsk(o) && latestAsk(o).fund) || "Not set", "You (the gift officer)"), campaign: F(o.campaign || (latestAsk(o) && latestAsk(o).campaign) || "Not set", "You (the gift officer)"),
      asked_tile: F(askedOf(o) ? money(askedOf(o)) : "Nothing asked yet", "Calculated by the system: the latest revised ask"),
      asks: F(asks.length ? asks : "No asks yet", "See each ask"),
      pledge: F(p ? { type: p.implied ? "Implied commitment (a gift arrived while the ask was open)" : p.outright ? "Outright gift agreed at the ask, waiting for the gift" : "Pledge", amount: money(p.amount), entity: p.fund, confirmed_by: p.confirmedBy, confirmed_on: fmtDate(p.confirmedDate), installments: p.installments, frequency: p.frequency || "", first_payment: money(p.firstAmount), first_due: p.firstDue ? fmtDate(p.firstDue) : "", paid: money(paid), balance: money(Math.max(0, p.amount - paid)), status: p.status || "Open" } : "None", p ? MONEY : "Recorded with Record pledge"),
      gift: F(o.gift ? { amount: money(o.gift.amount), entity: o.gift.fund, date: fmtDate(o.gift.date), method: o.gift.method } : "None", o.gift ? MONEY : "Recorded with Record gift"),
      closed: F(o.stage === "Closed" ? `${o.closed} on ${fmtDate(o.closedOn)}${o.lostReason ? ", reason: " + o.lostReason : ""}` : "Open", SYS),
      deferred: F(o.defer && deferActive(o) ? `Yes: ${o.defer.reason || "no reason given"}${o.defer.until ? ", reconsider on " + fmtDate(o.defer.until) : ""}` : "No", "You, with Defer on Ready for Cultivation") },
      say: "Answer only what the officer asked, from these fields. If they ask you to change a field the system controls (stage, asked amount, recorded asks, pledge, gift, payments, gift officer), don't change it and don't say it changed: say who can change it and offer the proper action instead, e.g. the next action button or recording what happened." }); return;
  },
  get_giving(callId, data, name) {
    const r = resolveTarget("interaction", data.contact_name);
    if (r.error) { toolReply(callId, { ok: false, error: r.error }); return; }
    const c = r.contact, v = givingOf(c); S.sel.contact = c.id; go("contact"); whenIdle("instr");
    toolReply(callId, { ok: true, contact: nameOf(c), lifetime: money(v.lifetime), this_year: money(v.ytd), number_of_gifts: v.count,
      last_gift: v.last ? `${money(v.last.amount)} on ${fmtDate(v.last.date)} to ${v.last.fund}` : "none",
      open_pledge_balance: v.pledgeLeft ? money(v.pledgeLeft) : "none",
      say: "Say these figures in one or two sentences, e.g. lifetime, then this year, then the last gift and its date. 'This year' means since January 1." }); return;
  },
  show_list(callId, data, name) {
    const opp = data.list === "opportunities", F = opp ? OPP_F : TASK_F, v = F[data.view] ? data.view : "open";
    if (opp) { S.oFilter = v; S.oppView = S.oppView || "list"; } else S.tFilter = v;
    go(opp ? "board" : "tasks"); whenIdle("instr");
    const items = (opp ? S.opps : S.tasks).filter(F[v][1]);
    const q = String(data.search || "").trim().toLowerCase();
    if (q) setTimeout(() => { const box = document.getElementById(opp ? "oSearch" : "tSearch"); if (box) { box.value = q; box.dispatchEvent(new Event("input", { bubbles: true })); } }, 60);
    const words = q.split(/\s+/).filter(Boolean), hit = (x) => words.every(w => (opp ? oppSearchText(x) : (x.text + " " + taskWhere(x)).toLowerCase()).includes(w));
    const shown = items.filter(hit);
    toolReply(callId, { ok: true, showing: `${opp ? "Opportunities" : "Tasks"}: ${F[v][0]}${q ? ` matching "${q}"` : ""}`, count: shown.length,
      items: shown.slice(0, 8).map(x => opp ? `${x.name} (${x.stage})` : `${x.text} (${taskWhere(x)})`),
      say: `In one short sentence, say the ${F[v][0]} view is on screen and how many there are${shown.length ? "; name up to three if they ask" : ""}.` }); return;
  },
  get_my_tasks(callId, data, name) {
    const T = todayISO(), which = data.which || "all", who = data.contact_name ? resolveTarget("interaction", data.contact_name) : null;
    const open = S.tasks.filter(t => !t.done).sort((x, y) => (x.due || "9999").localeCompare(y.due || "9999"));
    const pick = open.filter(t => !(who && !who.error) || t.contactId === who.contact.id).filter(t => which === "overdue" ? t.due && t.due < T : which === "due_today" ? t.due && t.due <= T : which === "this_week" ? t.due && t.due <= addDays(T, 7) : which === "waiting" ? taskStatus(t) === "waiting" : which === "in_progress" ? taskStatus(t) === "doing" : true);
    S.tFilter = { overdue: "overdue", this_week: "week", due_today: "week", waiting: "waiting" }[which] || "open"; go("tasks"); whenIdle("instr");
    const byStatus = {}, byPerson = {}; open.forEach(t => { const k = TSTAT[taskStatus(t)], w = taskWhere(t) || "no one"; byStatus[k] = (byStatus[k] || 0) + 1; byPerson[w] = (byPerson[w] || 0) + 1; });
    toolReply(callId, { ok: true, open_tasks_total: open.length, overdue_total: open.filter(t => t.due && t.due < T).length, by_status: byStatus, people_with_most_tasks: Object.entries(byPerson).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w, n]) => ({ who: w, n })), showing: which, for_person: who && !who.error ? nameOf(who.contact) : "everyone", count: pick.length,
      tasks: pick.map(t => ({ task: t.text, status: TSTAT[taskStatus(t)], for: taskWhere(t), due: t.due ? fmtDate(t.due) + (t.due.slice(0, 4) !== T.slice(0, 4) ? " " + t.due.slice(0, 4) : "") : "no due date", overdue: !!(t.due && t.due < T), due_today: t.due === T })),
      say: pick.length > 8 ? "A long list: first give the counts in one sentence (open, overdue, and the two or three people with the most tasks), then ask whether to hear the oldest five, the ones for one person, or the ones due this week. Read tasks only after they choose, five at a time, each briefly with who it's for and when it's due." : pick.length ? "Say how many there are, overdue ones first, then read each task briefly with who it's for and when it's due (say overdue, today, or the day). If there are more than five, read the first five and ask whether to go on. Then ask if they'd like to act on one, for example log the follow-up." : "Say there are no open tasks of that kind." }); return;
  },
  get_contact_history(callId, data, name) {
    const r = resolveTarget("interaction", data.contact_name);
    if (r.error) { toolReply(callId, { ok: false, error: r.error }); return; }
    const c = r.contact, T = todayISO(), focus = data.focus || "history_and_tasks"; S.sel.contact = c.id; go("contact"); whenIdle("instr");
    const ints = S.interactions.filter(i => i.contactId === c.id).sort((x, y) => (y.date || "").localeCompare(x.date || ""));
    const tasks = S.tasks.filter(t => t.contactId === c.id && !t.done).sort((x, y) => (x.due || "9999").localeCompare(y.due || "9999"));
    const o = openOpp(c.id);
    toolReply(callId, { ok: true, contact: nameOf(c), status: c.status, opportunity: o ? `${o.name}, in ${o.stage}` : "none open",
      interactions_total: ints.length, last_substantive: (ints.find(i => i.substantive) || {}).date ? fmtDate(ints.find(i => i.substantive).date) : "none",
      interactions: focus === "tasks" ? undefined : ints.slice(0, 6).map(i => ({ date: fmtDate(i.date) + (i.date && i.date.slice(0, 4) !== T.slice(0, 4) ? " " + i.date.slice(0, 4) : ""), how: i.type, what: i.kind === "ask" ? "ask" : "interaction", substantive: !!i.substantive, outcome: i.outcome || undefined, summary: i.summary || "" })),
      open_tasks: focus === "history" ? undefined : tasks.map(t => ({ task: t.text, on: t.oppId ? "opportunity" : "contact", due: t.due ? fmtDate(t.due) : "no due date", overdue: !!(t.due && t.due < T) })),
      say: `Speak only what was asked. History: newest first, one short sentence each (when, how, and the gist of the summary); if there are more than three, give the latest three and offer the rest. ${focus === "history" ? "" : "Then the open tasks for this contact, overdue first, each with its due date; if none, say there are no open tasks for them."} Never add details that aren't in the records.` }); return;
  },
  highlight_stage(callId, data, name) {
    const i = flowIndex(data.stage); if (i < 0) { toolReply(callId, { ok: false, error: "Unknown stage. The stages are Qualification, Cultivation, Ask Planning, Ask Made, Commitment and Closed. Ask which one." }); return; }
    if (i === 0) { // a new walkthrough: drop the earlier one from the conversation so Grok doesn't carry on from its old words
      const old = (G.tourItems || []).filter(id => !(G.respItems || []).includes(id));
      old.forEach(id => send({ type: "conversation.item.delete", item_id: id }));
      if (old.length) vlog(`removed ${old.length} items of the earlier walkthrough`);
      G.tourItems = (G.respItems || []).slice(); G.tour = true; G.tourEnding = false;
    }
    if (i === FLOW.length - 1) G.tourEnding = true;
    highlightStage(i); const f = FLOW[i], nx = FLOW[i + 1];
    const facts = `${f.means}${f.move.length ? " To move on: " + f.move.join(" ") : ""}${f.note ? " " + f.note : ""}`;
    toolReply(callId, { ok: true, summary: `${f.stage} is lit up on screen. ${i === 0 ? `First say exactly: "${PROCESS_INTRO}" Then talk` : "Your next words are"} about ${f.stage} only: start with "${f.stage}" and say one or two sentences based on this: ${facts} Say nothing about earlier stages and don't finish or repeat anything you said before. Then ${nx ? `ask "Shall I go on to ${nx.stage}?" and wait for the answer (unless they asked you to go straight through). When they say yes, call highlight_stage for ${nx.stage} before saying anything.` : "ask if they have questions or want to try a step."}` }); return;
  },
  show_needs_attention(callId, data, name) {
    if (data.filter === "hands_free") { // the saves made by voice that the officer hasn't looked at yet (Carverhill, Oct 25: "read off all of the hands-free decisions that I made that I need to approve")
      const xs = hfUnchecked(); S.naFilter = "all"; save(); go("home");
      toolReply(callId, { ok: true, filter: "Hands-free saves to check", count: xs.length, items: xs.slice(0, 12).map(x => hfLine(x)), status: xs.length ? "Read them out briefly. The officer checks them off on the phone (Needs attention, Hands-free saves) once parked; you can't check them off." : "No hands-free saves are waiting to be checked." }); return; }
    const k = { all: "all", overdue: "overdue", opportunities: "opps", tasks: "tasks", contacts: "contacts" }[data.filter] || "all";
    S.naFilter = k; save(); go("home");
    const xs = attentionItems().filter(NA_FILTERS[k][1]);
    toolReply(callId, { ok: true, filter: NA_FILTERS[k][0], count: xs.length, items: xs.slice(0, 8).map(x => x.say), status: xs.length ? "Shown on Home. Read out the first few briefly, most urgent first." : "Shown on Home: nothing in this list right now." }); return;
  },
  show_screen(callId, data, name) {
    const map = { home: "home", contacts: "contacts", opportunities: "board", tasks: "tasks", contact_record: "contact", opportunity_record: "opp", how_it_works: "flow" };
    const target = map[data.screen] || "home"; if (target !== "flow") G.tour = false;
    let summary = "Screen shown.";
    if (target === "contact" || target === "opp") {
      const r = resolveTarget("interaction", data.contact_name);
      if (r.error) { toolReply(callId, { ok: false, error: r.error }); return; }
      if (target === "opp" && !r.opp) { toolReply(callId, { ok: false, error: `${nameOf(r.contact)} has no open opportunity. Say so and offer to create one.` }); return; }
      if (target === "contact") S.sel.contact = r.contact.id; else S.sel.opp = r.opp.id;
      summary = target === "contact" ? `Showing ${nameOf(r.contact)}.` : `Showing ${r.opp.name}, in ${r.opp.stage}.`;
    } else if (target === "contacts") summary = `Contacts shown: ${S.contacts.map(nameOf).join(", ")}.`;
    else if (target === "board") summary = `Opportunities board shown: ${S.opps.filter(o => o.stage !== "Closed").map(o => o.name + " in " + o.stage).join("; ")}.`;
    if (target === "flow") S.flowBack = "home";
    go(target); G.handled.size && whenIdle("instr");
    toolReply(callId, { ok: true, summary }); return;
  },
};
function onTool(callId, name, args, held) {
  busy(); G.respTool = true; G.toolHeardN = G.heardN || 0;
  if (G.nudge) { act("step", `Ara called ${name} on ask ${G.nudge.tries} of ${TOOL_ASKS} (${Math.round((Date.now() - G.nudge.at) / 100) / 10} s after the first)`); G.nudge = null; }
  if (!callId || G.handled.has(callId)) return;
  // the engine's transcript of the officer's last turn is still to come (speech ended, no transcript yet): the call waits for it, up to
  // HEARD_WAIT_MS, so the evidence rule judges the fields against what the officer just said (OpenAI sends the call first)
  if (!held && G.heardWait && (G.heardN || 0) <= G.heardWait.n && Date.now() - G.heardWait.at < HEARD_WAIT_MS) {
    const w = G.heardWait, t0 = Date.now();
    (function poll() { if (G.handled.has(callId) || !G.live) return;
      if (!G.heardWait || (G.heardN || 0) > w.n || Date.now() - t0 >= HEARD_WAIT_MS) { const came = (G.heardN || 0) > w.n; vlog(`${name}: held ${Date.now() - t0} ms for the officer's transcript${came ? "" : " (it didn't come)"}`); if (came) act("step", `${name} waited ${Date.now() - t0} ms for the officer's words before the form was checked`); onTool(callId, name, args, true); }
      else setTimeout(poll, 50); })();
    return; }
  G.handled.add(callId);
  let data = {}; try { data = typeof args === "string" ? JSON.parse(args || "{}") : (args || {}); } catch (x) {}
  act("step", name + " " + JSON.stringify(data));
  // a picked-up conversation replays the last tool call (Oct 28, twice: the interaction form reopened with the type from the saved report, then "I didn't catch the type"): once is enough
  const key = name + " " + JSON.stringify(data); if (G.resumedAt && Date.now() - G.resumedAt < REPLAY_MS && (G.heardN || 0) <= (G.resumedHeardN || 0) && (G.toolKeys || []).some(k => k.key === key && k.at < G.resumedAt && (G.lastDropAt || 0) - k.at < REPLAY_BEFORE_MS)) { /* only a call from just before the drop, and only before the officer has said anything on the new line: anything they say after the pickup is answered for real, whatever it matches (Oct 29 7:39 AM: a yes to the opportunity matched the contact's save 60 s earlier and was refused) */
    const pos = typeof formPosition === "function" ? formPosition() : null; guardFired("tool call replayed after a pickup", name);
    toolReply(callId, { ok: false, error: `This call was already handled before the line dropped; nothing changed. ${pos ? pos.where : G.savedLine ? `The last form was saved (${G.savedLine}); no form is open.` : "No form is open."} Don't repeat it: go on with what the officer says next.` }); return; }
  (G.toolKeys = (G.toolKeys || []).slice(-5)).push({ key, at: Date.now() });
  if (G.cmdAt && Date.now() - G.cmdAt < 800) { vlog(`${name}: ignored, the app had just carried out a voice command`); guardFired("tool call right after a voice command", name); toolReply(callId, { ok: false, error: "Ignored: the app already carried out the officer's command. Don't repeat it; go on with what the officer says next." }); return; }
  if (Object.hasOwn(TOOL_HANDLERS, name)) { TOOL_HANDLERS[name](callId, data, name); return; }
  draftTool(callId, name, data);
}
// a draft tool: open or update the form on screen with what Ara heard
const JUST_SAID_MS = 4000; // the officer's transcript can land in the same second as the tool call it should have been part of
const ASK_AMOUNT_RE = /(amount|figure|size) of the ask|the ask (was|is|were) for|ask amount|change the ask|asked (her|him|them) for/i;
function draftTool(callId, name, data) {
  G.tour = false; // the officer moved on to other work; keep it out of the walkthrough that gets dropped
  let tool = TOOLS.find(t => t.name === name && !t.hidden);
  if (!tool) { toolReply(callId, { ok: false, error: "Unknown tool. Use one of the tools you were given, or tell the officer the app can't do that." }); return; }
  // another form while the open one was read back and is waiting for a yes: the officer's yes saves it first, anything else keeps it open (a safeguard added Oct 25)
  const settle = () => { const p = hfSettlePending(); if (!p) return false;
    if (!p.saved) { toolReply(callId, { ok: false, ask_exactly: `The ${formName(ACTIONS[V.action])} form is waiting on your yes. Save it, change something, or drop it?`, error: `The open ${p.title} form was read back and is waiting for the officer's yes; it is NOT saved${p.err ? ` (${p.err})` : ""}. The app asked them what to do with it. If they say yes, call save_form with confirmed true; if they want a change, call its draft tool with the changed field; if they drop it, call cancel_form. Only then open the ${ACTIONS[tool.action].title} form.` }); return true; }
    guide(`The officer's yes saved the ${p.title} form first (${p.line}); say so in a few words before going on.`); return false; };
  // the open form settles first (its save can be what makes the next form possible), unless this tool is the open form under its routed name (Oct 28 4:41 PM call: "credit card" on the routed gift form was refused as a new form)
  if (V && V.action !== tool.action && voiceRule(V.action).routedFrom !== tool.action && settle()) return;
  const target = resolveTarget(tool.action, data.contact_name, { date: data.which_date ? normDate(data.which_date) : "", which: data.which, noNameGuard: true });
  if (target.error) { toolReply(callId, { ok: false, error: target.error }); return; }
  if (target.route) { tool = TOOLS.find(t => t.action === target.route); delete data.fund; } // Record gift in Commitment: applied to the pledge
  // a new form opens only when the officer asked for it, or said yes to Ara offering it (Carverhill, Oct 25: "always prompt me to go to the next step")
  if ((!V || V.action !== tool.action) && typeof formAskedFor === "function" && !formAskedFor(tool.action)) { const A0 = ACTIONS[tool.action];
    act("step", `${name} refused: the officer hasn't asked for the ${A0.title} form`);
    toolReply(callId, { ok: false, opened: false, error: `The officer hasn't asked for the ${A0.title} form, and a form opens only on their word. Offer it in one short question, for example "Next could be ${A0.title.toLowerCase()}. Want to do that now?", and call this tool only after they say yes. If they asked for something else, do that instead.` }); return; }
  if (data.contact_name && target.contact && unnamed(target.contact)) { act("step", `${name} refused: the officer hasn't named ${nameOf(target.contact)}`); toolReply(callId, { ok: false, error: unnamedError(target.contact) }); return; } // the name evidence guard, after the form-asked guard
  if (V && V.action === tool.action && ((V.target.contact || null) !== (target.contact || null) || (V.target.item || null) !== (target.item || null)) && settle()) return;
  delete data.contact_name; delete data.which; delete data.which_date;
  // the voice model sometimes files the officer's words under a name the tool doesn't have (notes, description...); put them where they belong, and note any other stray field in the Voice log
  const known = new Set(Object.keys(tool.props || {})), area = (ACTIONS[tool.action].fields.find(f => f.type === "area" && f.req) || {}).k;
  const dates = ACTIONS[tool.action].fields.filter(f => f.type === "date").map(f => f.k);
  Object.keys(data).forEach(k => { if (known.has(k)) return; vlog(`${name}: unknown field "${k}"`);
    if (dates.length === 1 && !data[dates[0]] && /date|day|when/i.test(k)) { data[dates[0]] = data[k]; vlog(`  used "${k}" as ${dates[0]}`); }
    if (area && !data[area] && typeof data[k] === "string" && data[k].trim().length > 8 && /summ|note|desc|detail|text|what|content|recap/i.test(k)) { data[area] = data[k]; vlog(`  used "${k}" as ${area}`); }
    delete data[k]; });
  const badDates = [];
  dates.forEach(k => { if (data[k] == null || data[k] === "") return; const d = normDate(data[k]); if (d) { if (d !== data[k]) vlog(`${name}: ${k} "${data[k]}" read as ${d}`); data[k] = d; } else { vlog(`${name}: couldn't read ${k} "${data[k]}"`); badDates.push(`${k} "${data[k]}"`); delete data[k]; } });
  // a rating can arrive as "c", "C · $25k to $100k" or "$25,000 to $100,000": keep just the letter
  if ("capacity" in data) { const r = normCap(data.capacity); if (r) data.capacity = r; else { if (data.capacity) vlog(`${name}: couldn't read capacity "${data.capacity}"`); delete data.capacity; } }
  // "change the amount of the ask" / "the ask was for $X" is the amount asked, not the agreed amount (Carverhill's Ruth call, Oct 28: $75,000 landed in Agreed)
  if (tool.action === "ask" && data.agreedAmount != null && data.amount == null && data.response !== "Countered" && ASK_AMOUNT_RE.test(officerLines(2).join(" "))) {
    data.amount = data.agreedAmount; delete data.agreedAmount; vlog(`${name}: agreedAmount ${data.amount} moved to amount: the officer changed the amount asked`);
    (data._moved = data._moved || []).push(`The officer changed the amount asked, so ${money(data.amount)} is now the Amount asked (not an agreed amount).`); }
  // the app suggested the follow-up wording and the officer said yes: that wording counts as said (the evidence rule would otherwise drop words Ara spoke)
  let followKeep = null;
  if (tool.action === "ask" && V && V.action === "ask" && V.askedFollow) { const s = followUpSuggestion(target), last = ((G.recent || []).filter(l => l.startsWith("Officer: ")).slice(-1)[0] || "").slice(9);
    if (last && followAnswer(last) === "yes" && (!String(data.nextStep || "").trim() || data.nextStep === s.text)) { followKeep = { nextStep: s.text, nextDue: data.nextDue || s.due }; delete data.nextStep; delete data.nextDue; vlog(`${name}: follow-up task "${s.text}" by ${s.due}: the officer said yes to the app's suggestion`); } }
  // every value must trace to the officer's words, a $0 amount, an invented rating and the interaction report's substantive flag, next step and outcome included (evidence.js)
  applyEvidence(tool.action, data, name).forEach(x => (data._dropped = data._dropped || []).push(x));
  if (followKeep) Object.assign(data, followKeep);
  // the voice model doesn't send texting permitted on a new contact (seen Oct 24: eight tries, never sent): take it from the officer's own words
  if ((tool.action === "contact" || tool.action === "editContact") && data.permText === undefined) { const t = officerSaidTexting(); if (t !== null) { data.permText = t; vlog(`${name}: texting ${t ? "permitted" : "not permitted"}, from the officer's words`); } }
  if ((tool.action === "interaction" || tool.action === "ask") && !String(data.summary || "").trim() && !(V && V.action === tool.action && V.data && String(V.data.summary || "").trim())) {
    const t = officerSummary(); if (t) { data.summary = t; vlog(`${name}: summary taken from the officer's words`); } }
  if (tool.action === "ask" && !data.response && !(V && V.action === "ask" && V.data && V.data.response)) { const r = officerResponse(); if (r) { data.response = r; vlog(`${name}: response ${r}, from the officer's words`); } }
  // a next-step due date with no next step, on the meeting's own day or earlier, is the meeting date filed in the wrong place (seen Oct 24)
  if (tool.action === "interaction" && data.nextDue && !String(data.nextStep || "").trim() && !(V && V.data && String(V.data.nextStep || "").trim())) { const nd = normDate(data.nextDue);
    if (nd && (nd <= todayISO() || nd === normDate(data.date || ""))) { vlog(`${name}: dropped next-step due date "${data.nextDue}" (no next step, not in the future)`); delete data.nextDue; } }
  // Ara just asked whether it was substantive: take the officer's yes or no if Grok didn't send it
  if (tool.action === "interaction" && V && V.action === "interaction" && V.askedSubst && !V.fromVoice.has("substantive") && data.substantive === undefined) {
    const t = ((G.recent || []).filter(l => l.startsWith("Officer: ")).slice(-1)[0] || "").slice(9);
    if (t) { data.substantive = hfYes(t) || /\bsubstantive\b/i.test(t) && !/\b(not|no|wasn't)\b/i.test(t); vlog(`${name}: substantive ${data.substantive}, from the officer's words`); } }
  if (data._dropped) { vlog(`${name}: left out ${data._dropped.join(", ")} (the officer didn't say it)`); act("step", `Left out ${data._dropped.join(", ")} the voice model filled in without the officer saying it`); }
  const movedNote = (data._moved || []).map(x => " " + x).join(""); delete data._moved;
  const droppedList = data._dropped || [], droppedNote = droppedList.length ? ` Left out of the form because the officer never said it: ${droppedList.join(", ")}. Never fill those in yourself, never read them back, never say "noted" or "got it" for them, and if the officer asks where a value came from, say it was your guess and the app removed it; the app asks what it needs.` : ""; delete data._dropped;
  // a dropped value the form still needs: the app says so itself before the question, so Ara can't answer "noted" to a rating that was just removed (Jacqueline's call, Oct 27)
  const droppedNeeded = (labels) => droppedList.map(x => x.replace(/ \(.*$/, "").replace(/ of \$0$/, "")).filter(x => labels.some(l => l.toLowerCase().startsWith(x)));
  const notCaught = (xs) => `I didn't catch ${xs.length > 1 ? "these" : "the"} ${xs.join(", ").replace(/, ([^,]*)$/, " and $1")} from you, so ${xs.length > 1 ? "they're" : "it's"} not on the form.`;
  // the officer named a state: its entities are known, so the app fills in a single one or names exactly the ones there (Oct 25: Ara offered Pennsylvania for New Hampshire)
  let stateNote = "";
  if (data.fund) { const f = fundFromSpoken(data.fund); if (f !== data.fund) { vlog(`${name}: entity "${data.fund}" -> ${f}`); data.fund = f; } }
  if ((tool.action === "opportunity" || tool.action === "plan") && !data.fund && !(V && V.action === tool.action && V.data && V.data.fund)) {
    const last = ((G.recent || []).filter(l => l.startsWith("Officer: ")).slice(-1)[0] || "").slice(9).toLowerCase();
    const st = [...new Set(Object.values(ENTITY_STATE).filter(Boolean))].find(s => last.includes(s.toLowerCase()));
    if (st) { const hits = FUNDS.filter(f => ENTITY_STATE[f] === st); if (hits.length === 1) { data.fund = hits[0]; vlog(`${name}: entity ${hits[0]} from the state the officer named`); } else stateNote = ` The officer named ${st}, which has exactly these entities: ${hits.map(entitySpoken).join(", ")}. Ask which one of those, and name no other.`; } }
  const said = Object.keys(data).filter(k => data[k] !== null && data[k] !== "" && data[k] !== undefined);
  // the officer spelled something out: check it made it into this update (Grok sometimes resends the old fields instead)
  const flat = said.map(k => String(data[k]).toLowerCase().replace(/[^a-z]/g, "")).join(" ");
  const missedSpelling = (tool.action === "contact" || tool.action === "editContact") ? spelledWords().filter(w => !flat.includes(w.toLowerCase())) : [];
  if (missedSpelling.length) vlog(`${name}: spelling not used: ${missedSpelling.join(", ")}`);
  const same = V && V.action === tool.action && (V.target.contact || null) === (target.contact || null) && (V.target.item || null) === (target.item || null);
  let reread = "";
  if (same) { const cur = readDraft(), waiting = G.hands && G.saveCheck && G.saveCheck.key === V.action + JSON.stringify(cur); (V.history = V.history || []).push(Object.assign({}, cur)); if (V.history.length > 20) V.history.shift();
    const changed = said.filter(k => String(cur[k] ?? "") !== String(data[k] ?? "")); said.forEach(k => { cur[k] = data[k]; }); said.forEach(k => V.fromVoice.add(k)); V = Object.assign({}, V, { action: tool.action, target, data: prefill(tool.action, cur, target), fromVoice: V.fromVoice });
    if (waiting && changed.length) { reread = readbackParts(ACTIONS[tool.action], voiceRule(tool.action), V.data, changed).join(", "); if (reread) { reread = reread.charAt(0).toUpperCase() + reread.slice(1) + "."; act("step", `The officer changed ${changed.join(", ")} on the form that was read back: the app re-reads just that`); } } }
  else V = { action: tool.action, target, data: prefill(tool.action, data, target), fromVoice: new Set(said) };
  renderOverlay();
  const A = ACTIONS[tool.action], R = voiceRule(tool.action), d = V.data, empty = (v) => v === null || v === undefined || String(v).trim() === "";
  const condReq = new Set(R.requiredWhen ? R.requiredWhen(d) : []); /* required under a condition the form declares (a reason when declined or deferred) */
  // a pick-list field Grok left out is filled by the app from the officer's answer to the question just asked (5:59 PM call, Oct 29: "In person" said three times, never sent; the question is the evidence)
  if (typeof optionAnswered === "function") { const lines = officerLines(1), asked = askedBefore(1);
    A.fields.filter(f => f.type === "select" && !f.fixed && f.k !== "fund" && fieldBlank(f, d[f.k])).forEach(f => { const opts = (typeof f.opts === "function" ? f.opts(d) : f.opts || []).filter(o => String(o).length >= 3);
      const hit = opts.find(o => optionAnswered(String(o), lines, asked)); if (hit === undefined) return;
      d[f.k] = hit; V.fromVoice.add(f.k); vlog(`${name}: ${f.k} filled by the app from the officer's answer: ${hit}`); act("step", `The app filled the ${optLabel(f)} from the officer's answer to the question just asked`); }); renderOverlay(); }
  const missingFields = A.fields.filter(f => (f.req || condReq.has(f.k)) && !f.fixed && fieldBlank(f, d[f.k]));
  const missing = missingFields.map(f => f.k === "campaign" && d.fund ? `Campaign (${d.badCampaign ? d.badCampaign + " isn't a campaign for " + d.fund + "; " : ""}the entity, ${d.fund}, is already set; its campaign is ${campaignsFor(d.fund).join(" or ")})` : f.label);
  // what is already on the form (filled in by the app from earlier records, or said before), so Ara never asks for it again
  const onForm = A.fields.filter(f => !f.fixed && f.type !== "bool" && !empty(d[f.k])).map(f => `${f.label}: ${f.type === "money" ? money(d[f.k]) : f.type === "date" ? dateSaid(d[f.k]) : d[f.k]}`);
  delete d.badCampaign;
  // a contact needs an email or a mobile; when the officer said there is no email (or no mobile), only the other one is asked for (Oct 27 spoken run)
  const oneOf = !!R.needsOneOf, noEmail = oneOf && officerSaidNone("email"), noMobile = oneOf && officerSaidNone("mobile");
  if (oneOf && R.needsOneOf.every(k => empty(d[k]))) missing.push(noEmail && !noMobile ? "Mobile number (the officer said there is no email, so ask only for the mobile)" : noMobile && !noEmail ? "Email address (the officer said there is no mobile, so ask only for the email)" : "Email or mobile");
  if (stateNote) { missing.unshift(`Entity of interest (${stateNote.trim()})`); stateNote = ""; } // the entity isn't a required field, but the officer asked for one in that state
  if (oppNeedsCampaign(tool.action, d)) missing.push(`Campaign of interest (${d.fund} can be ${campaignsFor(d.fund).join(" or ")}: ask which)`); // Carverhill: always ask the campaign when there is a choice
  if (awaitingAsk(tool.action, d) && (empty(d.nextStep) || empty(d.nextDue))) { const s = followUpSuggestion(target, d.nextDue); V.askedFollow = true; missing.push(`Next step and its due date (an ask still waiting for its answer needs a follow-up task, which becomes a Task for the officer: say so in one sentence, then suggest exactly these words: "${s.text}", ${dueSaid(s)}, and ask "Shall I use that, yes or no?". If they say yes, call this tool with nextStep "${s.text}" and nextDue ${s.due}; if they say no, ask what the task should say and when it's due, and use their words)`); }
  else if (wantsNextStep(tool.action, d, target) && (empty(d.nextStep) || empty(d.nextDue))) missing.push("Next step and its due date (a substantive interaction needs one, and it becomes a Task for the officer: explain that in one sentence, then ask 'Do you want to set it now, yes or no?'; on yes ask 'What's the next step, and when is it due?'; on no go on without one; never suggest a step, a date or a way of contacting anyone, the officer decides)");
  // a new contact: ask once for the other of email/mobile, then once about the optional fields (the app drives this so it never gets skipped)
  // the officer just said a phone number, but this update didn't carry it (Oct 27 spoken run: Grok's call for the mobile turn had no mobile, so the app asked again)
  const saidDigits = oneOf && empty(d.mobile) && data.mobile === undefined ? officerSaidDigits() : "";
  if (saidDigits) { vlog(`${name}: mobile not used: the officer said ${saidDigits}`); toolReply(callId, { ok: true, button: A.saveLabel, status: `The officer just said a phone number (the digits ${saidDigits}), but this update didn't include it. Call this tool again now with it in the mobile field, as they said it. Don't ask them to repeat it.` }); return; }
  if (missedSpelling.length) { toolReply(callId, { ok: true, button: A.saveLabel, status: `The officer just spelled out ${missedSpelling.map(w => `"${spellOut(w)}" (${w.charAt(0) + w.slice(1).toLowerCase()})`).join(" and ")}, but this update didn't use it. Call this tool again now with that exact spelling in the field they named (for a name, first or last as they said; for an email, the part before the @). If they changed how a name is spelled and the email uses that name, ask once whether the email should change to match. Don't ask them to repeat it.` }); return; }
  // every interaction report: ask whether it was substantive (Oct 24: saved as not substantive without asking, which kept the opportunity in Qualification)
  if (R.alwaysAsk === "substantive" && !missing.length && !V.askedSubst && !V.fromVoice.has("substantive")) { V.askedSubst = true; toolReply(callId, { ok: true, button: A.saveLabel, ask_exactly: SUBST_Q, next: "After the officer answers, call this tool again with substantive true or false." + droppedNote }); return; } // the app asks it itself (Oct 25: Ara skipped the question when it was only guidance)
  if (V.opt && V.opt.only && !empty(d[V.opt.only])) V.opt = null; // the one field asked for came in through this tool instead
  if (oneOf && !missing.length) { // one of the pair is in: ask once for the other (the policy's "needs one of")
    if ((empty(d.email) || empty(d.mobile)) && !V.askedOther && ((empty(d.email) && noEmail) || (empty(d.mobile) && noMobile))) { V.askedOther = true; vlog(`${name}: not asking for the ${empty(d.email) ? "email" : "mobile"}, the officer said there is none`); } // never "an email as well?" after "No email" (Oct 27)
    if ((empty(d.email) || empty(d.mobile)) && !V.askedOther) { V.askedOther = true; const who = d.first || "them"; toolReply(callId, { ok: true, button: A.saveLabel, ask_exactly: `Do you have ${empty(d.email) ? "an email address" : "a mobile number"} for ${who} too?`, next: `The app asked for their ${empty(d.email) ? "email address" : "mobile number"} too (it's fine if they don't have it). After the answer, call this tool again.${droppedNote}${movedNote}` }); return; }
  }
  // a field the form declares to ask first (the rating an opportunity will need, Carverhill, Oct 25), then the rest of the optional details are offered
  if (R.askFirst && !missing.length && empty(d[R.askFirst]) && !V.askedCap && !V.opt) { V.askedCap = true; V.opt = { done: [], only: R.askFirst }; optAsk(callId, droppedNeeded([optLabel(A.fields.find(f => f.k === R.askFirst))]).length ? notCaught([optLabel(A.fields.find(f => f.k === R.askFirst))]) : undefined); return; }
  // only the follow-up task is left on an awaiting ask: the app asks it in its own words, with the suggested wording (Carverhill, Oct 28)
  if (awaitingAsk(tool.action, d) && missing.length === 1 && /follow-up task/.test(missing[0])) { const s = followUpSuggestion(target);
    toolReply(callId, { ok: true, button: A.saveLabel, field: "nextStep", ask_exactly: FOLLOW_Q(target), next: `If the officer says yes, call this tool with nextStep "${s.text}" and nextDue ${s.due}; if they give their own words or date, use those.${droppedNote}${movedNote}` }); return; }
  if (!missing.length && !V.askedOptional && !V.opt && !reread && optSteps(tool.action).length) { offerMore(callId); return; } /* every form: the optional details offered once (the policy) */
  // hands-free: a finished draft is read back by the app straight away, instead of waiting for Ara to call save_form (Oct 25: she said "Tap Confirm" instead)
  if (!missing.length && G.hands && !R.noVoiceSave) { hfSave(callId, { confirmed: false }, reread ? reread : undefined, reread ? true : false); return; }
  const needed = missing.length ? droppedNeeded(missing) : [];
  // the drop note and the next required question are one scripted line (Oct 28: "I didn't catch the response" alone, four times, while the question never came)
  // the dropped value was the next step and no field question follows: the app asks its own next-step question, so Ara never has to (Carverhill's 9:14 AM call, Oct 29: "I didn't catch the next step from you" and nothing more, which left him asking what she wanted)
  const nextQ = needed.some(x => /^next step/i.test(x)) && !missingFields.length && wantsNextStep(tool.action, d, target) ? (awaitingAsk(tool.action, d) ? FOLLOW_Q(target) : NEXT_STEP_Q) : "";
  const reply = (out) => { if (!needed.length) { toolReply(callId, out); return; } const { status, ...rest } = out; const q = out.ask_exactly || nextQ; if (nextQ && !out.ask_exactly) { V.askedNext = true; act("step", "The next step Ara filled in was dropped: the app asks its own next-step question"); } toolReply(callId, Object.assign(rest, { ask_exactly: `${notCaught(needed)}${q ? " " + q : ""}`, next: (nextQ && !out.ask_exactly ? `The app asked whether to set the next step itself. After the answer, call this tool again with nextStep and nextDue, in the officer's words; if they say no, go on without one. ` : "") + (out.next || status) })); };
  // the officer's words that landed with this call may already answer the first question: then the app doesn't ask it (Oct 28: "How much is the amount?" right after "Fifty thousand dollars")
  const justSaid = missingFields.length && G.lastHeard && G.lastHeard.at && Date.now() - G.lastHeard.at < JUST_SAID_MS && typeof fieldSaidIn === "function" && fieldSaidIn(tool.action, missingFields[0], [G.lastHeard.text]) ? optLabel(missingFields[0]) : "";
  if (justSaid) act("step", `The officer has just said the ${justSaid}: the app doesn't ask for it`);
  const firstQ = missingFields.length && !justSaid ? reqQuestion(tool.action, missingFields, d) : !missingFields.length && typeof oneOfQuestion === "function" ? oneOfQuestion(tool.action, d) : ""; /* a contact with neither: the app asks, not Ara (6:58 PM call, Oct 29) */
  const stillNote = `The draft is open on the officer's screen and fills in as you go. Still needed: ${missing.join(", ")}.${stateNote}${droppedNote}${movedNote}${onForm.length ? ` Already on the form, some filled in from earlier steps: ${onForm.join("; ")}. Never ask for these again; if the officer asks, confirm what's there.` : ""}${badDates.length ? ` The app couldn't read ${badDates.join(", ")} as a date: send dates as YYYY-MM-DD (today is ${todayISO()}).` : ""}${missing.includes("Summary") ? " When the officer describes what happened, put it in the summary parameter (1 to 3 sentences, past tense, in their words) and call this tool again with it." : ""} ${justSaid ? `The officer has just said the ${justSaid} ("${G.lastHeard.text}"): call this tool again with it now, without asking.` : firstQ ? "The app asked for the first one itself; after the officer's answer call this tool again, and ask for the next one in one short question only if the app doesn't." : "Ask for the first one in one short question; after each answer call this tool again."} Don't ask them to tap ${A.saveLabel} yet.`;
  reply(missing.length
    ? { ok: true, button: A.saveLabel, still_needed: missing, ask_exactly: firstQ || undefined, next: firstQ ? stillNote : undefined, status: stillNote }
    : { ok: true, button: A.saveLabel, status: `${tool.action === "cultivate" && d.decision !== "Defer" ? `First say in one sentence that moving to Cultivation means they, as the gift officer, believe ${V.target.contact ? V.target.contact.first : "the prospect"} is ready to be pursued for a gift. ` : ""}The draft is on the officer's screen. It is NOT saved. Ask them to check it and tap the "${A.saveLabel}" button (say that exact label).${droppedNote}${movedNote}` });
}
