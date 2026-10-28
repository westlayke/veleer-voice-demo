"use strict";
// Citizens VCRM demo: finding contacts, draft forms and saves. Loaded in order by the page; all files share one scope.
/* ---------- finding the contact the officer means ---------- */
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
function findContacts(spoken) {
  const q = norm(spoken); if (!q) return [];
  const words = q.split(" ");
  const exact = S.contacts.filter(c => norm(nameOf(c)) === q || norm(`${c.last} ${c.first}`) === q);
  if (exact.length) return exact;
  return S.contacts.filter(c => { const f = norm(c.first), l = norm(c.last); return words.every(w => f.startsWith(w) || l.startsWith(w) || f === w || l === w); });
}
function focusContact() {
  if (S.screen === "contact" && S.sel.contact) return contactById(S.sel.contact);
  if (S.screen === "opp" && S.sel.opp) { const o = oppById(S.sel.opp); return o && contactById(o.contactId); }
  return null;
}
// editing a contact uses the New contact fields, filled in from the record
ACTIONS.editContact = { title: "Edit contact", saved: "Changes saved", saveLabel: "Save changes", fields: ACTIONS.contact.fields, pairs: ACTIONS.contact.pairs,
  left: "A contact needs an email or a mobile number. Every change is recorded in History. Only the Chief Gift Officer can turn off Do Not Contact; Ally - Do Not Solicit can be turned off by whoever set it or the Chief Gift Officer." };
// editing a saved meeting, task or planned ask: the same fields, filled in from what was saved
ACTIONS.editInteraction = { title: "Edit interaction report", saved: "Changes saved", saveLabel: "Save changes", fields: ACTIONS.interaction.fields.filter(f => f.k !== "capacity"), pairs: ACTIONS.interaction.pairs,
  left: "Every change is recorded in History. Marking it substantive needs a next step and its due date, which creates one Task. To change an existing next step, edit its task. A recorded ask is changed only by the Chief Gift Officer." };
ACTIONS.editTask = { title: "Edit task", saved: "Changes saved", saveLabel: "Save changes", fields: ACTIONS.task.fields.filter(f => f.k !== "onOpp"), left: "Every change is recorded in History. Change the status from the task's status button." };
ACTIONS.editPlan = { title: "Edit planned ask", saved: "Changes saved", saveLabel: "Save changes", fields: ACTIONS.plan.fields, pairs: ACTIONS.plan.pairs,
  left: "A planned ask can be changed until the ask is recorded. Its reminder task moves with the planned date. Every change is recorded in History." };
