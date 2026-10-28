"use strict";
// Citizens VCRM demo: the app's lists, settings, example data and saved data. Loaded in order by the page; all files share one scope.
let OFFICER = "Dana Rivera", OFFICER_INITIALS = "DR"; // the demo user's own name replaces Dana's when they give one
function applyName() {
  const n = String((S && S.settings && S.settings.userName) || "").trim().replace(/\s+/g, " ").slice(0, 60);
  OFFICER = n || "Dana Rivera";
  OFFICER_INITIALS = OFFICER.split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "DR";
}
const STAGES = ["Qualification", "Cultivation", "Ask Planning", "Ask Made", "Commitment", "Closed"];
// entities (the guide renamed Fund to Entity) and the state campaign each one can take besides National (Carverhill, Oct 20)
const ENTITY_STATE = { "Citizens Alliance C3": "", "C.A. of America Action C4": "", "C.A. Fed PAC": "", "C.A. Idaho C4": "Idaho", "C.A. Idaho PAC": "Idaho",
  "C.A. North Dakota C4": "North Dakota", "C.A. North Dakota State PAC": "North Dakota", "C.A. North Dakota Fed PAC": "North Dakota", "C.A. New Hampshire C4": "New Hampshire",
  "C.A. Pennsylvania C4": "Pennsylvania", "C.A. Pennsylvania State PAC": "Pennsylvania" };
const FUNDS = Object.keys(ENTITY_STATE);
const CAMPAIGNS = ["National", "Idaho", "North Dakota", "New Hampshire", "Pennsylvania"];
const oppNeedsCampaign = (action, d) => (action === "opportunity" || action === "editOpportunity") && d && d.fund && !d.campaign && campaignsFor(d.fund).length > 1;
const campaignsFor = (f) => ENTITY_STATE[f] === undefined ? CAMPAIGNS : ["National", ...(ENTITY_STATE[f] ? [ENTITY_STATE[f]] : [])];
// a spoken amount -> a number: "one hundred thousand dollars", "250k", "$1.5 million", "a hundred and fifty thousand" (Oct 24: Ara couldn't record "one hundred thousand")
const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
function spokenAmount(raw) {
  const l = String(raw || "").toLowerCase().replace(/[$,]/g, "").replace(/half a million/g, "500 thousand").replace(/-/g, " ").replace(/[^a-z0-9. ]/g, " ").replace(/\.(?!\d)/g, " ");
  const m = l.match(/(\d+(?:\.\d+)?)\s*(k|thousand|m|million)?\b/);
  if (m) return Math.round(Number(m[1]) * (/^(k|thousand)$/.test(m[2] || "") ? 1000 : /^(m|million)$/.test(m[2] || "") ? 1e6 : 1));
  let total = 0, cur = 0, any = false;
  for (const w of l.split(/\s+/)) {
    if (NUM_WORDS[w] !== undefined) { cur += NUM_WORDS[w]; any = true; }
    else if (w === "hundred") { cur = (cur || 1) * 100; any = true; }
    else if (w === "thousand" || w === "k") { total += (cur || 1) * 1000; cur = 0; any = true; }
    else if (w === "million") { total += (cur || 1) * 1e6; cur = 0; any = true; }
  }
  const n = total + cur; return any && n > 1 ? n : null;
}
// a spoken entity -> one entity, or the few it could be: "the C-3", "Citizens Alliance C 3", "North Dakota Fed PAC" (Oct 24: "C-3" wasn't understood)
const entityWords = (t) => String(t || "").toLowerCase().replace(/c\.a\.|\bca\b/g, "citizens alliance").replace(/\bc\s*-?\s*([34])\b/g, "c$1").replace(/[^a-z0-9 ]/g, " ")
  .split(/\s+/).filter(w => w && !/^[a-z]$/.test(w) && !["the", "a", "an", "is", "it", "its", "it's", "one", "that", "this", "to", "for", "of", "let's", "lets", "go", "with", "please", "entity", "entities", "ones", "i", "think", "say", "make", "yes", "yeah"].includes(w));
