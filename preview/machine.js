// The voice core's one state machine, phase 1: SHADOW (Carverhill, Oct 31 2026: "Go for phase 1"; plan in the doc "Citizens VCRM voice states").
// It is loaded only by preview-sm.html, after the app's own files. It listens to the same events the app does (the voice service's
// messages, what the app sends, the app's own steps) and keeps its own picture in five parallel parts: the line, the officer, Ara,
// the form and the one check waiting on Ara. It CHANGES NOTHING: the app still runs on its flags (G, V). Every 250 ms the
// machine's picture is compared with the one the flags give; a difference that lasts 600 ms or more is one "disagreement",
// logged once ("State machine: ...") and kept in window.__sm for the harnesses. Each disagreement is either a fix to the
// machine or a bug hiding in the flags. Phases 2 to 4 hand each part over to the machine and delete its flags.
(function () {
  if (typeof XState === "undefined" || typeof G === "undefined") return;
  const { createMachine, createActor, assign } = XState;
  const SM = window.__sm = { diffs: [], counts: {}, transitions: 0, log: [] };
  /* the facts every part can read: the line number (an old line's events are ignored), the event number, the officer's last words, the open form */
  const facts = SM.facts = { lineN: 0, eventN: 0, lastWords: null, form: "", speechAt: 0 };
  const DIFF_MS = 600, TICK_MS = 250, RESP_LIMIT = { where: 3, ask: 2, yesno: 2, tool: 4 };

  /* ---------- the machine ---------- */
  const machine = createMachine({
    id: "voice", type: "parallel",
    context: { check: null },
    states: {
      line: { initial: "ended", states: {
        ended: { on: { CALL_START: "reconnecting" } },
        reconnecting: { on: { LINE_UP: "connected", LINE_DOWN: "down", CALL_END: "ended" } },
        connected: { on: { LINE_DROP: "reconnecting", TEST_START: "testing", CALL_END: "ended" } },
        testing: { on: { TEST_END: "connected", LINE_DROP: "reconnecting", CALL_END: "ended" } },
        down: { on: { LINE_UP: "connected", CALL_END: "ended" } } } },
      officer: { initial: "silent", states: {
        silent: { on: { SPEECH_START: "speaking", WORDS: "said" } },
        /* words can arrive while the officer is still talking (real Grok sends growing transcripts): they stay "speaking" until the speech stops */
        speaking: { on: { SPEECH_STOP: [{ target: "said", guard: () => facts.lastWords && facts.lastWords.at >= facts.speechAt }, { target: "silent" }], LINE_DROP: "uncertain", CALL_END: "silent" } },
        said: { on: { SPEECH_START: "speaking", ARA_STARTED: "silent", ARA_ASKED: "silent", CALL_END: "silent" } },
        uncertain: { on: { SPEECH_START: "speaking", WORDS: "said", ARA_STARTED: "silent", CALL_END: "silent" } } } },
      ara: { initial: "idle", states: {
        idle: { on: { ARA_ASKED: "asked", ARA_STARTED: "generating", ARA_SOUND: "playing" } },
        asked: { on: { ARA_STARTED: "generating", ARA_SOUND: "playing", ARA_DONE: "idle", LINE_DROP: "idle", CALL_END: "idle" } },
        generating: { on: { ARA_SOUND: "playing", ARA_DONE: "idle", LINE_DROP: "idle", CALL_END: "idle", SPEECH_START: "idle" } },
        playing: { on: { ARA_PLAYED: "idle", LINE_DROP: "idle", CALL_END: "idle", SPEECH_START: "idle" } } } },
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
      repliesUsed: ({ context }) => !!context.check && context.check.replies + 1 >= (RESP_LIMIT[context.check.kind] || 3)
    }
  });
  const actor = createActor(machine); actor.start();
  let last = JSON.stringify(actor.getSnapshot().value);
  actor.subscribe(s => { const v = JSON.stringify(s.value); if (v !== last) { SM.transitions++; last = v; } });
  const send = (type, extra) => { facts.eventN++; try { actor.send(Object.assign({ type }, extra || {})); } catch (e) { note("send failed: " + e.message); } };
  const state = () => actor.getSnapshot().value;
  SM.state = state; SM.send = send; SM.machine = machine;
  function note(text) { SM.log.push(Date.now() + " " + text); if (SM.log.length > 400) SM.log.shift(); }

  /* ---------- what the machine listens to (wrappers call the app's own function first; nothing else changes) ---------- */
  const wrap = (name, before, after) => { const f = window[name]; if (typeof f !== "function") { note("not found: " + name); return; }
    window[name] = function () { try { before && before.apply(this, arguments); } catch (e) {} const r = f.apply(this, arguments); try { after && after.apply(this, [r].concat([].slice.call(arguments))); } catch (e) {} return r; }; };
  let wsSeen = null;
  wrap("onEvent", (e) => {
    const t = e && e.type || "";
    if (G.ws && G.ws !== wsSeen) { wsSeen = G.ws; facts.lineN++; }
    const ln = state().line; if (G.live && (ln === "reconnecting" || ln === "down")) send("LINE_UP"); /* a message on the current line means it is up */
    if (t === "input_audio_buffer.speech_started") { facts.speechAt = Date.now(); send("SPEECH_START"); }
    else if (t === "input_audio_buffer.speech_stopped") send("SPEECH_STOP");
    else if (/input_audio_transcription\.completed$/.test(t)) { facts.lastWords = { text: e.transcript || "", at: Date.now() }; send("WORDS"); }
    else if (t === "response.created") send("ARA_STARTED");
    else if (/audio\.delta$/.test(t)) send("ARA_SOUND");
    else if (t === "response.done") { send("ARA_DONE"); if (!(playingLeft() > 0)) send("ARA_PLAYED"); }
  });
  wrap("startCall", () => send("CALL_START"));
  wrap("endCall", () => send("CALL_END"));
  wrap("reconnect", () => send("LINE_DROP"));
  wrap("linePrep", () => { if (G.live) send("LINE_UP"); }); /* called the moment a line opens (a first line, a reconnect, the reopen after a lock) */
  /* a check starts on the form as it stands now, not as the last tick saw it */
  const KIND = { ctxWatch: "where", sayWatch: "ask", ynWatch: "yesno", nudge: "tool" };
  wrap("oneCheck", (keep) => { if (keep) { feedForm(); send("CHECK_START", { kind: KIND[keep] || keep }); } }); /* every check on Ara starts through oneCheck */
  ["draftTool", "grokSaved", "hfReadback", "cancelForm", "optStep"].forEach(n => wrap(n, null, () => feedForm()));
  /* what the app sends: a reply request or a scripted line is Ara being asked */
  const P = window.WebSocket && window.WebSocket.prototype;
  if (P && P.send) { const s0 = P.send; P.send = function (d) { try { if (typeof d === "string" && d.length < 200000) { const o = JSON.parse(d); if (o.type === "response.create" || (o.item && o.item.type === "force_message")) send("ARA_ASKED"); } } catch (e) {} return s0.apply(this, arguments); }; }

  /* ---------- the picture the flags give, the same five parts ---------- */
  function flagPicture() {
    const st = String(G.status || "");
    const line = !G.live ? "ended" : /^Reconnecting|^Connecting/.test(st) ? (G.downAt ? "down" : "reconnecting") : G.probing ? "testing" : "connected";
    const officer = G.speechOn ? "speaking" : "silent";
    const ara = playingLeft() > 0 ? "playing" : G.responding ? "generating" : "idle";
    const form = typeof V === "undefined" || !V ? (G.lastSaved && G.lastSaved.at && Date.now() - G.lastSaved.at < 120000 ? "saved" : "none") : G.saveCheck ? "readback" : V.opt ? "optional" : "asking";
    const checks = [G.ctxWatch && "where", G.sayWatch && "ask", G.ynWatch && "yesno", G.nudge && "tool"].filter(Boolean);
    return { line, officer, ara, form, check: checks.length ? checks.join("+") : "none" };
  }
  /* parts are compared only where both pictures mean the same thing; a few machine states have no flag equivalent */
  const SAME = {
    line: (m, f) => m === f || (m === "reconnecting" && f === "down") || (m === "down" && f === "reconnecting"),
    officer: (m, f) => m === f || ((m === "said" || m === "uncertain") && f === "silent"),
    ara: (m, f) => m === f || (m === "asked" && f === "idle") || (m === "generating" && f === "playing") || (m === "playing" && f === "generating"),
    form: (m, f) => m === f || (m === "saved" && f === "none") || (m === "none" && f === "saved"),
    check: (m, f) => (m === "none") === (f === "none") && !/\+/.test(f)
  };
  /* the form part follows V (in phase 1 the form events come from watching V; phase 3 makes them the app's own) */
  let formSeen = "", rbSeen = false, optSeen = false, savedSeen = 0;
  function feedForm() {
    const a = typeof V !== "undefined" && V ? V.action : "";
    if (G.lastSaved && G.lastSaved.at && G.lastSaved.at !== savedSeen) { savedSeen = G.lastSaved.at; send("FORM_SAVED"); }
    if (a !== formSeen) { facts.form = a; send(a ? "FORM_OPEN" : "FORM_CLOSED", { form: a }); formSeen = a; rbSeen = optSeen = false; }
    if (a) { const rb = !!G.saveCheck, op = !!V.opt; if (rb && !rbSeen) send("FORM_READBACK"); else if (!rb && rbSeen) send(op ? "FORM_OPTIONAL" : "FORM_ASKING");
      if (op && !optSeen && !rb) send("FORM_OPTIONAL"); rbSeen = rb; optSeen = op; }
    else if (state().form === "saved" && G.lastSaved && Date.now() - G.lastSaved.at > 120000) send("NEXT_OVER");
  }
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
    feedForm(); feedChecks(f);
    ["line", "officer", "ara", "form", "check"].forEach(part => {
      const mv = typeof m[part] === "string" ? m[part] : Object.keys(m[part])[0], fv = f[part];
      if (SAME[part](mv, fv)) { if (open[part] && open[part].logged) note(`${part} agrees again after ${((now - open[part].at) / 1000).toFixed(1)} s`); delete open[part]; return; }
      const key = mv + " / " + fv;
      if (!open[part] || open[part].key !== key) { open[part] = { key, at: now, logged: false }; return; }
      if (!open[part].logged && now - open[part].at >= DIFF_MS) {
        open[part].logged = true; const k = `${part}: machine ${mv}, flags ${fv}`; SM.counts[k] = (SM.counts[k] || 0) + 1;
        const d = { at: now, part, machine: mv, flags: fv, status: G.status, form: typeof V !== "undefined" && V ? V.action : "", lineN: facts.lineN };
        SM.diffs.push(d); if (SM.diffs.length > 500) SM.diffs.shift();
        if (SM.counts[k] <= 3 && typeof act === "function") act("step", `State machine: the ${part} is "${mv}" but the flags say "${fv}" (shadow only, nothing changed)`);
      }
    });
  }
  setInterval(() => { try { compare(); } catch (e) { note("compare failed: " + e.message); } }, TICK_MS);
  setInterval(() => { try { if (state().ara === "playing" && !(playingLeft() > 0) && !G.audioOn) send("ARA_PLAYED"); } catch (e) {} }, TICK_MS);
  note("shadow machine started (XState " + (XState.VERSION || "5.33.3") + ")");
})();
