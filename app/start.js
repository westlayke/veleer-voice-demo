"use strict";
// Citizens VCRM demo: updates and start-up. Loaded in order by the page; all files share one scope.
/* ---------- updates: check for a newer published version on open and on return ---------- */
const buildLabel = () => BUILD === "dev" ? "Development copy" : new Date(BUILD).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
let updChecked = 0;
async function checkUpdate() {
  if (BUILD === "dev" || Date.now() - updChecked < 15000) return; updChecked = Date.now();
  try {
    const r = await fetch(VERSION_FILE + "?t=" + Date.now(), { cache: "no-store" }); if (!r.ok) return;
    const j = await r.json(); if (!j.build || j.build === BUILD || document.getElementById("updbar")) return;
    // nothing in progress (no conversation, no open draft): load the new version straight away, once per version
    let tried = ""; try { tried = sessionStorage.getItem("vcrm-auto-update") || ""; } catch (e) {}
    if (!G.live && !V && tried !== j.build) { try { sessionStorage.setItem("vcrm-auto-update", j.build); } catch (e) {} location.replace(location.pathname + "?v=" + encodeURIComponent(j.build) + location.hash); return; }
    const bar = document.createElement("div"); bar.id = "updbar"; bar.className = "updbar";
    bar.innerHTML = `<b>A new version of the demo is ready.</b><button type="button" class="upd-go">Update</button><button type="button" class="upd-x" aria-label="Not now" style="background:none;color:#fff;padding:8px 4px">×</button>`;
    bar.querySelector(".upd-x").onclick = () => bar.remove();
    bar.querySelector(".upd-go").onclick = () => { if (G.live) endCall(); location.replace(location.pathname + "?v=" + encodeURIComponent(j.build)); };
    document.body.appendChild(bar);
  } catch (e) {}
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); });
window.addEventListener("pageshow", checkUpdate);
setInterval(() => { if (document.visibilityState === "visible") checkUpdate(); }, 5 * 60000); // pages left open pick up new versions too
if (/[?&]v=/.test(location.search)) history.replaceState(null, "", location.pathname + location.hash);
render(); save(); welcomeModal(); formLogNotice(); checkUpdate(); setTimeout(prefetchToken, 300);
// Each visit (app opened, or back after 30 minutes away) goes in the activity log, so the owner can count devices.
function logOpen() { if (!G.visit || Date.now() - G.visit.last > 30 * 60000) act("open", "Opened the app"); }
logOpen(); document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") logOpen(); });
window.__demo = { get state() { return S; }, resolveTarget, hfYes };
