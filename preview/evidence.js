// Evidence rule (Carverhill, Oct 25: "for every field there is some probability Grok makes things up"):
// every value the voice model puts on a form must be traceable to something the officer said in this call.
// A value with no evidence is left off the form and named in the "left out" note, so Ara asks for it instead of reading back her own guess.
// Free-text fields (names, email, summary, notes, task text) are the officer's words paraphrased and are not checked here.
// The capacity rating, a $0 amount, and the interaction report's substantive flag, next step and outcome are judged below too
// (moved here from aratools.js on Oct 28, unchanged): one place for everything the app refuses to take on the voice model's word.
const EVIDENCE_SKIP = new Set(["first", "last", "email", "mobile", "summary", "notes", "howMet", "reason", "lostReason", "text", "title", "forName", "officer", "participants",
  "permEmail", "permCalls", "onOpp", "time", "duration", "source", "installments", "potential"]);
const INTERACTION_ONLY = new Set(["substantive", "nextStep", "outcome"]); // judged on the interaction report only, as before; a recorded ask's next step is not
const SHORT_LABEL = { substantive: "substantive", nextStep: "next step", outcome: "outcome" }; // how the "left out" note names them
// the officer talked about a rating in their last three lines ("rate him a C", "she gives about $10,000 a year", "C." after hearing the choices)
function ratedIn(lines) {
  return lines.slice(-3).map(t => t.toLowerCase().trim()).some(t => /\b(capacity|rating|rated|rate them|rate her|rate him)\b/.test(t) || /\$\s?\d|\b\d+\s?(k|thousand|million)\b|\b(thousand|million|grand)\b|\b(donat\w*|gives?|gave|giving)\b.*\b(dollars?|a year|annually)\b|\bunder (five|5)\b/.test(t)
    || /^((a|b|c|d|e|bee|be|see|sea|cee|dee|ee)[.!,]?( please)?[.!]?\s*){1,3}$/.test(t.replace(/^(it's|its|make it|let's say|lets say|say|um|uh|okay|ok)[, ]+/, "")) /* "B. B." (Oct 28: said twice, refused) */
    || /\b(let's do|lets do|go with|i'd say|i would say|make (it|him|her|them)|set (it|him|her|them)( to| at)?|put (him|her|them) (at|as|down as)|rate (him|her|them)( as| at)?)\s+(an? )?(a|b|c|d|e|bee|be|see|sea|cee|dee|ee)\b/.test(t)); // "Let's do C." after hearing the choices (Oct 25)
}
// did the officer say whether it was substantive (the word itself, or a yes/no to a question that used it)? Oct 25 consistency run: Grok marked 2 of 6 reports substantive on its own
function substantiveIn(lines, asked) { const ls = lines.slice(-3); if (ls.some(t => /\bsubstantive\b/.test(t))) return true;
  const last = ls[ls.length - 1] || ""; return /\bsubstantive\b/.test(asked || "") && (hfYes(last) || /\b(no|not|wasn't|nope)\b/.test(last)); }
// did the officer give a next step (an action word in their words, or an answer to a next-step question)? Oct 25: Grok invented "Follow up on James's interest"
function nextStepIn(lines, asked) { const ls = lines.slice(-4), last = ls[ls.length - 1] || "";
  if (/\b(next step|follow[- ]?up|follow up|what's next)\b/.test(asked || "") && last.split(/\s+/).length >= 2 && !/\b(no|none|nothing|not sure|don't know)\b/.test(last)) return true;
  return ls.some(t => /\b(next step|follow[- ]?up|call (him|her|them|back)|give (him|her|them) a call|phone (him|her|them)|meet(ing)?|lunch|coffee|dinner|breakfast|send (him|her|them)?|email (him|her|them)?|text (him|her|them)|visit|drop by|stop by|check (in|back)|reach out|invite|schedule|set up|get back|circle back|touch base|task|remind|tour|introduce|proposal|deck|materials)\b/.test(t)); }
// did the officer say something that matches the outcome Grok picked?
const OUTCOME_WORDS = { "Interested, continue cultivation": /\b(interested|keen|excited|enthusiastic|positive|receptive|engaged|on board|liked it|loved it)\b|went (really |very )?well|(good|great) (meeting|call|conversation)|keep cultivating/, "Ask made": /\bask(ed)?\b|proposed|pitched|requested|invited (him|her|them) to give/, "Ask accepted": /accept|agreed|said yes|yes to|committed|he's in|she's in|they're in|pledg|handed|check/, "Not now, revisit": /not now|later|revisit|next year|next quarter|hold off|wait|timing|busy|not yet|down the road/, "Not interested": /not interested|no interest|declined|turned (me|us|it) down|passed|no thanks|not for (him|her|them)/, "Referred elsewhere": /refer|pointed (me|us) to|sent (me|us) to|someone else|better fit/ };
function outcomeIn(o, lines) { const re = OUTCOME_WORDS[o]; if (!re) return false; return lines.slice(-4).some(t => re.test(t)); }
// words that stand for an option when the officer says them
const OPTION_WORDS = {
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
const COUNT_WORDS = "a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fourteen|fifteen|twenty|thirty|sixty|ninety|\\d+";
const DATE_WORDS = new RegExp(`\\bin (${COUNT_WORDS}|a few|a couple of|several) (day|week|month|year)s?\\b|\\b(${COUNT_WORDS}) (day|week|month|year)s? (from|out|later|ahead|time)\\b|` + String.raw`\b(today|tomorrow|yesterday|tonight|this|next|last|coming|end of|beginning of|mid|early|late|week|weekend|month|year|quarter|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thurs|fri|sat|sun|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|first|second|third|fourth|fifth|tenth|fifteenth|twentieth|thirtieth|christmas|thanksgiving|halloween|new year|on the|by the|the \d+(st|nd|rd|th)?|\d+(st|nd|rd|th)|\d+\/\d+|\d{4})\b`);
// every officer line of this call, lower case
function evidenceLines() { return (G.recent || []).filter(l => l.startsWith("Officer: ")).map(l => l.slice(9).toLowerCase().replace(/[’‘]/g, "'")); }
// did the officer say this amount, in digits or words ("25,000", "25k", "twenty-five thousand", "ten grand")?
function amountSaid(n, lines) {
  n = toNum(n); if (!(n > 0)) return false;
  return lines.some(t => {
    const s = t.replace(/\bgrand\b/g, "thousand");
    if (new RegExp("(^|[^0-9.])" + String(n).replace(".", "\\.") + "(?![0-9])").test(s.replace(/,/g, ""))) return true;
    const ws = s.replace(/[$]/g, "").replace(/[^a-z0-9. ]/g, " ").split(/\s+/).filter(Boolean);
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j <= Math.min(ws.length, i + 7); j++) { const v = spokenAmount(ws.slice(i, j).join(" ")); if (v === n) return true; if (v !== null && v > n) break; }
    return false;
  });
}
function entitySaid(fund, lines) {
  const fw = entityWords(fund).filter(w => !["citizens", "alliance"].includes(w)), st = (ENTITY_STATE[fund] || "").toLowerCase();
  const aw = entityWords(lines.join(" ")); if (fw.length && fw.every(w => aw.includes(w))) return true; // "the Idaho entity" then "the PAC" (Oct 26 drive)
  return lines.some(t => { const tw = entityWords(t); if (fw.length && fw.every(w => tw.includes(w))) return true;
    if (st && t.includes(st) && FUNDS.filter(f => ENTITY_STATE[f] === ENTITY_STATE[fund]).length === 1) return true; // the only entity in the state the officer named
    return !st && fw.length === 1 && /\bc3\b|\bc 3\b|\bthe c-?3\b/.test(t) && fw[0] === "c3"; });
}
// true when the value can stand, false when nothing the officer said supports it, null when the rule doesn't apply to this field.
// ctx: asked = the line Ara said just before the officer's latest; askedSubst = the app itself asked the substantive question (its answer is taken as said)
function fieldEvidence(action, f, v, data, lines, ctx = {}) {
  if (!f || EVIDENCE_SKIP.has(f.k) || v === null || v === undefined || v === "") return null;
  if (f.type === "money" && !(toNum(v) > 0)) return false; // $0, or no amount at all (Oct 25 consistency run: amount 0 was read back as $0 and saved)
  if (f.k === "capacity") return ratedIn(lines); // the voice model tends to fill in a rating nobody gave (usually E)
  if (INTERACTION_ONLY.has(f.k)) { if (action !== "interaction") return null; // Grok marks reports substantive, picks outcomes and invents next steps on its own (Oct 25 consistency run, 2 of 6)
    if (f.k === "substantive") return ctx.askedSubst ? true : substantiveIn(lines, ctx.asked);
    if (f.k === "nextStep") return nextStepIn(lines, ctx.asked);
    return outcomeIn(v, lines); }
  const all = lines.join(" \n ");
  if (f.k === "fund") return entitySaid(v, lines);
  if (f.k === "campaign") { const c = campaignsFor(data.fund || ""); if (c.length === 1 && c[0] === v) return true; if (v === "National") return /\bnational|\bnation-?wide\b|\bfederal\b/.test(all); return all.includes(String(v).toLowerCase()); }
  if (f.type === "bool" && !v) return null; // false is the default, nothing to prove
  if (OPTION_WORDS[f.k]) { const re = OPTION_WORDS[f.k][String(v)]; return re ? re.test(all) || re.test(all.replace(/-/g, " ")) : null; } // an option the form doesn't offer is left to the form; "in-person" is "in person" (Oct 28, the type dropped twice)
  if (f.type === "money") return amountSaid(v, lines);
  if (f.type === "date") { const iso = normDate(v); if (iso && iso === todayISO()) return true; return DATE_WORDS.test(all) || /\d/.test(all); }
  if (f.type === "select" || f.type === "bool") return false; // an option with no words of its own: only the officer's own tap sets it
  return null;
}
// drop every value the officer never gave; returns the labels dropped (the interaction report's substantive, next step and outcome last, in that order)
function applyEvidence(action, data, name) {
  const A = ACTIONS[action]; if (!A) return [];
  const lines = G.live ? evidenceLines() : []; // nothing said yet in this call (or a typed test): nothing to check against, except a $0
  const ctx = { asked: typeof askedBefore === "function" ? askedBefore() : "", askedSubst: !!(V && V.action === "interaction" && V.askedSubst) };
  const dropped = [], trio = {};
  const pre = voiceRule(action).prefilled || [];
  A.fields.forEach(f => {
    if (f.fixed || pre.includes(f.k)) return; /* prefilled from the record (VOICE_RULES): not subject to the officer-said rule */
    const v = data[f.k]; if (v === null || v === undefined || v === "") return;
    const zero = f.type === "money" && !(toNum(v) > 0); if (!zero && !lines.length) return;
    // already on the form from an earlier turn, or the app's own prefill (the interaction trio only when the officer's words put it there: an unticked box is not evidence)
    if (!zero && V && V.action === action && V.data && V.data[f.k] === v && (!INTERACTION_ONLY.has(f.k) || (V.fromVoice && V.fromVoice.has(f.k)))) return;
    const ok = zero ? false : fieldEvidence(action, f, v, data, lines, ctx); if (ok !== false) return;
    vlog(`${name}: dropped ${f.label} "${v}" (${zero ? "not an amount" : "nothing the officer said supports it"})`); delete data[f.k]; if (f.k === "nextStep") delete data.nextDue;
    const label = zero ? `${f.label.toLowerCase()} of $0${f.req ? " (ask for the real amount)" : ""}` : SHORT_LABEL[f.k] || f.label.toLowerCase() + (f.req ? " (ask for it)" : "");
    if (INTERACTION_ONLY.has(f.k)) trio[f.k] = label; else dropped.push(label);
  });
  return dropped.concat(["substantive", "nextStep", "outcome"].map(k => trio[k]).filter(Boolean));
}
