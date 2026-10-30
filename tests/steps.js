// Discrete steps completed and the app's scripted lines, counted in the page from the app's own log (ACT.q) and what it sent the voice service (window.__sent):
// Carverhill, Oct 30 2026: every harness readout reports how many discrete steps were completed (form opened or filled, optional field, read-back, save,
// lookup or command) and how many app scripted lines other than read-backs were fired, as a number and as a share of the steps.
// Evaluated in the page by both harnesses (Patient Pat keeps window.__sent itself; the real-Ara run's send tap fills it).
const stepsInPage = () => {
  const rows = window.__acts || [], parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } }; /* every act row of the call (the app posts ACT.q to the key holder and empties it): both harnesses keep window.__acts from their act() wrapper */
  const sent = (window.__sent || []).map(s => typeof s === "string" ? parse(s) : s).filter(Boolean);
  const outs = sent.filter(e => e.item && e.item.type === "function_call_output").map(e => parse(e.item.output) || {});
  const calls = rows.filter(a => a.role === "step" && /^[a-z_]+ \{/.test(a.text)).map(a => a.text.match(/^([a-z_]+) (\{[\s\S]*\})$/)).filter(Boolean).map(m => ({ name: m[1], args: parse(m[2]) || {} }));
  calls.forEach((c, i) => { c.refused = !!(outs[i] && outs[i].ok === false); }); /* the app answers every call in order; a refused one (a guard) completed nothing */
  const ok = calls.filter(c => !c.refused);
  const forms = ok.filter(c => /^show_/.test(c.name)).length, optional = ok.filter(c => c.name === "optional_fields" && /^(answer|skip)$/.test(c.args.step || "")).length;
  const readBacksAsked = ok.filter(c => c.name === "save_form" && c.args.confirmed === false).length, saves = rows.filter(a => a.role === "form").length; /* one form row per save, by tool or by the officer's yes */
  const other = ok.filter(c => !/^show_|^optional_fields$|^save_form$/.test(c.name)).length;
  const forced = sent.filter(e => e.item && e.item.type === "force_message").length, readBacks = outs.filter(o => o.read_back).length; /* each read_back reply is followed by one scripted read-back line */
  const steps = forms + optional + readBacksAsked + saves + other;
  return { steps: { total: steps, forms, optional, readBacksAsked, saves, other }, scripted: { total: forced, readBacks, other: Math.max(0, forced - readBacks) } };
};
// the report lines, from the per-conversation counts
function stepsLines(convs) {
  const t = { total: 0, forms: 0, optional: 0, readBacksAsked: 0, saves: 0, other: 0 }, s = { total: 0, readBacks: 0, other: 0 };
  convs.forEach(c => { const x = c.steps; if (!x) return; Object.keys(t).forEach(k => { t[k] += x.steps[k] || 0; }); Object.keys(s).forEach(k => { s[k] += x.scripted[k] || 0; }); });
  const pct = t.total ? Math.round(1000 * s.other / t.total) / 10 : 0;
  return [`Discrete steps completed: ${t.total} (forms opened or filled ${t.forms}, optional fields ${t.optional}, read-backs requested ${t.readBacksAsked}, saves ${t.saves}, lookups and commands ${t.other}).`,
    `App scripted lines other than read-backs: ${s.other} (${pct}% of the steps); read-backs spoken ${s.readBacks}; scripted lines in all ${s.total}.`];
}
module.exports = { stepsInPage, stepsLines };
