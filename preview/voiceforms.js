"use strict";
// Filling and saving forms by voice: optional fields one at a time, hands-free saves, and the check of hands-free saves (loaded after aratools.js)
// Optional fields, one at a time (Oct 24, after testers found the one long list hard to follow): the app asks each question and fills in each answer itself
const OPT_OFFER = `The required details are in. Before anything else, ask exactly this: "Would you like to add more details? I can take you through them one at a time." If yes, call optional_fields with step start. If no, ask them to check the draft and tap the button.`;
const OPT_STEPS = {
  contact: [
    { k: "capacity", q: (who) => `Capacity rating first. A is $250,000 and up, B is $100,000 to $250,000, C is $25,000 to $100,000, D is $5,000 to $25,000, and E is under $5,000. Which fits ${who}, or shall we skip it?` },
    { k: "howMet", q: (who) => `How did you meet ${who}?` },
    { k: "permText", when: (d) => !!String(d.mobile || "").trim(), q: (who) => `Is it OK to text ${who} on their mobile?` },
    { k: "permSource", when: (d) => !!d.permText, q: (who) => `How did ${who} agree to texts?` },
    { k: "flags", q: (who) => `Last one: should ${who} be marked Ally - Do Not Solicit, or Do Not Contact? Most people are neither.` } ],
  opportunity: [
    { k: "fund", q: () => `Which entity are they most likely to give to? For example Citizens Alliance C3, or one of the C4s or PACs.` },
    { k: "campaign", when: (d) => !!d.fund && campaignsFor(d.fund).length > 1, q: () => { const f = readDraft().fund; return `Which campaign: National, or ${ENTITY_STATE[f]}?`; } },
    { k: "potential", q: () => `What's the potential amount?` },
    { k: "notes", q: () => `Any notes to add?` } ] };
