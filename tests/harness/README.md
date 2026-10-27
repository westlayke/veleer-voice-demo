# Testing Terry's walks (error-condition harness)

A stand-in Grok walks one journey through the app, from a new contact to a gift that closes the opportunity Closed Won, with
the officer's words taken from Carverhill's real calls (names and details made up). Before each of the seven saves, one fault
is thrown at one field of that step, and the walk carries on, so each walk reads like one of his driveway calls. The officer
is "Testing Terry".

- `journey.js`: the seven steps (new contact, opportunity, interaction report, Move to Cultivation, planned ask, the ask, gift),
  each as the officer's lines with the tool the stand-in Grok calls for them.
- `run.js`: the runner, the faults (`FAULTS`: a line drop, slow Grok, Grok stopping, a slow line, a stalled line, a doubled
  reply, a scripted line that never plays, words without voice, a phone lock, the mic ending, an answer sent twice, an
  invented field, a Grok error event, a slow voice pass, a slow app voice) and the report. One walk per fault; the field hit rotates by step.
  A fault that can't happen on a step (no scripted line in that turn, nothing to invent on that form) is marked n/a and counts as clean.
- Each step's record keeps the app's own voice log (`vlog`) as well as the activity log, so a watchdog that didn't fire can be explained.
- The microphone is silent (Chromium's fake mic beeps, which read as the officer talking over the app's lines) and the stand-in officer answers a scripted question only after the app has said it. On a GitHub runner there is no speaker, so "the phone produced no sound from it (speaker level 0.000)" notes on the app's own lines are expected there, not findings.
- Each save is checked: saved exactly once, the form closed, the fault's expected handling in the log.
- Output in `results/`: `report-<stamp>.md` (findings table, the failing steps' logs, every walk's full log) and the JSON.

Run it from GitHub: Actions > Testing Terry's walks > Run workflow. With `log` = real the walks' log rows reach the activity
page under the name Testing Terry; with report they stay in the report. Locally: `node tests/harness/run.js`
(`FAULTS=drop,slow` for some faults, `JOBS=4` walks at once, `LOG=real` to use the published preview page and its log).
No xAI calls are made, so a run costs nothing.
