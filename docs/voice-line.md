# The voice line: how the app keeps a conversation with Ara alive

A design note for whoever carries this into the SpiceCRM module. The code is `preview/voiceline.js` (with `heard.js`
for the heard check and `formPosition()` in `voiceforms.js`); every timing named below is a constant at the top of
`voiceline.js`, each with the reason and the date it was last changed. Times in this note are those defaults as of
October 26, 2026.

## What the line is

A conversation with Ara is one WebSocket from the phone to xAI's realtime voice service. The phone streams microphone
audio up it; Ara's voice, transcripts, tool calls and events come down it. The socket is opened with a short-lived
**voice pass** (an xAI client secret, good for 5 minutes) minted by the key holder, today the Cloudflare Worker; the
xAI key itself never reaches the phone. The same key holder answers a tiny `/log?ping=` request, which the app uses
as its **line test**: iPhones only report "online" or "offline", so the app measures the network itself.

When the socket closes, xAI's side of the conversation would normally be gone. xAI keeps a conversation for 30
minutes, so a new socket opened with the same `conversation_id` within `RESUME_MS` (25 minutes) **picks up the same
conversation**: Ara remembers what was said. The app keeps the id from the `conversation.created` event.

Everything the app keeps itself (the open form, what has been saved, the last lines said, where the form stands)
survives a drop regardless, because it lives on the phone, not on the line.

## Noticing that the line is in trouble

Five signals, in the order they tend to fire on a drive:

| Signal | Where | What counts | Then |
|---|---|---|---|
| **The socket closes** | `openSocket` `ws.onclose` | Any close while the call is live (a dead spot usually gives code 1006). | `reconnect("the voice line dropped")`. A close before the line ever opened, on a resumed conversation, drops the id and starts a new conversation instead; before any line has opened at all, the call ends ("couldn't connect"). |
| **No reply starts** | `askReply`, `replyCheck` | The app asked Grok for a reply (`response.create`). At `TICK_MS` (4 s) with nothing started, a line test: slower than `SLOW_LINE_MS` (2 s) or failed means a fresh line. At `ASK_AGAIN_MS` (10 s) with nothing started, or a failed or empty reply: test the line, ask once more on a healthy one (`MAX_ASKS` 1), fresh line on a slow one, and a fresh line if the second ask also fails. | `reconnect("the line is too slow")` or `reconnect("the voice service stopped answering")` |
| **A stall** | `idleCheck` | The mic hears the officer talking for `STALL_MS` (5 s) and nothing has come from xAI in that time. A line test slower than `STALL_SLOW_MS` (2.5 s) or failed confirms it. A test is ignored if xAI sent anything in the last 3 s: the line is alive, however slow the test. | `reconnect("the line stalled")`, with `G.stalled` set so Ara is told the officer may have answered unheard |
| **Quiet line** | `openSocket` 30 s reading | Every 30 s a connection reading is logged. If its test fails while nothing was expected from Grok, a second test; if that fails too, a fresh line. | `reconnect("the line went quiet")` |
| **Opening hangs** | `openSocket` | A new line not open after `SECOND_LINE_MS` (5 s) gets a second socket opened alongside and the first to open wins; not open after `OPEN_TIMEOUT_MS` (10 s) counts as a failed try. | `reconnect("the line didn't open")` |