const optEmpty = (v) => v === null || v === undefined || String(v).trim() === "";
const optWho = () => { const d = readDraft(), c = V.target && V.target.contact; return V.action === "contact" ? (d.first || "them") : c ? c.first : "them"; };
function optNext() { // the next question still to ask: skips anything already answered or already on the form
  const d = readDraft(), steps = OPT_STEPS[V.action] || [];
  return steps.find(st => !V.opt.done.includes(st.k) && (!st.when || st.when(d)) && (st.k === "flags" || st.k === "permText" ? true : optEmpty(d[st.k])));
}
function optSet(k, v) { const cur = readDraft(); (V.history = V.history || []).push(Object.assign({}, cur)); cur[k] = v; V.fromVoice.add(k); V.data = prefill(V.action, cur, V.target); renderOverlay(); }
function optParse(k, raw) { // the officer's answer in their words -> the field's value, or null if it can't be read
  const t = String(raw || "").trim(), l = t.toLowerCase().replace(/[’‘]/g, "'");
  if (k === "capacity") return normCap(t.replace(/^(it's|its|make it|let's say|lets say|say|rating|capacity)\s+/i, "").replace(/^(bee|be)\b/i, "B").replace(/^(see|sea|cee)\b/i, "C").replace(/^dee\b/i, "D").replace(/^ee\b/i, "E"));
  if (k === "permText") return /^(no|nope|nah|not)\b|\b(don't|do not|not ok|not okay|shouldn't|can't)\b/.test(l) ? false : /\b(yes|yeah|yep|sure|ok|okay|fine|allowed|permitted|go ahead|of course|absolutely)\b/.test(l) ? true : null;
  if (k === "flags") { const none = /\b(neither|none|no|nope|nah|not)\b/.test(l) && !/\b(ally|do not contact|dnc)\b.*\b(yes)\b/.test(l);
    if (/\b(neither|nor|none)\b/.test(l) || (/^(no|nope|nah)\b/.test(l) && !/\bally\b|contact|solicit/.test(l))) return { ally: false, dnc: false }; // "neither Ally - Do Not Solicit nor Do Not Contact" named both but meant neither (Oct 24)
    const ally = /\bally\b|do not solicit|don't ask|do not ask/.test(l) && !/\bnot (an )?ally\b/.test(l), dnc = /do not contact|don't contact|\bdnc\b/.test(l) && !/\bnot do not contact\b/.test(l);
    if (ally || dnc) return { ally, dnc }; return none ? { ally: false, dnc: false } : null; }
  if (k === "fund") { const { hits } = matchEntity(t); return hits.length === 1 ? hits[0] : null; }
  if (k === "campaign") { const f = readDraft().fund, ok = campaignsFor(f), st = ENTITY_STATE[f];
    if (/\bnational\b/.test(l)) return "National"; if (st && (l.includes(st.toLowerCase()) || /\bstate\b/.test(l))) return st; return null; }
  if (k === "potential") return spokenAmount(t);
  return t || null; // how we met, texting source, notes: their words
}
function optAsk(callId, lead) { // say the next question, or wrap up
  const st = optNext(), A = ACTIONS[V.action];
  if (st) { V.opt.cur = st.k; toolReply(callId, { ok: true, field: st.k, say: `${lead ? lead + " " : ""}Then ask exactly: "${st.q(optWho())}"`, status: "After the answer, call optional_fields with step answer and their words as value (or step skip or stop)." }); return; }
  V.opt = null;
  toolReply(callId, { ok: true, done: true, button: A.saveLabel, status: `${lead ? lead + " " : ""}That was the last optional field. ${G.hands ? "Hands-free mode is on: call save_form with confirmed false now and say the read-back it returns." : `In one short sentence say the details are in, then ask them to check the draft and tap "${A.saveLabel}".`}` });
}
function optStep(callId, data) {
  if (!V || !OPT_STEPS[V.action]) { toolReply(callId, { ok: false, error: "No new contact or new opportunity form is open." }); return; }
  const step = data.step || "answer";
  if (step === "start" || !V.opt) { V.opt = V.opt || { done: [] }; if (step === "start" || !V.opt.cur) { optAsk(callId); return; } }
  if (step === "stop") { V.opt.done = (OPT_STEPS[V.action] || []).map(s => s.k); optAsk(callId, "Fine, no more questions."); return; }
  const k = V.opt.cur; if (!k) { optAsk(callId); return; }
  if (step === "skip") { V.opt.done.push(k); act("step", "optional field skipped: " + k); optAsk(callId, "Skip it and move on."); return; }
  const v = optParse(k, data.value);
  if (v === null) { const st = OPT_STEPS[V.action].find(s => s.k === k);
    toolReply(callId, { ok: false, field: k, error: `The app couldn't read "${data.value || ""}" as an answer to this question.`, say: k === "fund" ? (() => { const { hits } = matchEntity(data.value); return hits.length > 1 ? `Ask which one they mean: ${hits.join(", or ")}.` : `Say you didn't catch which entity. Give the short version: Citizens Alliance C3, C.A. of America Action C4, C.A. Fed PAC, or a state C4 or PAC in Idaho, North Dakota, New Hampshire or Pennsylvania. Ask which.`; })() : `Say in a few words that you didn't catch that, then ask again: "${st.q(optWho())}"` }); return; }
  if (k === "flags") { optSet("ally", v.ally); optSet("dnc", v.dnc); } else optSet(k, v);
  V.opt.done.push(k); act("step", "optional field " + k + ": " + JSON.stringify(v));
  const heard = k === "capacity" ? `Rating ${v} is on the form.` : k === "permText" ? (v ? "Texting is now permitted on the form." : "Texting stays off.") : k === "flags" ? (v.ally || v.dnc ? `${[v.ally && "Ally - Do Not Solicit", v.dnc && "Do Not Contact"].filter(Boolean).join(" and ")} is now on the form.` : "Neither flag is set.") : k === "potential" ? `${money(v)} is on the form.` : k === "fund" ? (campaignsFor(v).length === 1 ? `${v} is on the form, with the National campaign, its only campaign.` : `${v} is on the form.`) : k === "campaign" ? `The ${v} campaign is on the form.` : "That's on the form.";
  optAsk(callId, `${heard} Acknowledge it in two or three words.`);
}
// a few words of human reaction to what was just saved (good news, a setback), said before Ara confirms the save
function savedMood(action, d) {
  if (action === "pledge") return `Open with a short, warm congratulation such as "Congrats!", "Nice job!" or "Well done!" (pick one, vary it).`;
  if (action === "payment" || action === "gift") return `Open by celebrating in a few happy words, such as "Woohoo, money in the door!" or "That's a win, nice work!" (vary it).`;
  if (action === "ask" && d.response === "Accepted") return `Open with a short, delighted reaction, such as "Yes! That's fantastic news." (vary it).`;
  if (action === "ask" && d.response === "Countered") return `Open with a short upbeat note that a counter is still progress, such as "A counter is still a yes in the making." (vary it).`;
  if (action === "ask" && d.response === "Declined") return `Open with a few words of genuine sympathy, such as "Ah, that's a shame." Keep it kind and brief, no forced cheer.`;
  if (action === "interaction" && d.substantive && !NO_NEXT_STEP.includes(d.outcome)) return `Open with a short friendly reaction, such as "Sounds like a good meeting!" (vary it).`;
  return "";
}
function grokSaved(action, r, d = {}) {
  if (!G.live) return;
  const who = r && r.contact ? nameOf(r.contact) : "";
  const hasOpp = r && r.contact && openOpp(r.contact.id);
  const o = r && r.opp, closed = o && o.stage === "Closed" ? ` The opportunity is now Closed ${o.closed}.` : "";
  const line = `${ACTIONS[action].saved}${who ? " for " + who : ""}${closed ? " (Closed " + o.closed + ")" : ""}`;
  (G.saves = G.saves || []).push(line); G.savedAt = Date.now(); G.savedLine = line; recent("App", "Saved: " + line); // a reconnect after this must not save it again
  const hint = action === "contact" ? `for example log a meeting with ${who} or create an opportunity` : action === "interaction" ? (hasOpp ? (hasOpp.stage === "Qualification" ? "for example move the opportunity to Cultivation if it's ready, or log another meeting" : hasOpp.stage === "Cultivation" ? "for example plan an ask or log another meeting" : "for example add a task or log another meeting") : "for example create an opportunity or log another meeting") : "";
  whenIdle("instr");
  if (G.hfTry) { const undo = !G.undoSaid; G.undoSaid = true; // the undo reminder once per conversation: every save repeating it got tiresome (Oct 24)
    G.hfTry.say = `The app saved it: ${ACTIONS[action].saved.toLowerCase()}${who ? " for " + who : ""}.${closed} ${savedMood(action, d) ? savedMood(action, d) + " Then say" : "Say"} in a few words that it's saved (for example "${savedShort(action, who)}")${undo ? `, then "Say undo if that's wrong."` : ""}, then ${nextAsk(r, closed)}`; return; }
  notice(`The officer just tapped ${ACTIONS[action].saveLabel} and the app saved it: ${ACTIONS[action].saved.toLowerCase()}${who ? " for " + who : ""}.${closed} ${savedMood(action, d) ? savedMood(action, d) + " Then say" : "Start by saying"} out loud that you saw the save, in a few words (for example "I see ${savedShort(action, who).replace(/\.$/, "").toLowerCase()}."), even if the officer has started talking; then ${nextAsk(r, closed, hint)}`);
}
// "Planned ask saved for Jen." (the item's name once, not "Saved: Planned ask saved")
const savedShort = (action, who) => `${ACTIONS[action].saved}${who ? " for " + who.split(" ")[0] : ""}.`;
// after a save, offer the contact's one next step (the same one the record's Next: line shows), or just ask what's next
function nextAsk(r, closed, hint) {
  const c = r && r.contact, n = !closed && c && typeof journeyNext === "function" ? journeyNext(c) : null;
  if (n && n.line && !/^(nothing|deferred)/.test(n.line)) return `offer that next step in your own words, for example "Next is to ${n.line}. Want to do that now?" (one short question, nothing about stopping).`;
  return `ask what's next in a few words, for example "What's next?"${hint ? " (if they're unsure: " + hint + ")" : ""} (one short question, nothing about stopping).`;
}
document.addEventListener("click", (e) => { const a = e.target.closest("[data-act3]"); if (!a) return;
  if (a.dataset.act3 === "end") endCall("officer tapped End");
  else if (a.dataset.act3 === "hands") { setHandsFree(!G.hands);
    notice(G.hands ? `The officer tapped Hands-free, so hands-free mode is on. Say only "Hands-free is on. I'll read each form back and save it when you say yes."` : `The officer tapped to turn hands-free mode off. Say only "Hands-free is off. You'll tap Save yourself again."`); } });
// Hands-free (driving) mode: Ara saves a finished form after reading it back and hearing the officer's own yes. It lasts until the call ends.
const CAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17h14v-5l-2-5H7l-2 5z"/><path d="M5 12h14"/><circle cx="8" cy="17" r="1.6"/><circle cx="16" cy="17" r="1.6"/></svg>';
const HF_MONEY = ["pledge", "gift", "payment"];
const HF_YES = /\b(yes|yeah|yep|yup|ya|correct|right|sure|save|go ahead|do it|confirm|confirmed|sounds good|perfect|ok|okay|absolutely|definitely)\b/;
// a no is an answer that opens with no or wait, or asks not to save or to change something; "I don't think you needed to say that, but yes" is still a yes
const HF_NO = /^(no|nope|nah|wait|hold on|hang on|not yet|stop|cancel)\b|\b(don't|dont|do not|not|never) (save|do it|go ahead)|\b(not yet|hold on|hang on|wait a|change|wrong|incorrect|isn't right|not right|that's off|fix)\b/;
const hfYes = (text) => { const t = String(text).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim(); return HF_YES.test(t) && !HF_NO.test(t); };
function setHandsFree(on) {
  G.hands = !!on && G.live; G.saveCheck = null; act("step", "hands-free " + (G.hands ? "on" : "off")); vlog("hands-free " + (G.hands ? "on" : "off"));
  if (V && document.getElementById("draftForm")) { V.data = readDraft(); renderOverlay(); } // the form's save note changes
  paintCall(); whenIdle("instr"); toast(G.hands ? "Hands-free on: Ara saves when you say yes" : "Hands-free off: tap Save yourself");
}
// what Ara reads back before saving: the form, who it's for, and each filled-in field (long text cut short)
function hfReadback() {
  const A = ACTIONS[V.action], d = readDraft(), who = V.target && V.target.contact ? nameOf(V.target.contact) : "";
  const parts = A.fields.filter(f => !f.fixed).map(f => { const v = d[f.k];
    if (v === null || v === undefined || v === "") return "";
    if (f.type === "bool") return v && !["permEmail", "permCalls"].includes(f.k) ? f.label : ""; // email and calls are on by default
    if (f.type === "area") return `${f.label}: noted`; // long text is on the form; reading it out made the read-back about 13 s (Oct 24)
    let x = f.type === "money" ? money(v) : f.type === "date" ? fmtDate(v) : String(v); const w = x.split(/\s+/); if (w.length > 14) x = w.slice(0, 14).join(" ") + "…";
    return `${f.label}: ${x}`; }).filter(Boolean);
  return `${A.title}${who ? " for " + who : ""}.${parts.length ? " " + parts.join("; ") + "." : ""}`;
}
// the officer's next words after Ara's question (the transcript can land a moment after her tool call)
function hfHeardAfter(n, ms = 2500) { return new Promise(res => { const t0 = Date.now(); (function poll() { if ((G.heardN || 0) > n) return res(G.lastHeard); if (Date.now() - t0 > ms) return res(null); setTimeout(poll, 100); })(); }); }
async function hfSave(callId, data) {
  if (!V) { const recentSave = G.savedAt && Date.now() - G.savedAt < 3 * 60e3;
    toolReply(callId, recentSave ? { ok: true, saved: true, already: true, status: `That form was already saved (${G.savedLine}); it closed when it saved. Say in a few words that it's saved, then ask what's next. Don't open it again.` } : { ok: false, saved: false, error: "No form is open, so there's nothing to save." }); return; }
  const A = ACTIONS[V.action];
  if (!G.hands) { toolReply(callId, { ok: false, saved: false, error: `Hands-free mode is off, so you can't save. Ask the officer to check the draft and tap "${A.saveLabel}". If they're driving, they can say "hands-free mode".` }); return; }
  if (oppNeedsCampaign(V.action, readDraft())) { const f = readDraft().fund; toolReply(callId, { ok: false, saved: false, error: `Not ready: ask which campaign first, ${campaignsFor(f).join(" or ")} (${f} has both). Fill it in with the draft tool, then read back.` }); return; }
  if (V.action === "meeting") { toolReply(callId, { ok: false, saved: false, error: "Scheduling a meeting finishes in Google Calendar, which needs the screen. Say it's kept as a draft for when they've parked." }); return; }
  const key = V.action + JSON.stringify(readDraft()), c = G.saveCheck;
  if (data.confirmed !== true || !c || c.key !== key) {
    G.saveCheck = { key, step: "read", n: G.heardN || 0 }; paintCall();
    toolReply(callId, { ok: true, saved: false, read_back: `${hfReadback()} Shall I save it?`, instructions: "Say read_back word for word and nothing else (never read these instructions or the word read_back aloud), then wait. Only after the officer says yes, call save_form again with confirmed true. If they want a change, update the draft first." }); return;
  }
  const heard = await hfHeardAfter(c.n);
  if (!V || G.saveCheck !== c) { toolReply(callId, { ok: false, saved: false, error: "The form changed while waiting. Nothing was saved." }); return; }
  if (!heard) { toolReply(callId, { ok: false, saved: false, error: "Not saved: the officer hasn't answered yet. Wait for them to say yes, then call save_form with confirmed true." }); return; }
  if (!hfYes(heard.text)) { c.n = G.heardN; toolReply(callId, { ok: false, saved: false, error: `Not saved: the officer said "${heard.text}", which isn't a clear yes. In one short sentence, ask whether to save it or what to change. If they then say yes, call save_form with confirmed true again (no new read-back needed).` }); return; }
  if (HF_MONEY.includes(V.action) && c.step === "read") { c.step = "amount"; c.n = G.heardN; paintCall();
    toolReply(callId, { ok: true, saved: false, read_back: `Just to be sure, the amount is ${money(readDraft().amount)}. Is that right?`, instructions: "Money gets a second check. Say read_back word for word and nothing else, then wait. Only after the officer says yes, call save_form again with confirmed true." }); return; }
  const before = S.history.length, action = V.action; G.hfTry = {};
  try { saveDraft(); } catch (e) { G.hfTry.msg = String(e); }
  const r = G.hfTry; G.hfTry = null; G.saveCheck = null;
  if (V && V.action === action) { paintCall(); const el = document.getElementById("draftErr");
    toolReply(callId, { ok: false, saved: false, error: `Not saved. ${r.msg || (el && el.textContent) || "The form isn't complete."} Ask for what's missing in one short question, update the draft, then read it back again.` }); return; }
  S.history.slice(0, S.history.length - before).forEach(x => { x.hf = true; }); save(); render(); paintCall();
  act("step", "hands-free save: " + A.saved);
  toolReply(callId, { ok: true, saved: true, say: r.say || `Say in a few words that it's saved, then ask "What's next?"` });
}
// hands-free saves wait in Needs attention until the officer has looked at them
const hfUnchecked = () => S.history.filter(x => x.hf && !x.hfChecked);
// the save in words that start with whose it was, e.g. "George Bertie's capacity rated B ($100k to $250k)"
function hfLine(x) {
  const c = contactById(x.contactId), t = x.text || ""; if (!c) return t;
  const who = `${c.first} ${c.last}`, lc = t.charAt(0).toLowerCase() + t.slice(1);
  if (/^Contact added/.test(t)) return `${who} added as a contact${t.slice(13)}`;
  if (/^(Capacity|Ally|Do Not Contact|Task|Interaction report|Planned ask|Meeting)\b/.test(t) || / changed from /.test(t)) return `${who}'s ${lc}`;
  return `${who}: ${t}`;
}
// where to correct a hands-free save: the edit form when there is one, otherwise the record it belongs to
function hfFix(x) {
  const c = contactById(x.contactId), o = x.oppId ? oppById(x.oppId) : null, t = x.text || "";
  if (!c) return null;
  const base = { contact: c.id, screen: "contact" }, who = `${c.first} ${c.last}`;
  if (/^Interaction report/.test(t)) { const i = S.interactions.find(i => i.contactId === c.id && i.kind !== "ask" && t.startsWith(`Interaction report: ${i.type}, ${fmtDate(i.date)}`))
    || S.interactions.find(i => i.contactId === c.id && i.kind !== "ask");
    if (i) return { ...base, form: "editInteraction", item: i.id, label: `Edit ${who}'s interaction report` }; }
  if (/^Task (added|edited)/.test(t)) { const k = S.tasks.find(k => k.contactId === c.id && !k.done && t.includes(k.text)) || S.tasks.find(k => k.contactId === c.id && !k.done);
    if (k) return { ...base, form: "editTask", item: k.id, label: `Edit ${who}'s task` }; }
  if (/^(Ask planned|Planned ask edited)/.test(t) && o && o.asks.some(a => a.status === "Planned")) return { ...base, opp: o.id, screen: "opp", form: "editPlan", label: `Edit the planned ask: ${o.name}` };
  if (o) return { ...base, opp: o.id, screen: "opp", label: `Open the opportunity: ${o.name}` };
  if (/^Meeting scheduled/.test(t)) return { ...base, label: `Open ${who}` };
  return { ...base, form: "editContact", label: `Edit ${who}'s contact` };
}
function hfCheckModal() {
  const xs = hfUnchecked(), h = document.getElementById("modal"); if (!xs.length) return;
  h.innerHTML = `<div class="scrim center"><div class="wmodal" role="dialog" aria-modal="true" aria-labelledby="hfTitle">
    <h2 id="hfTitle">Check your hands-free saves</h2>
    <p>${esc(botName())} saved these while you were hands-free. If one is wrong, tap the link under it to fix it. A gift or pledge is corrected by the Chief Gift Officer.</p>
    <div class="hf-list">${xs.map((x, n) => { const f = hfFix(x); return `<div class="row"><div class="t" style="font-size:14px">${esc(hfLine(x))}<div class="s">${new Date(x.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>${f ? `<button type="button" class="hf-fix" data-hf="${n}">${esc(f.label)} <span aria-hidden="true">›</span></button>` : ""}</div></div>`; }).join("")}</div>
    <button class="btn blue" id="hfOk">They're right</button><button class="btn quiet" id="hfX">Not now</button></div></div>`;
  document.getElementById("hfX").onclick = () => { h.innerHTML = ""; };
  h.querySelectorAll("[data-hf]").forEach(b => { b.onclick = () => { const f = hfFix(xs[+b.dataset.hf]); if (!f) return; h.innerHTML = "";
    if (f.contact) S.sel.contact = f.contact; if (f.opp) S.sel.opp = f.opp; G.hfBack = true; go(f.screen); if (f.form) { openForm(f.form, f.contact, f.item); if (V) G.hfForm = true; } }; });
  document.getElementById("hfOk").onclick = () => { xs.forEach(x => { x.hfChecked = true; }); save(); h.innerHTML = ""; render(); toast("Hands-free saves checked"); };
}
