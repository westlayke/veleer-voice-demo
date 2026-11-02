"use strict";
// THE lists (Oct 31, Carverhill: "fix all the list modules by creating a new single lists module"). Every pick list the app, the forms and Ara
// use is defined here once: its values (what the record keeps and the screens show), how each is said, the words that stand for each, and the
// one matcher (listMatch) and answer-taker (listTake) that every list question goes through, whether Ara's tool call or the app's own question
// carries the answer. To change a list, change it here; tests/checks/14-lists.js checks every list's short forms and that the parts agree.
// Loaded before core.js.

// THE entity list (Oct 31, Carverhill: "only have the list and phrasings in one place"). Each row: the record name (what the record keeps and
// the screens show), the spoken name (what Ara says, Grok sends and the officer answers with) and its state ("" = National). Everything
// else is built from this table: the form pick lists, Grok's allowed values, Ara's list, the app's questions, the read-back, the matcher,
// the evidence guard, the transcription hints, and toSpoken(), which turns any record name into its spoken name on the way to the voice
// service. To change an entity, change this table only; tests/checks/14-lists.js fails when a record name reaches the voice service.
const ENTITIES = [
  ["Citizens Alliance C3", "National C3", ""], ["C.A. of America Action C4", "National C4", ""], ["C.A. Fed PAC", "National Federal PAC", ""],
  ["C.A. Idaho C4", "Idaho C4", "Idaho"], ["C.A. Idaho PAC", "Idaho PAC", "Idaho"],
  ["C.A. North Dakota C4", "North Dakota C4", "North Dakota"], ["C.A. North Dakota State PAC", "North Dakota State PAC", "North Dakota"], ["C.A. North Dakota Fed PAC", "North Dakota Federal PAC", "North Dakota"],
  ["C.A. New Hampshire C4", "New Hampshire C4", "New Hampshire"],
  ["C.A. Pennsylvania C4", "Pennsylvania C4", "Pennsylvania"], ["C.A. Pennsylvania State PAC", "Pennsylvania State PAC", "Pennsylvania"]];
const ENTITY_STATE = Object.fromEntries(ENTITIES.map(e => [e[0], e[2]]));
const FUNDS = ENTITIES.map(e => e[0]);
const ENTITY_KEY = Object.fromEntries(ENTITIES.map(e => [e[0], e[1]]));
const ENTITY_SPOKEN = ENTITIES.map(e => e[1]);
const entitySpoken = (f) => ENTITY_KEY[f] || f;
/* any record name in text bound for the voice service -> its spoken name, longest first ("C.A. North Dakota Fed PAC" before "C.A. Fed PAC") */
const SPOKEN_SWAP = ENTITIES.filter(e => e[0] !== e[1]).sort((a, b) => b[0].length - a[0].length);
const toSpoken = (text) => { let t = String(text); for (const [rec, said] of SPOKEN_SWAP) if (t.includes(rec)) t = t.split(rec).join(said); return t; };
const fundFromSpoken = (v) => { if (!v) return v; if (FUNDS.includes(v)) return v; const k = Object.keys(ENTITY_KEY).find(f => ENTITY_KEY[f].toLowerCase() === String(v).toLowerCase().trim()); if (k) return k; const m = matchEntity(v).hits; return m.length === 1 ? m[0] : v; }; /* a key or a close spoken form -> the record name */
const CAMPAIGNS = ["National", "Idaho", "North Dakota", "New Hampshire", "Pennsylvania"];
const oppNeedsCampaign = (action, d) => (action === "opportunity" || action === "editOpportunity") && d && d.fund && !d.campaign && campaignsFor(d.fund).length > 1;
const campaignsFor = (f) => ENTITY_STATE[f] === undefined ? CAMPAIGNS : ["National", ...(ENTITY_STATE[f] ? [ENTITY_STATE[f]] : [])];

// a spoken entity -> one entity, or the few it could be: "the C-3", "Citizens Alliance C 3", "North Dakota Fed PAC" (Oct 24: "C-3" wasn't understood)
const entityWords = (t) => String(t || "").toLowerCase().replace(/c\.a\.|\bca\b/g, "citizens alliance").replace(/\bc\s*-?\s*([34])\b/g, "c$1").replace(/\bfed\b/g, "federal").replace(/[^a-z0-9 ]/g, " ")
  .split(/\s+/).filter(w => w && !/^[a-z]$/.test(w) && !["the", "a", "an", "is", "it", "its", "it's", "one", "that", "this", "to", "for", "of", "let's", "lets", "go", "with", "please", "entity", "entities", "ones", "i", "think", "say", "make", "yes", "yeah"].includes(w));
