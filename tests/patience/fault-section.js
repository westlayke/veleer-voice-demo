// What each kind of fault cost the officer (Oct 31): how often it was thrown, and the "Are you there?" asks in the 30 s after it
function faultSection(convs) {
  const kinds = {}; convs.forEach(c => (c.faults || []).forEach(f => { const k = kinds[f.fault] = kinds[f.fault] || { thrown: 0, convs: new Set(), asks: 0, hit: 0 }; k.thrown++; k.convs.add(c.n + "/" + c.seed);
    const after = (c.asks || []).filter(a => a.at >= f.at && a.at - f.at <= 30000).length; k.asks += after; if (after) k.hit++; }));
  if (!Object.keys(kinds).length) return [];
  return ["## What each fault cost", "", "| Fault | Thrown | Conversations | Followed by an ask within 30 s | Asks within 30 s |", "|---|---|---|---|---|",
    ...Object.entries(kinds).sort((a, b) => b[1].thrown - a[1].thrown).map(([k, v]) => `| ${k} | ${v.thrown} | ${v.convs.size} | ${v.hit} (${Math.round(100 * v.hit / v.thrown)}%) | ${v.asks} |`), ""];
}
module.exports = { faultSection };
