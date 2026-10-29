// Checks: the evidence rule (preview/evidence.js) across every form and every value it can judge. tests/bot.js loads this file and passes in its helpers.
// For each field the rule covers: an unsaid value is dropped, and the same value said in ordinary phrasings is kept. Add a phrasing here when a real call shows the word lists missed it.
module.exports = ({ test, ok, fresh, signIn, state, tab, ara, said, titleOf, PAGE, fs, path }) => {

// phrasings an officer might use for each option; every one must count as evidence
const SAID = {
  meetingType: { "In person": ["I met her for lunch", "we had coffee this morning", "I dropped by his office", "saw him at the gala event"],
    "Event": ["saw her at the gala", "we talked at the fundraiser", "met him at the reception"], "Email": ["we traded emails", "she wrote back", "I sent him a note"],
    "Phone call": ["I called him this morning", "we had a phone call", "she rang me back"],
    "Video call": ["we did a zoom", "it was a video call", "we spoke on teams"] },
  response: { "Accepted": ["she accepted", "he agreed to the full amount", "they said yes", "she handed me a check"],
    "Declined": ["he declined", "she turned us down", "they said no"],
    "Countered": ["he countered at half", "she offered ten instead", "they could do less than that"],
    "Awaiting": ["she's thinking it over", "he'll get back to me", "they want to talk to their accountant first"] },
  confirmedBy: { "Email": ["she confirmed by email", "he put it in writing", "they sent a letter"],
    "Phone": ["he confirmed on the phone", "she called to confirm", "confirmed by text"],
    "In person": ["she confirmed in person", "he handed it to me", "we signed it at lunch"] },
  method: { "Check": ["by check", "she wrote a check"], "Credit card": ["on her card", "credit card"], "Bank transfer": ["bank transfer", "by ach"],
    "Wire": ["by wire", "wired the money"], "Stock": ["a gift of stock", "appreciated shares"], "Other": ["in cash", "through venmo", "from a donor advised fund"] },
  askType: { "Outright": ["an outright gift", "a one-time gift"], "Pledge": ["a pledge over three years", "in installments"], "Planned gift": ["a planned gift", "in her will", "a bequest"] },
  frequency: { "Annual": ["annual payments", "once a year"], "Quarterly": ["quarterly"], "Monthly": ["monthly payments"], "One payment": ["one payment", "a lump sum", "paid in full"] },
  decision: { "Move to Cultivation": ["move him to cultivation", "she's ready", "yes, go ahead"], "Defer": ["defer it", "not yet", "let's wait on that"] },
  ally: { true: ["he's an ally, do not solicit", "never ask her for money"] }, dnc: { true: ["do not contact him", "no contact please"] }, permText: { true: ["texting is fine", "you can text her"] },
  outcome: { "Interested, continue cultivation": ["she's really interested", "it went well", "he's on board"], "Ask made": ["I asked him for the gift", "I pitched it"], "Ask accepted": ["she accepted", "he said yes"],
    "Not now, revisit": ["not now, maybe next year", "the timing isn't right"], "Not interested": ["he's not interested", "she passed on it"], "Referred elsewhere": ["she referred me to her foundation", "he sent me to his brother"] }
};
const AMOUNTS = { 25000: ["twenty-five thousand dollars", "25,000", "25k", "25 thousand"], 10000: ["ten grand", "ten thousand", "$10,000"], 1500: ["fifteen hundred", "1,500 dollars"], 500000: ["half a million", "five hundred thousand"], 2000000: ["two million", "2 million"] };
const DATES = ["next friday", "december first", "on the 15th", "end of the month", "tomorrow", "in two weeks", "november 5", "a week from now", "in a couple of days"];
const NEUTRAL = ["log an interaction with ruth", "we talked about the campaign and her family", "add it please"]; // officer lines that name no option, amount or date

test("Evidence rule: every pick-list option, flag, amount and date is kept when said and dropped when not, on every form", async (p) => {
  await signIn(p);
  const r = await p.evaluate(({ SAID, AMOUNTS, DATES, NEUTRAL }) => {
    const fails = []; let n = 0;
    const judge = (action, f, v, lines, data) => fieldEvidence(action, f, v, Object.assign({}, data || {}), lines.map(l => l.toLowerCase()));
    const seen = new Set();
    Object.entries(ACTIONS).forEach(([action, A]) => A.fields.forEach(f => {
      if (f.fixed || EVIDENCE_SKIP.has(f.k)) return;
      const key = action + ":" + f.k; if (seen.has(key)) return; seen.add(key);
      const unsaidIs = (v, data, why) => { n++; if (judge(action, f, v, NEUTRAL, data) !== false) fails.push(`${action}.${f.k} = ${JSON.stringify(v)} kept with nothing said${why || ""}`); };
      const saidIs = (v, line, data) => { n++; if (judge(action, f, v, [line], data) !== true) fails.push(`${action}.${f.k} = ${JSON.stringify(v)} dropped although the officer said "${line}"`); };
      // the guards moved here from aratools.js on Oct 28: a rating, a $0 amount, and the interaction report's substantive flag, next step and outcome
      if (f.k === "capacity") { unsaidIs("C"); ["let's rate her a C", "capacity is about twenty-five thousand", "she gives around $10,000 a year", "put him at B", "C.", "Let's give her a C.", "I'd give him a B", "she's a C", "call it a D"].forEach(l => saidIs("C", l));
        n++; if (judge(action, f, "E", ["we talked about the gala", "lovely person", "add her please"]) !== false) fails.push(`${action}.capacity E kept with only small talk`); return; }
      if (["substantive", "nextStep", "outcome"].includes(f.k)) { if (action !== "interaction") { n++; if (judge(action, f, f.k === "substantive" ? true : f.k === "outcome" ? "Ask made" : "Call him", NEUTRAL) !== null) fails.push(`${action}.${f.k} judged although the rule is for the interaction report only`); return; }
        if (f.k === "substantive") { unsaidIs(true); unsaidIs(false, null, " (false is not a default here: the app asks)"); ["it was substantive", "a substantive one, yes"].forEach(l => saidIs(true, l));
          n++; if (fieldEvidence(action, f, true, {}, ["yes it was"], { asked: "was it a substantive interaction?" }) !== true) fails.push(`${action}.substantive dropped although the officer said yes to the question`);
          n++; if (fieldEvidence(action, f, false, {}, ["no, not really"], { asked: "was it a substantive interaction?" }) !== true) fails.push(`${action}.substantive false dropped although the officer said no to the question`);
          n++; if (fieldEvidence(action, f, true, {}, ["yes it was"], { askedSubst: true }) !== true) fails.push(`${action}.substantive dropped although the app itself asked`); return; }
        if (f.k === "nextStep") { unsaidIs("Follow up on his interest"); ["I'll give him a call next week", "let's set up lunch", "send her the proposal", "I'll check back in a month"].forEach(l => saidIs("Call him", l));
          n++; if (fieldEvidence(action, f, "Send the deck", {}, ["send the deck on friday"], { asked: "what's the next step?" }) !== true) fails.push(`${action}.nextStep dropped although the officer answered the next-step question`);
          n++; if (fieldEvidence(action, f, "Send the deck", {}, ["no, nothing"], { asked: "what's the next step?" }) !== false) fails.push(`${action}.nextStep kept although the officer said nothing to the question`); return; }
        OUTCOMES.forEach(o => { unsaidIs(o); const ps = (SAID.outcome || {})[o] || []; if (!ps.length) fails.push(`no phrasings listed for ${action}.outcome = ${o}`); ps.forEach(l => saidIs(o, l)); }); return; }
      if (f.k === "fund") { FUNDS.forEach(fd => { unsaidIs(fd); const ws = entityWords(fd).filter(w => !["citizens", "alliance"].includes(w)); saidIs(fd, "it's for the " + ws.join(" ")); }); saidIs("Citizens Alliance C3", "the c-3"); saidIs("C.A. New Hampshire C4", "the new hampshire one");
        n++; if (judge(action, f, "C.A. Idaho PAC", ["uh, the idaho entity.", "the pac."]) !== true) fails.push(`${action}.fund = C.A. Idaho PAC dropped although the officer said "the Idaho entity" then "the PAC" (Oct 26 drive)`); return; }
      if (f.k === "campaign") { unsaidIs("National", { fund: "C.A. Idaho C4" }, " (Idaho C4 has two campaigns)"); saidIs("National", "the national campaign", { fund: "C.A. Idaho C4" }); saidIs("Idaho", "the idaho campaign", { fund: "C.A. Idaho C4" }); n++; if (judge(action, f, "National", NEUTRAL, { fund: "Citizens Alliance C3" }) !== true) fails.push(`${action}.campaign National dropped for the C3, its only campaign`); return; }
      if (OPTION_WORDS[f.k]) { const opts = typeof f.opts === "function" ? f.opts({}) : f.opts || Object.keys(OPTION_WORDS[f.k]);
        (f.type === "bool" ? [true] : opts.filter(Boolean)).forEach(v => { unsaidIs(v); const ps = (SAID[f.k] || {})[String(v)] || []; if (!ps.length) fails.push(`no phrasings listed for ${action}.${f.k} = ${v}`); ps.forEach(l => saidIs(v, l)); }); return; }
      if (f.type === "money") { Object.entries(AMOUNTS).forEach(([v, ps]) => { unsaidIs(Number(v)); ps.forEach(l => saidIs(Number(v), "let's say " + l)); }); n++; if (judge(action, f, 25000, ["twenty thousand"]) !== false) fails.push(`${action}.${f.k} 25000 kept when the officer said twenty thousand`);
        n++; if (judge(action, f, 0, ["zero dollars", "nothing"]) !== false) fails.push(`${action}.${f.k} $0 kept`); n++; if (judge(action, f, "abc", NEUTRAL) !== false) fails.push(`${action}.${f.k} "abc" kept`); return; }
      if (f.type === "date") { unsaidIs("2026-11-05"); DATES.forEach(l => saidIs("2026-11-05", "do it " + l)); n++; if (judge(action, f, todayISO(), NEUTRAL) !== true) fails.push(`${action}.${f.k} today dropped (today is the default)`); return; }
      if (f.type === "select" || f.type === "bool") { fails.push(`${action}.${f.k} (${f.type}) has no word list and is not skipped: every value would be dropped`); }
    }));
    return { n, fails };
  }, { SAID, AMOUNTS, DATES, NEUTRAL });
  ok(r.n > 680, "too few cases ran: " + r.n); // 634 before the Oct 28 tidy-up brought the rating, $0 and interaction-report guards here
  ok(r.fails.length === 0, r.fails.length + " of " + r.n + " cases failed: " + r.fails.slice(0, 40).join(" | ")); console.log("    evidence cases judged: " + r.n);
});

};
