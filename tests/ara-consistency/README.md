# Ara consistency run

Measures how often Ara breaks her rules when talking to the real xAI Grok, not the pretend voice line the test bot uses.

- `flows.js`: the officer's side of six everyday tasks (new contact, capacity rating, interaction, plan an ask, record an ask, record a gift), taken from real calls in the activity log with names and details made up.
- `run.js`: opens the preview build in a headless browser, gives it a real Grok voice line, types the officer's lines (the app sees them as transcribed speech), answers Ara's save, substantive and "move on" questions, and scores every conversation. It never touches the app's files, the Cloudflare Worker or the activity log.
- Cost: open line minutes x $0.08 plus $0.004 per conversation item, counted as it goes. It stops itself at the budget.

Run it from GitHub: Actions > Ara consistency run > Run workflow (budget, most conversations, conversations at once, flows). The key is the repository secret `ARA_CONSISTENCY_KEY`. The rule-break table is on the run's summary page; every conversation's turns, Ara's replies, tool calls and saves are in the `ara-consistency-results` download.

## Reconnect sound clip

`record-reconnect.js` records one hands-free conversation (an interaction report) as the phone would have played it: Ara's voice, the officer's lines spoken by a second Grok voice (Rex), and the phone's own recordings. A little into the read-back the browser goes offline and the voice line closes; 13 s later the network is back, the app picks up the same conversation and Ara re-asks "Shall I save it?". The result is `results/reconnect/reconnect-clip.mp3` with a timed transcript. Run it from GitHub: Actions > Reconnect sound clip; with "commit" left at yes the clip lands in `clips/` on main, where GitHub Pages serves it. About a dollar per run.
