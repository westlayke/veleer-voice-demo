# Veleer voice demo

A click-through phone demo of Veleer: one investor goes from new contact to recorded pledge in a two-way voice conversation with Grok (xAI). Grok asks for anything missing and puts each draft on screen; nothing is saved until the officer taps Save.

The xAI API key is never stored in this repository. Enter it in Settings (the gear), or open the page once with `#xai=YOUR_KEY` added to the address; it is then kept in that browser only. Restart the demo from Settings.

## How changes are tracked

Every change to the demo is a commit here, so any earlier version can be seen or restored. Changes are requested in the Citizens Alliance project, shown first in the preview (`preview-flow.html`), and copied to the live page (`index.html`) only when someone says "make it live".

Each commit message ends with these lines (template in `.gitmessage`):

```
Requested-by: <name of the person who asked, from their message in the project>
Reason: <why they want it, in their words>
Approved-for-live-by: <name, on Go live commits only>
Conversation: <link to the project conversation>
```

GitHub shows the repository owner as the author of every commit; the person who asked is the "Requested-by" line. The same who, when and why also goes in the Voice demo change log document.

To list the history with who asked and why: `git log --format='%ad %s%n%(trailers:key=Requested-by,key=Reason,key=Approved-for-live-by)' --date=format:'%Y-%m-%d %H:%M'`

## How it works

A plain-language overview with a diagram, for anyone (not just developers): [How the Citizens VCRM Demo Works](https://claude.ai/artifact/R9ZhVgW5zeRsFo8uoX387s).

- **The app** is a static web page (HTML, CSS, JavaScript, no framework or build step), served by GitHub Pages. All demo data is kept in the phone's `localStorage` under `veleer-voice-demo-v1`, with a `dataVersion` and numbered upgrade steps (`MIGRATIONS` in `core.js`).
- **Voice** is xAI's Grok realtime API (`wss://api.x.ai/v1/realtime?model=grok-voice-latest`, voice Ara). The app sends Ara's instructions once per call (`grokInstructions` in `voice.js`), a summary of the phone's data, and about 35 tool definitions (`TOOLS`). Ara's tool calls arrive in `onTool`: lookups and app actions are in `TOOL_HANDLERS` (`aratools.js`), and form tools go through `draftTool`. After a save or a screen change the app sends a short "Right now" note instead of resending the instructions.
- **The key holder** is the Cloudflare Worker in `worker/token-worker.js` (secrets `XAI_API_KEY`, `DEMO_CODE`, `ADMIN_PASSWORD`). `POST /` checks the page's Origin and the `X-Demo-Code` header, then returns a five-minute xAI client secret. `POST /log` stores activity events in the D1 database `veleer-activity` (table `events`, kept 90 days). `/activity` shows them behind Basic auth. Pushing changes under `worker/` deploys it through `.github/workflows/deploy-worker.yml`.
- **Hands-free mode** (for driving): Ara may save a form after reading it back and hearing a clear yes (money gets a second yes on the amount). Saves are marked in History and wait in Needs attention under "Check your hands-free saves", where each one links to where it can be fixed. Code in `voiceforms.js`; rules in `HF_RULES`.
- **Themes**: spooky mode (October; `SPOOKY_RULES`) and Christmas mode (any time, white with evergreen and red; `XMAS_RULES`), one at a time. Visitors, sounds and the tap-me owl or Santa are in `start.js`. How to build a theme: [Theme guide](https://claude.ai/artifact/JApoF1GJZBUaTw6zWdKYsj). Never set `navigator.audioSession`: it silenced Ara on iPhone.
- **Sound files** (`sounds/`): Santa's "Merry Christmas, ho ho ho" (Pixabay, freesound_community) and sleigh bells (Pixabay, Dragon Studio), both under the Pixabay Content License, the skeleton visitor's laugh and full line (`skeleton-laugh.mp3`, `skeleton.mp3`, ElevenLabs recordings sent by Carverhill), and the call's own status lines (`line-dropped.mp3`, `still-trying.mp3`, `line-back.mp3`, `ara-slow.mp3`: recorded in Ara's voice with xAI text-to-speech by the "Record Ara's lines" workflow from `tools/ara-lines.json`; the phone's built-in speech is never used); the other sounds are made in code.
- **Nothing secret is in this repository.** The xAI key exists only as a Cloudflare secret. The demo code is built into the page on purpose, so the plain link works.

## Files

The page itself is short. Its styles and code are in a folder beside it, split by topic and loaded in this order (they share one scope, so a later file can use anything an earlier one defines):

- `preview/` is the preview's copy, used by `preview-flow.html`; `app/` is the live copy, used by `index.html`. Change only `preview/`.
- `app.css` styles; `core.js` lists, settings, example data and saved data (with its numbered upgrade steps); `drafts.js` finding contacts, draft forms and saves; `voice.js` the conversation with Ara (instructions, tool definitions, audio, events); `voiceline.js` keeping the voice line alive (voice passes, reconnects, line tests, stall and quiet detection, asking Grok again; all timings at the top); `aratools.js` what the app does for each of Ara's tools; `voiceforms.js` optional fields one at a time, hands-free saves and the check of hands-free saves; `screens.js` screens, phone calls and task statuses; `guide.js` the process overview and Process FAQ; `start.js` updates and start-up.

How the voice line survives a dead spot (the signals, the reconnect loop, the phone's spoken lines, picking the form up where it was) is written up in [docs/voice-line.md](docs/voice-line.md).

To publish: `tools/publish.sh preview` stamps the preview with the time, and `tools/publish.sh live` copies the preview to `index.html` and `app/`. Run the test bot after either one, and commit only when every check passes.

## Test bot

`tests/bot.js` (with its checks in `tests/checks/`, one file per area: first visit, moving around, forms, tasks, Settings, saved data, opportunities, voice, hands-free, replays, live page) taps through the app like a person (screens, back buttons, typed forms, task statuses, Settings) and plays Ara's side of a conversation with a pretend voice line, so it never calls xAI. Run it with `node tests/bot.js` (preview) or `PAGE=index.html node tests/bot.js` (live). GitHub runs it on every push to main and every morning (Actions tab, "Test bot"); failures save screenshots.
