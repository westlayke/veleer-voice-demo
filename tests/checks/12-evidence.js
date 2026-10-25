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
  ally: { true: ["he's an ally, do not solicit", "never ask her for money"] }, dnc: { true: ["do not contact him", "no contact please"] }, permText: { true: ["texting is fine", "you can text her"] }
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
      if (f.k === "fund") { FUNDS.forEach(fd => { unsaidIs(fd); const ws = entityWords(fd).filter(w => !["citizens", "alliance"].includes(w)); saidIs(fd, "it's for the " + ws.join(" ")); }); saidIs("Citizens Alliance C3", "the c-3"); saidIs("C.A. New Hampshire C4", "the new hampshire one"); return; }
      if (f.k === "campaign") { unsaidIs("National", { fund: "C.A. Idaho C4" }, " (Idaho C4 has two campaigns)"); saidIs("National", "the national campaign", { fund: "C.A. Idaho C4" }); saidIs("Idaho", "the idaho campaign", { fund: "C.A. Idaho C4" }); n++; if (judge(action, f, "National", NEUTRAL, { fund: "Citizens Alliance C3" }) !== true) fails.push(`${action}.campaign National dropped for the C3, its only campaign`); return; }
      if (OPTION_WORDS[f.k]) { const opts = typeof f.opts === "function" ? f.opts({}) : f.opts || Object.keys(OPTION_WORDS[f.k]);
        (f.type === "bool" ? [true] : opts.filter(Boolean)).forEach(v => { unsaidIs(v); const ps = (SAID[f.k] || {})[String(v)] || []; if (!ps.length) fails.push(`no phrasings listed for ${action}.${f.k} = ${v}`); ps.forEach(l => saidIs(v, l)); }); return; }
      if (f.type === "money") { Object.entries(AMOUNTS).forEach(([v, ps]) => { unsaidIs(Number(v)); ps.forEach(l => saidIs(Number(v), "let's say " + l)); }); n++; if (judge(action, f, 25000, ["twenty thousand"]) !== false) fails.push(`${action}.${f.k} 25000 kept when the officer said twenty thousand`); return; }
      if (f.type === "date") { unsaidIs("2026-11-05"); DATES.forEach(l => saidIs("2026-11-05", "do it " + l)); n++; if (judge(action, f, todayISO(), NEUTRAL) !== true) fails.push(`${action}.${f.k} today dropped (today is the default)`); return; }
      if (f.type === "select" || f.type === "bool") { fails.push(`${action}.${f.k} (${f.type}) has no word list and is not skipped: every value would be dropped`); }
    }));
    return { n, fails };
  }, { SAID, AMOUNTS, DATES, NEUTRAL });
  ok(r.n > 150, "too few cases ran: " + r.n);
  ok(r.fails.length === 0, r.fails.length + " of " + r.n + " cases failed: " + r.fails.slice(0, 40).join(" | "));
});

};
