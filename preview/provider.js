// Citizens VCRM demo: the voice engines (loaded after core.js; all files share one scope).
// Grok (xAI) is the engine the proof of concept runs on. OpenAI Realtime is a preview-only alternative, added Oct 27 so the
// same conversations can be run against another engine and compared (Carverhill: "run the same harness but with two new
// providers"). Everything provider-specific lives here: the socket address, the session shape, scripted lines, a dropped line.
// The rest of the app speaks the event family xAI copied from OpenAI (session.update, response.create, function_call_output…).
const OPENAI_MODEL = "gpt-realtime-2.1";
const GEMINI_MODEL = "gemini-3.8-live", GEMINI_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
const PROVIDERS = {
  grok: { name: "Grok (xAI)", voices: ["ara", "eve", "rex", "sal", "leo"], defVoice: "ara", host: /api\.x\.ai/,
    url: (resume) => "wss://api.x.ai/v1/realtime?model=grok-voice-latest" + (resume ? "&conversation_id=" + encodeURIComponent(resume) : ""),
    protocols: (token) => ["xai-client-secret." + token],
    resume: true,    // a dropped line picks up the same conversation (conversation_id)
    forceItem: true, // a scripted line is said word for word (force_message)
    extras: true },  // resumption, pronunciation fixes, key terms (sendExtras)
  openai: { name: "OpenAI (" + OPENAI_MODEL + ")", voices: ["marin", "cedar", "sage", "coral", "alloy", "ash", "ballad", "echo", "shimmer", "verse"], defVoice: "marin", host: /api\.openai\.com/,
    url: () => "wss://api.openai.com/v1/realtime?model=" + OPENAI_MODEL,
    protocols: (token) => ["realtime", "openai-insecure-api-key." + token],
    resume: false, replay: true, forceItem: false, extras: false, // replay: the last lines go into a new session as text after a drop
    serial: true, silentEmpty: true, // one reply request at a time (OpenAI refuses a second while one runs); a finished reply with no words is silence, not a dead line
    rules: "- Call the tool first, with no words before it; speak only after its result comes back. Never say what you are about to do." },
  gemini: { name: "Gemini (" + GEMINI_MODEL + ")", voices: ["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"], defVoice: "Kore", host: /generativelanguage\.googleapis\.com/,
    url: (resume, token) => GEMINI_URL + "?access_token=" + encodeURIComponent(token), protocols: () => [],
    open: (token) => new GeminiSocket(token), // the Live API speaks another envelope: a translating socket (below) keeps the rest of the app unchanged
    resume: false, forceItem: false, extras: false }, // its own resumption handle (sessionResumptionUpdate) is kept by the socket, not conversation_id
};
const provider = () => PROVIDERS[S.settings.provider] ? S.settings.provider : "grok";
const PROV = () => PROVIDERS[provider()];
const providerVoice = () => { const P = PROV(); return P.voices.includes(S.settings.voice) ? S.settings.voice : P.defVoice; };
// the session body per engine, from the Grok-shaped one (sessionCfg): OpenAI puts turn detection and transcription under audio.input and needs type/model
function providerSession(cfg) {
  if (provider() !== "openai") return cfg;
  return { type: "realtime", model: OPENAI_MODEL, output_modalities: ["audio"], instructions: cfg.instructions, tools: cfg.tools, tool_choice: "auto",
    audio: { input: { format: { type: "audio/pcm", rate: 24000 }, turn_detection: { type: "server_vad" }, transcription: { model: "gpt-4o-transcribe", language: "en" } },
      output: { format: { type: "audio/pcm", rate: 24000 }, voice: providerVoice(), speed: cfg.audio && cfg.audio.output ? cfg.audio.output.speed : 1 } } };
}
// a partial session update (new instructions, a new speed): OpenAI wants the session type on every update
function sessUpdate(session) { send({ type: "session.update", session: provider() !== "openai" ? session : session.tools ? providerSession(session) : Object.assign({ type: "realtime" }, session) }); }
// OpenAI has no conversation resumption: after a drop the last lines go into the new session as text, so the assistant knows where it was
function replayRecent() {
  const lines = (G.recent || []).slice(-8); if (!lines.length) return; G.replaying = true;
  lines.forEach(l => { const m = /^([^:]+): (.*)$/.exec(l); if (!m) return; const user = m[1] === "Officer";
    send({ type: "conversation.item.create", item: { type: "message", role: user ? "user" : "assistant", content: [{ type: user ? "input_text" : "output_text", text: m[2] }] } }); });
  send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: "(The line dropped and is back. Carry on from where we were; don't greet me again.)" }] } });
  G.replaying = false; vlog(`replayed ${lines.length} lines into the new session`); act("step", `New line on ${PROV().name}: the last ${lines.length} lines were replayed as text (no conversation resumption on this engine)`);
}
// a scripted line on an engine without force_message: the assistant is asked, in a reply of its own, to say it word for word (not guaranteed; forcedEvent checks what it said)
function forceByReply(text) { send({ type: "response.create", response: { instructions: `Say this now, word for word, with nothing before or after it: "${text}"` } }); }

