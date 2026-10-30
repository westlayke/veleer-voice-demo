"use strict";
// Citizens VCRM demo: the conversation with Ara (xAI Grok voice). Loaded in order by the page; all files share one scope.
/* ---------- Grok conversation ---------- */
const S_DATE = { type: "string", description: "YYYY-MM-DD, e.g. 2026-12-01. Work it out from what the officer says, using today's date" };
// spoken dates can arrive as "December 1", "12/1/2026" or "2026-12-1"; turn them into YYYY-MM-DD (a date with no year is the next one to come)
// did the officer just give a capacity rating? (their last few lines, as transcribed)
const NATO = "alpha alfa bravo charlie delta echo foxtrot golf hotel india juliet juliett kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey whisky xray x-ray yankee zulu".split(" ");
// "T as in Tom", "D like David" and NATO words (Tango Uniform Delta) count as spelled letters
function spellPrep(t) {
  t = String(t).replace(/\b([a-z])\s+(?:as in|like|for)\s+[a-z]+\b/gi, "$1");
  const words = t.split(/\s+/); if (words.filter(w => NATO.includes(w.toLowerCase().replace(/[^a-z-]/g, ""))).length >= 3) t = words.map(w => NATO.includes(w.toLowerCase().replace(/[^a-z-]/g, "")) ? w.replace(/[^a-z]/gi, "").charAt(0).toUpperCase() : w).join(" ");
  return t;
}
const spellOut = (w) => String(w).replace(/[^A-Za-z'-]/g, "").toUpperCase().split("").join(" ");
// letters the officer spelled out ("T U D Z I N", "K-A-T-H"), joined into words, from their last few lines; the s of "it's" is not a letter (Oct 24: "it's J B" became SJB)
function spelledWords() {
  const lines = (G.recent || []).filter(l => l.startsWith("Officer: ")).slice(-1).map(l => l.slice(9));
  const out = []; lines.forEach(t => (spellPrep(t).match(/(?<![A-Za-z'’])(?:[A-Za-z][.,-]?\s+){2,}[A-Za-z]\b\.?/g) || []).forEach(m => { const w = m.replace(/[^A-Za-z]/g, ""); if (w.length >= 3) out.push(w); }));
  return out;
}
const SAVE_ECHO_MS = 8000; // a "yes" or "save it" repeated within this of a hands-free save is the same answer, not a new turn
function officerRated() { if (ratedIn(officerLines(3), askedBefore(1))) return true; const last = officerLines(1)[0] || ""; return /^[a-e][.!]?$/.test(last.trim()) && /\b(rating|capacity|a through e|a to e)\b/.test(askedBefore(1)); } /* a letter alone answers the rating question (Oct 28) */ // the matcher lives in evidence.js (Oct 28 tidy-up); this wrapper serves set_capacity_rating
// the officer's last words turn texting on or off ("texting is permitted", "you can text him", "no texts"), or null if they didn't mention texting
function officerSaidTexting() {
  const t = ((G.recent || []).filter(l => l.startsWith("Officer: ")).slice(-1)[0] || "").slice(9).toLowerCase().replace(/[’‘]/g, "'");
  if (!/\btext(s|ing|ed)?\b/.test(t)) return null;
  if (/\b(no|not|don't|do not|never|shouldn't|can't|cannot|off)\b/.test(t)) return false;
  return /\b(permit|permitted|allow|allowed|ok|okay|fine|yes|can|should|turn on|on|check|tick|agreed|sure)\b/.test(t) ? true : null;
}
// the officer said there is no email, or no mobile ("no email, but the mobile is...", "she doesn't have a cell"): the app asks only for the other one, never "as well" (Oct 27 spoken run: Ara asked for an email after "No email")
function officerSaidNone(k) { // their last two lines: the one that said so and, at most, the one that gave the other number
  const lines = (G.recent || []).filter(l => l.startsWith("Officer: ")).slice(-2).map(l => l.slice(9).toLowerCase().replace(/[’‘]/g, "'"));
  const word = k === "email" ? "(e-?mail( address)?)" : "(mobile( number| phone)?|cell( ?phone| number)?|phone( number)?)";
  const re = new RegExp(`\\b(no|not|without|doesn't have|does not have|don't have|do not have|hasn't got|has no|have no|haven't got|isn't on|not on|never gave( me)?|didn't give( me)?)\\s+(an? |any |the |his |her |their )?${word}\\b`);
  return lines.some(t => re.test(t));
}
// seven or more digits in the officer's last line, said as figures or words ("two zero eight, five five five..."): a phone number the tool call should carry
function officerSaidDigits() {
  const t = ((G.recent || []).filter(l => l.startsWith("Officer: ")).slice(-1)[0] || "").slice(9).toLowerCase();
  const w = { zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9" };
  const digits = t.split(/[^a-z0-9]+/).map(x => /^\d+$/.test(x) ? x : w[x] !== undefined ? w[x] : "").join("");
  return digits.length >= 7 ? digits : "";
}
// the voice model sometimes never sends an interaction's summary (seen Oct 24: twelve tries, same fields each time): when Ara has just asked what was talked about, take the officer's answer
function officerSummary() {
  const r = G.recent || []; let i = r.length - 1; while (i >= 0 && !r[i].startsWith("Officer: ")) i--; if (i < 1) return null;
  const said = r[i].slice(9).trim(), asked = r.slice(0, i).reverse().find(l => !l.startsWith("Officer: ")) || "";
  if (!/talk(ed)? about|gist|summar|discuss|what happened|how did (it|the \w+) go|what came up|cover/i.test(asked) || said.split(/\s+/).length < 4 || /\?$/.test(said)) return null;
  let t = said; for (let k = 0; k < 3; k++) t = t.replace(/^(uh|um|er|so|well|okay|ok|yeah|yes|oh)\b[,.]?\s*/i, "");
  t = t.replace(/,?\s+(uh|um|er),?\s+/gi, " ").trim(); if (!t) return null;
  t = t.charAt(0).toUpperCase() + t.slice(1); return /[.!?]$/.test(t) ? t : t + ".";
}
// an ask's answer said in everyday words ("he handed me the check"): Grok left it out and the form showed Awaiting (seen Oct 24)
function officerResponse() {
  const t = ((G.recent || []).filter(l => l.startsWith("Officer: ")).slice(-1)[0] || "").slice(9).toLowerCase().replace(/[’‘]/g, "'");
  if (/\b(no|not|didn't|declined|turned (me|us|it) down|passed)\b/.test(t)) return null;
  return /\b(handed (me|us|over)|gave (me|us) (a|the|his|her|their) check|wrote (me |us )?(a|the) check|said yes|agreed|accepted|committed|he's in|she's in|they're in|yes to)\b/.test(t) ? "Accepted" : null;
}
// the last few officer lines, newest last, and the line Ara said just before the officer's latest
function officerLines(n = 4) { return (G.recent || []).filter(l => l.startsWith("Officer: ")).slice(-n).map(l => l.slice(9).toLowerCase().replace(/[’‘]/g, "'")); }
function askedBefore(n = 1) { const r = G.recent || []; let i = r.length - 1; while (i >= 0 && !r[i].startsWith("Officer: ")) i--; if (i < 1) return ""; const ara = []; for (let j = i - 1; j >= 0 && ara.length < n; j--) { if (r[j].startsWith("Officer: ")) break; ara.unshift(r[j]); } return ara.join(" ").toLowerCase(); } // the last n things Ara said before the officer's latest line (Oct 25: "...move to Cultivation." then "Want to do that now?" came as two lines)
// which words in the officer's own lines ask for each form (a new form opens only on their word, Oct 25: Ara opened the ask-result form unasked after a save)
const FORM_WORDS = {
  contact: /\b(contact|person|someone|somebody|new (guy|woman|man|donor|investor)|add (him|her|them)|met (a|someone)|prospect)\b/,
  editContact: /\b(change|edit|update|fix|correct|wrong|rename|spell|email|mobile|phone number|address|texting|flag|ally|do not|capacity|rating)\b/,
  interaction: /\b(met|meeting|meet|talked|spoke|speak|call(ed)?|conversation|interaction|report|log|visit(ed)?|lunch|coffee|dinner|breakfast|event|party|email(ed)?|caught up|ran into|saw|chat(ted)?)\b/,
  editInteraction: /\b(change|edit|update|fix|correct|wrong|report|interaction|summary)\b/,
  meeting: /\b(schedule|set up|book|calendar|meeting|invite|appointment|get together)\b/,
  task: /\b(task|remind|to-do|todo|follow[- ]?up|reminder|note to)\b/,
  editTask: /\b(change|edit|update|fix|correct|wrong|task|due|move it|push|postpone|done)\b/,
  opportunity: /\b(opportunit)/,
  plan: /\b(plan|planned|ask planning|planning|add (an |a |the )?ask|an ask)\b/, /* "let's go add an ask" was refused on the Oct 26 drive */
  editPlan: /\b(change|edit|update|fix|correct|wrong|plan|planned|amount|date)\b/,
  ask: /\b(ask|asked|asking|response|answer|accepted|declined|countered|said yes|said no|turned|agreed|proposal|pitch|result|outcome)\b/,
  response: /\b(response|answer|answered|accepted|declined|countered|said yes|said no|turned|agreed|heard back|got back|wrote back|called back|came back|decision|decided|result)\b/,
  pledge: /\b(pledge|promise|commit)/,
  cultivate: /\b(cultivat|move (him|her|them|it)|defer|ready|qualif)/,
  gift: /\b(gift|check|cheque|donat|gave|give|money|payment|paid|received|wire|cash|credit card|stock|contribution)\b/,
  payment: /\b(payment|paid|pay|check|cheque|money|received|installment|gift|wire|cash)\b/,
};
function formAskedFor(action) {
  const re = FORM_WORDS[action]; if (!re || !G.live) return true;
  if (!(G.lastSaved && Date.now() - G.lastSaved.at < 120000)) return true; // the rule bites where the problem was: moving on to another form right after a save
  const ls = officerLines(3).filter(t => !/^((turn on |switch on |start |use )?(hands ?free|driving)( mode)?( on)?|(i'm|i am) driving( now)?)[.!]?$/.test(t.trim())); if (!ls.length) return true; // nothing said yet (or only "I'm driving"): a tap or typed flow
  if (ls.some(t => re.test(t))) return true;
  if (ls[ls.length - 1].split(/\s+/).length > 4 && !hfYes(ls[ls.length - 1]) && !/^(no|nope|nah|yes|yeah|yep|sure|ok|okay|please|go ahead|do it|let's do (it|that)|that's (right|fine|it))\b/.test(ls[ls.length - 1])) return true; /* a sentence of their own is a request, whatever words it uses (Oct 29 phrase-list review: "Let's do the same for Bob") */
  const last = ls[ls.length - 1], a = askedBefore(2) + " " + ((G.recent || []).filter(l => !l.startsWith("Officer: ")).slice(-1)[0] || "").toLowerCase(); // a yes to Ara offering that form counts; a yes to "shall I save it?" doesn't, even when the read-back names the form
  return (hfYes(last) || /^(yes|yeah|yep|sure|ok|okay|please|go ahead|let's|lets|do it)\b/.test(last)) && re.test(a) && !/shall i save|save it\?|save it, or change|yes to save|is that (right|correct)|ok to save|ready to save/.test(a);
}
function normCap(v) {
  if (v == null) return null; const t = String(v).trim(); if (!t) return null;
  let m = t.match(/^([A-Ea-e])(?![a-z])/); if (m) return m[1].toUpperCase();
  if (/under|less than|below/i.test(t) && /5/.test(t)) return "E";
  m = t.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(k|thousand|m|million)?/i); if (!m) return null;
  const n = parseFloat(m[1]) * (/^(m|million)$/i.test(m[2] || "") ? 1e6 : /^(k|thousand)$/i.test(m[2] || "") ? 1e3 : 1);
  return n >= 250000 ? "A" : n >= 100000 ? "B" : n >= 25000 ? "C" : n >= 5000 ? "D" : "E";
}
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function normDate(v) {
  if (v == null || v === "") return null; const t = String(v).trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ").replace(/\s+/g, " ");
  const iso = (y, m, d) => { if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null; if (!y) { y = +todayISO().slice(0, 4); if (`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` < todayISO()) y++; } if (y < 100) y += 2000;
    const out = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; return isNaN(new Date(out + "T12:00:00")) ? null : out; };
  let m;
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/))) return iso(m[3] ? +m[3] : 0, +m[1], +m[2]);
  if ((m = t.match(/^(?:[a-z]+ )?([a-z]{3})[a-z]*\.? (\d{1,2})(?: (\d{4}))?$/)) && MONTHS.includes(m[1])) return iso(m[3] ? +m[3] : 0, MONTHS.indexOf(m[1]) + 1, +m[2]);
  if ((m = t.match(/^(\d{1,2}) ([a-z]{3})[a-z]*(?: (\d{4}))?$/)) && MONTHS.includes(m[2])) return iso(m[3] ? +m[3] : 0, MONTHS.indexOf(m[2]) + 1, +m[1]);
  if (t === "today") return todayISO(); if (t === "tomorrow") return addDays(todayISO(), 1);
  return null;
}
// Ara named no rating, or one the app doesn't know: she asks which
const rateQ = (who) => rangesHeard() ? `What's ${who}'s capacity rating, A to E?` : `What's ${who}'s capacity rating? ${CAP_RANGES}`; // the ranges in full unless they were heard in the last two minutes (Oct 30)
function askRating(callId, who) { toolReply(callId, { ok: false, error: "The officer hasn't named a rating; the app is asking them. After the answer, call the tool again with it.", ask_exactly: rateQ(who || "this contact") }); }
const FOR = { contact_name: { type: "string", description: "Full name of the contact this is for, as the officer said it" } };
const TOOLS = [
  { action: "contact", name: "show_contact_draft", description: "Show a new Contact draft. A contact needs at least an email or a mobile number.", req: ["first", "last"], props: {
    first: { type: "string" }, last: { type: "string" }, email: { type: "string", description: "Written as a real address" }, mobile: { type: "string", description: "Formatted like (555) 010-0142" },
    permEmail: { type: "boolean", description: "Default true" }, permCalls: { type: "boolean", description: "Default true" }, permText: { type: "boolean", description: "Default false" },
    ally: { type: "boolean", description: "Ally - Do Not Solicit: true only if the officer says this person must not be asked for a gift" }, dnc: { type: "boolean", description: "Do Not Contact: true only if the officer says the person asked not to be contacted" },
    permSource: { type: "string", description: "Only when texting is permitted: how they agreed to texts, e.g. told Dana Rivera in person at the Spring Gala, Oct 17" }, howMet: { type: "string", description: "One short sentence: where they met and any interest" },
    capacity: { type: "string", enum: Object.keys(CAPACITY), description: "Set this whenever the officer names a rating or a dollar range for this person (say the letter, A to E). Leave it out if they say no or don't name one; never guess: " + CAPACITY_LIST } } },
  { action: "editContact", name: "show_contact_edit_draft", description: "Change details of an EXISTING contact (name, email, mobile, permissions, texting, how met, texting permission source (only when texting is on), Ally - Do Not Solicit, Do Not Contact, capacity rating). Send only the fields that change; the edit form opens with the rest filled in from the record, and the officer taps Save changes.", req: ["contact_name"], props: Object.assign({}, FOR, {
    first: { type: "string" }, last: { type: "string" }, email: { type: "string", description: "Written as a real address" }, mobile: { type: "string", description: "Formatted like (555) 010-0142" },
    permEmail: { type: "boolean" }, permCalls: { type: "boolean" }, permText: { type: "boolean" }, ally: { type: "boolean" }, dnc: { type: "boolean" },
    permSource: { type: "string", description: "Only when texting is permitted: how they agreed to texts" }, howMet: { type: "string" }, capacity: { type: "string", enum: Object.keys(CAPACITY), description: "Only if the officer gives one: " + CAPACITY_LIST } }) },
  { action: "editInteraction", name: "show_interaction_edit_draft", description: "Change a SAVED interaction report (date, type, summary, substantive, outcome). Send only what changes; the edit form opens filled in from the report, and the officer taps Save changes. Not for recorded asks: only the Chief Gift Officer corrects those. To change an existing next step, edit its task. Marking a report substantive needs a new next step and its due date (nextStep, nextDue), which creates one task.", req: ["contact_name"], props: Object.assign({}, FOR, {
    which_date: { type: "string", description: "YYYY-MM-DD date of the report to change, if the officer names one; leave out for the latest" }, date: S_DATE, meetingType: { type: "string", enum: MEET_TYPES }, summary: { type: "string" }, substantive: { type: "boolean" }, outcome: { type: "string", enum: OUTCOMES }, nextStep: { type: "string", description: "Only when marking it substantive: the next step" }, nextDue: S_DATE }) },
  { action: "editTask", name: "show_task_edit_draft", description: "Change a SAVED open task's wording or due date. Send only what changes; the officer taps Save changes. To mark it done, waiting or in progress use set_task_status instead.", req: ["contact_name"], props: Object.assign({}, FOR, {
    which: { type: "string", description: "A few words from the task's current text, so the right one is found" }, text: { type: "string", description: "The new wording" }, due: S_DATE }) },
  { action: "editPlan", name: "show_ask_plan_edit_draft", description: "Change the PLANNED ask on a contact's open opportunity (entity, campaign, planned ask date, amount, ask type, participants) before the ask is made. Send only what changes; the officer taps Save changes. A recorded ask, pledge, gift or payment can't be changed: only the Chief Gift Officer or an administrator corrects them.", req: ["contact_name"], props: Object.assign({}, FOR, {
    fund: { type: "string", enum: FUNDS }, campaign: { type: "string" }, plannedDate: S_DATE, amount: { type: "number" }, askType: { type: "string", enum: ["Outright", "Pledge", "Planned gift"] }, participants: { type: "string" } }) },
  { action: "interaction", name: "show_interaction_draft", description: "Show an Interaction report draft for a meeting or call with a contact, with optional capacity rating and one next step.", req: ["contact_name", "date", "meetingType", "summary"], props: Object.assign({}, FOR, {
    date: S_DATE, meetingType: { type: "string", enum: MEET_TYPES, description: "How it happened: In person, Phone call or Video call (Event or Email if the officer says so)" }, summary: { type: "string", description: "1-3 sentences, past tense" },
    substantive: { type: "boolean", description: "True when it was a real conversation with the person about the relationship or the gift; emails and research notes are not substantive" },
    outcome: { type: "string", enum: OUTCOMES, description: "Pick from this list only; leave out if the officer didn't say" }, capacity: { type: "string", enum: Object.keys(CAPACITY), description: CAPACITY_LIST },
    nextStep: { type: "string" }, nextDue: S_DATE }) },
  { action: "meeting", name: "show_meeting_draft", description: "Show a Schedule a meeting draft for a FUTURE meeting with a contact. Its button opens the officer's Google Calendar with the meeting filled in. (A meeting that already happened is show_interaction_draft.)", req: ["contact_name", "date", "time"], props: Object.assign({}, FOR, {
    date: S_DATE, time: { type: "string", description: "Start time, 24-hour HH:MM, e.g. 14:00" }, duration: { type: "string", enum: DURATIONS },
    meetingType: { type: "string", enum: ["In person", "Phone call", "Video call"] }, location: { type: "string" }, notes: { type: "string" }, title: { type: "string", description: "Leave out unless the officer names it" } }) },
  { action: "task", name: "show_task_draft", description: "Show a new Task draft for a contact, optionally filed on their open opportunity.", req: ["contact_name", "text"], props: Object.assign({}, FOR, {
    text: { type: "string", description: "What to do, as a short imperative, e.g. Send Ruth the annual report" }, due: S_DATE,
    onOpp: { type: "boolean", description: "True if the officer wants the task on the contact's opportunity (or is looking at it); false for the contact only" } }) },
  { action: "opportunity", name: "show_opportunity_draft", description: "Show a new Opportunity draft for a contact.", req: ["contact_name"], props: Object.assign({}, FOR, {
    fund: { type: "string", enum: FUNDS, description: "The entity receiving the money" }, campaign: { type: "string", enum: CAMPAIGNS, description: "Campaign of interest. Must suit the entity: National, or the entity's own state. " + ENTITY_RULE }, potential: { type: "number", description: "Dollars" }, notes: { type: "string" } }) },
  { action: "plan", name: "show_ask_plan_draft", description: "Show a planned Ask draft (Add planned ask) on the contact's open opportunity.", req: ["contact_name", "fund", "campaign", "plannedDate", "amount"], props: Object.assign({}, FOR, {
    fund: { type: "string", enum: FUNDS, description: "The entity receiving the money" }, campaign: { type: "string", enum: CAMPAIGNS, description: "Must suit the entity: National, or the entity's own state. " + ENTITY_RULE }, plannedDate: S_DATE, amount: { type: "number" },
    askType: { type: "string", enum: ["Outright", "Pledge", "Planned gift"] }, participants: { type: "string" } }) },
  { action: "ask", name: "show_ask_result_draft", description: "Show the Interaction report for the meeting where an ask was made, with the investor's response.", req: ["contact_name", "date", "meetingType", "response", "summary"], props: Object.assign({}, FOR, {
    date: S_DATE, meetingType: { type: "string", enum: MEET_TYPES, description: "How it happened: In person, Phone call or Video call (Event or Email if the officer says so)" }, amount: { type: "number", description: "Amount asked. When the officer says the ask was for a different figure than planned, or asks to change the amount of the ask, put that figure here; leave out to use the planned ask" }, fund: { type: "string", enum: FUNDS, description: "The entity receiving the money" },
    response: { type: "string", enum: RESPONSES, description: "Accepted (yes), Countered (a different amount), Awaiting (still thinking it over) or Declined (no)" }, agreedAmount: { type: "number", description: "Only when the investor agreed or countered with a figure different from the amount asked; never the ask amount itself" },
    lostReason: { type: "string", description: "Required when Declined: why, in a few words" }, summary: { type: "string" }, nextStep: { type: "string" }, nextDue: S_DATE }) },
  { action: "response", name: "show_ask_response_draft", description: "Show the Record the response form on a contact's open opportunity when the investor's answer to an ask that is already out comes in later (by email, phone or in person): Accepted, Countered or Declined, with the agreed or counter amount or the reason, and the date heard. Saving marks the Check on the answer task done. (The answer given at the ask meeting itself goes in show_ask_result_draft.)", req: ["contact_name", "response", "date"], props: Object.assign({}, FOR, {
    response: { type: "string", enum: ["Accepted", "Countered", "Declined"], description: "Accepted (yes), Countered (a different amount) or Declined (no)" }, agreedAmount: { type: "number", description: "Verbal figure agreed, or the counter amount" },
    lostReason: { type: "string", description: "Required when Declined: why, in a few words" }, date: Object.assign({}, S_DATE, { description: "The day the answer was heard (YYYY-MM-DD); today unless the officer says otherwise" }), nextStep: { type: "string" }, nextDue: S_DATE }) },
  { action: "pledge", name: "show_pledge_draft", description: "Show a Record pledge draft on the contact's open opportunity.", req: ["contact_name", "amount", "confirmedBy", "firstDue"], props: Object.assign({}, FOR, {
    amount: { type: "number" }, fund: { type: "string", enum: FUNDS, description: "The entity receiving the money" }, confirmedBy: { type: "string", enum: ["Email", "Phone", "In person"] }, confirmedDate: { type: "string", description: "YYYY-MM-DD; use today if not said" },
    installments: { type: "number", description: "Number of payments" }, frequency: { type: "string", enum: ["Annual", "Quarterly", "Monthly", "One payment"] }, firstAmount: { type: "number" }, firstDue: S_DATE }) },
  { action: "cultivate", name: "show_cultivation_decision", description: "Show the Move to Cultivation? decision for an opportunity in Qualification: move it, or defer with a reason and an optional reconsider-on date.", req: ["contact_name", "decision"], props: Object.assign({}, FOR, {
    decision: { type: "string", enum: ["Move to Cultivation", "Defer"] }, reason: { type: "string", description: "Required to defer" }, reconsiderOn: S_DATE }) },
  { action: "gift", name: "show_gift_draft", description: "Show a Record gift draft when money comes in on an opportunity in Ask Made or Commitment. In Ask Made the gift is an implied commitment (no pledge needed); in Commitment it is applied to the pledge. Saving closes it as Closed Won.", req: ["contact_name", "amount", "method"], props: Object.assign({}, FOR, {
    amount: { type: "number" }, fund: { type: "string", enum: FUNDS, description: "The entity receiving the money" }, date: { type: "string", description: "YYYY-MM-DD the gift arrived; use today if not said" }, method: { type: "string", enum: PAY_METHODS } }) },
  { action: "payment", hidden: true, name: "show_payment_draft", description: "Show a Record payment draft for a payment on the pledge of an opportunity in Commitment. The first payment closes it as Closed Won.", req: ["contact_name", "method"], props: Object.assign({}, FOR, {
    amount: { type: "number", description: "Leave out to use the scheduled first payment" }, date: { type: "string", description: "YYYY-MM-DD the payment arrived; use today if not said" }, method: { type: "string", enum: PAY_METHODS } }) }
];
const toolDefs = () => TOOLS.filter(t => !t.hidden).map(t => ({ type: "function", name: t.name, description: t.description + " Call it as soon as you know what the officer wants to do, with whatever you know so far, then again after each answer with everything known so far.", parameters: { type: "object", properties: t.props, required: t.req.filter(k => k === "contact_name") } }))
  .concat([{ type: "function", name: "show_screen", description: "Open a screen when the officer asks to see something. For a contact's record or opportunity, pass contact_name.", parameters: { type: "object", properties: Object.assign({ screen: { type: "string", enum: ["home", "contacts", "opportunities", "tasks", "contact_record", "opportunity_record", "how_it_works"] } }, FOR), required: ["screen"] } },
    { type: "function", name: "show_needs_attention", description: "Show the officer's Needs attention list on Home, filtered when they ask (\"What's overdue?\", \"Show only my tasks\"). Returns the items, most urgent first, to read out briefly. filter hands_free lists the saves made by voice that the officer hasn't checked yet (\"What hands-free saves do I need to approve?\").", parameters: { type: "object", properties: { filter: { type: "string", enum: ["all", "overdue", "opportunities", "tasks", "contacts", "hands_free"] } }, required: ["filter"] } },
    { type: "function", name: "call_contact", description: "Put a Call button for a contact on screen when the officer wants to phone them. The officer taps it; the phone places the call.", parameters: { type: "object", properties: FOR, required: ["contact_name"] } },
    { type: "function", name: "get_giving", description: "Look up a contact's giving: lifetime total, this year's total, the last gift with its date, and any open pledge balance. Also opens their contact record.", parameters: { type: "object", properties: FOR, required: ["contact_name"] } },
    { type: "function", name: "get_contact_details", description: "Read every field on a contact's record: email, mobile, contact permissions (email, calls, texting), Ally - Do Not Solicit, Do Not Contact, texting permission source (only when texting is permitted), how we met, capacity rating, status and gift officer. Each field says who is allowed to change it. Also opens their contact record. Use it whenever the officer asks for a contact's email, phone, permissions or any other detail.", parameters: { type: "object", properties: FOR, required: ["contact_name"] } },
    { type: "function", name: "get_opportunity_details", description: "Read every field on a contact's opportunity (the open one, or the latest closed one): name, stage, gift officer, potential, entity, every ask with its planned date, amount, type, campaign, participants and status (original and revised), pledge terms and payments, gift, close reason and any deferral. Each field says who is allowed to change it. Also opens the opportunity. Use it whenever the officer asks about an opportunity, ask, pledge or planned ask date.", parameters: { type: "object", properties: FOR, required: ["contact_name"] } },
    { type: "function", name: "show_list", description: "Open the Opportunities or Tasks screen on one of its views when the officer asks to see a list, for example \"show pledges to record\", \"show my opportunities that need attention\", \"show my waiting tasks\" or \"show what I finished\". To have tasks read out, use get_my_tasks.", parameters: { type: "object", properties: {
      list: { type: "string", enum: ["opportunities", "tasks"] }, view: { type: "string", enum: ["open", "attention", "quarter", "pledges", "closed", "overdue", "week", "waiting", "done"], description: "Opportunities: open, attention (needs attention), quarter (asks this quarter), pledges (pledges to record), closed (closed this year). Tasks: open, overdue, week (due this week), waiting, done" },
      search: { type: "string", description: "Optional words to search the list for, such as a name or entity" } }, required: ["list", "view"] } },
    { type: "function", name: "get_my_tasks", description: "Read the officer's open tasks (not done), soonest due first, with any overdue ones marked. Also opens the Tasks screen. Use it when the officer asks what's on their list, what's due, or what's overdue.", parameters: { type: "object", properties: { which: { type: "string", enum: ["all", "overdue", "due_today", "this_week", "waiting", "in_progress"], description: "Which open tasks: all (default), overdue only, due today or earlier, due in the next seven days, the ones waiting on someone, or the ones in progress" }, contact_name: { type: "string", description: "Only the tasks for this person, when the officer asks for one person's tasks" } }, required: [] } },
    { type: "function", name: "get_contact_history", description: "Read a contact's interaction history (meetings, calls and asks, newest first) and their open tasks, including tasks on their opportunity. Also opens their contact record. Use it when the officer asks about past interactions with a contact, what happened last time, or what's outstanding for a contact.", parameters: { type: "object", properties: Object.assign({ focus: { type: "string", enum: ["history_and_tasks", "history", "tasks"], description: "What the officer asked for; default both" } }, FOR), required: ["contact_name"] } },
    { type: "function", name: "highlight_stage", description: "During the process overview, light up one stage on the How it works screen. Call it just before you describe that stage.", parameters: { type: "object", properties: { stage: { type: "string", enum: FLOW.map(f => f.stage) } }, required: ["stage"] } },
    { type: "function", name: "set_user_name", description: "Save the first name of the person using the app. Call it as soon as they say it, with confirmed false; the app tells you how to check the spelling with them. Call it again with confirmed true once they say it's right (with their spelling if they corrected it).", parameters: { type: "object", properties: { first_name: { type: "string" }, confirmed: { type: "boolean", description: "true only after the person has said the name and spelling you read back are right" } }, required: ["first_name"] } },
    { type: "function", name: "set_capacity_rating", description: "Set or change an existing contact's capacity rating (how much they could give). First call it with confirmed false and read back the change; only after the officer says yes, call again with confirmed true.", parameters: { type: "object", properties: Object.assign({ rating: { type: "string", enum: Object.keys(CAPACITY), description: CAPACITY_LIST }, confirmed: { type: "boolean" } }, FOR), required: ["contact_name", "rating", "confirmed"] } },
    { type: "function", name: "set_task_status", description: "Change a task's status: to do, in progress, waiting (on someone, with a check-back date) or done. First call it with confirmed false: the app finds the task and shows it; read back what will change and ask the officer to confirm. Only after they say yes, call again with confirmed true.", parameters: { type: "object", properties: Object.assign({ task: { type: "string", description: "Words from the task as the officer said them, e.g. 'pledge decision' or 'Pennsylvania update'" }, status: { type: "string", enum: ["to_do", "in_progress", "waiting", "done"] }, check_back_on: { type: "string", description: "YYYY-MM-DD to check back, for waiting; leave out if not said" }, confirmed: { type: "boolean" } }, FOR), required: ["task", "status", "confirmed"] } },
    { type: "function", name: "set_speaking_speed", description: "Change how fast you talk when the officer asks you to speak faster or slower (or normally). The choice is remembered on this phone.", parameters: { type: "object", properties: { change: { type: "string", enum: ["faster", "slower", "normal"] } }, required: ["change"] } },
    { type: "function", name: "say_next_step", description: "When the officer asks what's next, what the next step is, or what to do now for a contact or opportunity (not how the whole process works): the app says the next step in the process itself. Leave contact_name out for the contact or opportunity on screen.", parameters: { type: "object", properties: { contact_name: { type: "string", description: "The contact, if they named one" } } } },
    { type: "function", name: "get_process_faq", description: "Look up the Process FAQ (from the Chief Gift Officer's Guide) for a question about the process: who can do what, stage rules, flags, alerts, pledges and gifts, settings or terms. Returns the closest questions and answers; answer only from them.", parameters: { type: "object", properties: { question: { type: "string", description: "The officer's question, in their words" } }, required: ["question"] } },
    { type: "function", name: "get_demo_changes", description: "Look up what has changed in this proof of concept since it was first released on Oct 18, 2026, from its change log: what's new, when something changed, or why it works the way it does. Pass a few keywords as topic (for example \"task status\" or \"confetti\"), or leave topic out for the latest changes.", parameters: { type: "object", properties: { topic: { type: "string" } }, required: [] } },
    { type: "function", name: "pass_question_to_team", description: "Send a question you can't answer, or a problem or suggestion about the proof of concept, to the project team. Only call it after the officer says yes to passing it on. Write it in the officer's own words, with any detail they gave.", parameters: { type: "object", properties: { question: { type: "string" } }, required: ["question"] } },
    { type: "function", name: "save_form", description: "Hands-free mode only: save the open form for the officer, who is driving and can't tap. First call it with confirmed false: the app gives you a read-back to say word for word. Call it again with confirmed true only after the officer says yes to that read-back. A gift or pledge then gets a second check of the amount, and needs a second yes. The app checks the officer's own words before saving.", parameters: { type: "object", properties: { confirmed: { type: "boolean" } }, required: ["confirmed"] } },
    { type: "function", name: "set_hands_free", description: "Turn hands-free (driving) mode on or off when the officer asks, for example \"I'm driving\" or \"I've parked\". In hands-free mode you read each finished form back and save it when they say yes.", parameters: { type: "object", properties: { on: { type: "boolean" } }, required: ["on"] } },
    { type: "function", name: "optional_fields", description: "Go through a new contact's or new opportunity's optional fields one at a time; the app asks the questions and fills in the answers. step: start (the officer said yes to adding more details), answer (pass the officer's answer to the question you just asked, in their words, as value), skip (they want to skip this one), back (they want to go back to an earlier question, or answer a different one: pass which as field), stop (they've had enough). Each reply tells you exactly what to say next. Never save or read back while these questions are going on, unless the reply says they are done.", parameters: { type: "object", properties: { step: { type: "string", enum: ["start", "answer", "skip", "back", "stop"] }, value: { type: "string", description: "With answer: the officer's answer, for example \"D\", \"yes\", \"neither\", \"C4\", \"50000\" or a sentence. With back: their answer to that question, if they gave one" }, field: { type: "string", description: "With back: which question, in a word or two, for example \"entity\", \"campaign\", \"amount\", \"notes\", \"capacity\", \"how we met\", \"flags\"" } }, required: ["step"] } },
    { type: "function", name: "show_visitor", description: "Send one of the seasonal visitors across the screen when the officer asks for one (\"make the owl appear\", \"send the skeleton\"). Spooky mode: spider, pumpkin, ghost, bat, owl, skeleton. Christmas mode: snow, gift, elf, reindeer, sleigh, tree.", parameters: { type: "object", properties: { visitor: { type: "string", enum: ["spider", "pumpkin", "ghost", "bat", "owl", "skeleton", "snow", "gift", "elf", "reindeer", "sleigh", "tree"] } }, required: ["visitor"] } },
    { type: "function", name: "set_spooky_mode", description: "Turn spooky mode (Halloween fun: a night look for the app, you as a haunted-house host, spooky sounds) on when the officer says \"spooky mode\", or off when they say \"normal mode\". It only exists in October.", parameters: { type: "object", properties: { on: { type: "boolean" } }, required: ["on"] } },
    { type: "function", name: "set_christmas_mode", description: "Turn Christmas mode (Christmas cheer: an evergreen look with a nativity scene, you as a warm Christmas host, sleigh bells and Santa's \"ho ho ho\") on when the officer says \"Christmas mode\", or off when they say \"normal mode\". It exists in December (and any time on the preview).", parameters: { type: "object", properties: { on: { type: "boolean" } }, required: ["on"] } },
    { type: "function", name: "close_form", description: "Close the open form without saving (close), or clear it to start again (clear), when the officer asks in words the app didn't already carry out. Never say a form was closed or cleared unless this returns ok.", parameters: { type: "object", properties: { change: { type: "string", enum: ["close", "clear"] } }, required: ["change"] } },
    { type: "function", name: "stop_conversation", description: "End the call because the officer wants to stop for now. Say a short, warm goodbye first (for example \"Great work today, talk soon!\"; vary it), then call this.", parameters: { type: "object", properties: {}, required: [] } }]);

function crmSnapshot() {
  const Y = todayISO().slice(0, 4);
  return S.contacts.map(c => { const o = openOpp(c.id), a = latestAsk(o), done = S.opps.filter(x => x.contactId === c.id && x.stage === "Closed" && String(x.closedOn || "").slice(0, 4) === Y);
    return `${nameOf(c)} (${c.status}${c.capacity ? ", capacity " + c.capacity : ""})${o ? ": opportunity in " + o.stage + (a ? `, ask ${money(a.amount)} ${a.status.toLowerCase()}` : "") + (nextStep(o) ? `, next step: ${nextStep(o).line}` : "") : oppReady(c) ? ": no open opportunity, ready for one" : ": no open opportunity"}${done.length ? `; closed this year: ${done.map(x => `Closed ${x.closed} on ${fmtDate(x.closedOn)}`).join(", ")}` : ""}`; }).join("; ");
}
const SPOOKY_RULES = `SPOOKY MODE IS ON. The officer asked for some Halloween fun, so play a warm, theatrical haunted-house host: speak a little slower, with relish, and now and then (not every turn, at most one per turn) add a short spooky aside about the house itself, such as "Mind the cobwebs.", "The candles flicker in approval.", "Ooh, I heard the floorboards creak." or "Welcome back to the haunted CRM.". Vary them. Everything else is unchanged: every fact, name, number, date and question is exactly as normal, any words you're told to say exactly are said exactly, and all the saving rules apply. The asides are never about investors, money, giving, flags or the officer's mistakes. If they say "normal mode", call set_spooky_mode with on false.`;
const XMAS_RULES = `CHRISTMAS MODE IS ON. The officer asked for some Christmas cheer, so be a warm, jolly, traditional Christmas host: cheerful and kind, and now and then (not every turn, at most one per turn) add a short festive aside about the season, such as "The tree lights are twinkling.", "I can hear sleigh bells.", "Fresh snow on the rooftops tonight." or "The elves are busy in the workshop.". Vary them. Everything else is unchanged: every fact, name, number, date and question is exactly as normal, any words you're told to say exactly are said exactly, and all the saving rules apply. The asides are never about investors, money, giving, flags or the officer's mistakes, and never joke about the nativity, Jesus or anyone's faith. If they say "normal mode", call set_christmas_mode with on false; if they say "spooky mode", call set_spooky_mode with on true.`;
const HF_RULES = `HANDS-FREE MODE IS ON (it is on from the start of every conversation). The officer may be driving and can't look at or tap the screen, so this overrides "You never save anything" and every "tap the button". Keep each turn short and never describe what's on screen. When a draft has everything it needs, the app reads it back itself and asks "Shall I save it?": never read it back yourself or ask whether it's correct, and never ask them to tap. Call save_form with confirmed true only right after the officer says yes to the app's read-back; the app checks their words too. If they change something, update the draft and the app reads it back again. Scheduling a meeting needs Google Calendar on screen, so keep it as a draft for when they've parked. If they say they've parked or want to tap themselves, call set_hands_free with on false.`;
function grokInstructions() {
  const first = OFFICER.split(" ")[0];
  return `## Role & Persona
- You are ${botName()}, the voice assistant inside Citizens VCRM (built on Veleer), the fundraising CRM used by Citizens Alliance. If asked your name, say it. Introduce yourself by name once per conversation at most.
- ${S.settings.userName ? `You are talking with ${OFFICER}, a gift officer, on their phone; call them ${first}.` : `You are talking with a gift officer on their phone and don't know their name yet. Before anything else, even if they already asked for something, say "Hi, I'm ${botName()}, what's your first name?"; when they answer, call set_user_name straight away, then carry on with what they asked.`}
- Today is ${longToday()} (${todayISO()}).

## Objective
- Help the officer do their CRM work by voice: the app's forms fill in as they talk, and you ask only for what is still needed.
- They can do any of these, in any order, for any contact: add a contact, log a meeting, add a task, create an opportunity, move it to Cultivation (or defer), plan an ask, record an ask and the response, record a pledge or gift, phone a contact, schedule a meeting in Google Calendar, or see a screen.
- You never save anything: the officer taps the button, or in hands-free mode the app saves after their spoken yes.

## Conversation Flow
### Drafts
- As soon as the officer says what they want to do (and for whom), call the matching draft tool straight away with whatever they have said, so the form is on screen before you ask anything.
- Then ask for what is still needed, one question at a time; after each answer call the tool again so the form fills in as they talk. If they correct something, call the tool again.
- If they ask a side question while a question of yours is open (a spelling, what a word means), answer it, then ask your question again in full words ("What's an email address or mobile number for Igor?"), never "one of those".
- If they ask how to do a task ("how do I add a contact"), start doing it with them straight away, saying in one short sentence that you'll fill in the form together as they talk ("We'll fill in the form together as you talk").
- When the tool reply says nothing more is needed, ask them to check the draft and tap the button named in the reply's "button", using that exact label (say "tap Record pledge", never "tap Save" when the button says something else).
- Only say something is saved after the app tells you so. If a tool returns an error, explain it in one sentence and offer the fix or the step it suggests.
- The officer can say "cancel", "undo", "go back", "start over" or "say that again" at any time: the app carries these out itself and tells you what it did, so don't act on those words yourself. If they ask in other words to close, cancel or clear the open form and the app said nothing, call close_form. Never say a form was closed, cancelled, cleared or reset unless the app says so.
- After a save the app itself says it's saved and the next step, then "Do you want to do that now, yes or no?": don't repeat it. Yes opens that step (its tool, never save_form); "no, <something>" means do that; a bare no is answered by the app. Never ask an open "what would you like to do?" or "what's next?" when a next step exists. After a drop, say where we were ("Where we are" under Right now) before the pending question. Never ask if they want to stop or are done. Never start another task on your own. If they want to stop, say a brief goodbye and call stop_conversation.
- You can see saves: the app tells you each one and lists them under Right now. If the officer asks whether something saved, answer from that; never say you can't see saves.
### Task by task
- New contact: always ask for their email and their mobile number (one at a time, skipping any already given); a contact needs at least one to save. Then the app has you ask once whether they'd like to add more details; if yes, call optional_fields with step start and let the app lead: it asks one question at a time and fills in each answer itself. Pass every answer to optional_fields (step answer, their words as value); "skip" and "that's enough" are steps skip and stop. Never list the optional fields or jump ahead of the app's questions. The same goes for a new opportunity's optional details.
- Existing contact: to change their details call show_contact_edit_draft with only what changes; never use show_contact_draft for someone who is already a contact.
- Logging a meeting (show_interaction_draft) or recording an ask (show_ask_result_draft): if the officer hasn't said how it happened, ask "Was it in person, a phone call, or a video call?" Always pass date (resolved, e.g. yesterday) and meetingType; left out, the draft shows today and In person.
- A substantive meeting whose outcome isn't Not interested or Referred elsewhere needs a next step and its due date, and so does an ask unless the investor declined: if not said, explain in one sentence that it becomes a Task for them, then ask whether they want to set it now and what it is and when it's due, before asking them to save. Never suggest the step, the date or the way of contacting anyone.
- Booking a future meeting is show_meeting_draft (ask for the day and start time if not said). After they tap Add to Google Calendar, Google Calendar opens and the conversation ends.
- Adding a task: always ask for the due date if none was said ("When is it due?"). If the contact has an open opportunity and the officer hasn't said, ask whether the task is for the contact or for their opportunity.
- Task status: when the officer says a task is done, started, or that they're waiting on someone, call set_task_status (confirmed false), read back the change, and only after they say yes call it again with confirmed true.
- After reading one task aloud, don't ask "Shall I open it?": offer the choices in one short line, such as "Change the date, mark it done, or hear their giving?". While the officer is working through their task list, keep any next-step offer after a save to one short clause ("Saved. Next overdue is ...") and go on to the next task rather than offering a new form.
- Phoning: call call_contact. Only offer calls the app allows (the contact needs a phone number and Calls permitted on).
- Editing saved records: show_contact_edit_draft (contact), show_interaction_edit_draft (a logged meeting or call), show_task_edit_draft (a task's wording or due date), show_ask_plan_edit_draft (a planned ask). A recorded ask, pledge or gift can't be edited by a gift officer: say only the Chief Gift Officer or an administrator can correct it, and never claim it changed.
- When the officer asks you to talk faster, slower or at normal speed, call set_speaking_speed; it is remembered on this phone.
### Stage rules the app enforces
- An opportunity can be created only when the contact has a capacity rating, isn't Do Not Contact or an Ally - Do Not Solicit, and has no other open opportunity. If the app says they aren't ready, explain what's already true and what's still to do, and offer set_capacity_rating when the rating is missing. If the officer asks to create one for a contact who already has one, call show_opportunity_draft anyway and relay what the app says.
- Qualification to Cultivation needs a capacity rating, a substantive interaction and the officer's confirmation (show_cultivation_decision), or a defer with a reason. An ask can be planned only in Cultivation; the app adds a reminder task due seven days before the planned date.
- Ask responses are Accepted, Countered, Awaiting or Declined. A gift or check handed over when asked, or any yes, is Accepted; Awaiting is only for "still thinking it over". Always send the response. A declined ask closes the opportunity as Closed Lost and needs a reason, so ask why if the officer hasn't said. After Accepted or Countered the app adds a Follow up on agreed pledge task.
- "Change the amount of the ask" or "the ask was for $X" means the amount asked (the amount field), not the agreed amount; agreedAmount is only a figure the investor agreed or countered with that differs from the ask.
- An ask recorded as Awaiting needs a follow-up task to get the answer: the app suggests the words ("Follow up with <first name> to get an answer on the ask", due ${ASK_CHECK_DAYS} days on) and the officer says yes or gives their own; that task is the next step on the form, and tapping it later opens Record the response. When the answer comes in later, use show_ask_response_draft (Accepted, Countered or Declined, with the date heard); saving it, or recording a pledge or gift, marks that task done.
- A yes to an OUTRIGHT ask moves the opportunity straight to Commitment, waiting for the gift; a pledge ask stays in Ask Made until the pledge is recorded with its schedule.
- Whenever money comes in, use show_gift_draft: in Ask Made a gift with no pledge is an implied commitment (it passes through Commitment and closes as Closed Won); in Commitment the gift is applied to the pledge and the first one closes it as Closed Won. A closed opportunity is final; the next gift starts a new opportunity.
### Looking things up (always call the tool; never answer from memory, since records change)
- Contact details (email, phone, permissions, Ally or Do Not Contact, how we met, rating): get_contact_details, then read the field they asked for. Anything about an opportunity, ask, pledge, gift or planned ask date: get_opportunity_details.
- If they ask to change a field, follow its who_can_change note: fields only the system or the Chief Gift Officer can change are never changed by you; explain the rule in one sentence and offer the proper action.
- Giving (lifetime, this year, last gift): get_giving, and speak its figures; never estimate them.
- Their tasks, what's due or overdue: get_my_tasks. To just show a list: show_list. Past interactions, what happened last time, or what's outstanding for a contact: get_contact_history (focus history, tasks, or both).
- Preparing for a meeting: get_contact_history for that contact, then a spoken briefing in three or four sentences: their giving (last gift and this year's total), where their opportunity stands and the latest ask, anything outstanding, and one suggested goal for the meeting.
- What's next, the next step, or what to do now for a contact or opportunity ("what's the next step?", "what do I do next?"): call say_next_step and the app says it. Only a question about how the whole process works gets the tour below.
### Questions about the process
- Questions about who can do what, rules, flags, alerts, settings or terms: call get_process_faq with the question, then answer only from what it returns and the stages below, in one to three spoken sentences, using its exact names for buttons, stages, flags and alerts. Do not guess, generalise from other CRMs, or fill gaps. If two answers seem to disagree, give the more specific one.
- If the answer isn't there, say plainly that it isn't covered in this proof of concept and offer to pass the question to the project team; if the FAQ says something is still open with the customer, say that.
- If the officer says "Review FAQ" or asks what they can ask about, name four or five of these topics in one or two sentences, give one example question, and ask what they'd like to know: ${faqTopics().join(", ")}.
- Questions about the proof of concept itself (what's new, what changed, when or why): call get_demo_changes with a few keywords and answer in one to three sentences with the date. Don't read the whole list out.
- When you can't answer from the FAQ, the list of changes or their data, or the officer reports a problem or makes a suggestion about the proof of concept, say so briefly and ask "Shall I pass that to the project team?" Only after they say yes, call pass_question_to_team with it in their words, then say the team will see it. A yes in any words ("sure", "do that", "go ahead") counts, even when they ask for something else in the same breath: call pass_question_to_team first, then help with the new request. Never promise when or how the team will reply.
### The process overview
- If the officer asks how the process works, for an overview, or to be walked through it (not how to do one task, and not their own next step, which is say_next_step): call show_screen with how_it_works and then highlight_stage for Contact straight away, without saying anything first, then open with the short introduction the tool reply gives you and give a spoken tour, one stage at a time in order.
- For each stage: call highlight_stage, say one or two plain sentences (what the stage means and what has to happen to move on), then ask "Shall I go on to <next stage>?" and wait. On yes, call highlight_stage for the next stage straight away, before saying anything, and never repeat or finish what you already said; on no, stop and ask what they'd like to do. If they ask you to go straight through, do the remaining stages without asking between them.
- After the last stage (Closed Won), ask if they have questions or want to try a step. If they interrupt with a question, answer it, then ask whether to carry on with the stage you were on.
- The stages:
${flowScript()}
${G.hands ? "### Hands-free mode\n- " + HF_RULES + "\n" : ""}
## Guardrails
${PROV().rules ? PROV().rules + "\n" : ""}- Ask at most one question at a time, and only for a required field the officer hasn't said. Never ask about optional fields, except the ones named above (email, mobile, the optional-field questions the app gives you, and the next step for a substantive meeting).
- Never make up details: leave out anything the officer didn't say, such as a capacity rating, whether a meeting was substantive, its outcome or a next step. Never suggest a next step, a date or a way of contacting someone: ask, and let the officer decide. A field you could guess is still left empty: a guessed value the officer confirms by habit is worse than a question.
- Call the money's recipient the "entity" (C3, C4 or PAC), never "fund". Use these short names (never "C.A." or "Citizens Alliance"), as the fund value too. The only entities, by state: ${ENTITIES_BY_STATE()}. Never name any other; for a state, list exactly those.
- Say "gift", never "payment". Write spoken email addresses as real addresses. Resolve relative dates against today.
- When the officer spells something letter by letter, use exactly those letters in the field they mean; "T as in Tom" and words like Tango or Delta stand for their first letter. When they correct how a name is spelled, ask once whether the email address should change to match.
- Never joke about investors, money, Do Not Contact or Ally flags, or the officer's mistakes.
- After a save, never ask "what next?" or "what would you like to do?": say the next step the app gives you and ask yes or no.

## Voice & Communication Style
- Speak warmly and briefly: one or two short sentences per turn.
- Friendly, upbeat and a little playful, like a favourite colleague: everyday contractions and, now and then, a light touch of a few words ("Nice!", "Love it.", "Ooh, good one.", "Got it!"); vary your wording so you never sound scripted.
- Share in the officer's wins and show a little sympathy when something goes badly. Never let personality add a sentence or slow down a task.
- Never read the app's guidance, tool fields or anything in brackets aloud; speak only what the officer should hear.
${spookyMode() ? "- " + SPOOKY_RULES + "\n" : ""}${xmasMode() ? "- " + XMAS_RULES + "\n" : ""}${spookyMode() || xmasMode() ? "- No asides on a line the app gives you word for word, when the line has just reconnected, or when hanging up.\n" : ""}
## CRITICAL
- Lines the app gives you word for word stay exact.
- If the officer asks what you can do, say exactly: "${CAN_DO}"
- If they ask what they can say, what phrases or commands you understand, or for the voice commands, say exactly: "${CMD_LIST}"

## Right now
The app keeps this section up to date during the conversation.
${ctxNow()}`;
}
// what changes during a call (saves, the screen, the records): the Right now section, refreshed with a session update
function ctxNow() {
  const f = focusContact();
  return `${(G.saves || []).length ? `Saved so far in this conversation: ${G.saves.join("; ")}.` : "Nothing has been saved yet in this conversation."}
${f ? `On screen now: ${nameOf(f)}; an unnamed contact means them.\n` : ""}${V && document.getElementById("draftForm") ? draftSummary() + " If the officer asks about it, carry on with it; don't open a new form for the same person.\n" : ""}${G.justNow && Date.now() - G.justNow.at < 180000 ? "Just now: " + G.justNow.text + "\n" : ""}${!(V && document.getElementById("draftForm")) ? "No form is open now (nothing to save).\n" + (typeof whereWeAre === "function" && whereWeAre().kind !== "none" ? "Where we are: " + whereWeAre().line + "\n" : "") : ""}State v${G.syncN || 0}. Contacts and opportunities: ${crmSnapshot()}.`;
}
// what changes Ara's rules, so the full instructions go again only when one of these does
const rulesKey = () => JSON.stringify([!!G.hands, S.settings.userName || "", botName(), spookyMode(), xmasMode()]);
// The Process FAQ is looked up with get_process_faq instead of being sent whole with every set of instructions
let FAQ_CACHE = null; // built on first use, since FAQ_TEXT is defined further down the page
const faqPairs = () => FAQ_CACHE || (FAQ_CACHE = (() => { const out = []; let sec = "";
  FAQ_TEXT.split("\n## ").forEach((part, i) => { if (i) sec = part.split("\n")[0].trim();
    part.split(/\nQ: /).slice(1).forEach(qa => { const [q, ...a] = qa.split(/\nA: /); out.push({ section: sec, q: q.trim(), a: a.join(" ").trim().replace(/\n\s*\n[\s\S]*$/, "") }); }); });
  return out; })());
const faqTopics = () => [...new Set(faqPairs().map(p => p.section))];
const FAQ_STOP = new Set("a an the and or of to in on for is are was be can do does did how what who when why which where i we you my our it its this that with from by as at if then than there their them they me about any not no yes should would could will".split(" "));
const faqWords = (t) => String(t).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 1 && !FAQ_STOP.has(w)).map(w => w.replace(/(ies)$/, "y").replace(/(es|s)$/, ""));
function faqLookup(question, n = 6) {
  const ws = [...new Set(faqWords(question))]; if (!ws.length) return [];
  return faqPairs().map(p => { const q = faqWords(p.q), a = faqWords(p.a), s = faqWords(p.section);
    return { p, score: ws.reduce((t, w) => t + (q.includes(w) ? 3 : 0) + (a.includes(w) ? 1 : 0) + (s.includes(w) ? 1 : 0), 0) }; })
    .filter(x => x.score > 0).sort((x, y) => y.score - x.score).slice(0, n).map(x => x.p);
}

const G = { live: false, ws: null, ctx: null, stream: null, node: null, sources: [], playHead: 0, bot: "", status: "", handled: new Set(), buf: [] };
const callbar = () => document.getElementById("callbar");
// Caption: each reply's words, scrolled in step with its audio. Replies queue up, so show the one being heard now.
function capNow() {
  if (!G.caps || !G.caps.length || !G.ctx) return null;
  const now = G.ctx.currentTime;
  return G.caps.find(c => c.t0 != null && now < c.t1) || G.caps.filter(c => c.text && (c.t0 == null || now >= c.t0)).pop() || null;
}
function capTick() {
  const el = document.getElementById("cbCap"); if (!el) return;
  const c = capNow();
  if (!c || !c.text) { el.hidden = true; el.textContent = ""; return; }
  el.hidden = false; if (el.textContent !== c.text) el.textContent = c.text;
  const lines = Math.round(el.scrollHeight / 18);
  if (lines <= 2) { el.scrollTop = 0; return; }
  const frac = c.t0 == null ? 0 : Math.max(0, Math.min(1, (G.ctx.currentTime - c.t0) / Math.max(0.1, c.t1 - c.t0)));
  const line = Math.min(lines - 2, Math.max(0, Math.floor(frac * lines) - 0)); // the line being spoken sits on top, the next one below it
  if (el.scrollTop !== line * 18) el.scrollTop = line * 18;
}
setInterval(() => { if (G.live) capTick(); }, 200);
function paintCall() {
  const el = callbar(); if (!el) return;
  document.body.classList.toggle("incall", G.live);
  el.hidden = !G.live;
  if (!G.live) return;
  el.innerHTML = `<div class="cb-in"><span class="dot ${/^(Connecting|Reconnecting)/.test(G.status) ? "a" : "g"}"></span><div class="cb-t"><b>${esc(G.status)}</b><div class="cb-cap" id="cbCap" hidden></div>${G.saveCheck ? `<div class="cb-yes">Say “yes” to save</div>` : ""}</div><button class="btn quiet cb-hf${G.hands ? " on" : ""}" data-act3="hands" aria-pressed="${!!G.hands}" title="${G.hands ? "Hands-free is on: Ara saves when you say yes. Tap to turn it off" : "Hands-free is off: tap to let Ara save when you say yes"}">${CAR} ${G.hands ? "Turn hands-free off" : "Turn hands-free on"}</button><button class="btn quiet cb-end" data-act3="end">End</button></div>`;
  capTick();
}
const TOKEN_URL = "https://veleer-voice.klaracey.workers.dev"; // shared key-holder service; anyone with a demo link can start a conversation
const DEMO_CODE = "veleer2026"; // built in at the owner's request so nobody has to type it; change it here and in Cloudflare together
const tokenUrl = () => S.settings.xaiTokenUrl || TOKEN_URL;
const canTalk = () => !!tokenUrl();
/* Activity log: each conversation's words (what the officer said, Grok's replies, the steps Grok took) go to the Worker,
   which saves them with this phone's random ID, the name given, and the rough location Cloudflare sees. Told to the user in the welcome popup and Settings. */
const ACT = { ready: null, q: [], timer: null };
// Unsent log rows also sit in the phone's storage until the key holder has them (Oct 28: the end of a call was lost when iOS discarded the locked page), and the queue is sent at once when the page hides
const ACT_KEY = "actPending";
function keptRows() { if (!ACT.kept) { try { ACT.kept = JSON.parse(localStorage.getItem(ACT_KEY) || "[]"); } catch (e) { ACT.kept = []; } } return ACT.kept; }
function actPending(fn) { const rows = keptRows(); const out = fn(rows) || rows; ACT.kept = out.slice(-200); actStore(); }
// the copy goes to the phone's storage at most every 2 s, and at once when the page hides (Oct 28: a write on every row, several a second while the
// officer talks, came in with the 1:49 PM build, and every call since then died without a word; the writes are the one thing those calls shared)
function actStore(now) {
  if (!now) { if (!ACT.storeTimer) ACT.storeTimer = setTimeout(() => actStore(true), 2000); return; }
  clearTimeout(ACT.storeTimer); ACT.storeTimer = null; try { localStorage.setItem(ACT_KEY, JSON.stringify((ACT.kept || []).map(r => ({ ...r, text: String(r.text).slice(0, 600) })))); } catch (e) {}
}
function actRestore() { actPending(rows => { if (rows.length) { ACT.q.push(...rows.map(r => ({ ...r, tries: 0 }))); vlog(`${rows.length} log rows kept from the last page are being sent`); clearTimeout(ACT.timer); ACT.timer = setTimeout(flushAct, 1500); } return rows; }); }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { actStore(true); if (ACT.q.length) { clearTimeout(ACT.timer); flushAct(); } } });
window.addEventListener("pagehide", () => actStore(true));
function deviceId() {
  if (!S.settings.deviceId) { S.settings.deviceId = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + "-" + uid() + uid()); save(); }
  return S.settings.deviceId;
}
async function logReady() {
  if (ACT.ready !== null) return ACT.ready;
  try { const r = await fetch(tokenUrl().replace(/\/$/, "") + "/log"); ACT.ready = r.ok && !!(await r.json()).logging; } catch (e) { ACT.ready = false; }
  vlog("activity log " + (ACT.ready ? "on" : "off")); return ACT.ready;
}
// outside a conversation, taps are grouped into a visit (a new one after 30 quiet minutes)
function visitId() { const now = Date.now(); if (!G.visit || now - G.visit.last > 30 * 60000) G.visit = { id: deviceId().slice(0, 8) + "-v" + now.toString(36) }; G.visit.last = now; return G.visit.id; }
// its own change log (demo-changes.json), loaded the first time Ara is asked about it
let CHANGES = null;
async function demoChanges() {
  if (CHANGES) return CHANGES;
  try { const r = await fetch("demo-changes.json?b=" + encodeURIComponent(BUILD)); CHANGES = r.ok ? (await r.json()).changes || [] : []; } catch (e) { CHANGES = []; }
  if (!CHANGES.length) CHANGES = null; return CHANGES || [];
}
function act(role, text, sess) {
  if (!text) return; const session = sess || G.session || visitId();
  const row = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), at: new Date().toISOString(), role, text: String(text).slice(0, 4000), session }; // the id lets the key holder drop a batch that arrives twice (Oct 25: a resent batch doubled 20 s of log)
  ACT.q.push(row); actPending(rows => { rows.push(row); });
  G.lastRow = { text: `${role}: ${row.text.slice(0, 120)}`, at: Date.now() }; // the 1 s tick keeps a copy of the call in case the phone closes the page without a word (keepAlive)
  clearTimeout(ACT.timer); ACT.timer = setTimeout(flushAct, role === "end" ? 0 : 4000);
}
// what was in a form when Save was tapped, for the activity log (the privacy notice says so)
function formLog(A, d, fromVoice, typed) {
  const parts = A.fields.map(f => { const v = d[f.k]; if (v === null || v === undefined || v === "" || (f.type === "bool" && !v && !(f.k in d))) return "";
    const shown = f.type === "bool" ? (v ? "yes" : "no") : f.type === "money" ? money(v) : String(v);
    return `${f.label}: ${shown}${fromVoice && fromVoice.has(f.k) ? " (by voice)" : ""}`; }).filter(Boolean);
  return `${A.title}${typed ? " (opened by tapping)" : ""}. ${parts.join("; ")}`;
}
// phones that accepted the notice before form contents were logged are told once
function formLogNotice() {
  if (!S.settings.seenPrivacy || S.settings.seenFormLog || document.getElementById("fmbar")) return;
  const bar = document.createElement("div"); bar.id = "fmbar"; bar.className = "updbar";
  bar.innerHTML = `<b>To improve the proof of concept, it now also saves what is in each form when you tap Save. Settings has the full notice.</b><button type="button">OK</button>`;
  bar.querySelector("button").onclick = () => { S.settings.seenFormLog = true; save(); bar.remove(); };
  document.body.appendChild(bar);
}
async function flushAct() {
  if (!ACT.q.length || !(await logReady())) { if (ACT.ready === false) { ACT.q = []; actPending(() => []); } return; }
  const bySession = {}; ACT.q.splice(0).forEach(e => (bySession[e.session] = bySession[e.session] || []).push(e));
  Object.entries(bySession).forEach(([session, events]) => {
    const tries = events[0].tries || 0;
    fetch(tokenUrl().replace(/\/$/, "") + "/log", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", "X-Demo-Code": S.settings.demoCode || DEMO_CODE },
      body: JSON.stringify({ device: deviceId(), name: String(S.settings.userName || "").trim(), session, page: /preview/.test(location.pathname) ? "preview" : "live", events: events.map(({ session, tries, ...e }) => e) }) })
      .then(r => { if (!r.ok && r.status !== 401) throw new Error(String(r.status)); const sent = new Set(events.map(e => e.id)); actPending(rows => rows.filter(x => !sent.has(x.id))); })
      .catch(() => { if (tries >= 5) return; events.forEach(e => { e.tries = tries + 1; }); ACT.q.unshift(...events); clearTimeout(ACT.timer); ACT.timer = setTimeout(flushAct, 5000); }); // a batch lost to a bad patch of signal is sent again (Oct 25)
  });
}
// taps for the activity log: what was tapped and on which screen (never what was typed into a field)
const SCREEN_NAMES = { home: "Home", contacts: "Contacts", contact: "Contact", board: "Opportunities", opp: "Opportunity", tasks: "Tasks", settings: "Settings", flow: "Stages" };
function tapLabel(el) {
  const t = (x) => String(x || "").replace(/\s+/g, " ").trim();
  let w = t(el.getAttribute("aria-label")) || t(el.innerText || el.textContent) || t(el.getAttribute("title")) || t(el.getAttribute("placeholder"));
  if (!w && el.dataset) w = Object.entries(el.dataset).map(([k, v]) => k + "=" + v).join(" ");
  return w.slice(0, 80);
}
document.addEventListener("click", (e) => {
  try {
    const el = e.target.closest("button, a, [role=button], [data-go], [data-contact], [data-opp], [data-form], [data-act], [data-act2], [data-act4], [data-pick], [data-rate], [data-ts], [data-rt], .tap, label, summary");
    if (!el || el.matches("input[type=text], textarea")) return;
    const where = V ? `${ACTIONS[V.action].title} form` : document.querySelector("#modal .scrim") ? "pop-up" : (SCREEN_NAMES[S.screen] || S.screen);
    act("tap", `${tapLabel(el) || el.tagName.toLowerCase()} (${where})`);
  } catch (err) {}
}, true);
document.addEventListener("change", (e) => {
  try { const el = e.target; if (el.tagName !== "SELECT" && el.type !== "checkbox" && el.type !== "date") return;
    const lab = el.closest("label, .fld") ? tapLabel(el.closest("label, .fld").querySelector(".lbl") || el.closest("label")) : el.id;
    act("tap", `${lab || el.id}: ${el.type === "checkbox" ? (el.checked ? "on" : "off") : el.tagName === "SELECT" ? (el.options[el.selectedIndex] || {}).text : el.value}`); } catch (err) {}
}, true);
// the audio code that hands mic sound to the app, made once when the page opens
const WORKLET_URL = URL.createObjectURL(new Blob([`class C extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}registerProcessor("cap",C)`], { type: "application/javascript" }));
const callError = (e) => {
  const m = String(e && e.message || e);
  if (m === "bad_code") return "This link isn't valid any more. Ask for a new link.";
  if (m.startsWith("service_")) return "The voice service didn't answer (" + m.slice(8) + "). Try again in a moment.";
  if (m === "token_401" || m === "token_403") return "xAI refused the API key in Settings. Check it and try again.";
  if (m.startsWith("token_")) return "xAI couldn't start a voice session (" + m.slice(6) + "). Try again in a moment.";
  if (e && e.name === "NotAllowedError") return "The microphone is blocked. Allow it for this site in your browser settings.";
  if (e instanceof TypeError) return "This browser couldn't reach the voice service. Check the connection and try again.";
  return "The conversation couldn't start (" + m + ").";
};
const BARGE_RMS = 0.06; // mic level needed to interrupt Grok while it is speaking; tune from the voice log's "mic while Grok spoke" lines
const sendBin = (buf) => { if (G.ws && G.ws.readyState === 1) G.ws.send(buf); }; /* mic audio as a raw PCM16 frame (binary transport) */
const send = (o) => { if (o.type === "session.update" && G.ws) G.ws.upN = (G.ws.upN || 0) + 1; /* every update is answered by one session.updated: the count pairs the state's receipt (syncAck) */ if (o.type !== "input_audio_buffer.append") vlog("→ " + o.type + (o.item ? " " + (o.item.type === "message" ? "notice: " + String(o.item.content[0].text).slice(40, 120) : o.item.type) : "")); if (G.ws && G.ws.readyState === 1) G.ws.send(JSON.stringify(o)); };
/* Voice log: the last few hundred events of the conversation, kept on this phone so the officer can copy it from Settings when something sounds wrong. */
const LOGKEY = "veleer-voice-log";
let VLOG = []; try { VLOG = JSON.parse(localStorage.getItem(LOGKEY) || "[]"); } catch (e) {}
function vlog(text) {
  const d = new Date(); VLOG.push(d.toTimeString().slice(0, 8) + "." + String(d.getMilliseconds()).padStart(3, "0") + " " + text);
  if (VLOG.length > 400) VLOG = VLOG.slice(-400);
  clearTimeout(vlog.t); vlog.t = setTimeout(() => { try { localStorage.setItem(LOGKEY, JSON.stringify(VLOG)); } catch (e) {} }, 500);
}
function b64FromInt16(i16) { const u8 = new Uint8Array(i16.buffer); let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function int16FromB64(b) { const s = atob(b), u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return new Int16Array(u8.buffer, 0, u8.length >> 1); }
function downsample(f32, from) {
  if (from === 24000) return f32;
  const ratio = from / 24000, n = Math.floor(f32.length / ratio), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = f32[Math.floor(i * ratio)];
  return out;
}
function playChunk(b64) { return playPcm(int16FromB64(b64)); }
const LINE_GAP_S = 1.0; // pause between the end of a phone recording and Ara's queued audio (Carverhill, Oct 28 10:30 PM: "1 or 2 seconds after our audio ends")
function playPcm(i16) {
  if (!i16 || !i16.length) return;
  const buf = G.ctx.createBuffer(1, i16.length, 24000), ch = buf.getChannelData(0);
  for (let i = 0; i < i16.length; i++) ch[i] = i16[i] / 32768;
  const src = G.ctx.createBufferSource(); src.buffer = buf; src.connect(G.out || G.ctx.destination);
  // Ara's audio is queued on the phone's clock: it waits for a phone line still playing ("Still waiting on Ara.") plus LINE_GAP_S so the two never overlap (Carverhill, Oct 28)
  const lineEnd = G.lineEndAt && G.lineEndAt > Date.now() ? G.ctx.currentTime + (G.lineEndAt - Date.now()) / 1000 + LINE_GAP_S : 0;
  const at = Math.max(G.ctx.currentTime + 0.02, G.playHead, lineEnd); src.start(at); G.playHead = at + buf.duration;
  if (G.respAudio) { if (G.respAudio.t0 == null) G.respAudio.t0 = at; G.respAudio.end = G.playHead; } /* where this reply's audio sits on the clock, for a truncate on interruption */
  const cap = G.caps && G.caps[G.caps.length - 1]; if (cap) { if (cap.t0 == null) cap.t0 = at; cap.t1 = G.playHead; }
  src.resp = G.respSeq; src.endAt = G.playHead; G.sources.push(src); src.onended = () => { G.sources = G.sources.filter(s => s !== src); };
}
// stop one reply's queued audio and nothing else (Oct 28 10:06 PM: cutting a late scripted copy with stopPlayback() also cut the read-back Ara was still saying)
function stopResp(seq) { const cut = G.sources.filter(s => s.resp === seq); cut.forEach(s => { try { s.stop(); } catch (e) {} }); G.sources = G.sources.filter(s => s.resp !== seq);
  G.playHead = G.sources.reduce((m, s) => Math.max(m, s.endAt || 0), 0); G.muteResp = seq; if (cut.length) vlog(`reply ${seq}: ${cut.length} queued chunks cut, the rest keeps playing`); }
// the officer talked over Ara: tell the service how much of her reply was actually heard, so her record matches (Oct 25 review item 6; xAI: conversation.item.truncate)
function truncateSpoken() {
  const r = G.respAudio; if (!PROV().forceItem || !r || !r.itemId || r.t0 == null || !G.ctx) return;
  const now = G.ctx.currentTime; if (!(r.end > now + 0.05)) return; /* nothing left to cut: it was all heard */
  const ms = Math.max(0, Math.round((now - r.t0) * 1000)); send({ type: "conversation.item.truncate", item_id: r.itemId, content_index: 0, audio_end_ms: ms });
  vlog(`interrupted after ${ms} ms of ${Math.round((r.end - r.t0) * 1000)}: the rest is cut from the record`); r.itemId = null;
}
function stopPlayback() { if (G.sources.length) vlog(`playback stopped (${G.sources.length} chunks cut)`); G.sources.forEach(s => { try { s.stop(); } catch (e) {} }); G.sources = []; G.playHead = 0; }

// keep the screen on while a conversation runs (the phone would otherwise auto-lock and pause the web app)
async function keepAwake() {
  try { if (G.live && navigator.wakeLock && !G.wake) { G.wake = await navigator.wakeLock.request("screen"); G.wake.addEventListener("release", () => { G.wake = null; if (G.live) act("step", "Screen wake lock released by the phone"); }); vlog("screen kept on"); act("step", "Screen kept on (wake lock)"); } else if (G.live && !navigator.wakeLock) act("step", "No screen wake lock on this phone"); }
  catch (e) { vlog("screen wake lock refused: " + (e && e.name)); act("step", "Screen wake lock refused: " + (e && e.name)); }
}
function letSleep() { try { G.wake && G.wake.release(); } catch (e) {} G.wake = null; }
// locking the phone hides the page: the line is closed a few seconds later and reopened when the app is back (appHidden, voiceline.js); the call ends only if the page stays hidden for a long time
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && G.live) appHidden();
  else if (document.visibilityState === "visible" && G.leftFor) { const was = G.leftFor; G.leftFor = null; G.endedByLock = false; toast(was === "calendar-live" ? "Welcome back. The conversation paused while you were in Google Calendar; tap the mic to carry on." : "Welcome back. If you tapped Save in Google Calendar, the meeting is in your calendar."); }
  else if (document.visibilityState === "visible" && S.pendingCall) { G.endedByLock = false; callDoneModal(); }
  else if (document.visibilityState === "visible" && G.endedByLock) { G.endedByLock = false; resumeModal(); }
});
// speaking speed: Grok's audio.output.speed (0.7 to 1.5), set in Settings or by asking the assistant; kept per phone
const SPEEDS = [0.85, 1, 1.15, 1.3], SPEED_NAMES = { 0.85: "Slower", 1: "Normal", 1.15: "A bit faster", 1.3: "Faster" };
const nearSpeed = (v) => SPEEDS.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a, 1);
const talkSpeed = () => nearSpeed(Number(S.settings.speed) || 1);
// the whole session setup; sent again in full when the speed changes mid-call, so nothing else is reset
// xAI voice extras (Oct 24): conversation resumption (a dropped line picks up the whole conversation, tool calls included),
// words for the speech recognizer to listen for, and pronunciation fixes. Each is sent in its own session.update after the
// main one: xAI keeps the previous settings when it turns one down, so a rejected extra can't cost Ara her instructions.
const SAY_AS = { "C.A.": "Citizens Alliance", "Fed PAC": "Fed pack", "State PAC": "State pack" };
const KEY_WORDS = ["Citizens Alliance", "Qualification", "Cultivation", "Ask Planning", "Ask Made", "Commitment", "Closed Won", "Closed Lost", "substantive", "Ally", "Do Not Solicit", "Do Not Contact", "hands-free", "pledge", "Ara", "New Hampshire", "North Dakota", "Pennsylvania", "Idaho"];
function keyTerms() {
  const all = [...KEY_WORDS, ...FUNDS, OFFICER, ...S.contacts.map(c => `${c.first} ${c.last}`)].map(w => String(w || "").trim().slice(0, 50)).filter(Boolean);
  return [...new Set(all)].slice(0, 100);
}
const transcriptionCfg = () => ({ language_hint: "en", keyterms: keyTerms() });
function sendExtras() { extraUpdates().forEach(send); }
function extraUpdates() {
  if (!PROV().extras) return []; // xAI only: OpenAI has no resumption, pronunciation table or key terms (transcription goes in the session body)
  const u = [], cfg = sessionCfg();
  u.push({ type: "session.update", session: { resumption: { enabled: true } } });
  u.push({ type: "session.update", session: { replace: SAY_AS } });
  u.push({ type: "session.update", session: { audio: Object.assign({}, cfg.audio, { input: Object.assign({}, cfg.audio.input, { transcription: transcriptionCfg() }) }) } });
  // the officer's words as they speak (conversation.item.input_audio_transcription.updated): its own update, so a refusal keeps the key terms above
  u.push({ type: "session.update", session: { audio: Object.assign({}, cfg.audio, { input: Object.assign({}, cfg.audio.input, { transcription: Object.assign({ model: "grok-transcribe" }, transcriptionCfg()) }) }) } });
  if (quickThinking()) u.push({ type: "session.update", session: { reasoning: { effort: "none" } } }); /* xAI documents "none" for lower latency; the default is "high" */
  if (turnTuned()) { vlog("turn detection " + JSON.stringify(turnDetection())); u.push({ type: "session.update", session: { turn_detection: turnDetection() } }); }
  return u;
}
// Turn detection: when a silence ends the officer's turn and how loud the mic must be to count as speech. The engine's own defaults,
// unless the harness sets window.__turn (consistency runs trying settings against car noise, Oct 28: Grok's reply time doubled in a
// car because its turn detection waits for a silence the rumble never gives). xAI documents only the type, so the extra fields go
// in their own session.update (sendExtras), where a refusal costs nothing else; OpenAI takes them in the session body.
const TURN_DEFAULT = { type: "server_vad" };
const turnDetection = () => Object.assign({}, TURN_DEFAULT, window.__turn || {});
const turnTuned = () => Object.keys(window.__turn || {}).length > 0;
// A high-pass filter on the microphone before capture (Hz, 0 = none): car rumble sits below the voice, so cutting it leaves the
// officer's words and gives the engine the silence it waits for. Off unless the harness sets window.__micHp; a setting if it helps.
const micHighPass = () => Number(window.__micHp || 0);
// xAI items taken from the Oct 25 review (built Oct 28, preview): the service's own idle timer as a backstop to the phone's (road noise keeps
// the phone's from firing), audio as binary frames when the setting is on, and reasoning effort "none" when the setting is on
const binAudio = () => !!PROV().extras && S.settings.binAudio === true; /* raw PCM16 frames both ways instead of base64 inside JSON (a third less data) */
const quickThinking = () => !!PROV().extras && S.settings.reasoning === "none";
const IDLE_SERVER_EXTRA_MS = 3000; /* the service's idle timer fires this much after the phone's own, so it only acts when the phone's never did */
const sessionCfg = () => ({ voice: providerVoice(), instructions: sentInstructions(), turn_detection: Object.assign({ type: "server_vad" }, PROV().extras ? { idle_timeout_ms: idleMs() + IDLE_SERVER_EXTRA_MS } : {}), tools: toolDefs(),
  audio: { input: Object.assign({ format: { type: "audio/pcm", rate: 24000 } }, binAudio() ? { transport: "binary" } : {}), output: Object.assign({ format: { type: "audio/pcm", rate: 24000 }, speed: talkSpeed() * (spookyMode() ? 0.9 : 1) }, binAudio() ? { transport: "binary" } : {}) } }); // spooky mode: a touch slower, like a haunted-house host
const speedName = (v) => SPEED_NAMES[nearSpeed(v)].toLowerCase();
const busy = () => { G.lastAct = Date.now(); };
document.addEventListener("pointerdown", () => { if (G.live) { busy(); if (G.idleEnding) { G.idleEnding = false; G.goodbye = false; G.idleAsked = 0; clearTimeout(G.idleTimer); } } }, true);
document.addEventListener("input", () => { if (G.live) busy(); }, true);
// The call's sound and mic: a fresh audio context, Ara's output chain (gain + analyser for heard.js), the mic, and the capture node
// that streams PCM to the line. Used at the start of a call and again after the phone was locked: iOS brings a web page's sound back
// on the earpiece after a lock, not the speaker the call started on (Carverhill, Oct 26), and a fresh start puts it back where it was.
async function openAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)(); G.ctx = ctx;
  try { G.out = ctx.createGain(); G.outAn = ctx.createAnalyser(); G.outAn.fftSize = 2048; G.out.connect(G.outAn); G.outAn.connect(ctx.destination); } catch (e) { G.out = G.outAn = null; }
  ctx.resume();
  const micP = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const wkP = ctx.audioWorklet ? ctx.audioWorklet.addModule(WORKLET_URL).then(() => true, () => false) : Promise.resolve(false);
  micP.catch(() => {});
  const [stream, worklet] = await Promise.all([micP, wkP]);
  if (!G.live || G.ctx !== ctx) { try { stream.getTracks().forEach(t => t.stop()); } catch (x) {} return false; } // hung up, or started over, while the mic was asked for
  G.stream = stream;
  // a phone call, timer, alarm or Siri takes the speaker or mic: the audio pauses or the mic goes quiet
  ctx.onstatechange = () => { if (G.live && G.ctx === ctx && G.status !== "Connecting…" && ctx.state !== "running") soundPaused(ctx); };
  const mine = (tr) => G.stream && G.stream.getAudioTracks().includes(tr); // a mic replaced after a lock no longer speaks for the call
  stream.getAudioTracks().forEach(tr => { tr.onmute = () => { if (G.live && mine(tr) && G.status !== "Connecting…") micMuted(tr); }; tr.onended = () => { if (G.live && mine(tr)) interrupted("mic ended", "Your phone took the microphone away (a call, Siri or the recording dialog)."); }; });
  const srcNode = ctx.createMediaStreamSource(stream);
  const onPcm = (f32) => {
    if (G.ctx !== ctx) return;
      // Echo guard: while Grok's voice is playing, the phone's mic can hear the speaker and Grok cuts itself off.
      // Quiet sound during playback is sent as silence; speaking up over Grok still interrupts it.
      if (G.playHead > G.ctx.currentTime + 0.03) {
        let sq = 0; for (let i = 0; i < f32.length; i++) sq += f32[i] * f32[i];
        const rms = Math.sqrt(sq / f32.length); G.echoPeak = Math.max(G.echoPeak || 0, rms);
        if (rms < BARGE_RMS) f32 = new Float32Array(f32.length); else G.barge = (G.barge || 0) + 1;
      }
      if (!(G.playHead > G.ctx.currentTime + 0.03)) { let sq = 0; for (let i = 0; i < f32.length; i += 4) sq += f32[i] * f32[i]; const lvl = window.__quietMic ? 0 : Math.sqrt(sq / (f32.length / 4)); /* __quietMic: the harness's fake mic is loud */
      if (lvl > SPEAK_RMS) { if (!G.speechSince) G.speechSince = Date.now(); G.loudAt = Date.now(); if (/^Reconnecting/.test(G.status)) { if (!G.gapLoud) G.gapLoud = Date.now(); else if (Date.now() - G.gapLoud > GAP_SPEECH_MS) G.spokeInGap = true; } } else { G.gapLoud = 0; if (G.speechSince && Date.now() - (G.loudAt || 0) > 8000) G.speechSince = 0; } }
    G.buf.push(downsample(f32, G.ctx.sampleRate));
      const total = G.buf.reduce((n, a) => n + a.length, 0);
      if (total < 2400) return; // ~100 ms
      const i16 = new Int16Array(total); let o = 0;
      G.buf.forEach(a => { for (let i = 0; i < a.length; i++) { const v = Math.max(-1, Math.min(1, a[i])); i16[o++] = v < 0 ? v * 0x8000 : v * 0x7fff; } }); G.buf = [];
      if (binAudio()) sendBin(i16.buffer); else send({ type: "input_audio_buffer.append", audio: b64FromInt16(i16) });
    };
    if (worklet) { G.node = new AudioWorkletNode(ctx, "cap"); G.node.port.onmessage = (ev) => onPcm(ev.data); }
    else { G.node = ctx.createScriptProcessor(4096, 1, 1); G.node.onaudioprocess = (ev) => onPcm(new Float32Array(ev.inputBuffer.getChannelData(0))); }
    if (micHighPass() > 0) { const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = micHighPass(); hp.Q.value = 0.7; srcNode.connect(hp).connect(G.node); vlog(`mic high-pass ${micHighPass()} Hz`); }
    else srcNode.connect(G.node);
    const mute = ctx.createGain(); mute.gain.value = 0; G.node.connect(mute).connect(ctx.destination);
    return true;
}
// The sound engine must be running before Ara speaks. After a Carry on (or any tap) iOS can keep the page's sound "interrupted"
// for a while (Oct 27, 6:17 PM: the line reopened, Ara answered, the phone played nothing and the officer gave up). So the start
// waits this long for it; if it is still held, the officer is told on screen and the call waits (soundPaused, with a longer limit),
// and the line Ara says meanwhile is said again once the sound is back (soundBack).
const SOUND_START_MS = 2000, SOUND_HELD_MS = 30000;
// OpenAI's transcript of the officer's turn often arrives after its tool call (spoken runs, Oct 27: the evidence rule then judged
// the fields against words it had not received and dropped a rating and a meeting type the officer had said). A tool call that
// lands between the end of the officer's speech and the transcript waits for it, this long at most.
const HEARD_WAIT_MS = 2000;
async function soundRunning(ms) {
  const ctx = G.ctx, t0 = Date.now();
  while (G.live && G.ctx === ctx && ctx.state !== "running" && Date.now() - t0 < ms) { try { await ctx.resume(); } catch (e) {} await new Promise(r => setTimeout(r, 100)); }
  if (!G.live || G.ctx !== ctx || ctx.state === "running") return true;
  act("step", `Sound not running ${((Date.now() - t0) / 1000).toFixed(1)} s after the tap (${ctx.state}): the phone still holds it, waiting for it to come back`);
  toast("Your phone's sound is held by another app, a call or Siri. " + botName() + " will carry on as soon as it's back.");
  soundPaused(ctx, SOUND_HELD_MS);
  return false;
}
// the sound is back after a pause: a line Ara said into the silence is said again (the officer heard none of it)
function soundBack() {
  const line = G.unheard; G.unheard = null; G.unheardResp = 0;
  if (!line || !G.live) return;
  act("step", "Sound is back: the line Ara said while it was paused is said again");
  forceSay(line);
}
// After a lock: start the sound and mic afresh (see openAudio); if the phone refuses (no running sound in a moment), the old ones stay
async function restartAudio(why) {
  const oldCtx = G.ctx, oldStream = G.stream, oldOut = G.out, oldAn = G.outAn, oldNode = G.node;
  stopPlayback(); G.buf = []; // the sound and mic waits are left alone: their ticks end by themselves once the old context and stream are replaced (zeroing G.micMutedAt here ended a call at the unlock: Oct 26, 10:53 AM)
  try {
    if (!await openAudio()) throw new Error("not opened");
    const ctx = G.ctx; for (let i = 0; i < 15 && ctx.state !== "running"; i++) { try { await ctx.resume(); } catch (e) {} await new Promise(r => setTimeout(r, 100)); }
    if (ctx.state !== "running") throw new Error("sound " + ctx.state);
    try { oldStream && oldStream.getTracks().forEach(t => t.stop()); } catch (e) {} try { oldCtx && oldCtx.close(); } catch (e) {}
    if (typeof linePrep === "function") linePrep();
    act("step", why ? `Sound and mic started afresh ${why}` : "Sound and mic started afresh after the lock, so Ara comes back on the speaker the call started on, not the earpiece");
    return true;
  } catch (e) {
    try { G.ctx && G.ctx !== oldCtx && G.ctx.close(); } catch (x) {} try { G.stream && G.stream !== oldStream && G.stream.getTracks().forEach(t => t.stop()); } catch (x) {}
    G.ctx = oldCtx; G.stream = oldStream; G.out = oldOut; G.outAn = oldAn; G.node = oldNode; if (oldCtx && oldCtx.state !== "running") oldCtx.resume().catch(() => {});
    act("step", "Couldn't start the sound afresh " + (why || "after the lock") + " (" + String(e && e.message || e).slice(0, 60) + "): keeping the old sound and mic");
    return false;
  }
}
async function startCall(opening) {
  try { if (spkCtx && spkCtx.state === "running") spkCtx.suspend(); } catch (e) {} // the Halloween sound engine rests during a conversation
  vlog("=== conversation started" + (opening ? ": " + opening.slice(0, 80) : ""));
  if (navigator.audioSession) vlog("audio session: " + navigator.audioSession.type);
  G.session = deviceId().slice(0, 8) + "-" + Date.now().toString(36); logReady(); act("start", opening ? opening.replace(/^The officer opened the conversation from the app: /, "Tapped: ") : "Tapped the mic");
  if (!G.keepRecent) { G.recent = []; G.saves = []; G.convId = null; } G.keepRecent = false;
  G.live = true; if (typeof locStart === "function") locStart(); G.hands = true; G.rangesSaidAt = 0; G.entityListAt = 0; G.soundEver = false; G.audioRetried = false; dropResume(); act("step", G.keepHands ? "hands-free kept on after Carry on" : "hands-free on from the start (the default since Oct 25; \"I've parked\" turns it off)"); G.keepHands = false; /* Carverhill, Oct 25: hands-free is the default for everyone */ { const vb = document.querySelector("#overlay .vfill"); if (vb) vb.remove(); } G.status = "Connecting…"; G.bot = ""; G.caps = []; G.tour = G.tourEnding = false; G.tourItems = []; G.respItems = []; G.handled = new Set(); G.idleEnding = false; busy(); clearInterval(G.idleTick); G.idleTick = setInterval(idleCheck, 1000); paintCall(); render(); keepAwake();
  try {
    const warm = typeof takeWarm === "function" ? takeWarm() : null; /* a line that started opening when the mic button was first touched (Oct 28) */
    G.t0 = Date.now(); G.heardAt = 0; G.passReady = !!TOK.p || !!warm;
    const tokP = warm ? warm.tokP : getToken(); tokP.catch(() => {});
    const [token, audio] = await Promise.all([tokP, openAudio()]); // the mic, the voice pass and the audio code all at once, not one after another
    if (!G.live) return; // hung up while connecting
    if (!audio) throw new Error("no sound");
    await soundRunning(SOUND_START_MS); if (!G.live) return; /* after a Carry on the phone can still hold the sound (Oct 27, 6:17 PM: Ara came back and was never heard) */
    // spooky or Christmas mode: Ara is the host from her very first words
    const boo = spookyMode() ? "Mwahaha... welcome to the haunted CRM. " : xmasMode() ? "Ho ho ho... Merry Christmas, and welcome to the Christmas CRM. " : "";
    const hello = S.settings.userName ? boo + helloLine(OFFICER) : `${boo}Hi, I'm ${botName()}, what's your first name?`;
    if (S.settings.userName && G.hands) { S.settings.hfGreeted = (S.settings.hfGreeted || 0) + 1; save(); } // one more call greeted with hands-free on (after the line is built, so this call still gets the full one)
    // the greeting is scripted (said word for word by the app's line); a tapped request is the officer's input, with the greeting folded in
    const first = opening ? () => notice(S.settings.userName ? opening : opening + ` You don't know their name yet: first say "${hello}", then call set_user_name, then help with that.`) : () => forceSay(hello);
    G.drops = 0; openSocket(token, first, false, warm);
  } catch (e) { endCall("couldn't start: " + String(e && e.message || e)); if (String(e && e.message) === "bad_code") codeModal(opening); else toast(callError(e)); } /* the reason goes to the activity log (four silent ends on Oct 26) */
}
// the greeting says that hands-free is on (Jacqueline, Oct 27: nobody told her, so she tapped Save and then tapped hands-free off by
// accident). The full line plays on a phone's first HF_GREET_FULL calls, a shorter one after that.
const HF_GREET_FULL = 3;
function helloLine(name) {
  const first = String(name || "").split(" ")[0], me = botName();
  if (G.live ? !G.hands : false) return `Hi ${first}, I'm ${me}, what would you like to do?`; // before a call starts, hands-free will be on (the default)
  return (S.settings.hfGreeted || 0) < HF_GREET_FULL ? `Hi ${first}, I'm ${me}. Hands-free is on, so you don't need to look at your phone: I'll read each form back and save it when you say yes. What would you like to do?`
    : `Hi ${first}, I'm ${me}, hands-free is on. What would you like to do?`;
}
/* ---------- interrupted conversations: a phone call, timer, Siri or locking the phone cuts the mic and speaker ---------- */
// keep the last few lines said, so a new conversation can pick up where the old one stopped
function recent(who, text) { const r = (G.recent = G.recent || []), line = `${who}: ${String(text).slice(0, 300)}`, last = r[r.length - 1] || "";
  const grow = (a, b) => { const x = a.toLowerCase().replace(/[^a-z0-9@$ ]/g, " ").replace(/\s+/g, " ").trim(), y = b.toLowerCase().replace(/[^a-z0-9@$ ]/g, " ").replace(/\s+/g, " ").trim(); return y.startsWith(x) || x.startsWith(y); };
  if (who === "Officer" && last.startsWith("Officer: ") && grow(last.slice(9), String(text))) { r[r.length - 1] = line; return; } /* the service sends a transcript several times as it grows (Oct 28): keep one entry */
  r.push(line); if (r.length > 8) r.shift(); }
function draftSummary() {
  if (!V || !ACTIONS[V.action]) return "";
  const A = ACTIONS[V.action], t = V.target || {}, who = t.contact ? nameOf(t.contact) : "";
  const have = (A.fields || []).filter(f => V.data && V.data[f.k] !== undefined && V.data[f.k] !== "" && V.data[f.k] !== false).map(f => `${f.label}: ${V.data[f.k]}`);
  const need = (A.fields || []).filter(f => f.req && (!V.data || V.data[f.k] === undefined || V.data[f.k] === "")).map(f => f.label);
  return `The "${A.title}" form${who ? ` for ${who}` : ""} is still open on screen, not saved yet. Filled in so far: ${have.join("; ") || "nothing"}.${need.length ? ` Still needed: ${need.join(", ")}.` : ""}`;
}
const RESUME_KEY = "resumeKeep";
const resumeInfo = (plain, last) => ({ at: Date.now(), session: G.session || "", lines: (G.recent || []).slice(), draft: draftSummary(), where: (typeof formPosition === "function" && formPosition() || {}).where || "", what: V && ACTIONS[V.action] ? ACTIONS[V.action].title : "", hands: !!G.hands, plain: plain || "", killed: !!last, last: last ? String(last.text).slice(0, 160) : "", lastAt: last ? last.at : 0 });
// the phone closed the page in the middle of a call (iOS, Oct 28, twice right after a reconnect): nothing logs the end, so every log row keeps a copy of the call;
// the next open logs the silent end against that call and offers Carry on
const KILLED_PLAIN = "Your phone closed the app in the middle of the conversation.";
// a copy of the cut-off conversation on the phone: a page the phone discarded (while locked) can still offer Carry on; cleared when a call ends or starts normally
// the copy is refreshed on every log row and every 2 s, so the next open can say when the page died
function keepAlive() { if (!(G.live && G.session && G.lastRow && !G.lockPaused && document.visibilityState === "visible")) return; if (Date.now() - (G.keptAt || 0) < 1500) return; G.keptAt = Date.now(); keepResume(KILLED_PLAIN, G.lastRow); }
function keepResume(plain, last) { try { localStorage.setItem(RESUME_KEY, JSON.stringify(resumeInfo(plain, last))); } catch (e) {} }
function dropResume() { try { localStorage.removeItem(RESUME_KEY); } catch (e) {} }
function restoreResume() { let r = null; try { r = JSON.parse(localStorage.getItem(RESUME_KEY) || "null"); } catch (e) {} dropResume(); if (!r || Date.now() - r.at > 30 * 60e3 || !r.lines || !r.lines.length) return false;
  r.lost = r.what; r.what = ""; r.draft = ""; r.where = ""; G.resume = r;
  if (r.killed) act("step", `The last call ended without the app noticing: the phone closed the page ${Math.round((Date.now() - r.at) / 1000)} s ago, ${Math.round((r.at - (r.lastAt || r.at)) / 1000)} s after "${r.last}". Offering Carry on`, r.session || undefined); /* logged against the cut-off call */
  else act("step", `The last page was closed by the phone while a conversation was paused (${Math.round((Date.now() - r.at) / 1000)} s ago): offering Carry on`);
  resumeModal(); return true; }
function interrupted(why, plain) {
  if (!G.live || G.interrupting) return; G.interrupting = true;
  vlog("conversation interrupted: " + why);
  G.resume = resumeInfo(plain);
  endCall("interrupted: " + why); G.interrupting = false; G.hiddenAt = 0; keepResume(plain);
  if (document.visibilityState === "visible") resumeModal(); else G.endedByLock = true;
}
function resumeModal() {
  const r = G.resume;
  if (!r || Date.now() - r.at > 30 * 60e3 || (!r.lines.length && !r.draft)) { G.resume = null; toast("The conversation ended. Tap the mic to carry on."); return; }
  const h = document.getElementById("modal");
  h.innerHTML = `<div class="scrim center"><div class="wmodal" role="dialog" aria-modal="true" aria-labelledby="rsmTitle">
    <span class="wl-mic">${mic(22)}</span>
    <h2 id="rsmTitle">Your conversation was interrupted</h2>
    <p>${r.plain ? esc(r.plain) : "A call, an alarm or the phone locking cut it off."}${r.what ? ` Your “${esc(r.what)}” form is still here, not saved.` : r.lost ? ` Your “${esc(r.lost)}” form went with it and will need filling in again.` : ""} ${esc(botName())} can pick up where you left off.</p>
    <button class="btn blue" id="rsmGo">${mic(16)} Carry on</button><button class="btn quiet" id="rsmX">Not now</button></div></div>`;
  document.getElementById("rsmX").onclick = () => { G.resume = null; dropResume(); h.innerHTML = ""; };
  document.getElementById("rsmGo").onclick = () => { h.innerHTML = ""; const r2 = G.resume; G.resume = null; G.recent = r2.lines.slice(); G.keepRecent = true; G.keepHands = r2.hands; startCall(resumeLine(r2)); };
}
const resumeLine = (r) => `The officer's last conversation with you was cut off (a phone call, an alarm or the phone locking) and they tapped Carry on. ${r.lines.length ? `The last things said were:\n${r.lines.join("\n")}\n` : ""}${r.draft ? r.draft + " Nothing on that open form is saved yet: never say it is saved, marked or done, say it's on the form. " + (r.where ? r.where + " " : "") : ""}${r.hands ? "Hands-free mode is still on: you save with the officer's yes after a read-back, as before. Don't announce it. " : ""}Say "${spookyMode() ? "Welcome back to the haunted CRM" : xmasMode() ? "Welcome back, and Merry Christmas" : "Welcome back"}"${spookyMode() ? " in your haunted-house host voice" : xmasMode() ? " in your warm Christmas host voice" : ""} and, in one short sentence, what you were doing together, then ask the next question needed to finish it. Do not start over or ask for anything already filled in. Anything already done before the cut-off stays done${spookyMode() ? " (spooky mode is already on: don't turn it on again or announce it)" : xmasMode() ? " (Christmas mode is already on: don't turn it on again or announce it)" : ""}; never redo it.`;
function endCall(why) {
  clearInterval(G.idleTick); clearInterval(G.netTick); clearTimeout(G.idleTimer); G.idleEnding = false;
  G.live = false; G.hands = false; G.saveCheck = null; G.savedByWords = 0; G.sync = null; G.syncN = 0; G.syncPending = null; G.nudge = null; G.ctxWatch = null; G.stateOkAt = 0; clearTimeout(G.syncTimer); G.hfYesAt = 0; G.resumedHeardN = 0; G.qGuide = ""; G.askGuide = ""; stopPlayback(); letSleep(); if (typeof downEnd === "function") downEnd(); if (typeof locStop === "function") locStop();
  try { G.ws && G.ws.close(); } catch (e) {} closeTries();
  try { G.stream && G.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
  try { G.ctx && G.ctx.close(); } catch (e) {}
  vlog("=== conversation ended"); if (!/^interrupted/.test(why || "")) dropResume(); if (G.session) { act("end", "Conversation ended" + (why ? " (" + why + ")" : "") + (typeof locInfo === "function" ? locInfo() : "") + syncSummary()); G.session = null; } G.ws = G.stream = G.ctx = G.node = null; G.buf = []; G.audioOn = false; G.responding = G.qInstr = G.qCreate = G.asked = false; G.retried = 0; G.drops = 0; G.lastMsg = 0; G.retriedAt = 0; G.dropNext = false; G.speechSince = 0; G.probing = false; G.stalled = false; G.spokeInGap = false; G.undoSaid = false; G.forced = null; G.lateForced = null; G.lastBot = ""; G.lastBotAt = 0; G.unheard = null; G.unheardResp = 0; G.resend = null; if (G.silentWait) { clearTimeout(G.silentWait.still); clearTimeout(G.silentWait.resend); G.silentWait = null; } clearTimeout(G.forceTimer); G.soundPausedAt = 0; G.micMutedAt = 0; G.hiddenAt = 0; G.lockPaused = 0; G.lockResume = false; G.saveAck = null; G.idleAt = 0; clearTimeout(G.qTimer); clearTimeout(G.askWatch); clearTimeout(G.tickWatch); clearInterval(G.pingTick);
  paintCall(); render();
  // a form left open gets its voice button back, keeping what was filled in
  if (V && document.getElementById("draftForm")) { V.data = readDraft(); renderOverlay(); }
  setTimeout(prefetchToken, 1000);
}
function tellPicked(kind) {
  if (!G.live) return;
  whenIdle("instr");
  const c = focusContact(); if (!c) return;
  const o = kind === "opp" ? oppById(S.sel.opp) : openOpp(c.id);
  const what = kind === "opp" ? `the opportunity ${o.name} (${o.stage}) for ${nameOf(c)}` : `the contact record for ${nameOf(c)}${o ? ` (open opportunity in ${o.stage})` : " (no open opportunity)"}`;
  guide(`The officer tapped on screen and opened ${what}; Right now names ${nameOf(c)} as the contact they mean. In one short sentence, say you see they picked ${nameOf(c)} and ask what they'd like to do.`);
}
// Commands the app carries out itself, so they work the same way every time instead of depending on the model
const VOICE_CMDS = [
  [/^(undo( that| it)?|undo (the )?last (change|one))$/, "undo"],
  [/^(go back|back|take me back)$/, "back"],
  [/^((turn on |switch on |start |use )?(hands ?free|driving)( mode)?( on)?|(i'm|i am) driving( now)?)$/, "hfon"],
  [/^((turn off |switch off |stop |end )(hands ?free|driving)( mode)?|(hands ?free|driving)( mode)? off|(i'm|i am|i've|i have) (parked|stopped driving)( now)?)$/, "hfoff"],
  [/^(say (that|it) again|repeat( that| it)?|what did you say|come again)$/, "repeat"],
  [/^((what|which)('s| is| are)?( the)?( fields?| details?| information| info| else| more| things?)?( are| is| do you| does it| do we| still| yet)*( still| else)? ?(left|missing|remaining|outstanding|needed|need|to go|to fill in|do you need|does it need|do you still need)( to (fill|be filled) in| on the form| to fill| on it)?|(is there )?anything (else )?(left|missing|still needed)( to fill in)?)$/, "left"], // "what fields are left?" (Jacqueline's call, Oct 27)
];
// Cancel and start over are said many ways ("let's cancel this contact and start a new one"): the sentence counts when,
// once its cancel or start-over words are found, everything left is filler such as "this", "the form" or "please".
const CMD_CANCEL = /\b(cancel(led)?|close|discard|scrap|ditch|delete|exit|quit|abandon|get rid of|throw (it |this |that )?away|never ?mind|forget|clear (my |the |this )?screen|(i|we) (don't|do not) want to (do|finish|continue|fill in|fill out|keep going with)( with)?|(i'm|i am|we're|we are) done with)\b/g;
const CMD_RESTART = /\b(start (it |this |that )?(over|again)|start (a )?(new|fresh)( one)?|begin again|from scratch|(a )?(new|fresh) one|redo|reset|wipe|erase|clear (it|this|that|the|everything|all)( form| draft| fields)?)\b/g;
const CMD_FILLER = new Set("and then but so oh no actually just please ok okay i i'd we let's lets let us want to like would could can you go ahead need should this that it the my a an form draft screen one anymore any more now all whole thing of for me right away contact meeting task interaction report entry everything out up instead".split(" "));
function formCommand(t) {
  if (t.split(" ").length > 14) return null;
  const words = t.replace(CMD_CANCEL, " C ").replace(CMD_RESTART, " R ").split(" ").filter(w => w && !CMD_FILLER.has(w));
  if (!words.length || words.some(w => w !== "C" && w !== "R")) return null;
  return words.includes("R") ? "restart" : "cancel";
}
function cancelForm() { const what = ACTIONS[V.action].title, back = V.backTo; V = null; renderOverlay(); if (back) go(back); return what; }
function restartForm() { V.history = []; V.data = prefill(V.action, {}, V.target); V.fromVoice = new Set(); V.askedOther = V.askedOptional = false; V.opt = null; renderOverlay(); return ACTIONS[V.action].title; }
function voiceCommand(text) {
  const t = String(text).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim().replace(/^((please|okay|ok|um|uh|hey|ara|so) )+/, "").replace(/ please$/, "");
  const hit = VOICE_CMDS.find(([re]) => re.test(t)), cmd = hit ? hit[1] : formCommand(t); if (!cmd) return false;
  const who = botName() + ": "; let say;
  if (cmd === "repeat") { const last = (G.recent || []).filter(l => l.startsWith(who)).slice(-1)[0]; if (!last) return false; say = { force: last.slice(who.length) }; }
  else if (cmd === "left") { if (!V || !ACTIONS[V.action]) return false; say = fieldsLeft(); }
  else if (cmd === "cancel") { if (!V) return false; const what = cancelForm(); say = { force: "Cancelled, nothing was saved. What would you like to do?" }; }
  else if (cmd === "hfon" || cmd === "hfoff") { setHandsFree(cmd === "hfon"); say = null; }
  else if (cmd === "undo" && !(V && (V.history || []).length) && G.lastSave && G.lastSave.hf && Date.now() - G.lastSave.at < 5 * 60e3) {
    const what = ACTIONS[G.lastSave.action].saved; S = JSON.parse(G.lastSave.undo); G.lastSave = null; if (G.saves) G.saves.pop(); save(); render(); whenIdle("instr");
    say = { force: "Undone, that's not saved. What would you like to do?" }; }
  else if (cmd === "undo") { if (!V || !(V.history || []).length) say = `The officer said "undo", but there is no change on an open form to undo. Say so in one short sentence; a saved record is changed with Edit.`;
    else { V.data = V.history.pop(); renderOverlay(); say = `The officer said "undo". The app put the ${ACTIONS[V.action].title} form back the way it was before your last change. Say in a few words what changed back, then carry on.`; } }
  else if (cmd === "restart") { if (!V) return false; say = `The officer said "start over". The app cleared the ${restartForm()} form. Ask for the first detail again.`; }
  else if (cmd === "back") { if (V) return false; const b = document.querySelector("header.top .back"); if (!b) return false; const where = BACK_NAMES[b.dataset.go] || "the previous screen"; go(b.dataset.go); say = { force: `Back on ${where}.` }; }
  vlog("voice command: " + cmd); act("step", "voice command " + cmd);
  stopPlayback(); if (G.responding) { send({ type: "response.cancel" }); G.cancelAt = Date.now(); } G.cmdAt = Date.now(); // drop whatever the model started to do with those words
  if (say === null) hfAnnounce(); else if (say.force) forceSay(say.force, say.then); else guide(say); return true;
}
// Guidance for Ara's next reply only: it travels with the reply request (xAI's per-response instructions), so it never sits in the
// conversation where she could read it aloud (Oct 24: "Skip it and move on. Then ask exactly" was spoken). Nothing to remember goes here.
function guide(text) {
  // a scripted line is on its way: Ara must not say the same words herself (Oct 25: the hands-free line was heard twice)
  const pf = G.forced ? G.forced.text : G.pendingForce; if (pf) text = `The app is saying this itself, in your voice, so don't say it or anything like it: "${pf}". ` + text;
  G.qGuide = G.qGuide ? G.qGuide + "\n" + text : text; whenIdle("create"); }
// Something the officer did on screen that stands for their words (a tapped request): a conversation item, since it is their input
function notice(text) {
  send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: "(The officer did this on screen, not spoken) " + text }] } });
  whenIdle("create");
}
// Voice entry points: a request from a button or list line either opens the call with it or passes it to the live call.

const EX_NAME = "Ruth Abernathy";
function exampleFor(line) {
  let m;
  const who = (s) => s || EX_NAME;
  if (/add a contact/i.test(line)) return "Add a contact: Sam Lee, sam.lee@example.org, mobile (555) 010-0142";
  if ((m = line.match(/^Log a meeting(?: with (.+))?$/i))) return `Log a meeting with ${who(m[1])}. We met for coffee and talked about the Pennsylvania campaign`;
  if ((m = line.match(/^Add a task(?: for (.+))?$/i))) return `Add a task for ${who(m[1])} to send the Pennsylvania update by Friday`;
  if ((m = line.match(/^Schedule a meeting(?: with (.+))?$/i))) return `Schedule a meeting with ${who(m[1])} next Tuesday at 10 at Blue Door Cafe`;
  if ((m = line.match(/^Create an opportunity(?: for (.+))?$/i))) return `Create an opportunity for ${who(m[1])}`;
  if ((m = line.match(/^Plan an ask(?: for (.+))?$/i))) return `Plan an ask for ${who(m[1])}: $25,000 to C3, Pennsylvania campaign, on December 1`;
  if ((m = line.match(/^Record (?:an|the) ask(?: for (.+))?$/i))) return `Record the ask for ${who(m[1])}. They said yes to $25,000`;
  if ((m = line.match(/^Record a pledge(?: for (.+))?$/i))) return `Record a pledge from ${who(m[1])} for $25,000, confirmed by email`;
  if ((m = line.match(/^Record a gift(?: for (.+))?$/i))) return `Record a $5,000 gift from ${who(m[1])} by check`;
  if ((m = line.match(/^Record a payment(?: for (.+))?$/i))) return `Record a $5,000 gift from ${who(m[1])} by check`;
  return line.replace(/^Let's /, "");
}

function hintCard(el) {
  const line = el.dataset.say;
  if (S.settings.noHints || el.dataset.nohint) { ask(`"${line}"`); return; }
  const title = (el.textContent || line).trim().replace(/^Try it:\s*/, "").replace(/[“”]/g, "");
  const h = document.getElementById("modal");
  h.innerHTML = `<div class="scrim center"><div class="wmodal hintcard" role="dialog" aria-modal="true" aria-labelledby="hcTitle">
    <span class="wl-mic">${mic(22)}</span>
    <h2 id="hcTitle">${esc(title)}</h2>
    <p>You can do this by voice. Tap the mic and say something like:</p>
    <div class="hc-ex">“${esc(exampleFor(line))}”</div>
    <label class="hc-off" for="hcOff"><input type="checkbox" id="hcOff"> Don't show these hints again</label>
    <button class="btn blue" id="hcGo">${mic(16)} Start talking</button>${FORM_FOR[line] ? `<button class="btn out" id="hcType">Type it instead</button>` : ""}<button class="btn quiet" id="hcX">Not now</button></div></div>`;
  const off = () => { if (document.getElementById("hcOff").checked) { S.settings.noHints = true; save(); toast("Hints are off. Turn them back on in Settings."); } };
  document.getElementById("hcGo").onclick = () => { off(); h.innerHTML = ""; ask(`"${line}"`); };
  document.getElementById("hcX").onclick = () => { off(); h.innerHTML = ""; };
  const ty = document.getElementById("hcType"); if (ty) ty.onclick = () => { off(); h.innerHTML = ""; pickFor(FORM_FOR[line]); };
}
function ask(request) {
  if (!G.live) { startCall(request ? `The officer opened the conversation from the app: ${request}` : null); return; }
  if (request) notice(`The officer tapped: ${request}`);
}
function onEvent(e) {
  const t = e.type || "";
  if (G.dropNext) { if (t === "response.done") { G.dropNext = false; G.bot = ""; G.responding = false; flushQueued(); } if (/delta$/.test(t) || t === "response.done") return; } // the cut-off doubled reply: nothing of it is played or logged
  if (/audio\.delta$/.test(t)) G.spokeSince = Date.now();
  if (t === "input_audio_buffer.speech_started") { if (G.nudge) { act("step", "The officer spoke: the ask for the tool call stands down"); G.nudge = null; } if (G.ctxWatch) { act("step", "The officer spoke: the ask for where we were stands down"); G.ctxWatch = null; } G.heardSinceRetry = true; G.speechSince = 0; G.dropIdle = 0; G.speechOn = true;
    // the officer answered just as the quiet hang-up started (seen Oct 24: Ara said goodbye over "October 24th"): call it off quietly
    if (G.idleAt && Date.now() - G.idleAt < 30000) { G.idleAt = 0; clearTimeout(G.idleTimer); if (G.responding) send({ type: "response.cancel" }); stopPlayback(); if (G.forced) { G.forced = null; clearTimeout(G.forceTimer); } /* a goodbye still waiting to be said is dropped */ G.goodbye = false; vlog("hang-up called off: the officer spoke"); act("step", G.idleAsked ? "The officer answered the hang-up question: their words decide" : "Quiet hang-up called off: the officer spoke"); } }
  if (/audio\.delta$/.test(t)) { if (!G.audioOn) { G.audioOn = true; G.audioSamples = 0; vlog("← audio starts"); } G.audioSamples += e.pcm ? e.pcm.length : Math.floor(atob(e.delta || "").length / 2); if (e.item_id && G.respAudio && !G.respAudio.itemId) G.respAudio.itemId = e.item_id; }
  if (t === "session.updated") syncAck(e);
  if (t === "session.created") { vlog(`session created ${Date.now() - (G.t0 || Date.now())} ms after the tap`); netLog(`Session created ${Date.now() - (G.t0 || Date.now())} ms after the tap`); } /* separates the service's connect time from the Worker's when a line is slow */
  if (t === "conversation.item.input_audio_transcription.updated" && e.transcript) { G.heardLive = e.transcript; if (Date.now() - (G.heardLiveAt || 0) > 2000) { G.heardLiveAt = Date.now(); vlog('← officer (so far) "' + String(e.transcript).slice(-120) + '"'); } } /* the officer's words as they speak */
  if (t === "input_audio_buffer.timeout_triggered") { /* the service's own idle timer (its speech detection, not the phone's mic level): its check-in is dropped and the app's goodbye goes instead */
    const early = G.live && Date.now() - (G.lastAct || 0) < idleMs(); /* a form open allows longer than the service's timer (set without one): the phone's own check decides */
    const muted = G.live && !!(G.micMutedAt || G.soundPausedAt || G.hiddenAt); /* the phone has the mic (or the sound) at the moment: the officer can't be heard, so quiet isn't theirs (6:22 PM call, Oct 29: the mic was muted at the start and the idle timer hung up) */
    act("step", "The voice service heard no speech for a while (its idle timer)" + (early ? ": ignored, a form is open and the phone allows " + idleMs() / 1000 + " s" : muted ? ": ignored, the phone has the microphone muted; waiting for it to come back" : "")); if (muted) toast("Your phone has the microphone muted. Waiting for it to come back.");
    if (G.live && !G.idleEnding && !G.idleAt && !early && !muted) { send({ type: "response.cancel" }); G.dropNext = true; idleStart(); } else if (early || muted) G.dropIdle = Date.now(); } /* the service still answers its own timer with a check-in ("The candles flicker in approval", Oct 28 4:41 PM call): a reply it starts in the next 5 s is dropped, with no hang-up */
  if (t === "error" && e.error && e.error.code !== "conversation_already_has_active_response") act("step", `Voice service error ${e.error.code || ""}: ${String(e.error.message || "").slice(0, 160)} (a refused session.update keeps the previous settings)`);
  else if (!/transcript\.delta$|^response\.(content_part|output_item\.added|function_call_arguments\.delta)/.test(t)) {
    if (t === "response.done" && G.idleEnding && G.goodbye) { clearTimeout(G.idleTimer); const left = G.ctx ? Math.max(0, G.playHead - G.ctx.currentTime) : 0; G.idleTimer = setTimeout(idleHangUp, left * 1000 + 500); }
    if (t === "response.created" || t === "response.done" || /function_call/.test(t)) G.turnOpen = 0; /* a reply or a tool call started, or a reply finished: the officer's turn is answered (turnWatch) */
  if (t === "response.done" && G.lateForced && G.lateForced.resp === G.respSeq) G.lateForced.firstAudio = G.audioSamples || 0;
    if (t === "response.done") { if (G.tourEnding) { G.tour = false; G.tourEnding = false; } G.audioOn = false; setTimeout(() => { G.audioSamples = 0; }, 0); if (G.echoPeak) vlog(`mic while Grok spoke: peak ${G.echoPeak.toFixed(3)}, ${G.barge || 0} loud frames passed (interrupt level ${BARGE_RMS})`); G.echoPeak = 0; G.barge = 0; }
    vlog("← " + t + (t === "response.done" ? ` ${e.response && e.response.status}${G.audioSamples ? ` (${(G.audioSamples / 24000).toFixed(1)}s of audio)` : ""}${G.bot ? ' "' + G.bot + '"' : ""}` : "") + (/function_call_arguments\.done/.test(t) ? " " + e.name + " " + String(e.arguments || "").slice(0, 80) : "")
      + (t === "error" ? " " + JSON.stringify(e.error || e).slice(0, 200) : "") + (/input_audio_transcription\.completed/.test(t) ? ' "' + (e.transcript || "") + '"' : ""));
  }
  if (/input_audio_transcription\.completed/.test(t) && e.transcript) { G.heardN = (G.heardN || 0) + 1; G.heardWait = null; if (!G.turnOpen && !G.responding && !G.speechOn) { G.turnOpen = Date.now(); G.turnStep = 0; } /* the officer's turn is open until a reply starts (turnWatch); a partial transcript while they are still talking opens nothing (real-line runs Oct 29: "taking a moment" 4 s into a long sentence) */ G.lastHeard = { text: e.transcript, n: G.heardN, at: Date.now(), repeat: !!(G.lastHeard && Date.now() - G.lastHeard.at < REPEAT_MS && sameWords(e.transcript).startsWith(sameWords(G.lastHeard.text))) }; act("user", e.transcript); recent("Officer", e.transcript); if (typeof idleAnswer === "function" && idleAnswer(e.transcript)) {} else if (!(typeof hfYesHeard === "function" && hfYesHeard(e.transcript)) && !voiceCommand(e.transcript) && typeof nextStepNo === "function") nextStepNo(e.transcript);
    if (typeof heardAsk === "function" && heardAsk(e.transcript)) guide("The officer heard nothing for a while and asked whether you are there. Say \"I'm here.\" and then say your last line again, word for word."); }
  if (G.forced) forcedEvent(t, e);
  if (t === "response.done" && G.bot && G.unheardResp === G.respSeq) G.unheard = G.bot; /* said into a paused sound engine: said again when it is back */
  if (t === "response.done" && G.resend && G.respSeq === G.resend.resp) G.resend.firstAudio = G.audioSamples || 0; /* how much sound the first telling after the resend had: a second telling is cut only if the first was heard */
  if (t === "response.done" && G.bot && soundedCopy(G.bot)) { G.lastBot = G.bot; G.lastBotAt = Date.now(); act("step", `Ara's line arrived again, this time with sound (${((G.audioSamples || 0) / 24000).toFixed(1)} s): the officer hears it once`); if (typeof silentSoundArrived === "function") silentSoundArrived(G.bot); if (typeof lineHeard === "function") lineHeard(G.bot); } /* real Ara run, Oct 29: 13 "said twice" rows were a words-only response followed by its sounded copy */
  else if (t === "response.done" && G.bot) { G.lastBot = G.bot; G.lastBotAt = Date.now(); act("grok", G.bot); if (typeof lineHeard === "function") lineHeard(G.bot); recent(botName(), G.bot); saveAckCheck(G.bot); }
  if (t === "response.done") { contextCheck(e.response || {}); toolCheck(e.response || {}); replyCheck(e.response || {}); G.bot = ""; }
  if (t === "input_audio_buffer.speech_started") { busy(); if (G.idleEnding) { G.idleEnding = false; clearTimeout(G.idleTimer); } truncateSpoken(); stopPlayback(); G.status = "Listening"; G.bot = ""; G.caps = []; paintCall();
    if (G.asked && !G.responding && PROV().forceItem) { if (G.savedAt && Date.now() - G.savedAt < SAVE_ECHO_MS) act("step", "The officer spoke right after a save: the save confirmation is still coming (not cancelled)"); /* Oct 28 12:54 PM call: a repeated "yes, save it" cancelled the confirmation and the officer heard nothing */
      else { clearTimeout(G.askWatch); G.askWatch = null; clearTimeout(G.tickWatch); G.asked = false; act("step", "The officer spoke while a reply was still requested: that request is dropped (one question, one answer)"); } } } /* no response.cancel here: nothing is being generated yet and the service answers "Cancellation failed: no active response found" (Oct 28) */ /* Oct 25 review item 10: stacked re-asks gave three "I'm here" in a row */
  else if (t === "input_audio_buffer.speech_stopped") { G.status = "Thinking…"; G.speechOn = false; G.heardWait = { n: G.heardN || 0, at: Date.now() }; if (!G.responding) { G.turnOpen = Date.now(); G.turnStep = 0; } paintCall(); } /* a reply already running (the app's save line on a quick "yes") answers this turn: real-line runs Oct 29 said "Ara's taking a moment" 3 s after every save line */ /* the transcript of this turn is still to come: a tool call before it waits (onTool) */
  else if (t === "response.created" && G.retriedAt && !G.asked && G.spokeSince > G.retriedAt && Date.now() - G.retriedAt < 30000 && !G.heardSinceRetry) {
    // the late answer to the first ask arrived after the app asked again: one of the two is extra (seen Oct 24: "Just to be sure..." said twice)
    G.retriedAt = 0; vlog("doubled reply: cancelled"); act("step", "Grok started a second answer to the same ask; cut it off"); send({ type: "response.cancel" }); G.dropNext = true; return; }
  else if (t === "response.created") { G.createAt = 0; G.slowSaid = false; if (G.dropIdle) { if (Date.now() - G.dropIdle < 5000 && !G.asked && !G.qCreate) { G.dropNext = true; send({ type: "response.cancel" }); act("step", "The voice service's own check-in after its idle timer: dropped"); } G.dropIdle = 0; } G.respSeq = (G.respSeq || 0) + 1; G.respAudio = { itemId: null, t0: null, end: 0 }; clearTimeout(G.askWatch); clearTimeout(G.tickWatch); G.askWatch = null; G.respAsked = G.asked; G.asked = false; G.respTool = false; G.respItems = []; G.bot = ""; G.responding = true; G.caps = (G.caps || []).filter(c => c.t1 && G.ctx && c.t1 > G.ctx.currentTime).concat([{ text: "", t0: null, t1: null }]); }
  else if (/audio\.delta$/.test(t) && (e.delta || e.pcm)) { if (G.muteResp === G.respSeq) { /* a cut late copy: its audio is dropped, not played */ } else if (e.pcm) playPcm(e.pcm); else playChunk(e.delta); const paused = !G.ctx || G.ctx.state !== "running"; if (paused) G.unheardResp = G.respSeq; const want = paused ? "Ara is talking, but the phone's sound is paused" : "Speaking"; if (G.status !== want) { G.status = want; paintCall(); if (paused && !G.noSoundSaid) { G.noSoundSaid = true; act("step", `Ara's voice arrived but the phone played no sound (sound ${G.ctx ? G.ctx.state : "not started"})`); } } if (!paused) G.noSoundSaid = false; }
  else if (/audio_transcript\.delta$/.test(t) && e.delta) { G.bot += e.delta; const c = G.caps && G.caps[G.caps.length - 1]; if (c) c.text += e.delta; capTick(); lateForcedCheck(); resendCheck(); }
  else if (t === "response.done") { G.responding = false; flushQueued(); setTimeout(() => { if (G.live && !G.sources.length) { G.status = "Listening"; paintCall(); } }, 300); }
  else if (t === "response.function_call_arguments.done") onTool(e.call_id, e.name, e.arguments);
  else if (t === "response.output_item.done" && e.item && e.item.type === "function_call") onTool(e.item.call_id, e.item.name, e.item.arguments);
  else if (t === "conversation.created" && e.conversation && e.conversation.id) { if (G.convId !== e.conversation.id) vlog("conversation " + e.conversation.id); G.convId = e.conversation.id; }
  else if (t === "error" && e.error && e.error.code === "conversation_already_has_active_response" && G.forced && G.forced.viaReply && !G.forced.started) { // OpenAI refused the scripted line's reply request: the line goes again after the running reply, not a plain reply in its place
    const f = G.forced; G.forced = null; clearTimeout(G.forceTimer); G.createAt = 0; G.responding = true; clearTimeout(G.qTimer); G.qTimer = setTimeout(() => { G.responding = false; flushQueued(); }, 6000);
    vlog("scripted line refused (a reply already running): sent again after it"); act("step", "Scripted line refused by the engine (a reply already running): sent again after it"); forceSay(f.text, f.then, f.fallback); }
  else if (t === "error" && e.error && e.error.code === "conversation_already_has_active_response") { // OpenAI: the request goes again once the running reply is done
    G.asked = false; G.createAt = 0; clearTimeout(G.askWatch); clearTimeout(G.tickWatch); G.askWatch = null; G.qCreate = true; if (!G.qGuide && G.askGuide) G.qGuide = G.askGuide; G.responding = true; clearTimeout(G.qTimer); G.qTimer = setTimeout(() => { G.responding = false; flushQueued(); }, 6000);
    vlog("reply request refused (one already running): queued"); act("step", "Reply request refused by the engine (one already running): sent again after it"); }
  else if (t === "error" && G.forced && !G.forced.started) { const f = G.forced; G.forced = null; clearTimeout(G.forceTimer); act("step", "Scripted line refused: Ara says it instead"); guide(f.fallback); }
  else if (t === "error") { console.warn("Grok error", e); if (e.error && e.error.message && !/Item not found/i.test(e.error.message)) act("step", "Grok error: " + e.error.message.slice(0, 300)); if (e.error && e.error.message && !/Item not found/i.test(e.error.message)) toast("Voice: " + e.error.message); }
  if (t === "conversation.item.added" && e.item && e.item.id) { if (e.item.type !== "function_call") (G.respItems = G.respItems || []).push(e.item.id); if (G.tour && e.item.type !== "function_call" && !G.tourItems.includes(e.item.id)) G.tourItems.push(e.item.id); }
}
// A new response or session update sent while Grok is still speaking cuts off what it was saying ("Opening the…"), so both wait
// until the current response is done AND its audio has finished playing on the phone (xAI: wait for playback before the next response).
// A scripted line that didn't start in time was said by Ara instead; if xAI then plays it anyway, the officer would hear it twice
// (Oct 25: the read-back twice, then "Are you there?"). The second telling is cut as soon as its words match.
// the same words as the last line, which came without voice audio less than 15 s ago, now with audio: the sounded copy of that line, not a second telling
const soundedCopy = (text) => { const r = G.lastLine; return !!(r && typeof AUDIO_MIN_S !== "undefined" && r.audioS < AUDIO_MIN_S && Date.now() - r.at < 15000 && (G.audioSamples || 0) / 24000 >= AUDIO_MIN_S && sameWords(r.text) === sameWords(text)); };
const REPEAT_MS = 6000; /* the service sends the same transcript again, sometimes grown by a word, within a few seconds: that is no new answer */
const sameWords = (s) => String(s).toLowerCase().replace(/[^a-z0-9$ ]/g, " ").replace(/\s+/g, " ").trim();
function lateForcedCheck() {
  const lf = G.lateForced; if (!lf) return;
  if (Date.now() - lf.at > LATE_FORCE_MS) { G.lateForced = null; return; }
  const said = sameWords(G.bot), want = sameWords(lf.text);
  if (said.length < 12 || !want.startsWith(said.slice(0, 40))) return; // not (yet) the scripted words
  if (!lf.resp) { lf.resp = G.respSeq; return; } // the first telling plays, whichever it is
  if (lf.resp === G.respSeq) return;
  if (!(lf.firstAudio > 12000)) { G.lateForced = null; vlog("scripted line played late, but the first telling had no sound: let it play"); return; } // the officer may not have heard the first one (Oct 25)
  G.lateForced = null; vlog("scripted line played late: duplicate cut"); act("step", "Scripted line played late after Ara said it: cut the repeat");
  send({ type: "response.cancel" }); stopResp(G.respSeq); G.dropNext = true;
}
// after the phone asked for a soundless line again, two tellings can arrive (the late sound of the first, and the answer to the ask): the first one heard
// with sound plays, the other is cut before it plays (Carverhill's 12:45 PM call, Oct 30: two save lines heard twice, 6 and 4 s apart)
function resendCheck() {
  const r = G.resend; if (!r) return;
  if (Date.now() - r.at > LATE_FORCE_MS / 3) { G.resend = null; return; }
  if (G.respSeq === r.seq) return; /* the words-only response itself */
  const said = sameWords(G.bot), want = sameWords(r.text);
  if (said.length < 12 || !want.startsWith(said.slice(0, 40))) return;
  if (!r.resp) { r.resp = G.respSeq; return; } /* the first telling after the ask plays, whichever it is */
  if (r.resp === G.respSeq) return;
  if (!(r.firstAudio / 24000 >= AUDIO_MIN_S)) { G.resend = null; vlog("the line came again, but the first telling had no sound: let it play"); return; }
  G.resend = null; act("step", "Late copy cut: the line was already heard with sound after the phone asked for it again"); send({ type: "response.cancel" }); stopResp(G.respSeq); G.dropNext = true;
}
function sentInstructions() { G.sentRules = rulesKey(); G.sentCtx = ctxNow(); return grokInstructions(); }
const playingLeft = () => G.ctx && G.playHead > G.ctx.currentTime + 0.05 ? G.playHead - G.ctx.currentTime : 0;
function flushQueued() {
  clearTimeout(G.qTimer); G.qTimer = null;
  if (!G.qInstr && !G.qCreate) return;
  const left = playingLeft();
  if (left > 0 && G.live) { G.qTimer = setTimeout(flushQueued, Math.min(left * 1000 + 60, 1000)); return; }
  if (G.qInstr) { G.qInstr = false;
    // the rules changed (hands-free, name, a theme) or the Right now section did (a save, a screen): the instructions go again, updated
    if (G.sentRules !== rulesKey() || ctxNow() !== G.sentCtx) { syncState(G.sentRules !== rulesKey() ? "the rules changed" : "Right now changed"); } }
  if (G.qCreate) { G.qCreate = false; const g = G.qGuide; G.qGuide = ""; askReply(g); }
}
// ---------- Ara's state: told to her the moment it changes, with the service's receipt (Carverhill, Oct 29: "confirm Ara knows the form has been saved") ----------
// Every session.update is answered by the service with session.updated, in order, so the receipt for the state is the n-th session.updated on the
// same line, n = updates sent on it. No receipt in SYNC_RECEIPT_MS: the state goes again once. A line that changed meanwhile carries the state in its own configuration.
const SYNC_RECEIPT_MS = 3000;
function syncStats() { return G.sync || (G.sync = { sent: 0, confirmed: 0, ms: [], missed: 0, resent: 0, guards: {}, guardsAfterReceipt: 0 }); }
function syncState(reason, then) {
  if (!G.live || !G.ws || G.ws.readyState !== 1) { if (then) then(); return; }
  G.syncN = (G.syncN || 0) + 1; sessUpdate({ instructions: sentInstructions() }); syncMark(reason, then); }
function syncMark(reason, then) { /* the update just sent (by syncState, or the line's own configuration) is the one whose receipt is awaited */
  if (!G.ws) { if (then) then(); return; } const ws = G.ws, s = syncStats(); s.sent++;
  const old = G.syncPending && G.syncPending.ws === ws ? G.syncPending : null; /* a newer state supersedes the wait: whatever waited for the old receipt now waits for this one */
  G.syncPending = { ws, seq: ws.upN || 0, reason, at: Date.now(), tries: (old && old.reason === reason ? old.tries : 0) + 1, then: then || (old && old.then) || null };
  act("step", `Ara's state sent (${reason}): ${G.saves && G.saves.length ? "saved so far " + G.saves.length : "nothing saved"}, ${V ? "a form is open" : "no form open"}, version ${G.syncN || 0}`);
  clearTimeout(G.syncTimer); G.syncTimer = setTimeout(syncCheck, SYNC_RECEIPT_MS);
  if (ws.ackN >= (ws.upN || 0)) syncAck(null); /* the receipt was already in (a warmed line) */ }
function syncAck(e) {
  const ws = G.ws; if (!ws) return; if (e) ws.ackN = (ws.ackN || 0) + 1;
  const p = G.syncPending; if (!p || p.ws !== ws || (ws.ackN || 0) < p.seq) return;
  G.syncPending = null; clearTimeout(G.syncTimer); const ms = Date.now() - p.at, s = syncStats(); s.confirmed++; s.ms.push(ms); G.stateOkAt = Date.now();
  act("step", `Ara's state confirmed by the voice service in ${ms} ms (${p.reason}${p.tries > 1 ? ", on the resend" : ""})`); if (p.then) p.then(); }
function syncCheck() {
  const p = G.syncPending; if (!p || !G.live) return;
  if (G.ws !== p.ws) { G.syncPending = null; act("step", `Ara's state (${p.reason}): the line changed before the receipt; the new line's configuration carries it`); if (p.then) p.then(); return; }
  const s = syncStats(); s.missed++; if (p.then) { const t = p.then; p.then = null; t(); } /* whatever waited for the receipt goes on; the officer isn't kept waiting */
  if (p.tries >= 2) { G.syncPending = null; act("step", `Ara's state not confirmed after the resend (${p.reason}): carrying on; a guard answers any stale call`); return; }
  s.resent++; act("step", `No receipt for Ara's state in ${SYNC_RECEIPT_MS / 1000} s (${p.reason}): sent again`); p.ws.ackN = p.ws.upN || 0; syncState(p.reason); } /* the count realigns on the resend: one lost receipt must not leave every later one short */
function syncWait(then) { if (G.syncPending && G.syncPending.ws === G.ws && !G.syncPending.then) G.syncPending.then = then; else then(); }
// a guard that answers a call made on an old picture of the form: counted, and marked when Ara had the state confirmed already (then it's her, not the delivery)
function guardFired(name, detail) { const s = syncStats(); s.guards[name] = (s.guards[name] || 0) + 1; const late = !!(G.stateOkAt && !G.syncPending); if (late) s.guardsAfterReceipt++;
  act("step", `Guard: ${name}${detail ? " (" + detail + ")" : ""}${late ? "; Ara had the state confirmed " + Math.round((Date.now() - G.stateOkAt) / 1000) + " s before, so she acted on an old picture" : "; her state was still on its way"}`); }
function syncSummary() { const s = G.sync; if (!s || !s.sent) return ""; const ms = s.ms.slice().sort((a, b) => a - b), med = ms.length ? ms[Math.floor(ms.length / 2)] : 0;
  return ` State syncs ${s.sent}, confirmed ${s.confirmed} (median ${med} ms), missed ${s.missed}, resent ${s.resent}; guards ${Object.entries(s.guards).map(([k, v]) => k + " " + v).join(", ") || "none"}, after a confirmed receipt ${s.guardsAfterReceipt}.`; }
// Ara talked but didn't call the tool (Carverhill's 8:58 AM call, Oct 30: "We'll fill in the form together as you talk" with no show_contact_draft, then
// "Joe Jones it is" with nothing filled; the call went quiet). The app never opens or fills a form for her (split-brain risk, Carverhill): it asks
// her again for the tool call, at once, up to TOOL_ASKS times; a slow retry gets "Ara's taking a moment" from the usual reply ladder, a fast one nothing.
const TOOL_ASKS = 3;
const PROMISE_RE = /fill in the form|let'?s (add|create|record|log|start|open|make|set up|get)|i'?ll (open|start|pull up|add|create|record|log|set up|get)|(opening|starting|pulling up|adding|creating|setting up) (the|a|an|your)/i;
const FORM_REQ_RE = /\bform\b|\b(new|create|add|make|open|start|record|log|schedule|enter)\b.{0,40}\b(contact|task|opportunit|meeting|interaction|pledge|gift|ask|plan|report|payment)/i;
const NOT_ANSWER_RE = /\?\s*$|^(what|who|when|where|how|why|is|are|do|does|did|can|could|would|should|which|tell me|show|read|repeat|say (that|it) again|cancel|undo|never mind|stop|wait|hold on|go back|i'?ve parked|i'?m parked|hey ara|are you|hello|yes|yeah|yep|no|nope|skip|none|nothing|save|ok|okay|sure|thanks|thank you)\b/i;
function toolCheck(r) {
  if (!G.live || G.idleEnding || G.respTool || !G.bot || r.status === "cancelled" || G.respForcedSeq === G.respSeq || G.dropNext) { if (G.nudge && G.respTool) G.nudge = null; return; }
  const heard = G.lastHeard && Date.now() - (G.lastHeard.at || 0) < 45000 ? String(G.lastHeard.text || "").trim() : "";
  if (G.nudge) { // a retry came back, still without the tool call
    if (G.nudge.tries >= TOOL_ASKS) { act("step", `Ara still didn't call the tool after ${TOOL_ASKS} asks ("${G.bot.slice(0, 80)}"): waiting for the officer`); G.nudge = null; return; }
    G.nudge.tries++; act("step", `Ara answered again without the tool call ("${G.bot.slice(0, 80)}"): asked again (${G.nudge.tries} of ${TOOL_ASKS})`); const g = G.nudge.guide; setTimeout(() => { if (G.live && G.nudge) askReply(g); }, 0); return; }
  let kind = "", guide = "";
  const acted = (G.heardN || 0) <= (G.toolHeardN || 0); /* a tool call already answered the officer's last words (Patient Pat: "In person." was filled, then Ara's "Okay." to the app's guidance drew three asks) */
  if (acted) return;
  if (!V && heard && (PROMISE_RE.test(G.bot) || FORM_REQ_RE.test(heard) && !NOT_ANSWER_RE.test(heard))) { kind = "open the form"; /* her own promise counts even after a bare yes (Patient Pat: "Sure, let's add that." to the next-step yes, no tool) */
    guide = (PROMISE_RE.test(G.bot) ? `Your reply ("${G.bot.slice(0, 120)}") promised a form but had no tool call` : `The officer asked for a form ("${heard.slice(0, 120)}") and your last reply had no tool call`) + `, so nothing opened on the screen. Call that form's tool now, with whatever fields you have (none is fine); the app then asks the first question. Say nothing else.`; }
  else if (V && V.fromVoice && !V.opt && heard && !NOT_ANSWER_RE.test(heard) && !hfYes(heard) && !/\?\s*$/.test(G.bot) && heard.split(/\s+/).length <= 40) { const tl = TOOLS.find(x => x.action === V.action); if (!tl) return; kind = "fill the form";
    guide = `The officer answered the open ${ACTIONS[V.action] && ACTIONS[V.action].title ? ACTIONS[V.action].title : "form"} form's question with "${heard.slice(0, 120)}", and your last reply had no tool call, so nothing was filled in. Call ${tl.name} now with what they said (keep the fields already in). Say nothing else; the app asks the next question.`; }
  if (!kind) return;
  G.nudge = { kind, tries: 1, guide, at: Date.now() }; guardFired("Ara talked but didn't " + kind, `"${G.bot.slice(0, 80)}" after "${heard.slice(0, 60)}"`);
  act("step", `Ara talked but didn't ${kind} ("${G.bot.slice(0, 80)}"): asked again for the tool call (1 of ${TOOL_ASKS})`); setTimeout(() => { if (G.live && G.nudge) askReply(guide); }, 0);
}
// After a drop with no form open, Ara herself says where we were (Carverhill, 10:36 AM call Oct 30: "she always needs to explain what we were doing", and
// "How do we make it so Ara, not the app, plays these messages"): the app asks her for it, checks the reply (the person named, her closing question the
// pending one, no open "what would you like to do") and asks again up to CONTEXT_ASKS times; then its own scripted line is the floor. The same check
// covers a late yes after a save. reconnectBy "app" (Settings, or window.__reconnectBy in the harness) keeps the scripted line: both ways measured by Patient Pat.
const CONTEXT_ASKS = 3, OPEN_Q = /what (would you like|do you want) to do|what'?s next|what next/i; /* "What next?" too (Carverhill's 2:52 PM call, Oct 30) */
const RECONNECT_BY = () => window.__reconnectBy || (typeof S !== "undefined" && S.settings && S.settings.reconnectBy) || "ara";
function contextWatch(kind, w) { G.ctxWatch = { kind, need: { who: w.who || "", q: w.q }, tries: 1, at: Date.now(), seq: G.respSeq || 0, line: w.line, guide: w.guide }; } /* seq: the reply this was armed in (a tool call's) is not the answer */
function contextAsk(kind, w) {
  const guide = `The line was down and is back. Say sorry in a few words, then say in one sentence where we were${w.who ? ` (name ${w.who})` : ""}: ${(w.q && w.line.endsWith(w.q) ? w.line.slice(0, -w.q.length) : w.line).trim().replace(/"/g, "'")} Then ask this question word for word: "${w.q}". Never ask what they'd like to do or what's next; nothing else.`;
  contextWatch(kind, Object.assign({ guide }, w)); act("step", `Ara is asked to say where we were herself (${kind}, 1 of ${CONTEXT_ASKS})`); askReply(guide);
}
function contextCheck(r) {
  const c = G.ctxWatch; if (!c || !G.live) return;
  if (r.status === "cancelled" || G.respForcedSeq === G.respSeq || G.dropNext || G.respSeq === c.seq) return;
  if (!G.bot) { if (G.respTool) { if (G.toolRefusedSeq === G.respSeq) act("step", "A tool call a guard refused while Ara was asked where we were: her words are still awaited"); /* Carverhill's 2:52 PM call (Oct 30): the service replayed save_form after the pickup, the guard refused it, and clearing the watch here let her "Tommy Toyota is saved. What next?" through unchecked */ else G.ctxWatch = null; } return; } /* she opened something instead: not a context line, but she acted */
  const bot = G.bot.trim(), q = lastQuestionOf(bot), named = !c.need.who || new RegExp("\\b" + c.need.who.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(bot);
  const asked = /\?\s*$/.test(bot) && wordOverlap(sameWords(q), sameWords(c.need.q)) >= 0.5, open = OPEN_Q.test(bot) && !OPEN_Q.test(c.need.q);
  const secs = Math.round((Date.now() - c.at) / 100) / 10;
  if (named && asked && !open) { act("step", `Ara said where we were on try ${c.tries} (${secs} s after the first ask): "${bot.slice(0, 80)}"`); G.ctxWatch = null; return; }
  const why = open ? "asked an open question" : !named ? `didn't name ${c.need.who}` : "didn't ask the pending question";
  if (c.tries >= CONTEXT_ASKS) { act("step", `Ara didn't say where we were in ${CONTEXT_ASKS} tries (${why}, "${bot.slice(0, 80)}"): the app says it itself`); guardFired("Ara didn't say where we were", `"${bot.slice(0, 80)}"`); G.ctxWatch = null; forceSay(c.kind === "reconnect" ? `Sorry, I lost you for a moment. ${c.line}` : c.line); return; }
  c.tries++; act("step", `Ara's reply ${why} ("${bot.slice(0, 80)}"): asked again for where we were (${c.tries} of ${CONTEXT_ASKS})`);
  const g = `${c.guide} Your last reply ("${bot.slice(0, 100)}") ${why}.`; setTimeout(() => { if (G.live && G.ctxWatch === c) askReply(g); }, 0);
}
function whenIdle(kind) {
  if (kind === "instr") G.qInstr = true; else G.qCreate = true;
  if (!G.responding) { flushQueued(); return; }
  clearTimeout(G.qTimer); G.qTimer = setTimeout(() => { G.responding = false; flushQueued(); }, 6000); // in case response.done never arrives
}
// The app's answer to a tool call. Only data goes back in the tool result; anything about what to say next rides with the reply request
// (per-response instructions), and a line to be said word for word (a question, a read-back) is spoken by the app's scripted line instead.
// Every refusal gives the engine a way out (Oct 27 spoken runs: Gemini asked the same question seven times after a refusal it could
// not act on). The tool's own error says what to do; this line covers the case where it can't be done at all.
const ESCAPE = "If you can't do what this asks, tell the officer in one short sentence what's needed or that it can't be done that way, then ask what they'd like to do next. Don't call the same tool again with the same words.";
function toolReply(callId, out, speak = true) {
  const { say, status, instructions, ask_exactly, read_back, ...data } = out || {};
  if (ask_exactly) data.asked = ask_exactly; if (read_back) data.read_back = read_back;
  if (data.ok === false && !ask_exactly && !read_back && !data.next) data.next = ESCAPE;
  if (data.ok === false) G.toolRefusedSeq = G.respSeq; /* a refused call is not Ara acting: the where-we-were check keeps waiting for her words */
  send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(data) } });
  const line = ask_exactly || read_back;
  if (line) { forceSay(line); return; } // the scripted line is the turn: no reply request after it
  const g = [instructions, status, say].filter(Boolean).join(" ");
  if (speak) guide(g || "Reply to the officer from the tool result.");
}
