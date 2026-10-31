// What each kind of fault cost the officer (Oct 31): how often it was thrown, and the "Are you there?" asks in the 30 s after it
function faultSection(convs) {
  const kinds = {}; convs.forEach(c => (c.faults || []).forEach(f => { const k = kinds[f.fault] = kinds[f.fault] || { thrown: 0, convs: new Set(), asks: 0, hit: 0 }; k.thrown++; k.convs.add(c.n + "/" + c.seed);
    const after = (c.asks || []).filter(a => a.at >= f.at && a.at - f.at <= 30000).length; k.asks += after; if (after) k.hit++; }));
  if (!Object.keys(kinds).length) return [];
  return ["## What each fault cost", "", "| Fault | Thrown | Conversations | Followed by an ask within 30 s | Asks within 30 s |", "|---|---|---|---|---|",
    ...Object.entries(kinds).sort((a, b) => b[1].thrown - a[1].thrown).map(([k, v]) => `| ${k} | ${v.thrown} | ${v.convs.size} | ${v.hit} (${Math.round(100 * v.hit / v.thrown)}%) | ${v.asks} |`), ""];
}
module.exports = { faultSection };
// How often the entity question came back, by the entity Pat named (Oct 31: "National C4" was asked 15 times in a real call)
function entitySection(convs) {
  const by = {}; convs.forEach(c => { if (!c.entity) return; const e = by[c.entity] = by[c.entity] || { convs: 0, asked: 0, most: 0, stuck: 0, saved: 0 };
    e.convs++; e.asked += c.entityAsks || 0; e.most = Math.max(e.most, c.entityAsks || 0); if ((c.entityAsks || 0) >= 4) e.stuck++; if (c.closedWon) e.saved++; });
  if (!Object.keys(by).length) return [];
  return ["## The entity question, by the entity Pat named", "", "Each answer uses the spoken name. More than one ask per form means the app did not take the answer.", "",
    "| Entity Pat said | Conversations | Times asked | Most in one conversation | Conversations asked 4+ times | Reached Closed Won |", "|---|---|---|---|---|---|",
    ...Object.entries(by).sort((a, b) => b[1].most - a[1].most).map(([k, v]) => `| ${k} | ${v.convs} | ${v.asked} | ${v.most} | ${v.stuck} | ${v.saved} |`), ""];
}
module.exports.entitySection = entitySection;
