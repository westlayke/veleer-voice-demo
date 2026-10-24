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
    fund: { type: "string", enum: FUNDS, description: "The entity receiving the money" }, potential: { type: "number", description: "Dollars" }, notes: { type: "string" } }) },
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
Call the money's recipient the "entity" (C3, C4 or PAC), never "fund". Say "gift", never "payment". Write spoken email addresses as real addresses. Resolve relative dates against today. When the officer spells something letter by letter, use exactly those letters in the field they mean; "T as in Tom" and words like Tango or Delta stand for their first letter. When they correct how a name is spelled, ask once whether the email address should change to match.
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
Ask responses are Accepted, Countered, Awaiting or Declined. A declined ask closes the opportunity as Closed Lost and needs a reason, so ask why if the officer hasn't said. After Accepted or Countered the app adds a Follow up on agreed pledge task. A yes to an OUTRIGHT ask moves the opportunity straight to Commitment, waiting for the gift; a pledge ask stays in Ask Made until the pledge is recorded with its schedule.
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
  el.innerHTML = `<div class="cb-in"><span class="dot ${G.status === "Connecting…" ? "a" : "g"}"></span><div class="cb-t"><b>${esc(G.status)}</b><div class="cb-cap" id="cbCap" hidden></div>${G.saveCheck ? `<div class="cb-yes">Say “yes” to save</div>` : ""}</div><button class="btn quiet cb-hf${G.hands ? " on" : ""}" data-act3="hands" aria-pressed="${!!G.hands}" title="Hands-free: Ara saves when you say yes">${CAR} ${G.hands ? "Hands-free on" : "Hands-free"}</button><button class="btn quiet cb-end" data-act3="end">End</button></div>`;
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
function act(role, text) {
  if (!text) return; const session = G.session || visitId();
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
  if (G.live || document.visibilityState !== "visible" || (TOK.p && Date.now() - TOK.at < 180000)) return;
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
const IDLE_MS = 12000;
// speaking speed: Grok's audio.output.speed (0.7 to 1.5), set in Settings or by asking the assistant; kept per phone
const SPEEDS = [0.85, 1, 1.15, 1.3], SPEED_NAMES = { 0.85: "Slower", 1: "Normal", 1.15: "A bit faster", 1.3: "Faster" };
const nearSpeed = (v) => SPEEDS.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a, 1);
const talkSpeed = () => nearSpeed(Number(S.settings.speed) || 1);
// the whole session setup; sent again in full when the speed changes mid-call, so nothing else is reset
const sessionCfg = () => ({ voice: S.settings.voice || "ara", instructions: sentInstructions(), turn_detection: { type: "server_vad" }, tools: toolDefs(),
  audio: { input: { format: { type: "audio/pcm", rate: 24000 } }, output: { format: { type: "audio/pcm", rate: 24000 }, speed: talkSpeed() * (spookyMode() ? 0.9 : 1) } } }); // spooky mode: a touch slower, like a haunted-house host
