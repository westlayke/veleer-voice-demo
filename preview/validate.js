// THE validation module (Oct 31, Carverhill: "let's look at whether we have a single shared validation module"; was evidence.js).
// Every decision about the officer's own words lives here: did they say this value (the evidence rule below), is this a yes or a no
// (the yes/no readers), and which words name a list value and so are not an amount or a date (listWordsOut). Pick-lists and their
// matcher are in lists.js, which this file uses. Loaded after heard.js, before aratools.js and voiceforms.js.
//
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
function ratedIn(lines, asked) {
  const last = (lines[lines.length - 1] || "").toLowerCase(); // Ara (or the app) had just asked for the rating and the answer names a letter: that is the answer, whatever words are around it (Carverhill, 4:18 PM Oct 29: "Let's give her a C." refused)
  if (/\b(capacity|rating|rate|letter|a through e|a to e)\b/i.test(asked || "") && /\b(a|b|c|d|e|bee|see|sea|cee|dee|ee)\b[.!,]?(\s|$)/.test(last) && last.split(/\s+/).length <= 12 && !/\b([a-z] ){2,}[a-z]\b/.test(last)) return true; // not a spelled name ("Z E L N I K")
  return lines.slice(-3).map(t => t.toLowerCase().trim()).some(t => /\b(capacity|rating|rated|rate them|rate her|rate him)\b/.test(t) || /\$\s?\d|\b\d+\s?(k|thousand|million)\b|\b(thousand|million|grand)\b|\b(donat\w*|gives?|gave|giving)\b.*\b(dollars?|a year|annually)\b|\bunder (five|5)\b/.test(t)
    || /^((a|b|c|d|e|bee|be|see|sea|cee|dee|ee)[.!,]?( please)?[.!]?\s*){1,3}$/.test(t.replace(/^(it's|its|make it|let's say|lets say|say|um|uh|okay|ok)[, ]+/, "")) /* "B. B." (Oct 28: said twice, refused) */
    || /\b(let's do|lets do|go with|i'd say|i would say|make (it|him|her|them)|set (it|him|her|them)( to| at)?|put (him|her|them) (at|as|down as)|rate (him|her|them)( as| at)?)\s+(an? )?(a|b|c|d|e|bee|be|see|sea|cee|dee|ee)\b/.test(t) // "Let's do C." after hearing the choices (Oct 25)
    || /\b(give|gives|gave|giving|call|calling|mark|marking|score|scoring|she's|he's|they're|is|as)\s+(her |him |them |it )?(an? )?(letter )?(a|b|c|d|e|bee|be|see|sea|cee|dee|ee)\b[.!]?\s*$/.test(t)); // "Let's give her a C." (Carverhill, 4:18 PM Oct 29: the rating was refused and asked again)
}
// did the officer say whether it was substantive (the word itself, or a yes/no to a question that used it)? Oct 25 consistency run: Grok marked 2 of 6 reports substantive on its own
function substantiveIn(lines, asked) { const ls = lines.slice(-3); if (ls.some(t => /\bsubstantive\b/.test(t))) return true;
  const last = ls[ls.length - 1] || ""; return /\bsubstantive\b/.test(asked || "") && (hfYes(last) || /\b(no|not|wasn't|nope)\b/.test(last)); }
// did the officer give a next step (an action word in their words, or an answer to a next-step question)? Oct 25: Grok invented "Follow up on James's interest"
function nextStepIn(lines, asked) { const ls = lines.slice(-4), last = ls[ls.length - 1] || "";
  if (/\b(next step|follow[- ]?up|follow up|what's next)\b/.test(asked || "") && last.split(/\s+/).length >= 2 && !/\b(no|none|nothing|not sure|don't know)\b/.test(last)) return true;
  return ls.some(t => /\b(next step|follow[- ]?up|call (him|her|them|back)|give (him|her|them) a call|phone (him|her|them)|meet(ing)?|lunch|coffee|dinner|breakfast|send (him|her|them)?|email (him|her|them)?|text (him|her|them)|visit|drop by|stop by|check (in|back)|reach out|invite|schedule|set up|get back|circle back|touch base|task|remind|tour|introduce|proposal|deck|materials)\b/.test(t)); }
// the question Ara (or the app) just asked listed this option, and the officer's short reply names it: that is the answer, whatever
// the phrase table knows (Carverhill, 4:18 PM Oct 29: a phrase list always misses the next phrasing; the question asked is the stronger evidence)
function optionAnswered(label, lines, asked) {
  const l = String(label || "").toLowerCase().trim(), last = (lines[lines.length - 1] || "").toLowerCase(), q = String(asked || "").toLowerCase();
  if (!l || !q.includes(l) || last.split(/\s+/).length > 12) return false;
  const first = l.split(/\s+/)[0]; if (last.includes(l) || (first.length >= 4 && new RegExp("\\b" + first + "\\b").test(last))) return true;
  const ORD = { first: 0, "1st": 0, one: 0, second: 1, "2nd": 1, two: 1, third: 2, "3rd": 2, three: 2, fourth: 3, "4th": 3, four: 3, fifth: 4, "5th": 4, five: 4, last: -1 }; // "the second one": the options in the order the question listed them
  const m = last.match(/\b(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th|one|two|three|four|five)\b/); if (!m) return false;
  const listed = q.split("?").flatMap(s => s.includes(":") ? s.slice(s.lastIndexOf(":") + 1).split(/,|\bor\b/).map(x => x.trim()).filter(Boolean) : []); /* the choices the question offered, in order */
  const i = ORD[m[1]] === -1 ? listed.length - 1 : ORD[m[1]];
  return listed.length > 1 && listed[i] === l;
}
// ---- yes and no ----
const HF_YES = /\b(yes|yeah|yep|yup|ya|correct|right|sure|save|go ahead|do it|confirm|confirmed|sounds good|perfect|ok|okay|absolutely|definitely)\b/;
// a no is an answer that opens with no or wait, or asks not to save or to change something; "I don't think you needed to say that, but yes" is still a yes
const HF_NO = /^(no|nope|nah|wait|hold on|hang on|not yet|stop|cancel)\b|\b(don't|dont|do not|not|never) (save|do it|go ahead)|\b(not yet|hold on|hang on|wait a|change|wrong|incorrect|isn't right|not right|that's off|fix)\b/;
// the app asked its own yes/no question: a short reply (4 words or fewer) that isn't a no, a question or a command counts as yes, whatever the
// words ("looks good", "lock it in", "it was") (Oct 29 phrase-list review: a yes list always misses the next phrasing)
const appYes = (text) => { const t = String(text).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim();
  if (/\?\s*$/.test(String(text)) || /^(are|is|do|did|does|can|could|would|will|should|have|has|hello|hey|hi|ara)\b/.test(t) || (typeof HEARD_WORDS !== "undefined" && HEARD_WORDS.test(String(text)))) return false; /* a question is never a yes: "Are you there?" saved a gift (6:23 PM call, Oct 29) */
  if (hfYes(t)) return true;
  if (namesField(t)) return false; /* "The amount": what to change, not a yes */
  if (!t || t.split(" ").length > 4 || HF_NO.test(t) || /^(no|nope|nah|not|never|don't|dont|what|which|how|why|when|where|who|say|repeat|undo|cancel|wait|hold|hang|stop|skip|back|change|hmm|um|uh|huh|pardon|sorry)\b/.test(t) || /\b(no|not|don't|dont|wrong|change|undo|cancel|wait|again|driving|parked|drive|hands|free|bug|help|goodbye|bye)\b/.test(t)) return false; /* "I'm driving" is a switch, not a yes */
  return true; };
const hfYes = (text) => { const t = String(text).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim(); return HF_YES.test(t) && !HF_NO.test(t); };
const YES_WORDS = /\b(yes|yeah|yep|sure|ok|okay|fine|allowed|permitted|go ahead|of course|absolutely)\b/, NO_WORDS = /^(no|nope|nah|not)\b|\b(don't|do not|not ok|not okay|shouldn't|can't)\b/;
// a reply that names a field of the open form ("The amount", "the date") is the officer saying what to change, never a yes (5:08 PM call, Oct 31:
// "The amount" after "No, to change something" saved a $3 ask)
const FIELD_STOP = /^(planned|with|your|their|this|that|from)$/;
const fieldWords = (f, skip = "") => { const out = new Set(String(skip).toLowerCase().split(/[^a-z]+/)); return String(f.label || "").toLowerCase().replace(/\(.*\)/g, "").split(/[^a-z]+/).filter(w => w.length > 3 && !FIELD_STOP.test(w) && !out.has(w)); };
function namesField(text) {
  if (typeof V === "undefined" || !V || !ACTIONS[V.action]) return false; const t = String(text).toLowerCase();
  const words = new Set(ACTIONS[V.action].fields.flatMap(f => fieldWords(f)));
  return t.split(/[^a-z]+/).some(w => words.has(w));
}
// the officer's words name this one field ("set a new date" names the planned ask date); the form's own title words don't count ("edit the task" is not the Task field)
function fieldNamed(f, lines, title = "") { const ws = fieldWords(f, title); if (!ws.length || !lines.length) return false; const said = new Set(lines.join(" ").toLowerCase().split(/[^a-z]+/)); return ws.every(w => said.has(w)); } /* every word: "last name" never names First name */
// ---- words that name a list value ----
// "C-3" names an entity: its 3 is not three dollars or the 3rd (5:08 PM call, Oct 31: "C-3" put $3 and a date on a planned ask).
// Every list value with a digit in its name ("C3", "C4") is taken out of the words, in any spelling ("c 3", "c-3", "c3"), before amounts and dates are read.
function listWordsOut(s) {
  const toks = new Set(); Object.values(LISTS()).forEach(vals => (vals || []).forEach(x => String(x).split(/\s+/).forEach(w => { if (/^[a-z]+\d+$/i.test(w)) toks.add(w.toLowerCase()); })));
  let out = String(s); toks.forEach(w => { const m = w.match(/^([a-z]+)(\d+)$/); out = out.replace(new RegExp("\\b" + m[1] + "[\\s.-]*" + m[2] + "\\b", "gi"), " "); });
  return out;
}
// ---- did the officer say it (the evidence rule) ----
const COUNT_WORDS = "a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fourteen|fifteen|twenty|thirty|sixty|ninety|\\d+";
const DATE_WORDS = new RegExp(`\\bin (${COUNT_WORDS}|a few|a couple of|several) (day|week|month|year)s?\\b|\\b(${COUNT_WORDS}) (day|week|month|year)s? (from|out|later|ahead|time)\\b|` + String.raw`\b(today|tomorrow|yesterday|tonight|this|next|last|coming|end of|beginning of|mid|early|late|week|weekend|month|year|quarter|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thurs|fri|sat|sun|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|first|second|third|fourth|fifth|tenth|fifteenth|twentieth|thirtieth|christmas|thanksgiving|halloween|new year|on the|by the|the \d+(st|nd|rd|th)?|\d+(st|nd|rd|th)|\d+\/\d+|\d{4})\b`);
// every officer line of this call, lower case
function evidenceLines() { return (G.recent || []).filter(l => l.startsWith("Officer: ")).map(l => l.slice(9).toLowerCase().replace(/[’‘]/g, "'")); }
// has the officer named this contact in this call (a name word of 3+ letters), or is it the record in front of them / the one just saved? (the name guard)
function nameHeard(c) {
  if (!c) return false; const f = typeof focusContact === "function" ? focusContact() : null;
  if ((f && f.id === c.id) || (typeof V !== "undefined" && V && V.target && V.target.contact && V.target.contact.id === c.id) || (G.lastSaved && G.lastSaved.contactId === c.id)) return true;
  // the officer's own words, and Ara's lines the officer has answered (an offer "Next could be the ask for Ruth?" + "yes"); Ara's lines since the officer last spoke don't count: that's where a guess lives
  const r = G.recent || []; let i = r.length - 1; while (i >= 0 && !r[i].startsWith("Officer: ")) i--;
  const upTo = r.slice(0, i + 1), no = i >= 0 && /^officer: (no|nope|nah)\b/i.test(r[i]); let j = i - 1; while (no && j >= 0 && !r[j].startsWith("Officer: ")) j--;
  const said = (no ? upTo.slice(0, j + 1) : upTo).filter(l => !l.startsWith("App: ")).map(l => l.replace(/^[^:]+: /, "")).join(" \n ").toLowerCase(), words = `${c.first || ""} ${c.last || ""}`.toLowerCase().split(/\s+/).filter(w => w.length >= 3);
  return words.some(w => new RegExp("\\b" + w.replace(/[^a-z0-9]/g, "") + "\\b").test(said.replace(/[^a-z0-9 \n]/g, "")));
}
// did the officer say this amount, in digits or words ("25,000", "25k", "twenty-five thousand", "ten grand")?
function amountSaid(n, lines) {
  n = toNum(n); if (!(n > 0)) return false;
  return lines.map(listWordsOut).some(t => {
    const s = t.replace(/\bgrand\b/g, "thousand");
    if (new RegExp("(^|[^0-9.])" + String(n).replace(".", "\\.") + "(?![0-9])").test(s.replace(/,/g, ""))) return true;
    const ws = s.replace(/[$]/g, "").replace(/[^a-z0-9. ]/g, " ").split(/\s+/).filter(Boolean);
    for (let i = 0; i < ws.length; i++) for (let j = i + 1; j <= Math.min(ws.length, i + 7); j++) { const v = spokenAmount(ws.slice(i, j).join(" ")); if (v === n) return true; if (v !== null && v > n) break; }
    return false;
  });
}
// true when the value can stand, false when nothing the officer said supports it, null when the rule doesn't apply to this field.
// ctx: asked = the line Ara said just before the officer's latest; askedSubst = the officer has answered the substantive question (the line before their
// answer asked it; Nov 1: a question merely sent to Ara is no evidence, she may not have said it)
function fieldEvidence(action, f, v, data, lines, ctx = {}) {
  if (!f || EVIDENCE_SKIP.has(f.k) || v === null || v === undefined || v === "") return null;
  if (f.type === "money" && !(toNum(v) > 0)) return false; // $0, or no amount at all (Oct 25 consistency run: amount 0 was read back as $0 and saved)
  if (f.k === "capacity") return ratedIn(lines, ctx.asked); // the voice model tends to fill in a rating nobody gave (usually E)
  if (INTERACTION_ONLY.has(f.k)) { if (action !== "interaction") return null; // Grok marks reports substantive, picks outcomes and invents next steps on its own (Oct 25 consistency run, 2 of 6)
    if (f.k === "substantive") return ctx.askedSubst ? true : substantiveIn(lines, ctx.asked);
    if (f.k === "nextStep") return nextStepIn(lines, ctx.asked);
    return listHeard("outcome", v, lines.slice(-4), ctx.asked) === true; } /* lists.js: the outcome words table, over the last four lines */
  const all = lines.join(" \n ");
  if (f.k === "fund") return listHeard("fund", v, lines); /* lists.js: the same words the answer-taker hears ("C-3" for National C3, Oct 31) */
  if (f.k === "campaign") { const c = campaignsFor(data.fund || ""); if (c.length === 1 && c[0] === v) return true; return listHeard("campaign", v, lines, ctx.asked) === true; } /* an entity's only campaign needs no words; otherwise lists.js */
  if (f.type === "bool" && !v) return null; // false is the default, nothing to prove
  if (LIST_WORDS[f.k]) return listHeard(f.k, v, lines, ctx.asked); // an option the form doesn't offer is left to the form; "in-person" is "in person" (Oct 28, the type dropped twice)
  if (f.type === "money") return amountSaid(v, lines);
  if (f.type === "date") { const iso = normDate(v); if (iso && iso === todayISO() && f.k === "date") return true; /* today is only a form's own default (interaction, ask, gift "Date" and "Received on"); a planned ask date, a due date or a confirmed date must be said (Carverhill's 12:09 AM call, Nov 1: "Let's set a new date" became today) */ const w = listWordsOut(all); return DATE_WORDS.test(w) || /\d/.test(w); }
  if (f.type === "select" || f.type === "bool") return false; // an option with no words of its own: only the officer's own tap sets it
  return null;
}
// could these words of the officer's answer this field at all? (no value to check, only the kind of answer the field takes)
function fieldSaidIn(action, f, lines) {
  if (!f || !lines.length) return false; const all = lines.join(" \n ").toLowerCase();
  if (f.k === "capacity") return ratedIn(lines);
  if (f.k === "fund") return listMatch("fund", lines[lines.length - 1]).hits.length === 1 || !!(typeof V !== "undefined" && V && V.data && String(V.data.fund || "").trim()); /* already on the form from an earlier answer (12:09 AM call, Nov 1: reported left out while the form kept it) */ /* a state with two entities is a choice still to make (10:05 AM call) */
  if (LIST_WORDS[f.k]) { const t = wordsForList(f.k, all); return Object.values(LIST_WORDS[f.k]).some(re => re.test(t) || re.test(t.replace(/-/g, " "))); } /* campaign: a state name or a national word, not as part of an entity's name */
  if (f.type === "money") return /\$|\d|\b(thousand|hundred|million|grand|bucks|dollars)\b/.test(listWordsOut(all));
  if (f.type === "date") { const w = listWordsOut(all); return DATE_WORDS.test(w) || /\d/.test(w); }
  return false; /* free text: the app can't tell, so it asks */
}
// drop every value the officer never gave; returns the labels dropped (the interaction report's substantive, next step and outcome last, in that order)
function applyEvidence(action, data, name) {
  const A = ACTIONS[action]; if (!A) return [];
  const lines = G.live ? evidenceLines() : []; // nothing said yet in this call (or a typed test): nothing to check against, except a $0
  const ctx = { asked: typeof askedBefore === "function" ? askedBefore() : "", askedSubst: !!(V && V.action === "interaction" && typeof officerSubstantive === "function" && officerSubstantive() !== null) };
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
