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
// letters the officer spelled out ("T U D Z I N", "K-A-T-H"), joined into words, from their last few lines
function spelledWords() {
  const lines = (G.recent || []).filter(l => l.startsWith("Officer: ")).slice(-1).map(l => l.slice(9));
  const out = []; lines.forEach(t => (spellPrep(t).match(/\b(?:[A-Za-z][.,-]?\s+){2,}[A-Za-z]\b\.?/g) || []).forEach(m => { const w = m.replace(/[^A-Za-z]/g, ""); if (w.length >= 3) out.push(w); }));
  return out;
}
function officerRated() {
  const lines = (G.recent || []).filter(l => l.startsWith("Officer: ")).slice(-3).map(l => l.slice(9).toLowerCase().trim());
  return lines.some(t => /\b(capacity|rating|rated|rate them|rate her|rate him)\b/.test(t) || /\$\s?\d|\b\d+\s?(k|thousand|million)\b|\b(thousand|million|grand)\b|\b(donat\w*|gives?|gave|giving)\b.*\b(dollars?|a year|annually)\b|\bunder (five|5)\b/.test(t)
    || /^(a|b|c|d|e|bee|be|see|sea|cee|dee|ee)[.!]?( please)?[.!]?$/.test(t.replace(/^(it's|its|make it|let's say|lets say|say|um|uh|okay|ok)[, ]+/, "")));
}
// the officer's last words turn texting on or off ("texting is permitted", "you can text him", "no texts"), or null if they didn't mention texting
function officerSaidTexting() {
  const t = ((G.recent || []).filter(l => l.startsWith("Officer: ")).slice(-1)[0] || "").slice(9).toLowerCase().replace(/[’‘]/g, "'");
  if (!/\btext(s|ing|ed)?\b/.test(t)) return null;
  if (/\b(no|not|don't|do not|never|shouldn't|can't|cannot|off)\b/.test(t)) return false;
  return /\b(permit|permitted|allow|allowed|ok|okay|fine|yes|can|should|turn on|on|check|tick|agreed|sure)\b/.test(t) ? true : null;
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
function askRating(callId) { toolReply(callId, { ok: false, error: "Ask which rating: " + CAPACITY_LIST }); }
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
  { action: "editInteraction", name: "show_interaction_edit_draft", description: "Change a SAVED interaction report (date, type, summary, substantive, outcome). Send only what changes; the edit form opens filled in from the report, and the officer taps Save changes. Not for recorded asks: only the Chief Gift Officer corrects those. To change the next step, edit its task.", req: ["contact_name"], props: Object.assign({}, FOR, {
    which_date: { type: "string", description: "YYYY-MM-DD date of the report to change, if the officer names one; leave out for the latest" }, date: S_DATE, meetingType: { type: "string", enum: MEET_TYPES }, summary: { type: "string" }, substantive: { type: "boolean" }, outcome: { type: "string", enum: OUTCOMES } }) },
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
    date: S_DATE, meetingType: { type: "string", enum: MEET_TYPES, description: "How it happened: In person, Phone call or Video call (Event or Email if the officer says so)" }, amount: { type: "number", description: "Amount asked; leave out to use the planned ask" }, fund: { type: "string", enum: FUNDS, description: "The entity receiving the money" },
    response: { type: "string", enum: RESPONSES, description: "Accepted (yes), Countered (a different amount), Awaiting (still thinking it over) or Declined (no)" }, agreedAmount: { type: "number", description: "Verbal figure agreed, or the counter amount" },
    lostReason: { type: "string", description: "Required when Declined: why, in a few words" }, summary: { type: "string" }, nextStep: { type: "string" }, nextDue: S_DATE }) },
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
    { type: "function", name: "show_needs_attention", description: "Show the officer's Needs attention list on Home, filtered when they ask (\"What's overdue?\", \"Show only my tasks\"). Returns the items, most urgent first, to read out briefly.", parameters: { type: "object", properties: { filter: { type: "string", enum: ["all", "overdue", "opportunities", "tasks", "contacts"] } }, required: ["filter"] } },
    { type: "function", name: "call_contact", description: "Put a Call button for a contact on screen when the officer wants to phone them. The officer taps it; the phone places the call.", parameters: { type: "object", properties: FOR, required: ["contact_name"] } },
    { type: "function", name: "get_giving", description: "Look up a contact's giving: lifetime total, this year's total, the last gift with its date, and any open pledge balance. Also opens their contact record.", parameters: { type: "object", properties: FOR, required: ["contact_name"] } },
    { type: "function", name: "get_contact_details", description: "Read every field on a contact's record: email, mobile, contact permissions (email, calls, texting), Ally - Do Not Solicit, Do Not Contact, texting permission source (only when texting is permitted), how we met, capacity rating, status and gift officer. Each field says who is allowed to change it. Also opens their contact record. Use it whenever the officer asks for a contact's email, phone, permissions or any other detail.", parameters: { type: "object", properties: FOR, required: ["contact_name"] } },
    { type: "function", name: "get_opportunity_details", description: "Read every field on a contact's opportunity (the open one, or the latest closed one): name, stage, gift officer, potential, entity, every ask with its planned date, amount, type, campaign, participants and status (original and revised), pledge terms and payments, gift, close reason and any deferral. Each field says who is allowed to change it. Also opens the opportunity. Use it whenever the officer asks about an opportunity, ask, pledge or planned ask date.", parameters: { type: "object", properties: FOR, required: ["contact_name"] } },
    { type: "function", name: "show_list", description: "Open the Opportunities or Tasks screen on one of its views when the officer asks to see a list, for example \"show pledges to record\", \"show my opportunities that need attention\", \"show my waiting tasks\" or \"show what I finished\". To have tasks read out, use get_my_tasks.", parameters: { type: "object", properties: {
      list: { type: "string", enum: ["opportunities", "tasks"] }, view: { type: "string", enum: ["open", "attention", "quarter", "pledges", "closed", "overdue", "week", "waiting", "done"], description: "Opportunities: open, attention (needs attention), quarter (asks this quarter), pledges (pledges to record), closed (closed this year). Tasks: open, overdue, week (due this week), waiting, done" },
      search: { type: "string", description: "Optional words to search the list for, such as a name or entity" } }, required: ["list", "view"] } },
    { type: "function", name: "get_my_tasks", description: "Read the officer's open tasks (not done), soonest due first, with any overdue ones marked. Also opens the Tasks screen. Use it when the officer asks what's on their list, what's due, or what's overdue.", parameters: { type: "object", properties: { which: { type: "string", enum: ["all", "overdue", "due_today", "this_week", "waiting", "in_progress"], description: "Which open tasks: all (default), overdue only, due today or earlier, due in the next seven days, the ones waiting on someone, or the ones in progress" } }, required: [] } },
    { type: "function", name: "get_contact_history", description: "Read a contact's interaction history (meetings, calls and asks, newest first) and their open tasks, including tasks on their opportunity. Also opens their contact record. Use it when the officer asks about past interactions with a contact, what happened last time, or what's outstanding for a contact.", parameters: { type: "object", properties: Object.assign({ focus: { type: "string", enum: ["history_and_tasks", "history", "tasks"], description: "What the officer asked for; default both" } }, FOR), required: ["contact_name"] } },
    { type: "function", name: "highlight_stage", description: "During the process overview, light up one stage on the How it works screen. Call it just before you describe that stage.", parameters: { type: "object", properties: { stage: { type: "string", enum: FLOW.map(f => f.stage) } }, required: ["stage"] } },
    { type: "function", name: "set_user_name", description: "Save the first name of the person using the app. Call it as soon as they say it, with confirmed false; the app tells you how to check the spelling with them. Call it again with confirmed true once they say it's right (with their spelling if they corrected it).", parameters: { type: "object", properties: { first_name: { type: "string" }, confirmed: { type: "boolean", description: "true only after the person has said the name and spelling you read back are right" } }, required: ["first_name"] } },
    { type: "function", name: "set_capacity_rating", description: "Set or change an existing contact's capacity rating (how much they could give). First call it with confirmed false and read back the change; only after the officer says yes, call again with confirmed true.", parameters: { type: "object", properties: Object.assign({ rating: { type: "string", enum: Object.keys(CAPACITY), description: CAPACITY_LIST }, confirmed: { type: "boolean" } }, FOR), required: ["contact_name", "rating", "confirmed"] } },
    { type: "function", name: "set_task_status", description: "Change a task's status: to do, in progress, waiting (on someone, with a check-back date) or done. First call it with confirmed false: the app finds the task and shows it; read back what will change and ask the officer to confirm. Only after they say yes, call again with confirmed true.", parameters: { type: "object", properties: Object.assign({ task: { type: "string", description: "Words from the task as the officer said them, e.g. 'pledge decision' or 'Pennsylvania update'" }, status: { type: "string", enum: ["to_do", "in_progress", "waiting", "done"] }, check_back_on: { type: "string", description: "YYYY-MM-DD to check back, for waiting; leave out if not said" }, confirmed: { type: "boolean" } }, FOR), required: ["task", "status", "confirmed"] } },
    { type: "function", name: "set_speaking_speed", description: "Change how fast you talk when the officer asks you to speak faster or slower (or normally). The choice is remembered on this phone.", parameters: { type: "object", properties: { change: { type: "string", enum: ["faster", "slower", "normal"] } }, required: ["change"] } },
    { type: "function", name: "get_process_faq", description: "Look up the Process FAQ (from the Chief Gift Officer's Guide) for a question about the process: who can do what, stage rules, flags, alerts, pledges and gifts, settings or terms. Returns the closest questions and answers; answer only from them.", parameters: { type: "object", properties: { question: { type: "string", description: "The officer's question, in their words" } }, required: ["question"] } },
    { type: "function", name: "get_demo_changes", description: "Look up what has changed in this proof of concept since it was first released on Oct 18, 2026, from its change log: what's new, when something changed, or why it works the way it does. Pass a few keywords as topic (for example \"task status\" or \"confetti\"), or leave topic out for the latest changes.", parameters: { type: "object", properties: { topic: { type: "string" } }, required: [] } },
    { type: "function", name: "pass_question_to_team", description: "Send a question you can't answer, or a problem or suggestion about the proof of concept, to the project team. Only call it after the officer says yes to passing it on. Write it in the officer's own words, with any detail they gave.", parameters: { type: "object", properties: { question: { type: "string" } }, required: ["question"] } },
    { type: "function", name: "save_form", description: "Hands-free mode only: save the open form for the officer, who is driving and can't tap. First call it with confirmed false: the app gives you a read-back to say word for word. Call it again with confirmed true only after the officer says yes to that read-back. A gift or pledge then gets a second check of the amount, and needs a second yes. The app checks the officer's own words before saving.", parameters: { type: "object", properties: { confirmed: { type: "boolean" } }, required: ["confirmed"] } },
    { type: "function", name: "set_hands_free", description: "Turn hands-free (driving) mode on or off when the officer asks, for example \"I'm driving\" or \"I've parked\". In hands-free mode you read each finished form back and save it when they say yes.", parameters: { type: "object", properties: { on: { type: "boolean" } }, required: ["on"] } },
    { type: "function", name: "optional_fields", description: "Go through a new contact's or new opportunity's optional fields one at a time; the app asks the questions and fills in the answers. step: start (the officer said yes to adding more details), answer (pass the officer's answer to the question you just asked, in their words, as value), skip (they want to skip this one), stop (they've had enough). Each reply tells you exactly what to say next.", parameters: { type: "object", properties: { step: { type: "string", enum: ["start", "answer", "skip", "stop"] }, value: { type: "string", description: "With answer: the officer's answer, for example \"D\", \"yes\", \"neither\", \"C4\", \"50000\" or a sentence" } }, required: ["step"] } },
    { type: "function", name: "set_spooky_mode", description: "Turn spooky mode (Halloween fun: a night look for the app, you as a haunted-house host, spooky sounds) on when the officer says \"spooky mode\", or off when they say \"normal mode\". It only exists in October.", parameters: { type: "object", properties: { on: { type: "boolean" } }, required: ["on"] } },
    { type: "function", name: "set_christmas_mode", description: "Turn Christmas mode (Christmas cheer: an evergreen look with a nativity scene, you as a warm Christmas host, sleigh bells and Santa's \"ho ho ho\") on when the officer says \"Christmas mode\", or off when they say \"normal mode\". It exists in December (and any time on the preview).", parameters: { type: "object", properties: { on: { type: "boolean" } }, required: ["on"] } },
    { type: "function", name: "close_form", description: "Close the open form without saving (close), or clear it to start again (clear), when the officer asks in words the app didn't already carry out. Never say a form was closed or cleared unless this returns ok.", parameters: { type: "object", properties: { change: { type: "string", enum: ["close", "clear"] } }, required: ["change"] } },
    { type: "function", name: "stop_conversation", description: "End the call because the officer wants to stop for now. Say a short, warm goodbye first (for example \"Great work today, talk soon!\"; vary it), then call this.", parameters: { type: "object", properties: {}, required: [] } }]);

