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
    bar.innerHTML = `<b>A new version of the proof of concept is ready.</b><button type="button" class="upd-go">Update</button><button type="button" class="upd-x" aria-label="Not now" style="background:none;color:#fff;padding:8px 4px">×</button>`;
    bar.querySelector(".upd-x").onclick = () => bar.remove();
    bar.querySelector(".upd-go").onclick = () => { if (G.live) endCall(); location.replace(location.pathname + "?v=" + encodeURIComponent(j.build)); };
    document.body.appendChild(bar);
  } catch (e) {}
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); });
window.addEventListener("pageshow", checkUpdate);
setInterval(() => { if (document.visibilityState === "visible") checkUpdate(); }, 5 * 60000); // pages left open pick up new versions too
if (/[?&]v=/.test(location.search)) history.replaceState(null, "", location.pathname + location.hash);
/* ---------- Halloween: now and then a spider, pumpkin or ghost crosses the screen (October only; Settings can turn it off) ---------- */
const spookySeason = () => new Date().getMonth() === 9;
const spookyOn = () => spookySeason() && !S.settings.noSpooky && !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
// spooky sounds, made by the phone (no sound files): quiet, only after the first tap, never during a conversation with Ara
let spkCtx = null, spkPlayed = 0;
document.addEventListener("pointerdown", () => { try { spkCtx = spkCtx || new (window.AudioContext || window.webkitAudioContext)(); if (spkCtx.state === "suspended") spkCtx.resume(); } catch (e) {} }, { capture: true });
function spookySound(kind) {
  const c = spkCtx; if (!c || c.state !== "running" || G.live) return false;
  const t0 = c.currentTime + 0.05, out = c.createGain(); out.gain.value = 0.18; out.connect(c.destination);
  const env = (g, at, peak, len) => { g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.3, len / 4)); g.gain.exponentialRampToValueAtTime(0.0001, at + len); };
  const noise = (len) => { const b = c.createBuffer(1, Math.ceil(c.sampleRate * len), c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const n = c.createBufferSource(); n.buffer = b; return n; };
  if (kind === "ghost") { // a wavering "wooo" that rises and falls
    [0, 7].forEach(detune => { const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), dep = c.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(260, t0); o.frequency.linearRampToValueAtTime(520, t0 + 0.7); o.frequency.linearRampToValueAtTime(240, t0 + 1.8); o.detune.value = detune * 10;
      lfo.frequency.value = 6; dep.gain.value = 14; lfo.connect(dep); dep.connect(o.frequency); env(g, t0, 0.5, 1.9);
      o.connect(g); g.connect(out); o.start(t0); lfo.start(t0); o.stop(t0 + 2); lfo.stop(t0 + 2); });
  } else if (kind === "spider") { // a creak, then a quick scuttle of tiny clicks
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = "sawtooth"; o.frequency.setValueAtTime(70, t0); o.frequency.linearRampToValueAtTime(130, t0 + 0.6); f.type = "bandpass"; f.frequency.value = 900; f.Q.value = 8;
    env(g, t0, 0.6, 0.7); o.connect(f); f.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 0.75);
    for (let i = 0; i < 12; i++) { const at = t0 + 0.8 + i * 0.05 + Math.random() * 0.02, n = noise(0.02), hp = c.createBiquadFilter(), ng = c.createGain();
      hp.type = "highpass"; hp.frequency.value = 3000; env(ng, at, 0.5, 0.02); n.connect(hp); hp.connect(ng); ng.connect(out); n.start(at); }
  } else { // a hollow pumpkin rolling: three low thumps
    for (let i = 0; i < 3; i++) { const at = t0 + i * 0.38, o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(120, at); o.frequency.exponentialRampToValueAtTime(50, at + 0.25); env(g, at, 0.9, 0.3); o.connect(g); g.connect(out); o.start(at); o.stop(at + 0.32); }
  }
  spkPlayed++; return true;
}
function spookyOnce(kind) {
  kind = kind || ["spider", "pumpkin", "ghost"][Math.floor(Math.random() * 3)];
  const el = document.createElement("div"); el.className = "spk spk-" + kind; el.setAttribute("aria-hidden", "true");
  const w = window.innerWidth, h = window.innerHeight, done = () => el.remove();
  if (kind === "spider") { // drops from the top on its thread, looks around, climbs back up
    el.innerHTML = '<span class="spk-thread"></span>🕷️'; el.style.left = Math.round(40 + Math.random() * (w - 80)) + "px"; el.style.top = "0";
    const low = Math.round(h * (0.2 + Math.random() * 0.25));
    el.animate([{ transform: "translateY(-60px)" }, { transform: `translateY(${low}px)`, offset: 0.4 }, { transform: `translateY(${low - 12}px)`, offset: 0.55 }, { transform: `translateY(${low}px)`, offset: 0.7 }, { transform: "translateY(-60px)" }], { duration: 7000, easing: "ease-in-out" }).onfinish = done;
  } else if (kind === "pumpkin") { // rolls along the bottom, right to left
    el.textContent = "🎃";
    el.animate([{ transform: `translateX(${w + 20}px) rotate(0deg)` }, { transform: "translateX(-70px) rotate(-720deg)" }], { duration: 6500, easing: "linear" }).onfinish = done;
  } else { // floats across, bobbing
    el.textContent = "👻"; el.style.top = Math.round(h * (0.18 + Math.random() * 0.4)) + "px";
    el.animate([{ transform: "translate(-70px, 0)", opacity: 0 }, { transform: `translate(${w * 0.25}px, -18px)`, opacity: 0.9, offset: 0.25 }, { transform: `translate(${w * 0.5}px, 14px)`, offset: 0.5 }, { transform: `translate(${w * 0.75}px, -14px)`, opacity: 0.9, offset: 0.75 }, { transform: `translate(${w + 20}px, 0)`, opacity: 0 }], { duration: 9000, easing: "linear" }).onfinish = done;
  }
  document.body.appendChild(el); spookySound(kind); return el;
}
(function spookyLoop(first) { setTimeout(() => { if (spookyOn() && document.visibilityState === "visible") spookyOnce(); spookyLoop(false); }, first ? 8000 : 40000 + Math.random() * 50000); })(true);
render(); save(); welcomeModal(); formLogNotice(); checkUpdate(); setTimeout(prefetchToken, 300);
// Each visit (app opened, or back after 30 minutes away) goes in the activity log, so the owner can count devices.
function logOpen() { if (!G.visit || Date.now() - G.visit.last > 30 * 60000) act("open", "Opened the app"); }
logOpen(); document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") logOpen(); });
window.__demo = { get state() { return S; }, resolveTarget, hfYes, spookyOnce, get spkPlayed() { return spkPlayed; } };