const EDITS = ["editContact", "editInteraction", "editTask", "editPlan"];
// which saved item an edit is for: by id when tapped, otherwise the one the officer described (or the latest)
function editItem(action, c, sel) {
  const words = (x) => norm(x).split(" ").filter(w => w.length > 2);
  if (action === "editInteraction") {
    const l = S.interactions.filter(i => i.contactId === c.id && i.kind !== "ask").sort((x, y) => String(y.date).localeCompare(String(x.date)));
    const hit = sel.id ? l.find(i => i.id === sel.id) : sel.date ? l.find(i => i.date === sel.date) : l[0];
    if (!hit) return { error: l.length ? `${nameOf(c)} has no interaction report on ${fmtDate(sel.date)}. Their reports are on ${l.map(i => fmtDate(i.date)).join(", ")}. Ask which one.` : `${nameOf(c)} has no interaction reports to edit. A recorded ask can be corrected only by the Chief Gift Officer.` };
    return { contact: c, item: hit };
  }
  if (action === "editTask") {
    const l = S.tasks.filter(t => t.contactId === c.id && !t.done);
    let hit = sel.id ? S.tasks.find(t => t.id === sel.id) : null;
    if (!hit && sel.which) { // the exact text, else the task sharing the most words with it (Oct 25: any one shared word, such as the person's name, made two tasks "match")
      const nw = words(nameOf(c)), w = words(sel.which).filter(x => !nw.includes(x)), exact = l.filter(t => norm(t.text) === norm(sel.which));
      const scored = l.map(t => [t, w.filter(x => norm(t.text).includes(x)).length]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
      hit = exact.length === 1 ? exact[0] : scored.length && (scored.length === 1 || scored[0][1] > scored[1][1]) ? scored[0][0] : null; }
    if (!hit && !sel.id && l.length === 1) hit = l[0];
    if (!hit) return { error: l.length ? `Which of ${nameOf(c)}'s tasks? ${l.map(t => `"${t.text}"`).join("; ")}. Ask which one, then call again with which set to words from it.` : `${nameOf(c)} has no open tasks to edit.` };
    return { contact: c, item: hit, opp: hit.oppId ? oppById(hit.oppId) : null };
  }
  if (action === "editPlan") {
    const o = openOpp(c.id), a = latestAsk(o);
    if (!o) return { error: `${nameOf(c)} has no open opportunity, so there's no planned ask to edit.` };
    if (!a || a.status !== "Planned") return { error: a ? `${o.name} has no planned ask: the ask was already recorded (${a.status}). A recorded ask, pledge or gift can be corrected only by the Chief Gift Officer or an administrator. Explain that.` : `${o.name} has no planned ask yet. Offer to plan one.` };
    return { contact: c, opp: o, item: a };
  }
}
const EDIT_KEYS = ["first", "last", "email", "mobile", "permEmail", "permCalls", "permText", "ally", "dnc", "permSource", "howMet", "capacity"];
// flags this officer may not turn off (the demo officer is a gift officer, not the Chief Gift Officer)
const lockedOff = (c, k) => k === "dnc" ? !!c.dnc : k === "ally" ? !!c.ally && (c.allySetBy || "") !== OFFICER : false;
// Returns { contact, opp } or { error } for Grok to relay.
function resolveTarget(action, spoken, sel = {}) {
  if (action === "contact") return {};
  let list = spoken ? findContacts(spoken) : [];
  if (!spoken) { const f = focusContact(); if (f) list = [f]; }
  if (!list.length) return { error: spoken ? `No contact named "${spoken}". Known contacts: ${S.contacts.map(nameOf).join(", ")}. Ask who they mean, or offer to add them as a new contact.` : "Ask which contact this is for." };
  if (list.length > 1) return { error: `More than one contact matches: ${list.map(nameOf).join(", ")}. Ask which one.` };
  const contact = list[0];
  if (action === "editContact") return { contact };
  if (EDITS.includes(action)) return editItem(action, contact, sel);
  if (action === "opportunity") { const ch = oppChecks(contact), miss = ch.filter(x => !x.ok);
    return miss.length ? { gate: contact, error: `An opportunity can be created for ${nameOf(contact)} only when all of these are true: ${ch.map(x => `${x.need.replace(/^They/, nameOf(contact).split(" ")[0])} (${x.ok ? "done" : "not yet"}: ${x.now})`).join("; ")}. Still to do: ${miss.map(x => x.todo).join(" ")} Explain this briefly: what is already true and what still needs doing.${!contact.capacity && !contact.dnc && !contact.ally ? " Then offer to set their capacity rating now (set_capacity_rating)." : ""}` } : { contact }; }
  if (contact.dnc && ["meeting", "plan", "ask", "opportunity"].includes(action)) return { error: `${nameOf(contact)} is marked Do Not Contact, so no outreach can be planned. Only a Chief Gift Officer can clear it.` };
  if (contact.ally && ["opportunity", "plan", "ask", "pledge", "gift"].includes(action)) return { error: `${nameOf(contact)} is an Ally - Do Not Solicit, so they can't be asked for a gift. The officer who set the flag or the Chief Gift Officer can turn it off.` };
  if (action === "response") { const o = openOpp(contact.id), a = latestAsk(o); // the answer to the ask that is out
    if (!o) return { error: `${nameOf(contact)} has no open opportunity, so there's no ask waiting for an answer.` };
    if (o.stage !== "Ask Made" || !a || a.status !== "Made") return { error: o.stage === "Ask Made" ? `${o.name} already has its answer: ${a ? a.status : "none"}. Offer to record the pledge or a gift.` : o.stage === "Ask Planning" ? `${o.name} hasn't been asked yet; the ask is planned for ${fmtDate(latestAsk(o).plannedDate)}. When it's made, record the ask with its response.` : `${o.name} is in ${o.stage}, with no ask waiting for an answer.` };
    return { contact, opp: o, item: a }; }
  if (action === "interaction") return { contact, opp: openOpp(contact.id) || null };
  if (action === "task" || action === "meeting") return { contact, opp: openOpp(contact.id) || null };
  const opp = openOpp(contact.id);
  if (!opp) return { error: `${nameOf(contact)} has no open opportunity yet. Offer to create one first.` };
  const qual = `${opp.name} is still in Qualification. An ask can be planned only once it is in Cultivation, which needs a capacity rating, a substantive interaction and the officer's confirmation${cultMissing(contact).length ? "; it still needs " + cultMissing(contact).join(" and ") : "; the criteria are met, so offer to move it to Cultivation"}.`;
  if (action === "cultivate") {
    if (opp.stage !== "Qualification") return { error: `${opp.name} is already in ${opp.stage}. Say so and offer what comes next there.` };
    const m = cultMissing(contact); if (m.length) return { error: `${opp.name} can't move to Cultivation yet: it still needs ${m.join(" and ")}. Offer to log a meeting.` };
  }
  if ((action === "plan" || action === "ask") && opp.stage === "Qualification") return { error: qual };
  if (action === "plan" && opp.stage === "Ask Planning") return { error: `${opp.name} already has an ask planned for ${fmtDate(latestAsk(opp).plannedDate)}. Offer to record the ask once it's made.` };
  if (action === "plan" && ["Ask Made", "Commitment"].includes(opp.stage)) return { error: `${opp.name} is already in ${opp.stage}; an ask has been made. Offer to record ${opp.stage === "Commitment" ? "a gift on the pledge" : "the pledge or a gift"} instead.` };
  if (action === "ask" && opp.stage === "Commitment") return { error: `${opp.name} already has a pledge recorded (Commitment). Offer to record a gift on the pledge.` };
  if (action === "gift" && opp.stage === "Commitment") return { contact, opp, route: "payment" }; // the gift is applied to the pledge
  if ((action === "pledge" || action === "gift") && opp.stage !== "Ask Made") return { error: opp.stage === "Commitment" ? (opp.pledge && opp.pledge.outright ? `${opp.name} has an outright gift agreed at the ask (Commitment). Offer to record the gift when it arrives.` : `${opp.name} already has a pledge recorded. Offer to record a gift on the pledge.`) : `${opp.name} is in ${opp.stage}. A ${action} is recorded after the ask is made and the investor says yes. Offer to ${opp.stage === "Ask Planning" ? "record the ask first" : opp.stage === "Cultivation" ? "plan the ask first" : "log a meeting"}.` };
  if (action === "payment" && opp.stage !== "Commitment") return { error: `${opp.name} has no pledge recorded yet (it is in ${opp.stage}). ${opp.stage === "Ask Made" ? "Offer to record the pledge, or Record gift for an outright gift." : "A gift is applied to a pledge once there is one."}` };
  return { contact, opp };
}

/* ---------- drafts ---------- */
// show the officer the first field that still needs something
function focusField(el) { if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); try { el.focus({ preventScroll: true }); } catch (x) {} } }
// a recorded pledge or gift settles the contact's "Follow up on agreed pledge" tasks
const doneAgreedPledgeTasks = (c) => S.tasks.forEach(k => { if (k.contactId === c.id && /^Follow up on agreed pledge/.test(k.text)) k.done = true; });
// the answer, a pledge or a gift settles the opportunity's "Check on the answer to the ask" task (Oct 28)
const doneAskCheckTasks = (o) => S.tasks.forEach(k => { if (k.oppId === o.id && askCheckTask(k)) { k.done = true; k.status = "done"; k.doneOn = todayISO(); } });
// what the investor's answer does to the ask, the opportunity and the tasks: shared by Record the ask and Record the response (Oct 28).
// Awaiting creates the Check on the answer task, due in ASK_CHECK_DAYS, and the note says so (stated to the officer, not asked); any answer marks it done.
function askOutcome(o, c, a, d, lead) {
  const ids = { contactId: c.id, oppId: o.id }, r = d.response || "Awaiting";
  a.response = r;
  if (r === "Accepted") { a.status = "Accepted"; if (d.agreedAmount) a.amount = d.agreedAmount; }
  if (r === "Countered") { a.status = "Countered"; o.asks.unshift({ fund: a.fund, campaign: a.campaign, amount: d.agreedAmount || a.amount, askType: a.askType, status: "Agreed, pledge to follow", plannedDate: d.date, askedOn: d.date }); }
  if (r === "Declined") { a.status = "Declined"; a.reason = d.lostReason; }
  if (r === "Declined") { o.stage = "Closed"; o.closed = "Lost"; o.lostReason = d.lostReason; o.closedOn = d.date; log(`${lead}: Declined. Closed Lost: ${d.lostReason}`, ids); }
  else { const moved = o.stage !== "Ask Made"; o.stage = "Ask Made"; log(`${lead}: ${r}${d.agreedAmount ? ", " + money(d.agreedAmount) : ""}${moved ? ". Moved to Ask Made" : ""}`, ids); }
  const yes = (r === "Accepted" || r === "Countered") ? latestAsk(o) : null, outright = yes && (yes.askType || "Outright") === "Outright";
  // a yes to an outright ask is the commitment: straight to Commitment, waiting for the gift (a pledge ask still waits for Record pledge with its schedule)
  if (outright) { const due = addDays(d.date || todayISO(), PLEDGE_FOLLOWUP_DAYS); yes.status = "Accepted";
    o.pledge = { outright: true, amount: yes.amount, fund: yes.fund, confirmedBy: "Ask accepted", confirmedDate: d.date, installments: 1, frequency: "One payment", firstAmount: yes.amount, firstDue: due, payments: [], status: "Current" };
    o.stage = "Commitment"; c.status = "Investor";
    log(`Outright gift of ${money(yes.amount)} agreed at the ask. Moved to Commitment`, ids); }
  if (d.nextStep) S.tasks.unshift({ id: uid(), contactId: c.id, oppId: o.id, text: d.nextStep, due: d.nextDue, done: false, askCheck: r === "Awaiting" });
  if (yes) S.tasks.unshift({ id: uid(), contactId: c.id, oppId: o.id, text: `Follow up on agreed ${outright ? "gift" : "pledge"}: ${money(yes.amount)}`, due: addDays(d.date || todayISO(), PLEDGE_FOLLOWUP_DAYS), done: false, auto: true });
  let note = "";
  if (r === "Awaiting") { const due = addDays(d.date || todayISO(), ASK_CHECK_DAYS);
    if (d.nextStep) { log(`Task added: ${d.nextStep} by ${fmtDate(d.nextDue)} (the follow-up on this ask)`, ids); note = `The task "${d.nextStep}" by ${fmtDate(d.nextDue)} is the follow-up on this ask.`; }
    else { const had = S.tasks.find(k => k.oppId === o.id && askCheckTask(k));
      if (had) note = `The task "${had.text}" by ${fmtDate(had.due)} is the follow-up on this ask.`;
      else { S.tasks.unshift({ id: uid(), contactId: c.id, oppId: o.id, text: `Check on the answer to the ${money(a.amount)} ask`, due, done: false, auto: true }); log(`Task added: check on the answer to the ${money(a.amount)} ask by ${fmtDate(due)}`, ids); note = `A task to check on ${c.first}'s answer by ${fmtDate(due)} was added.`; } } }
  else { const had = S.tasks.filter(k => k.oppId === o.id && askCheckTask(k)).length; doneAskCheckTasks(o); if (had) note = "The task to check on the answer is marked done."; }
  return note;
}
let V = null; // { action, data, fromVoice, target }
function prefill(action, d, t) {
  const out = Object.assign({}, d);
  const c = t.contact, o = t.opp, a = latestAsk(o);
  if (action === "interaction") { out.forName = nameOf(c); if (!out.capacity && c.capacity) out.capacity = c.capacity; } // shows the contact's current rating
  if (action === "task") { out.forName = nameOf(c); if (out.onOpp && !o) out.onOpp = false; }
  if (["plan", "ask", "pledge", "cultivate", "gift", "payment"].includes(action)) out.forName = o ? o.name : "";
  if (action === "cultivate" && !out.decision) out.decision = "Move to Cultivation";
  if (action === "gift") { if (!out.fund) out.fund = (a && a.fund) || o.fund || ""; if (out.amount == null && a) out.amount = a.amount; if (!out.date) out.date = todayISO(); }
  if (action === "payment") { if (out.amount == null && o.pledge) out.amount = o.pledge.firstAmount; if (!out.date) out.date = todayISO(); }
  if (action === "interaction" || action === "ask" || action === "response") { if (!out.date) out.date = todayISO(); }
  if (action === "response") out.forName = o ? o.name : "";
  if (action === "opportunity") { out.name = `${c.last}, ${c.first} - ${YEAR}`; out.officer = OFFICER; }
  if (action === "plan") { out.officer = OFFICER; if (!out.fund && o.fund) out.fund = o.fund; if (!out.campaign && o.campaign && out.fund === o.fund) out.campaign = o.campaign; }
  if (action === "ask") { if (out.amount == null && a) out.amount = a.amount; if (!out.fund) out.fund = (a && a.fund) || o.fund || ""; }
  if (action === "pledge") {
    if (!out.fund) out.fund = (a && a.fund) || o.fund || "";
    if (out.amount == null && a) out.amount = a.amount;
    if (!out.confirmedDate) out.confirmedDate = todayISO(); if (!out.installments) out.installments = 1;
    if (!out.frequency) out.frequency = out.installments > 1 ? "Annual" : "One payment";
    if (out.firstAmount == null && out.amount && out.installments) out.firstAmount = Math.round(out.amount / out.installments);
  }
  if (action === "meeting") { out.forName = nameOf(c); if (!out.title) out.title = `Meeting with ${nameOf(c)}`; if (!out.duration) out.duration = "1 hour"; if (!out.meetingType) out.meetingType = "In person"; }
  const it = t.item;
  if (action === "editInteraction" && it) { out.forName = nameOf(c); [["date", "date"], ["meetingType", "type"], ["summary", "summary"], ["substantive", "substantive"], ["outcome", "outcome"]].forEach(([k, f]) => { if (out[k] == null) out[k] = it[f] == null ? "" : it[f]; }); out.substantive = !!out.substantive; }
  if (action === "editTask" && it) { out.forName = nameOf(c); if (out.text == null) out.text = it.text; if (out.due == null) out.due = it.due || ""; }
  if (action === "editPlan" && it) { out.forName = o.name; out.officer = OFFICER; ["fund", "campaign", "plannedDate", "amount", "askType", "participants"].forEach(k => { if (out[k] == null) out[k] = it[k] == null ? "" : it[k]; }); }
  if (action === "editContact" && c) EDIT_KEYS.forEach(k => { if (out[k] === undefined || out[k] === null) out[k] = c[k] == null ? (typeof c[k] === "boolean" ? false : "") : c[k]; });
  if (action === "contact") { if (out.permEmail == null) out.permEmail = true; if (out.permCalls == null) out.permCalls = true; if (out.permText == null) out.permText = false; } // guide defaults
  if (ACTIONS[action].fields.some(f => f.k === "campaign") && out.fund) { const ok = campaignsFor(out.fund); // the campaign must suit the entity; National-only entities fill it in
    if (out.campaign && !ok.includes(out.campaign)) { out.badCampaign = out.campaign; out.campaign = ""; } else delete out.badCampaign;
    if (!out.campaign && ok.length === 1 && !out.badCampaign) out.campaign = ok[0]; }
  return out;
}
const OPP_MARK = '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h7M6.5 3 9.5 6l-3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function fieldHTML(f, d, fromVoice) {
  const v = d[f.k];
  const voiced = fromVoice.has(f.k) && !f.fixed;
  const missing = f.req && fieldBlank(f, v);
  const same = V && V.action === "editContact" && V.target.contact && (V.target.contact[f.k] || "") === (v || ""); // unchanged on an edit: nothing to check
  const cls = ["fld", voiced ? "v" : "", missing ? "miss" : "", f.check && v && !same ? "chk" : ""].join(" ");
  const tag = voiced ? `<span class="via">${mic(12)} <span class="vt">from voice</span></span>` : (f.fixed ? `<span class="via" style="color:var(--muted)">filled in</span>` : "");
  const oppTag = f.opp ? `<span class="opptag" title="Optional now, needed before you can create an opportunity">${OPP_MARK} For opportunity</span>` : "";
  const lab = `<div class="lbl">${esc(f.label)}${f.req ? '<span class="req">*</span>' : ""}${oppTag}${tag}</div>`;
  const id = "f_" + f.k;
  let input;
  const lock = V && V.action === "editContact" && V.target.contact && lockedOff(V.target.contact, f.k);
  if (f.type === "bool") return `<div class="${cls}"><label class="tg" for="${id}"><input type="checkbox" id="${id}" ${v ? "checked" : ""}${lock ? " disabled" : ""}> ${esc(f.label)}${lock ? `<span class="opptag off">Only the Chief Gift Officer can turn this off</span>` : ""}${f.oppOff ? `<span class="opptag off">${OPP_MARK} Must be off</span>` : ""}${voiced ? ` <span class="via" style="margin-left:auto">${mic(12)} from voice</span>` : ""}</label></div>`;
  const opts = typeof f.opts === "function" ? f.opts(d) : f.opts;
  if (f.type === "select") input = `<select id="${id}">${(opts.includes(v) || !v ? opts : [v, ...opts]).map(o => `<option value="${esc(o)}" ${o === (v || "") ? "selected" : ""}>${esc(o === "" ? (f.fmt ? f.fmt("") : "Not set") : (f.fmt ? f.fmt(o) : o))}</option>`).join("")}</select>`;
  else if (f.type === "area") input = `<textarea id="${id}">${esc(v)}</textarea>`;
  else if (f.k === "nextStep") input = `<textarea id="${id}" class="short" rows="3">${esc(v)}</textarea>`; // room for a full sentence
  else if (f.type === "time") input = `<input type="time" id="${id}" value="${esc(v || "")}">`;
  else if (f.type === "date") input = `<input type="date" id="${id}" value="${esc(v || "")}">`;
  else if (f.type === "money") input = `<input type="text" inputmode="decimal" id="${id}" value="${v == null || v === "" ? "" : esc(f.num ? v : money(v))}">`;
  else input = `<input type="text" id="${id}" value="${esc(v)}" ${f.fixed ? "readonly" : ""}>`;
  return `<div class="${cls}">${lab}${input}${f.check && v && !same ? `<div class="cn">! Check this. ${esc(f.check)}</div>` : ""}</div>`;
}
function draftHTML() {
  const A = ACTIONS[V.action], d = V.data, fv = V.fromVoice;
  const paired = new Set((A.pairs || []).flat());
  // every field shows, in form order (no "More details" fold)
  let body = "";
  for (const f of A.fields) {
    if (f.when && !d[f.when]) continue; // shown only while its switch is on (texting permission source)
    let unit = [f];
    if (paired.has(f.k)) { const pair = A.pairs.find(p => p[0] === f.k); if (!pair) continue; unit = pair.map(k => A.fields.find(x => x.k === k)); }
    body += unit.length > 1 ? `<div class="two">${unit.map(x => fieldHTML(x, d, fv)).join("")}</div>` : fieldHTML(f, d, fv);
  }
  const typed = V.typed && !fv.size;
  const sub = V.action === "contact" ? `Contact · added by ${OFFICER}` : V.action === "editContact" ? esc(nameOf(V.target.contact)) : V.action === "opportunity" ? `For ${esc(nameOf(V.target.contact))}` : V.action === "task" ? `For ${esc(nameOf(V.target.contact))}${V.target.opp ? " · open opportunity " + esc(V.target.opp.name) : ""}` : (V.target.contact ? esc(nameOf(V.target.contact)) + (V.target.opp ? " · " + esc(V.target.opp.name) : "") : esc(V.target.opp ? V.target.opp.name : ""));
  let dupe = "";
  if (V.action === "contact") { const m = findContacts(`${d.first || ""} ${d.last || ""}`); dupe = m.length ? `<div class="note">Possible match: ${esc(m.map(nameOf).join(", "))} is already a contact. Save only if this is someone new.</div>` : `<div class="left">Checked for duplicates: no existing contact matches ${esc((d.first || "") + " " + (d.last || ""))}.</div>`; }
  return `<div class="grab"></div>
  <div class="sh"><div style="min-width:0">${typed ? `<div class="vh">${V.action === "editContact" ? "Change and save" : "Fill in and save"}</div>` : `<div class="vh">${mic(15)} Draft from voice · check and save</div>`}<h3>${esc(A.title)}</h3><div class="s">${sub}</div></div><button class="x" data-act="close" aria-label="Close">×</button></div>
  <div class="sb">
    ${G.live ? "" : `<button type="button" class="vfill" data-act="voicefill">${mic(16)} ${typed ? "Fill this in by voice" : "Continue by voice"}</button>`}
    <div class="left">${typed ? `Type the details, or let ${esc(botName())} fill them in by voice. Fields marked * are required.` : "Drafted from your conversation. Say a correction out loud, or edit here."}${V.action === "contact" ? ` Fields marked <span class="opptag">${OPP_MARK} For opportunity</span> are optional now but needed before you can create an opportunity.` : ""}</div>
    ${dupe}
    <form id="draftForm" novalidate>${body}</form>
    ${A.left ? `<div class="left">${esc(A.left)}</div>` : ""}
    <div class="err" id="draftErr" hidden></div>
  </div>
  <div class="savebar"><button class="btn blue" data-act="save">${A.saveLabel}</button><small>${G.hands && V.action !== "meeting" ? `Hands-free: ${esc(botName())} reads it back and saves when you say yes` : `Nothing is saved until you tap ${A.saveLabel}`}</small></div>`;
}
function readDraft() {
  const out = Object.assign({}, V.data);
  for (const f of ACTIONS[V.action].fields) {
    const el = document.getElementById("f_" + f.k); if (!el || f.fixed) continue;
    if (f.type === "bool") out[f.k] = el.checked;
    else if (f.type === "money") out[f.k] = toNum(el.value);
    else out[f.k] = el.value.trim();
  }
  return out;
}
// fields that become required by a rule (a substantive meeting needs a next step; a declined ask or a defer needs a reason)
const COND_REQ = ["nextStep", "nextDue", "lostReason", "reason", "substantive", "outcome"]; // plus two that decide those rules
// a form opened by tapping: the officer types, or hands it to the assistant
function openForm(action, cid, item) {
  let target = {};
  if (action !== "contact") { const c = contactById(cid); target = resolveTarget(action, c ? nameOf(c) : "", { id: item }); }
  if (target.gate) { oppGate(target.gate); return; }
  if (target.error) { toast(plainErr(target.error)); return; }
  if (target.route) action = target.route;
  if (action === "response" && target.opp && !(S.screen === "opp" && S.sel.opp === target.opp.id)) { S.sel.opp = target.opp.id; S.screen = "opp"; save(); render(); } // the task's link lands on the opportunity, with the form over it
  V = { action, target, data: prefill(action, {}, target), fromVoice: new Set(), typed: true }; renderOverlay(); spookyCue("creak");
  if (action === "response") focusField(document.getElementById("f_response")); // straight to the field the officer came for
  if (G.live) guide(`The officer opened the ${ACTIONS[action].title} form${target.contact ? " for " + nameOf(target.contact) : ""} by tapping. In a few words, say you see it and that they can tell you the details (you fill it in with ${toolFor(action)}).`);
}
const toolFor = (action) => (TOOLS.find(t => t.action === (action === "payment" ? "gift" : action)) || {}).name || "the draft tool";
// rule messages are written for the assistant ("Offer to..."); on screen keep only the facts
const plainErr = (m) => m.split(/(?<=\.)\s+/).filter(x => !/^(Offer|Ask|Explain)\b/.test(x)).join(" ") || m;
function voiceFill() {
  V.data = readDraft();
  const A = ACTIONS[V.action], c = V.target.contact;
  startCall(`The officer opened the ${A.title} form${c ? " for " + nameOf(c) : ""} on screen and tapped Fill this in by voice. ${draftSummary()} Help them finish it: ask only for what is still needed, one short question at a time, and call ${toolFor(V.action)}${c ? ` with contact_name "${nameOf(c)}"` : ""} as you go. Don't ask about anything already filled in.`);
}
// Home options typed instead of spoken: pick who it's for, then the form opens
const FORM_FOR = { "Add a contact": "contact", "Let's add a contact": "contact", "Log a meeting": "interaction", "Plan an ask": "plan", "Record an ask": "ask", "Record the ask": "ask", "Record the response": "response", "Record a pledge": "pledge", "Record a gift": "gift", "Record a payment": "gift", "Add a task": "task", "Schedule a meeting": "meeting" };
function pickFor(action) {
  if (action === "contact") { openForm("contact"); return; }
  const ok = S.contacts.map(c => ({ c, t: resolveTarget(action, nameOf(c)) })).filter(x => !x.t.error || (action === "opportunity" && !openOpp(x.c.id))); // not ready yet: tapping shows what's missing
  const h = document.getElementById("modal"), A = ACTIONS[action], oppFirst = ["plan", "ask", "response", "pledge", "gift", "payment"].includes(action);
  // A to Z by last name, then first name (the small label still says why each opportunity is listed)
  ok.sort((a, b) => (a.c.last || "").localeCompare(b.c.last || "") || (a.c.first || "").localeCompare(b.c.first || ""));
  const why = (o) => { if (action === "gift") return o.stage === "Commitment" ? (o.pledge && o.pledge.outright ? "Commitment · agreed outright gift" : "Commitment · applied to the pledge") : "Ask Made · implied commitment";
    if (action !== "ask") return o.stage; const a = latestAsk(o);
    return o.stage === "Ask Planning" ? `Ask Planning · planned for ${a ? fmtDate(a.plannedDate) : "a set date"}` : o.stage === "Ask Made" ? (a && a.status === "Made" ? "Ask Made · record the answer" : "Ask Made · record another ask") : o.stage === "Cultivation" ? "Cultivation · unplanned ask" : o.stage; };
  // Record the ask: planned asks in their own section first, then everything else, each A to Z
  const planned = ok.filter(x => x.t.opp && x.t.opp.stage === "Ask Planning");
  const groups = action === "ask" && planned.length && planned.length < ok.length ? [["Planned asks (Ask Planning)", planned], ["Other opportunities", ok.filter(x => !planned.includes(x))]] : [["", ok]];
  h.innerHTML = `<div class="scrim center" data-helpx="1"><div class="wmodal hmodal" role="dialog" aria-modal="true" aria-labelledby="pkTitle">
    ${HELP_X}
    <h2 id="pkTitle">${esc(action === "ask" ? "Record the ask" : A.title)}: ${oppFirst ? "which opportunity?" : "who is it for?"}</h2>
    ${ok.length ? groups.map(([head, xs]) => `${head ? `<div class="qa-h">${head}</div>` : ""}<div class="pick">${xs.map(x => `<button type="button" class="btn quiet" data-pick="${x.c.id}">${esc(oppFirst && x.t.opp ? x.t.opp.name : `${x.c.last}, ${x.c.first}`)}${oppFirst && x.t.opp ? `<small>${esc(why(x.t.opp))}</small>` : x.t.gate ? "<small>Not ready yet</small>" : ""}</button>`).join("")}</div>`).join("")
      : `<p class="wl-hint">None of your ${oppFirst ? "opportunities is at the right stage" : "contacts can take this"} yet.</p>`}
    <button type="button" class="btn quiet" data-helpx="1">Cancel</button></div></div>`;
  h.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => { h.innerHTML = ""; openForm(action, b.dataset.pick); });
  // a search box at the top narrows the list; every word typed must match ("ken ito" finds "Ito, Ken")
  const list = h.querySelector(".pick");
  if (list) { const q = document.createElement("input"); q.type = "search"; q.className = "pick-q"; q.placeholder = "Search by name"; q.setAttribute("aria-label", "Search by name");
    q.oninput = () => { const ws = q.value.trim().toLowerCase().split(/[\s,]+/).filter(Boolean); h.querySelectorAll("[data-pick]").forEach(b => { const t = b.textContent.toLowerCase(); b.hidden = ws.some(w => !t.includes(w)); });
      h.querySelectorAll(".pick").forEach(g => { const hd = g.previousElementSibling; if (hd && hd.classList.contains("qa-h")) hd.hidden = g.hidden = ![...g.querySelectorAll("[data-pick]")].some(b => !b.hidden); }); };
    (list.previousElementSibling && list.previousElementSibling.classList.contains("qa-h") ? list.previousElementSibling : list).before(q); }
}
// the + button on every screen: one place to log, add or record anything
const QUICK = [["People and meetings", [["interaction", "Log a meeting or call"], ["meeting", "Schedule a meeting"], ["task", "Add a task"], ["contact", "Add a contact"]]],
  ["Opportunities", [["opportunity", "Create an opportunity"], ["plan", "Plan an ask"], ["ask", "Record the ask"], ["pledge", "Record a pledge"], ["gift", "Record a gift"]]]];
