# The voice line: how the app keeps a conversation with Ara alive

A design note for whoever carries this into the SpiceCRM module. The code is `preview/voiceline.js` (with `heard.js`
for the heard check and `formPosition()` in `voiceforms.js`); every timing named below is a constant at the top of
`voiceline.js`, each with the reason and the date it was last changed. Times in this note are those defaults as of
October 26, 2026.

## What the line is

A conversation with Ara is one WebSocket from the phone to xAI's realtime voice service. The phone streams microphone
audio up it; Ara's voice, transcripts, tool calls and events come down it. The socket is opened with a short-lived
**voice pass** (an xAI client secret, good for 30 minutes since Oct 28; 5 before) minted by the key holder, today the Cloudflare Worker; the
xAI key itself never reaches the phone. The same key holder answers a tiny `/log?ping=` request, which the app uses
as its **line test**: iPhones only report "online" or "offline", so the app measures the network itself.

When the socket closes, xAI's side of the conversation would normally be gone. xAI keeps a conversation for 30
minutes, so a new socket opened with the same `conversation_id` within `RESUME_MS` (25 minutes) **picks up the same
conversation**: Ara remembers what was said. The app keeps the id from the `conversation.created` event.

Everything the app keeps itself (the open form, what has been saved, the last lines said, where the form stands)
survives a drop regardless, because it lives on the phone, not on the line.

## A line warmed on touch (Oct 28)

`warmLine()` runs on `pointerdown` of the mic button (and the welcome Start and Carry on buttons): it takes the prefetched
voice pass and opens the socket at once, while the finger is still on the button and the tap's call spends its first second on
the mic and the sound engine. `startCall` calls `takeWarm()` and hands the warmed line to `openSocket`, which adopts it (if it
is already open, its `onopen` runs once; events it was sent meanwhile are replayed). A warmed line nobody used closes after
`WARM_MAX_MS` (20 s). A Carry on that resumes a conversation does not use a warmed line, since that needs the `conversation_id`
in the address. Logged as "line warmed on touch" and "(warmed on touch)" on the Voice line open row.

## The service's own idle timer (Oct 28)

