"use strict";
// Filling and saving forms by voice: optional fields one at a time, hands-free saves, and the check of hands-free saves (loaded after aratools.js)
// Optional fields, one at a time (Oct 24, after testers found the one long list hard to follow): the app asks each question and fills in each answer itself
// an ask still waiting for its answer: the next step is the follow-up task, and the app suggests the words (Carverhill, Oct 28 11:15 AM)
// the due date is the officer's own when they gave one ("a follow-up in seven days", Oct 28), else ASK_CHECK_DAYS on from the ask
const followUpSuggestion = (t, own) => { const first = t && t.contact ? t.contact.first : "them", d = (V && V.data && V.data.date) || todayISO(), said = normDate(own || (V && V.data && V.data.nextDue) || ""); return { text: `Follow up with ${first} to get an answer on the ask`, due: said || addDays(d, ASK_CHECK_DAYS), own: !!said }; };
const dueSaid = (s) => s.own ? `due on ${fmtDate(s.due)} as you said` : `due in ${ASK_CHECK_DAYS} days, on ${fmtDate(s.due)}`;
const FOLLOW_Q = (t) => { const s = followUpSuggestion(t); return `An ask that's still waiting for an answer needs a follow-up task, which becomes a Task for you. I suggest "${s.text}", ${dueSaid(s)}. Shall I use that, or do you want different words?`; };
const awaitingAsk = (action, d) => !!(d && voiceRule(action).followUpWhen && voiceRule(action).followUpWhen(d));
const wantsNextStep = (action, d, t) => !!(d && voiceRule(action).nextStepWhen && voiceRule(action).nextStepWhen(d, t)); // declared per form (VOICE_RULES)
const SUBST_Q = "Was it a substantive interaction, one that moved the relationship forward?";
// the officer's yes or no to the substantive question, from their last line (Grok sometimes doesn't pass it on)
function officerSubstantive() { const t = ((G.recent || []).filter(l => l.startsWith("Officer: ")).slice(-1)[0] || "").slice(9); if (!t) return null;
  if (/\b(not|no|wasn't|isn't)\b/i.test(t) && !/\bbut yes\b/i.test(t)) return false; return hfYes(t) || /\bsubstantive\b/i.test(t) ? true : null; }
