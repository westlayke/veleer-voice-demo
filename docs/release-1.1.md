# Release 1.1 (the Nov 1, 9:34 PM ET build)

The first production release since 1.0 (Oct 27, 4:22 PM ET live page). Put live on Nov 1, 2026 at Carverhill's word
("Run the pat and ara tests, and if they pass, put 1.1 live") after the 168-check suite on the live page (two checks are preview-only), a Patient Pat run (41383713161: 100 conversations, 4.2 asks per 10 minutes, 91 Closed Won)
and a real-Ara run (41383716090: 20 conversations, 19 saved) on this build. 117 change-log rows between 1.0 and 1.1 (`demo-changes.json`, Oct 27 5:10 PM to Nov 1
9:34 PM); the app's Settings screen lists them with who asked and why.

| What | Where |
|---|---|
| Build stamp | Nov 1, 9:34 PM ET (`version.json` and `BUILD` in `app/core.js`) |
| Commit | `dcd7fc6` ("Go live: release 1.1 (Hey Ara start-up address stays preview-only)"), Nov 2 04:10 UTC |
| Git tag | `v1.1` (annotated, made by the "Tag a release" workflow) |
| Branch for fixes to 1.1 | `release-1.1` (starts at the tag) |
| Source archive | https://github.com/westlayke/veleer-voice-demo/archive/refs/tags/v1.1.zip |
| Release zip | attached to the GitHub Release by "Bundle a release" (`citizens-vcrm-release-1.1.zip`: repository at the tag, this note, a read-me) |
| Live page files | `index.html`, `version.json`, `app/` (14 files: `app.css`, `core.js`, `lists.js`, `drafts.js`, `validate.js`, `voice.js`, `voiceline.js`, `heard.js`, `machine.js`, `aratools.js`, `voiceforms.js`, `provider.js`, `screens.js`, `guide.js`, `start.js`, plus `vendor/` for XState and `sounds/`) |
| Left out of the live copy | the "Hey Ara" start-up address: no "Start by voice" Settings section (`app/guide.js`) and no `callLink()` call at start-up (`app/start.js`); preview-only, as since Oct 26 |
| Worker | `worker/token-worker.js` as of commit `778d3a8` (Nov 1: activity log indexes, daily clean-out; 30-minute passes since Oct 28). Deployed by `deploy-worker.yml` on push. |
| Workflows | `test-bot.yml` (suite on push), `patience.yml` + `patience-combine.yml` (Patient Pat), `ara-consistency.yml` (real Ara), `error-harness.yml` (Testing Terry), `deploy-worker.yml`, `reconnect-clip.yml`, `record-lines.yml`, `publish-clips.yml`, `call-start.yml`, `check-keys.yml`, `tag-release.yml`, `release-bundle.yml` |
| Tests | `tests/bot.js` with `tests/checks/` (14 files, 170 checks; `PAGE=index.html node tests/bot.js` for the live page); `tests/checks/12-evidence.js` alone judges 1,075 evidence cases |
| Settings outside the repo | Cloudflare Worker secrets `XAI_API_KEY` and `DEMO_CODE` (values held by Carverhill); GitHub secrets `CLOUDFLARE_API_TOKEN`, `ARA_CONSISTENCY_KEY`, `OPENAI_CONSISTENCY_KEY`, `GEMINI_CONSISTENCY_KEY`; GitHub Pages serving `main` |
| Documents | engineers' guide `docs/engineers-guide.md`; voice line design `docs/voice-line.md`; doc 11 v1.4 DRAFT, overview doc v1.1, SpiceCRM look doc v1.2 (links in the Veleer spec register) |

## What 1.1 changes, by theme

- **The evidence rule.** Every value Ara sends is checked against the officer's own words (`validate.js`, `fieldEvidence`): a
  value never said is dropped and named back to her; ratings and entities are never invented; a pick-list answer to the
  question just asked is its own evidence; a state said as part of an entity's name is not its campaign.
- **One list module.** Every pick-list and the words officers use for it live in `lists.js`; entities are said by short
  spoken names ("National C3", "Idaho PAC") and the list is read by state.
- **Ara asks, the app checks.** New questions since Nov 1 (substantive?, next step?, where were we after a drop, the quiet
  hang-up, the follow-up task offer) go to Ara as guidance with a check and one nudge, not as app scripted lines. The
  remaining scripted lines (read-back, save line, optional-field questions, reconnect lines) carry their own ids; a late
  copy is cut, a soundless line is asked for once more, and the heard check needs words, sound and playback.
- **The state machine.** One XState machine (`machine.js`) is the truth about the line, the officer, Ara, the form and the
  one check waiting on Ara; its timers run the yes-or-no and say-the-question checks.
- **The line.** The configuration goes up on the warmed line at the first touch; reconnects for 10 minutes; the line closes
  at a phone lock and reopens on the same conversation at unlock; a dead sound engine is started afresh; a slow line test
  alone never reconnects a line that is answering; Ara's state (saves, the open form) is sent to her after every save.
- **Forms and saves.** The officer's yes to the read-back saves the form itself (a replayed save is refused); a second yes
  on an amount; a contact needs an email or a mobile; an ask recorded as Awaiting creates one "Check for an answer" task
  (14 days); editing a saved record by voice; "what fields are left?"; repeats and "which one" are Ara's own.
- **Engines for comparison.** OpenAI Realtime and Gemini Live can be chosen on the preview's Settings (`provider.js`);
  Grok runs the proof of concept.
- **Harnesses.** Patient Pat (`tests/patience`), the real-Ara consistency run with spoken officer lines and injected
  faults (`tests/ara-consistency`), Testing Terry (`tests/harness`); every readout counts discrete steps and app scripted
  lines other than read-backs.
- **Key holder.** Activity log indexes and a daily clean-out; 30-minute passes.

## To put 1.0 back on the live page

```
git checkout v1.0 -- index.html version.json app
git commit -m "Live: back to release 1.0"
git push origin main
```

`app/` at v1.0 has fewer files than 1.1; `git checkout v1.0 -- app` leaves the 1.1-only files in place, so remove `app/`
first (`git rm -r app`) and then check it out from the tag. Nothing in the Worker needs to change: the Worker deployed now
serves both builds.
