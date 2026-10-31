// Combine the convs-*.json files of several Patient Pat runs (one per machine) into one summary: node tests/patience/combine.js <dir>
const fs = require("fs"), path = require("path");
const dir = process.argv[2] || path.join(__dirname, "results");
const files = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/^convs-.*\.json$/.test(f)) files.push(p); } })(dir);
const runs = files.map(f => Object.assign({ file: f }, JSON.parse(fs.readFileSync(f, "utf8"))));
const convs = runs.flatMap(r => (r.convs || []).map(c => Object.assign({ seed: r.seed, rate: r.rate }, c)));
const mins = Math.round(convs.reduce((a, c) => a + (c.minutes || 0), 0) * 10) / 10, asks = convs.flatMap(c => c.asks || []), per10 = mins ? Math.round(asks.length / mins * 100) / 10 : 0;
const by = {}; asks.forEach(a => { by[a.cause] = (by[a.cause] || 0) + 1; });
const sil = asks.map(a => a.silence).sort((a, b) => a - b), med = sil.length ? sil[Math.floor(sil.length / 2)] : 0;
const faults = convs.flatMap(c => c.faults || []), fby = {}; faults.forEach(f => { fby[f.fault] = (fby[f.fault] || 0) + 1; });
const out = [`# Patient Pat, combined: ${runs.length} run(s), ${convs.length} conversations, ${mins} minutes, fault rate ${[...new Set(runs.map(r => r.rate))].join("/")}`, "",
  `**${asks.length} asks: ${per10} per 10 minutes.** Median silence before an ask ${med} s, longest ${Math.max(0, ...sil)} s. ${convs.filter(c => c.closedWon).length} of ${convs.length} reached Closed Won; ${convs.filter(c => c.hungUp).length} hung up after three asks. ${faults.length} faults thrown.`, "",
  "| Cause | Asks | Per 10 min | Median silence |", "|---|---|---|---|",
  ...Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => { const s = asks.filter(a => a.cause === k).map(a => a.silence).sort((a, b) => a - b); return `| ${k} | ${v} | ${mins ? Math.round(v / mins * 100) / 10 : 0} | ${s[Math.floor(s.length / 2)]} s |`; }), "",
  "| Fault | Thrown |", "|---|---|", ...Object.entries(fby).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`), "",
  "| Seed | Conversations | Minutes | Asks | Per 10 min | Closed Won | Hung up |", "|---|---|---|---|---|---|---|",
  ...runs.map(r => { const cs = r.convs || [], m = cs.reduce((a, c) => a + (c.minutes || 0), 0), n = cs.reduce((a, c) => a + (c.asks || []).length, 0); return `| ${r.seed} | ${cs.length} | ${m} | ${n} | ${m ? Math.round(n / m * 100) / 10 : 0} | ${cs.filter(c => c.closedWon).length} | ${cs.filter(c => c.hungUp).length} |`; }), ""];
const { stateSection } = require("./state-section.js");
const { stepsLines } = require("../steps.js");
const { faultSection } = require("./fault-section.js");
console.log(out.concat(faultSection(convs), ["## Discrete steps and the app's scripted lines", "", ...stepsLines(convs), ""], stateSection(convs)).join("\n"));