`turn_detection.idle_timeout_ms` is set `IDLE_SERVER_EXTRA_MS` (3 s) after the phone's own quiet limit (`idleMs()`: 12 s, 30 s
hands-free; it follows a hands-free switch with a `turn_detection` update). The phone's timer normally fires first; the service's
acts when road noise kept the phone's from firing. On `input_audio_buffer.timeout_triggered` the app cancels the service's
check-in reply (`response.cancel`, `G.dropNext`) and says its own goodbye through `idleStart()`.

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
the sound or mic to come back, ending the call only if it does not (`soundPaused`, `micMuted`). A call's start (a mic tap or
Carry on) waits `SOUND_START_MS` (2 s) for the fresh sound engine to run (`soundRunning` in voice.js); if the phone still holds it
(iOS kept the page's audio "interrupted" after a background switch, Oct 27 6:17 PM: Ara answered and was never heard), the officer
is told on screen and the call waits up to `SOUND_HELD_MS` (30 s) instead of 6 s; a line Ara says into a paused sound engine is
kept (`G.unheard`) and said again as a scripted line when the sound is back (`soundBack`). The **page going hidden**
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

1. **Give up?** If nothing has been heard from xAI for `NO_LINE_GIVE_UP_MS` (8 minutes), the call ends: `voiceUnavailable`
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
   On failure, try again every `TOKEN_RETRY_MS` (2 s) until `DOWN_GIVE_UP_MS` (8 minutes) or a definite refusal
   (bad code, service error), which ends the call as in step 1.
6. **Open the socket**, with the saved `conversation_id` so the conversation resumes. On open: session configuration
   is sent again, `downEnd(true)` stops the phone's lines and plays "You're back with Ara." if the line was down 5 s or
   more, the reading is logged ("Picked up the same conversation", "Voice line open in N ms (reconnect n)"), and a
   new pass is prefetched for the next drop. A line that stays up `STABLE_MS` (20 s) before dropping resets the try
   count, so separate drops on a drive are not one failure.
7. **Tell Ara where things stand** (next-but-one section).

## What the officer hears while the line is down

Grok cannot speak while the line is down, so the phone does, from three recordings in `sounds/` played through the
call's own audio output (`playLine`, `sayLocal`). The phone's built-in speech is never used: on iOS it produced an
"Audio Recording / Stop audio recording?" dialog that muted the mic (October 25).

- `SAY_DOWN_MS` 5 s after the drop: "The line dropped. Reconnecting you to Ara." (all four status lines are the release 1.0 recordings in the phone's own stand-in voice, `tools/ara-lines.json`: Carverhill, Oct 27, wants to hear when the app, not Ara, is speaking)
- `SAY_STILL_MS` 12 s: "Still trying to reconnect.", then every `SAY_REPEAT_MS` (10 s); after the first minute down,
  every `SAY_REPEAT_LATER_MS` (30 s) so a long dead spot does not nag.
- When the line is back: "You're back with Ara.", unless a status line is still playing (it is cut instead) or the
  drop lasted under 5 s.
- With the officer's name (Oct 28, for a colleague's 8-minute dead spot): the same three lines, plus six "still trying" lines
  said in turn ("Still trying, Pat. I'm not giving up on you.", "Hang in there, Pat. I'll keep knocking until Ara answers." ...),
  are made by the key holder's `/tts` in the phone's stand-in voice (`NAMED_LINES`, `prepNamedLines`) when the name is entered,
  when the app opens and when a line opens, and kept on the phone (`localStorage` `namedLines:v2`, decoded into `namedBuf`),
  so they play in a dead spot. Without them (first open with no signal) the stock recordings play. `downSay(kind)` picks the line.
  The fetch carries the demo code like every other call to the key holder; a fetch that gets nothing logs "Phone lines not fetched".
- While a reply from Ara is outstanding: "Ara's taking a moment." at `TICK_MS`, then "Still waiting on Ara." every
  `STILL_WAIT_MS` (10 s) until she answers (a phone line made like the named ones; a soft tick when the phone has none).
  "Taking a moment" is said once per wait: a re-ask of the same reply does not restart it (`G.slowSaid` clears when a reply starts).
- Quiet hang-up: `idleMs()` is 12 s, 30 s hands-free, and `IDLE_FORM_MS` (60 s) with a form open; the service's own idle
  event is ignored while the phone still allows quiet, but the check-in the service starts on its own within 5 s of that
  event is dropped (`G.dropIdle`), so no filler line plays over the open form. A tool call repeated after a pick-up counts as a
  replay only when the earlier call came within `REPLAY_BEFORE_MS` (90 s) before the drop. The goodbye is the phone's own line ("I'll hang up for now. Your form
  stays on the screen." with a form open), else Ara is asked to say it.
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
("Reconnected: the app asks the pending question itself") and speaks a **scripted line**: "Sorry, I lost you for
a moment. " followed by the pending question, word for word. Since Oct 27 every scripted line (a question, a read-back,
the reconnect line) is said by the app itself in its stand-in voice (`ttsSay`, xAI text-to-speech voice `APP_VOICE` = leo through
the Worker's `/tts`, started no earlier than Ara's sound ends); Grok's `force_message` in Ara's voice is the fallback when the
audio does not arrive within `TTS_WAIT_MS` (4 s), and after that `FORCE_WAIT_MS` (8 s) Ara says the line from guidance instead. When the same question is forced again within three minutes
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

## App-only forms

Since Oct 27 the app runs every form itself (Carverhill's decision after the 1:14 PM call, where the app's voice and Ara's
overlapped). While a form is open (`formMode()` in `voice.js`), the app asks each question in its own voice (`ttsSay`, voice
Leo or Ara's, a Settings switch): the required fields first, one at a time and in form order (`FIELD_Q` in `voiceforms.js`),
then "save it, or add the optional details?" (`formChoiceLine`), then the optional questions one at a time, then the read-back.
Grok's job inside a form is tool calls only (`FORM_RULES`): the officer's answer goes to the draft tool, and the tool result's
`asked` field is what the app said next. If Grok starts to speak to something that was not a question (`isQuestion`), the
reply's audio is dropped (`G.dropNext`, no `response.cancel`, so a tool call in the same reply still arrives) and the app asks
its pending question again (`formReask`, `formReaskLine`). A side question ("what does substantive mean?") is left to Ara,
and the app asks its question again when her answer ends. The app acts on the save-or-details answer itself
(`formChoiceHeard`), ignoring Grok's late tool call for it (`G.appActed`). A save needs a clear word ("save", "go ahead",
a short plain yes); a question is never a save.

