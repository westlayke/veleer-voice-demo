"use strict";
// Citizens VCRM demo: updates and start-up. Loaded in order by the page; all files share one scope.
/* ---------- updates: check for a newer published version on open and on return ---------- */
const buildLabel = () => BUILD === "dev" ? "Development copy" : BUILD; // the stamp is already in words ("Oct 25, 9:39 AM ET"); new Date() on it gave "Invalid Date" on iPhone (Oct 25)
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
const spookyOn = () => spookySeason() && !S.settings.noSpooky;
// phones with Reduce Motion on still get the visitors and their sounds, but they fade in and out in one spot instead of moving across (Tiffany saw none, Oct 24)
const calmMotion = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
// spooky mode ("spooky mode" to the assistant, or Settings): night look, haunted-house host, spooky sounds on big moments, more visitors; ends by itself on Nov 1
const spookyMode = () => spookySeason() && !!S.settings.spooky;
/* ---------- Christmas (December; Christmas mode any time): snow, gifts, elves and reindeer come by; Christmas mode adds Santa's sleigh, a tree,
   an evergreen look with a wreath and a nativity scene on Home, Ara as a warm Christmas host, sleigh bells and Santa's "ho ho ho"; ends by itself on Jan 1 ---------- */
const ON_PREVIEW = VERSION_FILE === "preview-version.json";
const xmasSeason = () => new Date().getMonth() === 11;
const xmasMode = () => !!S.settings.xmas; // Christmas mode can be switched on any time (Carverhill, Oct 24); the visitors on their own still wait for December
const xmasOn = () => xmasMode() || (xmasSeason() && !S.settings.noXmas); // Christmas visitors
const themeOn = () => xmasOn() || spookyOn(), themeMode = () => xmasMode() || spookyMode();
function applySpooky() { document.documentElement.classList.toggle("spooky", spookyMode()); document.documentElement.classList.toggle("xmas", xmasMode()); }
function setXmas(on) { // only one theme mode at a time
  if (on) { S.settings.xmas = true; delete S.settings.noXmas; delete S.settings.spooky; } else delete S.settings.xmas;
  save(); applySpooky(); render(); act("step", "Christmas mode " + (on ? "on" : "off")); spookyKick(); if (on) xmasPrefetch();
}
function setSpooky(on) {
  if (on) { S.settings.spooky = true; delete S.settings.noSpooky; delete S.settings.xmas; } else delete S.settings.spooky;
  save(); applySpooky(); render(); act("step", "spooky mode " + (on ? "on" : "off")); spookyKick();
}
// The owl's hoot is a recording from tunetank.com ("Owl hooting in the night"), sent by Carverhill (Oct 24). The rolling pumpkin plays
// the opening of Bach's Toccata and Fugue in D minor, BWV 565 (the first 7 s of a recording Carverhill sent, Oct 24).
// Christmas sounds that are files (in sounds/): Santa's voice from a Pixabay recording (freesound_community, Pixabay Content License), and a sleigh bell recording by Dragon Studio from Pixabay (Pixabay Content License), sent by Carverhill.
// Fetched as soon as Christmas is on, decoded and played on the sound engine below (so the same first-tap and never-during-a-call rules apply)
const XMAS_FILES = { hohoho: "santa-hoho.mp3", merry: "santa-merry.mp3", bells: "sleigh-bells.mp3", jingle: "jingle.mp3", owl: "owl-hoot.mp3", pumpkin: "pumpkin-toccata.mp3" }, xmasRaw = {}, xmasDec = {};
function xmasPrefetch() { Object.entries(XMAS_FILES).forEach(([k, f]) => { if (!xmasRaw[k]) xmasRaw[k] = fetch((ON_PREVIEW ? "preview/" : "app/") + "sounds/" + f).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null); }); }
["owl", "pumpkin"].forEach(k => { xmasRaw[k] = fetch((ON_PREVIEW ? "preview/" : "app/") + "sounds/" + XMAS_FILES[k]).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null); }); // small (42 and 55 KB): ready when the first one comes by
function xmasPlay(c, kind, delay = 0) {
  if (!xmasRaw[kind]) xmasPrefetch();
  xmasDec[kind] = xmasDec[kind] || xmasRaw[kind].then(b => b ? c.decodeAudioData(b.slice(0)) : null).catch(() => null);
  xmasDec[kind].then(buf => { if (!buf || G.live || c.state !== "running") return; const src = c.createBufferSource(), g = c.createGain(); g.gain.value = 0.7; src.buffer = buf; src.connect(g); g.connect(c.destination); src.start(c.currentTime + 0.02 + delay); });
  spkPlayed++; return true;
}
// spooky sounds, made by the phone (no sound files): quiet, only after the first tap, never during a conversation with Ara
let spkCtx = null, spkPlayed = 0;
// iPhones only allow sound after a tap: start the sound engine in the tap (touchend and click count on an iPhone, pointerdown doesn't) and play a silent blip.
// The page never changes the phone's audio mode: doing that left Ara silent on iPhones (Oct 24)
function spkUnlock() {
  if (G.live) return; // never touch a second sound engine during a conversation: on an iPhone that paused Ara's audio or muted the mic (Oct 24)
  try { if (!spkCtx) { spkCtx = new (window.AudioContext || window.webkitAudioContext)(); const b = spkCtx.createBufferSource(); b.buffer = spkCtx.createBuffer(1, 1, 22050); b.connect(spkCtx.destination); b.start(0); }
    if (spkCtx.state !== "running") spkCtx.resume(); } catch (e) {}
}
["pointerdown", "touchend", "click"].forEach(ev => document.addEventListener(ev, spkUnlock, { capture: true, passive: true }));
function spookySound(kind, retried) {
  const c = spkCtx; if (!c || G.live) return false;
  if (c.state !== "running") { if (!retried) c.resume().then(() => { if (c.state === "running") spookySound(kind, true); }).catch(() => {}); return false; }
  if (kind === "sleigh") { setTimeout(() => spookySound("hohoho", true), 1600); return spookySound("bells", true); } // Santa's sleigh: bells, then "ho ho ho"
  if (kind === "owl" || kind === "hoot") return xmasPlay(c, "owl", kind === "owl" ? 1.6 : 0); // the recording; the perched owl hoots once it has landed
  if (XMAS_FILES[kind]) return xmasPlay(c, kind);
  const t0 = c.currentTime + 0.05, out = c.createGain(); out.gain.value = 0.18; out.connect(c.destination);
  const env = (g, at, peak, len) => { g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.3, len / 4)); g.gain.exponentialRampToValueAtTime(0.0001, at + len); };
  const noise = (len) => { const b = c.createBuffer(1, Math.ceil(c.sampleRate * len), c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const n = c.createBufferSource(); n.buffer = b; return n; };
  if (kind === "ghost") { // a wavering "wooo" that rises and falls, pitched high enough for a phone speaker; starts as the ghost fades in
    const at = t0 + 1.2;
    [0, 7].forEach(detune => { const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), dep = c.createGain();
      o.type = "triangle"; o.frequency.setValueAtTime(520, at); o.frequency.linearRampToValueAtTime(1040, at + 0.9); o.frequency.linearRampToValueAtTime(470, at + 2.4); o.detune.value = detune * 10;
      lfo.frequency.value = 6; dep.gain.value = 28; lfo.connect(dep); dep.connect(o.frequency); env(g, at, 0.8, 2.5);
      o.connect(g); g.connect(out); o.start(at); lfo.start(at); o.stop(at + 2.6); lfo.stop(at + 2.6); });
  } else if (kind === "spider") { // a creak, then a quick scuttle of tiny clicks
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = "sawtooth"; o.frequency.setValueAtTime(70, t0); o.frequency.linearRampToValueAtTime(130, t0 + 0.6); f.type = "bandpass"; f.frequency.value = 900; f.Q.value = 8;
    env(g, t0, 0.6, 0.7); o.connect(f); f.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 0.75);
    for (let i = 0; i < 12; i++) { const at = t0 + 0.8 + i * 0.05 + Math.random() * 0.02, n = noise(0.02), hp = c.createBiquadFilter(), ng = c.createGain();
      hp.type = "highpass"; hp.frequency.value = 3000; env(ng, at, 0.5, 0.02); n.connect(hp); hp.connect(ng); ng.connect(out); n.start(at); }
  } else if (kind === "bat") { // a few high squeaks
    for (let i = 0; i < 5; i++) { const at = t0 + 0.3 + i * 0.16 + Math.random() * 0.05, o = c.createOscillator(), g = c.createGain(), f0 = 3200 + Math.random() * 1400;
      o.type = "sine"; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f0 * 0.6, at + 0.07); env(g, at, 0.35, 0.08); o.connect(g); g.connect(out); o.start(at); o.stop(at + 0.1); }
  } else if (kind === "creak") { // a slow creaking door as a form opens
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), dep = c.createGain();
    o.type = "sawtooth"; o.frequency.setValueAtTime(95, t0); o.frequency.linearRampToValueAtTime(150, t0 + 0.5); o.frequency.linearRampToValueAtTime(80, t0 + 1.1);
    lfo.type = "square"; lfo.frequency.value = 22; dep.gain.value = 30; lfo.connect(dep); dep.connect(o.frequency);
    f.type = "bandpass"; f.frequency.value = 1200; f.Q.value = 6; env(g, t0, 0.7, 1.2); o.connect(f); f.connect(g); g.connect(out);
    o.start(t0); lfo.start(t0); o.stop(t0 + 1.25); lfo.stop(t0 + 1.25);
  } else if (kind === "thunder") { // a crack, then a rumble, as a form saves
    const n = noise(2.4), lp = c.createBiquadFilter(), g = c.createGain(), k = noise(0.25), hp = c.createBiquadFilter(), kg = c.createGain();
    lp.type = "lowpass"; lp.frequency.setValueAtTime(1400, t0); lp.frequency.exponentialRampToValueAtTime(300, t0 + 2.2);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(1, t0 + 0.08); g.gain.setValueAtTime(0.6, t0 + 0.5); g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4);
    n.connect(lp); lp.connect(g); g.connect(out); n.start(t0);
    hp.type = "highpass"; hp.frequency.value = 1800; env(kg, t0, 0.9, 0.25); k.connect(hp); hp.connect(kg); kg.connect(out); k.start(t0);
  } else if (kind === "chime" || kind === "carol" || kind === "twinkle") { // bell tones: a two-note chime (Save, gifts), the opening of "Joy to the World" (Closed Won, then "ho ho ho"), or a soft twinkle (snow, the tree)
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const notes = kind === "chime" ? [[0, 88, 1.2], [0.16, 93, 1.6]] : kind === "carol" ? [[0, 84, 0.7], [0.45, 83, 0.5], [0.75, 81, 0.4], [0.9, 79, 0.9], [1.5, 77, 0.4], [1.7, 76, 0.6], [2.1, 74, 0.6], [2.5, 72, 1.4]]
      : Array.from({ length: 6 }, (_, i) => [i * 0.22 + Math.random() * 0.08, 96 + Math.floor(Math.random() * 8), 0.6]);
    notes.forEach(([dt, m, len]) => { const at = t0 + dt; [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(([mult, vol]) => { const o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.value = hz(m) * mult; g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime((kind === "twinkle" ? 0.25 : 0.6) * vol, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + len / mult + 0.1);
      o.connect(g); g.connect(out); o.start(at); o.stop(at + len + 0.2); }); });
    if (kind === "carol") setTimeout(() => spookySound("merry", true), 3300);
  } else if (kind === "giggle") { // an elf's quick, high "hee-hee-hee"
    for (let i = 0; i < 5; i++) { const at = t0 + 0.4 + i * 0.12, o = c.createOscillator(), g = c.createGain(), p = 1100 + i * 90;
      o.type = "triangle"; o.frequency.setValueAtTime(p, at); o.frequency.linearRampToValueAtTime(p * 1.25, at + 0.08); env(g, at, 0.5, 0.1); o.connect(g); g.connect(out); o.start(at); o.stop(at + 0.12); }
  } else if (kind === "cackle") { // a witch's "ha-ha-ha-ha", falling
    for (let i = 0; i < 7; i++) { const at = t0 + i * 0.15, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), p = 900 - i * 60;
      o.type = "sawtooth"; o.frequency.setValueAtTime(p * 1.15, at); o.frequency.linearRampToValueAtTime(p, at + 0.1);
      f.type = "bandpass"; f.frequency.value = 1500; f.Q.value = 2; env(g, at, 0.6, 0.12); o.connect(f); f.connect(g); g.connect(out); o.start(at); o.stop(at + 0.13); }
  } else { // a haunted-house organ sting as the pumpkin rolls in: dun, dun, DUNNN (on Closed Won in spooky mode, a cackle follows)
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12), lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600; lp.connect(out);
    [[0, 0.22, [60, 63, 67]], [0.28, 0.22, [60, 63, 67]], [0.58, 1.5, [59, 62, 65, 68]]].forEach(([dt, len, notes]) => notes.forEach(m => {
      const at = t0 + dt, g = c.createGain(); env(g, at, 0.22, len); g.connect(lp);
      [[1, "square", 0.5], [2, "sine", 0.6], [4, "sine", 0.25]].forEach(([mult, type, vol]) => { const o = c.createOscillator(), v = c.createGain();
        o.type = type; o.frequency.value = hz(m) * mult; v.gain.value = vol; o.connect(v); v.connect(g); o.start(at); o.stop(at + len + 0.05); });
    }));
    if (kind === "won") setTimeout(() => spookySound("cackle", true), 2100);
  }
  spkPlayed++; return true;
}
const XMAS_SOUND = { snow: "twinkle", gift: "jingle", elf: "giggle", reindeer: "bells", sleigh: "sleigh", tree: "twinkle" };
function spookyOnce(kind) {
  const kinds = xmasOn() ? (xmasMode() ? ["snow", "gift", "elf", "reindeer", "sleigh", "tree"] : ["snow", "gift", "elf", "reindeer"])
    : spookyMode() ? ["spider", "pumpkin", "ghost", "bat", "owl", "skeleton"] : ["spider", "pumpkin", "ghost"];
  kind = kind || kinds[Math.floor(Math.random() * kinds.length)];
  const el = document.createElement("div"); el.className = "spk spk-" + kind; el.setAttribute("aria-hidden", "true");
  const w = window.innerWidth, h = window.innerHeight, done = () => el.remove();
  if (kind === "spider") { // drops from the top on its thread, looks around, climbs back up
    el.innerHTML = '<span class="spk-thread"></span>🕷️'; el.style.left = Math.round(40 + Math.random() * (w - 80)) + "px"; el.style.top = "0";
    const low = Math.round(h * (0.2 + Math.random() * 0.25));
    el.animate([{ transform: "translateY(-60px)" }, { transform: `translateY(${low}px)`, offset: 0.4 }, { transform: `translateY(${low - 12}px)`, offset: 0.55 }, { transform: `translateY(${low}px)`, offset: 0.7 }, { transform: "translateY(-60px)" }], { duration: 7000, easing: "ease-in-out" }).onfinish = done;
  } else if (kind === "pumpkin") { // rolls along the bottom, right to left
    el.textContent = "🎃";
    el.animate([{ transform: `translateX(${w + 20}px) rotate(0deg)` }, { transform: "translateX(-70px) rotate(-720deg)" }], { duration: 6500, easing: "linear" }).onfinish = done;
  } else if (kind === "bat") { // a few bats flap across the top of the screen, left to right
    el.innerHTML = '<i>🦇</i><i>🦇</i><i>🦇</i>'; el.style.top = Math.round(70 + Math.random() * h * 0.2) + "px";
    el.animate([{ transform: "translate(-140px, 0)" }, { transform: `translate(${w * 0.3}px, 30px)`, offset: 0.3 }, { transform: `translate(${w * 0.6}px, -10px)`, offset: 0.6 }, { transform: `translate(${w + 40}px, 20px)` }], { duration: 5000, easing: "linear" }).onfinish = done;
  } else if (kind === "owl") { // glides down to a perch near the top, blinks, hoots, then flies off the other side
    el.textContent = "🦉"; const fromLeft = Math.random() < 0.5, perchX = Math.round(w * (0.25 + Math.random() * 0.5)), y = Math.round(80 + Math.random() * h * 0.15);
    el.style.top = y + "px"; const a = fromLeft ? -70 : w + 20, b = fromLeft ? w + 20 : -70;
    el.animate([{ transform: `translate(${a}px, -60px)` }, { transform: `translate(${perchX}px, 0) scaleY(1)`, offset: 0.2 }, { transform: `translate(${perchX}px, 0) scaleY(1)`, offset: 0.4 }, { transform: `translate(${perchX}px, 0) scaleY(0.85)`, offset: 0.43 }, { transform: `translate(${perchX}px, 0) scaleY(1)`, offset: 0.46 }, { transform: `translate(${perchX}px, 0) scaleY(1)`, offset: 0.75 }, { transform: `translate(${b}px, -50px)` }], { duration: 7000, easing: "ease-in-out" }).onfinish = done;
  } else if (kind === "skeleton") { // strolls in from the right along the bottom, stops, tips his skull and waves with a long cackle, then strolls off left (Oct 26)
    el.innerHTML = SKELETON; const stopX = Math.round(w * 0.55);
    const step = (x, i) => ({ transform: `translate(${x}px, ${i % 2 ? -5 : 0}px)` });
    el.animate([step(w + 20, 0), step(w * 0.9, 1), step(w * 0.8, 2), step(w * 0.7, 3), { ...step(stopX, 4), offset: 0.3 }, { transform: `translate(${stopX}px, 0) rotate(-8deg)`, offset: 0.36 }, { transform: `translate(${stopX}px, 0) rotate(-8deg)`, offset: 0.66 }, { transform: `translate(${stopX}px, 0)`, offset: 0.72 },
      { ...step(w * 0.4, 5), offset: 0.8 }, { ...step(w * 0.25, 6), offset: 0.87 }, { ...step(w * 0.1, 7), offset: 0.94 }, step(-90, 8)], { duration: 9000, easing: "linear" }).onfinish = done;
    setTimeout(() => { if (el.isConnected) { el.classList.add("sk-waving"); spookySound("cackle"); } }, 2900);
  } else if (kind === "snow") { // a flurry of snowflakes drifting down
    el.style.cssText = "left:0;top:0;width:100%;height:100%"; const calm = calmMotion();
    for (let i = 0; i < 16; i++) { const f = document.createElement("i"), x = Math.round(Math.random() * (w - 24)), sz = 14 + Math.round(Math.random() * 14), dur = 6000 + Math.random() * 3000;
      f.textContent = "❄️"; f.style.cssText = `left:${x}px;top:${calm ? Math.round(Math.random() * h * 0.7) : -40}px;font-size:${sz}px`; el.appendChild(f);
      f.animate([{ transform: "translate(0, 0)" }, { transform: `translate(${Math.round(Math.random() * 60 - 30)}px, ${Math.round(h * 0.5)}px)` }, { transform: `translate(${Math.round(Math.random() * 60 - 30)}px, ${h + 60}px)` }], { duration: dur, delay: Math.random() * 1500 }); }
    setTimeout(done, 10600);
  } else if (kind === "gift") { // a wrapped present slides along the bottom with a little hop
    el.textContent = "🎁";
    el.animate([{ transform: `translate(${w + 20}px, 0)` }, { transform: `translate(${w * 0.6}px, -26px)`, offset: 0.3 }, { transform: `translate(${w * 0.45}px, 0)`, offset: 0.4 }, { transform: "translate(-70px, 0)" }], { duration: 6000, easing: "linear" }).onfinish = done;
  } else if (kind === "elf") { // an elf peeks in from the side, waves, and ducks back out
    el.innerHTML = "🧝<i>👋</i>"; el.style.top = Math.round(h * (0.3 + Math.random() * 0.3)) + "px";
    el.animate([{ transform: "translateX(-90px)" }, { transform: "translateX(6px)", offset: 0.2 }, { transform: "translateX(6px) rotate(-6deg)", offset: 0.45 }, { transform: "translateX(6px) rotate(6deg)", offset: 0.65 }, { transform: "translateX(6px)", offset: 0.8 }, { transform: "translateX(-90px)" }], { duration: 5000, easing: "ease-in-out" }).onfinish = done;
  } else if (kind === "reindeer") { // a reindeer trots along, bobbing
    el.textContent = "🦌";
    el.animate(Array.from({ length: 13 }, (_, i) => ({ transform: `translate(${w + 20 - (w + 100) * i / 12}px, ${i % 2 ? -14 : 0}px)` })), { duration: 6000, easing: "linear" }).onfinish = done;
  } else if (kind === "sleigh") { // Santa's sleigh and reindeer fly across the top in an arc
    el.innerHTML = "🦌🦌🛷<i>🎅</i>"; el.style.top = Math.round(70 + Math.random() * h * 0.12) + "px";
    el.animate([{ transform: `translate(${w + 20}px, 40px)` }, { transform: `translate(${w * 0.5}px, -10px)`, offset: 0.5 }, { transform: "translate(-260px, 30px)" }], { duration: 6500, easing: "linear" }).onfinish = done;
  } else if (kind === "tree") { // a Christmas tree appears in a corner and twinkles
    el.innerHTML = "🎄<i>✨</i>"; el.style.left = (Math.random() < 0.5 ? 12 : w - 76) + "px";
    el.animate([{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "scale(1)", offset: 0.15 }, { opacity: 1, transform: "scale(1.05)", offset: 0.5 }, { opacity: 1, transform: "scale(1)", offset: 0.85 }, { opacity: 0, transform: "scale(.9)" }], { duration: 6000, easing: "ease-in-out" }).onfinish = done;
  } else { // floats across, bobbing
    el.textContent = "👻"; el.style.top = Math.round(h * (0.18 + Math.random() * 0.4)) + "px";
    el.animate([{ transform: "translate(-70px, 0)", opacity: 0 }, { transform: `translate(${w * 0.25}px, -18px)`, opacity: 0.9, offset: 0.25 }, { transform: `translate(${w * 0.5}px, 14px)`, offset: 0.5 }, { transform: `translate(${w * 0.75}px, -14px)`, opacity: 0.9, offset: 0.75 }, { transform: `translate(${w + 20}px, 0)`, opacity: 0 }], { duration: 9000, easing: "linear" }).onfinish = done;
  }
  document.body.appendChild(el);
  if (calmMotion()) { el.getAnimations({ subtree: true }).forEach(a => a.cancel()); el.classList.add("spk-calm");
    if (kind !== "snow") el.style.transform = `translate(${Math.round(w * (0.15 + Math.random() * 0.6))}px, ${kind === "spider" ? Math.round(h * 0.3) : 0}px)`;
    el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 4500 }).onfinish = done; }
  if (kind !== "skeleton") spookySound(XMAS_SOUND[kind] || kind); /* the skeleton cackles once he has stopped */ return el;
}
// a visitor every 40 to 90 seconds; in spooky mode every 15 to 20
let spkLoopT = null;
function spookyLoop(first) { clearTimeout(spkLoopT); spkLoopT = setTimeout(() => { if (themeOn() && document.visibilityState === "visible") spookyOnce(); spookyLoop(false); }, first ? (themeMode() ? 3000 : 8000) : themeMode() ? 15000 + Math.random() * 5000 : 40000 + Math.random() * 50000); }
const spookyKick = () => spookyLoop(true);
spookyLoop(true); applySpooky(); if (xmasOn()) setTimeout(xmasPrefetch, 2000);
// In October phones only play sounds after a tap, so on every load that hasn't had a tap yet a big owl invites one ("Tap me to hear me hoot!"); the first tap anywhere sets him hooting and he flies off. A brand-new phone's welcome tap already turns sound on, so he still shows once after it.
function owlHint(tries = 0) {
  if (!themeOn() || (spkCtx && S.settings.seenOwlHint) || document.querySelector(".owlhint")) return; // sound already on and he's been seen
  if (G.live || V || document.getElementById("modal").innerHTML.trim() || document.visibilityState !== "visible") { if (tries < 60) setTimeout(() => owlHint(tries + 1), 1000); return; } // wait for the welcome or a form to close
  const x = xmasOn(), el = document.createElement("div"); el.className = "owlhint"; el.setAttribute("role", "button"); el.setAttribute("aria-label", `Tap to turn on the ${x ? "Christmas" : "Halloween"} sounds`); // at Christmas, Santa asks
  el.innerHTML = `<span class="owlhint-bubble">${x ? "Tap me to hear me ho ho ho!" : "Tap me to hear me hoot!"}</span><span class="owlhint-owl" aria-hidden="true">${x ? "🎅" : "🦉"}</span>`;
  document.body.appendChild(el);
  el.animate([{ transform: "translateX(140%)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 900, easing: "cubic-bezier(.2,.8,.3,1.1)" });
  const go = (e) => { ["touchend", "click"].forEach(ev => document.removeEventListener(ev, go, true));
    S.settings.seenOwlHint = true; save(); spookySound(x ? "merry" : "hoot");
    el.querySelector(".owlhint-bubble").textContent = x ? "Ho ho ho! Sounds are on." : "Hoo hoo! Sounds are on.";
    if (e && el.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } // tapping the owl does nothing else
    setTimeout(() => el.animate([{ transform: "none", opacity: 1 }, { transform: "translate(-60vw, -70vh) scale(.6)", opacity: 0 }], { duration: 1400, easing: "ease-in" }).onfinish = () => el.remove(), 1600); };
  ["touchend", "click"].forEach(ev => document.addEventListener(ev, go, true));
}
setTimeout(owlHint, 1500);
// spooky mode's big moments: a creaking door as a form opens, thunder on Save, the organ sting and a cackle on Closed Won
// Christmas mode's: sleigh bells as a form opens, a chime on Save, "Joy to the World" then "ho ho ho" on Closed Won
function spookyCue(kind) { if (spookyMode()) spookySound(kind); else if (xmasMode()) spookySound({ creak: "jingle", thunder: "chime", won: "carol" }[kind] || kind); }
render(); save(); welcomeModal(); callLink(); formLogNotice(); checkUpdate(); setTimeout(prefetchToken, 300);
// Each visit (app opened, or back after 30 minutes away) goes in the activity log, so the owner can count devices.
function logOpen() { if (!G.visit || Date.now() - G.visit.last > 30 * 60000) act("open", "Opened the app (build " + BUILD + ")" + (calmMotion() ? " (Reduce Motion is on)" : "")); }
logOpen(); document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") logOpen(); });
window.__demo = { get state() { return S; }, resolveTarget, hfYes, spookyOnce, setSpooky, setXmas, owlHint, get spkPlayed() { return spkPlayed; } };
