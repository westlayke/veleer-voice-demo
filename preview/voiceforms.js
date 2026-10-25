"use strict";
// Filling and saving forms by voice: optional fields one at a time, hands-free saves, and the check of hands-free saves (loaded after aratools.js)
// Optional fields, one at a time (Oct 24, after testers found the one long list hard to follow): the app asks each question and fills in each answer itself
const SUBST_Q = "Was it a substantive interaction, one that moved the relationship forward?";
// the officer's yes or no to the substantive question, from their last line (Grok sometimes doesn't pass it on)
function officerSubstantive() { const t = ((G.recent || []).filter(l => l.startsWith("Officer: ")).slice(-1)[0] || "").slice(9); if (!t) return null;
  if (/\b(not|no|wasn't|isn't)\b/i.test(t) && !/\bbut yes\b/i.test(t)) return false; return hfYes(t) || /\bsubstantive\b/i.test(t) ? true : null; }
const OPT_OFFER = `The required details are in. Before anything else, ask exactly this: "Would you like to add more details? I can take you through them one at a time." If yes, call optional_fields with step start. If no, ask them to check the draft and tap the button.`;
const OPT_STEPS = {
  contact: [
    { k: "capacity", q: (who, next) => `${next ? `Next, ${who}'s capacity rating, which an opportunity needs.` : "Capacity rating first."} A is $250,000 and up, B is $100,000 to $250,000, C is $25,000 to $100,000, D is $5,000 to $25,000, and E is under $5,000. Which fits ${who}, or shall we skip it?` },
    { k: "howMet", q: (who) => `How did you meet ${who}?` },
    { k: "permText", when: (d) => !!String(d.mobile || "").trim(), q: (who) => `Is it OK to text ${who} on their mobile?` },
    { k: "permSource", when: (d) => !!d.permText, q: (who) => `How did ${who} agree to texts?` },
    { k: "flags", q: (who) => `Last one: should ${who} be marked Ally - Do Not Solicit, or Do Not Contact? Most people are neither.` } ],
  opportunity: [
    { k: "fund", q: () => `Which entity are they most likely to give to? For example Citizens Alliance C3, or one of the C4s or PACs.` },
    { k: "campaign", when: (d) => !!d.fund && campaignsFor(d.fund).length > 1, q: () => { const f = readDraft().fund; return `Which campaign: National, or ${ENTITY_STATE[f]}?`; } },
    { k: "potential", q: () => `What's the potential amount?` },
    { k: "notes", q: () => `Any notes to add?` } ] };
// words that name each question, for going back to it
const OPT_WORDS = { capacity: /capacity|rating|rated/, howMet: /how (we|you|i) met|met|meet/, permText: /text/, permSource: /agree|source/, flags: /flag|ally|do not|dnc|solicit/, fund: /entit|fund|c3|c4|pac/, campaign: /campaign/, potential: /amount|potential|how much|dollar/, notes: /note/ };
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
// "Would you like to add more details?": the app's own line (Oct 25: asked for the fields an opportunity needs first, then this)
function offerMore(callId, said) {
  const A = ACTIONS[V.action]; V.askedOptional = true;
  toolReply(callId, { ok: true, button: A.saveLabel, ask_exactly: `${said ? said + " " : ""}Would you like to add more details? I can take you through them one at a time.`,
    next: `If yes, call optional_fields with step start. If no, ${G.hands && V.action !== "meeting" ? "call save_form with confirmed false" : `ask them to check the draft and tap "${A.saveLabel}"`}.` });
}
function optAsk(callId, said) { // the app itself says what it heard and the next question, word for word (Oct 24: Ara read its guidance aloud); or wrap up
  const A = ACTIONS[V.action];
  if (V.opt && V.opt.only && (V.opt.done.includes(V.opt.only) || !optEmpty(readDraft()[V.opt.only]))) { V.opt = null; offerMore(callId, said); return; } // just the one field that the next step needs, then the offer
  const st = optNext();
  if (st) { V.opt.cur = st.k; toolReply(callId, { ok: true, field: st.k, ask_exactly: `${said ? said + " " : ""}${st.q(optWho(), V.opt.only === st.k)}`, next: "After the officer answers, call optional_fields with step answer and their words as value (or step skip, back or stop)." }); return; }
  V.opt = null;
  if (G.hands && V.action !== "meeting") { hfSave(callId, { confirmed: false }, said); return; } // the app reads the finished draft back itself
  toolReply(callId, { ok: true, done: true, button: A.saveLabel, status: `${said ? `Start with "${said}" ` : ""}That was the last optional field. In one short sentence say the details are in, then ask them to check the draft and tap "${A.saveLabel}".` });
}
function optStep(callId, data) {
  if (!V || !OPT_STEPS[V.action]) { toolReply(callId, { ok: false, error: "No new contact or new opportunity form is open." }); return; }
  const step = data.step || "answer";
  if (step === "start" || !V.opt) { V.opt = { done: V.opt ? V.opt.done : [] }; if (step === "start" || !V.opt.cur) { optAsk(callId); return; } } // start: all the questions, not just the one
  if (step === "stop") { V.opt.done = (OPT_STEPS[V.action] || []).map(s => s.k); optAsk(callId, "No more questions, then."); return; }
  if (step === "back") { // "let's go back and set the entity": that question again, or its answer if they gave one
    const steps = OPT_STEPS[V.action], f = String(data.field || data.value || "").toLowerCase();
    const want = steps.find(st => OPT_WORDS[st.k] && OPT_WORDS[st.k].test(f)) || (V.opt.cur && steps[Math.max(0, steps.findIndex(st => st.k === V.opt.cur) - 1)]);
    if (!want) { toolReply(callId, { ok: false, error: "Which question? Ask the officer, then call again with field.", fields: steps.map(st => st.k) }); return; }
    V.opt.done = V.opt.done.filter(k => k !== want.k && !(want.k === "fund" && k === "campaign")); V.opt.cur = want.k; act("step", "optional fields: back to " + want.k);
    if (data.value && !OPT_WORDS[want.k].test(String(data.value).toLowerCase().trim()) || (data.value && want.k === "fund" && matchEntity(data.value).hits.length)) { data = { step: "answer", value: data.value }; }
    else { toolReply(callId, { ok: true, field: want.k, ask_exactly: `Sure, back to that. ${want.q(optWho())}`, next: "After the officer answers, call optional_fields with step answer." }); return; }
  }
  let k = V.opt.cur; if (!k) { optAsk(callId); return; }
  // an answer that fits an earlier question better ("it's one of the New Hampshire entities" while the amount was asked, Oct 24): take it for that one
  if (k !== "fund" && V.opt.done.includes("fund") && OPT_STEPS[V.action].some(st => st.k === "fund") && optEmpty(readDraft().fund) && optParse(k, data.value) === null && matchEntity(data.value || "").hits.length) {
    act("step", "optional fields: answer taken for the entity"); V.opt.done = V.opt.done.filter(x => x !== "fund" && x !== "campaign"); V.opt.cur = k = "fund"; }
  if (step === "skip") { V.opt.done.push(k); act("step", "optional field skipped: " + k); optAsk(callId, "No problem."); return; }
  const v = optParse(k, data.value);
  if (v === null) { const st = OPT_STEPS[V.action].find(s => s.k === k);
    toolReply(callId, { ok: false, field: k, error: `The app couldn't read "${data.value || ""}" as an answer to this question.`, say: k === "fund" ? (() => { const { hits } = matchEntity(data.value); return hits.length > 1 ? `Ask which one they mean: ${hits.join(", or ")}.` : `Say you didn't catch which entity. Give the short version: Citizens Alliance C3, C.A. of America Action C4, C.A. Fed PAC, or a state C4 or PAC in Idaho, North Dakota, New Hampshire or Pennsylvania. Ask which.`; })() : `Say in a few words that you didn't catch that, then ask again: "${st.q(optWho())}"` }); return; }
  if (k === "flags") { optSet("ally", v.ally); optSet("dnc", v.dnc); } else optSet(k, v);
  V.opt.done.push(k); act("step", "optional field " + k + ": " + JSON.stringify(v));
  const heard = k === "capacity" ? `Rating ${v} is on the form.` : k === "permText" ? (v ? "Texting is now permitted on the form." : "Texting stays off.") : k === "flags" ? (v.ally || v.dnc ? `${[v.ally && "Ally - Do Not Solicit", v.dnc && "Do Not Contact"].filter(Boolean).join(" and ")} is now on the form.` : "Neither flag is set.") : k === "potential" ? `${money(v)} is on the form.` : k === "fund" ? (campaignsFor(v).length === 1 ? `${v} is on the form, with the National campaign, its only campaign.` : `${v} is on the form.`) : k === "campaign" ? `The ${v} campaign is on the form.` : "That's on the form.";
  optAsk(callId, heard);
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
  G.saveAck = { at: Date.now(), action, who, next: nextAsk(r, closed, hint) };
  guide(`The officer just tapped ${ACTIONS[action].saveLabel} and the app saved it: ${ACTIONS[action].saved.toLowerCase()}${who ? " for " + who : ""}.${closed} ${savedMood(action, d) ? savedMood(action, d) + " Then say" : "Start by saying"} out loud that you saw the save, in a few words (for example "I see ${savedShort(action, who).replace(/\.$/, "").toLowerCase()}."), even if the officer has started talking; then ${nextAsk(r, closed, hint)}`);
}
// "Planned ask saved for Jen." (the item's name once, not "Saved: Planned ask saved")
// a tapped save Ara talked past (Oct 24: the officer said "uh, yes" right after tapping, and Ara answered "go ahead and tap it"):
// if her first reply after the save doesn't mention it, tell her again, once
function saveAckCheck(text) {
  const a = G.saveAck; if (!a || Date.now() - a.at < 300) return; if (text === G.lastForcedText) return; /* the app's own scripted line, not Ara's reply */ G.saveAck = null;
  if (/\b(sav\w*|see|saw|got it|done|recorded|logged|on record|updated|changed|nice|great|congrat\w*|well done)\b/i.test(text) && !/\b(tap|press)\b.*\bsave\b/i.test(text)) return;
  act("step", "Ara missed the tapped save: told her again"); vlog("Ara missed the tapped save: told her again");
  guide(`Correction: the officer already tapped ${ACTIONS[a.action].saveLabel} and it IS saved (${ACTIONS[a.action].saved.toLowerCase()}${a.who ? " for " + a.who : ""}). Don't ask them to tap it. Say in a few words that you see it's saved, then ${a.next}`);
}
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
    hfAnnounce(); } });