function quickAdd(anyone) {
  const c = anyone ? null : focusContact(), h = document.getElementById("modal");
  h.innerHTML = `<div class="scrim center" data-helpx="1"><div class="wmodal hmodal" role="dialog" aria-modal="true" aria-labelledby="qaTitle">
    ${HELP_X}
    <h2 id="qaTitle">What would you like to do?</h2>
    ${c ? `<p class="qa-for">For ${esc(nameOf(c))} · <button type="button" data-qaany="1">Someone else</button></p>` : ""}
    ${QUICK.map(([head, items]) => `<div class="qa-h">${head}</div><div class="pick">${items.map(([a, label]) => `<button type="button" class="btn quiet" data-qa="${a}">${label}</button>`).join("")}</div>`).join("")}
    <button type="button" class="btn quiet" data-helpx="1" style="margin-top:10px">Cancel</button></div></div>`;
  const any = h.querySelector("[data-qaany]"); if (any) any.onclick = () => quickAdd(true);
  h.querySelectorAll("[data-qa]").forEach(b => b.onclick = () => { const a = b.dataset.qa; h.innerHTML = ""; if (a === "contact") openForm("contact"); else if (c) openForm(a, c.id); else pickFor(a); });
}
function renderOverlay() {
  if (!V && G.hfForm) { G.hfForm = false; setTimeout(() => { if (!V && hfUnchecked().length) hfCheckModal(); }, 0); } // a fix opened from the hands-free check returns to it
  const host = document.getElementById("overlay");
  host.innerHTML = V ? `<div class="scrim" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(ACTIONS[V.action].title)}">${draftHTML()}</div></div>` : "";
}
document.getElementById("overlay").addEventListener("click", (e) => {
  const a = e.target.closest("[data-act]"); if (!a) return;
  if (a.dataset.act === "close") { V = null; renderOverlay(); }
  else if (a.dataset.act === "voicefill") voiceFill();
  else if (a.dataset.act === "save") saveDraft();
});
// while Ara saves hands-free, what's wrong with the form goes back in her tool reply instead of as a notice
// a substantive interaction needs a next step (guide rule), also when an edit turns substantive on (seen Oct 24: an edit skipped it)
function needsNextStep(action, d, t) {
  if (!d.substantive || NO_NEXT_STEP.includes(d.outcome)) return false;
  return action === "interaction" || (action === "editInteraction" && !(t && t.item && t.item.substantive));
}
function hfNotice(text) { if (G.hfTry) G.hfTry.msg = text; else guide(text); }
function saveDraft() {
  const d = readDraft(), A = ACTIONS[V.action];
  const miss = A.fields.filter(f => f.req && fieldBlank(f, d[f.k]));
  if (!miss.length && (needsNextStep(V.action, d, V.target) || (V.action === "ask" && d.response !== "Declined"))) {
    const need = [!String(d.nextStep || "").trim() && "Next step", !d.nextDue && "Next step due"].filter(Boolean);
    if (need.length) {
      const msg = `Add the ${need.join(" and ").toLowerCase()} before saving. A substantive interaction needs a next step and its due date.`;
      const el = document.getElementById("draftErr"); el.hidden = false; el.textContent = msg;
      const first = document.getElementById(need[0] === "Next step" ? "f_nextStep" : "f_nextDue"); focusField(first);
      toast(msg);
      if (G.live) hfNotice(`The officer tapped ${A.saveLabel} but the draft has no ${need.join(" or ").toLowerCase()}. Explain in one sentence that a substantive interaction needs a next step and its due date, ask what it is and when it's due, then call the draft tool again.`);
      return;
    }
  }
  const ruleMsg = miss.length ? "" : V.action === "ask" && d.response === "Declined" && !String(d.lostReason || "").trim() ? ["lostReason", "Add the reason before saving. A declined ask closes the opportunity as Closed Lost, with a reason.", "the ask was declined but there is no reason. Explain that a declined ask closes the opportunity as Closed Lost and needs a reason, ask why"]
    : V.action === "cultivate" && d.decision !== "Defer" && cultMissing(V.target.contact).length ? ["decision", `Can't move to Cultivation yet: it still needs ${cultMissing(V.target.contact).join(" and ")}.`, `the move to Cultivation still needs ${cultMissing(V.target.contact).join(" and ")}. Say so in one sentence and offer to log the interaction or set the rating`]
    : V.action === "cultivate" && d.decision === "Defer" && !String(d.reason || "").trim() ? ["reason", "Add a reason before saving. Deferring needs a reason, which the Chief Gift Officer can see.", "they chose Defer without a reason. Explain that a defer needs a reason the Chief Gift Officer can see, ask for it"] : "";
  if (ruleMsg) {
    const el = document.getElementById("draftErr"); el.hidden = false; el.textContent = ruleMsg[1];
    const first = document.getElementById("f_" + ruleMsg[0]); focusField(first);
    toast(ruleMsg[1]);
    if (G.live) hfNotice(`The officer tapped ${A.saveLabel} but ${ruleMsg[2]}, then call the draft tool again.`);
    return;
  }
  if (!miss.length && (V.action === "contact" || V.action === "editContact") && !String(d.email || "").trim() && !String(d.mobile || "").trim()) {
    const msg = "Add an email or a mobile number before saving. A contact needs at least one.";
    const el = document.getElementById("draftErr"); el.hidden = false; el.textContent = msg;
    const first = document.getElementById("f_email"); focusField(first);
    toast(msg);
    if (G.live) hfNotice(`The officer tapped ${A.saveLabel} but the contact has no email or mobile number. Explain that a contact needs at least one, ask for it, then call the draft tool again.`);
    return;
  }
  if (miss.length) {
    const msg = "Fill in " + miss.map(f => f.label).join(", ") + " before saving.";
    const el = document.getElementById("draftErr"); el.hidden = false; el.textContent = msg;
    const first = document.getElementById("f_" + miss[0].k); focusField(first);
    toast(msg);
    if (G.live) hfNotice(`The officer tapped ${A.saveLabel} but the draft is missing: ${miss.map(f => f.label).join(", ")}. Ask for it in one short question, then call the draft tool again with everything filled in.`);
    return;
  }
  const undo = JSON.stringify(S), action = V.action, t = V.target;
  try { act("form", formLog(A, d, V.fromVoice, V.typed)); } catch (e) {}
  const result = APPLY[action](d, t);
  G.lastSave = { undo, at: Date.now(), action, hf: !!G.hfTry }; // a hands-free save can be taken back by saying "undo"
  save(); V = null; renderOverlay(); render(); window.scrollTo(0, 0);
  setWhatNext(action, result, t); if (G.whatNext) render();
  toast(A.saved + (result && result.note ? ". " + result.note : ""), () => { S = JSON.parse(undo); G.whatNext = null; save(); render(); });
  if (action === "payment" || action === "gift") celebrate(); // the money came in: a pledge payment or an outright gift
  else spookyCue("thunder");
  grokSaved(action, result, d);
}