function matchEntity(t) {
  const ws = entityWords(t); if (!ws.length) return { hits: [] };
  const hits = FUNDS.filter(f => { const fw = entityWords(f); return ws.every(w => fw.includes(w)); });
  const exact = hits.filter(f => entityWords(f).length === ws.length); // "C.A. Fed PAC" is that one, not also the North Dakota Fed PAC
  return { hits: exact.length === 1 ? exact : hits };
}
const ENTITY_RULE = FUNDS.map(f => `${f}: ${campaignsFor(f).join(" or ")}`).join("; ");
// by state, so Ara never invents one (seen Oct 24: "C.A. Pennsylvania Fed PAC", which doesn't exist)
// "Oct 25 (today)": the model misread a same-day due date as tomorrow (Oct 25 call), so dates are handed back with their day word
const dayWord = (iso) => { const t = typeof todayISO === "function" ? todayISO() : ""; if (!iso || !t) return ""; const d = Math.round((new Date(iso) - new Date(t)) / 86400000); return d === 0 ? "today" : d === 1 ? "tomorrow" : d === -1 ? "yesterday" : ""; };
const dateSaid = (iso) => { const w = dayWord(iso); return fmtDate(iso) + (w ? ` (${w})` : ""); };
const ENTITIES_BY_STATE = () => { const by = {}; FUNDS.forEach(f => { const st = ENTITY_STATE[f] || "National"; (by[st] = by[st] || []).push(f); }); return Object.entries(by).map(([st, fs]) => `${st}: ${fs.join(", ")}`).join("; "); };
const CAPACITY = { A: "$250k and up", B: "$100k to $250k", C: "$25k to $100k", D: "$5k to $25k", E: "Under $5k" };
const CAPACITY_LIST = Object.entries(CAPACITY).map(([k, v]) => k + " = " + v).join(", "); // "A = $250k and up, B = ..." for Ara
const OUTCOMES = ["Interested, continue cultivation", "Ask made", "Ask accepted", "Not now, revisit", "Not interested", "Referred elsewhere"];
const NO_NEXT_STEP = ["Not interested", "Referred elsewhere"];
const RESPONSES = ["Awaiting", "Accepted", "Countered", "Declined"];
const PAY_METHODS = ["Check", "Credit card", "Bank transfer", "Wire", "Stock", "Other"];
const PLEDGE_FOLLOWUP_DAYS = 10; // demo default; the guide's pledge reminder interval is still open with the customer
const ASK_CHECK_DAYS = 14; // a setting: an ask still waiting for its answer gets a task to check on it within this many days (Carverhill, Oct 28: 30, then 14 the same day)
const ASK_CHECK_RE = /^Check on the answer to the /; // the text of that task; a recorded response, pledge or gift marks it done
const askCheckTask = (t) => !!t && !t.done && ASK_CHECK_RE.test(t.text || "") && !!t.oppId;
const MEET_TYPES = ["In person", "Phone call", "Video call", "Event", "Email"];
const MIC = '<svg width="SZ" height="SZ" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
const mic = (s) => MIC.replace(/SZ/g, s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => n == null || n === "" || isNaN(n) ? "$0" : "$" + Math.round(Number(n)).toLocaleString("en-US");
const toNum = (v) => { if (v == null || v === "") return null; const n = Number(String(v).replace(/[^0-9.]/g, "")); return isNaN(n) ? null : n; };
// a field counts as blank when empty, or when a money field is $0 or less (Oct 25: Grok sent amount 0 on a planned ask, it read back "Amount: $0" and saved)
const fieldBlank = (f, v) => v === null || v === undefined || String(v).trim() === "" || (f && f.type === "money" && !(toNum(v) > 0));
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fmtDate = (s) => { if (!s) return ""; const d = new Date(s + "T12:00:00"); return isNaN(d) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined }); };
const longToday = () => new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
const uid = () => Math.random().toString(36).slice(2, 9);
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const YEAR = new Date().getFullYear();