function crmSnapshot() {
  return S.contacts.map(c => { const o = openOpp(c.id), a = latestAsk(o);
    return `${nameOf(c)} (${c.status}${c.capacity ? ", capacity " + c.capacity : ""})${o ? ": opportunity in " + o.stage + (a ? `, ask ${money(a.amount)} ${a.status.toLowerCase()}` : "") + (nextStep(o) ? `, next step: ${nextStep(o).line}` : "") : oppReady(c) ? ": no open opportunity, ready for one" : ": no open opportunity"}`; }).join("; ");
}
const SPOOKY_RULES = `SPOOKY MODE IS ON. The officer asked for some Halloween fun, so play a warm, theatrical haunted-house host: speak a little slower, with relish, and now and then (not every turn, at most one per turn) add a short spooky aside about the house itself, such as "Mind the cobwebs.", "The candles flicker in approval.", "Ooh, I heard the floorboards creak." or "Welcome back to the haunted CRM.". Vary them. Everything else is unchanged: every fact, name, number, date and question is exactly as normal, any words you're told to say exactly are said exactly, and all the saving rules apply. The asides are never about investors, money, giving, flags or the officer's mistakes. If they say "normal mode", call set_spooky_mode with on false.`;
const XMAS_RULES = `CHRISTMAS MODE IS ON. The officer asked for some Christmas cheer, so be a warm, jolly, traditional Christmas host: cheerful and kind, and now and then (not every turn, at most one per turn) add a short festive aside about the season, such as "The tree lights are twinkling.", "I can hear sleigh bells.", "Fresh snow on the rooftops tonight." or "The elves are busy in the workshop.". Vary them. Everything else is unchanged: every fact, name, number, date and question is exactly as normal, any words you're told to say exactly are said exactly, and all the saving rules apply. The asides are never about investors, money, giving, flags or the officer's mistakes, and never joke about the nativity, Jesus or anyone's faith. If they say "normal mode", call set_christmas_mode with on false; if they say "spooky mode", call set_spooky_mode with on true.`;
const HF_RULES = `HANDS-FREE MODE IS ON. The officer is probably driving and can't look at or tap the screen, so this overrides "You never save anything" and every "tap the button". Keep each turn short and never describe what's on screen. When a draft has everything it needs, don't ask them to tap: call save_form with confirmed false and say the read-back it gives you, word for word. Call save_form with confirmed true only right after the officer says yes to that read-back; the app checks their words too. If they change something, update the draft and read it back again. Scheduling a meeting needs Google Calendar on screen, so keep it as a draft for when they've parked. If they say they've parked or want to tap themselves, call set_hands_free with on false.`;
function grokInstructions() {
  return `# Who you are
You are ${botName()}, the voice assistant inside Citizens VCRM (built on Veleer), the fundraising CRM used by Citizens Alliance. Your name is ${botName()}; if asked your name, say it. Introduce yourself by name only once per conversation, and keep the greeting to the exact words you are given. ${S.settings.userName ? `You are talking with ${OFFICER}, a gift officer, on their phone; call them ${OFFICER.split(" ")[0]}.` : `You are talking with a gift officer on their phone, and you don't know their name yet. Before anything else, even if they already asked for something, say "Hi, I'm ${botName()}, what's your first name?" When they answer, call set_user_name straight away, then carry on with what they asked.`} Today is ${longToday()} (${todayISO()}).

# How you talk
Speak warmly and briefly: one or two short sentences per turn. Your personality: friendly, upbeat and a little playful, like a favourite colleague. Use everyday contractions and, now and then, a light touch of a few words ("Nice!", "Love it.", "Ooh, good one.", "Got it!"), and vary your wording so you never sound scripted. Share in the officer's wins and show a little sympathy when something goes badly. Never joke about investors, money, Do Not Contact or Ally flags, or the officer's mistakes, and never let personality add a sentence or slow down a task. Lines the app gives you word for word stay exact.
Ask at most one question at a time, and only for a required field the officer hasn't said. Never ask about optional fields, except the ones named below (email and mobile and the optional-fields questions the app gives you for a new contact or opportunity, and the next step for a substantive meeting). Never make up details: leave out anything the officer didn't say, such as a capacity rating.
Call the money's recipient the "entity" (C3, C4 or PAC), never "fund". The only entities, by state: ${ENTITIES_BY_STATE()}. Never name any other; when asked about a state, list exactly those. Say "gift", never "payment". Write spoken email addresses as real addresses. Resolve relative dates against today. When the officer spells something letter by letter, use exactly those letters in the field they mean; "T as in Tom" and words like Tango or Delta stand for their first letter. When they correct how a name is spelled, ask once whether the email address should change to match.
If the officer asks what you can do, say exactly: "${CAN_DO}"
If they ask what they can say, what phrases or commands you understand, or for the voice commands, say exactly: "${CMD_LIST}"
When the officer asks you to talk faster, slower or at normal speed, call set_speaking_speed; it is remembered on this phone.

# Drafts and saving
You never save anything. As soon as the officer says what they want to do (and for whom), call the matching draft tool straight away with whatever they have said, so the form is on screen from the start, before asking anything. Then ask for what is still needed one question at a time, and after each answer call the tool again so the form fills in as they talk. If they correct something, call the tool again. If the officer asks how to do a task ("how do I add a contact"), start doing it with them straight away, saying in one short sentence that you'll fill the form in together as they talk.
When the tool reply says nothing more is needed, ask the officer to check the draft and tap the button named in the reply's "button", using that exact label (say "tap Record pledge", never "tap Save" when the button says something else).
Only say something is saved after the app tells you so. If a tool returns an error, explain it in one sentence and offer the fix or the step it suggests.
The officer can say "cancel", "undo", "go back", "start over" or "say that again" at any time: the app carries these out itself and sends you a notice, so follow the notice and don't act on those words yourself. If they ask in other words to close, cancel or clear the open form and no notice came, call close_form. Never say a form was closed, cancelled, cleared or reset unless an app notice or a tool reply says so.
${G.hands ? HF_RULES + "\n" : ""}${spookyMode() ? SPOOKY_RULES + "\n" : ""}${xmasMode() ? XMAS_RULES + "\n" : ""}After a save, briefly confirm and ask what they'd like to do next, or whether to stop. Never start another task on your own. If they want to stop, say a brief goodbye and call stop_conversation.
You can see saves: the app tells you each time one happens and lists them under Right now. If the officer asks whether something saved, answer from that; never say you can't see saves.

# Task by task
The officer can do any of these, in any order, for any contact: add a contact, log a meeting, add a task to a contact or their opportunity, create an opportunity, move it to Cultivation (or defer that), plan an ask, record an ask and the response, record a pledge, record a gift, phone a contact, schedule a meeting in their Google Calendar, or see a screen.
New contact: always ask for their email and their mobile number (one question at a time, skipping any the officer already gave), explaining briefly that a contact needs at least one; without either it can't be saved. Then the app has you ask once whether they'd like to add more details; if yes, call optional_fields with step start and let the app lead: it gives you one question at a time and fills in each answer itself. Pass every answer to optional_fields (step answer, their words as value); "skip" and "that's enough" are steps skip and stop. Never list all the optional fields at once, and never jump ahead of the app's questions. The same goes for a new opportunity's optional details.
Existing contact: to change their details call show_contact_edit_draft with only what changes; never use show_contact_draft for someone who is already a contact.
Logging a meeting (show_interaction_draft) or recording an ask (show_ask_result_draft): if the officer hasn't said how it happened, ask "Was it in person, a phone call, or a video call?" Always pass date (resolved from what they said, for example yesterday) and meetingType; leaving them out puts today and In person on the draft. A substantive meeting whose outcome isn't Not interested or Referred elsewhere needs a next step and its due date, and so does an ask unless the investor declined: if not said, ask "What's the next step, and when is it due?" before asking them to save.
Booking a future meeting is show_meeting_draft (ask for the day and start time if not said). After they tap Add to Google Calendar, Google Calendar opens and the conversation ends.
Adding a task: always ask for the due date if none was said ("When is it due?"). If the contact has an open opportunity and the officer hasn't said, ask whether the task is for the contact or for their opportunity.
Task status: when the officer says a task is done, started, or that they're waiting on someone, call set_task_status (confirmed false), read back the change, and only after they say yes call it again with confirmed true.
Phoning: call call_contact. Only offer calls the app allows (the contact needs a phone number and Calls permitted on).
Editing saved records: show_contact_edit_draft (contact), show_interaction_edit_draft (a logged meeting or call), show_task_edit_draft (a task's wording or due date), show_ask_plan_edit_draft (a planned ask). A recorded ask, pledge or gift can't be edited by a gift officer: say only the Chief Gift Officer or an administrator can correct it, and never claim it changed.

# Stage rules the app enforces
An opportunity can be created only when the contact has a capacity rating, isn't Do Not Contact or an Ally - Do Not Solicit, and has no other open opportunity; if the app says they aren't ready, explain what's already true and what's still to do, and offer set_capacity_rating when the rating is missing. If the officer asks to create one for a contact who already has one, call show_opportunity_draft anyway and relay what the app says.
Qualification to Cultivation needs a capacity rating, a substantive interaction and the officer's confirmation (show_cultivation_decision), or a defer with a reason. An ask can be planned only in Cultivation; the app adds a reminder task due seven days before the planned date.
Ask responses are Accepted, Countered, Awaiting or Declined. A gift or check handed over when asked, or any yes, is Accepted; Awaiting is only for "still thinking it over". Always send the response. A declined ask closes the opportunity as Closed Lost and needs a reason, so ask why if the officer hasn't said. After Accepted or Countered the app adds a Follow up on agreed pledge task. A yes to an OUTRIGHT ask moves the opportunity straight to Commitment, waiting for the gift; a pledge ask stays in Ask Made until the pledge is recorded with its schedule.
Whenever money comes in, use show_gift_draft: in Ask Made a gift with no pledge is an implied commitment (it passes through Commitment and closes as Closed Won); in Commitment the gift is applied to the pledge and the first one closes it as Closed Won. A closed opportunity is final; the next gift starts a new opportunity.

# Looking things up (always call the tool; never answer from memory, since records change)
Contact details (email, phone, permissions, Ally or Do Not Contact, how we met, rating): get_contact_details, then read the field they asked for. Anything about an opportunity, ask, pledge, gift or planned ask date: get_opportunity_details. If they ask to change a field, follow its who_can_change note: fields only the system or the Chief Gift Officer can change are never changed by you; explain the rule in one sentence and offer the proper action.
Giving (lifetime, this year, last gift): get_giving, and speak its figures; never estimate them.
Their tasks, what's due or overdue: get_my_tasks. To just show a list: show_list. Past interactions, what happened last time, or what's outstanding for a contact: get_contact_history (focus history, tasks, or both).
Preparing for a meeting: get_contact_history for that contact, then a spoken briefing in three or four sentences: their giving (last gift and this year's total), where their opportunity stands and the latest ask, anything outstanding, and one suggested goal for the meeting.
What's next for an opportunity: read its next step from the contacts below.

# Questions about the process
Questions about who can do what, rules, flags, alerts, settings or terms: call get_process_faq with the question, then answer only from what it returns and the stages below, in one to three spoken sentences, using its exact names for buttons, stages, flags and alerts. Do not guess, generalise from other CRMs, or fill gaps. If the answer isn't there, say plainly that it isn't covered in this proof of concept and offer to pass the question to the project team; if the FAQ says something is still open with the customer, say that. If two answers seem to disagree, give the more specific one.
If the officer says "Review FAQ" or asks what they can ask about, name four or five of these topics in one or two sentences, give one example question, and ask what they'd like to know: ${faqTopics().join(", ")}.
Questions about the proof of concept itself (what's new, what changed, when or why): call get_demo_changes with a few keywords and answer in one to three sentences with the date. Don't read the whole list out.
When you can't answer from the FAQ, the list of changes or their data, or the officer reports a problem or makes a suggestion about the proof of concept, say so briefly and ask "Shall I pass that to the project team?" Only after they say yes, call pass_question_to_team with it in their words, then say the team will see it. Never promise when or how the team will reply.

# The process overview
If the officer asks how the process works, for an overview, or to be walked through it (not how to do one task): call show_screen with how_it_works and then highlight_stage for Contact straight away, without saying anything first, then open with the short introduction the tool reply gives you and give a spoken tour, one stage at a time in order. For each stage: call highlight_stage, say one or two plain sentences (what the stage means and what has to happen to move on), then ask "Shall I go on to <next stage>?" and wait. On yes, call highlight_stage for the next stage straight away, before saying anything, and never repeat or finish what you already said; on no, stop and ask what they'd like to do. If they ask you to go straight through, do the remaining stages without asking between them. After the last stage (Closed Won), ask if they have questions or want to try a step. If they interrupt with a question, answer it, then ask whether to carry on with the stage you were on. The stages:
${flowScript()}

# Right now
The app sends a "Right now" update as a notice whenever this changes; the latest one replaces this section.
${ctxNow()}`;
}
// what changes during a call (saves, the screen, the records); sent as a short notice instead of all the instructions again
function ctxNow() {
  const f = focusContact();
  return `${(G.saves || []).length ? `Saved so far in this conversation: ${G.saves.join("; ")}.` : "Nothing has been saved yet in this conversation."}
${f ? `On screen now: ${nameOf(f)}. If the officer doesn't name a contact, they mean ${nameOf(f)}.\n` : ""}Contacts and opportunities: ${crmSnapshot()}.`;
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
  el.innerHTML = `<div class="cb-in"><span class="dot ${/^(Connecting|Reconnecting)/.test(G.status) ? "a" : "g"}"></span><div class="cb-t"><b>${esc(G.status)}</b><div class="cb-cap" id="cbCap" hidden></div>${G.saveCheck ? `<div class="cb-yes">Say “yes” to save</div>` : ""}</div><button class="btn quiet cb-hf${G.hands ? " on" : ""}" data-act3="hands" aria-pressed="${!!G.hands}" title="Hands-free: Ara saves when you say yes">${CAR} ${G.hands ? "Hands-free on" : "Hands-free"}</button><button class="btn quiet cb-end" data-act3="end">End</button></div>`;
  capTick();
}
const TOKEN_URL = "https://veleer-voice.klaracey.workers.dev"; // shared key-holder service; anyone with a demo link can start a conversation
const DEMO_CODE = "veleer2026"; // built in at the owner's request so nobody has to type it; change it here and in Cloudflare together
const tokenUrl = () => S.settings.xaiTokenUrl || TOKEN_URL;
const canTalk = () => !!tokenUrl();
/* Activity log: each conversation's words (what the officer said, Grok's replies, the steps Grok took) go to the Worker,
   which saves them with this phone's random ID, the name given, and the rough location Cloudflare sees. Told to the user in the welcome popup and Settings. */
const ACT = { ready: null, q: [], timer: null };
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
  ACT.q.push({ at: new Date().toISOString(), role, text: String(text).slice(0, 4000), session });
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
  if (!ACT.q.length || !(await logReady())) { if (ACT.ready === false) ACT.q = []; return; }
  const bySession = {}; ACT.q.splice(0).forEach(e => (bySession[e.session] = bySession[e.session] || []).push(e));
  Object.entries(bySession).forEach(([session, events]) => {
    fetch(tokenUrl().replace(/\/$/, "") + "/log", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", "X-Demo-Code": S.settings.demoCode || DEMO_CODE },
      body: JSON.stringify({ device: deviceId(), name: String(S.settings.userName || "").trim(), session, page: /preview/.test(location.pathname) ? "preview" : "live", events: events.map(({ session, ...e }) => e) }) }).catch(() => {});
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
// a voice pass lasts 5 minutes: fetch one when the app opens or comes back, so tapping the mic doesn't wait for it (also wakes the Cloudflare service)
const TOK = { p: null, at: 0 };
function prefetchToken() {
  if (document.visibilityState !== "visible" || (TOK.p && Date.now() - TOK.at < 180000)) return; // during a call too, so a dropped line reconnects without waiting for a new pass
  TOK.at = Date.now(); TOK.p = mintToken(); TOK.p.catch(() => { TOK.p = null; TOK.at = 0; });
}
function getToken() { // each pass is used once; an old or failed one is replaced by a fresh fetch
  const p = TOK.p, fresh = p && Date.now() - TOK.at < 240000; TOK.p = null; TOK.at = 0;
  return fresh ? p.catch(() => mintToken()) : mintToken();
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") prefetchToken(); });
setInterval(prefetchToken, 60000); // keeps a pass ready while the app sits open
async function mintToken() {
  const r = await fetch(tokenUrl(), { method: "POST", headers: { "X-Demo-Code": S.settings.demoCode || DEMO_CODE } });
  if (!r.ok) throw new Error(r.status === 401 ? "bad_code" : "service_" + r.status);
  const j = await r.json();
  const t = j.value || (j.client_secret && (j.client_secret.value || j.client_secret)) || j.token || j.secret;
  if (!t || typeof t !== "string") throw new Error("token_shape");
  return t;
}
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
const send = (o) => { if (o.type !== "input_audio_buffer.append") vlog("→ " + o.type + (o.item ? " " + (o.item.type === "message" ? "notice: " + String(o.item.content[0].text).slice(40, 120) : o.item.type) : "")); if (G.ws && G.ws.readyState === 1) G.ws.send(JSON.stringify(o)); };
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
function playChunk(b64) {
  const i16 = int16FromB64(b64); if (!i16.length) return;
  const buf = G.ctx.createBuffer(1, i16.length, 24000), ch = buf.getChannelData(0);
  for (let i = 0; i < i16.length; i++) ch[i] = i16[i] / 32768;
  const src = G.ctx.createBufferSource(); src.buffer = buf; src.connect(G.ctx.destination);
  const at = Math.max(G.ctx.currentTime + 0.02, G.playHead); src.start(at); G.playHead = at + buf.duration;
  const cap = G.caps && G.caps[G.caps.length - 1]; if (cap) { if (cap.t0 == null) cap.t0 = at; cap.t1 = G.playHead; }
  G.sources.push(src); src.onended = () => { G.sources = G.sources.filter(s => s !== src); };
}
function stopPlayback() { if (G.sources.length) vlog(`playback stopped (${G.sources.length} chunks cut)`); G.sources.forEach(s => { try { s.stop(); } catch (e) {} }); G.sources = []; G.playHead = 0; }

// keep the screen on while a conversation runs (the phone would otherwise auto-lock and pause the web app)
async function keepAwake() {
  try { if (G.live && navigator.wakeLock && !G.wake) { G.wake = await navigator.wakeLock.request("screen"); G.wake.addEventListener("release", () => { G.wake = null; }); vlog("screen kept on"); } }
  catch (e) { vlog("screen wake lock refused: " + (e && e.name)); }
}
function letSleep() { try { G.wake && G.wake.release(); } catch (e) {} G.wake = null; }
// locking the phone pauses the page, which cuts the mic and Grok's connection: end the conversation cleanly instead of leaving it hanging
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && G.live) { vlog("phone locked or app hidden: ending conversation"); G.endedByLock = true; interrupted("app hidden"); }
  else if (document.visibilityState === "visible" && G.leftFor) { const was = G.leftFor; G.leftFor = null; G.endedByLock = false; toast(was === "calendar-live" ? "Welcome back. The conversation paused while you were in Google Calendar; tap the mic to carry on." : "Welcome back. If you tapped Save in Google Calendar, the meeting is in your calendar."); }
  else if (document.visibilityState === "visible" && S.pendingCall) { G.endedByLock = false; callDoneModal(); }
  else if (document.visibilityState === "visible" && G.endedByLock) { G.endedByLock = false; resumeModal(); }
});
// Grok bills for every minute a conversation is open, so hang up after 12 seconds with no talking and no taps
const IDLE_MS = 12000, IDLE_HF_MS = 30000; // hands-free: a driver may take a while to answer
const idleMs = () => G.hands ? IDLE_HF_MS : IDLE_MS;
// speaking speed: Grok's audio.output.speed (0.7 to 1.5), set in Settings or by asking the assistant; kept per phone
const SPEEDS = [0.85, 1, 1.15, 1.3], SPEED_NAMES = { 0.85: "Slower", 1: "Normal", 1.15: "A bit faster", 1.3: "Faster" };
const nearSpeed = (v) => SPEEDS.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a, 1);
const talkSpeed = () => nearSpeed(Number(S.settings.speed) || 1);
// the whole session setup; sent again in full when the speed changes mid-call, so nothing else is reset
const sessionCfg = () => ({ voice: S.settings.voice || "ara", instructions: sentInstructions(), turn_detection: { type: "server_vad" }, tools: toolDefs(),
  audio: { input: { format: { type: "audio/pcm", rate: 24000 } }, output: { format: { type: "audio/pcm", rate: 24000 }, speed: talkSpeed() * (spookyMode() ? 0.9 : 1) } } }); // spooky mode: a touch slower, like a haunted-house host
const speedName = (v) => SPEED_NAMES[nearSpeed(v)].toLowerCase();
const busy = () => { G.lastAct = Date.now(); };
const STALL_MS = 5000, SPEAK_RMS = 0.04; // officer's voice on the mic for 5 s with no word from the voice service means the line may be dead
function idleCheck() {
  // a driver can't see the screen: a soft tick every 4 s while Ara is slow to answer or the line is reconnecting
  if (G.live && ((G.asked && Date.now() - (G.askedAt || 0) >= TICK_MS) || /^Reconnecting/.test(G.status)) && Date.now() - (G.tickAt || 0) >= TICK_MS) { G.tickAt = Date.now(); cue("wait"); vlog("still working: tick"); }
  if (!G.live || G.idleEnding || /^(Connecting|Reconnecting)/.test(G.status)) return;
  const playing = G.audioOn || G.responding || (G.ctx && G.playHead > G.ctx.currentTime);
  if (playing) { busy(); return; }
  if (G.probing) return;
  // the officer is talking but the voice service hasn't heard anything: the line may have stalled without closing (seen Oct 24 in a dead spot)
  const talking = G.speechSince && Date.now() - G.speechSince > STALL_MS && Date.now() - (G.lastMsg || 0) > STALL_MS;
  const since = Date.now() - (G.lastAct || Date.now());
  const quiet = since >= idleMs() && (Date.now() - (G.loudAt || 0) >= idleMs() || since >= 60000); // sound on the mic counts as talking, but not for more than a minute (road noise)
  if (!talking && !quiet) return;
  G.probing = true; const ws = G.ws;
  pingMs(3000).then(ms => { G.probing = false; if (!G.live || G.ws !== ws || G.idleEnding || /^(Connecting|Reconnecting)/.test(G.status)) return;
    const fresh = Date.now() - (G.lastMsg || 0) < 3000; // the voice service is still sending: the line is alive, however slow the test (seen Oct 24: a 2.7 s test while Grok was answering)
    if (!fresh && (typeof ms !== "number" || (talking && ms > 2500))) { G.stalled = true; G.speechSince = 0; netLog(`Line stalled (${talking ? "officer talking, nothing heard back" : "12 s of quiet"})`, ms); reconnect("the line stalled"); return; }
    if (talking) { G.speechSince = 0; return; } // the line is fine: it was background noise
    if (Date.now() - (G.lastAct || Date.now()) >= idleMs()) idleStart(); });
}
function idleStart() {
  G.idleEnding = true; G.idleAt = Date.now(); vlog(`${idleMs() / 1000} seconds quiet: hanging up`);
  notice(`Nobody has spoken or tapped anything for ${idleMs() / 1000} seconds, so the app is hanging up. Say exactly "I'll hang up for now. Tap the mic when you need me." and nothing else.`);
  G.idleTimer = setTimeout(idleHangUp, 12000); // in case Grok doesn't answer
}
function idleHangUp() { clearTimeout(G.idleTimer); if (!G.live) return; const secs = idleMs() / 1000; endCall(`${secs} seconds of quiet`); toast(`Hung up after ${secs} seconds of quiet. Tap the mic when you need me.`); }
document.addEventListener("pointerdown", () => { if (G.live) { busy(); if (G.idleEnding) { G.idleEnding = false; clearTimeout(G.idleTimer); } } }, true);
document.addEventListener("input", () => { if (G.live) busy(); }, true);
async function startCall(opening) {
  try { if (spkCtx && spkCtx.state === "running") spkCtx.suspend(); } catch (e) {} // the Halloween sound engine rests during a conversation
  vlog("=== conversation started" + (opening ? ": " + opening.slice(0, 80) : ""));
  if (navigator.audioSession) vlog("audio session: " + navigator.audioSession.type);
  G.session = deviceId().slice(0, 8) + "-" + Date.now().toString(36); logReady(); act("start", opening ? opening.replace(/^The officer opened the conversation from the app: /, "Tapped: ") : "Tapped the mic");
  if (!G.keepRecent) { G.recent = []; G.saves = []; } G.keepRecent = false;
  G.live = true; { const vb = document.querySelector("#overlay .vfill"); if (vb) vb.remove(); } G.status = "Connecting…"; G.bot = ""; G.caps = []; G.tour = G.tourEnding = false; G.tourItems = []; G.respItems = []; G.handled = new Set(); G.idleEnding = false; busy(); clearInterval(G.idleTick); G.idleTick = setInterval(idleCheck, 1000); paintCall(); render(); keepAwake();
  try {
    G.t0 = Date.now(); G.passReady = !!TOK.p;
    G.ctx = new (window.AudioContext || window.webkitAudioContext)();
    G.ctx.resume();
    // the mic, the voice pass and the audio code all at once, not one after another
    const micP = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(st => (G.stream = st));
    const tokP = getToken(), wkP = G.ctx.audioWorklet ? G.ctx.audioWorklet.addModule(WORKLET_URL).then(() => true, () => false) : Promise.resolve(false);
    tokP.catch(() => {}); micP.catch(() => {});
    const [, token, worklet] = await Promise.all([micP, tokP, wkP]);
    if (!G.live) { try { G.stream && G.stream.getTracks().forEach(t => t.stop()); } catch (x) {} G.stream = null; return; } // hung up while connecting
    // a phone call, timer, alarm or Siri takes the speaker or mic: the audio pauses or the mic goes quiet
    const ctx = G.ctx; ctx.onstatechange = () => { if (G.live && G.ctx === ctx && G.status !== "Connecting…" && ctx.state !== "running") interrupted("audio " + ctx.state); };
    G.stream.getAudioTracks().forEach(tr => { tr.onmute = () => { if (G.live && G.status !== "Connecting…") interrupted("mic muted"); }; tr.onended = () => { if (G.live) interrupted("mic ended"); }; });
    const srcNode = G.ctx.createMediaStreamSource(G.stream);
    const onPcm = (f32) => {
      if (!G.ctx) return;
      // Echo guard: while Grok's voice is playing, the phone's mic can hear the speaker and Grok cuts itself off.
      // Quiet sound during playback is sent as silence; speaking up over Grok still interrupts it.
      if (G.playHead > G.ctx.currentTime + 0.03) {
        let sq = 0; for (let i = 0; i < f32.length; i++) sq += f32[i] * f32[i];
        const rms = Math.sqrt(sq / f32.length); G.echoPeak = Math.max(G.echoPeak || 0, rms);
        if (rms < BARGE_RMS) f32 = new Float32Array(f32.length); else G.barge = (G.barge || 0) + 1;
      }
      if (!(G.playHead > G.ctx.currentTime + 0.03)) { let sq = 0; for (let i = 0; i < f32.length; i += 4) sq += f32[i] * f32[i]; const lvl = Math.sqrt(sq / (f32.length / 4));
      if (lvl > SPEAK_RMS) { if (!G.speechSince) G.speechSince = Date.now(); G.loudAt = Date.now(); } else if (G.speechSince && Date.now() - (G.loudAt || 0) > 8000) G.speechSince = 0; }
    G.buf.push(downsample(f32, G.ctx.sampleRate));
      const total = G.buf.reduce((n, a) => n + a.length, 0);
      if (total < 2400) return; // ~100 ms
      const i16 = new Int16Array(total); let o = 0;
      G.buf.forEach(a => { for (let i = 0; i < a.length; i++) { const v = Math.max(-1, Math.min(1, a[i])); i16[o++] = v < 0 ? v * 0x8000 : v * 0x7fff; } }); G.buf = [];
      send({ type: "input_audio_buffer.append", audio: b64FromInt16(i16) });
    };
    if (worklet) { G.node = new AudioWorkletNode(G.ctx, "cap"); G.node.port.onmessage = (ev) => onPcm(ev.data); }
    else { G.node = G.ctx.createScriptProcessor(4096, 1, 1); G.node.onaudioprocess = (ev) => onPcm(new Float32Array(ev.inputBuffer.getChannelData(0))); }
    srcNode.connect(G.node);
    const mute = G.ctx.createGain(); mute.gain.value = 0; G.node.connect(mute).connect(G.ctx.destination);
    const boo = spookyMode() ? "Mwahaha... welcome to the haunted CRM. " : xmasMode() ? "Ho ho ho... Merry Christmas, and welcome to the Christmas CRM. " : "", how = spookyMode() ? " In your haunted-house host voice, say exactly" : xmasMode() ? " In your warm Christmas host voice, say exactly" : " Say exactly"; // Christmas mode the same, as a jolly Christmas host // spooky mode: Ara is the haunted-house host from her very first words
    const first = S.settings.userName ? (opening || `The officer just opened the conversation.${how} "${boo}Hi ${OFFICER.split(" ")[0]}, I'm ${botName()}, what would you like to do?" and nothing more.`) : (opening ? opening + ` But you don't know their name yet: first${how.replace(" Say", " say").replace(" In", " in")} "${boo}Hi, I'm ${botName()}, what's your first name?", then call set_user_name, then help with that.` : `The officer just opened the conversation and you don't know their name yet.${how} "${boo}Hi, I'm ${botName()}, what's your first name?" and nothing more.`);
    G.drops = 0; openSocket(token, first);
  } catch (e) { endCall(); if (String(e && e.message) === "bad_code") codeModal(opening); else toast(callError(e)); }
}
/* ---------- the voice line: opened at the start, and opened again when it drops (a phone in a car loses signal) ---------- */
function openSocket(token, first) {
  const ws = G.ws = new WebSocket("wss://api.x.ai/v1/realtime?model=grok-voice-latest", ["xai-client-secret." + token]);
  const t0 = Date.now();
  // in a dead spot the line can neither open nor fail: give it 10 s, then count it as a failed try
  if (G.drops) setTimeout(() => { if (G.live && G.ws === ws && ws.readyState === 0) { netLog("Voice line didn't open in 10 s"); reconnect("the line didn't open"); } }, 10000);
  ws.onopen = () => {
    if (G.ws !== ws) return;
    send({ type: "session.update", session: sessionCfg() }); notice(first);
    G.status = "Listening"; G.lastMsg = Date.now(); G.speechSince = 0; busy(); paintCall(); setTimeout(() => { G.stalled = false; }, 0);
    vlog(`connected in ${Date.now() - G.t0} ms (voice pass ${G.passReady ? "was ready" : "fetched on tap"})`);
    netLog(`Voice line open in ${Date.now() - t0} ms${G.drops ? ` (reconnect ${G.drops} of ${MAX_DROPS})` : ""}`);
    if (G.drops) setTimeout(prefetchToken, 2000); // the ready pass was used: have the next one ready for another drop (seen Oct 24: 7 s to fetch one)
    clearInterval(G.netTick); G.netTick = setInterval(() => { if (G.live && G.ws === ws) netLog("Reading"); }, 30000);
  };
  ws.onmessage = (m) => { if (G.ws !== ws) return; G.lastMsg = Date.now(); let e; try { e = JSON.parse(m.data); } catch (x) { return; } onEvent(e); };
  ws.onclose = (ev) => {
    if (G.ws !== ws || !G.live) return;
    vlog("connection closed " + (ev && ev.code));
    const opened = !!G.lastMsg && G.status !== "Connecting…";
    netLog(`Voice line closed (code ${ev && ev.code}${ev && ev.reason ? ", " + String(ev.reason).slice(0, 120) : ""})${opened ? "" : " before it opened"}`);
    if (document.visibilityState === "hidden") { interrupted("connection closed while away"); return; }
    if (!opened && !G.drops) { endCall("couldn't connect"); toast("Couldn't connect to Grok voice. Try again in a moment."); return; }
    reconnect("the voice line dropped");
  };
  ws.onerror = () => {};
}
// what the phone says about its connection; iPhones don't report the network type or speed, only online or offline
function netInfo() {
  const c = navigator.connection, bits = [navigator.onLine === false ? "offline" : "online"];
  if (c) { if (c.type) bits.push(c.type); if (c.effectiveType) bits.push(c.effectiveType); if (c.downlink != null) bits.push(c.downlink + " Mbps"); if (c.rtt != null) bits.push("round trip " + c.rtt + " ms"); }
  else bits.push("network type not reported by this browser");
  if (G.lastMsg) bits.push(`last word from the voice service ${Math.round((Date.now() - G.lastMsg) / 1000)} s ago`);
  return bits.join(", ");
}
// iPhones only say "online", so the app times a tiny request to the key holder itself (the /log status check)
async function pingMs(limit = 8000) {
  if (!tokenUrl()) return null; const t0 = performance.now(), ac = new AbortController(), to = setTimeout(() => ac.abort(), limit);
  try { await fetch(tokenUrl().replace(/\/$/, "") + "/log?ping=" + Date.now(), { cache: "no-store", signal: ac.signal }); return Math.round(performance.now() - t0); } catch (e) { return ac.signal.aborted ? `no answer in ${limit / 1000} s` : "failed"; } finally { clearTimeout(to); }
}
async function netLog(what, known) { const sess = G.session, info = netInfo(), ms = known !== undefined ? known : await pingMs(); act("step", `Connection: ${what}. ${info}${ms == null ? "" : typeof ms === "number" ? `, test request ${ms} ms` : `, test request ${ms}`}`, sess); }
const MAX_DROPS = 3;
// the server's side of the conversation is gone, so a new line gets the last few lines said and the open form
async function reconnect(why) {
  if (!G.live) return;
  if (G.drops >= MAX_DROPS) { voiceUnavailable(why); return; }
  G.drops++; G.status = "Reconnecting…"; G.responding = G.qInstr = G.qCreate = G.asked = false; G.retried = 0;
  clearTimeout(G.qTimer); clearTimeout(G.askWatch); clearTimeout(G.tickWatch); clearInterval(G.netTick); G.retriedAt = 0; G.dropNext = false; stopPlayback(); paintCall();
  const old = G.ws; G.ws = null; try { old && old.close(); } catch (e) {}
  if (G.drops === 1) cue("drop");
  vlog(`reconnecting (${G.drops} of ${MAX_DROPS}): ${why}`); act("step", `Reconnecting (${G.drops} of ${MAX_DROPS}): ${why}`);
  await new Promise(r => setTimeout(r, [0, 1000, 4000, 10000][G.drops] || 10000)); // spread out, so a short dead spot can pass
  if (navigator.onLine === false) await new Promise(r => { const t = setTimeout(r, 15000); window.addEventListener("online", () => { clearTimeout(t); r(); }, { once: true }); });
  if (!G.live) return;
  const ready = !!TOK.p, tp = Date.now(); let token; try { token = await getToken(); act("step", `Voice pass ${ready ? "was ready" : "fetched"} in ${Date.now() - tp} ms`); } catch (e) { netLog("Couldn't get a voice pass (" + String(e && e.message || e).slice(0, 80) + ")"); reconnect("no voice pass"); return; }
  if (!G.live) return;
  G.lastMsg = 0; openSocket(token, reconnectLine());
}
const reconnectLine = () => { const d = draftSummary(), l = G.recent || [], sv = (G.saves || []).length ? `Saved so far in this conversation, all done and NOT to be saved again: ${G.saves.join("; ")}. ` : "",
    justSaved = G.savedAt && Date.now() - G.savedAt < 2 * 60e3 && !V ? `The last save (${G.savedLine}) went through just before the drop and its form closed; don't call save_form for it. ` : "";
  return `The connection to the officer dropped for a moment (they may be driving) and the app reconnected you. ${l.length ? `The last things said were:\n${l.join("\n")}\n` : ""}${sv}${justSaved}${d ? d + " " : ""}${G.stalled ? "The officer may have answered while the line was down and you didn't hear it. " : ""}Say "Sorry, I lost you for a moment."${spookyMode() ? " in your haunted-house host voice" : xmasMode() ? " in your warm Christmas host voice" : ""} Then, if the last thing said was a question to the officer, ask it again; otherwise ask the next question needed to finish. Do not start over or ask for anything already filled in. Anything already done stays done; never redo it${spookyMode() || xmasMode() ? ", and don't turn the theme on again or announce it" : ""}.`; };
// after the retries: a sound and a spoken line from the phone itself, since Grok can't speak
function voiceUnavailable(why) {
  netLog("Voice service unavailable after " + MAX_DROPS + " tries (" + why + ")");
  G.resume = { at: Date.now(), lines: (G.recent || []).slice(), draft: draftSummary(), what: V && ACTIONS[V.action] ? ACTIONS[V.action].title : "" };
  cue("down");
  endCall("voice service unavailable");
  toast("The voice service isn't answering. Your form is still here. Tap the mic to try again.");
}
// short tones (and a spoken line when the phone allows it) so a driver knows without looking
function cue(kind) {
  const notes = kind === "down" ? [660, 520, 390] : kind === "wait" ? [880] : [520, 660];
  try { const ctx = G.ctx && G.ctx.state === "running" ? G.ctx : (typeof spkCtx !== "undefined" && spkCtx) || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state !== "running") ctx.resume();
    notes.forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * 0.22;
      o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === "wait" ? 0.08 : 0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.22); }); } catch (e) {}
  if (kind !== "down") return;
  try { if (window.speechSynthesis) setTimeout(() => { const u = new SpeechSynthesisUtterance("The voice service isn't answering right now. Tap the mic to try again."); u.rate = 1; speechSynthesis.speak(u); }, 750); } catch (e) {}
}
/* ---------- interrupted conversations: a phone call, timer, Siri or locking the phone cuts the mic and speaker ---------- */
// keep the last few lines said, so a new conversation can pick up where the old one stopped
function recent(who, text) { (G.recent = G.recent || []).push(`${who}: ${String(text).slice(0, 300)}`); if (G.recent.length > 8) G.recent.shift(); }
function draftSummary() {
  if (!V || !ACTIONS[V.action]) return "";
  const A = ACTIONS[V.action], t = V.target || {}, who = t.contact ? nameOf(t.contact) : "";
  const have = (A.fields || []).filter(f => V.data && V.data[f.k] !== undefined && V.data[f.k] !== "" && V.data[f.k] !== false).map(f => `${f.label}: ${V.data[f.k]}`);
  const need = (A.fields || []).filter(f => f.req && (!V.data || V.data[f.k] === undefined || V.data[f.k] === "")).map(f => f.label);
  return `The "${A.title}" form${who ? ` for ${who}` : ""} is still open on screen, not saved yet. Filled in so far: ${have.join("; ") || "nothing"}.${need.length ? ` Still needed: ${need.join(", ")}.` : ""}`;
}
function interrupted(why) {
  if (!G.live || G.interrupting) return; G.interrupting = true;
  vlog("conversation interrupted: " + why);
  G.resume = { at: Date.now(), lines: (G.recent || []).slice(), draft: draftSummary(), what: V && ACTIONS[V.action] ? ACTIONS[V.action].title : "" };
  endCall("interrupted: " + why); G.interrupting = false;
  if (document.visibilityState === "visible") resumeModal(); else G.endedByLock = true;
}
function resumeModal() {
  const r = G.resume;
  if (!r || Date.now() - r.at > 30 * 60e3 || (!r.lines.length && !r.draft)) { G.resume = null; toast("The conversation ended. Tap the mic to carry on."); return; }
  const h = document.getElementById("modal");
  h.innerHTML = `<div class="scrim center"><div class="wmodal" role="dialog" aria-modal="true" aria-labelledby="rsmTitle">
    <span class="wl-mic">${mic(22)}</span>
    <h2 id="rsmTitle">Your conversation was interrupted</h2>
    <p>A call, an alarm or the phone locking cut it off.${r.what ? ` Your “${esc(r.what)}” form is still here, not saved.` : ""} ${esc(botName())} can pick up where you left off.</p>
    <button class="btn blue" id="rsmGo">${mic(16)} Carry on</button><button class="btn quiet" id="rsmX">Not now</button></div></div>`;
  document.getElementById("rsmX").onclick = () => { G.resume = null; h.innerHTML = ""; };
  document.getElementById("rsmGo").onclick = () => { h.innerHTML = ""; const r2 = G.resume; G.resume = null; G.recent = r2.lines.slice(); G.keepRecent = true; startCall(resumeLine(r2)); };
}
const resumeLine = (r) => `The officer's last conversation with you was cut off (a phone call, an alarm or the phone locking) and they tapped Carry on. ${r.lines.length ? `The last things said were:\n${r.lines.join("\n")}\n` : ""}${r.draft ? r.draft + " " : ""}Say "${spookyMode() ? "Welcome back to the haunted CRM" : xmasMode() ? "Welcome back, and Merry Christmas" : "Welcome back"}"${spookyMode() ? " in your haunted-house host voice" : xmasMode() ? " in your warm Christmas host voice" : ""} and, in one short sentence, what you were doing together, then ask the next question needed to finish it. Do not start over or ask for anything already filled in. Anything already done before the cut-off stays done${spookyMode() ? " (spooky mode is already on: don't turn it on again or announce it)" : xmasMode() ? " (Christmas mode is already on: don't turn it on again or announce it)" : ""}; never redo it.`;
function endCall(why) {
  clearInterval(G.idleTick); clearInterval(G.netTick); clearTimeout(G.idleTimer); G.idleEnding = false;
  G.live = false; G.hands = false; G.saveCheck = null; stopPlayback(); letSleep();
  try { G.ws && G.ws.close(); } catch (e) {}
  try { G.stream && G.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
  try { G.ctx && G.ctx.close(); } catch (e) {}
  vlog("=== conversation ended"); if (G.session) { act("end", "Conversation ended" + (why ? " (" + why + ")" : "")); G.session = null; } G.ws = G.stream = G.ctx = G.node = null; G.buf = []; G.audioOn = false; G.responding = G.qInstr = G.qCreate = G.asked = false; G.retried = 0; G.drops = 0; G.lastMsg = 0; G.retriedAt = 0; G.dropNext = false; G.speechSince = 0; G.probing = false; G.stalled = false; G.idleAt = 0; clearTimeout(G.qTimer); clearTimeout(G.askWatch); clearTimeout(G.tickWatch); clearInterval(G.pingTick);
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
  notice(`The officer tapped on screen and opened ${what}. Treat ${nameOf(c)} as the contact they mean from now on. In one short sentence, say you see they picked ${nameOf(c)} and ask what they'd like to do.`);
}
// Commands the app carries out itself, so they work the same way every time instead of depending on the model
const VOICE_CMDS = [
  [/^(undo( that| it)?|undo (the )?last (change|one))$/, "undo"],
  [/^(go back|back|take me back)$/, "back"],
  [/^((turn on |switch on |start |use )?(hands ?free|driving)( mode)?( on)?|(i'm|i am) driving( now)?)$/, "hfon"],
  [/^((turn off |switch off |stop |end )(hands ?free|driving)( mode)?|(hands ?free|driving)( mode)? off|(i'm|i am|i've|i have) (parked|stopped driving)( now)?)$/, "hfoff"],
  [/^(say (that|it) again|repeat( that| it)?|what did you say|come again)$/, "repeat"],
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
function cancelForm() { const what = ACTIONS[V.action].title; V = null; renderOverlay(); return what; }
function restartForm() { V.history = []; V.data = prefill(V.action, {}, V.target); V.fromVoice = new Set(); V.askedOther = V.askedOptional = false; V.opt = null; renderOverlay(); return ACTIONS[V.action].title; }
function voiceCommand(text) {
  const t = String(text).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim().replace(/^((please|okay|ok|um|uh|hey|ara|so) )+/, "").replace(/ please$/, "");
  const hit = VOICE_CMDS.find(([re]) => re.test(t)), cmd = hit ? hit[1] : formCommand(t); if (!cmd) return false;
  const who = botName() + ": "; let say;
  if (cmd === "repeat") { const last = (G.recent || []).filter(l => l.startsWith(who)).slice(-1)[0]; if (!last) return false; say = `The officer asked you to repeat. Say again exactly: "${last.slice(who.length)}"`; }
  else if (cmd === "cancel") { if (!V) return false; const what = cancelForm(); say = `The officer said "cancel". The app closed the ${what} form without saving. Say only "Cancelled, nothing was saved. What would you like to do?"`; }
  else if (cmd === "hfon" || cmd === "hfoff") { setHandsFree(cmd === "hfon"); say = G.hands ? `The officer turned on hands-free mode. Say only "Hands-free is on. I'll read each form back and save it when you say yes."` : `The officer turned off hands-free mode. Say only "Hands-free is off. You'll tap Save yourself again."`; }
  else if (cmd === "undo" && !(V && (V.history || []).length) && G.lastSave && G.lastSave.hf && Date.now() - G.lastSave.at < 5 * 60e3) {
    const what = ACTIONS[G.lastSave.action].saved; S = JSON.parse(G.lastSave.undo); G.lastSave = null; if (G.saves) G.saves.pop(); save(); render(); whenIdle("instr");
    say = `The officer said "undo". The app took back the hands-free save (${what}), so it is no longer saved. Say only "Undone, that's not saved. What would you like to do?"`; }
  else if (cmd === "undo") { if (!V || !(V.history || []).length) say = `The officer said "undo", but there is no change on an open form to undo. Say so in one short sentence; a saved record is changed with Edit.`;
    else { V.data = V.history.pop(); renderOverlay(); say = `The officer said "undo". The app put the ${ACTIONS[V.action].title} form back the way it was before your last change. Say in a few words what changed back, then carry on.`; } }
  else if (cmd === "restart") { if (!V) return false; say = `The officer said "start over". The app cleared the ${restartForm()} form. Ask for the first detail again.`; }
  else if (cmd === "back") { if (V) return false; const b = document.querySelector("header.top .back"); if (!b) return false; const where = BACK_NAMES[b.dataset.go] || "the previous screen"; go(b.dataset.go); say = `The officer said "go back". The app is now on ${where}. Say only "Back on ${where}."`; }
  vlog("voice command: " + cmd); act("step", "voice command " + cmd);
  stopPlayback(); if (G.responding) send({ type: "response.cancel" }); G.cmdAt = Date.now(); // drop whatever the model started to do with those words
  notice(say); return true;
}
function notice(text) {
  send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: "(App notice, not spoken by the officer) " + text }] } });
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
  if (G.dropNext) { if (t === "response.done") { G.dropNext = false; G.bot = ""; } if (/delta$/.test(t) || t === "response.done") return; } // the cut-off doubled reply: nothing of it is played or logged
  if (/audio\.delta$/.test(t)) G.spokeSince = Date.now();
  if (t === "input_audio_buffer.speech_started") { G.heardSinceRetry = true; G.speechSince = 0;
    // the officer answered just as the quiet hang-up started (seen Oct 24: Ara said goodbye over "October 24th"): call it off quietly
    if (G.idleAt && Date.now() - G.idleAt < 30000) { G.idleAt = 0; clearTimeout(G.idleTimer); if (G.responding) send({ type: "response.cancel" }); stopPlayback(); vlog("hang-up called off: the officer spoke"); act("step", "Quiet hang-up called off: the officer spoke");
      send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: "(App notice, not spoken by the officer) The officer spoke, so the app is NOT hanging up. Ignore the hang-up notice: don't say goodbye, just answer what they say next." }] } }); } }
  if (/audio\.delta$/.test(t)) { if (!G.audioOn) { G.audioOn = true; G.audioSamples = 0; vlog("← audio starts"); } G.audioSamples += Math.floor(atob(e.delta || "").length / 2); }
  else if (!/transcript\.delta$|^response\.(content_part|output_item\.added|function_call_arguments\.delta)/.test(t)) {
    if (t === "response.done" && G.idleEnding) { clearTimeout(G.idleTimer); const left = G.ctx ? Math.max(0, G.playHead - G.ctx.currentTime) : 0; G.idleTimer = setTimeout(idleHangUp, left * 1000 + 500); }
    if (t === "response.done") { if (G.tourEnding) { G.tour = false; G.tourEnding = false; } G.audioOn = false; setTimeout(() => { G.audioSamples = 0; }, 0); if (G.echoPeak) vlog(`mic while Grok spoke: peak ${G.echoPeak.toFixed(3)}, ${G.barge || 0} loud frames passed (interrupt level ${BARGE_RMS})`); G.echoPeak = 0; G.barge = 0; }
    vlog("← " + t + (t === "response.done" ? ` ${e.response && e.response.status}${G.audioSamples ? ` (${(G.audioSamples / 24000).toFixed(1)}s of audio)` : ""}${G.bot ? ' "' + G.bot + '"' : ""}` : "") + (/function_call_arguments\.done/.test(t) ? " " + e.name + " " + String(e.arguments || "").slice(0, 80) : "")
      + (t === "error" ? " " + JSON.stringify(e.error || e).slice(0, 200) : "") + (/input_audio_transcription\.completed/.test(t) ? ' "' + (e.transcript || "") + '"' : ""));
  }
  if (/input_audio_transcription\.completed/.test(t) && e.transcript) { G.heardN = (G.heardN || 0) + 1; G.lastHeard = { text: e.transcript, n: G.heardN }; act("user", e.transcript); recent("Officer", e.transcript); voiceCommand(e.transcript); }
  if (t === "response.done" && G.bot) { act("grok", G.bot); recent(botName(), G.bot); }
  if (t === "response.done") replyCheck(e.response || {});
  if (t === "input_audio_buffer.speech_started") { busy(); if (G.idleEnding) { G.idleEnding = false; clearTimeout(G.idleTimer); } stopPlayback(); G.status = "Listening"; G.bot = ""; G.caps = []; paintCall(); }
  else if (t === "input_audio_buffer.speech_stopped") { G.status = "Thinking…"; paintCall(); }
  else if (t === "response.created" && G.retriedAt && !G.asked && G.spokeSince > G.retriedAt && Date.now() - G.retriedAt < 30000 && !G.heardSinceRetry) {
    // the late answer to the first ask arrived after the app asked again: one of the two is extra (seen Oct 24: "Just to be sure..." said twice)
    G.retriedAt = 0; vlog("doubled reply: cancelled"); act("step", "Grok started a second answer to the same ask; cut it off"); send({ type: "response.cancel" }); G.dropNext = true; return; }
  else if (t === "response.created") { clearTimeout(G.askWatch); clearTimeout(G.tickWatch); G.askWatch = null; G.respAsked = G.asked; G.asked = false; G.respTool = false; G.respItems = []; G.bot = ""; G.responding = true; G.caps = (G.caps || []).filter(c => c.t1 && G.ctx && c.t1 > G.ctx.currentTime).concat([{ text: "", t0: null, t1: null }]); }
  else if (/audio\.delta$/.test(t) && e.delta) { playChunk(e.delta); if (G.status !== "Speaking") { G.status = "Speaking"; paintCall(); } }
  else if (/audio_transcript\.delta$/.test(t) && e.delta) { G.bot += e.delta; const c = G.caps && G.caps[G.caps.length - 1]; if (c) c.text += e.delta; capTick(); }
  else if (t === "response.done") { G.responding = false; flushQueued(); setTimeout(() => { if (G.live && !G.sources.length) { G.status = "Listening"; paintCall(); } }, 300); }
  else if (t === "response.function_call_arguments.done") onTool(e.call_id, e.name, e.arguments);
  else if (t === "response.output_item.done" && e.item && e.item.type === "function_call") onTool(e.item.call_id, e.item.name, e.item.arguments);
  else if (t === "error") { console.warn("Grok error", e); if (e.error && e.error.message && !/Item not found/i.test(e.error.message)) act("step", "Grok error: " + e.error.message.slice(0, 300)); if (e.error && e.error.message && !/Item not found/i.test(e.error.message)) toast("Voice: " + e.error.message); }
  if (t === "conversation.item.added" && e.item && e.item.id) { if (e.item.type !== "function_call") (G.respItems = G.respItems || []).push(e.item.id); if (G.tour && e.item.type !== "function_call" && !G.tourItems.includes(e.item.id)) G.tourItems.push(e.item.id); }
}
// A new response or session update sent while Grok is still speaking cuts off what it was saying ("Opening the…"),
// so both wait until the current response is done.
function sentInstructions() { G.sentRules = rulesKey(); G.sentCtx = ctxNow(); return grokInstructions(); }
function flushQueued() {
  clearTimeout(G.qTimer); G.qTimer = null;
  if (G.qInstr) { G.qInstr = false;
    if (G.sentRules !== rulesKey()) send({ type: "session.update", session: { instructions: sentInstructions() } }); // the rules changed (hands-free, name)
    else { const c = ctxNow(); if (c !== G.sentCtx) { G.sentCtx = c; vlog("context update");
      send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: "(App notice, not spoken by the officer) Right now update, no reply needed:\n" + c }] } }); } } }
  if (G.qCreate) { G.qCreate = false; askReply(); }
}
// Now and then Grok takes a tool answer or notice and never speaks (no response, or an empty or failed one),
// which left the officer in silence until the 12-second hang-up. The app asks once more, then logs it.
const MAX_ASKS = 1, TICK_MS = 4000, ASK_AGAIN_MS = 10000; // Grok sometimes takes 6 to 10 s: a soft tick first, then ask again
function askReply() {
  send({ type: "response.create" }); G.asked = true; G.askedAt = Date.now();
  clearTimeout(G.askWatch); clearTimeout(G.tickWatch);
  G.askWatch = setTimeout(() => { G.askWatch = null; if (!G.live || !G.asked) return; G.asked = false; replyCheck({ status: "never started" }); }, ASK_AGAIN_MS);
}
function replyCheck(r) {
  if (!G.live || G.idleEnding) return;
  const asked = r.status === "never started" || G.respAsked; G.respAsked = false;
  const empty = !G.bot && !G.respTool && !G.audioSamples, failed = r.status === "failed" || r.status === "never started";
  if (!asked || r.status === "cancelled" || (!empty && !failed)) { G.retried = 0; if (!empty && G.drops) G.drops = 0; return; }
  const why = r.status === "never started" ? "no reply started" : r.status === "failed" ? "reply failed" + (r.status_details && r.status_details.error ? ": " + (r.status_details.error.message || r.status_details.error.type || "") : "") : "empty reply";
  G.retried = (G.retried || 0) + 1;
  vlog(`Grok gave ${why} (${G.retried} of ${MAX_ASKS})`);
  if (G.retried > MAX_ASKS) { act("step", `Grok gave ${why} after asking again`); G.retried = 0; reconnect("the voice service stopped answering"); return; }
  // asking again on a slow line only piles up late answers (seen Oct 24: six "I'm here"s at once): test the line first, and on a slow one start a fresh line
  const ws = G.ws; busy();
  pingMs(3000).then(ms => { if (!G.live || G.ws !== ws || /^(Connecting|Reconnecting)/.test(G.status)) return;
    const slow = typeof ms !== "number" || ms > 2000;
    if (slow) { act("step", `Grok gave ${why} on a slow line (test request ${typeof ms === "number" ? ms + " ms" : ms}): fresh line`); G.retried = 0; reconnect("the line is too slow"); return; }
    act("step", `Grok gave ${why}, asked again`);
    G.retriedAt = Date.now(); G.heardSinceRetry = false; if (!G.responding) askReply(); });
}
function whenIdle(kind) {
  if (kind === "instr") G.qInstr = true; else G.qCreate = true;
  if (!G.responding) { flushQueued(); return; }
  clearTimeout(G.qTimer); G.qTimer = setTimeout(() => { G.responding = false; flushQueued(); }, 6000); // in case response.done never arrives
}
function toolReply(callId, out, speak = true) {
  send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(out) } });
  if (speak) whenIdle("create");
}