// Google Calendar's "create event" link: the officer's own calendar opens with the meeting filled in, and they tap Save there
function gcalLink(d, c) {
  const mins = { "30 minutes": 30, "45 minutes": 45, "1 hour": 60, "90 minutes": 90, "2 hours": 120 }[d.duration] || 60;
  const start = new Date(`${d.date}T${d.time || "09:00"}:00`), end = new Date(start.getTime() + mins * 6e4);
  const f = (x) => `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}${String(x.getDate()).padStart(2, "0")}T${String(x.getHours()).padStart(2, "0")}${String(x.getMinutes()).padStart(2, "0")}00`;
  const details = [`${d.meetingType || "Meeting"} with ${nameOf(c)}${c.mobile ? " · " + c.mobile : ""}${c.email ? " · " + c.email : ""}`, d.notes || "", "Scheduled from Citizens VCRM"].filter(Boolean).join("\n\n");
  const q = { action: "TEMPLATE", text: d.title || `Meeting with ${nameOf(c)}`, dates: `${f(start)}/${f(end)}`, details, location: d.location || "" };
  if (c.email) q.add = c.email; // the contact as a guest, so Google offers to send the invite when the officer saves
  if (d.meetingType === "Video call") q.vcon = "meet"; // asks Google Calendar to attach a Meet link (not an official link option; the event screen also has an Add Google Meet button)
  return "https://calendar.google.com/calendar/render?" + new URLSearchParams(q).toString().replace("%2F", "/");
}
const fmtTime = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${(h % 12) || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
// copy the changed fields onto a saved item; returns "Label changed from A to B" for each change
function editLog(obj, d, map) {
  const out = [];
  Object.entries(map).forEach(([k, [f, label, show]]) => {
    let v = d[k]; if (typeof obj[f] === "boolean" || k === "substantive") v = !!v; else if (k === "amount") v = toNum(v); else v = v == null ? "" : String(v).trim();
    const was = typeof obj[f] === "boolean" || k === "substantive" ? !!obj[f] : obj[f] == null ? "" : obj[f];
    if (v === was || (v === "" && was === "")) return;
    const sh = (x) => x === "" || x == null ? "blank" : show ? show(x) : String(x);
    out.push(`${label} changed from ${sh(was)} to ${sh(v)}`); obj[f] = v;
  });
  return out;
}
const APPLY = {
  meeting(d, t) {
    const c = t.contact; S.meetings = S.meetings || [];
    S.meetings.push({ id: uid(), contactId: c.id, title: d.title, date: d.date, time: d.time, duration: d.duration, type: d.meetingType, location: d.location, notes: d.notes });
    log(`Meeting scheduled: ${fmtDate(d.date)} at ${fmtTime(d.time)} (${d.meetingType})`, { contactId: c.id });
    G.leftFor = G.live ? "calendar-live" : "calendar"; if (G.live) endCall(); // Google Calendar takes over the screen
    window.open(gcalLink(d, c), "_blank");
    S.sel.contact = c.id; S.screen = "contact"; return { contact: c };
  },
  editInteraction(d, t) {
    const i = t.item, ch = editLog(i, d, { date: ["date", "Date", fmtDate], meetingType: ["type", "Type"], summary: ["summary", "Summary"], substantive: ["substantive", "Substantive", (v) => v ? "yes" : "no"], outcome: ["outcome", "Outcome"] });
    if (ch.length) log(`Interaction report of ${fmtDate(i.date)} edited by ${OFFICER}: ${ch.join("; ")}`, { contactId: i.contactId, oppId: i.oppId }, !V.typed);
    if (String(d.nextStep || "").trim()) { S.tasks.unshift({ id: uid(), contactId: i.contactId, oppId: i.oppId, text: d.nextStep.trim(), due: d.nextDue, done: false }); log(`Task added: ${d.nextStep.trim()}${d.nextDue ? ", due " + fmtDate(d.nextDue) : ""}`, { contactId: i.contactId, oppId: i.oppId }); }
    S.sel.contact = t.contact.id; S.screen = "contact"; return { contact: t.contact };
  },
  editTask(d, t) {
    const k = t.item, ch = editLog(k, d, { text: ["text", "Task"], due: ["due", "Due date", fmtDate] });
    if (ch.length) log(`Task edited by ${OFFICER}: ${ch.join("; ")}`, { contactId: k.contactId, oppId: k.oppId }, !V.typed);
    S.screen = "tasks"; return { contact: t.contact };
  },
  editPlan(d, t) {
    const a = t.item, o = t.opp, ch = editLog(a, d, { fund: ["fund", "Entity"], campaign: ["campaign", "Campaign"], plannedDate: ["plannedDate", "Planned ask date", fmtDate], amount: ["amount", "Amount", money], askType: ["askType", "Ask type"], participants: ["participants", "Participants"] });
    const r = S.tasks.find(k => k.oppId === o.id && !k.done && /^Make the ask/.test(k.text));
    if (r) { r.text = `Make the ask: ${money(a.amount)} for ${a.fund} on ${fmtDate(a.plannedDate)}`; const due = addDays(a.plannedDate, -7); r.due = due < todayISO() ? todayISO() : due; }
    if (ch.length) log(`Planned ask edited by ${OFFICER}: ${ch.join("; ")}`, { contactId: o.contactId, oppId: o.id }, !V.typed);
    S.sel.opp = o.id; S.screen = "opp"; return t;
  },
  editContact(d, t) {
    const c = t.contact, show = (k, v) => k === "capacity" ? (v ? `${v} (${CAPACITY[v]})` : "not rated") : typeof c[k] === "boolean" || ["permEmail", "permCalls", "permText", "ally", "dnc"].includes(k) ? (v ? "on" : "off") : (v || "blank");
    const label = (k) => (ACTIONS.contact.fields.find(f => f.k === k) || {}).label || k;
    EDIT_KEYS.forEach(k => {
      let v = d[k]; if (["permEmail", "permCalls", "permText", "ally", "dnc"].includes(k)) v = !!v; else v = v == null ? "" : String(v).trim();
      if (k === "capacity") v = v || null;
      if (k === "permSource" && !d.permText) return; // hidden while texting is off; any earlier source is kept
      const was = ["permEmail", "permCalls", "permText", "ally", "dnc"].includes(k) ? !!c[k] : k === "capacity" ? (c[k] || null) : (c[k] || "");
      if (v === was) return;
      if (!v && lockedOff(c, k)) return; // the form disables these, so this only guards a voice draft
      c[k] = v; if (k === "ally" && v) c.allySetBy = OFFICER;
      log(`${label(k)} changed from ${show(k, was)} to ${show(k, v)} by ${OFFICER}`, { contactId: c.id }, !V.typed);
    });
    S.sel.contact = c.id; S.screen = "contact"; return { contact: c };
  },
  contact(d) {
    const ct = { id: uid(), first: d.first, last: d.last, email: d.email, mobile: d.mobile, permEmail: !!d.permEmail, permCalls: !!d.permCalls, permText: !!d.permText,
      permSource: d.permText ? d.permSource : "", howMet: d.howMet, capacity: d.capacity || null, status: "Prospect", added: todayISO(), gifts: [] };
    ct.ally = !!d.ally; ct.dnc = !!d.dnc; if (ct.ally) ct.allySetBy = OFFICER;
    S.contacts.push(ct); log(`Contact added by ${OFFICER}`, { contactId: ct.id });
    if (ct.ally) log(`Ally - Do Not Solicit set by ${OFFICER}`, { contactId: ct.id });
    if (ct.dnc) log(`Do Not Contact set by ${OFFICER}`, { contactId: ct.id });
    if (ct.capacity) log(`Capacity rated ${ct.capacity} (${CAPACITY[ct.capacity]})`, { contactId: ct.id });
    S.sel.contact = ct.id; S.screen = "contact"; return { contact: ct };
  },
  interaction(d, t) {
    const c = t.contact;
    S.interactions.unshift({ id: uid(), contactId: c.id, oppId: t.opp ? t.opp.id : null, date: d.date, type: d.meetingType, summary: d.summary, substantive: !!d.substantive, outcome: d.outcome || "", kind: "meeting" });
    if (d.capacity && d.capacity !== c.capacity) { c.capacity = d.capacity; log(`Capacity rated ${d.capacity} (${CAPACITY[d.capacity]})`, { contactId: c.id }); }
    log(`Interaction report: ${d.meetingType}, ${fmtDate(d.date)}`, { contactId: c.id, oppId: t.opp ? t.opp.id : null });
    if (d.nextStep) S.tasks.unshift({ id: uid(), contactId: c.id, oppId: t.opp ? t.opp.id : null, text: d.nextStep, due: d.nextDue, done: false });
    S.sel.contact = c.id; S.screen = "contact"; return { contact: c };
  },
  task(d, t) {
    const c = t.contact, oppId = d.onOpp && t.opp ? t.opp.id : null;
    S.tasks.unshift({ id: uid(), contactId: c.id, oppId, text: d.text, due: d.due, done: false });
    log(`Task added: ${d.text}${d.due ? ", due " + fmtDate(d.due) : ""}`, { contactId: c.id, oppId });
    if (oppId) { S.sel.opp = oppId; S.screen = "opp"; } else { S.sel.contact = c.id; S.screen = "contact"; }
    return t;
  },
  opportunity(d, t) {
    const c = t.contact;
    const op = { id: uid(), contactId: c.id, name: `${c.last}, ${c.first} - ${YEAR}`, stage: "Qualification", fund: d.fund || null, campaign: d.campaign || null, potential: d.potential, notes: d.notes, asks: [], pledge: null, created: todayISO() };
    S.opps.push(op); log("Opportunity created in Qualification", { contactId: c.id, oppId: op.id });
    S.sel.opp = op.id; S.screen = "opp"; return { contact: c, opp: op };
  },
  plan(d, t) {
    const o = t.opp;
    o.asks.unshift({ fund: d.fund, campaign: d.campaign, plannedDate: d.plannedDate, amount: d.amount, askType: d.askType || "Outright", participants: d.participants, status: "Planned" });
    if (d.fund) o.fund = d.fund; if (d.campaign) o.campaign = d.campaign; /* the opportunity carries the planned ask's entity and campaign (Oct 26: Ara read "entity not set" beside an ask to New Hampshire) */
    o.stage = "Ask Planning"; log(`Ask planned: ${money(d.amount)} for ${d.fund}, ${fmtDate(d.plannedDate)}. Moved to Ask Planning`, { contactId: o.contactId, oppId: o.id });
    const remind = addDays(d.plannedDate, -7); // the reminder is due seven days before the planned ask date
    S.tasks.unshift({ id: uid(), contactId: o.contactId, oppId: o.id, text: `Make the ask: ${money(d.amount)} for ${d.fund} on ${fmtDate(d.plannedDate)}`, due: remind < todayISO() ? todayISO() : remind, done: false, auto: true });
    S.sel.opp = o.id; S.screen = "opp"; return t;
  },
  ask(d, t) {
    const o = t.opp, c = t.contact;
    S.interactions.unshift({ id: uid(), contactId: c.id, oppId: o.id, date: d.date, type: d.meetingType, summary: d.summary, substantive: true, kind: "ask" });
    S.tasks.forEach(k => { if (k.contactId === c.id && /^Make the ask/.test(k.text)) k.done = true; });
    let a = latestAsk(o);
    if (!a || !["Planned", "Made"].includes(a.status)) { a = { fund: d.fund, campaign: "National", amount: d.amount, askType: "Outright", plannedDate: d.date }; o.asks.unshift(a); }
    Object.assign(a, { amount: d.amount, fund: d.fund, status: "Made", askedOn: a.askedOn || d.date });
    const note = askOutcome(o, c, a, d, "Ask recorded");
    S.sel.opp = o.id; S.screen = "opp"; return Object.assign({ note }, t);
  },
  // the investor's answer, when it comes in after the ask meeting (Oct 28): the same outcome logic as recording the ask
  response(d, t) {
    const o = t.opp, c = t.contact, a = t.item || latestAsk(o);
    const note = askOutcome(o, c, a, d, "Response recorded");
    S.sel.opp = o.id; S.screen = "opp"; return Object.assign({ note }, t);
  },
  pledge(d, t) {
    const o = t.opp, c = t.contact;
    o.pledge = { amount: d.amount, fund: d.fund, confirmedBy: d.confirmedBy, confirmedDate: d.confirmedDate, installments: toNum(d.installments) || 1, frequency: d.frequency, firstAmount: d.firstAmount || d.amount, firstDue: d.firstDue };
    let a = latestAsk(o);
    if (!a) { a = { fund: d.fund, campaign: "National", amount: d.amount, askType: "Pledge", plannedDate: d.confirmedDate }; o.asks.unshift(a); }
    a.status = "Accepted";
    o.stage = "Commitment"; c.status = "Investor";
    doneAgreedPledgeTasks(c);
    doneAskCheckTasks(o);
    log(`Pledge recorded: ${money(d.amount)}, confirmed by ${String(d.confirmedBy).toLowerCase()} on ${fmtDate(d.confirmedDate)}. Moved to Commitment`, { contactId: c.id, oppId: o.id });
    S.sel.opp = o.id; S.screen = "opp"; return t;
  },
  gift(d, t) {
    const o = t.opp, c = t.contact;
    // money in while the ask is open is an implied commitment: a one-payment pledge, paid in full by this gift
    o.pledge = { implied: true, amount: d.amount, fund: d.fund, confirmedBy: "Gift received", confirmedDate: d.date, installments: 1, frequency: "One payment", firstAmount: d.amount, firstDue: d.date,
      payments: [{ amount: d.amount, date: d.date, method: d.method }], status: "Paid in full" };
    S.tasks.forEach(k => { if (k.oppId === o.id && /pledge/i.test(k.text)) k.done = true; }); // the money settles any pledge follow-up
    doneAskCheckTasks(o); // and the check on the answer: the money is the answer
    (c.gifts = c.gifts || []).push({ date: d.date, amount: d.amount, fund: d.fund, method: d.method, pledge: true });
    let a = latestAsk(o);
    if (!a) { a = { fund: d.fund, campaign: "National", amount: d.amount, askType: "Outright", plannedDate: d.date }; o.asks.unshift(a); }
    a.status = "Accepted";
    o.stage = "Closed"; o.closed = "Won"; o.closedOn = d.date; c.status = "Investor";
    doneAgreedPledgeTasks(c);
    log(`Implied commitment of ${money(d.amount)} from gift received. Moved to Commitment`, { contactId: c.id, oppId: o.id });
    log(`Gift recorded: ${money(d.amount)} to ${d.fund} by ${String(d.method).toLowerCase()}, ${fmtDate(d.date)}. Closed Won`, { contactId: c.id, oppId: o.id });
    S.sel.opp = o.id; S.screen = "opp"; return t;
  },
  payment(d, t) {
    const o = t.opp, c = t.contact, p = o.pledge;
    p.payments = (p.payments || []).concat([{ amount: d.amount, date: d.date, method: d.method }]);
    S.tasks.forEach(k => { if (k.oppId === o.id && /^Follow up on agreed (pledge|gift)/.test(k.text)) k.done = true; });
    doneAskCheckTasks(o);
    (c.gifts = c.gifts || []).push({ date: d.date, amount: d.amount, fund: p.fund, method: d.method, pledge: true });
    const paid = p.payments.reduce((n, x) => n + (x.amount || 0), 0);
    p.status = paid >= p.amount ? "Paid in full" : "Current";
    o.stage = "Closed"; o.closed = "Won"; o.closedOn = d.date;
    log(`Gift recorded${p.outright ? "" : " on the pledge"}: ${money(d.amount)} by ${String(d.method).toLowerCase()}, ${fmtDate(d.date)}. Closed Won`, { contactId: c.id, oppId: o.id });
    S.sel.opp = o.id; S.screen = "opp"; return t;
  },
  cultivate(d, t) {
    const o = t.opp, c = t.contact, ids = { contactId: c.id, oppId: o.id };
    if (d.decision === "Defer") {
      o.defer = { reason: d.reason, until: d.reconsiderOn || "", subs: subCount(c), on: todayISO() };
      log(`Move to Cultivation deferred: ${String(d.reason || "").trim().replace(/[.\s]+$/, "")}${d.reconsiderOn ? ". Reconsider on " + fmtDate(d.reconsiderOn) : ""}`, ids);
    } else { o.stage = "Cultivation"; delete o.defer; log("Moved to Cultivation (criteria met: capacity rating and a substantive interaction)", ids); }
    S.sel.opp = o.id; S.screen = "opp"; return t;
  }
};

/* ---------- toast ---------- */
let toastTimer = null;
// confetti falling and balloons floating up across the screen, when a payment is recorded on a pledge (bats in spooky mode)
function celebrate() {
  const spooky = spookyMode(), xmas = xmasMode(), colors = xmas ? ["#c62f3b", "#2f8a4a", "#e8c15a", "#a9b8c8", "#1f6b39"] : spooky ? ["#f07b2a", "#8a4fd1", "#2b2233", "#e8b923", "#6fcf5a"] : ["#1f5fbf", "#e8b923", "#d94848", "#2e9d6a", "#8a4fd1", "#f07b2a"], rnd = (a, b) => a + Math.random() * (b - a);
  let h = "";
  for (let i = 0; i < 90; i++) { const w = Math.round(rnd(6, 11)); h += `<i class="cf" style="left:${rnd(0, 100).toFixed(1)}%;width:${w}px;height:${Math.round(w * 0.45)}px;background:${colors[i % colors.length]};animation-delay:${rnd(0, 0.8).toFixed(2)}s;animation-duration:${rnd(2.4, 4).toFixed(2)}s;--r:${Math.round(rnd(-540, 540))}deg;--dx:${Math.round(rnd(-70, 70))}px"></i>`; }
  if (xmas) { spookyCue("won"); spookyOnce("sleigh"); for (let i = 0; i < 9; i++) h += `<b class="bat" style="left:${(3 + i * 10.5 + rnd(0, 4)).toFixed(1)}%;animation-delay:${rnd(0, 1).toFixed(2)}s;animation-duration:${rnd(3.2, 4.6).toFixed(2)}s;--dx:${Math.round(rnd(-60, 60))}px">${["🎁", "⭐", "❄️"][i % 3]}</b>`; } // Christmas mode: gifts, stars and snowflakes rise, Santa's sleigh flies over, "Joy to the World" then "ho ho ho"
  else if (spooky) { spookyCue("won"); for (let i = 0; i < 9; i++) h += `<b class="bat" style="left:${(3 + i * 10.5 + rnd(0, 4)).toFixed(1)}%;animation-delay:${rnd(0, 1).toFixed(2)}s;animation-duration:${rnd(3.2, 4.6).toFixed(2)}s;--dx:${Math.round(rnd(-60, 60))}px">🦇</b>`; } // spooky mode: bats instead of balloons, and an organ sting with a cackle
  else for (let i = 0; i < 9; i++) h += `<b class="bl" style="left:${(3 + i * 10.5 + rnd(0, 4)).toFixed(1)}%;--c:${colors[i % colors.length]};animation-delay:${rnd(0, 1).toFixed(2)}s;animation-duration:${rnd(3.6, 5).toFixed(2)}s;--dx:${Math.round(rnd(-60, 60))}px"></b>`;
  const box = document.createElement("div"); box.className = "party"; box.setAttribute("aria-hidden", "true"); box.innerHTML = h;
  document.body.appendChild(box); setTimeout(() => box.remove(), 6600);
}
function toast(text, undo) {
  const h = document.getElementById("toastHost");
  h.innerHTML = `<div class="toast" role="status"><span>${esc(text)}</span>${undo ? '<button id="undoBtn">Undo</button>' : ""}</div>`;
  if (undo) document.getElementById("undoBtn").onclick = () => { undo(); h.innerHTML = ""; };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { h.innerHTML = ""; }, 6000);
}