/* ---------- actions: what the officer can do by voice, in any order ---------- */
const DURATIONS = ["30 minutes", "45 minutes", "1 hour", "90 minutes", "2 hours"];
// fields that several forms share, defined once
const F_WHEN = () => [{ k: "date", label: "Date", type: "date", req: true }, { k: "meetingType", label: "Type", type: "select", opts: ["", ...MEET_TYPES], req: true }];
const F_NEXT = () => [{ k: "nextStep", label: "Next step (creates one Task)" }, { k: "nextDue", label: "Next step due", type: "date" }];
const F_RECEIVED = () => [{ k: "date", label: "Received on", type: "date", req: true }, { k: "method", label: "Payment method", type: "select", opts: PAY_METHODS, req: true }];
const HELP_X = '<button type="button" class="hm-x" data-helpx="1" aria-label="Close">×</button>'; // the close button on help popups
const ACTIONS = {
  contact: { title: "New contact", saved: "Contact saved", saveLabel: "Save contact",
    fields: [
      { k: "first", label: "First name", req: true }, { k: "last", label: "Last name", req: true },
      { k: "email", label: "Email", check: "Spoken addresses are easy to mishear. Check the spelling before you save." },
      { k: "mobile", label: "Mobile" },
      { k: "permEmail", label: "Email permitted", type: "bool" }, { k: "permCalls", label: "Calls permitted", type: "bool" }, { k: "permText", label: "Texting permitted", type: "bool" },
      { k: "ally", label: "Ally - Do Not Solicit", type: "bool", oppOff: true }, { k: "dnc", label: "Do Not Contact", type: "bool", oppOff: true },
      { k: "permSource", label: "Texting permission source", when: "permText" }, { k: "howMet", label: "How we met", type: "area" },
      { k: "capacity", label: "Capacity rating", type: "select", opts: ["", ...Object.keys(CAPACITY)], fmt: (v) => v ? `${v} · ${CAPACITY[v]}` : "No rating set", opp: true } ],
    pairs: [["first", "last"]],
    left: "A contact needs an email or a mobile number (at least one). A capacity rating is needed before you can create an opportunity. Voice ticks Ally - Do Not Solicit or Do Not Contact only when you say so." },
  interaction: { title: "Interaction report", saved: "Interaction report saved", saveLabel: "Save",
    fields: [
      { k: "forName", label: "Contact", fixed: true },
      ...F_WHEN(),
      { k: "summary", label: "Summary", type: "area", req: true }, { k: "substantive", label: "Substantive interaction", type: "bool" },
      { k: "outcome", label: "Outcome", type: "select", opts: ["", ...OUTCOMES] },
      { k: "capacity", label: "Capacity rating", type: "select", opts: ["", ...Object.keys(CAPACITY)], fmt: (v) => v ? `${v} · ${CAPACITY[v]}` : "Not rated" },
      ...F_NEXT() ],
    pairs: [["date", "meetingType"]],
    left: "A substantive interaction needs a next step and its due date, unless the outcome is Not interested or Referred elsewhere." },
  meeting: { title: "Schedule a meeting", saved: "Meeting added. Finish in Google Calendar", saveLabel: "Add to Google Calendar",
    fields: [
      { k: "forName", label: "Contact", fixed: true },
      { k: "title", label: "Title", req: true },
      { k: "date", label: "Date", type: "date", req: true }, { k: "time", label: "Start time", type: "time", req: true },
      { k: "duration", label: "Length", type: "select", opts: DURATIONS }, { k: "meetingType", label: "Type", type: "select", opts: ["In person", "Phone call", "Video call"] },
      { k: "location", label: "Where" }, { k: "notes", label: "Notes", type: "area" } ],
    left: "Opens Google Calendar with this meeting filled in. Tap Save there, then come back." },
  task: { title: "New task", saved: "Task added", saveLabel: "Save task",
    fields: [
      { k: "forName", label: "Contact", fixed: true },
      { k: "text", label: "Task", req: true }, { k: "due", label: "Due date", type: "date", req: true },
      { k: "onOpp", label: "Add to the opportunity", type: "bool" } ],
    left: "Every task belongs to the contact. Tick Add to the opportunity to file it on their open opportunity too." },
  opportunity: { title: "New opportunity", saved: "Opportunity created", saveLabel: "Save",
    fields: [
      { k: "name", label: "Opportunity name", req: true, fixed: true }, { k: "officer", label: "Gift officer", fixed: true },
      { k: "fund", label: "Entity of interest", type: "select", opts: ["", ...FUNDS] }, { k: "campaign", label: "Campaign of interest", type: "select", opts: (d) => ["", ...campaignsFor(d.fund)] }, { k: "potential", label: "Potential amount", type: "money" },
      { k: "notes", label: "Notes", type: "area" } ] }, // moving to Cultivation is always its own step (Move to Cultivation?, or defer with a reason)
  plan: { title: "Add planned ask", saved: "Planned ask saved", saveLabel: "Save planned ask",
    fields: [
      { k: "forName", label: "Opportunity", fixed: true },
      { k: "fund", label: "Entity", type: "select", opts: ["", ...FUNDS], req: true }, { k: "campaign", label: "Campaign", type: "select", opts: (d) => { const c = campaignsFor(d.fund); return c.length > 1 ? ["", ...c] : c; }, req: true },
      { k: "plannedDate", label: "Planned ask date", type: "date", req: true }, { k: "amount", label: "Amount", type: "money", req: true },
      { k: "askType", label: "Ask type", type: "select", opts: ["Outright", "Pledge", "Planned gift"] },
      { k: "officer", label: "Gift officer", fixed: true }, { k: "participants", label: "Participants in the ask" } ],
    pairs: [["plannedDate", "amount"]] },
  ask: { title: "Interaction report · the ask", saved: "Ask recorded", saveLabel: "Save",
    fields: [
      { k: "forName", label: "Opportunity", fixed: true },
      ...F_WHEN(),
      { k: "amount", label: "Amount asked", type: "money", req: true }, { k: "fund", label: "Entity", type: "select", opts: ["", ...FUNDS], req: true },
      { k: "response", label: "Response", type: "select", opts: ["", ...RESPONSES], req: true },
      { k: "agreedAmount", label: "Agreed or counter amount (verbal)", type: "money" }, { k: "lostReason", label: "Reason (if declined)" }, { k: "summary", label: "Summary", type: "area", req: true },
      ...F_NEXT() ],
    pairs: [["date", "meetingType"], ["amount", "fund"]],
    left: "An ask meeting is substantive, so it needs a next step and its due date unless the investor declined. A declined ask closes the opportunity as Closed Lost and needs a reason. A yes to an outright ask moves it to Commitment, waiting for the gift; a pledge ask waits in Ask Made until Record pledge adds the schedule." },
  // the investor's answer to an ask that is out, when it comes in later by email, phone or in person (Carverhill, Oct 28)
  response: { title: "Record the response", saved: "Response recorded", saveLabel: "Save response",
    fields: [
      { k: "forName", label: "Opportunity", fixed: true },
      { k: "response", label: "Response", type: "select", opts: ["", "Accepted", "Countered", "Declined"], req: true },
      { k: "agreedAmount", label: "Agreed or counter amount (verbal)", type: "money" }, { k: "lostReason", label: "Reason (if declined)" },
      { k: "date", label: "Date heard", type: "date", req: true },
      ...F_NEXT() ],
    left: "The investor's answer to the ask that is out. A yes to an outright ask moves the opportunity to Commitment, waiting for the gift; a yes to a pledge ask waits for Record pledge; a counter creates the follow-on ask; a decline closes it as Closed Lost, with a reason. Saving marks the Check on the answer task done." },
  pledge: { title: "Record pledge", saved: "Pledge recorded", saveLabel: "Record pledge",
    fields: [
      { k: "forName", label: "Opportunity", fixed: true },
      { k: "amount", label: "Pledge amount", type: "money", req: true }, { k: "fund", label: "Entity", type: "select", opts: ["", ...FUNDS], req: true },
      { k: "confirmedBy", label: "Confirmed by", type: "select", opts: ["Email", "Phone", "In person"], req: true }, { k: "confirmedDate", label: "Confirmed on", type: "date", req: true },
      { k: "installments", label: "Payments", type: "money", num: true }, { k: "frequency", label: "Frequency", type: "select", opts: ["Annual", "Quarterly", "Monthly", "One payment"] },
      { k: "firstAmount", label: "First payment", type: "money" }, { k: "firstDue", label: "First payment due", type: "date", req: true } ],
    pairs: [["confirmedBy", "confirmedDate"], ["installments", "frequency"], ["firstAmount", "firstDue"]],
    left: "No pledge card is needed. The pledge is confirmed by email, phone or in person." },
  cultivate: { title: "Move to Cultivation?", saved: "Decision recorded", saveLabel: "Confirm",
    fields: [
      { k: "forName", label: "Opportunity", fixed: true },
      { k: "decision", label: "Decision", type: "select", opts: ["Move to Cultivation", "Defer"], req: true },
      { k: "reason", label: "Reason (needed to defer)", type: "area" }, { k: "reconsiderOn", label: "Reconsider on", type: "date" } ],
    left: "All three criteria are met: accepted, rated and talked to. Defer keeps it in Qualification; the prompt comes back on the Reconsider on date or after the next substantive interaction." },
  gift: { title: "Record gift", saved: "Gift recorded", saveLabel: "Record gift",
    fields: [
      { k: "forName", label: "Opportunity", fixed: true },
      { k: "amount", label: "Gift amount", type: "money", req: true }, { k: "fund", label: "Entity", type: "select", opts: ["", ...FUNDS], req: true },
      ...F_RECEIVED() ],
    pairs: [["amount", "fund"], ["date", "method"]],
    left: "A gift that arrives while the ask is open is an implied commitment: the opportunity passes through Commitment and closes as Closed Won." },
  // Record gift on an opportunity in Commitment: the gift is applied to the pledge (one button for money in, whatever the stage)
  payment: { title: "Record gift", saved: "Gift recorded", saveLabel: "Record gift",
    fields: [
      { k: "forName", label: "Opportunity", fixed: true },
      { k: "amount", label: "Gift amount", type: "money", req: true },
      ...F_RECEIVED() ],
    pairs: [["date", "method"]],
    left: "This gift is applied to the commitment: the outright gift agreed at the ask, or the pledge. The first gift closes the opportunity as Closed Won; later installments are tracked on the pledge." }
};