// Hands-free (driving) mode: Ara saves a finished form after reading it back and hearing the officer's own yes. It lasts until the call ends.
const CAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17h14v-5l-2-5H7l-2 5z"/><path d="M5 12h14"/><circle cx="8" cy="17" r="1.6"/><circle cx="16" cy="17" r="1.6"/></svg>';
const HF_MONEY = ["pledge", "gift", "payment"];
const HF_YES = /\b(yes|yeah|yep|yup|ya|correct|right|sure|save|go ahead|do it|confirm|confirmed|sounds good|perfect|ok|okay|absolutely|definitely)\b/;
// a no is an answer that opens with no or wait, or asks not to save or to change something; "I don't think you needed to say that, but yes" is still a yes
const HF_NO = /^(no|nope|nah|wait|hold on|hang on|not yet|stop|cancel)\b|\b(don't|dont|do not|not|never) (save|do it|go ahead)|\b(not yet|hold on|hang on|wait a|change|wrong|incorrect|isn't right|not right|that's off|fix)\b/;
const hfYes = (text) => { const t = String(text).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim(); return HF_YES.test(t) && !HF_NO.test(t); };
// what Ara says when hands-free goes on or off, then she carries on: "Say only" left her silent mid-form (Oct 24: the officer waited 30 s for the first-name question)
function hfSwitchLine(on) {
  const q = [...(G.recent || [])].reverse().find(l => !l.startsWith("Officer: ") && !l.startsWith("App: ") && /\?$/.test(l.trim()));
  const go = V && ACTIONS[V.action] ? ` Then, without waiting, carry on with the ${ACTIONS[V.action].title} form: ask the question it still needs${q ? ` (you last asked: "${q.replace(/^[^:]+: /, "")}")` : ""}.` : " Then ask what they'd like to do.";
  return (on ? `Say "Hands-free is on. I'll read back all the information on the form and save it when you say yes."` : `Say "Hands-free is off. You'll tap Save yourself again."`) + go;
}
// the hands-free line, word for word, then Ara goes on with the form
function hfAnnounce() {
  const on = G.hands, line = on ? "Hands-free is on. I'll read back all the information on the form and save it when you say yes." : "Hands-free is off. You'll tap Save yourself again.";
  const q = [...(G.recent || [])].reverse().find(l => !l.startsWith("Officer: ") && !l.startsWith("App: ") && /\?$/.test(l.trim()));
  // the follow-up is in the same scripted line: the form's last question, or what they'd like to do (Oct 25: a second turn after the line never came)
  const text = `${line} ${V && ACTIONS[V.action] ? (q ? (q.replace(/^[^:]+: /, "").trim().match(/[^.!?]*\?$/) || [""])[0].trim() : "") : "What would you like to do?"}`.trim();
  const go = hfSwitchLine(on).replace(/^Say "[^"]*"\.?\s*Then,?\s*/, "");
  forceSay(text, V && !q ? `The app just said "${text}" in your voice; don't say it again. Now ${go.charAt(0).toLowerCase() + go.slice(1)}` : null, hfSwitchLine(on));
}
function setHandsFree(on) {
  G.hands = !!on && G.live; G.saveCheck = null; act("step", "hands-free " + (G.hands ? "on" : "off")); vlog("hands-free " + (G.hands ? "on" : "off"));
  if (V && document.getElementById("draftForm")) { V.data = readDraft(); renderOverlay(); } // the form's save note changes
  paintCall(); whenIdle("instr"); toast(G.hands ? "Hands-free on: Ara saves when you say yes" : "Hands-free off: tap Save yourself");
}
// what Ara reads back before saving: the form, who it's for, and each filled-in field (long text cut short)
function hfReadback() {
  const A = ACTIONS[V.action], d = readDraft(), who = V.target && V.target.contact ? nameOf(V.target.contact) : "";
  // the Cultivation decision gets its meaning first (Carverhill, Oct 25)
  const lead = V.action === "cultivate" && d.decision !== "Defer" && who ? `Moving ${who.split(" ")[0]} to Cultivation means you, as the gift officer, believe they're ready to be pursued for a gift. ` : "";
  const parts = A.fields.filter(f => !f.fixed).map(f => { const v = d[f.k];
    if (v === null || v === undefined || v === "") return "";
    if (f.k === "substantive") return `Substantive: ${v ? "yes" : "no"}`; // always said: it decides whether the opportunity can move on
    if (f.type === "bool") return v && !["permEmail", "permCalls"].includes(f.k) ? f.label : ""; // email and calls are on by default
    if (f.type === "area") return `${f.label}: noted`; // long text is on the form; reading it out made the read-back about 13 s (Oct 24)
    let x = f.type === "money" ? money(v) : f.type === "date" ? dateSaid(v).replace(/ \((today|tomorrow|yesterday)\)$/, ", $1") : String(v); const w = x.split(/\s+/); if (w.length > 14) x = w.slice(0, 14).join(" ") + "…";
    return `${f.label}: ${x}`; }).filter(Boolean);
  return `${lead}${A.title}${who ? " for " + who : ""}.${parts.length ? " " + parts.join("; ") + "." : ""}`;
}
// the officer's next words after Ara's question (the transcript can land a moment after her tool call)
function hfHeardAfter(n, ms = 2500) { return new Promise(res => { const t0 = Date.now(); (function poll() { if ((G.heardN || 0) > n) return res(G.lastHeard); if (Date.now() - t0 > ms) return res(null); setTimeout(poll, 100); })(); }); }
async function hfSave(callId, data, lead) {
  if (!V) { const recentSave = G.savedAt && Date.now() - G.savedAt < 3 * 60e3;
    toolReply(callId, recentSave ? { ok: true, saved: true, already: true, status: `That form was already saved (${G.savedLine}); it closed when it saved. Say in a few words that it's saved, then ask what's next. Don't open it again.` } : { ok: false, saved: false, error: "No form is open, so there's nothing to save." }); return; }
  const A = ACTIONS[V.action];
  // the optional questions are still going (Oct 24: Ara jumped to the read-back before the amount and notes)
  if (V.opt && V.opt.cur && OPT_STEPS[V.action] && optNext()) { const st = optNext(); V.opt.cur = st.k; toolReply(callId, { ok: false, saved: false, field: st.k, ask_exactly: `Not yet, a couple of questions first. ${st.q(optWho())}`, error: "The optional questions aren't finished; the app asked the next one. After the answer, call optional_fields with step answer (or skip or stop)." }); return; }
  if (!G.hands) { toolReply(callId, { ok: false, saved: false, error: `Hands-free mode is off, so you can't save. Ask the officer to check the draft and tap "${A.saveLabel}". If they're driving, they can say "hands-free mode".` }); return; }
  if (oppNeedsCampaign(V.action, readDraft())) { const f = readDraft().fund; toolReply(callId, { ok: false, saved: false, error: `Not ready: ask which campaign first, ${campaignsFor(f).join(" or ")} (${f} has both). Fill it in with the draft tool, then read back.` }); return; }
  if (V.action === "meeting") { toolReply(callId, { ok: false, saved: false, error: "Scheduling a meeting finishes in Google Calendar, which needs the screen. Say it's kept as a draft for when they've parked." }); return; }
  // an interaction report is never read back without the substantive answer (Oct 25: saved as not substantive, never asked)
  if (V.action === "interaction" && !V.fromVoice.has("substantive")) {
    const v = V.askedSubst ? officerSubstantive() : null;
    if (v === null) { V.askedSubst = true; toolReply(callId, { ok: false, saved: false, field: "substantive", ask_exactly: `${lead ? lead + " " : ""}One more thing. ${SUBST_Q}`, error: "Not read back yet: the app asked whether it was substantive. After the answer, call show_interaction_draft with substantive true or false." }); return; }
    const cur = readDraft(); cur.substantive = v; V.fromVoice.add("substantive"); V.data = prefill(V.action, cur, V.target); renderOverlay(); act("step", `substantive ${v}, from the officer's words`);
  }
  { const d = readDraft(); if ((needsNextStep(V.action, d, V.target) || (V.action === "ask" && d.response && d.response !== "Declined")) && (optEmpty(d.nextStep) || optEmpty(d.nextDue))) {
    toolReply(callId, { ok: false, saved: false, field: "nextStep", ask_exactly: `${lead ? lead + " " : ""}What's the next step, and when is it due?`, error: "Not read back yet: a substantive interaction (or an ask that wasn't declined) needs a next step and its due date. After the answer, call the draft tool with nextStep and nextDue." }); return; } }
  const key = V.action + JSON.stringify(readDraft()), c = G.saveCheck;
  if (data.confirmed !== true || !c || c.key !== key) {
    G.saveCheck = { key, step: "read", n: G.heardN || 0 }; paintCall();
    toolReply(callId, { ok: true, saved: false, read_back: `${lead ? lead + " " : ""}${hfReadback()} Shall I save it?`, next: "The app said read_back aloud. After the officer's yes, call save_form again with confirmed true; if they want a change, update the draft first." }); return;
  }
  const heard = await hfHeardAfter(c.n);
  if (!V || G.saveCheck !== c) { toolReply(callId, { ok: false, saved: false, error: "The form changed while waiting. Nothing was saved." }); return; }
  if (!heard) { toolReply(callId, { ok: false, saved: false, error: "Not saved: the officer hasn't answered yet. Wait for them to say yes, then call save_form with confirmed true." }); return; }
  if (!hfYes(heard.text)) { c.n = G.heardN; toolReply(callId, { ok: false, saved: false, error: `Not saved: the officer said "${heard.text}", which isn't a clear yes. In one short sentence, ask whether to save it or what to change. If they then say yes, call save_form with confirmed true again (no new read-back needed).` }); return; }
  if (HF_MONEY.includes(V.action) && c.step === "read") { c.step = "amount"; c.n = G.heardN; paintCall();
    toolReply(callId, { ok: true, saved: false, read_back: `Just to be sure, the amount is ${money(readDraft().amount)}. Is that right?`, next: "Money gets a second check; the app said read_back aloud. After the officer's yes, call save_form again with confirmed true." }); return; }
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