Three things the officer says inside a form are answered by the app alone, with Grok told to stay silent (Jim's Oct 27
2:26 PM call, where Ara's answer and the app's question came one after the other five times): "are you there?" gets
"I'm here." followed by the pending question; "where were we?" and "what are we filling out?" get the form's name, what it
still needs and the pending question (`WHERE_Q`, `formWhere`); and after any side answer of Ara's that already ends with
the form's question (`wordOverlap` of 0.6 with the pending question), the app does not ask it again. A yes or no that Grok
puts into a free-text field (summary, next step) is thrown out and the field keeps what it had. The next-step question
splits once one half is in: "When is it due?" or "What's the step?". A reconnect or unlock with a form open names the form
("The new opportunity form for Leo Johnson is open.") before the pending question.

The app's lines are fetched through `ttsFetch` into a cache (`TTS_CACHE`, text and voice as the key), and a form's likely
lines are fetched ahead when it opens (`formLines`, `ttsPrefetch`), so a re-ask or a reconnect plays at once. Inside a form
the wait for a line is `TTS_WAIT_FORM_MS` (10 s) rather than `TTS_WAIT_MS`, since no other voice is competing; the after-save
line gets the same 10 s. Grok's `force_message` remains the fallback when the fetch fails.

xAI's text-to-speech answers most lines in 1 to 3 s but now and then takes 8 to 10 s (five times in Jim's Oct 27 2:26 PM
call), so two things cut the wait. The Worker keeps every line's audio in a KV namespace (`LINES`, key voice + text hash,
30 days): the first phone to need a line pays the xAI wait, and every later fetch of the same words in the same voice is
served from the edge (`X-Line-Cache: hit`). And `ttsFetch` sends a second request for any line not back in `TTS_HEDGE_MS`
(2.5 s), or at once when the first request fails, and plays whichever answers first. Lines that carry names are fetched
ahead where the words are known early: the campaign question for every entity goes out when the entity is asked. Every
fetch is a `tts` row in the activity log (time, cached or xAI, whether the second request won) and the conversation's end
row sums them up (count, cached, failed, xAI median and slowest, how many over 4 s), so the voice's latency can be
compared with Grok's own reply times.

## The heard check

`heard.js` records three readings for every line Ara says: voice audio received, sound actually produced on the speaker
path, and the mic hearing the speaker. A line that fails a reading is logged as possibly unheard. "Are you there?" from
the officer logs the readings of the last line and has Ara say she is here and repeat it; inside a form the app answers it
itself (see App-only forms).

## What gets logged

Every connection event is an activity-log row through `netLog`: what happened, online or offline, network type and
speed where the browser reports them, how long since the last word from xAI, the line test time, and the position
when the Settings switch "Record my location in connection logs" is on. The reconnect steps, the phone's spoken lines
and the form hand-off are step rows. These rows are what the dead-spot counts in the project deck come from.

## Tests

`tests/checks/08-voice.js` and `09-hands-free.js` drive the reconnect path with a pretend socket: closing the line,
the token retry loop, the 8-minute give-up, the phone's spoken lines, the form-position hand-off and the scripted-line
fallback. `tests/ara-consistency/record-reconnect.js` records a real conversation with the browser taken offline
during a read-back and produces a sound clip of the whole sequence (`clips/reconnect-clip.mp3`).

## Carrying it into the SpiceCRM module

The mechanism depends on four things from the back end, none of them xAI-specific: a way to mint a short-lived voice
pass without exposing the key, a cheap request to time as a line test, a resumable conversation on the voice service,
and the phone's own record of the form. Everything else is on the phone and comes with the module unchanged. The
timings were set from Carverhill's driveway and road tests in October 2026 and should be revisited when officers
drive with it.

## Voice engines (Oct 27)

`preview/provider.js` holds everything engine-specific: the socket address and subprotocols, the session body, how a scripted
line is said, what a dropped line does. Grok (xAI) is the engine of the proof of concept and the default. OpenAI Realtime
(gpt-realtime-2.1) is a preview-only alternative for the provider comparison: Settings > Voice engine on the preview page
(hidden on live), the Worker mints its pass from `POST /` with `{"provider":"openai"}` (secret `OPENAI_API_KEY`), and the
consistency run takes a `provider` input (secret `OPENAI_CONSISTENCY_KEY`). Differences the adapter covers: the session body
(type/model, turn detection and transcription under audio.input, the voice under audio.output), no xAI extras (resumption,
pronunciation table, key terms), no force_message (a scripted line is asked for in a reply of its own, "Say this now, word for
word", and accepted when the engine's words overlap the line), no conversation resumption (after a drop the last eight lines
are replayed into the new session as text). `GET /providers` on the Worker says which engine keys exist (true/false).
OpenAI also allows one reply at a time, so on it every reply request (app guidance, a scripted line by reply, the officer's
turn) goes through one gate: `replyBusy()` in voiceline.js holds a request while a reply is running or one was asked for and
has not reported started within `CREATE_WAIT_MS`; a request OpenAI still refuses goes again after the running reply (a
refused scripted line goes again as a scripted line); a scripted line the engine has just said in its own words (the question
it asked in answer to the tool result) is not sent a second time; and a finished reply with no words is silence to ask about
once, never a dead line.

