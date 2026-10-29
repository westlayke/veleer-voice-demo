# Call-start timing harness

Measures how long xAI takes from an open voice line to Ara's first sound, and which part of the session setup costs it. Standalone: no app and no phone in the loop.

1. `node tests/call-start/dump.js` opens the app in a headless browser, signs in as Dana and writes the exact `session.update` messages the app sends when a line opens, plus the scripted greeting, to `config.json`.
2. `CALLS=8 node tests/call-start/run.js` (needs `ARA_CONSISTENCY_KEY`) opens real lines, one variant after another, and times session.created, the last session.updated, and the greeting to the first sound. Variants: none, instr, tools, full (as the app today), merged (one update), early (greeting `EARLY_MS` after the configuration, as if sent on the warmed line while the phone opens its mic), slim (shorter tool descriptions).
3. The table lands in `results/report-<stamp>.md` and in the job log after `TABLE`.

GitHub Actions: workflow "Call start timing" (inputs calls, variants, jobs, early_ms). `FAKE=1 FAKE_URL=ws://127.0.0.1:8765 node tests/call-start/run.js` runs against `fake.js` (needs the `ws` package) for free.
