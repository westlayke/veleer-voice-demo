# Release 1.0 (the Oct 26, 8:14 PM ET live build)

Set aside on Oct 27, 2026 at Carverhill's request: the last production build before the app began standing in for Ara
(scripted lines and status recordings in Ara's own voice, the Worker's text-to-speech route, the mic replay). Its phone
recordings ("Sorry, the line dropped", "Still trying", "You're back with Ara") are in a different voice (Kokoro).

| What | Where |
|---|---|
| Build stamp | Oct 26, 8:14 PM ET (`version.json` and `BUILD` in `app/core.js`) |
| Commit | `82a7de4` ("Go live: the call-review changes"), Oct 27 00:34 UTC |
| Git tag | `v1.0` (annotated) |
| Branch for fixes to 1.0 | `release-1.0` (starts at the tag) |
| Source archive | https://github.com/westlayke/veleer-voice-demo/archive/refs/tags/v1.0.zip |
| Live page files | `index.html`, `version.json`, `app/` (`app/sounds/` holds the Kokoro recordings) |
| Worker | `worker/token-worker.js` as of commit `1e71963` (Oct 25; no `/tts` route). The Worker now deployed is newer and still serves this build. |
| Workflows at the time | `deploy-worker.yml`, `test-bot.yml`, `ara-consistency.yml`, `reconnect-clip.yml` |
| Tests | `tests/bot.js` with `tests/checks/` at the tag: 113 live checks (`PAGE=index.html node tests/bot.js`) |
| Settings outside the repo | Cloudflare Worker secrets `XAI_API_KEY` and `DEMO_CODE` (values held by Carverhill); GitHub secrets `CLOUDFLARE_API_TOKEN`, `ARA_CONSISTENCY_KEY`; GitHub Pages serving `main` |

## To put 1.0 back on the live page

From `main`, take the live files from the tag and push; GitHub Pages serves them within a minute. Nothing in the Worker
needs to change.

```
git checkout v1.0 -- index.html version.json app
git commit -m "Live: back to release 1.0 (Oct 26, 8:14 PM ET build)"
git push origin main
```

To work on 1.0 separately (a fix without the later changes), branch from `release-1.0`, run the live checks there, and
copy `app/`, `index.html` and `version.json` onto `main` the same way.

## What came after 1.0 (preview only, as of Oct 27, 10:11 AM ET)

The Oct 26 evening sound-engine fix and responsiveness items, the Oct 27 call fixes (spelled names, "No" to the mobile
question, the slow line, the no-reply re-ask, what's next, the capacity gate), the mic replay after a reconnect, the
phone's lines recorded in Ara's voice, the hands-free save line spoken by the app in Ara's voice (Worker `/tts`), the
9:21 AM and 9:38 AM call fixes. None of it is live.