Google Gemini Live (gemini-3.8-live) is the third engine, added the same day. Its wire format is its own (setup, realtimeInput,
clientContent, toolResponse in; setupComplete, serverContent, toolCall, goAway out), so `GeminiSocket` in provider.js wraps the
WebSocket and translates both ways: the app keeps sending and receiving its OpenAI-style events and nothing in voice.js or
voiceline.js knows the difference. Microphone audio is resampled to 16 kHz PCM (`down16`), Gemini's 24 kHz audio comes back as
output_audio.delta, its input and output transcriptions become the app's transcription events, a tool call becomes
function_call_arguments.done and the app's guidance text rides along in the tool response (`app_guidance`, held 120 ms so the
guidance written right after the call is included), a goAway closes the socket so the app reconnects with the session
resumption handle. Tool schemas are stripped of the keys Gemini rejects (`geminiSchema`). The Worker mints an ephemeral token
from `POST /v1beta/auth_tokens` (secret `GEMINI_API_KEY`); the consistency run uses `GEMINI_CONSISTENCY_KEY`.

The consistency run now runs the engines side by side: the workflow's `providers` input is a comma list and a job per engine
starts at the same time, so time of day cannot favour one. Every engine is measured the same way, from app-level taps (the
moment the officer's words are sent to the first sound of the reply), and the summary gives per-flow reply times with mean,
standard deviation, median, 90th percentile, slowest and the count over 3 s.

## Voice form policy (Oct 28)

Every form's voice behaviour is declared in `VOICE_RULES` (core.js, after `ACTIONS`): `needsOneOf`, `askFirst`, `optional`
(the ordered list of optional fields offered; an empty list means none), `groups`, `defaultOn`, `alwaysAsk`, `nextStepWhen`,
`followUpWhen`, `requiredWhen`, `ownWords`, `secondYes`, `prefilled`, `noVoiceSave` and `routedFrom`. `voiceRule(action)` reads
them. One engine in voiceforms.js walks every form from those declarations: `reqQuestion` scripts the first required question,
`offerMore` offers the optional details once ("That's everything the <form> form needs for <who>. Save it, or add the optional
details first?") and `optAsk`/`optStep` ask them one at a time with `optQuestion`/`optParse` by field type, `hfReadback` reads
the form back short (values only, bare amounts and dates) and ends with `SAVE_Q` ("Save it, or change something?"), and a
changed value is re-read on its own in `hfSave` ("Payment method, credit card. Save it, or change something?"). `draftTool`
(aratools.js) settles the waiting form before it resolves a target unless the new form is `routedFrom` the old one (Record gift
in Commitment routes to the payment form), refuses a second form with "The <form> form is waiting on your yes. Save it, change
something, or drop it?", and applies `requiredWhen`, `needsOneOf`, `askFirst` and `prefilled` generically. No voice code
branches on a form name; drafts.js keeps the per-form data layer.

## Reconnect without state notes, silent replies, the next-step question (Oct 28 evening)

After a drop the app no longer rebuilds Ara's memory of the call. `reconnectLine` says only that the line dropped and to carry on
(plus "ask them to say that again" when the officer talked while the line was down); she resumes her own conversation and the tool
guards refuse anything stale (a save already done, a rating already set, a tool call replayed from before the drop). The one thing
the app adds is its own pending form question, through `formPosition().ask`, which now also covers a form with required fields
missing (`reqQuestion`). Carverhill's rule: hold the state of the last action completed, don't reprogram hers.

A reply that arrives as words with no sound (heard.js reading 1, under `AUDIO_MIN_S` of audio for two words or more, with the
sound engine running) is acted on by `silentLine`: the phone plays "Ara's taking a moment", then asks for the line again once
(the app's own scripted line is re-sent as a forced message; a line of hers is requested word for word); a second silent copy of the
same line calls `reconnect`. Only once a line of hers has been heard in the call (`G.audioEver`), so a typed test never triggers it.

The next-step line after every save ends "Do you want to do that now?" (`NEXT_Q`). A bare no is answered by the app with
`NEXT_NO_Q` ("What would you like to do?") from `nextStepNo` on the transcript; "no, <step>" is left to Ara. Every line the phone
says itself (named reconnect lines, "Still waiting on Ara", the hang-up lines, the four stock recordings) is one voice, xAI's Eve
(`NAMED_VOICE`, `tools/ara-lines.json`).


## Late copies, silent replies and the phone's recordings (Oct 28, 10:33 PM)

A scripted copy that plays late after Ara has already said the line is cut with `stopResp(seq)` in voice.js: only the sources
of that reply are stopped and its remaining audio deltas are dropped (`G.muteResp`), so whatever else is playing carries on.
`nextStepNo` cancels the running reply and sets `G.cancelAt`; `forceSay` waits `CANCEL_SETTLE_MS` (0.7 s) after a cancel
before sending the next forced line, which is how "What would you like to do?" comes back with audio instead of words only.
A line counts as silent only `SILENT_JUDGE_MS` (2 s) after it should have ended; the resend in `silentLine` stands down when
`G.respSeq` has moved on, sound is queued or playing, so the real copy that arrives meanwhile plays once. `cutStatusLine(why)`
in voiceline.js stops a phone recording still playing when the line comes back.

Her audio and the phone's recordings share one clock (10:43 PM). `playPcm` schedules every chunk of hers no earlier than the end of
a recording still playing plus `LINE_GAP_S` (1 s), so chunks that arrive while a recording plays wait behind it; that is the
buffer, with no separate store. The other order is the one that overlapped at 10:03:52 PM: her chunks were already on the clock
when the silence judgement ran. So `silentLine` first checks `playingLeft() > 0 || G.audioOn` and, if her sound is playing or
queued, logs a false alarm and says nothing. The 10:33 PM cut of the recording on her first audio chunk is gone.

## The yes that saves is the officer's, not Ara's (Oct 29)

Carverhill's 7:39 AM call: a drop while the opportunity's read-back waited for his yes, a pickup, and his "Save it" on the new line was refused as a replay, because the replay guard (Oct 28) matched the tool call's name and arguments (save_form, confirmed) against the contact's save 60 s before the drop. Ara turned the refusal into "That save didn't go through."

Two rules now:

- A replay can only arrive before the officer has said anything on the picked-up line. `G.resumedHeardN` is the transcript count at the pickup; the guard in `onTool` applies only while `G.heardN` is still that. Anything said after the pickup is answered for real, whatever it matches.
- The officer's yes to the app's own read-back saves the form from their words. `hfYesHeard(text)` runs first in the transcript handler: with a read-back pending (`G.saveCheck` for the open draft) and a yes, it stops Ara's reply, commits (or, on a money form, asks the app's own amount check first and saves on the next yes) and speaks the saved line and the next step itself. Ara's `save_form`, when it comes, finds the form gone and is answered silently (`already`, `said`), so she says nothing. Her tool call is no longer in the path of any save; the app's `hfSave` only still handles a save_form that comes first (Ara ahead of the transcript).

Tested by the Oct 29 check in 09-hands-free.js (a save, a drop, a pickup, a replayed draft call refused, the yes on the new line saving the second form) and the Testing Terry fault "Drop before the yes".

## The configuration goes up at the touch (Oct 29)

The call-start harness (tests/call-start, run 1) showed xAI applies Ara's whole 55 KB configuration about 240 ms after session.created from a datacenter, while the phone waited 1,280 ms for the same five session.updated acks: the phone's uplink carrying the bytes. So the warmed line (opened on the first touch of the button) now sends the configuration the moment it opens, in `warmLine`'s `onopen`: `sessionCfg()` plus `extraUpdates()`, built as the call will start (hands-free on, nothing saved yet, the name being typed on the welcome counted as the officer's name). `w.cfg` keeps the rules and Right now markers that went up. When the tap takes the warmed line, `openSocket`'s `onopen` skips the configuration and sends only `instructions` again if the rules or the Right now section changed between the touch and the tap. A line opened without a warm-up (a reconnect, a Carry on, a resumed conversation) still sends everything itself. Checked by "Call start (Oct 29)" in 08-voice.js.


## A scripted line gets the 4 s check too (Oct 29)

A scripted line (`forceSay`, a force_message) is not a reply request, so the 4 s tick and the early line test in `askReply` never covered it: in Carverhill's 7:39 AM call the phone was silent for 12.7 s after a save line before "Ara's taking a moment" (the 8 s fallback handed the line to Ara, and only her reply request started the tick). Now `forceTick` runs 4 s after every scripted line goes out: if no response has started, the phone says "Ara's taking a moment." once (the same `G.slowSaid` as the tick, so it is never said twice in one wait) and tests the line with `pingMs(EARLY_PING_MS)`. A healthy line (under `SLOW_LINE_MS`) keeps waiting for the 8 s fallback as before. A slow or dead line gets a fresh one straight away, about 6.5 s after the line was sent, and the scripted text is kept in `G.pendingForce`: the new line says it itself ("Sorry, I lost you for a moment. <the line>"), unless a form question is pending, in which case that question covers it. The check is cleared the moment a response starts.

In the same build the app asks its own next-step question when it drops a next step Ara invented on an interaction report (`nextQ` in aratools.js, the `NEXT_STEP_Q` line from the hands-free save): the 9:14 AM call heard only "I didn't catch the next step from you, so it's not on the form", and Ara never asked what the step was.

Tested by the "Scripted line (Oct 29)" check in 08-voice.js (healthy line: one phone line and the 8 s fallback; slow line: fresh line at about 6.5 s saying the scripted line) and the dropped next step in the "keeps only what the officer said" check.

## The reconnect line is the app's whenever the line comes back (Oct 29, 9:45 AM call)

After a pickup with no form open, Ara used to be asked to say "Sorry, I lost you for a moment." and then one question. In Carverhill's 9:45 AM call she said the sorry and stopped, and there were 12 s of dead air before he asked whether she was there. Now the app says the whole line itself in every case (`say()` in `reconnect`'s open callback): the pending form question (`formPosition`), else a scripted line the old line never started (`G.pendingForce`), else `lastQuestion()`: "Could you say that again?" when the officer spoke while the line was down (`G.spokeInGap`, now only after `GAP_SPEECH_MS` of sound, and set by a stall that found the officer talking) or had answered since Ara's last line; else the last question in Ara's last line (`G.lastBot`); else "What would you like to do?". `reconnectLine(lock, said)` tells Ara the app has said it and not to repeat it. The warmed line now shapes the session body per engine (`providerSession` for OpenAI), which the Oct 29 warm build had missed.