/* ---------- giving history (example gifts already received) ---------- */
const g = (date, amount, fund, method) => ({ date, amount, fund, method });
const SEED_GIFTS = {
  "Ruth Abernathy": [g("2026-03-15", 15000, "Citizens Alliance C3", "Check"), g("2025-11-20", 50000, "Citizens Alliance C3", "Stock"), g("2024-12-10", 40000, "Citizens Alliance C3", "Check"), g("2023-12-05", 30000, "C.A. of America Action C4", "Check"), g("2022-11-30", 25000, "Citizens Alliance C3", "Check")],
  "Ken Ito": [g("2025-10-02", 12000, "C.A. of America Action C4", "Bank transfer"), g("2024-09-18", 10000, "C.A. of America Action C4", "Bank transfer")],
  "Elena Vasquez": [g("2026-02-10", 2500, "C.A. Fed PAC", "Credit card"), g("2025-06-04", 8000, "Citizens Alliance C3", "Check"), g("2023-05-22", 5000, "Citizens Alliance C3", "Check")]
};
function givingOf(c) {
  const gs = (c.gifts || []).slice().sort((a, b) => b.date.localeCompare(a.date)), yr = todayISO().slice(0, 4);
  const sum = (l) => l.reduce((n, x) => n + (x.amount || 0), 0);
  const o = S.opps.find(x => x.contactId === c.id && x.pledge && x.pledge.status !== "Paid in full" && x.pledge.status !== "Written off");
  const pledgeLeft = o ? Math.max(0, o.pledge.amount - sum(o.pledge.payments || [])) : 0;
  return { lifetime: sum(gs), ytd: sum(gs.filter(x => x.date.startsWith(yr))), last: gs[0] || null, count: gs.length, pledgeLeft };
}

