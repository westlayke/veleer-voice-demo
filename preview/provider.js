// Citizens VCRM demo: the voice engines (loaded after core.js; all files share one scope).
// Grok (xAI) is the engine the proof of concept runs on. OpenAI Realtime is a preview-only alternative, added Oct 27 so the
// same conversations can be run against another engine and compared (Carverhill: "run the same harness but with two new
// providers"). Everything provider-specific lives here: the socket address, the session shape, scripted lines, a dropped line.
// The rest of the app speaks the event family xAI copied from OpenAI (session.update, response.create, function_call_output…).
const OPENAI_MODEL = "gpt-realtime-2.1";
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
    resume: false, forceItem: false, extras: false },
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
  const lines = (G.recent || []).slice(-8); if (!lines.length) return;
  lines.forEach(l => { const m = /^([^:]+): (.*)$/.exec(l); if (!m) return; const user = m[1] === "Officer";
    send({ type: "conversation.item.create", item: { type: "message", role: user ? "user" : "assistant", content: [{ type: user ? "input_text" : "output_text", text: m[2] }] } }); });
  send({ type: "conversation.item.create", item: { type: "message", role: "user", content: [{ type: "input_text", text: "(The line dropped and is back. Carry on from where we were; don't greet me again.)" }] } });
  vlog(`replayed ${lines.length} lines into the new session`); act("step", `New line on ${PROV().name}: the last ${lines.length} lines were replayed as text (no conversation resumption on this engine)`);
}
// a scripted line on an engine without force_message: the assistant is asked, in a reply of its own, to say it word for word (not guaranteed; forcedEvent checks what it said)
function forceByReply(text) { send({ type: "response.create", response: { instructions: `Say this now, word for word, with nothing before or after it: "${text}"` } }); }
