"use strict";
// Citizens VCRM demo: screens, phone calls and task statuses. Loaded in order by the page; all files share one scope.
/* ---------- screens ---------- */
const go = (s) => { G.whatNext = null; if (s !== "contact" && s !== "opp") G.hfBack = false; S.screen = s; save(); render(); window.scrollTo(0, 0); };
const CHEV = '<svg width="8" height="13" viewBox="0 0 8 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 1.5 6.5 6.5l-5 5"/></svg>'; // iPhone-style row chevron
const BACK_NAMES = { hfcheck: "Hands-free saves", home: "Home", opp: "Opportunity", contact: "Contact", contacts: "Contacts", board: "Opportunities", opps: "Opportunities", tasks: "Tasks", settings: "Settings" }; // iPhone-style back button shows where it goes
// Christmas mode: a wreath beside the logo, and a still nativity scene at the top of Home (shown with reverence: no motion across the screen, no sound)
const WREATH = '<span class="wreath" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 40 40"><circle cx="20" cy="19" r="12" fill="none" stroke="#1f6b39" stroke-width="7"/><circle cx="20" cy="19" r="12" fill="none" stroke="#3f9a55" stroke-width="3" stroke-dasharray="2 4"/><g fill="#d4202f"><circle cx="11" cy="13" r="1.8"/><circle cx="29" cy="12" r="1.8"/><circle cx="31" cy="24" r="1.8"/><circle cx="9" cy="25" r="1.8"/></g><path d="M20 31l-6 6 2-8zM20 31l6 6-2-8z" fill="#c62f3b"/><circle cx="20" cy="30.5" r="2.6" fill="#e0303e"/></svg></span>';
const NATIVITY = `<section class="nativity" aria-label="Nativity scene: Mary and Joseph with the baby Jesus in the manger, under the star"><svg viewBox="0 0 320 120" width="100%" role="img" aria-hidden="true">
  <defs><radialGradient id="nstar" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff6c8"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></radialGradient></defs>
  <circle cx="160" cy="16" r="16" fill="url(#nstar)"/><path d="M160 4l2.6 8.4 8.4 3.6-8.4 3.6-2.6 8.4-2.6-8.4-8.4-3.6 8.4-3.6z" fill="#ffe27a"/><path d="M160 30v14" stroke="#ffe27a" stroke-width="1" opacity=".55"/>
  <path d="M84 58L160 34l76 24" fill="none" stroke="#8a5a36" stroke-width="5" stroke-linecap="round"/><path d="M98 56v58M222 56v58" stroke="#7a4d2c" stroke-width="5"/>
  <path d="M90 114h140" stroke="#5d3a20" stroke-width="3"/><path d="M104 114q10-10 22-4M196 110q12-8 22 4" stroke="#c9a24a" stroke-width="2" fill="none" opacity=".7"/>
  <g><circle cx="128" cy="76" r="7" fill="#f1d3b3"/><path d="M119 72q9-12 18 0v8q8 6 8 34h-34q0-26 8-34z" fill="#3d6fb6"/><path d="M121 70q7-9 14 0" fill="none" stroke="#dfe8f6" stroke-width="2"/></g>
  <g><circle cx="196" cy="66" r="7.5" fill="#e6c09a"/><path d="M188 62q8-10 16 0v6q9 6 9 46h-34q0-40 9-46z" fill="#8b5e3c"/><path d="M212 58v56" stroke="#6b4426" stroke-width="2.5" stroke-linecap="round"/><path d="M212 58q-5-4-2-9" fill="none" stroke="#6b4426" stroke-width="2.5"/></g>
  <path d="M146 100h28l-5 14h-18z" fill="#9b6b3e"/><path d="M144 100q16-6 32 0" stroke="#e1b85a" stroke-width="3" fill="none"/>
  <circle cx="160" cy="95" r="9" fill="none" stroke="#ffe27a" stroke-width="1.5" opacity=".85"/><ellipse cx="160" cy="98" rx="9" ry="4.5" fill="#f7f1e3"/><circle cx="154" cy="96" r="3.4" fill="#f1d3b3"/>
  <g fill="#ece8df"><ellipse cx="70" cy="106" rx="11" ry="7"/><circle cx="60" cy="102" r="4"/></g><g fill="#ece8df"><ellipse cx="252" cy="107" rx="10" ry="6.5"/><circle cx="262" cy="103" r="3.8"/></g>
</svg><div class="nat-cap">Merry Christmas</div></section>`;
function topbar(title, back, logo) {
  if (G.hfBack && (title === "Contact" || title === "Opportunity")) back = "hfcheck"; // opened from the hands-free check: Back returns to it
  return `<header class="top${logo ? " withlogo" : ""}">${!logo && !back ? `<button class="chip" data-act2="editname" aria-label="${esc(OFFICER)}: change your name">${OFFICER_INITIALS}</button>` : ""}${logo ? '<img class="top-logo" src="logo-v6.png" alt="Citizens Alliance" width="82" height="50">' + (spookyMode() ? '<span class="candle" aria-hidden="true">🕯️</span>' : xmasMode() ? WREATH : "") : ""}${back ? `<button class="back" data-go="${back}" aria-label="Back to ${BACK_NAMES[back] || "previous screen"}"><svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2 2 10l8 8"/></svg><span>${(BACK_NAMES[back] || "").length > 9 ? "Back" : (BACK_NAMES[back] || "Back")}</span></button>` : ""}${logo ? `<button class="who" data-act2="editname" aria-label="Change your name"><b>${OFFICER}</b><span>You're the gift officer</span></button>` : `<h1>${esc(title)}</h1>`}
  ${title === "Settings" ? "" : `<button class="iconbtn setbtn" data-go="settings" aria-label="Settings"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg></button>`}
  ${title === "Settings" ? "" : `<button class="iconbtn addbtn" data-act2="quickadd" aria-label="Add or log something"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`}
</header>`;
}
const SAY_GROUPS = [
  { tone: "look", lines: ["What are my open tasks?"] },
  { tone: "people", lines: ["Add a contact", "Log a meeting"] },
  { tone: "pipe", lines: ["Plan an ask", "Record an ask"] },
  { tone: "money", lines: ["Record a pledge", "Record a gift"] },
  { tone: "giving", lines: ["What has Ruth given?", "Elena's last gift?"] },
  { tone: "look", lines: ["Explain the process", "Review FAQ", "My opportunities"] }
];
// Home shows the first few options; "More ideas" opens the rest
const SAY_FIRST = ["What are my open tasks?", "Add a contact", "Log a meeting", "Plan an ask", "Record a pledge", "What has Ruth given?"];
function sayList() {
  const pill = (g, line) => `<button type="button" class="sp t-${g.tone}" data-say="${esc(line)}"><span class="spm">${mic(12)}</span>${esc(line)}</button>`;
  const all = SAY_GROUPS.flatMap(g => g.lines.map(line => ({ g, line })));
  const first = SAY_FIRST.map(l => all.find(x => x.line === l)).filter(Boolean), rest = all.filter(x => !SAY_FIRST.includes(x.line));
  return `<div class="saypills">${first.map(x => pill(x.g, x.line)).join("")}${S.sayMore ? rest.map(x => pill(x.g, x.line)).join("") : ""}<button type="button" class="sp more" data-act2="saymore" aria-expanded="${S.sayMore ? "true" : "false"}">${S.sayMore ? "Fewer ideas" : `More ideas (${rest.length})`}</button></div>`;
}
const APP_BTN = (px) => `<img src="apple-touch-icon-v5.png" alt="" class="appbtn" style="width:${px}px;height:${px}px">`;
const SAVE_TITLE = `Add Citizens VCRM to your Home Screen`;
function saveTip(inSettings) {
  const standalone = isStandalone();
  if (standalone) return inSettings ? `<div style="font-size:14px;color:var(--muted)">Citizens VCRM is already on your home screen. You're using it from there now.</div>` : "";
  const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1), android = /Android/.test(ua);
  // iPhone: a section for Safari and a separate one for Chrome, the browser in use first; Android: Chrome only
  const order = android ? ["android"] : ios && /CriOS/.test(ua) ? ["chrome", "safari"] : ["safari", "chrome"]; // the browser in use first
  const title = { safari: "iPhone, in Safari", chrome: "iPhone, in Chrome", android: "Android, in Chrome" };
  const head = (t) => `<h3><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>${t}</h3>`;
  const sec = (k, i) => `<div class="wl-save">${head(title[k])}
    ${!ios && !android && i === 0 ? `<p class="wl-note">Open this link on your phone, then:</p>` : ""}${saveSteps(k)}
    ${inSettings || i === order.length - 1 ? `<small>Then open it from the Citizens VCRM icon. It works like an app, with <span class="wl-inmic" role="img" aria-label="microphone" style="width:18px;height:18px;vertical-align:-4px">${mic(11)}</span> ready.</small>` : ""}</div>`;
  // in Settings only the steps for the browser in use are open; the other browser's steps sit behind "Using a different browser?"
  if (inSettings) return sec(order[0], 0) + (order.length > 1 ? `<details class="othbr"><summary>Using a different browser?</summary>${order.slice(1).map((k, i) => sec(k, i + 1)).join("")}</details>` : "");
  return `<h3 class="wl-savetitle">${SAVE_TITLE}</h3>` + order.map(sec).join("");
}
// drawings of the browser bar each phone shows, with the button to tap ringed in red
const SAVE_ICO = {
  share: `<span class="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v8h14v-8"/></svg></span>`,
  hdots: `<span class="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></span>`,
  vdots: `<span class="ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></span>`
};
function saveBar(kind) {
  const ring = (x, y) => `<circle cx="${x}" cy="${y}" r="15" fill="none" stroke="#d62b2b" stroke-width="2.5"/>`;
  const shareG = (x, y) => `<g transform="translate(${x - 8},${y - 9})" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1v10M4.5 4.5 8 1l3.5 3.5"/><path d="M2.5 8v8.5h11V8"/></g>`;
  const url = (x, w, y) => `<rect x="${x}" y="${y - 13}" width="${w}" height="26" rx="13" fill="var(--surface)" stroke="var(--line)"/><text x="${x + w / 2}" y="${y + 4}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".7">westlayke.github.io</text>`;
  let inner, cap;
  if (kind === "safari") {
    inner = `<rect x="1" y="1" width="258" height="46" rx="23" fill="var(--bg, #f4f6f9)" stroke="var(--line)"/>
      <path d="M26 16l-8 8 8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${url(46, 156, 24)}
      <g fill="currentColor"><circle cx="223" cy="24" r="2.2"/><circle cx="230" cy="24" r="2.2"/><circle cx="237" cy="24" r="2.2"/></g>${ring(230, 24)}`;
    cap = "Bottom of Safari";
  } else if (kind === "safari-old") {
    inner = `<rect x="1" y="1" width="258" height="46" rx="10" fill="var(--bg, #f4f6f9)" stroke="var(--line)"/>
      <path d="M30 16l-8 8 8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/><path d="M68 16l8 8-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/>
      ${shareG(130, 24)}${ring(130, 24)}<path d="M178 18h12v14h-12zM183 18v-2h12v14h-2" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".5"/><rect x="220" y="17" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".5"/>`;
    cap = "Bottom of Safari";
  } else if (kind === "chrome") {
    inner = `<rect x="1" y="1" width="258" height="46" rx="10" fill="var(--bg, #f4f6f9)" stroke="var(--line)"/>${url(12, 196, 24)}${shareG(232, 24)}${ring(232, 24)}`;
    cap = "Top of Chrome";
  } else {
    inner = `<rect x="1" y="1" width="258" height="46" rx="10" fill="var(--bg, #f4f6f9)" stroke="var(--line)"/>${url(12, 196, 24)}
      <g fill="currentColor"><circle cx="236" cy="17" r="2.2"/><circle cx="236" cy="24" r="2.2"/><circle cx="236" cy="31" r="2.2"/></g>${ring(236, 24)}`;
    cap = "Top of Chrome";
  }
  return `<figure class="wl-bar"><svg viewBox="0 0 260 48" width="100%" style="max-width:260px" role="img" aria-label="${cap}, with the button to tap circled">${inner}</svg><figcaption>${cap}</figcaption></figure>`;
}
function saveSteps(kind) {
  const v = +((navigator.userAgent.match(/Version\/(\d+)/) || [])[1] || 0);
  const oldSafari = kind === "safari" && v && v < 26; // Safari before iOS 26 has Share right in the bottom bar
  const steps = kind === "chrome" ? [`Tap ${SAVE_ICO.share} Share at the top right, next to the address.`, `Tap <b>Add to Home Screen</b>. If you don't see it, tap <b>More</b> first.`, `Tap <b>Add</b>.`]
    : kind === "android" ? [`Tap ${SAVE_ICO.vdots} at the top right of Chrome.`, `Tap <b>Add to home screen</b> (or <b>Install app</b>).`, `Tap <b>Add</b> or <b>Install</b>.`]
    : oldSafari ? [`Tap ${SAVE_ICO.share} Share at the bottom of Safari.`, `Scroll down and tap <b>Add to Home Screen</b>.`, `Tap <b>Add</b>.`]
    : [`Tap ${SAVE_ICO.hdots} at the bottom right of Safari.`, `Tap ${SAVE_ICO.share} <b>Share</b>.`, `Scroll down and tap <b>Add to Home Screen</b>. If you don't see it, tap <b>View More</b> first.`, `Tap <b>Add</b>.`];
  return `${saveBar(oldSafari ? "safari-old" : kind)}<ol>${steps.map(x => `<li>${x}</li>`).join("")}</ol>`;
}
// a phone that opens the demo without its #code (for example from the home-screen icon) asks for the code word once
function codeModal(opening) {
  const h = document.getElementById("modal");
  h.innerHTML = `<div class="scrim center"><div class="wmodal" role="dialog" aria-modal="true" aria-labelledby="cmTitle">
    <h2 id="cmTitle">Enter the code word</h2>
    <p>${S.settings.demoCode ? "That code word didn't work." : "This copy of the demo doesn't have its code word yet."} It's the word after <b>#code=</b> in the demo link you were sent.</p>
    <input id="codeIn" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Code word" style="font:inherit;font-size:16px;padding:11px 12px;border:1px solid var(--line);border-radius:10px">
    <button class="btn blue" id="codeGo">Save and start</button><button class="btn quiet" id="codeX">Cancel</button></div></div>`;
  const inp = document.getElementById("codeIn"); inp.focus();
  const go = () => { const v = inp.value.trim(); if (!v) return; S.settings.demoCode = v; save(); h.innerHTML = ""; startCall(opening); };
  document.getElementById("codeGo").onclick = go; inp.onkeydown = (e) => { if (e.key === "Enter") go(); };
  document.getElementById("codeX").onclick = () => { h.innerHTML = ""; };
}
const SHARE_URL = "https://westlayke.github.io/veleer-voice-demo/";
function copyShareLink() {
  const done = () => toast("Link copied");
  (navigator.clipboard ? navigator.clipboard.writeText(SHARE_URL).then(done) : Promise.reject()).catch(() => showQR(true));
}
function shareDemo() {
  if (navigator.share) {
    navigator.share({ title: "Citizens VCRM voice proof of concept", text: "Try the Citizens VCRM voice proof of concept: talk to the CRM like a colleague.", url: SHARE_URL })
      .catch((e) => { if (!e || e.name !== "AbortError") copyShareLink(); });
  } else copyShareLink();
}
function showQR(copyFailed) {
  const h = document.getElementById("modal");
  const draw = () => {
    const q = qrcode(0, "M"); q.addData(SHARE_URL); q.make();
    h.innerHTML = `<div class="scrim center"><div class="wmodal" role="dialog" aria-modal="true" aria-labelledby="qrTitle" style="align-items:center;text-align:center">
      <h2 id="qrTitle">Scan to open the proof of concept</h2>
      <p style="color:var(--muted)">Point a phone camera at the code.</p>
      <div style="background:#fff;padding:10px;border-radius:12px;line-height:0">${q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }).replace("<svg ", '<svg style="width:240px;height:240px" ')}</div>
      <input readonly value="${SHARE_URL}" onclick="this.select()" aria-label="Link" style="width:100%;font:inherit;font-size:14px;padding:9px 10px;border:1px solid var(--line);border-radius:10px;text-align:center">
      ${copyFailed ? `<p style="font-size:13px;color:var(--muted)">Copying isn't available here. Tap the link above to select it, then copy it.</p>` : ""}
      <button class="btn blue" id="qrClose" style="width:100%">Done</button></div></div>`;
    document.getElementById("qrClose").onclick = () => { h.innerHTML = ""; welcomeModal(); };
  };
  if (window.qrcode) return draw();
  const sc = document.createElement("script"); sc.src = "qrcode.js"; sc.onload = draw;
  sc.onerror = () => toast("Couldn't load the QR code. Check the connection."); document.head.appendChild(sc);
}
// the ? next to "Say things like…": a short how-to with a clear way out (× at the top, Close at the bottom, tap outside, or Esc)
function helpModal() {
  const h = document.getElementById("modal");
  h.innerHTML = `<div class="scrim center" data-helpx="1"><div class="wmodal hmodal" role="dialog" aria-modal="true" aria-labelledby="hmTitle">
    ${HELP_X}
    <h2 id="hmTitle">How to talk to ${esc(botName())}</h2>
    <ol class="hm-steps"><li>Tap <span class="wl-inmic" role="img" aria-label="microphone">${mic(13)}</span> at the bottom of the screen.</li>
      <li>Say what you want, like <b>“Log a meeting with Ruth”</b> or <b>“What are my open tasks?”</b> You can interrupt at any time.</li>
      <li>${esc(botName())} fills in the form on screen. Check it, then tap <b>Save</b>.</li>
      <li>Tap the mic again to hang up. After ${IDLE_MS / 1000} seconds of quiet, the call ends by itself.</li></ol>
    <p class="wl-hint">Tap any option under “Say things like…” to get started with that request.</p>
    <button type="button" class="btn blue" data-helpx="1">Close</button></div></div>`;
}
document.addEventListener("click", (e) => { const x = e.target.closest("[data-helpx]"); if (!x) return; if (x.classList.contains("scrim") && e.target !== x) return; document.getElementById("modal").innerHTML = ""; });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.querySelector(".hmodal")) document.getElementById("modal").innerHTML = ""; });
let WELCOME_FULL = false; // set when the officer chooses to type their name on the first screen
function welcomeModal() {
  const h = document.getElementById("modal");
  if (S.seenWelcome && S.settings.seenPrivacy && S.settings.userName) { h.innerHTML = ""; return; } // phones that saw the welcome before activity logging see it once more, for the notice
  // first visit: one big mic, so the first tap starts the assistant, which asks for the first name (phones need a tap before sound or the mic)
  if (!S.settings.userName && !WELCOME_FULL) {
    h.innerHTML = `<div class="scrim center"><div class="wmodal wl-start" role="dialog" aria-modal="true" aria-labelledby="wmTitle">
      <img src="logo-v6.png" alt="Citizens Alliance" class="wl-logo">
      <h2 id="wmTitle">Meet your new voice assistant!</h2>
      <p>You're a gift officer at Citizens Alliance. Tap the mic and ${esc(botName())} will introduce itself and ask your first name.</p>
      <button type="button" class="wl-mic big" data-act4="voice" aria-label="Tap to start talking">${mic(40)}</button>
      <div class="wl-tap">Tap to start</div>
      <p class="wl-priv">Conversations and taps are saved to improve the proof of concept. Details in Settings.</p>
      <button type="button" class="btn quiet" data-act5="typename">I'd rather type my name</button></div></div>`;
    return;
  }
  h.innerHTML = `<div class="scrim center"><div class="wmodal wl-type" role="dialog" aria-modal="true" aria-labelledby="wmTitle">
    <img src="logo-v6.png" alt="Citizens Alliance" class="wl-logo">
    <h2 id="wmTitle">What's your first name?</h2>
    <p class="wl-sub">${esc(botName())} will use it. You're a gift officer at Citizens Alliance, working with example contacts.</p>
    <input id="wlName" class="wl-input" aria-label="Your first name" name="vcrm-first-name-x" autocomplete="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore placeholder="For example, Sam" value="${esc(S.settings.userName || "")}">
    <div class="wl-err" id="wlErr" hidden>Please enter your first name.</div>
    <button class="btn blue" data-act4="welcome-ok">Start</button>
    <p class="wl-priv">This proof of concept saves when you open the app, what you say to the assistant and its replies, what you tap, and what is in each form when you tap Save, with your first name, a random ID for this phone and your rough location (city), to improve the proof of concept. No audio is kept. Kept for 90 days.</p>
    <div class="wl-links"><button type="button" class="linkbtn" data-act4="voice">${mic(14)} Say it instead</button><button type="button" class="linkbtn" data-act2="share">Share this proof of concept</button></div></div></div>`;
  setTimeout(() => { const el = document.getElementById("wlName"); if (el && el.value !== (S.settings.userName || "")) el.value = S.settings.userName || ""; }, 300); // browsers may autofill an old name
}
document.addEventListener("click", (e) => { const a = e.target.closest("[data-act4]"); if (a && a.dataset.act4 === "voice") { const el = document.getElementById("wlName"), v = el ? el.value.trim().replace(/\s+/g, " ").slice(0, 60) : "";
    if (v) S.settings.userName = v; S.seenWelcome = true; S.settings.seenPrivacy = true; S.settings.seenFormLog = true; S.screen = "home"; save(); document.getElementById("modal").innerHTML = ""; render(); window.scrollTo(0, 0); ask(null); return; }
  if (a) { const el = document.getElementById("wlName"); const v = el ? el.value.trim().replace(/\s+/g, " ").slice(0, 60) : (S.settings.userName || "");
    if (!v) { const er = document.getElementById("wlErr"); if (er) er.hidden = false; if (el) el.focus(); return; }
    const isNew = v !== (S.settings.userName || "");
    S.settings.userName = v; S.seenWelcome = true; S.settings.seenPrivacy = true; S.settings.seenFormLog = true; S.screen = "home"; save(); welcomeModal(); render(); window.scrollTo(0, 0);
    if (isNew && !G.live) startCall(greetLine(v)); } }); // a newly entered name starts the conversation with the standard greeting
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "wlName") { e.preventDefault(); const b = document.querySelector("[data-act4=welcome-ok]"); if (b) b.click(); } }); // the keyboard Go key starts too
document.addEventListener("click", (e) => { if (e.target.closest("[data-act5=typename]")) { WELCOME_FULL = true; welcomeModal(); setTimeout(() => { const el = document.getElementById("wlName"); if (el) el.focus(); }, 50); } });
const botName = () => (S.settings.botName || "").trim() || ((S.settings.voice || "ara")[0].toUpperCase() + (S.settings.voice || "ara").slice(1)); // the assistant's name: set in Settings, else its voice's name
const CMD_LIST = "Ask me for any task in your own words. While a form is open you can also say: cancel, to close it without saving; start over, to clear it; undo, to take back my last change; go back, for the previous screen; or say that again, to hear me repeat.";
const CAN_DO = "I can do things related to managing your contacts and opportunities, like reviewing your open tasks, creating a contact, hearing a contact's giving history, reviewing your open opportunities, or review our fundraising process, and much more. What would you like to do today?";
const greetLine = (name) => `The officer just entered their first name and tapped Start. Say exactly this and nothing more, then wait for their answer: "Hi ${name.split(" ")[0]}, I'm ${botName()}, what would you like to do?" If they ask what you can do, say exactly: "${CAN_DO}" If they ask for the process, walk them through it as you would for "Walk me through the process".`;

