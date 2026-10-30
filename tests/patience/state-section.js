// Ara's state sync and the guards (Carverhill, Oct 29): receipts, misses, stale save_form calls thrown and recovered, guards fired, lines said twice
function stateSection(convs) {
  const ss = convs.map(c => c.sync).filter(Boolean); if (!ss.length) return [];
  const sum = (k) => ss.reduce((a, s) => a + (s[k] || 0), 0), meds = ss.map(s => s.medianMs).filter(Boolean).sort((a, b) => a - b);
  const guards = {}, after = sum("guardsAfterReceipt"); ss.forEach(s => Object.entries(s.guards || {}).forEach(([k, v]) => { guards[k] = (guards[k] || 0) + v; }));
  const stale = ss.flatMap(s => s.staleSaves || []), rec = stale.filter(x => x.recovered).length, byWhy = {}; stale.forEach(x => { byWhy[x.why] = (byWhy[x.why] || 0) + 1; });
  return ["## Ara's state sync", "", `State updates sent ${sum("sent")}, confirmed ${sum("confirmed")} (median receipt ${meds.length ? meds[Math.floor(meds.length / 2)] : 0} ms, slowest ${Math.max(0, ...ss.map(s => s.maxMs))} ms), receipts lost by the stand-in service ${sum("lostReceipts")}, missed by the app ${sum("missed")}, resent ${sum("resent")}.`, "",
    `Stale save_form calls thrown ${stale.length} (${Object.entries(byWhy).map(([k, v]) => k + " " + v).join(", ") || "none"}), recovered by the app's routing ${rec}. Lines said twice ${sum("linesTwice")}.`, "",
    "| Guard | Fired | After a confirmed receipt |", "|---|---|---|", ...Object.entries(guards).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} | |`), `| all guards | ${Object.values(guards).reduce((a, b) => a + b, 0)} | ${after} |`, ""];
}
module.exports = { stateSection };
