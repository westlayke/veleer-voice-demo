// A stand-in for xAI's line, so run.js can be tried without spending: FAKE=1 FAKE_URL=ws://127.0.0.1:PORT node tests/call-start/run.js
// It answers session.created at once, a session.updated per update after a delay that grows with the update's size, and a
// three-chunk reply to a force_message once the updates are through.
const { WebSocketServer } = require("ws");
const port = +(process.env.PORT || 8765), wss = new WebSocketServer({ port });
wss.on("connection", (ws) => { let busyUntil = Date.now(); const say = (o, at) => setTimeout(() => ws.readyState === 1 && ws.send(JSON.stringify(o)), Math.max(0, at - Date.now()));
  say({ type: "session.created" }, Date.now() + 20);
  ws.on("message", (d) => { let e; try { e = JSON.parse(String(d)); } catch (x) { return; }
    if (e.type === "session.update") { busyUntil = Math.max(busyUntil, Date.now()) + 50 + String(d).length / 50; say({ type: "session.updated" }, busyUntil); }
    if (e.type === "conversation.item.create") { const at = Math.max(busyUntil, Date.now()) + 300; say({ type: "response.created" }, at); for (let i = 0; i < 3; i++) say({ type: "response.output_audio.delta", delta: "AAAA" }, at + 60 + i * 80); say({ type: "response.done" }, at + 320); } });
});
console.log("fake xAI on ws://127.0.0.1:" + port);