Two things that look like trouble but are not handled as drops: the phone **pausing the app's sound** (a notification,
Siri, a headset change) and the phone **muting the mic**. Both keep the line open and wait, `SOUND_BACK_MS` (6 s) for sound and `MIC_BACK_MS` (45 s) for the mic, because iOS shows an "Audio Recording / Stop audio recording?" dialog when the phone locks during a call and the mic is back only once the officer taps Cancel (Oct 26), for
the sound or mic to come back, ending the call only if it does not (`soundPaused`, `micMuted`). The **page going hidden**
(the phone locking, or a switch to another app) is **lock = pause** since October 26: a locked iPhone mutes the mic and
pauses the sound anyway, so `appHidden` closes the line `LOCK_CLOSE_MS` (3 s) after the page hides (`lockPause`; nothing is
charged while the phone sits locked), keeps the conversation id, and the moment the app is back `lockResume` reopens the
line on the same conversation through `openAgain`, the shared tail of `reconnect`: a voice pass, then `openSocket`, then
the pending question asked again as a scripted line. No drop tone, no "line dropped" recording, no Carry on tap. Before the
line reopens, `restartAudio` (voice.js) starts the sound and mic afresh through `openAudio`, the call's audio set-up: iOS
brings a web page's sound back on the earpiece after a lock, not the speaker the call started on (Oct 26), and a fresh start puts
it back; if the phone refuses (no running sound within 1.5 s) the old sound and mic stay. The sound and mic waits start again
at the unlock, since the phone brings both back in its own time. `lockResume` asks for the wake lock again (iOS releases it at every lock). The wake lock holds in the app added
to the home screen (Carverhill, Oct 26: a call ran past a 30 s Auto-Lock on the live app; 14 of his 18 Oct 25 calls ran past
3 minutes), but not in a preview opened from a link in Safari, which locked at 30 s every time; a fresh audio start a few
seconds into every call was tried on Oct 26 and did not help, so it was taken out. To test the preview the same way, add it to the
home screen too. Hidden longer than `LOCK_MAX_MS`
(`RESUME_MS`, 25 minutes, as long as xAI keeps the conversation) the call ends and the Carry on card shows. Tapping OK on the
iOS dialog ends the mic track, which still ends the call (the phone's doing). Before October 26 the call ended the moment the
phone locked.

## The reconnect loop

`reconnect(why)` runs the same sequence whatever the signal:

1. **Give up?** If nothing has been heard from xAI for `NO_LINE_GIVE_UP_MS` (5 minutes), the call ends: `voiceUnavailable`
   logs it, plays the down tone, keeps the form and the last lines for Carry on, and shows "The voice service isn't
   answering. Your form is still here." The count of tries no longer ends a call (a driveway dead spot took four).
2. **Mark the line down.** Status "Reconnecting…", any playing audio stopped, pending asks and timers cleared, the old
   socket closed, the drop tone on the first drop, and `downStart()` begins the phone's own spoken lines (next section).
   The step is logged ("Reconnecting (n): why").
3. **Wait a little.** `RECONNECT_DELAYS` 0, 1, 4, 10 s by try number, so a short dead spot can pass.
4. **Offline?** If the phone says `navigator.onLine === false`, wait for its `online` event, at most `OFFLINE_WAIT_MS`
   (15 s), before trying.
5. **Get a voice pass.** `getToken()` uses the pass prefetched during the call if it is fresh, else mints one.
   `mintToken` is time-limited (`TOKEN_WAIT_MS` 6 s): one fetch hung for 89 s on October 25 and the call hung with it.
   On failure, try again every `TOKEN_RETRY_MS` (2 s) until `DOWN_GIVE_UP_MS` (5 minutes) or a definite refusal
   (bad code, service error), which ends the call as in step 1.
6. **Open the socket**, with the saved `conversation_id` so the conversation resumes. On open: session configuration
   is sent again, `downEnd(true)` stops the phone's lines and plays "I'm back." if the line was down 5 s or
   more, the reading is logged ("Picked up the same conversation", "Voice line open in N ms (reconnect n)"), and a
   new pass is prefetched for the next drop. A line that stays up `STABLE_MS` (20 s) before dropping resets the try
   count, so separate drops on a drive are not one failure.
7. **Tell Ara where things stand** (next-but-one section).

## What the officer hears while the line is down

Grok cannot speak while the line is down, so the phone does, from three recordings in `sounds/` played through the
call's own audio output (`playLine`, `sayLocal`). The phone's built-in speech is never used: on iOS it produced an
"Audio Recording / Stop audio recording?" dialog that muted the mic (October 25).

- `SAY_DOWN_MS` 5 s after the drop: "Sorry, the line dropped. I'm reconnecting." (all four status lines are recorded in Ara's own voice with xAI text-to-speech, `tools/ara-lines.json`, so the officer never hears a second voice)
- `SAY_STILL_MS` 12 s: "Still trying to reconnect.", then every `SAY_REPEAT_MS` (10 s); after the first minute down,
  every `SAY_REPEAT_LATER_MS` (30 s) so a long dead spot does not nag.
- When the line is back: "I'm back.", unless a status line is still playing (it is cut instead) or the
  drop lasted under 5 s.
- Short tones: a drop tone on the first drop, a soft tick every `TICK_MS` while waiting for a slow reply or reconnecting
  (until the spoken line takes over), a down tone when the call gives up.

Each spoken line is logged as a step ("The phone said (recording): …"), so the activity log shows what the officer
heard and when.

## Picking up where the form was

The app, not Grok, knows where the form stands. `formPosition()` in `voiceforms.js` returns two things: `where`, a
sentence for Ara's instructions, and `ask`, the exact pending question, in this order of precedence:

1. A hands-free read-back is waiting for the officer's yes: `ask` is the whole read-back again, ending "Shall I save it?"
2. An optional-fields question is open: that question.
3. An interaction report has not yet been asked the substantive question: that question.
4. Otherwise which required fields are still missing, or that the form is complete.

On reconnect, when there is a pending question, the app puts "Just now: …" in Ara's live context, logs the step
("Reconnected: the app asks the pending question itself") and has Ara speak a **scripted line**: "Sorry, I lost you for
a moment. " followed by the pending question, word for word. When the same question is forced again within three minutes
(a second drop in a row, Oct 27 13:25 call) the line is "Sorry, the line dropped again. I'm still waiting on this: " and the
question, so it doesn't sound as if Ara forgot the answer (`G.reAsk`). With no pending question, Ara gets `reconnectLine()` as
guidance instead: the last lines said, what has been saved (never to be saved again), the open form, whether
hands-free is on, whether the officer may have talked unheard, and the rule to ask one question and not start over.

## Replaying what was said while the line was down

The officer often keeps talking into a dead line (Oct 27: an email address, "The New Hampshire entity"). The phone
keeps the last 40 s of its own mic (`G.ring` in `voice.js`: 100 ms chunks with a loud flag, and a flag for chunks
captured while one of the status recordings played). When a reconnect opens, `replayGap()` in `voiceline.js` takes
the chunks from one second before Ara's last message (`G.gapFrom`, set in `reconnect()`) to now, keeps the clear
speech with a little lead and tail (`REPLAY_LEAD_MS`, `REPLAY_TAIL_MS`), sends them to Ara as ordinary mic audio
(status recordings as silence, so she never hears "the line dropped" as the officer's words), and tells her in Right
now that she heard it live. No sorry line is spoken then. Over `REPLAY_MAX_MS` (30 s), or with nothing clear on the
mic, the reconnect goes the usual way below. If the replay brings no turn and no reply within `REPLAY_WAIT_MS` (7 s),
`replayWatch()` speaks the sorry line with the pending question, or "Could you say that again?". A reopen after a
phone lock never replays (the mic was muted). Everything is logged ("Replayed N s of the officer's words…").

The same `where` goes into the Carry on card when a call ends with a form open, so a restarted call also resumes from
the right question. A read-back the officer had already said yes to is saved before anything else happens
(`hfSettlePending`).

## Scripted lines

A scripted line is an xAI `force_message`: the service speaks the exact text, then Ara carries on. `forceSay` waits for
any current reply to finish, sends the line, and watches: if no response has started after `FORCE_WAIT_MS` (8 s), Ara is
asked to say the line herself (fallback). If Ara answered on her own first with mostly the same words, the late copy
is cut as a duplicate (`forcedEvent`, `wordOverlap`, `lateForced`); if her answer was something else, the wait starts
again. The doubled-reply guard for an ask made twice lives in `onEvent` in `voice.js`.

## The heard check

`heard.js` records three readings for every line Ara says: voice audio received, sound actually produced on the speaker
path, and the mic hearing the speaker. A line that fails a reading is logged as possibly unheard. "Are you there?" from
the officer logs the readings of the last line and has Ara say she is here and repeat it.

## What gets logged

Every connection event is an activity-log row through `netLog`: what happened, online or offline, network type and
speed where the browser reports them, how long since the last word from xAI, the line test time, and the position
when the Settings switch "Record my location in connection logs" is on. The reconnect steps, the phone's spoken lines
and the form hand-off are step rows. These rows are what the dead-spot counts in the project deck come from.

## Tests

`tests/checks/08-voice.js` and `09-hands-free.js` drive the reconnect path with a pretend socket: closing the line,
the token retry loop, the 5-minute give-up, the phone's spoken lines, the form-position hand-off and the scripted-line
fallback. `tests/ara-consistency/record-reconnect.js` records a real conversation with the browser taken offline
during a read-back and produces a sound clip of the whole sequence (`clips/reconnect-clip.mp3`).

## Carrying it into the SpiceCRM module

The mechanism depends on four things from the back end, none of them xAI-specific: a way to mint a short-lived voice
pass without exposing the key, a cheap request to time as a line test, a resumable conversation on the voice service,
and the phone's own record of the form. Everything else is on the phone and comes with the module unchanged. The
timings were set from Carverhill's driveway and road tests in October 2026 and should be revisited when officers
drive with it.