const speedName = (v) => SPEED_NAMES[nearSpeed(v)].toLowerCase();
const busy = () => { G.lastAct = Date.now(); };
function idleCheck() {
  if (!G.live || G.idleEnding || G.status === "Connecting…") return;
  const playing = G.audioOn || G.responding || (G.ctx && G.playHead > G.ctx.currentTime);
  if (playing) { busy(); return; }
  if (Date.now() - (G.lastAct || Date.now()) < IDLE_MS) return;
  G.idleEnding = true; vlog("12 seconds quiet: hanging up");
  notice(`Nobody has spoken or tapped anything for 12 seconds, so the app is hanging up. Say exactly "I'll hang up for now. Tap the mic when you need me." and nothing else.`);
  G.idleTimer = setTimeout(idleHangUp, 12000); // in case Grok doesn't answer
}
function idleHangUp() { clearTimeout(G.idleTimer); if (!G.live) return; endCall(); toast("Hung up after 12 seconds of quiet. Tap the mic when you need me."); }
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
    G.ws = new WebSocket("wss://api.x.ai/v1/realtime?model=grok-voice-latest", ["xai-client-secret." + token]);
    G.ws.onopen = () => {
      send({ type: "session.update", session: sessionCfg() });
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
      notice(S.settings.userName ? (opening || `The officer just opened the conversation.${how} "${boo}Hi ${OFFICER.split(" ")[0]}, I'm ${botName()}, what would you like to do?" and nothing more.`) : (opening ? opening + ` But you don't know their name yet: first${how.replace(" Say", " say").replace(" In", " in")} "${boo}Hi, I'm ${botName()}, what's your first name?", then call set_user_name, then help with that.` : `The officer just opened the conversation and you don't know their name yet.${how} "${boo}Hi, I'm ${botName()}, what's your first name?" and nothing more.`));
      G.status = "Listening"; paintCall(); vlog(`connected in ${Date.now() - G.t0} ms (voice pass ${G.passReady ? "was ready" : "fetched on tap"})`);
    };
    G.ws.onmessage = (m) => { let e; try { e = JSON.parse(m.data); } catch (x) { return; } onEvent(e); };
    G.ws.onclose = (ev) => { vlog("connection closed " + (ev && ev.code)); if (G.live && document.visibilityState === "hidden") { interrupted("connection closed while away"); return; } if (G.live) { const was = G.status; endCall(); if (was === "Connecting…") toast("Couldn't connect to Grok voice. Try again in a moment."); } };
    G.ws.onerror = () => {};
  } catch (e) { endCall(); if (String(e && e.message) === "bad_code") codeModal(opening); else toast(callError(e)); }
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
  endCall(); G.interrupting = false;
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
function endCall() {
  clearInterval(G.idleTick); clearTimeout(G.idleTimer); G.idleEnding = false;
  G.live = false; G.hands = false; G.saveCheck = null; stopPlayback(); letSleep();
  try { G.ws && G.ws.close(); } catch (e) {}
  try { G.stream && G.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
  try { G.ctx && G.ctx.close(); } catch (e) {}
  vlog("=== conversation ended"); if (G.session) { act("end", "Conversation ended"); G.session = null; } G.ws = G.stream = G.ctx = G.node = null; G.buf = []; G.audioOn = false; G.responding = G.qInstr = G.qCreate = false; clearTimeout(G.qTimer);
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
  if (/audio\.delta$/.test(t)) { if (!G.audioOn) { G.audioOn = true; G.audioSamples = 0; vlog("← audio starts"); } G.audioSamples += Math.floor(atob(e.delta || "").length / 2); }
  else if (!/transcript\.delta$|^response\.(content_part|output_item\.added|function_call_arguments\.delta)/.test(t)) {
    if (t === "response.done" && G.idleEnding) { clearTimeout(G.idleTimer); const left = G.ctx ? Math.max(0, G.playHead - G.ctx.currentTime) : 0; G.idleTimer = setTimeout(idleHangUp, left * 1000 + 500); }
    if (t === "response.done") { if (G.tourEnding) { G.tour = false; G.tourEnding = false; } G.audioOn = false; setTimeout(() => { G.audioSamples = 0; }, 0); if (G.echoPeak) vlog(`mic while Grok spoke: peak ${G.echoPeak.toFixed(3)}, ${G.barge || 0} loud frames passed (interrupt level ${BARGE_RMS})`); G.echoPeak = 0; G.barge = 0; }
    vlog("← " + t + (t === "response.done" ? ` ${e.response && e.response.status}${G.audioSamples ? ` (${(G.audioSamples / 24000).toFixed(1)}s of audio)` : ""}${G.bot ? ' "' + G.bot + '"' : ""}` : "") + (/function_call_arguments\.done/.test(t) ? " " + e.name + " " + String(e.arguments || "").slice(0, 80) : "")
      + (t === "error" ? " " + JSON.stringify(e.error || e).slice(0, 200) : "") + (/input_audio_transcription\.completed/.test(t) ? ' "' + (e.transcript || "") + '"' : ""));
  }
  if (/input_audio_transcription\.completed/.test(t) && e.transcript) { G.heardN = (G.heardN || 0) + 1; G.lastHeard = { text: e.transcript, n: G.heardN }; act("user", e.transcript); recent("Officer", e.transcript); voiceCommand(e.transcript); }
  if (t === "response.done" && G.bot) { act("grok", G.bot); recent(botName(), G.bot); }
  if (t === "input_audio_buffer.speech_started") { busy(); if (G.idleEnding) { G.idleEnding = false; clearTimeout(G.idleTimer); } stopPlayback(); G.status = "Listening"; G.bot = ""; G.caps = []; paintCall(); }
  else if (t === "input_audio_buffer.speech_stopped") { G.status = "Thinking…"; paintCall(); }
  else if (t === "response.created") { G.respItems = []; G.bot = ""; G.responding = true; G.caps = (G.caps || []).filter(c => c.t1 && G.ctx && c.t1 > G.ctx.currentTime).concat([{ text: "", t0: null, t1: null }]); }
  else if (/audio\.delta$/.test(t) && e.delta) { playChunk(e.delta); if (G.status !== "Speaking") { G.status = "Speaking"; paintCall(); } }
  else if (/audio_transcript\.delta$/.test(t) && e.delta) { G.bot += e.delta; const c = G.caps && G.caps[G.caps.length - 1]; if (c) c.text += e.delta; capTick(); }
  else if (t === "response.done") { G.responding = false; flushQueued(); setTimeout(() => { if (G.live && !G.sources.length) { G.status = "Listening"; paintCall(); } }, 300); }
  else if (t === "response.function_call_arguments.done") onTool(e.call_id, e.name, e.arguments);
  else if (t === "response.output_item.done" && e.item && e.item.type === "function_call") onTool(e.item.call_id, e.item.name, e.item.arguments);
  else if (t === "error") { console.warn("Grok error", e); if (e.error && e.error.message && !/Item not found/i.test(e.error.message)) toast("Voice: " + e.error.message); }
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
  if (G.qCreate) { G.qCreate = false; send({ type: "response.create" }); }
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
// Ara's lookup and app tools: one function each (the draft tools share draftTool below)
const TOOL_HANDLERS = {
  set_user_name(callId, data, name) {
    const v = String(data.first_name || "").trim().split(/\s+/)[0].replace(/\s+/g, " ").slice(0, 60);
    if (!v) { toolReply(callId, { ok: false, error: "No name given." }); return; }
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
        if (!r) { askRating(callId); return; }
        d.capacity = r; V.data = d; V.fromVoice.add("capacity"); renderOverlay();
        toolReply(callId, { ok: true, on_draft: true, say: `The rating ${r} (${CAPACITY[r]}) is on the New contact form now. It saves with the contact when they tap "${ACTIONS.contact.saveLabel}". Say so briefly, then carry on.` }); return; } }
    // that contact's Edit form is open: the rating goes on the form, otherwise the form keeps showing (and would save back) the old one
    if (V && V.action === "editContact" && V.target.contact) { const ec = V.target.contact, nm = norm(data.contact_name || "");
      if (!nm || nm.includes(norm(ec.first)) || nm.includes(norm(ec.last))) {
        if (!r) { askRating(callId); return; }
        const d = readDraft(); d.capacity = r; V.data = d; V.fromVoice.add("capacity"); renderOverlay();
        toolReply(callId, { ok: true, on_draft: true, saved: false, say: `The rating ${r} (${CAPACITY[r]}) is on ${ec.first}'s Edit contact form now. It is NOT saved yet: ask them to check it and tap "${ACTIONS.editContact.saveLabel}".` }); return; } }
    const t = resolveTarget("interaction", data.contact_name || "");
    if (t.error) { toolReply(callId, { ok: false, error: t.error }); return; }
    if (!r) { askRating(callId); return; }
    const c = t.contact, was = c.capacity;
    S.sel.contact = c.id; if (S.screen !== "contact") go("contact"); else render();
    if (!data.confirmed) { toolReply(callId, { ok: true, contact: nameOf(c), now: was ? `${was} (${CAPACITY[was]})` : "not rated", will_become: `${r} (${CAPACITY[r]})`, say: `Ask in one short sentence: "Rate ${c.first} ${r}, ${CAPACITY[r]}?" Wait for yes before calling again with confirmed true.` }); return; }
    c.capacity = r; log(`Capacity rated ${r} (${CAPACITY[r]})`, { contactId: c.id }); save(); render(); toast(`${nameOf(c)}: capacity ${r} · ${CAPACITY[r]}`);
    const g = resolveTarget("opportunity", nameOf(c));
    toolReply(callId, { ok: true, saved: true, say: `Confirm in one short sentence that it's saved.${!g.error ? " They can now have an opportunity: offer to create one if the officer was trying to." : ""}` }); return;
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
      toolReply(callId, { ok: true, task: t.text, for: taskWhere(t), now: TSTAT[taskStatus(t)], will_become: change, say: `Ask in one short sentence: "Mark '${t.text}' as ${change.toLowerCase()}?"${st === "waiting" && !data.check_back_on ? " Mention the check-back date is a week from today unless they want another day." : ""} Wait for yes before calling again with confirmed true.` }); return; }
    const undo = setTaskStatus(t, st, until); go("tasks"); toast(`${change}: ${t.text}`, undo);
    const meetingish = /follow|call|meet|visit|lunch|coffee|pledge|ask/i.test(t.text);
    toolReply(callId, { ok: true, saved: true, task: t.text, status: change, say: `Confirm in one short sentence that it's saved${st === "done" && meetingish ? ", then ask whether they'd like to log an interaction for it (for example a call or meeting report)" : ""}.` }); return;
  },
  save_form(callId, data, name) {
    hfSave(callId, data); return;
  },
  set_hands_free(callId, data, name) {
    setHandsFree(!!data.on);
    toolReply(callId, { ok: true, hands_free: G.hands, say: G.hands ? `Say only "Hands-free is on. I'll read each form back and save it when you say yes."` : `Say only "Hands-free is off. You'll tap Save yourself again."` }); return;
  },
  optional_fields(callId, data, name) { optStep(callId, data); return; },
  set_spooky_mode(callId, data, name) {
    if (!spookySeason()) { toolReply(callId, { ok: false, error: "Spooky mode is only around in October.", say: "Say in one short sentence that spooky mode is only around in October." }); return; }
    if (!!data.on === spookyMode()) { toolReply(callId, { ok: true, spooky: spookyMode(), already: true, status: `Spooky mode is already ${spookyMode() ? "on" : "off"}. Don't announce it again.` }, false); return; } // e.g. after Carry on: nothing to redo, and no second welcome
    setSpooky(!!data.on); send({ type: "session.update", session: sessionCfg() }); // new rules and a slower voice straight away
    toolReply(callId, { ok: true, spooky: spookyMode(), say: spookyMode() ? `In your haunted-house host voice, say one short welcome, such as "Mwahaha... spooky mode is on. Welcome to the haunted CRM!", then ask what they'd like to do.` : `Say only "Back to normal. The ghosts have gone home."` }); return;
  },
  set_christmas_mode(callId, data) {
    if (!xmasAllowed()) { toolReply(callId, { ok: false, error: "Christmas mode is only around in December.", say: "Say in one short sentence that Christmas mode is only around in December." }); return; }
    if (!!data.on === xmasMode()) { toolReply(callId, { ok: true, christmas: xmasMode(), already: true, status: `Christmas mode is already ${xmasMode() ? "on" : "off"}. Don't announce it again.` }, false); return; } // e.g. after Carry on: no second welcome
    setXmas(!!data.on); send({ type: "session.update", session: sessionCfg() }); // new rules straight away
    toolReply(callId, { ok: true, christmas: xmasMode(), say: xmasMode() ? `In your warm Christmas host voice, say one short welcome, such as "Ho ho ho! Christmas mode is on. Merry Christmas, and welcome to the Christmas CRM!", then ask what they'd like to do.` : `Say only "Back to normal. Merry Christmas!"` }); return;
  },
  set_speaking_speed(callId, data, name) {
    const now = talkSpeed(), next = data.change === "normal" ? 1 : SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(nearSpeed(now)) + (data.change === "faster" ? 1 : -1)))];
    S.settings.speed = next; save(); send({ type: "session.update", session: sessionCfg() });
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
    const tick = () => { if (!G.live) return; const playing = G.ctx && G.playHead > G.ctx.currentTime; if (playing && Date.now() < waitEnd) setTimeout(tick, 300); else { endCall(); toast("Conversation ended. Tap the mic any time to carry on."); } };
    setTimeout(tick, 1200); return;
  },
  call_contact(callId, data, name) {
    const r = resolveTarget("interaction", data.contact_name);
    if (r.error) { toolReply(callId, { ok: false, error: r.error }); return; }
    const c = r.contact; S.sel.contact = c.id; go("contact");
    if (!c.mobile) { toolReply(callId, { ok: false, error: `${nameOf(c)} has no phone number on record.` }); return; }
    if (c.dnc) { toolReply(callId, { ok: false, error: `${nameOf(c)} is marked Do Not Contact.` }); return; }
    if (!c.permCalls) { toolReply(callId, { ok: false, error: `Calls aren't permitted for ${nameOf(c)} (Calls permitted is off on the contact).` }); return; }
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
    const NEXT = { Qualification: "Log interaction, or Move to Cultivation when Ready for Cultivation shows", Cultivation: "Add ask", "Ask Planning": "Record the ask", "Ask Made": "Record pledge or Record gift", Commitment: "Record gift" };
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
      potential: F(money(o.potential), "You (the gift officer)"), entity: F(o.fund, "You (the gift officer)"),
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
    const T = todayISO(), which = data.which || "all";
    const open = S.tasks.filter(t => !t.done).sort((x, y) => (x.due || "9999").localeCompare(y.due || "9999"));
    const pick = open.filter(t => which === "overdue" ? t.due && t.due < T : which === "due_today" ? t.due && t.due <= T : which === "this_week" ? t.due && t.due <= addDays(T, 7) : which === "waiting" ? taskStatus(t) === "waiting" : which === "in_progress" ? taskStatus(t) === "doing" : true);
    S.tFilter = { overdue: "overdue", this_week: "week", due_today: "week", waiting: "waiting" }[which] || "open"; go("tasks"); whenIdle("instr");
    toolReply(callId, { ok: true, open_tasks_total: open.length, overdue_total: open.filter(t => t.due && t.due < T).length, showing: which, count: pick.length,
      tasks: pick.map(t => ({ task: t.text, status: TSTAT[taskStatus(t)], for: taskWhere(t), due: t.due ? fmtDate(t.due) + (t.due.slice(0, 4) !== T.slice(0, 4) ? " " + t.due.slice(0, 4) : "") : "no due date", overdue: !!(t.due && t.due < T), due_today: t.due === T })),
      say: pick.length ? "Say how many there are, overdue ones first, then read each task briefly with who it's for and when it's due (say overdue, today, or the day). If there are more than five, read the first five and ask whether to go on. Then ask if they'd like to act on one, for example log the follow-up." : "Say there are no open tasks of that kind." }); return;
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
    const i = flowIndex(data.stage); if (i < 0) { toolReply(callId, { ok: false, error: "Unknown stage." }); return; }
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
      if (target === "opp" && !r.opp) { toolReply(callId, { ok: false, error: `${nameOf(r.contact)} has no open opportunity.` }); return; }
      if (target === "contact") S.sel.contact = r.contact.id; else S.sel.opp = r.opp.id;
      summary = target === "contact" ? `Showing ${nameOf(r.contact)}.` : `Showing ${r.opp.name}, in ${r.opp.stage}.`;
    } else if (target === "contacts") summary = `Contacts shown: ${S.contacts.map(nameOf).join(", ")}.`;
    else if (target === "board") summary = `Opportunities board shown: ${S.opps.filter(o => o.stage !== "Closed").map(o => o.name + " in " + o.stage).join("; ")}.`;
    if (target === "flow") S.flowBack = "home";
    go(target); G.handled.size && whenIdle("instr");
    toolReply(callId, { ok: true, summary }); return;
  },
};
function onTool(callId, name, args) {
  busy();
  if (!callId || G.handled.has(callId)) return; G.handled.add(callId);
  let data = {}; try { data = typeof args === "string" ? JSON.parse(args || "{}") : (args || {}); } catch (x) {}
  act("step", name + " " + JSON.stringify(data));
  if (G.cmdAt && Date.now() - G.cmdAt < 800) { vlog(`${name}: ignored, the app had just carried out a voice command`); toolReply(callId, { ok: false, error: "Ignored: the app already carried out the officer's command. Follow the app notice." }); return; }
  if (Object.hasOwn(TOOL_HANDLERS, name)) { TOOL_HANDLERS[name](callId, data, name); return; }
  draftTool(callId, name, data);
}
// a draft tool: open or update the form on screen with what Ara heard
function draftTool(callId, name, data) {
  G.tour = false; // the officer moved on to other work; keep it out of the walkthrough that gets dropped
  let tool = TOOLS.find(t => t.name === name && !t.hidden);
  if (!tool) { toolReply(callId, { ok: false, error: "Unknown tool." }); return; }
  const target = resolveTarget(tool.action, data.contact_name, { date: data.which_date ? normDate(data.which_date) : "", which: data.which });
  if (target.error) { toolReply(callId, { ok: false, error: target.error }); return; }
  if (target.route) { tool = TOOLS.find(t => t.action === target.route); delete data.fund; } // Record gift in Commitment: applied to the pledge
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
  // the voice model tends to fill in a rating nobody gave (usually E): keep it only if the officer just talked about one
  if (data.capacity && !(V && V.data && V.data.capacity === data.capacity) && !officerRated()) { vlog(`${name}: dropped capacity "${data.capacity}" (the officer didn't give a rating)`); delete data.capacity; }
  // the voice model doesn't send texting permitted on a new contact (seen Oct 24: eight tries, never sent): take it from the officer's own words
  if ((tool.action === "contact" || tool.action === "editContact") && data.permText === undefined) { const t = officerSaidTexting(); if (t !== null) { data.permText = t; vlog(`${name}: texting ${t ? "permitted" : "not permitted"}, from the officer's words`); } }
  if ((tool.action === "interaction" || tool.action === "ask") && !String(data.summary || "").trim() && !(V && V.action === tool.action && V.data && String(V.data.summary || "").trim())) {
    const t = officerSummary(); if (t) { data.summary = t; vlog(`${name}: summary taken from the officer's words`); } }
  // a next-step due date with no next step, on the meeting's own day or earlier, is the meeting date filed in the wrong place (seen Oct 24)
  if (tool.action === "interaction" && data.nextDue && !String(data.nextStep || "").trim() && !(V && V.data && String(V.data.nextStep || "").trim())) { const nd = normDate(data.nextDue);
    if (nd && (nd <= todayISO() || nd === normDate(data.date || ""))) { vlog(`${name}: dropped next-step due date "${data.nextDue}" (no next step, not in the future)`); delete data.nextDue; } }
  const said = Object.keys(data).filter(k => data[k] !== null && data[k] !== "" && data[k] !== undefined);
  // the officer spelled something out: check it made it into this update (Grok sometimes resends the old fields instead)
  const flat = said.map(k => String(data[k]).toLowerCase().replace(/[^a-z]/g, "")).join(" ");
  const missedSpelling = (tool.action === "contact" || tool.action === "editContact") ? spelledWords().filter(w => !flat.includes(w.toLowerCase())) : [];
  if (missedSpelling.length) vlog(`${name}: spelling not used: ${missedSpelling.join(", ")}`);
  const same = V && V.action === tool.action && (V.target.contact || null) === (target.contact || null) && (V.target.item || null) === (target.item || null);
  if (same) { const cur = readDraft(); (V.history = V.history || []).push(Object.assign({}, cur)); if (V.history.length > 20) V.history.shift(); said.forEach(k => { cur[k] = data[k]; }); said.forEach(k => V.fromVoice.add(k)); V = Object.assign({}, V, { action: tool.action, target, data: prefill(tool.action, cur, target), fromVoice: V.fromVoice }); }
  else V = { action: tool.action, target, data: prefill(tool.action, data, target), fromVoice: new Set(said) };
  renderOverlay();
  const A = ACTIONS[tool.action], d = V.data, empty = (v) => v === null || v === undefined || String(v).trim() === "";
  const missing = A.fields.filter(f => f.req && !f.fixed && empty(d[f.k])).map(f => f.k === "campaign" && d.fund ? `Campaign (${d.badCampaign ? d.badCampaign + " isn't a campaign for " + d.fund + "; " : ""}the entity, ${d.fund}, is already set; its campaign is ${campaignsFor(d.fund).join(" or ")})` : f.label);
  // what is already on the form (filled in by the app from earlier records, or said before), so Ara never asks for it again
  const onForm = A.fields.filter(f => !f.fixed && f.type !== "bool" && !empty(d[f.k])).map(f => `${f.label}: ${f.type === "money" ? money(d[f.k]) : d[f.k]}`);
  delete d.badCampaign;
  if ((tool.action === "contact" || tool.action === "editContact") && empty(d.email) && empty(d.mobile)) missing.push("Email or mobile");
  if (((tool.action === "interaction" && d.substantive && !NO_NEXT_STEP.includes(d.outcome)) || (tool.action === "ask" && d.response && d.response !== "Declined")) && (empty(d.nextStep) || empty(d.nextDue))) missing.push("Next step and its due date");
  // a new contact: ask once for the other of email/mobile, then once about the optional fields (the app drives this so it never gets skipped)
  if (missedSpelling.length) { toolReply(callId, { ok: true, button: A.saveLabel, status: `The officer just spelled out ${missedSpelling.map(w => `"${spellOut(w)}" (${w.charAt(0) + w.slice(1).toLowerCase()})`).join(" and ")}, but this update didn't use it. Call this tool again now with that exact spelling in the field they named (for a name, first or last as they said; for an email, the part before the @). If they changed how a name is spelled and the email uses that name, ask once whether the email should change to match. Don't ask them to repeat it.` }); return; }
  if (tool.action === "contact" && !missing.length) {
    if ((empty(d.email) || empty(d.mobile)) && !V.askedOther) { V.askedOther = true; toolReply(callId, { ok: true, button: A.saveLabel, status: `The draft is open on screen. Now ask in one short question for their ${empty(d.email) ? "email address" : "mobile number"} too (it's fine if they don't have it). After the answer, call this tool again.` }); return; }
    if (!V.askedOptional) { V.askedOptional = true; toolReply(callId, { ok: true, button: A.saveLabel, status: OPT_OFFER }); return; }
  }
  if (tool.action === "opportunity" && !missing.length && !V.askedOptional) { V.askedOptional = true; toolReply(callId, { ok: true, button: A.saveLabel, status: OPT_OFFER }); return; }
  toolReply(callId, missing.length
    ? { ok: true, button: A.saveLabel, still_needed: missing, status: `The draft is open on the officer's screen and fills in as you go. Still needed: ${missing.join(", ")}.${onForm.length ? ` Already on the form, some filled in from earlier steps: ${onForm.join("; ")}. Never ask for these again; if the officer asks, confirm what's there.` : ""}${badDates.length ? ` The app couldn't read ${badDates.join(", ")} as a date: send dates as YYYY-MM-DD (today is ${todayISO()}).` : ""}${missing.includes("Summary") ? " When the officer describes what happened, put it in the summary parameter (1 to 3 sentences, past tense, in their words) and call this tool again with it." : ""} Ask for the first one in one short question; after each answer call this tool again. Don't ask them to tap ${A.saveLabel} yet.` }
    : { ok: true, button: A.saveLabel, status: G.hands && tool.action !== "meeting" ? `The draft is complete but NOT saved. Hands-free mode is on: call save_form with confirmed false now and say the read-back it returns.` : `The draft is on the officer's screen. It is NOT saved. Ask them to check it and tap the "${A.saveLabel}" button (say that exact label).` });
}
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
  if (k === "fund") { const n = l.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); if (!n) return null;
    const hits = FUNDS.filter(f => { const fl = f.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " "); return fl === n || fl.includes(n) || n.includes(fl); });
    return hits.length === 1 ? hits[0] : null; }
  if (k === "potential") { const m = l.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(k|thousand|m|million)?/); if (!m) return null; return Math.round(Number(m[1]) * (/^(k|thousand)$/.test(m[2] || "") ? 1000 : /^(m|million)$/.test(m[2] || "") ? 1e6 : 1)); }
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
    toolReply(callId, { ok: false, field: k, error: `The app couldn't read "${data.value || ""}" as an answer to this question.`, say: k === "fund" ? `Say you didn't catch which entity, and read the choices: ${FUNDS.join(", ")}.` : `Say in a few words that you didn't catch that, then ask again: "${st.q(optWho())}"` }); return; }
  if (k === "flags") { optSet("ally", v.ally); optSet("dnc", v.dnc); } else optSet(k, v);
  V.opt.done.push(k); act("step", "optional field " + k + ": " + JSON.stringify(v));
  const heard = k === "capacity" ? `Rating ${v} is on the form.` : k === "permText" ? (v ? "Texting is now permitted on the form." : "Texting stays off.") : k === "flags" ? (v.ally || v.dnc ? `${[v.ally && "Ally - Do Not Solicit", v.dnc && "Do Not Contact"].filter(Boolean).join(" and ")} is now on the form.` : "Neither flag is set.") : k === "potential" ? `${money(v)} is on the form.` : "That's on the form.";
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
  (G.saves = G.saves || []).push(`${ACTIONS[action].saved}${who ? " for " + who : ""}${closed ? " (Closed " + o.closed + ")" : ""}`);
  const hint = action === "contact" ? `for example log a meeting with ${who} or create an opportunity` : action === "interaction" ? (hasOpp ? (hasOpp.stage === "Qualification" ? "for example move the opportunity to Cultivation if it's ready, or log another meeting" : hasOpp.stage === "Cultivation" ? "for example plan an ask or log another meeting" : "for example add a task or log another meeting") : "for example create an opportunity or log another meeting") : "";
  whenIdle("instr");
  if (G.hfTry) { G.hfTry.say = `Saved: ${ACTIONS[action].saved}${who ? " for " + who : ""}.${closed} ${savedMood(action, d) ? savedMood(action, d) + " Then say" : "Say"} in a few words that it's saved, then say "Say undo if that's wrong." and ask what they'd like to do next, or whether to stop here.`; return; }
  notice(`The officer just tapped ${ACTIONS[action].saveLabel} and the app saved it: ${ACTIONS[action].saved}${who ? " for " + who : ""}.${closed} ${savedMood(action, d) ? savedMood(action, d) + " Then say" : "Start by saying"} out loud that you saw the save, in a few words (for example "I see that's saved: ${ACTIONS[action].saved.toLowerCase()}${who ? " for " + who.split(" ")[0] : ""}."), even if the officer has started talking; then ask what they'd like to do next${hint ? " (" + hint + ")" : ""}, or whether to stop here for today.`);
}
document.addEventListener("click", (e) => { const a = e.target.closest("[data-act3]"); if (!a) return;
  if (a.dataset.act3 === "end") endCall();
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
    let x = f.type === "money" ? money(v) : f.type === "date" ? fmtDate(v) : String(v); const w = x.split(/\s+/); if (w.length > 14) x = w.slice(0, 14).join(" ") + "…";
    return `${f.label}: ${x}`; }).filter(Boolean);
  return `${A.title}${who ? " for " + who : ""}.${parts.length ? " " + parts.join("; ") + "." : ""}`;
}
// the officer's next words after Ara's question (the transcript can land a moment after her tool call)
function hfHeardAfter(n, ms = 2500) { return new Promise(res => { const t0 = Date.now(); (function poll() { if ((G.heardN || 0) > n) return res(G.lastHeard); if (Date.now() - t0 > ms) return res(null); setTimeout(poll, 100); })(); }); }
async function hfSave(callId, data) {
  if (!V) { toolReply(callId, { ok: false, saved: false, error: "No form is open, so there's nothing to save." }); return; }
  const A = ACTIONS[V.action];
  if (!G.hands) { toolReply(callId, { ok: false, saved: false, error: `Hands-free mode is off, so you can't save. Ask the officer to check the draft and tap "${A.saveLabel}". If they're driving, they can say "hands-free mode".` }); return; }
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
  toolReply(callId, { ok: true, saved: true, say: r.say || `Say it's saved, then "Say undo if that's wrong."` });
}
// hands-free saves wait in Needs attention until the officer has looked at them
const hfUnchecked = () => S.history.filter(x => x.hf && !x.hfChecked);
function hfCheckModal() {
  const xs = hfUnchecked(), h = document.getElementById("modal"); if (!xs.length) return;
  h.innerHTML = `<div class="scrim center"><div class="wmodal" role="dialog" aria-modal="true" aria-labelledby="hfTitle">
    <h2 id="hfTitle">Check your hands-free saves</h2>
    <p>${esc(botName())} saved these while you were hands-free. If one is wrong, open the record and use Edit. A gift or pledge is corrected by the Chief Gift Officer.</p>
    <div class="hf-list">${xs.map(x => `<div class="row"><div class="t" style="font-size:14px">${esc(x.text)}<div class="s">${new Date(x.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div></div></div>`).join("")}</div>
    <button class="btn blue" id="hfOk">They're right</button><button class="btn quiet" id="hfX">Not now</button></div></div>`;
  document.getElementById("hfX").onclick = () => { h.innerHTML = ""; };
  document.getElementById("hfOk").onclick = () => { xs.forEach(x => { x.hfChecked = true; }); save(); h.innerHTML = ""; render(); toast("Hands-free saves checked"); };
}
