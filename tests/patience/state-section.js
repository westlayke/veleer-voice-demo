// Ara's state sync and the guards (Carverhill, Oct 29): receipts, misses, stale save_form calls thrown and recovered, guards fired, lines said twice
function stateSection(convs) {
  const ss = convs.map(c => c.sync).filter(Boolean); if (!ss.length) return [];
  const sum = (k) => ss.reduce((a, s) => a + (s[k] || 0), 0), meds = ss.map(s => s.medianMs).filter(Boolean).sort((a, b) => a - b);
  const guards = {}, after = sum("guardsAfterReceipt"); ss.forEach(s => Object.entries(s.guards || {}).forEach(([k, v]) => { guards[k] = (guards[k] || 0) + v; }));
  const stale = ss.flatMap(s => s.staleSaves || []), rec = stale.filter(x => x.recovered).length, byWhy = {}; stale.forEach(x => { byWhy[x.why] = (byWhy[x.why] || 0) + 1; });
  const wo = ss.flatMap(s => s.wordsOnly || []);
  const ends = {}; convs.forEach(c => { const k = c.closedWon ? "reached Closed Won" : c.ended || "unknown"; ends[k] = (ends[k] || 0) + 1; });
  return ["## How each conversation ended", "", "| Ending | Conversations |", "|---|---|", ...Object.entries(ends).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k.replace(/\|/g, "/")} | ${v} |`), "",
    "## Ara's state sync", "", `State updates sent ${sum("sent")}, confirmed ${sum("confirmed")} (median receipt ${meds.length ? meds[Math.floor(meds.length / 2)] : 0} ms, slowest ${Math.max(0, ...ss.map(s => s.maxMs))} ms), receipts lost by the stand-in service ${sum("lostReceipts")}, missed by the app ${sum("missed")}, resent ${sum("resent")}.`, "",
    `Tool calls the stand-in Grok skipped (words only) ${wo.length}, recovered by the app's ask ${wo.filter(x => x.recovered).length} (${[1, 2, 3].map(k => "on ask " + k + ": " + wo.filter(x => x.on === k).length).join(", ")}), still missing ${wo.filter(x => !x.recovered).length}; asks the app sent with no tool missing ${sum("falseNudges")}.`, "",
    `Stale save_form calls thrown ${stale.length} (${Object.entries(byWhy).map(([k, v]) => k + " " + v).join(", ") || "none"}), recovered by the app's routing ${rec}. Lines said twice ${sum("linesTwice")}.`, "",
    "| Guard | Fired | After a confirmed receipt |", "|---|---|---|", ...Object.entries(guards).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} | |`), `| all guards | ${Object.values(guards).reduce((a, b) => a + b, 0)} | ${after} |`, "",
    ...contextSection(ss)];
}
// where we were after a drop with no form open, and after a late yes (Carverhill, Oct 30): who said it, on which try, how long the officer waited, what they heard
function contextSection(ss) {
  const cs = ss.map(s => s.ctx).filter(Boolean); if (!cs.length) return [];
  const mode = cs[0].mode || "ara", asks = cs.flatMap(c => c.asks || []), heard = cs.flatMap(c => c.heard || []), rows = cs.flatMap(c => c.rows || []);
  const n = (re) => rows.filter(r => re.test(r)).length, by = (k) => asks.filter(a => a.kind === k);
  const secs = heard.map(h => h.secs).filter(x => x != null).sort((a, b) => a - b), med = secs.length ? secs[Math.floor(secs.length / 2)] : null;
  const line = (k) => { const a = by(k); return `${k}: asked ${a.length}, said right on try 1: ${a.filter(x => x.on === 1).length}, try 2: ${a.filter(x => x.on === 2).length}, try 3: ${a.filter(x => x.on === 3).length}, never (the app's line): ${a.filter(x => !x.done).length}; misses drawn: bare ${a.reduce((m, x) => m + x.misses.filter(y => y === "bare").length, 0)}, stale ${a.reduce((m, x) => m + x.misses.filter(y => y === "stale").length, 0)}`; };
  return ["## Coming back after a drop (where we were)", "", `Mode: **${mode === "app" ? "the app says where we were (scripted line)" : "Ara says where we were (the app checks her reply and asks again)"}**.`, "",
    `Drops with no form open ${heard.length}; the officer heard where we were ${heard.filter(h => h.text && !h.bare).length} times, a bare "what would you like to do?" ${heard.filter(h => h.bare).length} times, nothing ${heard.filter(h => !h.text).length} times; median wait from the line coming back to hearing it ${med == null ? "n/a" : med + " s"}${secs.length ? ", slowest " + secs[secs.length - 1] + " s" : ""}.`, "",
    ...(mode === "app" ? [] : [line("reconnect"), "", line("late-yes"), "", `The app checked Ara's reply ${n(/^Ara said where we were|^Ara's reply .*asked again|^Ara didn't say where we were/)} times: passed ${n(/^Ara said where we were/)}, asked again ${n(/asked again for where we were/)}, fell back to its own line ${n(/the app says it itself/)}, stood down for the officer ${n(/stands down/)}.`]), ""];
}
module.exports = { stateSection };
