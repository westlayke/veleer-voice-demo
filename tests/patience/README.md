# Patient Pat's calls: the "are you there?" harness

`run.js` has a stand-in officer, Patient Pat, talk to a stand-in voice service through the app's own code on `preview-flow.html`, from a new contact to a gift (Closed Won). Pat's patience is drawn from the 45 silences Jim sat through before saying "are you there?" on Oct 27-28 (2.6 to 37.4 s, median 9.9 s). Faults are thrown at Jim's measured rates: a dropped line (a third of them dead spots where the voice pass hangs 10-70 s), a stalled line, a reply that takes 10-25 s to start, a line that arrives as words without sound, a slow-line test. Every time Pat asks "Are you there?" the harness notes the silence, what the app was doing (reply requested and none started, scripted line not started, line down, silent after a reconnect, no question asked) and the open form. No xAI calls: a run costs nothing.

Run locally: `CONVS=10 RATE=0 JOBS=8 node tests/patience/run.js` (baseline, no faults), `CONVS=30 RATE=1 JOBS=8 SEED=2 node tests/patience/run.js` (Jim's rates). `RATE=2` is twice as rough. `DEBUG=1` prints each conversation's lines and the app's log. Reports land in `results/report-<stamp>.md` with the conversations in `convs-<stamp>.json`; `node tests/patience/combine.js <dir>` sums several runs.

From GitHub Actions: "Patient Pat's calls" (inputs: conversations per machine, machines, rate, jobs); each machine gets its own seed and the last job combines them into the run summary.

Timers run at real speed (a conversation is 5-10 minutes), so the batches run in parallel: 8 conversations per machine, several machines at once.

The score is asks per 10 minutes, by cause. A change to the app's timers (the 4 s "taking a moment" tick, the 8 s scripted-line fallback, the reconnect clock) is judged by rerunning with the same seeds and comparing.