function matchEntity(t) {
  const ws = entityWords(t); if (!ws.length) return { hits: [] };
  const wordsOf = (f) => [...new Set(entityWords(f).concat(entityWords(ENTITY_KEY[f] || "")))]; // the record's words and the spoken key's ("National C4")
  const hits = FUNDS.filter(f => { const fw = wordsOf(f); return ws.every(w => fw.includes(w)); });
  const same = (fw) => fw.length === ws.length && ws.every(w => fw.includes(w)); const exact = hits.filter(f => same(entityWords(f)) || same(entityWords(ENTITY_KEY[f] || ""))); // "C.A. Fed PAC" is that one, not also the North Dakota Fed PAC
  return { hits: exact.length === 1 ? exact : hits };
}
/* did the officer's own lines name this entity? The evidence guard and the "was it said" check both use this, with the same words as
   matchEntity (Oct 31: the guard used only the record name's words, so "National C4" never counted and the app asked 15 times) */
function entityHeardIn(fund, lines) {
  fund = fundFromSpoken(fund); /* Ara sends the spoken name ("National C3"); the check works on the record name (Oct 31 3:02 PM call: "C-3" refused three times) */
  if (lines.some(t => { const h = matchEntity(t).hits; return h.length === 1 && h[0] === fund; })) return true;
  const aw = entityWords(lines.join(" ")), sets = [entityWords(fund).filter(w => !["citizens", "alliance"].includes(w)), entityWords(entitySpoken(fund))];
  if (sets.some(fw => fw.length && fw.every(w => aw.includes(w)))) return true; /* "the Idaho entity" then "the PAC" (Oct 26 drive) */
  const st = (ENTITY_STATE[fund] || "").toLowerCase();
  return lines.some(t => st && t.toLowerCase().includes(st) && FUNDS.filter(f => ENTITY_STATE[f] === ENTITY_STATE[fund]).length === 1); /* the only entity in the state named */
}
const ENTITY_RULE = FUNDS.map(f => `${entitySpoken(f)}: ${campaignsFor(f).join(" or ")}`).join("; ");
// by state, so Ara never invents one (seen Oct 24: "C.A. Pennsylvania Fed PAC", which doesn't exist)

const ENTITIES_BY_STATE = () => { const by = {}; FUNDS.forEach(f => { const st = ENTITY_STATE[f] || "National"; (by[st] = by[st] || []).push(entitySpoken(f)); }); return Object.entries(by).map(([st, fs]) => `${st}: ${fs.join(", ")}`).join("; "); };
// the entity list as Ara reads it, by state (Carverhill, Oct 30: "have her read the list by default"): "National has C3, C4 and Federal PAC. Idaho has C4 and PAC. ..."
const ENTITY_LIST_SPOKEN = () => { const by = {}; FUNDS.forEach(f => { const st = ENTITY_STATE[f] || "National", k = entitySpoken(f); (by[st] = by[st] || []).push(k.startsWith(st + " ") ? k.slice(st.length + 1) : k); });
  return Object.entries(by).map(([st, fs]) => `${st} has ${fs.length > 1 ? fs.slice(0, -1).join(", ") + " and " + fs[fs.length - 1] : fs[0]}.`).join(" "); };
const CAPACITY = { A: "$250k and up", B: "$100k to $250k", C: "$25k to $100k", D: "$5k to $25k", E: "Under $5k" };
const CAPACITY_LIST = Object.entries(CAPACITY).map(([k, v]) => k + " = " + v).join(", "); // "A = $250k and up, B = ..." for Ara
const CAPACITY_LONG = { A: "$250,000 and up", B: "$100,000 to $250,000", C: "$25,000 to $100,000", D: "$5,000 to $25,000", E: "under $5,000" }; // a rating is always spoken as its letter then its range in full (Carverhill, Oct 28)
const capSaid = (r) => `${r}, ${CAPACITY_LONG[r]}`;
const OUTCOMES = ["Interested, continue cultivation", "Ask made", "Ask accepted", "Not now, revisit", "Not interested", "Referred elsewhere"];
const NO_NEXT_STEP = ["Not interested", "Referred elsewhere"];
const RESPONSES = ["Awaiting", "Accepted", "Countered", "Declined"];
const PAY_METHODS = ["Check", "Credit card", "Bank transfer", "Wire", "Stock", "Other"];