/* ---------- state ---------- */
const KEY = "veleer-voice-demo-v1";
const SEED_EMAILS = { "Ruth Abernathy": "ruth.abernathy@example.org", "Ken Ito": "ken.ito@example.org", "James Okafor": "james.okafor@example.org", "Priya Sandaruwan": "priya.s@example.org", "Elena Vasquez": "elena.vasquez@example.org" };
// past interactions, open tasks and booked meetings for the example contacts, so every panel has something in it
function seedActivity(st) {
  const T = todayISO(), by = (n) => st.contacts.find(c => c.example && c.first + " " + c.last === n), opp = (c) => c && st.opps.find(o => o.contactId === c.id && o.stage !== "Closed");
  const ru = by("Ruth Abernathy"), ke = by("Ken Ito"), ja = by("James Okafor"), pr = by("Priya Sandaruwan"), el = by("Elena Vasquez");
  const I = (c, daysAgo, type, summary, substantive, kind) => c && st.interactions.push({ id: uid(), contactId: c.id, oppId: opp(c) ? opp(c).id : null, date: addDays(T, -daysAgo), type, summary, substantive, outcome: "", kind: kind || "meeting", example: true });
  I(ru, 36, "In person", "Lunch at the club. Keen on the national program; wants an update on Pennsylvania before the year-end ask.", true);
  I(ke, 18, "In person", "Asked for a $30,000 pledge to C4, Pennsylvania campaign. Ken will talk it over with his wife.", true, "ask");
  I(ja, 16, "Phone call", "Intro call after the alumni luncheon. Strong interest in the PAC program; open to a meeting.", true);
  I(pr, 23, "Video call", "Talked through the Pennsylvania field plan. Asked for the budget summary.", true);
  I(el, 59, "In person", "First meeting after Luis Ortega's handover. Toured the New Hampshire office.", true);
  const K = (c, text, due, onOpp, example) => c && st.tasks.push({ id: uid(), contactId: c.id, oppId: onOpp && opp(c) ? opp(c).id : null, text, due, done: false, example: true });
  K(ke, "Check on the answer to the $30,000 ask", addDays(T, -4), true); // the task every awaiting ask gets (Oct 28); Ken's is overdue in the example data
  K(el, "Ask reminder: Vasquez, Elena - 2026", addDays(T, 11), true);
  K(ru, "Send Ruth the Pennsylvania update", addDays(T, 6), false);
  st.meetings = st.meetings || [];
  if (ru) st.meetings.push({ id: uid(), contactId: ru.id, title: "Coffee with Ruth Abernathy", date: addDays(T, 5), time: "10:00", duration: "1 hour", type: "In person", location: "Blue Door Cafe", notes: "", example: true });
  if (pr) st.meetings.push({ id: uid(), contactId: pr.id, title: "Budget walk-through with Priya Sandaruwan", date: addDays(T, 10), time: "15:00", duration: "45 minutes", type: "Video call", location: "", notes: "", example: true });
}
const SEED_MOBILES = { "Ruth Abernathy": "(555) 010-0141", "Ken Ito": "(555) 010-0142", "James Okafor": "(555) 010-0143", "Priya Sandaruwan": "(555) 010-0144", "Elena Vasquez": "(555) 010-0145" };
function seed() {
  const c = (first, last, status, capacity, howMet) => ({ id: uid(), first, last, status, capacity, howMet, permEmail: true, permCalls: true, permText: false, added: "2025-03-14", example: true });
  const contacts = [c("Ruth", "Abernathy", "Investor", "A", "Long-time supporter of the national program."), c("Ken", "Ito", "Investor", "B", "Board member's referral."),
    c("James", "Okafor", "Prospect", "C", "Met at the alumni luncheon."), c("Priya", "Sandaruwan", "Prospect", "B", "Met at the Pennsylvania campaign kickoff."), c("Elena", "Vasquez", "Investor", "B", "Assigned by Luis Ortega.")];
  const [ab, it, ok, sa, va] = contacts;
  contacts.forEach(ct => { ct.mobile = SEED_MOBILES[ct.first + " " + ct.last] || ""; ct.email = SEED_EMAILS[ct.first + " " + ct.last] || ""; });
  contacts.forEach(ct => { ct.gifts = (SEED_GIFTS[ct.first + " " + ct.last] || []).map(g => Object.assign({}, g)); });
  const o = (ct, stage, fund, potential, ask) => ({ id: uid(), contactId: ct.id, name: `${ct.last}, ${ct.first} - ${YEAR}`, stage, fund, potential, asks: ask ? [ask] : [], pledge: null, created: "2026-02-01", example: true });
  const opps = [o(ab, "Cultivation", "Citizens Alliance C3", 75000), o(it, "Ask Made", "C.A. Pennsylvania C4", 30000, { fund: "C.A. Pennsylvania C4", campaign: "Pennsylvania", amount: 30000, askType: "Pledge", status: "Made", askedOn: "2026-09-30", plannedDate: "2026-09-30" }),
    o(ok, "Qualification", "C.A. Fed PAC", 20000), o(sa, "Cultivation", "Citizens Alliance C3", 25000),
    o(va, "Ask Planning", "C.A. New Hampshire C4", 40000, { fund: "C.A. New Hampshire C4", campaign: "New Hampshire", amount: 40000, askType: "Outright", status: "Planned", plannedDate: addDays(todayISO(), 18) })];
  return { contacts, opps };
}
const fresh = () => Object.assign({ v: 2, screen: "home", sel: { contact: null, opp: null }, interactions: [], tasks: [], history: [], seenWelcome: false,
  settings: { xaiTokenUrl: "", demoCode: "", voice: "ara", voicePicked: false } }, seed());
