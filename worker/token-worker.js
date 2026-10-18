// Cloudflare Worker that holds the xAI API key and hands the demo a 5-minute voice session token.
// Secrets (set in the Worker's Settings > Variables and Secrets, never in this file):
//   XAI_API_KEY  your xAI API key
//   DEMO_CODE    the access code included in demo links as #code=...
const ALLOWED_ORIGIN = "https://westlayke.github.io";

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Demo-Code",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return new Response("Not found", { status: 404, headers: cors });
    if (request.headers.get("Origin") !== ALLOWED_ORIGIN) return new Response("Forbidden", { status: 403, headers: cors });
    if (env.DEMO_CODE && request.headers.get("X-Demo-Code") !== env.DEMO_CODE) {
      return new Response(JSON.stringify({ error: "bad_code" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const r = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.XAI_API_KEY },
      body: JSON.stringify({ expires_after: { seconds: 300 } }),
    });
    return new Response(await r.text(), { status: r.status, headers: { ...cors, "Content-Type": "application/json" } });
  },
};