Tested by "Reconnect with no form open (Oct 29)" in 08-voice.js (all three lines) and the updated drop checks in 08 and 09.

## Five generic fixes from the 10:05 AM call (Oct 29)

All in shared code, none per form (Carverhill: "I don't want separate one off form fixes").

1. **After a drop the app repeats Ara's whole last line** when it is 220 characters or less and ends in her question (`lastQuestion()` in voiceline.js). The last sentence alone ("Which fits?") had lost the choices. Longer lines still get just the question.
2. **Save called with no form open soon after a save** (`hfSave`, within 3 minutes): the app says the after-save line itself as a scripted line (`G.savedByWordsLine`, else "It's saved. What would you like to do?") and tells Ara to say nothing. Before, Ara was told to "say it's saved" and her copy landed on top of the app's.
3. **The silent-line resend stands down** (heard.js `silentLine`) when a scripted copy of the same words is already pending or on its way (`G.forced` / `G.pendingForce`), as it already did for a copy playing.
4. **Every read-back ends in a question**: `saveQ(rb)` adds "Save it, or change something?" unless the read-back already ends with a question of its own. The old rule skipped it whenever a "?" appeared anywhere, so the Cultivation read-back ("Move X to Cultivation? That means...") ended in a statement.
5. **Entity evidence**: a state the officer names counts as the entity said only when that state has exactly one entity (evidence.js `fieldSaidIn`); with two, the app still asks which. And when Ara asks a question of her own while a scripted question is still to come (`forcedEvent`), hers stands and the scripted copy is cut when it arrives, instead of two questions in a row.