/* ---------- Gemini Live: a socket that speaks the app's event family on one side and the Live API's envelope on the other ----------
   App -> Gemini: session.update (first, with tools) -> setup; later instruction updates -> the Right now section as a quiet user turn;
   input_audio_buffer.append (24 kHz) -> realtimeInput.audio at 16 kHz; function_call_output -> toolResponse (the app's guidance for the
   reply rides inside it, since Gemini carries on by itself after a tool result: a second request would make a second reply);
   response.create -> a user turn with the guidance; message items -> clientContent; response.cancel -> nothing (Gemini stops itself).
   Gemini -> app: setupComplete -> session.created; inputTranscription -> speech_started + input_audio_transcription.completed (when the
   model's turn begins); modelTurn audio -> response.created + output_audio.delta; outputTranscription -> output_audio_transcript.delta;
   toolCall -> function_call_arguments.done; turnComplete -> response.done completed; interrupted -> response.done cancelled;
   goAway -> the line is closed so the app reopens it (reconnect) with the resumption handle; sessionResumptionUpdate -> the handle. */
class GeminiSocket {
  constructor(token) {
    this.readyState = 0; this.ready = false; this.audioQ = []; this.inText = ""; this.inStarted = false; this.turn = false; this.calls = {}; this.pendingTool = null; this.setup = false;
    const raw = this.raw = new WebSocket(GEMINI_URL + "?access_token=" + encodeURIComponent(token));
    raw.onopen = () => { this.readyState = 1; if (this.onopen) this.onopen(); };
    raw.onmessage = (m) => { let e; try { e = JSON.parse(typeof m.data === "string" ? m.data : ""); } catch (x) { if (m.data instanceof Blob) m.data.text().then(t => { try { this.recv(JSON.parse(t)); } catch (y) {} }); return; } this.recv(e); };
    raw.onclose = (ev) => { this.readyState = 3; if (this.onclose) this.onclose(ev); };
    raw.onerror = (ev) => { if (this.onerror) this.onerror(ev); };
  }
  close() { this.readyState = 3; try { this.raw.close(); } catch (e) {} }
  emit(ev) { if (this.onmessage) this.onmessage({ data: JSON.stringify(ev) }); }
  rawSend(o) { try { this.raw.send(JSON.stringify(o)); } catch (e) {} }
  send(str) {
    let e; try { e = JSON.parse(str); } catch (x) { return; }
    const t = e.type;
    if (t === "session.update") {
      if (!this.setup && e.session && e.session.tools) { this.setup = true; this.rawSend({ setup: this.setupBody(e.session) }); return; }
      if (e.session && e.session.instructions && this.ready) { const m = /## Right now[^]*$/.exec(e.session.instructions); if (m) this.rawSend({ clientContent: { turns: [{ role: "user", parts: [{ text: "(Not spoken by the officer. The app's current state, replacing the earlier Right now section: " + m[0].slice(0, 1500) + ")" }] }], turnComplete: false } }); }
      return; }
    if (t === "input_audio_buffer.append") { const a = { audio: { data: down16(e.audio), mimeType: "audio/pcm;rate=16000" } }; if (this.ready) this.rawSend({ realtimeInput: a }); else if (this.audioQ.length < 50) this.audioQ.push(a); return; }
    if (t === "conversation.item.create" && e.item) {
      if (e.item.type === "function_call_output") { // held a moment: the guidance the app sends next rides with it
        this.flushTool(); const call = this.calls[e.item.call_id] || { name: "unknown" }; let out = {}; try { out = JSON.parse(e.item.output); } catch (x) { out = { result: e.item.output }; }
        this.pendingTool = { id: e.item.call_id, name: call.name, response: out }; this.toolTimer = setTimeout(() => this.flushTool(), 120); return; }
      if (e.item.type === "message") { const text = (e.item.content || []).map(c => c.text || "").join(" "), user = e.item.role !== "assistant"; this.rawSend({ clientContent: { turns: [{ role: user ? "user" : "model", parts: [{ text }] }], turnComplete: user && !G.replaying } }); return; } /* typed officer words are a whole turn; replayed history is not */
      return; }
    if (t === "response.create") {
      const g = e.response && e.response.instructions;
      if (this.pendingTool) { if (g) this.pendingTool.response.app_guidance = g; this.flushTool(); return; }
      this.rawSend({ clientContent: { turns: [{ role: "user", parts: [{ text: g ? "(Not spoken by the officer. " + g + ")" : "(Not spoken by the officer: they are waiting for your reply.)" }] }], turnComplete: true } }); return; }
    /* response.cancel, input_audio_buffer.commit and the rest have no counterpart */
  }
  flushTool() { clearTimeout(this.toolTimer); const pt = this.pendingTool; if (!pt) return; this.pendingTool = null; this.rawSend({ toolResponse: { functionResponses: [{ id: pt.id, name: pt.name, response: pt.response }] } }); }
  setupBody(sess) {
    const tools = (sess.tools || []).map(t => ({ name: t.name, description: t.description, parameters: geminiSchema(t.parameters) }));
    const body = { model: "models/" + GEMINI_MODEL, generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: providerVoice() } } } },
      systemInstruction: { parts: [{ text: sess.instructions || "" }] }, tools: [{ functionDeclarations: tools }], realtimeInputConfig: { automaticActivityDetection: {} },
      inputAudioTranscription: {}, outputAudioTranscription: {}, sessionResumption: G.geminiHandle ? { handle: G.geminiHandle } : {} };
    return body;
  }
  startTurn() { if (!this.turn) { this.turn = true; this.flushIn(); this.emit({ type: "response.created" }); } }
  flushIn() { if (this.inText.trim()) { this.emit({ type: "conversation.item.input_audio_transcription.completed", transcript: this.inText.trim() }); } this.inText = ""; this.inStarted = false; }
  recv(e) {
    if (e.setupComplete) { this.ready = true; this.emit({ type: "session.created" }); this.audioQ.forEach(a => this.rawSend({ realtimeInput: a })); this.audioQ = []; return; }
    if (e.sessionResumptionUpdate) { if (e.sessionResumptionUpdate.resumable && e.sessionResumptionUpdate.newHandle) G.geminiHandle = e.sessionResumptionUpdate.newHandle; return; }
    if (e.goAway) { vlog("Gemini goAway: the line closes in " + JSON.stringify(e.goAway.timeLeft || "")); act("step", "Gemini asked for a new line (goAway): reopening it on the same conversation"); try { this.raw.close(); } catch (x) {} return; }
    if (e.toolCallCancellation) return;
    if (e.toolCall && e.toolCall.functionCalls) { this.startTurn(); e.toolCall.functionCalls.forEach(c => { const id = c.id || ("g" + Math.random().toString(36).slice(2)); this.calls[id] = { name: c.name }; this.emit({ type: "response.function_call_arguments.done", call_id: id, name: c.name, arguments: JSON.stringify(c.args || {}) }); });
      this.turn = false; this.emit({ type: "response.done", response: { status: "completed" } }); return; } /* the model waits for the tool result, then speaks in a turn of its own */
    const sc = e.serverContent; if (!sc) return;
    if (sc.inputTranscription && sc.inputTranscription.text) { if (!this.inStarted) { this.inStarted = true; this.emit({ type: "input_audio_buffer.speech_started" }); } this.inText += sc.inputTranscription.text; }
    if (sc.interrupted) { this.turn = false; this.emit({ type: "response.done", response: { status: "cancelled" } }); return; }
    if (sc.modelTurn && sc.modelTurn.parts) { if (this.inStarted) this.emit({ type: "input_audio_buffer.speech_stopped" }); this.startTurn();
      sc.modelTurn.parts.forEach(pt => { if (pt.inlineData && pt.inlineData.data) this.emit({ type: "response.output_audio.delta", delta: pt.inlineData.data }); else if (pt.text) this.emit({ type: "response.output_audio_transcript.delta", delta: pt.text }); }); }
    if (sc.outputTranscription && sc.outputTranscription.text) { this.startTurn(); this.emit({ type: "response.output_audio_transcript.delta", delta: sc.outputTranscription.text }); }
    if (sc.turnComplete) { if (this.inStarted) this.flushIn(); this.turn = false; this.emit({ type: "response.done", response: { status: "completed" } }); }
  }
}
// 24 kHz PCM16 (base64) to 16 kHz for Gemini's microphone input: two of every three samples, averaged with the dropped one
function down16(b64) { const a = int16FromB64(b64), n = Math.floor(a.length * 2 / 3), o = new Int16Array(n); for (let i = 0; i < n; i++) { const s = i * 1.5, j = Math.floor(s), f = s - j; o[i] = Math.round(a[j] * (1 - f) + (a[j + 1] !== undefined ? a[j + 1] : a[j]) * f); } return b64FromInt16(o); }
// Gemini's function parameters are an OpenAPI subset: no additionalProperties, formats or empty-object properties
function geminiSchema(sch) { if (!sch || typeof sch !== "object") return sch; const o = {}; Object.keys(sch).forEach(k => { if (k === "additionalProperties" || k === "format" || k === "default") return; const v = sch[k];
  o[k] = k === "properties" ? Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, geminiSchema(pv)])) : k === "items" ? geminiSchema(v) : v; }); if (o.type === "object" && (!o.properties || !Object.keys(o.properties).length)) { o.properties = { note: { type: "string", description: "unused" } }; } return o; }