const MEET_TYPES = ["In person", "Phone call", "Video call", "Event", "Email"];

const DURATIONS = ["30 minutes", "45 minutes", "1 hour", "90 minutes", "2 hours"];

// the other lists, by name (Oct 31: these were written out again in the forms, Grok's tools and the screens)
const ASK_TYPES = ["Outright", "Pledge", "Planned gift"];
const CONFIRMED_BY = ["Email", "Phone", "In person"];
const FREQUENCIES = ["Annual", "Quarterly", "Monthly", "One payment"];
const DECISIONS = ["Move to Cultivation", "Defer"];
const ANSWERS = RESPONSES.filter(r => r !== "Awaiting"); /* the ask's later answer: accepted, countered or declined */
const MEETING_FORM_TYPES = MEET_TYPES.slice(0, 3); /* a meeting to schedule: in person, phone or video */
const TASK_STATUS = { todo: "To do", doing: "In progress", waiting: "Waiting", done: "Done" };

const listText = (t) => String(t || "").toLowerCase().replace(/[’‘]/g, "'").replace(/-/g, " ").replace(/\s+/g, " ").trim(); /* words as the lists compare them: lower case, no dashes */
const listEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// THE words table (Nov 1, Carverhill: "move the other lists to the one-list approach the entities now use"): for every list value, the
// words that stand for it when the officer says them. listMatch (the answer-taker) and listHeard (the evidence guard) both read this
// table and nothing else, so a phrasing added here is heard the same way everywhere. A value's own name is always heard (listMatch).
const LIST_WORDS = {
  outcome: { "Interested, continue cultivation": /\b(interested|keen|excited|enthusiastic|positive|receptive|engaged|on board|liked it|loved it)\b|went (really |very )?well|(good|great) (meeting|call|conversation)|keep cultivating/, "Ask made": /\bask(ed)?\b|proposed|pitched|requested|invited (him|her|them) to give/, "Ask accepted": /accept|agreed|said yes|yes to|committed|he's in|she's in|they're in|pledg|handed|check/, "Not now, revisit": /not now|later|revisit|next year|next quarter|hold off|wait|timing|busy|not yet|down the road/, "Not interested": /not interested|no interest|declined|turned (me|us|it) down|passed|no thanks|not for (him|her|them)/, "Referred elsewhere": /refer|pointed (me|us) to|sent (me|us) to|someone else|better fit/ },
  campaign: Object.fromEntries(CAMPAIGNS.map(c => [c, c === "National" ? /\bnational\b|\bnation ?wide\b|\bfederal\b|\bcountry ?wide\b/ : new RegExp("\\b" + listEsc(listText(c)) + "\\b")])), /* "the state one" is read against the entity's own campaigns in listMatch */
  status: { "To do": /\bto do\b|\bnot started\b|\bnot done\b|\bopen\b|\breopen|\bundo\b|\bback to\b/, "In progress": /\bin progress\b|\bstarted\b|\bworking on\b|\bunder ?way\b|\bbegun\b|\bdoing\b/,
    "Waiting": /\bwait|\bon hold\b|\bblocked\b|\bpending\b|\bheld up\b/, "Done": /\bdone\b|\bfinished\b|\bcomplete|\bwrapped up\b|\btaken care of\b/ },
  meetingType: { "In person": /\bin person\b|\bmet\b|\bmeeting\b|\blunch\b|\bcoffee\b|\bdinner\b|\bbreakfast\b|\boffice\b|\bvisit|\bface to face\b|\bevent\b|\bparty\b|\bdropped by\b|\bstopped by\b|\bhouse\b|\bhome\b/,
    "Event": /\bevent\b|\bgala\b|\bparty\b|\breception\b|\bfundraiser\b|\bconference\b|\bluncheon\b|\bbanquet\b|\bopening\b|\bceremony\b/, "Email": /\bemail|\be-mail|\bwrote\b|\breplied\b|\bmessage\b|\bnote\b/,
    "Phone call": /\bphone\b|\bcall(ed|s)?\b|\brang\b|\bdialed\b/, "Video call": /\bvideo\b|\bzoom\b|\bteams\b|\bfacetime\b|\bgoogle meet\b|\bonline\b|\bvirtual/ },
  response: { "Accepted": /\baccept|\bagreed\b|\bsaid yes\b|\byes to\b|\bcommitted\b|\bhe's in\b|\bshe's in\b|\bthey're in\b|\bhanded\b|\bcheck\b|\bcheque\b|\bpledged\b|\bgave\b|\bwrote\b/,
    "Declined": /\bdeclin|\bturned (me|us|it) down\b|\bpassed\b|\bsaid no\b|\bnot interested\b|\bno thanks\b|\bwon't\b|\bwouldn't\b|\bnot going to\b/,
    "Countered": /\bcounter|\binstead\b|\boffered\b|\brather\b|\blower\b|\bless\b|\bsmaller\b|\bhigher\b|\bmore\b|\bhalf\b|\bonly\b|\bcould do\b|\bcan do\b/,
    "Awaiting": /\bthink(ing)? (about|it over)\b|\bconsider\b|\bget back\b|\bwait|\bawait|\bdecide\b|\bdecision\b|\blater\b|\bsleep on\b|\btalk to (his|her|their)\b|\bundecided\b|\bno answer\b|\bdidn't say\b/ },
  confirmedBy: { "Email": /\bemail|\be-mail|\bwrote\b|\bwritten\b|\bmessage\b|\bletter\b|\bin writing\b/, "Phone": /\bphone\b|\bcall(ed|s)?\b|\brang\b|\btext/,
    "In person": /\bin person\b|\bmet\b|\bmeeting\b|\bface\b|\bhanded\b|\blunch\b|\bcoffee\b|\bdinner\b|\boffice\b|\bvisit|\bevent\b|\bsigned\b/ },
  method: { "Check": /\bcheck\b|\bcheque\b/, "Credit card": /\bcard\b|\bcredit\b|\bvisa\b|\bmastercard\b|\bamex\b/, "Bank transfer": /\bbank\b|\btransfer\b|\bach\b|\bdirect deposit\b/,
    "Wire": /\bwire/, "Stock": /\bstock|\bshares\b|\bsecurities\b|\bappreciated\b/, "Other": /\bcash\b|\bonline\b|\bpaypal\b|\bvenmo\b|\bzelle\b|\bcrypto|\bbitcoin\b|\bdaf\b|\bdonor advised\b|\bother\b/ },
  askType: { "Outright": /\boutright\b|\bone[- ]time\b|\bsingle gift\b|\bcash gift\b/, "Pledge": /\bpledge|\binstallment|\bover \w+ years\b|\bmulti[- ]?year\b|\bpayments\b|\bper year\b|\ba year for\b/, "Planned gift": /\bplanned gift\b|\bestate\b|\bbequest\b|\bwill\b|\blegacy\b|\btrust\b/ },
  frequency: { "Annual": /\bannual|\byear|\byearly\b/, "Quarterly": /\bquarter/, "Monthly": /\bmonth/, "One payment": /\bone payment\b|\bsingle\b|\blump\b|\ball at once\b|\bone time\b|\bin full\b|\bup front\b/ },
  decision: { "Move to Cultivation": /\bmove\b|\bready\b|\bcultivat|\badvance\b|\bpromote\b|\byes\b|\bgo ahead\b|\bdo it\b/, "Defer": /\bdefer\b|\bwait\b|\bnot yet\b|\bhold\b|\blater\b|\bno\b|\bnot ready\b|\bpostpone\b/ },
  ally: { true: /\bally\b|\bdo not solicit\b|\bdon't solicit\b|\bnever (ask|solicit)\b|\bno solicit/, false: /\bnot an ally\b|\bsolicit/ },
  dnc: { true: /\bdo not contact\b|\bdon't contact\b|\bno contact\b|\bnever contact\b/, false: /\bcontact\b/ },
  permText: { true: /\btext/, false: /\btext/ }
};
function normCap(v) {
  if (v == null) return null; const t = String(v).trim(); if (!t) return null;
  let m = t.match(/^([A-Ea-e])(?![a-z])/); if (m) return m[1].toUpperCase();
  if (/under|less than|below/i.test(t) && /5/.test(t)) return "E";
  m = t.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(k|thousand|m|million)?/i); if (!m) return null;
  const n = parseFloat(m[1]) * (/^(m|million)$/i.test(m[2] || "") ? 1e6 : /^(k|thousand)$/i.test(m[2] || "") ? 1e3 : 1);
  return n >= 250000 ? "A" : n >= 100000 ? "B" : n >= 25000 ? "C" : n >= 5000 ? "D" : "E";
}

// every list by the form field that uses it
const LISTS = () => ({ fund: FUNDS, campaign: CAMPAIGNS, capacity: Object.keys(CAPACITY), meetingType: MEET_TYPES, response: RESPONSES, confirmedBy: CONFIRMED_BY,
  method: PAY_METHODS, askType: ASK_TYPES, frequency: FREQUENCIES, decision: DECISIONS, outcome: OUTCOMES, duration: DURATIONS, status: Object.values(TASK_STATUS) });
// a rating in the officer's words: a letter ("B", "bee", "it's a C"), or a dollar figure that falls in a range
function capFromWords(raw) {
  const t = String(raw || "").trim().replace(/^(it's|its|make it|let's say|lets say|say|rating|capacity|rate (him|her|them)|give (him|her|them))\s+(an? )?/i, "").replace(/^(bee|be)\b/i, "B").replace(/^(see|sea|cee)\b/i, "C").replace(/^dee\b/i, "D").replace(/^ee\b/i, "E");
  return normCap(t);
}
// lists with their own way of reading an answer (text as said, t as the lists compare it, opts the form's values): the hits, or null to
// read the answer like any other list (its values' names, then the words table)
const LIST_PICK = {
  fund: (text, t, opts) => { const h = matchEntity(text).hits; return opts ? h.filter(v => opts.includes(v)) : h; },
  capacity: (text) => { const v = capFromWords(text); return v ? [v] : []; },
  /* a campaign answer that names an entity ("The PAC. C.A. Idaho PAC.") is not a campaign; "the state one" is the entity's own state (Oct 25: a repeat after a drop filled the campaign) */
  campaign: (text, t, opts) => { if (!/\bcampaign\b/.test(t) && /\b(pac|c3|c4|c\.?a\.?|citizens|alliance|entity)\b/.test(t)) return []; const st = (opts || CAMPAIGNS).filter(c => c !== "National"); return /\bstate\b/.test(t) && st.length === 1 ? st : null; }
};
// the officer's words -> the value(s) of a list they point to. One hit is the answer; several mean the app asks which one; none means
// the words don't answer this list. opts: the values this form offers (a form can offer part of a list).
function listMatch(key, text, opts) {
  const t = listText(text); if (!t) return { hits: [] };
  const pick = LIST_PICK[key] && LIST_PICK[key](text, t, opts); if (pick) return { hits: pick };
  const vals = (opts || LISTS()[key] || []).filter(Boolean);
  const named = vals.filter(v => new RegExp("\\b" + listEsc(listText(v)) + "\\b").test(t)); /* the value's own name ("credit card", "in person") */
  if (named.length) { const longest = Math.max(...named.map(v => v.length)); return { hits: named.filter(v => v.length === longest) }; }
  const re = LIST_WORDS[key] || {}; return { hits: vals.filter(v => re[v] && re[v].test(t)) };
}
// the answer to a list question: the one value the words point to (the first, when the words fit several and the list has no "which one" question), or null
function listTake(key, text, opts) { const h = listMatch(key, text, opts).hits; if (key === "fund") return h.length === 1 ? h[0] : null; return h.length ? h[0] : null; }
// a state said as part of an entity's name is not its campaign: "North Dakota C4" names no campaign, "the Pennsylvania C4, Pennsylvania" does
// (9:30 PM call, Nov 1: the entity answer counted as the campaign "just said", so the campaign question never came). Every reader of the
// officer's words for a list goes through wordsForList, so the rule lives here once.
const ENTITY_NAME_RE = new RegExp("\\b(" + ["National", ...Object.values(ENTITY_STATE).filter(Boolean)].map(s => listEsc(s.toLowerCase())).join("|") + ")('s)?\\s+(the\\s+)?(c\\s*-?\\s*3|c\\s*-?\\s*4|(state |fed(eral)? )?pac|entity)\\b", "g");
const wordsForList = (key, text) => key === "campaign" ? String(text).replace(ENTITY_NAME_RE, " ") : String(text);
// did the officer's own words (lines, newest last) give this value? asked: the question just put to them. The evidence guard uses this for every list.
function listHeard(key, value, lines, asked) {
  if (key === "fund") return entityHeardIn(value, lines);
  lines = lines.map(l => wordsForList(key, l));
  if (typeof optionAnswered === "function" && optionAnswered(String(value), lines, asked)) return true;
  const all = lines.map(listText).join(" \n "), re = (LIST_WORDS[key] || {})[String(value)];
  if (new RegExp("\\b" + listEsc(listText(value)) + "\\b").test(all)) return true;
  return re ? re.test(all) : null;
}