const OPT_OFFER = `The required details are in. Before anything else, ask exactly this: "Would you like to add more details? I can take you through them one at a time." If yes, call optional_fields with step start. If no, ask them to check the draft and tap the button.`;
// the A to E ranges are read out once per call; after that the question is short, so it can be cut in on (Oct 28: the long line was said twice and couldn't be interrupted)
const CAP_RANGES = "A is $250,000 and up, B is $100,000 to $250,000, C is $25,000 to $100,000, D is $5,000 to $25,000, and E is under $5,000.";
const capRanges = (who) => G.rangesSaid ? ` A to E: which fits ${who}, or move on?` : ` ${CAP_RANGES} Which fits ${who}, or move on?`; /* the flag is set when the ranges are actually spoken (forceSay), since lines are also built for prefetch */
// ---- Voice form policy (Carverhill, Oct 28): one engine for every form. The optional fields of a form are its declared fields that are not
// required, fixed or prefilled; each is asked with the question below (a field with none gets the generic one for its type), one at a time,
// and the officer can move on or save at any question. What differs between forms is in VOICE_RULES (core.js), never in a branch here.
const OPT_Q = {
  capacity: (who, next) => `${next ? `Next, ${who}'s capacity rating, which an opportunity needs.` : `First, ${who}'s capacity rating.`}${capRanges(who)}`,
  howMet: (who) => `Next field: how you met ${who}. Fill it in, or move on?`,
  permText: (who) => `Next field: is it OK to text ${who} on their mobile? Yes, no, or move on?`,
  permSource: (who) => `Next field: how ${who} agreed to texts. Fill it in, or move on?`,
  flags: (who) => `Last field: should ${who} be marked Ally - Do Not Solicit, or Do Not Contact? Most people are neither; say neither to move on.`,
  fund: () => `Next field: the entity they're most likely to give to, for example Citizens Alliance C3, or one of the C4s or PACs. Fill it in, or move on?`,
  campaign: () => { const f = readDraft().fund; return `Which campaign: National, or ${ENTITY_STATE[f]}?`; },
  potential: () => `Next field: the potential amount. Fill it in, or move on?`,
  notes: () => `Last field: any notes. Fill them in, or move on?`
};
// when an optional field applies at all (declared with the field as `when`, or here for the ones that depend on another answer)
const OPT_WHEN = { permText: (d) => !!String(d.mobile || "").trim(), permSource: (d) => !!d.permText, campaign: (d) => !!d.fund && campaignsFor(d.fund).length > 1 };
// words that name each question, for going back to it
const OPT_WORDS = { capacity: /capacity|rating|rated/, howMet: /how (we|you|i) met|met|meet/, permText: /text/, permSource: /agree|source/, flags: /flag|ally|do not|dnc|solicit/, fund: /entit|fund|c3|c4|pac/, campaign: /campaign/, potential: /amount|potential|how much|dollar/, notes: /note/ };
const optEmpty = (v) => v === null || v === undefined || String(v).trim() === "";
const optWho = () => { const d = readDraft(), c = V.target && V.target.contact; return V.action === "contact" ? (d.first || "them") : c ? c.first : "them"; };
const optLabel = (f) => f.label.replace(/ \(.*\)$/, "").toLowerCase();
function optQuestion(st, who, next) { // the field's own question, else the generic one for its type
  if (OPT_Q[st.k]) return OPT_Q[st.k](who, next); const f = st.f || {}, label = optLabel(f);
  if (f.type === "bool") return `Next field: ${label}? Yes, no, or move on?`;
  if (f.type === "select") { const o = (typeof f.opts === "function" ? f.opts(readDraft()) : f.opts || []).filter(Boolean); return `Next field: ${label}. ${o.length && o.length <= 6 ? o.join(", ") + ". Pick one" : "Fill it in"}, or move on?`; }
  return `Next field: ${label}. Fill it in, or move on?`;
}
// the optional steps of the open form: one per optional field, a declared group (ally and do-not-contact) as one step, in the form's order
function optSteps(action = V && V.action) {
  const A = ACTIONS[action], R = voiceRule(action); if (!A) return [];
  const grouped = new Set(Object.values(R.groups || {}).flat()), pre = new Set(R.prefilled || []), out = [], seen = new Set();
  A.fields.forEach(f => {
    if (f.req || f.fixed || pre.has(f.k) || (R.defaultOn || []).includes(f.k) || f.k === R.alwaysAsk || f.k === "nextStep" || f.k === "nextDue") return;
    if (grouped.has(f.k)) { const g = Object.keys(R.groups).find(k => R.groups[k].includes(f.k)); if (!seen.has(g)) { seen.add(g); out.push({ k: g, group: R.groups[g], f }); } return; }
    out.push({ k: f.k, f, when: OPT_WHEN[f.k] || (f.when ? (d) => !!d[f.when] : null) }); });
  if (R.optional) { const order = R.optional; return order.map(k => out.find(st => st.k === k)).filter(Boolean); } /* the declared list, in its order */
  const first = R.askFirst; if (first) out.sort((a, b) => (a.k === first ? 0 : 1) - (b.k === first ? 0 : 1));
  return out;
}
function optNext() { // the next question still to ask: skips anything already answered or already on the form
  const d = readDraft();
  return optSteps().find(st => !V.opt.done.includes(st.k) && (!st.when || st.when(d)) && (st.group || st.f.type === "bool" ? true : optEmpty(d[st.k])));
}
function optSet(k, v) { const cur = readDraft(); (V.history = V.history || []).push(Object.assign({}, cur)); cur[k] = v; V.fromVoice.add(k); V.data = prefill(V.action, cur, V.target); renderOverlay(); }
const YES_WORDS = /\b(yes|yeah|yep|sure|ok|okay|fine|allowed|permitted|go ahead|of course|absolutely)\b/, NO_WORDS = /^(no|nope|nah|not)\b|\b(don't|do not|not ok|not okay|shouldn't|can't)\b/;
function optParse(k, raw, st) { // the officer's answer in their words -> the field's value, or null if it can't be read
  const t = String(raw || "").trim(), l = t.toLowerCase().replace(/[’‘]/g, "'"), f = (st && st.f) || (ACTIONS[V.action].fields.find(x => x.k === k) || {});
  if (k === "capacity") return normCap(t.replace(/^(it's|its|make it|let's say|lets say|say|rating|capacity)\s+/i, "").replace(/^(bee|be)\b/i, "B").replace(/^(see|sea|cee)\b/i, "C").replace(/^dee\b/i, "D").replace(/^ee\b/i, "E"));
  if (k === "flags") { const none = /\b(neither|none|no|nope|nah|not)\b/.test(l) && !/\b(ally|do not contact|dnc)\b.*\b(yes)\b/.test(l);
    if (/\b(neither|nor|none)\b/.test(l) || (/^(no|nope|nah)\b/.test(l) && !/\bally\b|contact|solicit/.test(l))) return { ally: false, dnc: false }; // "neither Ally - Do Not Solicit nor Do Not Contact" named both but meant neither (Oct 24)
    const ally = /\bally\b|do not solicit|don't ask|do not ask/.test(l) && !/\bnot (an )?ally\b/.test(l), dnc = /do not contact|don't contact|\bdnc\b/.test(l) && !/\bnot do not contact\b/.test(l);
    if (ally || dnc) return { ally, dnc }; return none ? { ally: false, dnc: false } : null; }
  if (k === "fund") { const { hits } = matchEntity(t); return hits.length === 1 ? hits[0] : null; }
  if (k === "campaign") { const fd = readDraft().fund, stn = ENTITY_STATE[fd];
    if (!/\bcampaign\b/.test(l) && /\b(pac|c3|c4|c\.a\.|citizens|alliance|entity)\b/.test(l)) return null; // "The PAC. C.A. Idaho PAC." names an entity, not a campaign (Oct 25: a repeat after a drop filled the campaign)
    if (/\bnational\b/.test(l)) return "National"; if (stn && (l.includes(stn.toLowerCase()) || /\bstate\b/.test(l))) return stn; return null; }
  if (f.type === "bool") return NO_WORDS.test(l) ? false : YES_WORDS.test(l) ? true : null;
  if (f.type === "money") return spokenAmount(t);
  if (f.type === "date") return normDate(t) || null;
  if (f.type === "select") { const o = (typeof f.opts === "function" ? f.opts(readDraft()) : f.opts || []).filter(Boolean), re = typeof OPTION_WORDS === "object" && OPTION_WORDS[k];
    return o.find(x => l.includes(x.toLowerCase())) || (re && o.find(x => re[x] && re[x].test(l))) || null; }
  return t || null; // how we met, texting source, notes, participants: their words
}
const optHeardLine = (st, v) => { const k = st.k, f = st.f || {};
  if (k === "capacity") return `Rating ${v} is on the form.`; if (k === "permText") return v ? "Texting is now permitted on the form." : "Texting stays off.";
  if (k === "flags") return v.ally || v.dnc ? `${[v.ally && "Ally - Do Not Solicit", v.dnc && "Do Not Contact"].filter(Boolean).join(" and ")} is now on the form.` : "Neither flag is set.";
  if (k === "fund") return campaignsFor(v).length === 1 ? `${v} is on the form, with the National campaign, its only campaign.` : `${v} is on the form.`;
  if (k === "campaign") return `The ${v} campaign is on the form.`;
  if (f.type === "money") return `${money(v)} is on the form.`; if (f.type === "bool") return v ? `${f.label} is on the form.` : `${f.label} stays off.`;
  return "That's on the form."; };
// the optional details: the policy's one question after the required fields ("save it, or add the optional details first?") when the form has
// two or more; a single optional field is asked straight away; none means straight to the read-back (or the Save button)
function offerMore(callId, said) {
  V.askedOptional = true; V.opt = { done: V.opt ? V.opt.done : [] };
  const d = readDraft(), left = optSteps().filter(st => !V.opt.done.includes(st.k) && (!st.when || st.when(d)) && (st.group || st.f.type === "bool" ? true : optEmpty(d[st.k])));
  if (!left.length) { V.opt = null; optAsk(callId, said); return; }
  if (left.length === 1) { optAsk(callId, said); return; }
  const who = optWho(), A = ACTIONS[V.action];
  V.choice = "saveOrOpt"; V.opt.cur = null;
  toolReply(callId, { ok: true, choice: "saveOrOpt", ask_exactly: `${said ? said + " " : ""}That's everything the ${formName(A)} form needs for ${who}. Save it, or add the optional details first?`,
    next: `If the officer wants the details, call optional_fields with step start. If they say save, ${G.hands && !voiceRule(V.action).noVoiceSave ? "call save_form (the app reads the form back first)" : `ask them to check the draft and tap "${A.saveLabel}"`}.` });
}
function optAsk(callId, said) { // the app itself says what it heard and the next question, word for word (Oct 24: Ara read its guidance aloud); or wrap up
  const A = ACTIONS[V.action];
  if (V.opt && V.opt.only && (V.opt.done.includes(V.opt.only) || !optEmpty(readDraft()[V.opt.only]))) { V.opt.only = null; offerMore(callId, said); return; } // just the one field that the next step needs, then the rest
  const st = V.opt ? optNext() : null;
  if (st) { V.opt.cur = st.k; toolReply(callId, { ok: true, field: st.k, ask_exactly: `${said ? said + " " : ""}${optQuestion(st, optWho(), V.opt.only === st.k)}`, next: "After the officer answers, call optional_fields with step answer and their words as value (or step skip, back or stop)." }); return; }
  V.opt = null; V.choice = null;
  if (G.hands && !voiceRule(V.action).noVoiceSave) { hfSave(callId, { confirmed: false }, said); return; } // the app reads the finished draft back itself
  toolReply(callId, { ok: true, done: true, button: A.saveLabel, status: `${said ? `Start with "${said}" ` : ""}${V.askedOptional ? "That was the last optional field. " : ""}In one short sentence say the details are in, then ask them to check the draft and tap "${A.saveLabel}".` });
}
function optStep(callId, data) {
  if (!V || !optSteps().length) { toolReply(callId, { ok: false, error: "No form with optional details is open. Open the form the officer asked for first, or ask what they'd like to do." }); return; }
  const step = data.step || "answer"; V.choice = null;
  if (!V.opt && step === "answer" && data.value) { V.opt = { done: [] }; const st = optNext();
    if (st && optParse(st.k, data.value, st) !== null) { V.opt.cur = st.k; act("step", "optional fields: the officer's answer came before the questions; taken for " + st.k); } else { optAsk(callId); return; } }
  if (step === "start" || !V.opt) { V.opt = { done: V.opt ? V.opt.done : [] }; if (step === "start" || !V.opt.cur) { optAsk(callId); return; } } // start: all the questions, not just the one
  if (step === "stop") { V.opt.done = optSteps().map(s => s.k); optAsk(callId, "No more questions, then."); return; }
  if (step === "back") { // "let's go back and set the entity": that question again, or its answer if they gave one
    const steps = optSteps(), f = String(data.field || data.value || "").toLowerCase();
    const words = (st) => OPT_WORDS[st.k] || new RegExp(optLabel(st.f || {}).split(/\W+/).filter(w => w.length > 3).join("|") || "$^");
    const want = steps.find(st => words(st).test(f)) || (V.opt.cur && steps[Math.max(0, steps.findIndex(st => st.k === V.opt.cur) - 1)]);
    if (!want) { toolReply(callId, { ok: false, error: "Which question? Ask the officer, then call again with field.", fields: steps.map(st => st.k) }); return; }
    V.opt.done = V.opt.done.filter(k => k !== want.k && !(want.k === "fund" && k === "campaign")); V.opt.cur = want.k; act("step", "optional fields: back to " + want.k);
    if (data.value && !words(want).test(String(data.value).toLowerCase().trim()) || (data.value && want.k === "fund" && matchEntity(data.value).hits.length)) { data = { step: "answer", value: data.value }; }
    else { toolReply(callId, { ok: true, field: want.k, ask_exactly: `Sure, back to that. ${optQuestion(want, optWho())}`, next: "After the officer answers, call optional_fields with step answer." }); return; }
  }
  let k = V.opt.cur; if (!k) { optAsk(callId); return; }
  let st = optSteps().find(s => s.k === k) || { k, f: {} };
  // the same answer again within half a minute is the voice model re-sending it after a drop, not an answer to the next question (Oct 25)
  const norm = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (step === "answer" && V.opt.lastVal && norm(data.value) && (norm(data.value) === V.opt.lastVal || norm(data.value).includes(V.opt.lastVal)) && Date.now() - (V.opt.lastAt || 0) < 30000 && V.opt.done.includes(V.opt.lastK)) {
    act("step", `optional fields: "${data.value}" repeats the last answer (${V.opt.lastK}); asking the ${k} question again`); optAsk(callId); return; }
  // an answer that fits an earlier question better ("it's one of the New Hampshire entities" while the amount was asked, Oct 24): take it for that one
  if (k !== "fund" && V.opt.done.includes("fund") && optSteps().some(s => s.k === "fund") && optEmpty(readDraft().fund) && optParse(k, data.value, st) === null && matchEntity(data.value || "").hits.length) {
    act("step", "optional fields: answer taken for the entity"); V.opt.done = V.opt.done.filter(x => x !== "fund" && x !== "campaign"); V.opt.cur = k = "fund"; st = optSteps().find(s => s.k === "fund"); }
  const boolQ = st.group || (st.f && st.f.type === "bool");
  if (step !== "skip" && !boolQ && /^(no|nope|nah|next|skip|pass|move on|moving on|nothing|none|no notes|leave it|not now)\b/i.test(String(data.value || "").trim())) { act("step", `optional field ${k}: "${data.value}" taken as move on`); data = { step: "skip" }; }
  if (data.step === "skip") { V.opt.done.push(k); act("step", "optional field skipped: " + k); optAsk(callId, "No problem."); return; }
  const v = optParse(k, data.value, st);
  if (v === null) {
    toolReply(callId, { ok: false, field: k, error: `The app couldn't read "${data.value || ""}" as an answer to this question.`, say: k === "fund" ? (() => { const { hits } = matchEntity(data.value); return hits.length > 1 ? `Ask which one they mean: ${hits.join(", or ")}.` : `Say you didn't catch which entity. Give the short version: Citizens Alliance C3, C.A. of America Action C4, C.A. Fed PAC, or a state C4 or PAC in Idaho, North Dakota, New Hampshire or Pennsylvania. Ask which.`; })() : `Say in a few words that you didn't catch that, then ask again: "${optQuestion(st, optWho())}"` }); return; }
  if (st.group) st.group.forEach(gk => optSet(gk, v[gk])); else optSet(k, v);
  V.opt.done.push(k); V.opt.lastK = k; V.opt.lastVal = norm(data.value); V.opt.lastAt = Date.now(); act("step", "optional field " + k + ": " + JSON.stringify(v));
  optAsk(callId, optHeardLine(st, v));
}
// a few words of human reaction to what was just saved (good news, a setback), at the start of the save line
function moodLine(action, d) {
  if (action === "pledge") return "Congrats!";
  if (action === "payment" || action === "gift") return "Woohoo, money in the door!";
  if (action === "ask") return d.response === "Accepted" ? "Yes! That's fantastic news." : d.response === "Countered" ? "A counter is still a yes in the making." : d.response === "Declined" ? "Ah, that's a shame." : "";
  if (action === "interaction" && d.substantive && !NO_NEXT_STEP.includes(d.outcome)) return "Sounds like a good meeting!";
  return "";
}
// After a save the app says the line itself, word for word: the save, the undo reminder (once per conversation), any note, then the next
// step in the process (Carverhill, Oct 28: never an open "what do you want to do?", and Ara's own wording dropped things)
function grokSaved(action, r, d = {}) {
  if (!G.live) return;
  const c = r && r.contact, who = c ? nameOf(c) : "";
  const o = r && r.opp, closed = o && o.stage === "Closed" ? ` The opportunity is now Closed ${o.closed}.` : "";
  const line = `${ACTIONS[action].saved}${who ? " for " + who : ""}${closed ? " (Closed " + o.closed + ")" : ""}`;
  (G.saves = G.saves || []).push(line); G.savedAt = Date.now(); G.savedLine = line; recent("App", "Saved: " + line); // a reconnect after this must not save it again
  const next = nextStepLine(c, !!closed), undo = G.hfTry && !G.undoSaid;
  G.lastSaved = { who: who || "the same record", contactId: c ? c.id : null, next: `say exactly: "${next}"`, at: Date.now() }; // a drop with no form open comes back to this person (Carverhill, Oct 25)
  const spoken = [moodLine(action, d), savedShort(action, who, d) + closed, undo ? "Say undo if that's wrong." : "", r && r.note ? r.note : "", next].filter(Boolean).join(" ");
  whenIdle("instr");
  if (G.hfTry) { if (undo) G.undoSaid = true; // the undo reminder once per conversation: every save repeating it got tiresome (Oct 24)
    G.hfTry.force = spoken; G.hfTry.say = `The app saved it: ${ACTIONS[action].saved.toLowerCase()}${who ? " for " + who : ""}.${closed} Say in a few words that it's saved (for example "${savedShort(action, who, d)}")${r && r.note ? `, then state (don't ask) "${r.note}"` : ""}, then carry on.`; return; }
  G.saveAck = { at: Date.now(), action, who, next: `say exactly: "${next}"` };
  act("step", "The app says the save and the next step itself"); forceSay(spoken);
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
const savedShort = (action, who, d = {}) => {
  const first = who ? who.split(" ")[0] : "";
  if (action === "cultivate" && first) return d.decision === "Defer" ? `${first}'s move to Cultivation is deferred${d.reconsiderOn ? " until " + dateSaid(d.reconsiderOn).replace(/ \((today|tomorrow|yesterday)\)$/, "") : ""}.` : `${first} is now in Cultivation.`; /* Carverhill, Oct 28: "Decision recorded for Y" said nothing */
  return `${ACTIONS[action].saved}${who ? " for " + first : ""}.`; };
// the next step in the process for a contact, word for word: said after every save and whenever the officer asks what's next
const NEXT_Q = " Do you want to do that now?", NEXT_NO_Q = "What would you like to do?"; /* yes opens the step; a bare no gets NEXT_NO_Q from the app; "no, <step>" goes to that step (Carverhill, Oct 28) */
// the officer's bare no to the next-step question: the app asks what they'd like to do, in its own scripted words
function nextStepNo(text) {
  const t = String(text || "").toLowerCase().replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim().replace(/^((no|nope) )?(thanks|thank you)$/, "no");
  if (!/^(no|nope|not now|not right now|no not now|not yet|no not yet)$/.test(t)) return false;
  const last = ((G.recent || []).filter(l => !l.startsWith("Officer: ")).slice(-1)[0] || "").trim(); if (!last.endsWith(NEXT_Q.trim())) return false;
  act("step", "a no to the next step: the app asks what they'd like to do"); stopPlayback(); if (G.responding) send({ type: "response.cancel" }); G.cmdAt = Date.now();
  forceSay(NEXT_NO_Q); return true;
}
function nextStepLine(c, closed) {
  if (!c) return "What would you like to do next?";
  if (closed) return `That completes the process for ${c.first}. What would you like to do next?`;
  const o = openOpp(c.id), n = o ? nextStep(o) : null;
  if (o) {
    if (!n) return `What would you like to do next for ${c.first}?`;
    if (/^deferred/.test(n.line)) return `${c.first}'s move to Cultivation is ${n.line}. What would you like to do next?`;
    if (/^confirm the move/.test(n.line)) return `The next step in the process is to confirm ${c.first}'s move to Cultivation.${NEXT_Q}`;
    return `The next step in the process to move ${c.first} to ${n.to} is to ${n.line.replace(/ \((.*?)\)/g, ", $1")}.${NEXT_Q}`; }
  if (c.dnc) return `${c.first} is marked Do Not Contact, so there's no next step. What would you like to do next?`;
  if (c.ally) return `${c.first} is an Ally - Do Not Solicit, so there's no next step. What would you like to do next?`;
  if (!c.capacity) return `The next step in the process to move ${c.first} to Qualification is to set a capacity rating.${NEXT_Q}`;
  return `The next step in the process to move ${c.first} to Qualification is to create an opportunity.${NEXT_Q}`;
}
document.addEventListener("click", (e) => { const a = e.target.closest("[data-act3]"); if (!a) return;
  if (a.dataset.act3 === "end") endCall("officer tapped End");
  else if (a.dataset.act3 === "hands") { setHandsFree(!G.hands);
    hfAnnounce(); } });
// Hands-free (driving) mode: Ara saves a finished form after reading it back and hearing the officer's own yes. It lasts until the call ends.
const CAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17h14v-5l-2-5H7l-2 5z"/><path d="M5 12h14"/><circle cx="8" cy="17" r="1.6"/><circle cx="16" cy="17" r="1.6"/></svg>';
const secondYes = (action) => voiceRule(action).secondYes || ""; // a declared field the form confirms once more before the save (money forms)
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
  const askedFor = /\b(contact|opportunity|interaction|meeting|task|ask|pledge|gift|payment|report|log|record|create|add|plan|new)\b/i.test(((G.recent || []).filter(l => l.startsWith("Officer: ")).slice(-1)[0] || "")); // "hands-free, then a new contact": no "what would you like to do?" (Oct 25)
  const text = `${line} ${V && ACTIONS[V.action] ? (q ? (q.replace(/^[^:]+: /, "").trim().match(/[^.!?]*\?$/) || [""])[0].trim() : "") : askedFor ? "" : "What would you like to do?"}`.trim();
  const go = hfSwitchLine(on).replace(/^Say "[^"]*"\.?\s*Then,?\s*/, "");
  forceSay(text, V && !q ? `The app just said "${text}" in your voice; don't say it again. Now ${go.charAt(0).toLowerCase() + go.slice(1)}` : !V && askedFor ? `The app just said "${text}" in your voice; don't say it again and don't ask what they'd like to do: the officer already said. Carry on with it now (open its form and ask for the first missing field).` : null, hfSwitchLine(on));
}
function setHandsFree(on) {
  G.hands = !!on && G.live; G.saveCheck = null; act("step", "hands-free " + (G.hands ? "on" : "off")); vlog("hands-free " + (G.hands ? "on" : "off"));
  if (V && document.getElementById("draftForm")) { V.data = readDraft(); renderOverlay(); } // the form's save note changes
  if (G.live && PROV().extras && G.ws && G.ws.readyState === 1) sessUpdate({ turn_detection: sessionCfg().turn_detection }); /* the service's idle timer follows the hands-free wait */
  paintCall(); whenIdle("instr"); toast(G.hands ? "Hands-free on: Ara saves when you say yes" : "Hands-free off: tap Save yourself");
}
// what Ara reads back before saving: the form, who it's for, and each filled-in field (long text cut short)
function hfReadback() {
  const A = ACTIONS[V.action], R = voiceRule(V.action), d = readDraft(), who = V.target && V.target.contact ? nameOf(V.target.contact) : "";
  if (R.ownWords && who) return ownWordsReadback(V.action, d, who);
  return `${A.title.replace(/ · /, ", ")}${who ? " for " + who : ""}: ${readbackParts(A, R, d).join(", ") || "nothing filled in yet"}.`;
}
// the Cultivation decision is read back as the decision itself, with its meaning (Carverhill, Oct 25 and Oct 28: not "Decision: Move to Cultivation")
function ownWordsReadback(action, d, who) { const first = who.split(" ")[0];
  if (d.decision === "Defer") return `Defer ${first}'s move to Cultivation${String(d.reason || "").trim() ? ", reason: " + String(d.reason).trim().replace(/[.\s]+$/, "") : ""}${d.reconsiderOn ? ", reconsider on " + dateSaid(d.reconsiderOn).replace(/ \((today|tomorrow|yesterday)\)$/, ", $1") : ""}.`;
  return `Move ${first} to Cultivation? That means you, as the gift officer, believe they're ready to be pursued for a gift.`; }
// the policy's shape: only fields with a value; money, dates and choices bare, text as "label, value", long text as "noted", flags by name
function readbackParts(A, R, d, only) {
  const dflt = R.defaultOn || [], out = [];
  A.fields.filter(f => !f.fixed && (!only || only.includes(f.k))).forEach(f => { const v = d[f.k];
    if (v === null || v === undefined || v === "") return;
    if (f.k === R.alwaysAsk) { out.push(v ? "substantive" : "not substantive"); return; } // always said: it decides whether the opportunity can move on
    if (f.type === "bool") { if (v && !dflt.includes(f.k)) out.push(f.label); return; }
    if (f.type === "area") { out.push(`${optLabel(f)} noted`); return; } // long text is on the form; reading it out made the read-back about 13 s (Oct 24)
    if (f.type === "money") { out.push(money(v)); return; }
    if (f.type === "date") { out.push(`${/^Next step due/.test(f.label) ? "due " : /^(Received|Confirmed) on/.test(f.label) ? f.label.replace(/ on$/, "").toLowerCase() + " on " : ""}${dateSaid(v).replace(/ \((today|tomorrow|yesterday)\)$/, ", $1")}`); return; }
    if (f.type === "select") { out.push(f.k === "capacity" ? `rated ${v}` : f.k === "method" ? `by ${String(v).toLowerCase()}` : String(v)); return; }
    let x = String(v); const w = x.split(/\s+/); if (w.length > 14) x = w.slice(0, 14).join(" ") + "…";
    out.push(/^(first|last|text|title)$/.test(f.k) ? x : `${optLabel(f)}, ${x}`); });
  // a declared pair of plain-text fields (first and last name) is one item
  (A.pairs || []).forEach(([a, b]) => { const fa = A.fields.find(f => f.k === a), fb = A.fields.find(f => f.k === b); if (!fa || !fb || fa.type || fb.type || !d[a] || !d[b]) return;
    const i = out.indexOf(String(d[a])), j = out.indexOf(String(d[b])); if (i >= 0 && j === i + 1) out.splice(i, 2, `${d[a]} ${d[b]}`); });
  return out;
}
const SAVE_Q = "Save it, or change something?";
const formName = (A) => A.title.toLowerCase().replace(/ · /, ", ").replace(/\?$/, "");
// the scripted question for the first missing required field (the policy: asked one at a time, a declared pair as one question);
// a field's own wording by form and key, else by key, else the generic one for its type
const REQ_Q = {
  "contact.first": (w) => "What's their first and last name?", "contact.last": (w) => "And their last name?",
  "interaction.date": () => "When was it, and was it in person, a phone call, a video call, an email, or an event?", "ask.date": () => "When was the ask made, and was it in person, a phone call, a video call, an email, or an event?",
  "interaction.summary": () => "What happened? A sentence or two.", "ask.summary": () => "How did it go? A sentence or two.",
  "plan.fund": (w, d) => "Which entity, and which campaign?", "plan.plannedDate": () => "When is the planned ask date, and for how much?",
  "ask.amount": () => "How much was the ask, and for which entity?", "ask.response": () => "What was the response: accepted, countered, declined, or still waiting?",
  "response.response": () => "What was the answer: accepted, countered, or declined?", "response.date": () => "When did you hear?",
  "pledge.amount": () => "How much is the pledge, and for which entity?", "pledge.confirmedBy": () => "How was it confirmed, by email, phone or in person, and when?", "pledge.firstDue": () => "When is the first payment due?",
  "gift.amount": () => "How much is the gift, and for which entity?", "gift.date": () => "When was it received, and how was it paid?", "payment.date": () => "When was it received, and how was it paid?",
  "task.text": () => "What's the task?", "task.due": () => "When is it due?",
  "meeting.title": () => "What's the meeting about?", "meeting.date": () => "When is it, date and time?",
  "cultivate.decision": (w) => `Move ${w} to Cultivation, or defer?`, "cultivate.reason": () => "What's the reason to defer, and when should it come up again?",
  lostReason: () => "What was the reason?", reason: () => "What's the reason?", campaign: (w, d) => `Which campaign: National, or ${ENTITY_STATE[d.fund] || "the state"}?`, fund: () => "Which entity?", email: (w) => `What's ${w}'s email address?`, mobile: (w) => `What's ${w}'s mobile number?`
};
function reqQuestion(action, fields, d) {
  const f = fields[0]; if (!f) return ""; const who = V && V.target && V.target.contact ? V.target.contact.first : (d && d.first) || "them";
  const q = REQ_Q[action + "." + f.k] || REQ_Q[f.k]; if (q) return q(who, d || {});
  const label = optLabel(f);
  if (f.type === "money") return `How much is the ${label}?`; if (f.type === "date") return `When is the ${label}?`;
  if (f.type === "select") { const o = (typeof f.opts === "function" ? f.opts(d || {}) : f.opts || []).filter(Boolean); return `${label.charAt(0).toUpperCase() + label.slice(1)}: ${o.length && o.length <= 6 ? o.join(", ") + "?" : "which?"}`; }
  return `What's the ${label}?`;
} // the one question that ends every read-back (the policy)
// the officer's next words after Ara's question (the transcript can land a moment after her tool call)
function hfHeardAfter(n, ms = 2500) { return new Promise(res => { const t0 = Date.now(); (function poll() { if ((G.heardN || 0) > n) return res(G.lastHeard); if (Date.now() - t0 > ms) return res(null); setTimeout(poll, 100); })(); }); }
async function hfSave(callId, data, lead, short) { /* short: only the changed field was re-read (lead), then the save question */
  if (!V) { const recentSave = G.savedAt && Date.now() - G.savedAt < 3 * 60e3;
    toolReply(callId, recentSave && Date.now() - G.savedAt < SAVE_ECHO_MS ? { ok: true, saved: true, already: true, status: `The officer repeated their yes; the form was already saved a moment ago (${G.savedLine}) and your confirmation of it is what they are waiting for. Confirm it once, in your words, with the undo offer and what's next; never say "checking on that save".` }
      : recentSave ? { ok: true, saved: true, already: true, status: `That form was already saved (${G.savedLine}); it closed when it saved. Say in a few words that it's saved, then ask what's next. Don't open it again.` } : { ok: false, saved: false, error: "No form is open, so there's nothing to save." }); return; }
  const A = ACTIONS[V.action];
  // the optional questions are still going (Oct 24: Ara jumped to the read-back before the amount and notes)
  const lastSaid = ((G.recent || []).filter(l => l.startsWith("Officer: ")).slice(-1)[0] || "").slice(9);
  if (V.opt && V.opt.cur && optNext() && !(lastSaid && (hfYes(lastSaid) || /\bsave\b/i.test(lastSaid)))) { const st = optNext(); /* the officer can save at any optional question (the policy); Ara jumping ahead on her own still waits */ V.opt.cur = st.k; toolReply(callId, { ok: false, saved: false, field: st.k, ask_exactly: `Not yet, a couple of questions first. ${optQuestion(st, optWho())}`, error: "The optional questions aren't finished; the app asked the next one. After the answer, call optional_fields with step answer (or skip or stop)." }); return; }
  if (!G.hands) { toolReply(callId, { ok: false, saved: false, error: `Hands-free mode is off, so you can't save. Ask the officer to check the draft and tap "${A.saveLabel}". If they're driving, they can say "hands-free mode".` }); return; }
  if (oppNeedsCampaign(V.action, readDraft())) { const f = readDraft().fund; toolReply(callId, { ok: false, saved: false, error: `Not ready: ask which campaign first, ${campaignsFor(f).join(" or ")} (${f} has both). Fill it in with the draft tool, then read back.` }); return; }
  if (voiceRule(V.action).noVoiceSave) { toolReply(callId, { ok: false, saved: false, error: "Scheduling a meeting finishes in Google Calendar, which needs the screen. Say it's kept as a draft for when they've parked." }); return; }
  // an interaction report is never read back without the substantive answer (Oct 25: saved as not substantive, never asked)
  if (voiceRule(V.action).alwaysAsk === "substantive" && !V.fromVoice.has("substantive")) {
    const v = V.askedSubst ? officerSubstantive() : null;
    if (v === null) { V.askedSubst = true; toolReply(callId, { ok: false, saved: false, field: "substantive", ask_exactly: `${lead ? lead + " " : ""}One more thing. ${SUBST_Q}`, error: "Not read back yet: the app asked whether it was substantive. After the answer, call show_interaction_draft with substantive true or false." }); return; }
    const cur = readDraft(); cur.substantive = v; V.fromVoice.add("substantive"); V.data = prefill(V.action, cur, V.target); renderOverlay(); act("step", `substantive ${v}, from the officer's words`);
  }
  { const d = readDraft(); if (wantsNextStep(V.action, d, V.target) && (optEmpty(d.nextStep) || optEmpty(d.nextDue))) {
    if (awaitingAsk(V.action, d)) { const s = followUpSuggestion(V.target), last = ((G.recent || []).filter(l => l.startsWith("Officer: ")).slice(-1)[0] || "").slice(9);
      if (V.askedFollow && last && hfYes(last)) { const cur = readDraft(); cur.nextStep = s.text; cur.nextDue = s.due; V.fromVoice.add("nextStep"); V.fromVoice.add("nextDue"); V.data = prefill(V.action, cur, V.target); renderOverlay(); act("step", `follow-up task "${s.text}" by ${fmtDate(s.due)}, the officer said yes to the suggestion`); }
      else { V.askedFollow = true; toolReply(callId, { ok: false, saved: false, field: "nextStep", ask_exactly: `${lead ? lead + " " : ""}${FOLLOW_Q(V.target)}`, error: `Not read back yet: the app asked the officer whether to use the suggested follow-up task "${s.text}" due ${s.due}. If they say yes, call the draft tool with exactly that nextStep and nextDue ${s.due}; if they give their own words or date, use those.` }); return; } }
    else { toolReply(callId, { ok: false, saved: false, field: "nextStep", ask_exactly: `${lead ? lead + " " : ""}A substantive interaction needs a next step, which becomes a Task for you. Do you want to set that now? If so, tell me the step and when it's due.`, error: "Not read back yet: a substantive interaction (or an ask that wasn't declined) needs a next step and its due date. After the answer, call the draft tool with nextStep and nextDue." }); return; } } }
  const key = V.action + JSON.stringify(readDraft()); let c = G.saveCheck;
  if (data.confirmed === true && !(c && c.key === key) && araReadBack()) { c = G.saveCheck = { key, step: "read", n: (G.heardN || 1) - 1 }; act("step", "Ara read the form back herself, in full, and the officer said yes: taken as the read-back"); }
  if (data.confirmed !== true || !c || c.key !== key) {
    G.saveCheck = { key, step: "read", n: G.heardN || 0 }; paintCall();
    toolReply(callId, { ok: true, saved: false, read_back: short ? `${lead} ${SAVE_Q}` : `${lead ? lead + " " : ""}${hfReadback()}${voiceRule(V.action).ownWords && /\?/.test(hfReadback()) ? "" : " " + SAVE_Q}`, /* a read-back in the form's own words that carries its own question (Move X to Cultivation?) needs no second one */ next: "The app said read_back aloud. After the officer's yes, call save_form again with confirmed true; if they want a change, call the draft tool with just the changed field (the app re-reads that field and asks again)." }); return;
  }
  const heard = await hfHeardAfter(c.n);
  if (!V || G.saveCheck !== c) { toolReply(callId, { ok: false, saved: false, error: "The form changed while waiting. Nothing was saved. Read it back again and ask for a yes." }); return; }
  if (!heard) { toolReply(callId, { ok: false, saved: false, error: "Not saved: the officer hasn't answered yet. Wait for them to say yes, then call save_form with confirmed true." }); return; }
  if (!hfYes(heard.text)) { c.n = G.heardN; toolReply(callId, { ok: false, saved: false, error: `Not saved: the officer said "${heard.text}", which isn't a clear yes. In one short sentence, ask whether to save it or what to change. If they then say yes, call save_form with confirmed true again (no new read-back needed).` }); return; }
  if (secondYes(V.action) && c.step === "read") { c.step = "amount"; c.n = G.heardN; paintCall();
    toolReply(callId, { ok: true, saved: false, read_back: `Just to be sure, the amount is ${money(readDraft()[secondYes(V.action)])}. Is that right?`, next: "Money gets a second check; the app said read_back aloud. After the officer's yes, call save_form again with confirmed true." }); return; }
  const r = hfCommit();
  if (!r.ok) { toolReply(callId, { ok: false, saved: false, error: `Not saved. ${r.err} Ask for what's missing in one short question, update the draft, then read it back again.` }); return; }
  if (r.force) toolReply(callId, { ok: true, saved: true, said: "The app said the save and the next step itself; wait for the officer's answer.", ask_exactly: r.force });
  else toolReply(callId, { ok: true, saved: true, say: r.say || `Say in a few words that it's saved, then ask "What's next?"` });
}
// Ara read the form back herself (against her rules) and the officer said yes to it: it counts when every filled-in field is in her words
function araReadBack() {
  const l = G.recent || [], yi = l.length - 1; if (yi < 1 || !l[yi].startsWith("Officer: ") || !hfYes(l[yi].slice(9))) return false; // the last thing said is the officer's yes
  let ai = yi - 1; while (ai >= 0 && l[ai].startsWith("Officer: ")) ai--; // a half-finished first answer before it doesn't matter
  if (ai < 0 || l[ai].startsWith("App: ")) return false; const ara = l[ai]; // and right before that, Ara's own read-back ending in a save question
  if (!/shall i save|save it\?|is that (right|correct)|ready to save|ok to save/i.test(ara)) return false;
  const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(w => w.length > 1), said = new Set(words(ara));
  const d = readDraft(), A = ACTIONS[V.action];
  return A.fields.filter(f => !f.fixed && (!f.type || f.type === "select") && !optEmpty(d[f.k]) && f.k !== "permSource").every(f => words(d[f.k]).every(w => said.has(w)));
}
// the hands-free save itself: the form on screen, marked as saved hands-free
function hfCommit() {
  const A = ACTIONS[V.action], before = S.history.length, action = V.action; G.hfTry = {};
  try { saveDraft(); } catch (e) { G.hfTry.msg = String(e); }
  const r = G.hfTry; G.hfTry = null; G.saveCheck = null;
  if (V && V.action === action) { paintCall(); const el = document.getElementById("draftErr"); return { ok: false, err: r.msg || (el && el.textContent) || "The form isn't complete." }; }
  S.history.slice(0, S.history.length - before).forEach(x => { x.hf = true; }); save(); render(); paintCall();
  act("step", "hands-free save: " + A.saved); return { ok: true, say: r.say, force: r.force, saved: A.saved };
}
// a form read back and waiting for the officer's yes, when Ara moves on to another form instead of calling save_form
// (Oct 25: "Yes, let's go ahead" to an interaction report's read-back became show_cultivation_decision, and the report was lost)
// Where the form process stands, in the app's own words, for a reconnect or Carry on (Carverhill, Oct 25: "always be tracking
// on our side where we are in a form process, and then when we have to reconnect, we pass Ara that context"). `where` goes into
// Ara's instructions; `ask` is the pending question, which the app asks again itself as a scripted line.
function formPosition() {
  if (!V || !ACTIONS[V.action]) return null;
  const A = ACTIONS[V.action], d = readDraft(), key = V.action + JSON.stringify(d), label = (k) => ((A.fields || []).find(f => f.k === k) || {}).label || k;
  if (G.hands && G.saveCheck && G.saveCheck.key === key) return { where: `The "${A.title}" form has been read back in full and is waiting for the officer's yes to save it; the app asks "${SAVE_Q}" again itself.`, ask: `${hfReadback()}${voiceRule(V.action).ownWords && /\?/.test(hfReadback()) ? "" : " " + SAVE_Q}` };
  if (V.opt && V.opt.cur) { const st = optSteps().find(x => x.k === V.opt.cur); if (st) return { where: `The optional questions for the "${A.title}" form are at "${label(st.k)}" (the earlier ones are done); the app asks it again itself.`, ask: optQuestion(st, optWho(), V.opt.only === st.k) }; }
  if (V.choice === "saveOrOpt") return { where: `Every required field of the "${A.title}" form is in; the app asked whether to save it or add the optional details first, and asks again itself.`, ask: `That's everything the ${formName(A)} form needs. Save it, or add the optional details first?` };
  if (voiceRule(V.action).alwaysAsk === "substantive" && V.askedSubst && !V.fromVoice.has("substantive")) return { where: "The app asked whether the interaction was substantive and is waiting for the answer; it asks again itself.", ask: SUBST_Q };
  const needF = (A.fields || []).filter(f => f.req && !f.fixed && optEmpty(d[f.k])), need = needF.map(f => f.label);
  return { where: need.length ? `The "${A.title}" form still needs: ${need.join(", ")}; the app asks for the first of those itself.` : `Every required field of the "${A.title}" form is in; nothing has been read back yet.`, ask: need.length ? reqQuestion(V.action, needF, d) : "" };
}
// "What fields are left?": the app answers with the list itself, in one scripted line (Jacqueline's call, Oct 27: Ara's answer was vague)
function fieldsLeft() {
  const A = ACTIONS[V.action], d = readDraft(), fields = (A.fields || []).filter(f => !f.fixed && f.type !== "bool" && !(f.when && !d[f.when]));
  const req = fields.filter(f => f.req && fieldBlank(f, d[f.k])).map(f => f.label.toLowerCase()), opt = fields.filter(f => !f.req && fieldBlank(f, d[f.k])).map(f => f.label.toLowerCase());
  { const one = voiceRule(V.action).needsOneOf; if (one && one.every(k => optEmpty(d[k]))) req.push("an email or a mobile"); }
  if (oppNeedsCampaign(V.action, d)) req.push("the campaign");
  if (voiceRule(V.action).alwaysAsk === "substantive" && !V.fromVoice.has("substantive")) req.push("whether it was substantive");
  const list = (xs) => xs.join(", ").replace(/, ([^,]*)$/, " and $1"), title = formName(A);
  if (req.length) return { force: `Still needed on the ${title} form: ${list(req)}.${opt.length ? ` Optional, if you want them: ${list(opt)}.` : ""}`, then: `The app just listed what the form still needs. Now ask for the first one, ${req[0]}, in one short question.` };
  const pending = formPosition(); // the optional questions or a read-back may be waiting on an answer
  return { force: `Everything required is in on the ${title} form.${opt.length ? ` You could still add ${list(opt)}.` : ""} ${pending && pending.ask ? pending.ask : G.hands ? "Say save when you're ready, or tell me what to change." : `Check the draft and tap "${A.saveLabel}", or tell me what to change.`}` };
}
function hfSettlePending() {
  const c = G.saveCheck; if (!V || !c || !G.hands || c.key !== V.action + JSON.stringify(readDraft())) return null;
  const title = ACTIONS[V.action].title, heard = (G.heardN || 0) > c.n ? G.lastHeard : null;
  if (!heard || !hfYes(heard.text) || (secondYes(V.action) && c.step === "read")) return { saved: false, title };
  act("step", `The officer's yes to the read-back saved the ${title} form before the next one opened`);
  const r = hfCommit(); return { saved: r.ok, title, err: r.err, say: r.say, line: r.saved };
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
