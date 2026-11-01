// The voice core's one state machine (Carverhill, Oct 31 2026: "Go for phase 1"; Nov 1: "Yes" to phase 2; plan in the doc "Citizens VCRM voice states").
// It is loaded only by preview-sm.html, after the app's own files, and keeps one picture in five parallel parts: the line, the officer, Ara,
// the form and the one check waiting on Ara.
// Phase 2 (Nov 1): the LINE and ARA parts are the app's truth on this page. The app sends their events itself (smSend in voiceline.js and
// voice.js: a line opened, ended, went down, a line test, a reply asked for, started, sounding, done, played out), and every part of the app
// reads them through lineState()/araState()/downAt() (voiceline.js), which this file points at the machine.
// Phase 3 (Nov 1, Carverhill: "Can you test phase 3 of the state machine overnight"): the OFFICER and FORM parts too. The app sends the speech
// events (onEvent in voice.js: speech started, stopped, words in) and the form events (formEvent in every place a form opens, closes, saves or
// changes stage: aratools.js, drafts.js, guide.js, screens.js, voice.js, voiceforms.js), and reads officerState()/formState() (voiceline.js),
// pointed at the machine here. The old flags (G.responding, G.audioOn, G.probing, G.downAt, G.speechOn, the stage meaning of G.saveCheck and
// V.opt) are still written by the shared files for the main preview, but nothing on this page reads them for a state; they go when the machine
// moves to the main page. The CHECK part is still SHADOW: it changes nothing. Every 250 ms the machine's picture is compared with the flags';
// a difference that lasts 600 ms or more is one "disagreement", logged once ("State machine: ...") and kept in window.__sm for the harnesses.
// The four live parts are compared too, machine against the dead flags, so a missed event shows up as a disagreement.
(function () {
  if (typeof XState === "undefined" || typeof G === "undefined") return;
  const { createMachine, createActor, assign } = XState;
  const SM = window.__sm = { diffs: [], counts: {}, transitions: 0, log: [], events: [], phase: 3 }; /* events: the last 200 the app sent, for the harnesses */
  /* the facts every part can read: the line number (an old line's events are ignored), the event number, the officer's last words, the open form, when the line went down */
  const facts = SM.facts = { lineN: 0, eventN: 0, lastWords: null, form: "", speechAt: 0, downAt: 0 };
  const DIFF_MS = 600, TICK_MS = 250, RESP_LIMIT = { where: 3, ask: 2, yesno: 2, tool: 4 }, ASKED_MAX_MS = 10000;

  /* ---------- the machine ---------- */
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
         reply whose sound is still playing on the phone; "asked" is a request not yet answered, given up after ASKED_MAX_MS. A drop or the end of the call clears her */
      ara: { initial: "idle", states: {
        idle: { on: { ARA_ASKED: "asked", ARA_STARTED: "generating", ARA_SOUND: "playing" } },
        asked: { after: { [ASKED_MAX_MS]: "idle" }, on: { ARA_STARTED: "generating", ARA_SOUND: "playing", ARA_DONE: "idle", LINE_DROP: "idle", CALL_END: "idle" } },
        generating: { on: { ARA_SOUND: "playing", ARA_DONE: [{ target: "draining", guard: "audioLeft" }, { target: "idle" }], LINE_DROP: "idle", CALL_END: "idle" } },
        playing: { on: { ARA_DONE: [{ target: "draining", guard: "audioLeft" }, { target: "idle" }], LINE_DROP: "idle", CALL_END: "idle" } },
        draining: { on: { ARA_PLAYED: "idle", ARA_STARTED: "generating", ARA_ASKED: "asked", LINE_DROP: "idle", CALL_END: "idle" } } } },
      form: { initial: "none", states: {
        none: { on: { FORM_OPEN: "asking", FORM_READBACK: "readback" } },
        asking: { on: { FORM_READBACK: "readback", FORM_OPTIONAL: "optional", FORM_SAVED: "saved", FORM_CLOSED: "none", FORM_OPEN: "asking" } },
        optional: { on: { FORM_READBACK: "readback", FORM_ASKING: "asking", FORM_SAVED: "saved", FORM_CLOSED: "none", FORM_OPEN: "asking" } },
        readback: { on: { FORM_ASKING: "asking", FORM_OPTIONAL: "optional", FORM_SAVED: "saved", FORM_CLOSED: "none", FORM_OPEN: "asking" } },
        saved: { on: { FORM_OPEN: "asking", FORM_READBACK: "readback", FORM_CLOSED: "none", NEXT_OVER: "none" } } } },
      check: { initial: "none", states: {
        none: { on: { CHECK_START: { target: "waiting", actions: "startCheck" } } },
        /* one check at a time: a new one replaces the old; it ends when the officer speaks, the form changes, the line drops,
           or Ara has replied as often as that kind allows (the app's own pass/fail decides earlier, through CHECK_END) */
        waiting: { on: {
          CHECK_START: { target: "waiting", reenter: true, actions: "startCheck" }, CHECK_END: { target: "none", actions: "endCheck" },
          SPEECH_START: { target: "none", actions: "endCheck" }, LINE_DROP: { target: "none", actions: "endCheck" }, CALL_END: { target: "none", actions: "endCheck" },
          FORM_OPEN: { target: "none", actions: "endCheck", guard: "formChanged" }, FORM_CLOSED: { target: "none", actions: "endCheck", guard: "formChanged" },
          ARA_DONE: [{ target: "none", actions: "endCheck", guard: "repliesUsed" }, { actions: "countReply" }] } } } }
    },
  }, {
    actions: {
      startCheck: assign({ check: ({ event }) => ({ kind: event.kind, at: Date.now(), replies: 0, form: facts.form }) }),
      endCheck: assign({ check: null }),
      countReply: assign({ check: ({ context }) => context.check ? Object.assign({}, context.check, { replies: context.check.replies + 1 }) : null })
    },
    guards: {
      formChanged: ({ context, event }) => !!context.check && (event.form || "") !== context.check.form,
      repliesUsed: ({ context }) => !!context.check && context.check.replies + 1 >= (RESP_LIMIT[context.check.kind] || 3),
      audioLeft: () => playingLeft() > 0
    }
  });
  const actor = createActor(machine); actor.start();
  let last = JSON.stringify(actor.getSnapshot().value);
  actor.subscribe(s => { const v = JSON.stringify(s.value); if (v !== last) { SM.transitions++; last = v; } });
  const send = (type, extra) => { facts.eventN++; facts.lineN = lineN(); SM.events.push(Date.now() + " " + type); if (SM.events.length > 200) SM.events.shift();
    if (type === "SPEECH_START") facts.speechAt = Date.now(); else if (type === "WORDS") facts.lastWords = { text: extra && extra.text || "", at: Date.now() }; else if (type === "FORM_OPEN" || type === "FORM_CLOSED") facts.form = extra && extra.form || "";
    try { actor.send(Object.assign({ type }, extra || {})); } catch (e) { note("send failed: " + e.message); } };
  const state = () => actor.getSnapshot().value;
  SM.state = state; SM.send = send; SM.machine = machine;
  function note(text) { SM.log.push(Date.now() + " " + text); if (SM.log.length > 400) SM.log.shift(); }

  /* ---------- phases 2 and 3: the line, Ara, officer and form parts are what the app reads; the flags' own answers are kept for the comparison ---------- */
  const flagLine = lineState, flagAra = araState, flagDownAt = downAt, flagOfficer = officerState, flagForm = formState;
  smSend = send;
  lineState = () => state().line;
  araState = () => state().ara;
  downAt = () => facts.downAt;
  officerState = () => state().officer;
  formState = () => state().form;

  /* ---------- what the machine still listens to through wrappers (check: shadow) ---------- */
  const wrap = (name, before, after) => { const f = window[name]; if (typeof f !== "function") { note("not found: " + name); return; }
    window[name] = function () { try { before && before.apply(this, arguments); } catch (e) {} const r = f.apply(this, arguments); try { after && after.apply(this, [r].concat([].slice.call(arguments))); } catch (e) {} return r; }; };
  const KIND = { ctxWatch: "where", sayWatch: "ask", ynWatch: "yesno", nudge: "tool" };
  wrap("oneCheck", (keep) => { if (keep) send("CHECK_START", { kind: KIND[keep] || keep }); }); /* every check on Ara starts through oneCheck */

  /* ---------- the picture the flags give, the same five parts ---------- */
  function flagPicture() {
    const line = flagLine(), ara = flagAra(), officer = flagOfficer(), form = flagForm();
    const checks = [G.ctxWatch && "where", G.sayWatch && "ask", G.ynWatch && "yesno", G.nudge && "tool"].filter(Boolean);
    return { line, officer, ara, form, check: checks.length ? checks.join("+") : "none" };
  }
  /* parts are compared only where both pictures mean the same thing; a few machine states have no flag equivalent */
  const SAME = {
    line: (m, f) => m === f || (m === "reconnecting" && f === "down") || (m === "down" && f === "reconnecting"),
    officer: (m, f) => m === f || ((m === "said" || m === "uncertain") && f === "silent"),
    ara: (m, f) => m === f || (m === "asked" && (f === "idle" || f === "draining")) || (m === "idle" && f === "asked"), /* a request sent while the last reply's sound still plays */
    form: (m, f) => m === f || (m === "saved" && f === "none") || (m === "none" && f === "saved"),
    check: (m, f) => (m === "none") === (f === "none") && !/\+/.test(f)
  };
  /* a saved form's next-step offer is over two minutes after the save (the flags' own window) */
  function feedSaved() { if (state().form === "saved" && G.lastSaved && Date.now() - G.lastSaved.at > 120000) send("NEXT_OVER"); }
  /* the checks the app arms inline (no function to listen to) start when their flag appears; any check ends when its flags clear */
  let checksSeen = "none";
  function feedChecks(f) {
    if (f.check !== checksSeen) {
      const had = checksSeen.split("+"), now = f.check.split("+");
      now.filter(k => k !== "none" && !had.includes(k) && (k === "yesno" || k === "tool")).forEach(k => send("CHECK_START", { kind: k }));
      if (f.check === "none" && state().check !== "none") send("CHECK_END");
      checksSeen = f.check;
    }
  }
  const open = {};
  function compare() {
    if (!G.live && state().line === "ended") { Object.keys(open).forEach(k => delete open[k]); return; }
    const m = state(), f = flagPicture(), now = Date.now();
    feedSaved(); feedChecks(f);
    ["line", "officer", "ara", "form", "check"].forEach(part => {
      const mv = typeof m[part] === "string" ? m[part] : Object.keys(m[part])[0], fv = f[part];
      if (SAME[part](mv, fv)) { if (open[part] && open[part].logged) note(`${part} agrees again after ${((now - open[part].at) / 1000).toFixed(1)} s`); delete open[part]; return; }
      const key = mv + " / " + fv;
      if (!open[part] || open[part].key !== key) { open[part] = { key, at: now, logged: false }; return; }
      if (!open[part].logged && now - open[part].at >= DIFF_MS) {
        open[part].logged = true; const k = `${part}: machine ${mv}, flags ${fv}`; SM.counts[k] = (SM.counts[k] || 0) + 1;
        const d = { at: now, part, machine: mv, flags: fv, status: G.status, form: typeof V !== "undefined" && V ? V.action : "", lineN: facts.lineN };
        SM.diffs.push(d); if (SM.diffs.length > 500) SM.diffs.shift();
        if (SM.counts[k] <= 3 && typeof act === "function") act("step", `State machine: the ${part} is "${mv}" but the flags say "${fv}" (${part === "check" ? "shadow only, nothing changed" : "the machine decides on this page"})`);
      }
    });
  }
  setInterval(() => { try { compare(); } catch (e) { note("compare failed: " + e.message); } }, TICK_MS);
  setInterval(() => { try { if (state().ara === "draining" && !(playingLeft() > 0)) send("ARA_PLAYED"); } catch (e) {} }, TICK_MS); /* a source whose onended never fires */
  note("state machine started, phase 3 (XState " + (XState.VERSION || "5.33.3") + ")");
})();
