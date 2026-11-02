# Engineers' guide to the Citizens VCRM proof of concept

Written November 1, 2026 for engineers reading this repository for the first time. It says what the code is, how it is
organised, how a call runs, how the app guards itself against the voice service, and how to run the checks. Read it
with the three project documents: the plain-language overview (*How the Citizens VCRM Proof of Concept Works*), doc 11
(*Citizens Alliance Mobile App and Voice Integration Specification*, the behaviour the app implements and the tools Ara
is given) and *Citizens VCRM look in SpiceCRM 2025.01* (where the code goes next). The change log on the app's
Settings screen (`demo-changes.json`) records every change with who asked for it and why.

## What it is

A phone-first web app (plain HTML, CSS and JavaScript, no framework, no build step) that a gift officer talks to.
Ara, the voice assistant, is xAI's Grok realtime voice; the app gives her 42 tools that open and fill forms, look
records up and run the app's own commands. Records live in the phone's browser storage; a Cloudflare Worker holds
the xAI key and the activity log. GitHub Pages serves the app, GitHub Actions runs the checks and the harnesses.

Two copies live side by side: `preview-flow.html` with `preview/` is the only copy that is edited; `index.html` with
`app/` is the live page, written by `tools/publish.sh live` at a go-live and never by hand. Release 1.0 is tag `v1.0`
(branch `release-1.0`, notes in `docs/release-1.0.md`).

## The files, in load order

The files share one scope: a later file can use anything an earlier one defines, so the order below is the dependency
order.

