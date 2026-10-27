// Evidence rule (Carverhill, Oct 25: "for every field there is some probability Grok makes things up"):
// every value the voice model puts on a form must be traceable to something the officer said in this call.
// A value with no evidence is left off the form and named in the "left out" note, so Ara asks for it instead of reading back her own guess.
// Free-text fields (names, email, summary, notes, task text) are the officer's words paraphrased and are not checked here;
// the interaction report's substantive flag, next step and outcome keep their own checks in aratools.js.
const EVIDENCE_SKIP = new Set(["first", "last", "email", "mobile", "summary", "notes", "howMet", "reason", "lostReason", "nextStep", "text", "title", "forName", "officer", "participants",
  "permEmail", "permCalls", "onOpp", "time", "duration", "source", "capacity", "substantive", "outcome", "installments", "potential"]);
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
const DATE_WORDS = /\bin (a|an|one|two|three|four|five|six|\d+|a few|a couple of|several) (day|week|month|year)s?\b|\b(a|one|two|three|\d+) (day|week|month|year)s? (from|out|later|ahead)\b|\b(today|tomorrow|yesterday|tonight|this|next|last|coming|end of|beginning of|mid|early|late|week|weekend|month|year|quarter|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thurs|fri|sat|sun|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|first|second|third|fourth|fifth|tenth|fifteenth|twentieth|thirtieth|christmas|thanksgiving|halloween|new year|on the|by the|the \d+(st|nd|rd|th)?|\d+(st|nd|rd|th)|\d+\/\d+|\d{4})\b/;
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
// true when the value can stand, false when nothing the officer said supports it, null when the rule doesn't apply to this field
function fieldEvidence(action, f, v, data, lines) {
  if (!f || EVIDENCE_SKIP.has(f.k) || v === null || v === undefined || v === "") return null;
  const all = lines.join(" \n ");
  if (f.k === "fund") return entitySaid(v, lines);
  if (f.k === "campaign") { const c = campaignsFor(data.fund || ""); if (c.length === 1 && c[0] === v) return true; if (v === "National") return /\bnational|\bnation-?wide\b|\bfederal\b/.test(all); return all.includes(String(v).toLowerCase()); }
  if (f.type === "bool" && !v) return null; // false is the default, nothing to prove
  if (OPTION_WORDS[f.k]) { const re = OPTION_WORDS[f.k][String(v)]; return re ? re.test(all) : null; } // an option the form doesn't offer is left to the form
  if (f.type === "money") return amountSaid(v, lines);
  if (f.type === "date") { const iso = normDate(v); if (iso && iso === todayISO()) return true; return DATE_WORDS.test(all) || /\d/.test(all); }
  if (f.type === "select" || f.type === "bool") return false; // an option with no words of its own: only the officer's own tap sets it
  return null;
}
// drop every value the officer never gave; returns the labels dropped
function applyEvidence(action, data, name) {
  const A = ACTIONS[action]; if (!A || !G.live) return [];
  const lines = evidenceLines(); if (!lines.length) return []; // nothing said yet in this call (or a typed test): nothing to check against
  const dropped = [];
  A.fields.forEach(f => {
    if (f.fixed) return;
    const v = data[f.k]; if (v === null || v === undefined || v === "") return;
    if (V && V.action === action && V.data && V.data[f.k] === v) return; // already on the form from an earlier turn, or the app's own prefill
    const ok = fieldEvidence(action, f, v, data, lines); if (ok !== false) return;
    vlog(`${name}: dropped ${f.label} "${v}" (nothing the officer said supports it)`); delete data[f.k]; dropped.push(f.label.toLowerCase() + (f.req ? " (ask for it)" : ""));
  });
  return dropped;
}