const myOpen = () => S.opps.filter(o => o.stage !== "Closed");
const AWAIT_WARN_DAYS = 14; // tenant setting in the guide; demo default
const daysAwaiting = (a) => Math.max(0, Math.round((new Date(todayISO()) - new Date(a.askedOn || todayISO())) / 864e5)); // days since the ask was made
// the amount line on an opportunity's list row and board card
const oppAmountText = (o, a) => o.pledge ? (o.pledge.implied ? "Committed " + money(o.pledge.amount) + " · implied" : o.pledge.outright ? "Committed " + money(o.pledge.amount) + " · gift to follow" : "Pledged " + money(o.pledge.amount)) : a ? (a.status === "Planned" ? "Planned ask " : "Asked ") + money(a.amount) : "Potential " + money(o.potential);
const isStandalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone; // opened from the home screen icon
function oppAlert(o) {
  const a = latestAsk(o), c = contactById(o.contactId);
  if (o.stage === "Closed") return o.closed === "Lost" ? { tone: "warn", text: "Closed Lost" } : { tone: "ok", text: "Closed Won" };
  if (readyForCultivation(o)) return { tone: "ok", text: "Ready for Cultivation", act: true };
  if (o.stage === "Ask Made" && agreed(a)) return { tone: "warn", text: "Pledge to record", act: true };
  if (o.stage === "Commitment" && o.pledge && o.pledge.outright) return { tone: "ok", text: "Gift to follow" };
  if (o.stage === "Ask Made" && a && a.status === "Made") { const days = daysAwaiting(a); return { tone: days >= AWAIT_WARN_DAYS ? "warn" : "info", text: `Awaiting response · ${days} day${days === 1 ? "" : "s"}`, act: days >= AWAIT_WARN_DAYS }; }
  if (o.stage === "Ask Planning" && a) { const days = Math.round((new Date(a.plannedDate) - new Date(todayISO())) / 864e5); return { tone: days <= 7 ? "warn" : "info", text: days < 0 ? `Ask date passed ${fmtDate(a.plannedDate)}` : `Ask planned for ${fmtDate(a.plannedDate)}`, act: days <= 7 }; }
  return null;
}
// what moves an opportunity to its next stage: a checklist on the record, one "Next:" line in the list, and the assistant's summary
function nextStep(o) {
  if (!o || o.stage === "Closed") return null;
  const c = contactById(o.contactId), a = latestAsk(o), first = c ? c.first : "them", today = todayISO();
  const days = (iso) => Math.round((new Date(iso) - new Date(today)) / 864e5);
  if (o.stage === "Qualification") {
    const rated = !!(c && c.capacity), talked = !!(c && subCount(c)), d = o.defer && deferActive(o);
    const items = [
      { st: rated ? "yes" : "no", need: "A capacity rating", sub: rated ? `Rated ${c.capacity} · ${CAPACITY[c.capacity]}` : `To do: rate ${first} on their record, or when you log a meeting.` },
      { st: talked ? "yes" : "no", need: "A substantive interaction", sub: talked ? `${subCount(c)} logged` : "To do: log a real conversation with them about the relationship or the gift." },
      { st: rated && talked ? (d ? "no" : "next") : "wait", need: "You confirm the move", sub: !(rated && talked) ? "Once the two above are done." : d ? `Deferred${o.defer.until ? " until " + fmtDate(o.defer.until) : ""}: ${o.defer.reason}` : "Tap Move to Cultivation, or defer with a reason." } ];
    const line = !rated ? `rate ${first}` : !talked ? "log a substantive interaction" : d ? `deferred${o.defer.until ? " until " + fmtDate(o.defer.until) : ""}` : "confirm the move to Cultivation";
    return { to: "Cultivation", items, line, warn: false };
  }
  if (o.stage === "Cultivation") return { to: "Ask Planning", items: [{ st: "next", need: "Add a planned ask", sub: "Tap + Add planned ask: entity, campaign, planned date and amount." }], line: "add a planned ask" };
  if (o.stage === "Ask Planning" && a) { const n = days(a.plannedDate), late = n < 0;
    return { to: "Ask Made", warn: late, items: [{ st: late ? "no" : "next", need: `Make the ${money(a.amount)} ask, then record it`, sub: late ? `The planned date, ${fmtDate(a.plannedDate)}, has passed. Make the ask or set a new date.` : `Planned for ${fmtDate(a.plannedDate)}${n === 0 ? " (today)" : n === 1 ? " (tomorrow)" : ` (in ${n} days)`}.` }], line: `record the ask (${late ? "date passed " : ""}${fmtDate(a.plannedDate)})` }; }
  if (o.stage === "Ask Made" && a) {
    if (agreed(a)) return { to: "Commitment", items: [{ st: "next", need: "Record the pledge", sub: `${first} said yes to ${money(a.amount)}. Record the pledge once it's confirmed by email, phone or in person, or Record gift if the money arrives first.` }], line: "record the pledge" };
    const n = Math.max(0, -days(a.askedOn || today)), late = n >= AWAIT_WARN_DAYS;
    return { to: "Commitment", warn: late, items: [{ st: "yes", need: `Ask made: ${money(a.amount)}`, sub: a.askedOn ? `On ${fmtDate(a.askedOn)}` : "" }, { st: late ? "no" : "next", need: `Record ${first}'s answer`, sub: `Waiting ${n} day${n === 1 ? "" : "s"}${late ? ". Time to follow up." : "."} Then record ${a.askType === "Outright" ? "the answer: a yes moves it to Commitment," : "the pledge, or Record gift if the money arrives first,"} or a counter or decline.` }], line: `record ${first}'s answer (${n} day${n === 1 ? "" : "s"})` };
  }
  if (o.stage === "Commitment" && o.pledge && o.pledge.outright) { const due = o.pledge.firstDue, late = due && due < today;
    return { to: "Closed Won", warn: late, items: [{ st: "yes", need: `Outright gift agreed: ${money(o.pledge.amount)}`, sub: `At the ask on ${fmtDate(o.pledge.confirmedDate)}` }, { st: late ? "no" : "next", need: "Record the gift", sub: `Follow up by ${fmtDate(due)}${late ? ", now overdue" : ""}. Record gift when it arrives; it closes the opportunity as Closed Won.` }], line: `record the gift (${money(o.pledge.amount)} agreed)` }; }
  if (o.stage === "Commitment" && o.pledge) { const due = o.pledge.firstDue, late = due && due < today;
    return { to: "Closed Won", warn: late, items: [{ st: "yes", need: `Pledge recorded: ${money(o.pledge.amount)}`, sub: `Confirmed by ${o.pledge.confirmedBy || "the investor"}` }, { st: late ? "no" : "next", need: "Record the first gift on the pledge", sub: `${money(o.pledge.firstAmount)} due ${fmtDate(due)}${late ? ", now overdue" : ""}. Record gift closes the opportunity as Closed Won.` }], line: `record the first gift on the pledge (due ${fmtDate(due)})` }; }
  return null;
}
function nextPanel(o) {
  const n = nextStep(o); if (!n) return "";
  const mark = { yes: "✓", no: "!", next: "→", wait: "·" };
  return `<section class="panel nextp"><div class="ph"><h2>To reach ${esc(n.to)}</h2></div><ul class="gate inpanel">${n.items.map(x => `<li class="${{ next: "gnext", wait: "gwait" }[x.st] || x.st}"><span class="gk" aria-hidden="true">${mark[x.st]}</span><span>${esc(x.need)}${x.sub ? `<small>${esc(x.sub)}</small>` : ""}</span></li>`).join("")}</ul>
    <span class="flowlink" data-act2="flowat" data-stage="${esc(o.stage)}">How ${esc(o.stage)} works ›</span></section>`;
}
// Needs attention: one plain line saying what to do about each alert
function alertTodo(o, al) {
  const a = latestAsk(o), c = contactById(o.contactId), first = c ? c.first : "them", amt = a ? money(a.amount) + " " : "";
  if (/^Ready for Cultivation/.test(al.text)) return `${first} meets every Qualification step. Move to Cultivation?`;
  if (/^Pledge to record/.test(al.text)) return `${first} agreed to give. Record the pledge.`;
  if (/^Awaiting response/.test(al.text)) { const d = al.text.match(/\d+/); return `No reply to your ${amt}ask for ${d ? d[0] : "some"} days. Follow up with ${first}?`; }
  if (/^Ask date passed/.test(al.text)) return `The planned date for your ${amt}ask has passed. Make the ask or set a new date.`;
  if (/^Ask planned/.test(al.text)) return `Your ${amt}ask to ${first} is coming up. Get ready.`;
  return "";
}
// a task's alert: the same pill on Home (Needs attention), the Tasks screen and the record screens
const taskAlert = (t) => !t.done && t.due && t.due < todayISO() ? { tone: "warn", text: "Overdue" } : null;
const alertPill = (al) => al ? `<span class="alert ${al.tone}">${esc(al.text)}</span>` : "";
// Needs attention: every item with its kind and urgency, so it can be filtered (chips) and grouped (All)
function attentionItems() {
  const items = [], late = (al) => /overdue|passed/i.test(al.text);
  const rank = (al) => !al ? 3 : late(al) ? 0 : al.tone === "warn" ? 1 : al.tone === "ok" ? 2 : 3;
  myOpen().forEach(o => {
    const al = oppAlert(o);
    if (al && al.act) items.push({ kind: "opp", overdue: late(al), rank: rank(al), name: o.name, say: `${o.name}: ${al.text}. ${alertTodo(o, al)}`,
      html: `<div class="row tap" data-opp="${o.id}"><div class="t">${alertPill(al)}<div class="na-do">${esc(alertTodo(o, al))}</div><div class="s">${esc(o.name)}</div></div><span class="chev">${CHEV}</span></div>` });
  });
  S.contacts.filter(oppReady).forEach(c => items.push({ kind: "contact", overdue: false, rank: 2, name: `${c.last}, ${c.first}`, say: `${nameOf(c)} is ready for an opportunity`,
    html: `<div class="row tap" data-contact="${c.id}"><div class="t"><span class="alert ok">Ready for opportunity</span><div class="na-do">${esc(c.first)} meets every requirement. Create an opportunity?</div><div class="s">${esc(nameOf(c))} · capacity ${c.capacity}</div></div><span class="chev">${CHEV}</span></div>` }));
  S.tasks.filter(t => !t.done && t.due && t.due <= addDays(todayISO(), 7)).forEach(t => { const al = taskAlert(t);
    items.push({ kind: "task", overdue: !!al, rank: al ? 0 : 3, due: t.due, name: t.text, say: `Task "${t.text}" for ${nameOf(contactById(t.contactId))}, due ${fmtDate(t.due)}${al ? " (overdue)" : ""}`,
      html: `<div class="row tap" data-go="tasks"><div class="t">${alertPill(al)}<div class="${al ? "na-do" : ""}">${esc(t.text)}</div><div class="s">Due ${fmtDate(t.due)} · ${esc(nameOf(contactById(t.contactId)))}</div></div><span class="chev">${CHEV}</span></div>` }); });
  const hf = hfUnchecked();
  if (hf.length) items.push({ kind: "hf", overdue: false, rank: 1, name: "hands-free", say: `${hf.length} hands-free save${hf.length > 1 ? "s" : ""} to check`,
    html: `<div class="row tap" data-act2="hfcheck"><div class="t"><span class="alert warn">Hands-free</span><div class="na-do">Check ${hf.length} hands-free save${hf.length > 1 ? "s" : ""}</div><div class="s">Saved by voice after you said yes. Make sure they're right.</div></div><span class="chev">${CHEV}</span></div>` });
  // most urgent first: overdue, then waiting too long (amber), then ready to move (green); tasks by due date
  return items.sort((a, b) => a.rank - b.rank || (a.due || "").localeCompare(b.due || "") || a.name.localeCompare(b.name));
}
const NA_FILTERS = { all: ["All", () => true], overdue: ["Overdue", x => x.overdue], opps: ["Opportunities", x => x.kind === "opp"], tasks: ["Tasks", x => x.kind === "task"], contacts: ["Contacts", x => x.kind === "contact"] };
const NA_GROUPS = [["hf", "Hands-free saves", x => x.kind === "hf"], ["overdue", "Overdue", x => x.overdue], ["opps", "Move an opportunity forward", x => !x.overdue && x.kind === "opp"], ["tasks", "Tasks this week", x => !x.overdue && x.kind === "task"], ["contacts", "Ready for an opportunity", x => x.kind === "contact"]];
const NA_SHOW = 5;
function needsAttention() {
  const items = attentionItems(), fk = NA_FILTERS[S.naFilter] ? S.naFilter : "all";
  if (!items.length) return `<div class="empty">Nothing needs your attention right now.</div>`;
  const chips = `<div class="cfilt na-chips" role="tablist" aria-label="Show">${Object.entries(NA_FILTERS).map(([k, f]) => `<button type="button" role="tab" aria-selected="${k === fk}" class="${k === fk ? "on" : ""}" data-act2="nafilt" data-v="${k}">${f[0]} <b>${items.filter(f[1]).length}</b></button>`).join("")}</div>`;
  if (fk !== "all") { const rows = items.filter(NA_FILTERS[fk][1]); return chips + (rows.length ? rows.map(x => x.html).join("") : `<div class="empty">Nothing here right now.</div>`); }
  // All: short groups, up to five each, with Show all
  G.naOpen = G.naOpen || {};
  return chips + NA_GROUPS.map(([k, head, f]) => { const xs = items.filter(f); if (!xs.length) return "";
    const shown = G.naOpen[k] ? xs : xs.slice(0, NA_SHOW);
    return `<div class="na-h">${head} <b>${xs.length}</b></div>${shown.map(x => x.html).join("")}${xs.length > shown.length ? `<button type="button" class="linkbtn na-more" data-act2="namore" data-v="${k}">Show all ${xs.length}</button>` : ""}`; }).join("");
}
// "Sun, Oct 25 · in 5 days"
function dayLabel(iso) { const d = new Date(iso + "T12:00:00"), n = Math.round((new Date(iso) - new Date(todayISO())) / 864e5);
  return `${d.toLocaleDateString("en-US", { weekday: "short" })}, ${fmtDate(iso)} · ${n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`}`; }
function upcomingPanel() {
  const m = (S.meetings || []).filter(x => x.date >= todayISO()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 3);
  return `<section class="panel"><div class="ph"><h2>Upcoming meetings</h2><span class="meta">${m.length ? "next " + m.length : ""}</span></div>${m.length ? m.map(x => { const who = nameOf(contactById(x.contactId));
    return `<div class="row tap" data-contact="${x.contactId}"><div class="t">${esc(x.title)}<div class="s">${dayLabel(x.date)} · ${fmtTime(x.time)} · ${esc(x.type || "")}</div></div>${who ? `<button type="button" class="mtg-prep" data-act2="mtgprep" data-who="${esc(who)}">${mic(11)} Prepare</button>` : `<span class="chev">${CHEV}</span>`}</div>`; }).join("") : `<div class="empty">No meetings booked. Say “Schedule a meeting with Ruth”.</div>`}</section>`;
}
// example goals until the customer gives real ones
const GOALS = { raised: 300000, asks: 12 };
function goalsPanel() {
  const y = todayISO().slice(0, 4), raised = S.contacts.reduce((n, c) => n + givingOf(c).ytd, 0);
  const asks = S.opps.reduce((n, o) => n + o.asks.filter(a => a.status !== "Planned" && String(a.askedOn || "").slice(0, 4) === y).length, 0);
  const bar = (v, g) => `<div class="gbar"><span style="width:${Math.min(100, Math.round(v / g * 100))}%"></span></div>`;
  return `<section class="panel"><div class="ph"><h2>My goals</h2><span class="meta">example goals · this year</span></div>
    <div class="goals"><div class="tap" data-go="board"><div class="k">Raised</div><div class="v">${money(raised)} <small>of ${money(GOALS.raised)}</small></div>${bar(raised, GOALS.raised)}</div>
    <div class="tap" data-go="board"><div class="k">Asks made</div><div class="v">${asks} <small>of ${GOALS.asks}</small></div>${bar(asks, GOALS.asks)}</div></div></section>`;
}
// Home (last on the page): a slim card pointing to the add-to-home-screen steps in Settings; gone once the app is opened from the home screen, or when closed with ×
function addBtnCard() {
  const standalone = isStandalone();
  if (standalone || S.settings.hideAddBtn) return "";
  return `<div class="addbtn-card" role="button" tabindex="0" data-act2="addbtn">${APP_BTN(40)}<div class="t"><b>Add Citizens VCRM to your Home Screen</b><span>Open Citizens VCRM like an app. Show me how</span></div><span class="chev">${CHEV}</span><button type="button" class="x" data-act2="addbtnx" aria-label="Hide this">×</button></div>`;
}
function homeScreen() {
  const open = myOpen(), asked = open.reduce((n, o) => n + (o.stage === "Commitment" ? 0 : askedOf(o)), 0), pledged = open.reduce((n, o) => n + (o.pledge ? o.pledge.amount : 0), 0);
  // the overview row sits at the bottom of Home
  const ov = `<section class="panel"><div class="ovrow"><div class="t"><b>From first contact to Closed Won</b><button type="button" class="linkbtn" data-act2="flowhome">See the stages</button></div>
    <button class="btn blue" data-say="Walk me through the process" data-nohint="1">${mic(15)} Hear the overview</button></div></section>`;
  return topbar("Home", null, true) + `<main>${xmasMode() ? NATIVITY : ""}
  <section class="panel"><div class="ph"><h2>Say things like…</h2><button class="ph-help" data-act2="help" aria-label="How voice works">?</button></div>${sayList()}</section>
  <section class="panel"><div class="ph"><h2>Needs attention</h2></div>${needsAttention()}</section>
  ${upcomingPanel()}
  <section class="panel"><div class="ph"><h2>My pipeline</h2><span class="meta">open opportunities</span></div>
    <div class="tiles"><div class="tile tap" data-go="board"><div class="k">Open opportunities</div><div class="v">${open.length}</div></div>
    <div class="tile tap" data-go="board"><div class="k">Asked <span class="go">›</span></div><div class="v">${money(asked)}</div></div>
    <div class="tile tap ${pledged ? "hl" : ""}" data-go="board"><div class="k">Pledged <span class="go">›</span></div><div class="v">${money(pledged)}</div></div></div>
  </section>
  ${goalsPanel()}
  ${canTalk() ? "" : `<section class="note" style="border-radius:12px">Voice needs an xAI API key on this phone. <button class="btn quiet" data-go="settings" style="margin-top:8px;width:100%">Open Settings</button></section>`}
  ${ov}
  ${addBtnCard()}
  </main>`;
}
function contactsScreen() {
  const all = S.contacts.slice().sort((a, b) => `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`));
  const F = { all: ["All", () => true, "My contacts"], ready: ["Ready for opportunity", oppReady, "Ready for opportunity"], rating: ["Needs rating", needsRating, "Need a capacity rating"] };
  const fk = F[S.cFilter] ? S.cFilter : "all", rows = all.filter(F[fk][1]);
  const chips = `<div class="cfilt" role="tablist" aria-label="Show">${Object.entries(F).map(([k, f]) => `<button type="button" role="tab" aria-selected="${k === fk}" class="${k === fk ? "on" : ""}" data-act2="cfilt" data-v="${k}">${f[0]}${k === "all" ? "" : ` <b>${all.filter(f[1]).length}</b>`}</button>`).join("")}</div>`;
  return topbar("Contacts") + `<main><input id="cSearch" class="search" type="search" placeholder="Search contacts" autocomplete="off">${chips}<section class="panel"><div class="ph"><h2>${F[fk][2]}</h2><span class="meta">${rows.length}</span></div>${rows.length ? "" : `<div class="empty">${fk === "ready" ? "Nobody is ready yet. Contacts need a capacity rating and no open opportunity." : "Everyone is rated."}</div>`}
  ${rows.map(c => { const o = openOpp(c.id); return `<div class="row tap" data-contact="${c.id}" data-name="${esc((nameOf(c) + " " + c.email + " " + (c.mobile || "")).toLowerCase())}"><div class="t"><span class="lnk">${esc(c.last)}, ${esc(c.first)}</span>${c.added === todayISO() ? ' <span class="alert info">New</span>' : ""}${oppPill(c)}<div class="s">${esc(c.status)}${c.capacity ? " · capacity " + c.capacity : ""}${o ? " · " + esc(o.stage) : ""}</div></div><span class="chev">${CHEV}</span></div>`; }).join("")}
  </section><button class="btn out" data-form="contact">Add a contact</button></main>`;
}
function historyPanel(filter) {
  const h = S.history.filter(filter); if (!h.length) return "";
  return `<section class="panel"><div class="ph"><h2>History</h2></div>${h.slice(0, 8).map(x => `<div class="row"><div class="t" style="font-size:14px">${esc(x.text)}<div class="s">${new Date(x.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${OFFICER}${x.hf ? " · hands-free" : x.via ? " · via voice" : ""}</div></div></div>`).join("")}</section>`;
}
function givingPanel(c) {
  const v = givingOf(c);
  return `<section class="panel"><div class="ph"><h2>Giving</h2><span class="meta">${v.count} gift${v.count === 1 ? "" : "s"}</span></div>
    <div class="tiles"><div class="tile"><div class="k">Lifetime</div><div class="v">${money(v.lifetime)}</div></div><div class="tile"><div class="k">This year</div><div class="v">${money(v.ytd)}</div></div>
    <div class="tile"><div class="k">Last gift</div><div class="v">${v.last ? money(v.last.amount) : "None"}</div>${v.last ? `<div class="k" style="margin-top:2px">${fmtDate(v.last.date)}</div>` : ""}</div></div>
    ${v.pledgeLeft ? `<div class="empty" style="font-size:13px;text-align:left;padding-top:0">Open pledge balance: ${money(v.pledgeLeft)}</div>` : ""}</section>`;
}
/* ---------- phone calls: the phone app places the call; on return the app offers the call report ---------- */
const PHONE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>';
const telOf = (c) => "tel:" + String(c.mobile || "").replace(/[^0-9+]/g, "");
const CAL_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
const callBtn = (c) => c.dnc ? "" : `<div class="btns" style="margin-top:8px">${c.mobile && c.permCalls ? `<a class="btn out" href="${telOf(c)}" data-call="${c.id}">${PHONE_SVG} Call ${esc(c.first)}</a>` : ""}<button class="btn out" data-form="meeting" data-cid="${c.id}">${CAL_SVG} Schedule</button></div>`;
function meetingsPanel(c) {
  const m = (S.meetings || []).filter(x => x.contactId === c.id && x.date >= todayISO()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  if (!m.length) return "";
  return `<section class="panel"><div class="ph"><h2>Upcoming meetings</h2><span class="meta">${m.length}</span></div>${m.map(x => `<div class="row"><div class="t">${esc(x.title)}<div class="s">${fmtDate(x.date)} · ${fmtTime(x.time)} · ${esc(x.duration || "")} · ${esc(x.type || "")}${x.location ? " · " + esc(x.location) : ""}</div></div><a class="chev" href="${esc(gcalLink(Object.assign({}, x, { meetingType: x.type }), c))}" target="_blank" aria-label="Open in Google Calendar">›</a></div>`).join("")}</section>`;
}
const onPhone = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
function placeCall(id) {
  const c = contactById(id); if (!c) return;
  document.getElementById("modal").innerHTML = "";
  S.pendingCall = { contactId: id, at: Date.now() }; log(`Phone call to ${nameOf(c)} started from the app`, { contactId: id }, false); save();
  // A phone hides this page when the call starts (the visibility handler ends the conversation and offers the call report on return).
  // A computer may open FaceTime (the window loses focus) or do nothing at all; in that case say so instead of silently dropping the conversation.
  const w = G.callWatch = { id, blurred: false };
  const onBlur = () => { if (G.callWatch !== w) return; w.blurred = true; if (G.live) endCall(); };
  window.addEventListener("blur", onBlur, { once: true });
  setTimeout(() => { if (G.callWatch === w && !w.blurred && document.visibilityState === "visible") { window.removeEventListener("blur", onBlur); noCallModal(c); } }, 5000);
}
window.addEventListener("focus", () => {
  const w = G.callWatch; if (!w || !w.blurred || !S.pendingCall || document.visibilityState !== "visible") return;
  G.callWatch = null; setTimeout(callDoneModal, 400);
});
function noCallModal(c) {
  G.callWatch = null;
  const h = document.getElementById("modal");
  h.innerHTML = `<div class="scrim center"><div class="wmodal" role="dialog" aria-modal="true" aria-labelledby="ncTitle">
    <span class="wl-mic">${PHONE_SVG}</span>
    <h2 id="ncTitle">This ${onPhone() ? "device" : "computer"} didn't start the call</h2>
    <p>Calls start from a phone${onPhone() ? "" : ", or from a Mac set up to make iPhone calls through FaceTime"}. Dial ${esc(nameOf(c))} on your phone at <b>${esc(c.mobile)}</b>, then log it here.</p>
    <button class="btn blue" id="ncLog">${mic(16)} Log the call</button><button class="btn quiet" id="ncX">Cancel</button></div></div>`;
  document.getElementById("ncLog").onclick = () => { if (G.live) endCall(); h.innerHTML = ""; callDoneModal(); setTimeout(() => { const b = document.getElementById("cdLog"); if (b) b.click(); }, 0); };
  document.getElementById("ncX").onclick = () => { delete S.pendingCall; save(); h.innerHTML = ""; };
  if (G.live) notice(`The computer couldn't place the call to ${nameOf(c)}. In one short sentence, say they can dial ${c.first} from their phone at the number on screen and tap Log the call afterwards.`);
}
function callDoneModal() {
  const pc = S.pendingCall, c = pc && contactById(pc.contactId);
  if (!c || Date.now() - pc.at > 3 * 3600e3) { if (pc) { delete S.pendingCall; save(); } return; }
  const h = document.getElementById("modal"), who = nameOf(c);
  h.innerHTML = `<div class="scrim center"><div class="wmodal" role="dialog" aria-modal="true" aria-labelledby="cdTitle">
    <span class="wl-mic">${PHONE_SVG}</span>
    <h2 id="cdTitle">How did the call with ${esc(c.first)} go?</h2>
    <p>Log it now. The Interaction report opens with Phone call and today's date, and the assistant helps you write it up.</p>
    <button class="btn blue" id="cdLog">${mic(16)} Log the call</button><button class="btn quiet" id="cdX">Not now</button></div></div>`;
  document.getElementById("cdLog").onclick = () => {
    delete S.pendingCall; save(); h.innerHTML = "";
    S.sel.contact = c.id; go("contact");
    const t = resolveTarget("interaction", who);
    V = { action: "interaction", target: t, data: prefill("interaction", { meetingType: "Phone call", date: todayISO() }, t), fromVoice: new Set() }; renderOverlay();
    startCall(`The officer just finished a phone call with ${who}. The Interaction report is already on screen with Phone call and today's date. Ask how the call went, then fill in the report by calling show_interaction_draft for ${who} after each answer.`);
  };
  document.getElementById("cdX").onclick = () => { delete S.pendingCall; save(); h.innerHTML = ""; toast(`You can log it later from ${c.first}'s record.`); };
}
function callPromptModal(c) {
  const h = document.getElementById("modal");
  h.innerHTML = `<div class="scrim center"><div class="wmodal" role="dialog" aria-modal="true" aria-labelledby="cpTitle">
    <span class="wl-mic">${PHONE_SVG}</span>
    <h2 id="cpTitle">Call ${esc(nameOf(c))}?</h2>
    <p>${esc(c.mobile)}. ${onPhone() ? "Your phone places the call. When you come back, the app opens the call report." : "On a computer, the call goes through FaceTime if your Mac is set up for iPhone calls; otherwise dial it on your phone."}</p>
    <a class="btn blue" href="${telOf(c)}" data-call="${c.id}">${PHONE_SVG} Call</a><button class="btn quiet" id="cpX">Cancel</button></div></div>`;
  document.getElementById("cpX").onclick = () => { h.innerHTML = ""; };
}
function interactionsPanel(list, always) {
  if (!list.length && !always) return "";
  const l = list.slice().sort((x, y) => String(y.date).localeCompare(String(x.date)));
  return `<section class="panel"><div class="ph"><h2>Interactions</h2><span class="meta">${l.length}</span></div>
  ${l.length ? l.map(i => `<div class="row"><div class="t">${esc(i.type)} · ${fmtDate(i.date)} ${i.kind === "ask" ? '<span class="alert info">Ask made</span>' : ""} ${i.example ? "" : `<span class="via">${mic(11)} via voice</span>`}<div class="s">${esc(i.summary)}</div></div>${i.kind === "ask" ? "" : `<button type="button" class="rowedit" data-form="editInteraction" data-cid="${i.contactId}" data-item="${i.id}" aria-label="Edit the ${esc(i.type)} report of ${fmtDate(i.date)}">Edit</button>`}</div>`).join("") : `<div class="empty">No interactions yet.</div>`}</section>`;
}
function contactScreen() {
  const c = contactById(S.sel.contact);
  if (!c) return contactsScreen();
  const flag = (on, label) => `<span class="flag ${on ? "yes" : "no"}">${on ? "✓" : "✕"} ${label}</span>`;
  const o = openOpp(c.id), ints = S.interactions.filter(i => i.contactId === c.id), who = nameOf(c);
  const checks = oppChecks(c), ready = !o && checks.every(x => x.ok);
  const cOpps = S.opps.filter(x => x.contactId === c.id).sort((x, y) => (x.stage === "Closed") - (y.stage === "Closed"));
  const jn = journeyNext(c), nb = jn && jn.btn, firstTodo = checks.findIndex(x => !x.ok);
  const others = [["Log a meeting", "interaction"], ["Add a task", "task"], ...(o ? [] : [["Create opportunity", "opportunity"]])].filter(([, f]) => !(nb && nb.form === f));
  return topbar("Contact", "contacts") + `<main>
  <section class="panel"><div class="hero"><div class="herotop"><h2>${esc(who)}</h2><button type="button" class="editbtn" data-form="editContact" data-cid="${c.id}" aria-label="Edit ${esc(who)}">Edit</button></div>
    <div class="flags"><span class="pill">${c.ally ? "Ally" : esc(c.status)}</span><button type="button" class="pill rate" data-rate="${c.id}" aria-label="Capacity rating: ${c.capacity ? c.capacity : "not rated"}. Change">${c.capacity ? "Capacity " + c.capacity + " · " + CAPACITY[c.capacity] : "Capacity not rated"}<svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
    <div class="flags">${c.dnc ? '<span class="flag no dnc">✕ Do Not Contact</span>' : flag(c.permEmail, "Email") + flag(c.permCalls, "Calls") + flag(c.permText, "Texts")}${c.ally ? '<span class="flag no">✕ Do not solicit</span>' : ""}</div>
    ${c.permText && c.permSource ? `<div style="font-size:12.5px;color:var(--muted)">Texting permission source: ${esc(c.permSource)}</div>` : ""}
  </div>
  ${trackHTML(o ? STAGES.indexOf(o.stage) + 1 : 0)}
  ${nextBlock(jn && jn.line, jn && jn.warn, nb ? nextBtnHTML(nb) : "")}
  <dl class="kv" style="padding-top:0"><dt>Email</dt><dd>${esc(c.email || "Not given")}</dd><dt>Mobile</dt><dd>${esc(c.mobile || "Not given")}</dd><dt>How we met</dt><dd>${esc(c.howMet || "")}</dd><dt>Gift officer</dt><dd>${OFFICER}</dd></dl></section>
  <section class="next"><b>Do something for ${esc(c.first)}</b><div class="btns">${others.map(([l, f]) => `<button class="btn out" data-form="${f}" data-cid="${c.id}">${l}</button>`).join("")}</div>${callBtn(c)}</section>
  ${o ? "" : ready ? `<section class="panel oppready"><span class="gk" aria-hidden="true">✓</span><div><b>Ready for opportunity</b><div class="s">Rated ${c.capacity} · ${esc(CAPACITY[c.capacity])}. Everything needed is in place.</div></div></section>`
    : `<section class="panel"><div class="ph"><h2>To create an opportunity</h2><span class="alert warn">${checks.filter(x => !x.ok).length} to do</span></div><ul class="gate inpanel">${checks.map((x, i) => `<li class="${x.ok ? "yes" : i === firstTodo && !c.dnc && !c.ally ? "gnext" : "no"}"><span class="gk" aria-hidden="true">${x.ok ? "✓" : i === firstTodo && !c.dnc && !c.ally ? "→" : "!"}</span><span>${esc(x.need)}<small>${x.ok ? esc(x.now) : "To do: " + esc(x.todo)}</small></span></li>`).join("")}</ul></section>`}
  ${givingPanel(c)}
  ${cOpps.length ? `<section class="panel"><div class="ph"><h2>Opportunities</h2></div>${cOpps.map(x => `<div class="row tap" data-opp="${x.id}"><div class="t"><span class="lnk">${esc(x.name)}</span><div class="s">${esc(stageName(x))}${x.gift ? " · gift " + money(x.gift.amount) : x.pledge ? " · pledged " + money(x.pledge.amount) : ""}</div></div><span class="chev">${CHEV}</span></div>`).join("")}</section>` : ""}
  ${interactionsPanel(ints, true)}
  ${meetingsPanel(c)}
  ${tasksPanel(S.tasks.filter(t => t.contactId === c.id), "Tasks")}
  ${historyPanel(x => x.contactId === c.id)}
  </main>`;
}
const STAGE_BTN = { Qualification: "Log interaction", Cultivation: "+ Add planned ask", "Ask Planning": "Record the ask", "Ask Made": "Record pledge", Commitment: "Record gift" };
const STAGE_SAY = { Qualification: "Log a meeting", Cultivation: "Plan an ask", "Ask Planning": "Record the ask", "Ask Made": "Record a pledge", Commitment: "Record a gift" };
const stageName = (o) => o.stage === "Closed" ? "Closed " + (o.closed || "Won") : o.stage;
// the stage's main button: an outright ask that's out waits for a gift, not a pledge
function stageAction(o, a) {
  const outright = o.stage === "Ask Made" && a && a.askType === "Outright";
  return { outright, label: outright ? "Record gift" : STAGE_BTN[o.stage], sayIt: outright ? "Record a gift" : STAGE_SAY[o.stage] };
}
// the one thing to do next on an opportunity: the same button its record shows
function oppPrimary(o) {
  if (!o || o.stage === "Closed") return null;
  const c = contactById(o.contactId), a = latestAsk(o);
  if (readyForCultivation(o)) return { label: "Move to Cultivation", act2: "cultivate", oppId: o.id };
  const { outright, label, sayIt } = stageAction(o, a);
  return label ? { label, form: FORM_FOR[sayIt] || "gift", cid: c.id, oppId: o.id } : null;
}
// the one next step on a contact's journey, from new contact to Closed Won: used by the What's next card, the contact record and the opportunity record
const JOURNEY = ["Contact", ...STAGES];
function journeyNext(c) {
  if (!c) return null;
  const o = openOpp(c.id);
  if (o) { const n = nextStep(o), b = oppPrimary(o); return n ? { line: n.line, warn: n.warn, btn: b, opp: o } : null; }
  if (c.dnc) return { line: "nothing for now. They're marked Do Not Contact", btn: null };
  if (c.ally) return { line: "nothing to ask. They're an Ally - Do Not Solicit", btn: null };
  if (!c.capacity) return { line: `set a capacity rating for ${c.first}`, btn: { label: "Set capacity rating", rate: c.id } };
  return { line: `create an opportunity for ${c.first}`, btn: { label: "Create opportunity", form: "opportunity", cid: c.id } };
}
// a next-step button: opens a form, the rating choices, or Move to Cultivation
const nextBtnHTML = (b, cls = "btn blue", extra = "") => !b ? "" : `<button type="button" class="${cls}" ${extra} ${b.rate ? `data-rate="${b.rate}"` : b.act2 ? `data-act2="${b.act2}" data-oppid="${b.oppId}"` : `data-form="${b.form}" data-cid="${b.cid}"`}>${esc(b.label)}</button>`;
function trackHTML(idx, closed) {
  return `<div class="track">${JOURNEY.map((s, i) => `<div class="${i < idx ? "done" : i === idx ? "on" : ""}">${s === "Closed" && closed ? (closed === "Lost" ? "Lost" : "Won") : s.replace("Qualification", "Qualif.").replace("Cultivation", "Cultiv.").replace("Ask Planning", "Plan ask").replace("Commitment", "Commit")}</div>`).join("")}</div>`;
}
// after a save: what happened and the next form, one tap away (the screens' version of "take me to the next step")
const WN_ACTIONS = ["contact", "interaction", "opportunity", "plan", "ask", "pledge", "gift", "payment", "cultivate"];
function setWhatNext(action, result, t) {
  G.whatNext = WN_ACTIONS.includes(action) ? { saved: ACTIONS[action].saved, screen: S.screen } : null;
}
// the record's one Next block: what was just saved (once), the Next: line and the next-step buttons
function nextBlock(line, warn, btns) {
  const w = G.whatNext && G.whatNext.screen === S.screen ? G.whatNext : null;
  return `<div class="nextblk${w ? " flash" : ""}">${w ? `<div class="justsaved" role="status">✓ ${esc(w.saved)}</div>` : ""}${line ? `<div class="stepnext${warn ? " warn" : ""}">Next: ${esc(line)}</div>` : ""}${btns}</div>`;
}
function oppScreen() {
  const o = oppById(S.sel.opp);
  if (!o) return boardScreen();
  const c = contactById(o.contactId), idx = STAGES.indexOf(o.stage), a = latestAsk(o), asked = askedOf(o);
  let alert = "";
  const met = o.stage === "Qualification" && !cultMissing(c).length;
  if (readyForCultivation(o)) alert = `<span class="alert ok">Ready for Cultivation</span>`;
  else if (met && o.defer) alert = `<span class="alert info">Deferred${o.defer.until ? " until " + fmtDate(o.defer.until) : ""}: ${esc(o.defer.reason)}</span>`;
  if (o.stage === "Ask Planning" && a) alert = `<span class="alert info">Ask planned for ${fmtDate(a.plannedDate)}</span>`;
  if (o.stage === "Ask Made" && agreed(a)) alert = `<span class="alert ok">Agreed, pledge to follow · ${money(a.amount)} verbal</span>`;
  if (o.stage === "Ask Made" && a && a.status === "Made") { const days = daysAwaiting(a); alert = `<span class="alert ${days >= 14 ? "warn" : "info"}">Awaiting response · ${days} day${days === 1 ? "" : "s"}</span>`; }
  if (o.stage === "Closed") alert = o.closed === "Lost" ? `<span class="alert warn">Closed Lost${o.lostReason ? ": " + esc(o.lostReason) : ""}</span>` : `<span class="alert ok">Closed Won${o.gift ? " · gift of " + money(o.gift.amount) + " received" : o.pledge && o.pledge.implied ? " · implied commitment, gift received" : o.pledge && o.pledge.outright ? " · agreed gift received" : o.pledge && o.pledge.payments ? " · first gift on the pledge received" : ""}</span>`;
  if (o.stage === "Commitment" && o.pledge && !o.pledge.outright) alert = `<span class="alert ok">First payment of ${money(o.pledge.firstAmount)} due ${fmtDate(o.pledge.firstDue)}</span>`;
  if (o.stage === "Commitment" && o.pledge && o.pledge.outright) alert = `<span class="alert ok">Agreed, gift to follow · ${money(o.pledge.amount)}</span>`;
  const { outright, label, sayIt } = stageAction(o, a);
  const btn = (!label ? "" : `<button class="btn blue" data-form="${FORM_FOR[sayIt] || (outright ? "gift" : "")}" data-cid="${c.id}">${label}</button>`)
    + (o.stage === "Ask Made" && !outright ? `<button class="btn out" data-form="gift" data-cid="${c.id}">Record gift</button>` : ""); // money can arrive before a pledge: an implied commitment
  return topbar("Opportunity", "board") + `<main>
  <section class="panel"><div class="hero"><h2>${esc(o.name)}</h2><div style="color:var(--muted);font-size:13px"><span class="lnk" data-contact="${c.id}" role="button" tabindex="0">${esc(nameOf(c))}</span> · ${OFFICER}${o.fund ? " · " + esc(o.fund) : ""}</div>${alert ? `<div>${alert}</div>` : ""}</div>
    ${trackHTML(idx + 1, o.closed)}
    <div class="tiles"><div class="tile"><div class="k">Potential</div><div class="v">${money(o.potential)}</div></div><div class="tile ${asked ? "hl" : ""}"><div class="k">Asked</div><div class="v">${money(asked)}</div></div>${o.gift ? `<div class="tile hl"><div class="k">Received</div><div class="v">${money(o.gift.amount)}</div></div>` : `<div class="tile ${o.pledge ? "hl" : ""}"><div class="k">${o.pledge && (o.pledge.implied || o.pledge.outright) ? "Committed" : "Pledged"}</div><div class="v">${money(o.pledge ? o.pledge.amount : 0)}</div></div>`}</div>
    ${nextBlock(nextStep(o) && nextStep(o).line, nextStep(o) && nextStep(o).warn, (met ? `<button class="btn ${readyForCultivation(o) ? "blue" : "out"}" data-act2="cultivate">Move to Cultivation?</button>` : "") + btn)}
  </section>
  ${nextPanel(o)}
  ${o.pledge && o.pledge.implied ? `<section class="panel"><div class="ph"><h2>Commitment</h2></div><dl class="kv"><dt>Type</dt><dd>Implied commitment: the gift arrived while the ask was open, with no pledge</dd><dt>Amount</dt><dd>${money(o.pledge.amount)}</dd><dt>Entity</dt><dd>${esc(o.pledge.fund)}</dd><dt>Received</dt><dd>${o.pledge.payments.map(x => `${money(x.amount)} on ${fmtDate(x.date)} (${esc(String(x.method).toLowerCase())})`).join("<br>")}</dd><dt>Status</dt><dd>${esc(o.pledge.status)}</dd></dl></section>`
  : o.pledge && o.pledge.outright ? `<section class="panel"><div class="ph"><h2>Commitment</h2></div><dl class="kv"><dt>Type</dt><dd>Outright gift agreed at the ask</dd><dt>Amount</dt><dd>${money(o.pledge.amount)}</dd><dt>Entity</dt><dd>${esc(o.pledge.fund)}</dd><dt>Agreed</dt><dd>${fmtDate(o.pledge.confirmedDate)}</dd>${(o.pledge.payments || []).length ? `<dt>Received</dt><dd>${o.pledge.payments.map(x => `${money(x.amount)} on ${fmtDate(x.date)} (${esc(String(x.method).toLowerCase())})`).join("<br>")}</dd>` : ""}<dt>Status</dt><dd>${(o.pledge.payments || []).length ? esc(o.pledge.status) : "Waiting for the gift"}</dd></dl></section>`
  : o.pledge ? `<section class="panel"><div class="ph"><h2>Pledge</h2></div><dl class="kv"><dt>Type</dt><dd>Pledge, confirmed by the investor</dd><dt>Amount</dt><dd>${money(o.pledge.amount)}</dd><dt>Schedule</dt><dd>${o.pledge.installments} ${esc(String(o.pledge.frequency || "").toLowerCase())} payment${o.pledge.installments > 1 ? "s" : ""}</dd><dt>First payment</dt><dd>${money(o.pledge.firstAmount)} due ${fmtDate(o.pledge.firstDue)}</dd><dt>Confirmed</dt><dd>${esc(o.pledge.confirmedBy)}, ${fmtDate(o.pledge.confirmedDate)}</dd><dt>Corrections</dt><dd>Only the Chief Gift Officer or an administrator</dd>${o.pledge.payments ? `<dt>Received</dt><dd>${o.pledge.payments.map(x => `${money(x.amount)} on ${fmtDate(x.date)} (${esc(String(x.method).toLowerCase())})`).join("<br>")}</dd><dt>Status</dt><dd>${esc(o.pledge.status)}</dd>` : ""}</dl></section>` : ""}
  ${o.gift ? `<section class="panel"><div class="ph"><h2>Gift</h2></div><dl class="kv"><dt>Amount</dt><dd>${money(o.gift.amount)}</dd><dt>Entity</dt><dd>${esc(o.gift.fund)}</dd><dt>Received</dt><dd>${fmtDate(o.gift.date)} · ${esc(o.gift.method)}</dd></dl></section>` : ""}
  ${o.asks.length ? `<section class="panel"><div class="ph"><h2>Asks</h2></div>${o.asks.map(x => `<div class="row"><div class="t">${x.status === "Planned" ? '<span class="alert info">Planned</span> ' : ""}${money(x.amount)} · ${esc(x.askType)} · ${esc(x.fund)}<div class="s">${esc(x.campaign)} · ${x.status === "Planned" ? "planned for " + fmtDate(x.plannedDate) : x.status === "Made" ? "awaiting response" : esc(x.status)}${x.reason ? ": " + esc(x.reason) : ""}</div></div>${x.status === "Planned" && x === latestAsk(o) && o.stage !== "Closed" ? `<button type="button" class="rowedit" data-form="editPlan" data-cid="${o.contactId}" aria-label="Edit the planned ask">Edit</button>` : ""}</div>`).join("")}</section>` : ""}
  ${interactionsPanel(S.interactions.filter(i => i.oppId === o.id || (i.contactId === o.contactId && !i.oppId)))}
  ${tasksPanel(S.tasks.filter(t => t.oppId === o.id), "Tasks on this opportunity")}
  ${historyPanel(x => x.oppId === o.id)}
  </main>`;
}
// the guide's saved views for the Opportunities list (Awaiting my review is the Chief Gift Officer's)
const quarterOf = (iso) => iso ? iso.slice(0, 4) + "Q" + Math.floor((Number(iso.slice(5, 7)) - 1) / 3) : "";
const OPP_F = {
  open: ["Open", o => o.stage !== "Closed", "My open opportunities"],
  attention: ["Needs attention", o => o.stage !== "Closed" && !!oppAlert(o), "Need attention"],
  quarter: ["Asks this quarter", o => o.stage !== "Closed" && (o.asks || []).some(a => quarterOf(a.status === "Planned" ? a.plannedDate : a.askedOn || a.plannedDate) === quarterOf(todayISO())), "Asks this quarter"],
  pledges: ["Pledges to record", o => o.stage === "Ask Made" && agreed(latestAsk(o)), "Pledges to record"],
  closed: ["Closed this year", o => o.stage === "Closed" && String(o.closedOn || "").slice(0, 4) === todayISO().slice(0, 4), "Closed this year"],
};
const oppFk = () => OPP_F[S.oFilter] ? S.oFilter : "open";
const oppSearchText = (o) => { const c = contactById(o.contactId), a = latestAsk(o); return [nameOf(c), o.name, o.fund, a && a.fund, a && a.campaign].filter(Boolean).join(" ").toLowerCase(); };
const chipRow = (F, fk, act, list, first) => `<div class="cfilt" role="tablist" aria-label="Show">${Object.entries(F).map(([k, f]) => `<button type="button" role="tab" aria-selected="${k === fk}" class="${k === fk ? "on" : ""}" data-act2="${act}" data-v="${k}">${f[0]}${k === first ? "" : ` <b>${list.filter(f[1]).length}</b>`}</button>`).join("")}</div>`;
function oppListHTML() {
  const show = S.opps.filter(OPP_F[oppFk()][1]);
  if (!show.length) return `<div class="empty">Nothing here right now.</div>`;
  return STAGES.map(st => { const os = show.filter(o => o.stage === st); if (!os.length) return "";
    return `<div class="lgroup">${st} <span>${os.length}</span></div>` + os.map(o => { const a = latestAsk(o), c = contactById(o.contactId);
      const amt = oppAmountText(o, a);
      return `<div class="row tap" data-opp="${o.id}" data-name="${esc(oppSearchText(o))}"><div class="t"><span class="lnk">${esc(nameOf(c))}</span><div class="s">${amt} · ${esc(o.fund || "")}</div>${nextStep(o) ? `<div class="nextline${nextStep(o).warn ? " warn" : ""}">Next: ${esc(nextStep(o).line)}</div>` : ""}${oppAlert(o) ? `<div style="margin-top:5px">${alertPill(oppAlert(o))}</div>` : ""}</div><span class="chev">${CHEV}</span></div>`; }).join(""); }).join("");
}
function boardScreen() {
  const view = S.oppView || "list";
  const sw = `<div class="seg" role="tablist"><button class="${view === "list" ? "on" : ""}" data-act2="oppview" data-v="list">List</button><button class="${view === "board" ? "on" : ""}" data-act2="oppview" data-v="board">Board</button></div>`;
  const fk = oppFk(), F = OPP_F[fk], top = `<input id="oSearch" class="search" type="search" placeholder="Search opportunities" autocomplete="off">${chipRow(OPP_F, fk, "ofilt", S.opps, "")}`;
  if (view === "list") return topbar("Opportunities") + `<main>${top}<section class="panel"><div class="ph"><h2>${F[2]}</h2>${sw}</div>${oppListHTML()}</section></main>`;
  const show = S.opps.filter(F[1]);
  return topbar("Opportunities") + `<main>${top}
  <section class="panel"><div class="ph"><h2>${F[2]}</h2>${sw}</div>
  <div class="boardwrap"><div class="board">${(fk === "closed" ? ["Closed"] : STAGES.slice(0, 5)).map(s => {
    const os = show.filter(o => o.stage === s);
    return `<div class="col"><h3>${s} <span>${os.length}</span></h3><div style="display:flex;flex-direction:column;gap:6px">${os.map(o => { const a = latestAsk(o);
      const amt = oppAmountText(o, a);
      return `<div class="card ${o.example ? "" : "me"}" data-opp="${o.id}" data-name="${esc(oppSearchText(o))}"><b>${esc(o.name)}</b><span class="amt">${amt}</span>${alertPill(oppAlert(o))}${o.example ? "" : `<span class="via">${mic(11)} added by voice</span>`}</div>`; }).join("")}</div></div>`;
  }).join("")}</div></div>
  <div class="empty" style="font-size:12.5px">Cards move only when something is recorded. Swipe sideways to see every stage.</div></section></main>`;
}
const taskWhere = (t) => { const o = t.oppId && oppById(t.oppId); return o ? o.name : nameOf(contactById(t.contactId)); };
/* ---------- task statuses: To do, In progress, Waiting, Done (SpiceCRM: Not Started, In Progress, Pending Input, Completed) ---------- */
const TSTAT = { todo: "To do", doing: "In progress", waiting: "Waiting", done: "Done" };
const taskStatus = (t) => t.done ? "done" : (t.status || "todo");
function setTaskStatus(t, st, until) {
  const before = { done: t.done, status: t.status, due: t.due, doneOn: t.doneOn };
  t.done = st === "done"; t.status = st; t.doneOn = st === "done" ? todayISO() : null;
  if (st === "waiting" && until) t.due = until;
  save(); render(); return () => { Object.assign(t, before); save(); render(); };
}
const checkSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function taskRow(t, showWhere) {
  const st = taskStatus(t), al = taskAlert(t);
  return `<div class="trow${st === "done" ? " isdone" : ""}" data-tid="${t.id}" data-name="${esc((t.text + " " + nameOf(contactById(t.contactId)) + " " + taskWhere(t)).toLowerCase())}"><div class="tacts"><button type="button" class="ta-wait" data-tk-wait="${t.id}">Waiting</button><button type="button" class="ta-done" data-tk-done="${t.id}">Done</button></div>
    <div class="row tmain"><button type="button" class="tcheck${st === "done" ? " on" : ""}" data-tk-done="${t.id}" aria-label="${st === "done" ? "Mark not done" : "Mark done"}">${st === "done" ? checkSvg : ""}</button>
    <div class="t">${alertPill(al)}<div class="ttext${al ? " na-do" : ""}">${esc(t.text)}</div><div class="s">${st === "done" ? "Done" + (t.doneOn ? " " + fmtDate(t.doneOn) : "") : st === "waiting" ? (t.due ? "Check back " + fmtDate(t.due) : "Waiting") : t.due ? "Due " + fmtDate(t.due) : "No due date"}${showWhere ? " · " + esc(taskWhere(t)) : t.oppId ? " · on the opportunity" : ""}${st === "done" ? "" : ` · <button type="button" class="rowedit inl" data-form="editTask" data-cid="${t.contactId}" data-item="${t.id}" aria-label="Edit task">Edit</button>`}</div></div>
    <button type="button" class="tstat s-${st}" data-tk-stat="${t.id}" aria-label="Status: ${TSTAT[st]}. Change">${TSTAT[st]}<svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></div></div>`;
}
// Create opportunity tapped for a contact who isn't ready: list what must be true, ticked or not, and what's left to do
function oppGate(c) {
  const h = document.getElementById("modal"), ch = oppChecks(c), canRate = !c.capacity;
  h.innerHTML = `<div class="scrim center" data-helpx="1"><div class="wmodal hmodal" role="dialog" aria-modal="true" aria-labelledby="ogTitle">
    ${HELP_X}
    <h2 id="ogTitle">${esc(c.first)} isn't ready for an opportunity yet</h2>
    <p class="wl-hint">You can create an opportunity for a contact only when all of these are true:</p>
    <ul class="gate">${ch.map(x => `<li class="${x.ok ? "yes" : "no"}"><span class="gk" aria-hidden="true">${x.ok ? "✓" : "!"}</span><span>${esc(x.need)}<small>${x.ok ? esc(x.now) : "To do: " + esc(x.todo)}</small></span></li>`).join("")}</ul>
    ${canRate ? `<button type="button" class="btn blue" id="ogRate">Set capacity rating</button>` : ""}
    <button type="button" class="btn quiet" data-helpx="1">${canRate ? "Not now" : "Close"}</button></div></div>`;
  const b = document.getElementById("ogRate"); if (b) b.onclick = () => ratingPicker(c, true);
  if (G.live) notice(`The officer tapped Create opportunity for ${nameOf(c)}, but they aren't ready: ${ch.filter(x => !x.ok).map(x => x.todo).join(" ")} The screen lists what's needed. If they ask, explain it, and offer set_capacity_rating if the rating is what's missing.`);
}
function ratingPicker(c, thenOpp) {
  const h = document.getElementById("modal");
  h.innerHTML = `<div class="scrim center" data-helpx="1"><div class="wmodal hmodal" role="dialog" aria-modal="true" aria-labelledby="rtTitle">
    ${HELP_X}
    <h2 id="rtTitle">Capacity rating</h2><p class="wl-hint">How much could ${esc(nameOf(c))} give?</p>
    <div class="tsopts">${Object.entries(CAPACITY).map(([k, v]) => `<button type="button" class="tsopt${k === c.capacity ? " cur" : ""}" data-rt="${k}">${k} · ${esc(v)}${k === c.capacity ? '<span class="tscur">Current</span>' : ""}</button>`).join("")}</div></div></div>`;
  h.querySelectorAll("[data-rt]").forEach(b => b.onclick = () => {
    const k = b.dataset.rt; h.innerHTML = "";
    if (k !== c.capacity) { c.capacity = k; log(`Capacity rated ${k} (${CAPACITY[k]})`, { contactId: c.id }, false);
      const n = !thenOpp && S.screen === "contact" && !openOpp(c.id) && journeyNext(c); G.whatNext = n ? { saved: `Capacity rated ${k}`, screen: S.screen } : null;
      save(); render(); }
    toast(`${nameOf(c)}: capacity ${k} · ${CAPACITY[k]}`);
    if (thenOpp) openForm("opportunity", c.id);
  });
}
document.addEventListener("click", (e) => { const r = e.target.closest("[data-rate]"); if (!r) return; const c = contactById(r.dataset.rate); if (c) ratingPicker(c, false); });
function statusPicker(t, pickWaiting) {
  const h = document.getElementById("modal"), st = taskStatus(t), dflt = t.due && t.due > todayISO() && st === "waiting" ? t.due : addDays(todayISO(), 7);
  h.innerHTML = `<div class="scrim center" data-helpx="1"><div class="wmodal hmodal" role="dialog" aria-modal="true" aria-labelledby="tsTitle">
    ${HELP_X}
    <h2 id="tsTitle">Task status</h2><p class="wl-hint">${esc(t.text)}</p>
    <div class="tsopts">${Object.keys(TSTAT).map(k => `<button type="button" class="tsopt${k === st ? " cur" : ""}" data-ts="${k}"><span class="tdot s-${k}"></span>${TSTAT[k]}${k === st ? '<span class="tscur">Current</span>' : ""}</button>`).join("")}</div>
    <div class="tswait" ${pickWaiting ? "" : "hidden"}><label class="wl-name">Check back on<input type="date" id="tsUntil" value="${dflt}" min="${todayISO()}"></label><button type="button" class="btn blue" id="tsWaitGo">Save as Waiting</button></div></div></div>`;
  const set = (k, until) => { h.innerHTML = ""; const undo = setTaskStatus(t, k, until); toast(`${k === "waiting" ? "Waiting until " + fmtDate(until) : TSTAT[k]}: ${t.text}`, undo); };
  h.querySelectorAll("[data-ts]").forEach(b => b.onclick = () => { const k = b.dataset.ts; if (k === "waiting") { h.querySelector(".tswait").hidden = false; document.getElementById("tsUntil").focus(); return; } set(k); });
  document.getElementById("tsWaitGo").onclick = () => set("waiting", document.getElementById("tsUntil").value || addDays(todayISO(), 7));
}
document.addEventListener("click", (e) => {
  const d = e.target.closest("[data-tk-done]"), w = e.target.closest("[data-tk-wait]"), s2 = e.target.closest("[data-tk-stat]");
  const el = d || w || s2; if (!el) return; e.stopPropagation();
  const t = S.tasks.find(k => k.id === (el.dataset.tkDone || el.dataset.tkWait || el.dataset.tkStat)); if (!t) return;
  if (d) { const was = taskStatus(t); const undo = setTaskStatus(t, was === "done" ? "todo" : "done"); toast(was === "done" ? "Back on your list" : "Done: " + t.text, undo); }
  else if (w) statusPicker(t, true); else statusPicker(t, false);
}, true);
// swipe left on a task to show Waiting and Done, as in Apple's Reminders
(() => { let row = null, x0 = 0, y0 = 0, dx = 0, sw = false;
  const close = (except) => document.querySelectorAll(".trow.open").forEach(r => { if (r !== except) { r.classList.remove("open"); r.querySelector(".tmain").style.transform = ""; } });
  document.addEventListener("touchstart", (e) => { const r = e.target.closest(".trow"); if (!r || e.target.closest(".tacts")) { if (!r) close(); return; } row = r; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; sw = false; close(r); }, { passive: true });
  document.addEventListener("touchmove", (e) => { if (!row) return; const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
    if (!sw && Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my)) sw = true; if (!sw) return;
    dx = Math.max(-170, Math.min(0, mx + (row.classList.contains("open") ? -160 : 0))); const m = row.querySelector(".tmain"); m.style.transition = "none"; m.style.transform = `translateX(${dx}px)`; }, { passive: true });
  document.addEventListener("touchend", () => { if (!row) return; const m = row.querySelector(".tmain"); m.style.transition = ""; if (sw) { const open = dx < -60; row.classList.toggle("open", open); m.style.transform = open ? "translateX(-160px)" : ""; } row = null; });
})();
function tasksPanel(list, label) {
  const open = list.filter(t => !t.done).sort((x, y) => (x.due || "9999").localeCompare(y.due || "9999"));
  return `<section class="panel"><div class="ph"><h2>${label}</h2><span class="meta">${open.length} open</span></div>${open.length ? open.map(t => taskRow(t, false)).join("") : `<div class="empty">No open tasks.</div>`}</section>`;
}