| File | What it holds |
|---|---|
| `app.css` | All styles. Theme classes (`spooky`, `xmas`) on the page switch colours. |
| `core.js` | Settings, example data, saved data and its numbered upgrade steps (`MIGRATIONS`), dates and amounts spoken (`dateSaid`, `spokenAmount`). |
| `lists.js` | One list module: the entities (`ENTITIES`, `ENTITY_STATE`), campaigns and every pick-list with the words officers use for them (`LIST_WORDS`); `listMatch`, `listTake`, `listHeard`, `wordsForList`. |
| `drafts.js` | Finding contacts, draft forms (`ACTIONS`: fields, labels, options per form), prefill, saves and their History lines. |
| `validate.js` | The evidence rule: `fieldEvidence` decides, for every value Ara sends, whether the officer's own words support it; `optionAnswered`, `fieldSaidIn`, `appYes`, `hfYes`. |
| `voice.js` | The conversation: `grokInstructions()` (Ara's rules as Markdown sections), `TOOLS` (the draft tools) and the other tool definitions, audio in and out, the WebSocket events, `recent()` (the last lines said), `askedBefore()`. |
| `voiceline.js` | Keeping the line alive: timings at the top of the file, `warmLine` (a socket opened on touch), `openSocket`, line tests (`pingMs`), stalls, `reconnect`, `forceSay` (a scripted line in Ara's voice), `forceTick` (the 4 s check after one), the quiet hang-up. |
| `heard.js` | Whether Ara's line was heard: three readings per line (words, sound, played out), the resend of a line that came without sound, the late-copy watch. |
| `machine.js` | The call's one state machine (XState 5, in `vendor/`): five parallel parts (line, officer, Ara, form, the one check waiting on Ara). The app sends every event (`smSend`) and reads the picture through `lineState()`, `araState()`, `officerState()`, `formState()`, `checkNow()`. |
| `aratools.js` | What the app does for each tool call (`onTool`), the reply it sends Ara (`toolReply`: status, guidance, the exact question to ask), the guards that refuse a call, the pick-list fill from the answer to the question just asked. |
| `voiceforms.js` | Field questions (`REQ_Q`, `campaignQ`, `oneOfQuestion`), optional fields one at a time, hands-free saves (`hfSave`, `hfYesHeard`), read-backs, the saved line, `formPosition()` (where a form stands after a drop), `nudgeAra`. |
| `provider.js` | The OpenAI Realtime and Gemini Live engines, selectable on the preview's Settings for comparison. Grok runs the proof of concept. |
| `screens.js` | Screens, lists, the Opportunities board, the computer layout at 1000 px and wider, phone calls, task statuses, Settings. |
| `guide.js` | The process overview and the Process FAQ Ara answers from. |
| `start.js` | Start-up, the update banner, themes, visitors and sounds. |

`worker/token-worker.js` is the Cloudflare Worker: `POST /` swaps the page's code word for a 30-minute xAI pass,
`POST /log` stores activity events in D1 (indexed by time and device, purged daily after 90 days), `/activity` shows
them behind a password. A push that changes it deploys it through `deploy-worker.yml`.

## How a call runs

1. **Touch.** `warmLine` opens a socket and sends Ara's configuration before the tap lands. The tap starts the mic;
   the officer's audio streams up, Ara's audio streams down. Hands-free mode is on from the start.
2. **Words.** The service transcribes the officer; `recent()` keeps the last eight lines of both sides, which every
   evidence check reads. Ara calls a tool as soon as she knows the task.
3. **A tool call** reaches `onTool` in `aratools.js`. The app opens or fills the form, runs the evidence rule on every
   value (a value the officer never said is dropped and named back to Ara), decides the next question, and answers
   with `toolReply`: a status line, guidance for Ara's next reply and, where the question is one of the app's own
   scripted lines, the exact text.
4. **Questions.** New questions since November 1 go to Ara as guidance ("ask exactly: …") with a check: the app
   watches her reply and nudges once if she does not ask. Older form questions and the read-back are scripted lines
   the app speaks in Ara's voice through `forceSay`; `forceTick` tests the line 4 s later and `heard.js` decides
   whether the line was heard.
5. **The save.** The app reads the form back and takes the officer's own spoken yes (`hfYesHeard`), with a second
   check on an amount; Ara's `save_form` is only a backup and is refused after a save by words. The app sends Ara her
   state (saves so far, the open form, a version) and waits for the service's receipt.
6. **Trouble.** A dropped or silent line goes through `reconnect`: a second line alongside after 5 s, recorded lines
   while down, the pass reused, and on pickup Ara is asked to say where we were herself (the pending question from
   `formPosition`), with a check. The app hangs up only after 10 minutes with no signal. All of this is written up in
   `docs/voice-line.md`.

## The guards, and why they exist

Every guard answers a real call. The comment beside it names the call ("9:30 PM call, Nov 1") and the check that
replays it carries the same name, so `git log -S` or a search for the date finds the three together: the log, the
code, the check.

- **The evidence rule** (`validate.js`): the voice model fills forms from what it believes, not what it heard. Every
  value must be backed by the officer's words; the question just asked is the evidence for a pick-list answer. Ratings
  and entities are never invented. A state said as part of an entity's name is not its campaign (`wordsForList`).
- **One yes, one save** (`voiceforms.js`): the officer's yes to the read-back saves; a replayed or late `save_form`
  is refused (`aratools.js`, the replay guard and the "save_form after a save by words" guard).
- **Scripted lines** (`voiceline.js`, `heard.js`): the app can speak a line in Ara's voice, but the service may play
  it late, twice, or not at all. `forcedEvent` matches the reply to the line by id, then by words; a late copy is cut;
  a line with no sound after 15 s is asked for once more. A new scripted line stands the late-copy watch down.
- **The line** (`voiceline.js`): a line test is a small web request to the Worker; a slow test alone does not reconnect
  a line that has carried messages since the scripted line went.
- **The state machine** (`machine.js`): the one truth about the line, the officer, Ara, the form and the pending check.
  Earlier flags on `G` are being folded into it; new code reads the machine, not the flags.

Rules that must not be broken, each learned the hard way: never set `navigator.audioSession` (it silenced Ara on
iPhone); never use `speechSynthesis` (an iOS dialog ends the call); never prefetch recorded lines at call start;
never commit a key (the xAI key exists only as a Worker secret); keep real names and emails out of tests and change
rows (the repository is public).

## Checks and harnesses

- **The test bot**: `cd tests && JOBS=4 node bot.js` runs the 170 checks in `tests/checks/` (one file per area) with
  a stand-in voice line; no xAI cost; about four minutes. `ONLY="words"` runs the checks whose names contain the words;
  `PAGE=index.html` runs the live page. Every bug fix adds a check named after the call that found it before the fix
  is built. The check "Scripted line (5:59 PM call, Oct 29)" is timing-sensitive under load and passes alone.
- **Patient Pat** (`patience.yml`, `tests/patience/`): a stand-in officer with the patience measured on real calls
  talks through every form on up to 20 machines while drops, dead spots, stalls and soundless lines are thrown in;
  scores "are you there?" asks per 10 minutes, saves, hang-ups, and the share of app scripted lines per step.
- **Real Ara** (`ara-consistency.yml`, `tests/ara-consistency/`): the same stand-in officer against the live xAI
  service under a dollar budget (about 50 cents a conversation), with injected faults; scores every conversation
  (task saved, nothing invented, substantive asked, state honoured) and, with `diag=1`, keeps the event timeline.
- **Testing Terry** (`tests/harness/`): one journey from new contact to Closed Won with one fault before each save.

## Working on it

1. Read the call log (the Worker's `/activity` page, or the D1 table by session) and write the plan: cause, fix, how
   it will be checked. The fix is built only after the plan is agreed.
2. Add the check first, in the file for its area, named after the call. Make Ara ask any new question (guidance plus
   a check), never a new scripted line.
3. Edit `preview/` only; run the affected checks (`ONLY=`), then the whole suite; run `node tools/lint-comments.js`.
4. Review the change for reuse, simplicity and correctness, and report the size: `cat preview/*.js | wc -l` and the
   count of `G.*` flags. Do not refactor beyond the change without agreement.
5. Add a row to `demo-changes.json` (change, area, who asked, why), `bash tools/publish.sh preview`, commit with the
   trailers `Requested-by:`, `Reason:` and `Conversation:` (template in `.gitmessage`), push. The live page changes only
   on "make it live", after the suite passes on the live page too and a Patient Pat and a real Ara run on the build.

## Where it goes next

The plan (option D in *Citizens VCRM look in SpiceCRM 2025.01*) wraps this app as a SpiceCRM custom module for gift
officers, calling SpiceCRM's REST API with the officer's session. The first code step is a data module: one file
between the screens and the records, so pointing the app at SpiceCRM later changes only that file. The xAI pass and
the combined lookups become small endpoints on the SpiceCRM server, replacing the Worker.