## The officer's own turn gets the ladder too (Oct 29, Patient Pat's first run)

Patient Pat (tests/patience) found that 34 of 135 "are you there?"s came after the officer's words when the reply was slow to start (10-25 s): in hands-free the voice service answers the officer on its own, so the app had asked for nothing, and the tick, the line test and the fresh line were all tied to `G.asked`. `turnWatch()` (voiceline.js, from `idleCheck` every second) now runs the same ladder on the officer's turn: `G.turnOpen` is set at `speech_stopped` (or at the transcript when it comes first) and cleared by `response.created` or a tool call, a reconnect, or the turn producing no words (noise). At `TICK_MS` (4 s) "Ara's taking a moment." (the shared `G.slowSaid`); at `TURN_TEST_MS` (8 s) a line test: a slow line gets a fresh line, whose reconnect line is "Sorry, I lost you for a moment. Could you say that again?" (lastQuestion: the officer spoke last); a healthy line gets one reply request carrying the officer's words, after which the usual reply watch (`replyCheck`) applies; at `TURN_GIVE_UP_MS` (12 s) a fresh line whatever happened. The quiet hang-up never fires while a turn is open (`!G.turnOpen` in `quiet`): three Pat conversations had ended with the goodbye while her last words were unanswered. Check: "Officer's turn watch (Oct 29)" in 09-hands-free.js.