let S = fresh(); seedActivity(S); S.seed2 = true;
try {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const old = JSON.parse(raw);
    if (old.v === 2) { S = Object.assign(fresh(), old); S.settings = Object.assign(fresh().settings, old.settings); }
    else { // carry over the single contact and opportunity from the earlier one-journey demo
      S.settings = Object.assign(S.settings, old.settings || {}); S.seenWelcome = !!old.seenWelcome;
      if (old.contact) {
        const ct = Object.assign({ id: uid() }, old.contact); S.contacts.push(ct);
        (old.interactions || []).forEach(i => S.interactions.push(Object.assign({ id: uid(), contactId: ct.id }, i)));
        (old.tasks || []).forEach(t => S.tasks.push(Object.assign({ id: uid(), contactId: ct.id }, t)));
        if (old.opp) { const op = Object.assign({ id: uid(), contactId: ct.id, asks: [] }, old.opp); delete op.ask; if (old.opp.ask && !op.asks.length) op.asks = [old.opp.ask]; S.opps.push(op); }
      }
    }
  }
} catch (e) {}
(() => { const h = location.hash || ""; const c = /[#&]code=([^&]+)/.exec(h);
  delete S.settings.xaiKey; // the key lives only in Cloudflare; forget any key an older version saved on this phone
  try { if (c) S.settings.demoCode = decodeURIComponent(c[1]).trim(); } catch (e) {} })();
// Data on each phone carries a version number. Each step below upgrades saved data by one version, in order;
// on load only the steps above the phone's version run. Add new steps at the end, never change old ones.
const MIGRATIONS = [
  // 1: contacts added by voice before the permission defaults were fixed came out with email and calls off; the guide has them on
  (S) => { if (!S.permFix1) { S.contacts.forEach(ct => { if (!ct.example && !ct.permEmail && !ct.permCalls) { ct.permEmail = true; ct.permCalls = true; } }); S.permFix1 = true; } },
  // 2: phones that started before the example activity existed get it once
  (S) => { if (!S.seed2) { S.contacts.forEach(ct => { if (ct.example && !ct.email) ct.email = SEED_EMAILS[ct.first + " " + ct.last] || ""; }); seedActivity(S); S.seed2 = true; } },
  // 3: example contacts saved before they had mobile numbers get them now
  (S) => { S.contacts.forEach(ct => { if (ct.example && !ct.mobile) ct.mobile = SEED_MOBILES[ct.first + " " + ct.last] || ""; }); },
  // 4: earlier versions used funds and campaigns that the guide has since replaced
  (S) => { const FIXC = { "Building campaign 2027": "Pennsylvania", "Scholars campaign 2026": "National" };
    const OLDF = { "C3 - Citizens Alliance": "Citizens Alliance C3", "C4 - Citizens Alliance": "C.A. of America Action C4", "PAC - Citizens Alliance": "C.A. Fed PAC" };
    const STATE_C4 = { Idaho: "C.A. Idaho C4", "North Dakota": "C.A. North Dakota C4", "New Hampshire": "C.A. New Hampshire C4", Pennsylvania: "C.A. Pennsylvania C4" };
    const fx = (x) => { if (!x) return; if (x.fund && !FUNDS.includes(x.fund)) x.fund = OLDF[x.fund] || "Citizens Alliance C3";
      if (x.campaign && !CAMPAIGNS.includes(x.campaign)) x.campaign = FIXC[x.campaign] || "National";
      if (x.fund && x.campaign && !campaignsFor(x.fund).includes(x.campaign)) x.fund = STATE_C4[x.campaign] || x.fund; }; // Oct 20 entity list: a state campaign goes with that state's entity
    S.opps.forEach(o => { (o.asks || []).forEach(fx); const a = (o.asks || [])[0]; fx(o); if (a && a.fund) o.fund = a.fund; fx(o.pledge); if (o.pledge && a && a.fund) o.pledge.fund = a.fund; fx(o.gift); });
    S.contacts.forEach(c => (c.gifts || []).forEach(fx)); },
  // 5: earlier versions had no giving history
  (S) => { S.contacts.forEach(c => { if (!c.gifts) c.gifts = c.example ? (SEED_GIFTS[c.first + " " + c.last] || []).map(x => Object.assign({}, x)) : []; }); },
  // 6: earlier versions used the responses Yes / Counter-offer / Considering / No
  (S) => { const ST = { Asked: "Made", Pledged: "Accepted" }, RS = { Yes: "Accepted", "Counter-offer": "Countered", Considering: "Awaiting", No: "Declined" };
    S.opps.forEach(o => (o.asks || []).forEach(a => { if (ST[a.status]) a.status = ST[a.status]; if (RS[a.response]) a.response = RS[a.response]; })); },
  // 7: every ask still awaiting its answer gets the Check on the answer task (Oct 28); the example task for Ken's ask takes the standard wording
  (S) => { S.opps.filter(o => o.stage === "Ask Made").forEach(o => { const a = (o.asks || [])[0]; if (!a || a.status !== "Made") return;
    const old = S.tasks.find(t => t.oppId === o.id && !t.done && /pledge decision/.test(t.text || ""));
    if (old) old.text = `Check on the answer to the ${money(a.amount)} ask`;
    else if (!S.tasks.some(t => t.oppId === o.id && askCheckTask(t))) S.tasks.unshift({ id: uid(), contactId: o.contactId, oppId: o.id, text: `Check on the answer to the ${money(a.amount)} ask`, due: addDays(a.askedOn || todayISO(), ASK_CHECK_DAYS), done: false, auto: true }); }); },
  // 8 (Oct 28): check-on-the-answer tasks made under the 30-day rule move to 14 days after the ask
  (S) => { (S.tasks || []).forEach(t => { if (!askCheckTask(t) || t.done) return; const o = (S.opps || []).find(x => x.id === t.oppId), a = o && latestAsk(o); if (!a || !a.askedOn) return; const due = addDays(a.askedOn, ASK_CHECK_DAYS); if (t.due > due) t.due = due; }); },
];
const DATA_VERSION = MIGRATIONS.length;
// phones saved before versioning have no number and run every step once (each step is safe to repeat)
(() => { const from = Number.isInteger(S.dataVersion) ? S.dataVersion : 0;
  for (let i = from; i < DATA_VERSION; i++) { try { MIGRATIONS[i](S); } catch (e) { console.warn("Data upgrade " + (i + 1) + " failed", e); } }
  S.dataVersion = DATA_VERSION; })();
if (!S.settings.voicePicked) S.settings.voice = "ara"; // Ara is the default until someone picks a voice in Settings
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

const contactById = (id) => S.contacts.find(c => c.id === id);
const oppById = (id) => S.opps.find(o => o.id === id);
const nameOf = (c) => c ? `${c.first} ${c.last}` : "";
const openOpp = (cid) => S.opps.find(o => o.contactId === cid && o.stage !== "Closed");
const latestAsk = (o) => o && o.asks.length ? o.asks[0] : null;
const askedOf = (o) => { const a = latestAsk(o); return a && a.status !== "Planned" ? a.amount : 0; };
const agreed = (a) => !!a && (a.status === "Accepted" || /Agreed/.test(a.status));
const subCount = (c) => S.interactions.filter(i => i.contactId === c.id && i.substantive).length;
// one alert on a contact with no open opportunity: ready, the step that's missing, or the flag that stops it
const oppReady = (c) => !openOpp(c.id) && oppChecks(c).every(x => x.ok);
const needsRating = (c) => !openOpp(c.id) && !c.dnc && !c.ally && !c.capacity;
function oppPill(c) {
  if (openOpp(c.id)) return "";
  if (c.dnc) return ' <span class="alert mute">Do Not Contact</span>';
  if (c.ally) return ' <span class="alert mute">Ally</span>';
  const miss = oppChecks(c).filter(x => !x.ok);
  return miss.length ? ` <span class="alert warn">${miss.length === 1 && !c.capacity ? "Needs rating" : miss.length + " steps to opportunity"}</span>` : ' <span class="alert ok">Ready for opportunity</span>';
}
// what must be true before a contact can have an opportunity: shown as a checklist on screen, read out by the assistant
const oppChecks = (c) => { const o = openOpp(c.id); return [
  { ok: !!c.capacity, need: "They have a capacity rating", now: c.capacity ? `Rated ${c.capacity} · ${CAPACITY[c.capacity]}` : "Not rated yet", todo: "Set a capacity rating, or pick one when you log a meeting." },
  { ok: !c.dnc, need: "They aren't marked Do Not Contact", now: c.dnc ? "Marked Do Not Contact" : "Contact allowed", todo: "Only a Chief Gift Officer can clear Do Not Contact." },
  { ok: !c.ally, need: "They aren't an Ally - Do Not Solicit", now: c.ally ? "Marked Ally - Do Not Solicit" : "Can be asked for a gift", todo: "The officer who set Ally - Do Not Solicit, or the Chief Gift Officer, can turn it off." },
  { ok: !o, need: "They have no other open opportunity", now: o ? `${o.name} is open (${o.stage})` : "None open", todo: o ? `Work on ${o.name} instead; Veleer keeps one open opportunity per investor.` : "" } ]; };
const cultMissing = (c) => [!c.capacity && "a capacity rating", !subCount(c) && "a substantive interaction"].filter(Boolean);
// Qualification -> Cultivation: criteria met and not deferred (a defer lasts until its Reconsider on date or the next substantive interaction)
const deferActive = (o) => { const f = o.defer, c = contactById(o.contactId); return !!f && (!f.until || f.until > todayISO()) && subCount(c) <= f.subs; };
const readyForCultivation = (o) => { const c = contactById(o.contactId); return o.stage === "Qualification" && !!c && !cultMissing(c).length && !deferActive(o); };
const log = (text, ids, via = true) => { try { act("saved", text); } catch (e) {} return S.history.unshift(Object.assign({ at: new Date().toISOString(), text, via }, ids)); };
