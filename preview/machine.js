// The voice core's one state machine (Carverhill, Oct 31 2026: "Go for phase 1"; Nov 1: phases 2 to 4 on a second page beside the old flags, then,
// on his "Go" to step 3, the app's one truth on the main page). Loaded after the app's own files, it keeps one picture in five parallel parts: the
// line, the officer, Ara, the form and the one check waiting on Ara.
// The app sends every event itself (smSend: a line opened, ended, went down, a line test; a reply asked for, started, sounding, done, played out;
// the officer's speech started, stopped, words in; a form opened, closed, saved, read back, its optional questions; a check started or ended), and
// reads the picture only through the readers this file sets: lineState(), araState(), downAt(), officerState(), formState(), checkNow() (voiceline.js).
// The check part also ends a check by itself when the officer speaks (the kinds CHECK_RULES says), the form changes, the line drops, the call ends or
// Ara has used the worded replies CHECK_RULES allows (the app's own forced lines, dropped doubles and cancelled replies don't count): the app
// sees it through checkNow(), with the reason logged. window.__sm carries the events, the transitions and the checks it ended, for the harnesses.
(function () {
  if (typeof XState === "undefined") throw new Error("preview/vendor/xstate-5.33.3.umd.min.js didn't load: the voice core can't run without its state machine");
  const { createMachine, createActor, assign } = XState;
  const SM = window.__sm = { ended: {}, transitions: 0, log: [], events: [] }; /* ended: checks the machine ended itself, by kind and reason */ /* events: the last 200 the app sent, for the harnesses */
  /* the facts the parts read: the officer's last words and when their speech started, when the line went down, the replies started */
  const facts = SM.facts = { lastWords: null, speechAt: 0, downAt: 0, respN: 0 }; /* respN: replies started, so a check armed mid-reply doesn't count that reply */
  const END_WHY = { SPEECH_START: "the officer spoke", LINE_DROP: "the line dropped", CALL_END: "the call ended", FORM_OPEN: "the form changed", FORM_CLOSED: "the form closed", ARA_DONE: "Ara's replies were used up" }; /* why the machine ended a check, by the event */
  const TICK_MS = 250, ASKED_MAX_MS = 10000, REFUSED_MS = 6000, NEXT_STEP_MS = 120000;

  /* ---------- the machine ---------- */
  const countsReply = ({ context, event }) => !!event.words && !!context.check && context.check.respN !== facts.respN;
  const machine = createMachine({
    id: "voice", type: "parallel",
    context: { check: null },
    states: {
      /* the line: the call's first line is "opening"; a line that ended leaves "reconnecting" until a new one opens; "down" once the phone has said so */
      line: { initial: "ended", states: {
        ended: { on: { CALL_START: "opening" } },
        opening: { on: { LINE_UP: "connected", LINE_DROP: "reconnecting", CALL_END: "ended" } },
        reconnecting: { on: { LINE_UP: "connected", LINE_DOWN: "down", CALL_END: "ended" } },
        connected: { on: { LINE_DROP: "reconnecting", TEST_START: "testing", CALL_END: "ended" } },
        testing: { on: { TEST_END: "connected", LINE_DROP: "reconnecting", CALL_END: "ended" } },
        down: { entry: () => { facts.downAt = Date.now(); }, exit: () => { facts.downAt = 0; }, on: { LINE_UP: "connected", CALL_END: "ended" } } } },
      officer: { initial: "silent", states: {
        silent: { on: { SPEECH_START: "speaking", WORDS: "said" } },
        /* words can arrive while the officer is still talking (real Grok sends growing transcripts): they stay "speaking" until the speech stops */
        speaking: { on: { SPEECH_STOP: [{ target: "said", guard: () => facts.lastWords && facts.lastWords.at >= facts.speechAt }, { target: "silent" }], LINE_DROP: "uncertain", CALL_END: "silent" } },
        said: { on: { SPEECH_START: "speaking", ARA_STARTED: "silent", ARA_ASKED: "silent", CALL_END: "silent" } },
        uncertain: { on: { SPEECH_START: "speaking", WORDS: "said", ARA_STARTED: "silent", CALL_END: "silent" } } } },
      /* Ara: a reply is open from response.created to response.done ("generating", then "playing" once its sound arrives); "draining" is a finished
         reply whose sound is still playing on the phone; "asked" is a request not yet answered, given up after ASKED_MAX_MS; "busy" is the service refusing a
         request because a reply the app never saw start is running, taken as over after REFUSED_MS. A drop or the end of the call clears her */
      ara: { initial: "idle", states: {
        idle: { on: { ARA_ASKED: "asked", ARA_STARTED: "generating", ARA_SOUND: "playing", ARA_REFUSED: "busy" } },
        asked: { after: { [ASKED_MAX_MS]: "idle" }, on: { ARA_STARTED: "generating", ARA_SOUND: "playing", ARA_DONE: "idle", ARA_REFUSED: "busy", LINE_DROP: "idle", CALL_END: "idle" } },
        busy: { after: { [REFUSED_MS]: "idle" }, on: { ARA_STARTED: "generating", ARA_SOUND: "playing", ARA_DONE: "idle", LINE_DROP: "idle", CALL_END: "idle" } },
        generating: { on: { ARA_SOUND: "playing", ARA_DONE: [{ target: "draining", guard: "audioLeft" }, { target: "idle" }], LINE_DROP: "idle", CALL_END: "idle" } },
        playing: { on: { ARA_DONE: [{ target: "draining", guard: "audioLeft" }, { target: "idle" }], LINE_DROP: "idle", CALL_END: "idle" } },
        draining: { on: { ARA_PLAYED: "idle", ARA_STARTED: "generating", ARA_ASKED: "asked", ARA_REFUSED: "busy", LINE_DROP: "idle", CALL_END: "idle" } } } },
      form: { initial: "none", states: {
        none: { on: { FORM_OPEN: "asking", FORM_READBACK: "readback" } },
        asking: { on: { FORM_READBACK: "readback", FORM_OPTIONAL: "optional", FORM_SAVED: "saved", FORM_CLOSED: "none", FORM_OPEN: "asking" } },
        optional: { on: { FORM_READBACK: "readback", FORM_ASKING: "asking", FORM_SAVED: "saved", FORM_CLOSED: "none", FORM_OPEN: "asking" } },
        readback: { on: { FORM_ASKING: "asking", FORM_OPTIONAL: "optional", FORM_SAVED: "saved", FORM_CLOSED: "none", FORM_OPEN: "asking" } },
        saved: { after: { [NEXT_STEP_MS]: "none" }, on: { FORM_OPEN: "asking", FORM_READBACK: "readback", FORM_CLOSED: "none" } } } }, /* a saved form's next-step offer is over two minutes after the save */
      check: { initial: "none", states: {
        none: { on: { CHECK_START: { target: "waiting", actions: "startCheck" } } },
        /* one check at a time: a new one replaces the old; it ends when the officer speaks, the form changes, the line drops,
           or Ara has replied as often as that kind allows (the app's own pass/fail decides earlier, through CHECK_END) */
        waiting: { on: {
          CHECK_START: { target: "waiting", reenter: true, actions: "startCheck" }, CHECK_END: { target: "none", actions: "endCheck" },
          SPEECH_START: { target: "none", actions: ["machineEnd", "endCheck"], guard: "spokenEnds" }, LINE_DROP: { target: "none", actions: ["machineEnd", "endCheck"] }, CALL_END: { target: "none", actions: ["machineEnd", "endCheck"] },
          FORM_OPEN: { target: "none", actions: ["machineEnd", "endCheck"], guard: "formChanged" }, FORM_CLOSED: { target: "none", actions: ["machineEnd", "endCheck"], guard: "formChanged" },
          ARA_DONE: [{ target: "none", actions: ["machineEnd", "endCheck"], guard: "repliesUsed" }, { actions: "countReply", guard: "countsReply" }] } } } }
    },
  }, {
    actions: {
      startCheck: assign({ check: ({ event }) => ({ kind: event.kind, data: event.data || null, at: Date.now(), replies: 0, form: event.form, respN: facts.respN }) }),
      endCheck: assign({ check: null }),
      /* the machine ended the check itself (Nov 1 Pat run: 340 stale yes/no watches after Ara opened the offered form), with the reason logged;
         a check the app ends first (its own stand-down line) never gets here */
      machineEnd: ({ context, event }) => { const c = context.check; if (!c) return; const why = END_WHY[event.type] || event.type, k = `${c.kind}: ${why}`; SM.ended[k] = (SM.ended[k] || 0) + 1;
        act("step", c.kind === "ctxWatch" && event.type === "FORM_OPEN" ? "Another form opened: the ask for where we were stands down (the machine)" : `check ${c.kind} ended by the machine: ${why}`); }, /* the app's own wording, so the reports count it the same */
      countReply: assign({ check: ({ context }) => context.check ? Object.assign({}, context.check, { replies: context.check.replies + 1 }) : null })
    },
    guards: {
      formChanged: ({ context, event }) => !!context.check && (event.form || "") !== context.check.form,
      spokenEnds: ({ context }) => !!context.check && checkRule(context.check.kind).onSpeech, /* a yes/no or say check waits for the officer's words, not the sound */
      countsReply, /* a worded reply, not the one the check was armed in (the app skips it too) */
      repliesUsed: (a) => countsReply(a) && a.context.check.replies >= checkRule(a.context.check.kind).asks, /* this reply is one past the app's own asks: the app decides, this is the net */
      audioLeft: () => playingLeft() > 0
    }
  });
  const actor = createActor(machine); actor.start();
  let last = JSON.stringify(actor.getSnapshot().value);
  actor.subscribe(s => { const v = JSON.stringify(s.value); if (v !== last) { SM.transitions++; last = v; } });
  const send = (type, extra) => { SM.events.push(Date.now() + " " + type); if (SM.events.length > 200) SM.events.shift();
    if (type === "SPEECH_START") facts.speechAt = Date.now(); else if (type === "ARA_STARTED") facts.respN++; else if (type === "WORDS") facts.lastWords = { text: extra && extra.text || "", at: Date.now() };
    try { actor.send(Object.assign({ type }, extra || {})); } catch (e) { note("send failed: " + e.message); } };
  const state = () => actor.getSnapshot().value;
  SM.state = state; SM.send = send; SM.machine = machine;
  function note(text) { SM.log.push(Date.now() + " " + text); if (SM.log.length > 400) SM.log.shift(); }

  /* ---------- the readers the app uses (declared in voiceline.js) ---------- */
  smSend = send;
  lineState = () => state().line;
  araState = () => state().ara;
  downAt = () => facts.downAt;
  officerState = () => state().officer;
  formState = () => state().form;
  checkNow = (kind) => { const c = actor.getSnapshot().context.check; return state().check !== "none" && c && (!kind || c.kind === kind) ? c.data : null; };
  /* a source whose onended never fires: the drain is over when nothing is left to play */
  setInterval(() => { try { if (state().ara === "draining" && !(playingLeft() > 0)) send("ARA_PLAYED"); } catch (e) { note("tick failed: " + e.message); } }, TICK_MS);
  note("state machine started (XState " + (XState.VERSION || "5.33.3") + ")");
})();