## A form always has a pending question, and the reconnect line says where we are (Oct 29, 1:14 PM call)

`formPosition()` (voiceforms.js) had no question for a form whose required fields were all in but nothing had been read back yet: after a drop in that state the reconnect fell through to "Could you say that again?", and Ara, told the officer had spoken while the line was down, guessed "that" from two forms earlier ("create an opportunity", which the app refused: one open opportunity per investor). Now the fallthrough asks what the form flow would ask next, for every form: the substantive question, the next-step question (`NEXT_STEP_Q` / `FOLLOW_Q`), "Save it, or add the optional details first?", or the read-back with the save question. Each position carries `arm()`, which puts the form in the state that question implies (askedSubst, askedNext, saveOrOpt, `G.saveCheck`); only the reconnect callback, which actually asks the line, calls it. The status readers (`resumeInfo`, the replay guard, `fieldsLeft`) don't. The reconnect's form line opens with `formIntro()`: "We're on the interaction report for Elon." then the question (Carverhill: "she needs to repeat what we were working on"). Check: "Carverhill's 1:14 PM call (Oct 29)" in 09-hands-free.js.

## Two fixes from the first real-line runs with faults (Oct 29, 2:55 PM)

The real-Grok spoken runs (quiet, car noise, and a probe with cellular drops forced high) found two things the stand-in never showed:

- **The reconnect line stacked.** When a second drop came before the officer said anything, Ara's last line already began "Sorry, I lost you for a moment", and the app put it in front again: five in a row by the fourth drop. `lastQuestion()` now strips that opening from her last line before repeating it.
- **"Ara's taking a moment" after nearly every save line.** On a quick "yes" the app saves and says its own line at the transcript, before the service reports the officer's speech stopped; `speech_stopped` then reopened the officer's turn while that line was already playing, and the turn watch ticked 4 s later. Now `speech_stopped` opens a turn only when no reply is running, and `response.done` closes an open turn as `response.created` already did. 23 of 25 quiet conversations and 20 of 24 noisy ones had heard the line.

## A turn opens when the speech stops, not on a partial transcript (Oct 29, 3:36 PM)

The confirmation run on the 2:55 PM build still played "Ara's taking a moment" twice, 4 s into a long sentence while the officer was still talking: the service sends `input_audio_transcription.completed` for the first part of a long line before `speech_stopped`, and the transcript branch opened the turn. `G.speechOn` (true from `speech_started` to `speech_stopped`) now blocks that; harnesses that send transcripts without speech events are unchanged.

## After a drop the app repeats Ara's whole last line, with the officer's answer or that it was lost (Oct 29, 3:57 PM call)

Carverhill said "Yes" to "set a capacity rating now?", the line went quiet for 38 s, and the app came back with a bare "Sorry, I lost you for a moment. Could you say that again?" (no form was open, so the form intro did not apply). He asked "say what again?" and Grok guessed the email. Now, with no form open, `lastQuestion()` never says a bare "say that again" when Ara had asked something (her last line ends in a question and is at most 220 characters): the whole line is said again, then "You said: "yes"." when the app had heard the answer, and Ara is guided to act on those words (`q.then` -> `guide()`, the same request the officer-turn watch uses); or "I didn't catch your answer." when the officer talked into the dead air (`G.spokeInGap`). After a statement (no question) the line is the statement again plus "Then you started to say something. Can you repeat what you said?" (Carverhill, 4:15 PM: a bare "say that again" after "Noted, Billy's rating is C." sounded like a request to repeat the rating); only an empty or very long last line gets a bare "Could you say that again?". The strip at the top of `lastQuestion()` also removes a previous "You said" / "didn't catch" tail so a second drop does not stack them.

## A rating answer counts when Ara asked for one; a transcript cut by the drop is not an answer (Oct 29, 4:18 PM call)

Carverhill answered "Let's give her a C." to Ara's "What letter would you give her, A through E?" and the evidence guard refused the rating (no phrase in `ratedIn` matched "give her a C"), so the app asked for the rating again with the ranges. `ratedIn(lines, asked)` now takes the answer when Ara's own last line asked for a rating (capacity, rating, rate, letter, "A through E") and the officer's short reply names a letter, whatever words are around it; the phrase list also learns "give her a C" / "she's a C" / "call it a D". The lesson: a phrase list for a field will always miss the next phrasing; the question Ara just asked is the stronger evidence.

Real-line run on the 4:09 PM build: a drop cut "Record the ask for Elena Vasquez" to "Record the", and the new reconnect line said "You said: "Record the"" and had Ara act on it. `reconnect()` now notes when the officer's speech had started and not stopped (`G.cutMidSpeech`), and `lastQuestion()` treats that as a lost answer ("I didn't catch your answer").

## Every option field takes the answer to the question just asked (Oct 29, after the 4:18 PM call)

The same weakness as the rating guard sat under every pick-list field (`OPTION_WORDS`: meeting type, response, confirmed by, method, ask type, frequency, decision, ally, do-not-contact, texting) and the outcome: a phrase table that the next phrasing misses. `optionAnswered(label, lines, asked)` now runs first: when the line Ara or the app just said listed that option and the officer's reply (12 words or fewer) names it, by its label or its first word of four letters or more, the value stands. The phrase tables remain for answers given unprompted. The evidence check adds a question-asked case and a no-option-named case for every option of every form (937 cases).


## Lists built to be heard: the six rules and the name evidence guard (Oct 29, Carverhill's "Build in all of the items 1 to 6")

After the 4:18 PM call Carverhill asked for a best practice for every list the app offers by voice, so an answer can never be ambiguous. The six rules, now in the code:

1. **One table drives the question and the matcher.** The entity records keep their full names; `ENTITY_KEY` in core.js gives each one its spoken key, `entitySpoken()` is what Ara says and reads back, `fundFromSpoken()` maps a spoken key or a close form back to the record, and `matchEntity()` matches on the record's words or the key's words. The same list feeds Ara's instructions (`ENTITIES_BY_STATE`), the campaign rule, the state note on the opportunity form and the "Which one: ...?" question.
2. **One unique spoken key per option, nothing shared.** "C.A." is gone from every spoken entity: National C3, National C4, National Federal PAC, Idaho C4, Idaho PAC, North Dakota C4, North Dakota State PAC, North Dakota Federal PAC, New Hampshire C4, Pennsylvania C4, Pennsylvania State PAC. "Fed" is said and matched as "Federal".
3. **No option is a bare word of another.** A spoken entity that matches several records (bare "PAC" in North Dakota) gets a short question naming only those: `REQ_Q.fund` asks "Which one: North Dakota State PAC, North Dakota Federal PAC?" when the officer's last line fits two to five entities.
4. **An answer counts when it names a key, a position, or a letter.** `optionAnswered()` accepts "the second one" / "the last one" against the options in the order the question listed them, as well as the option's own words; `ratedIn()` takes a bare letter to a rating question (not a spelled name: "Z E L N I K" is not an E).
5. **Five spoken options at most.** Entities are narrowed by state before they are listed; the full list is never read out.
6. **A yes/no question the app asks itself takes any short answer that isn't a no as a yes.** The read-back now ends "Yes to save, or no to change something?", the substantive question "...yes or no?", the next-step line "Do you want to do that now, yes or no?" (Carverhill: train the officer out of "yeah do that" and "go ahead"). `appYes()` in voiceforms.js: a yes word, or four words or fewer that don't start with a no, a question word or a command and don't contain no/not/wrong/change/undo/cancel/wait/again or a switch word (driving, parked, hands-free). `hfYesHeard` and `officerSubstantive` use it.

**The name evidence guard** (real-line run on the 4:09 PM build: a drop cut "Record the ask for Elena" and Grok guessed "That sounds like Ken Ito"; the form took it). `nameHeard(c)` in evidence.js: a contact Ara names in a tool call counts only when they are open on screen, the open form's target, the last save, or named in the officer's own words or in an Ara line the officer has since answered (an offer plus a yes). Ara's lines since the officer last spoke never count: that is where a guess lives. `draftTool` checks it after the form-asked guard (`unnamed()` / `unnamedError()` in drafts.js, also applied by `resolveTarget` for the other tools) and answers Ara: ask exactly "Which investor is this for?" and wait. The guard is off until the officer has said something, so a tapped flow is untouched.

Also in this build: Ara's own save-question wording is excluded from "a yes to Ara offering a form" in `formAskedFor` (the new wording had let a yes to the read-back open the next form); a long reply that starts with a yes word is an answer, not a request for a form; `lastQuestion()` counts an answer heard in the same instant as Ara's line.
