// Checks: Settings, the name, speaking speed and the activity log. tests/bot.js loads this file and passes in its helpers.
module.exports = ({ test, ok, fresh, signIn, state, tab, ara, said, titleOf, PAGE, fs, path }) => {

test("Settings: speaking speed saves, Restart asks first", async (p) => {
  await signIn(p); await p.tap("[data-go=settings] >> nth=0"); await p.waitForTimeout(400);
  ok(await titleOf(p) === "Settings", "Settings did not open");
  ok(await p.isVisible("text=No audio is kept"), "privacy notice missing from Settings");
  const ver = await p.evaluate(() => { const h = [...document.querySelectorAll(".ph h2")].find(x => x.textContent === "Version"); return h ? h.nextElementSibling.textContent : ""; });
  ok(/^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d\d [AP]M ET$/.test(ver), "the Version line isn't the build stamp (iPhone showed Invalid Date, Oct 25): " + JSON.stringify(ver));
  await p.selectOption("#speedSel", { index: 3 }); await p.waitForTimeout(200);
  ok((await state(p)).settings.speed > 1, "speed not saved");
  const n = (await state(p)).tasks.length;
  await p.tap("text=Restart the proof of concept >> nth=-1"); await p.waitForTimeout(300);
  ok(await p.isVisible("text=Restart the proof of concept?"), "Restart did not ask first");
  await p.tap("[data-helpx] >> text=Cancel"); await p.waitForTimeout(200);
  ok((await state(p)).tasks.length === n, "Cancel still restarted");
});
test("Activity log records opening the app and taps outside a conversation", async (p) => {
  await signIn(p); await tab(p, "Contacts"); await p.tap("text=Abernathy, Ruth"); await p.waitForTimeout(4600);
  const ev = (await p.evaluate(() => __logs)).flatMap(b => b.events.map(e => e.role + ": " + e.text));
  ok(ev.filter(x => /^open: Opened the app \(build /.test(x)).length === 1, "opening the app was not logged exactly once: " + ev.slice(0, 4).join(" | "));
  ok(ev.some(x => /^tap: .*Contacts/.test(x)) && ev.some(x => /^tap: .*Abernathy/.test(x)), "taps were not sent to the activity log: " + ev.slice(0, 6).join(" | "));
});
test("Activity log records what is in a form when Save is tapped", async (p) => {
  await signIn(p);
  ok(!(await p.isVisible("#fmbar")), "a new user was shown the form-logging notice again");
  await tab(p, "Contacts"); await p.tap("text=Abernathy, Ruth"); await p.waitForTimeout(300);
  await p.tap("[data-form=task]"); await p.waitForTimeout(300);
  await p.fill("#f_text", "Mail the gala invitation"); await p.fill("#f_due", "2026-11-30");
  await p.tap("[data-act=save]"); await p.waitForTimeout(4600);
  const ev = (await p.evaluate(() => __logs)).flatMap(b => b.events.map(e => e.role + ": " + e.text));
  ok(ev.some(x => /^form: New task \(opened by tapping\)\. .*Task: Mail the gala invitation; Due date: 2026-11-30/.test(x)), "the saved form was not logged: " + ev.filter(x => x.startsWith("form")).join(" | "));
});
test("Ara reads a spoken name back, spelled, and saves it only once confirmed; the header name opens Settings", async (p) => {
  await p.tap(".wl-mic.big"); await p.waitForTimeout(600);
  let r = await ara(p, "set_user_name", { first_name: "Eve" });
  ok(r.saved === false && /E V E/.test(r.status), "the name was not read back spelled: " + JSON.stringify(r));
  ok(!(await state(p)).settings.userName, "the name was saved before it was confirmed");
  r = await ara(p, "set_user_name", { first_name: "Matt", confirmed: true });
  ok(r.saved === false && /M A T T/.test(r.status), "a corrected name skipped the read-back");
  r = await ara(p, "set_user_name", { first_name: "Matt", confirmed: true });
  ok(r.ok && r.saved !== false && (await state(p)).settings.userName === "Matt", "the confirmed name was not saved");
  await p.waitForTimeout(300); await p.evaluate(() => document.getElementById("modal").innerHTML = "");
  await p.tap("header.top .who"); await p.waitForTimeout(300);
  ok((await titleOf(p)) === "Settings" && (await p.evaluate(() => document.activeElement && document.activeElement.id)) === "userName", "tapping the header name did not open the name field");
});
test("Ara: talk faster is remembered", async (p) => {
  await signIn(p); const before = (await state(p)).settings.speed || 1;
  await ara(p, "set_speaking_speed", { change: "faster" });
  ok(((await state(p)).settings.speed || 1) > before, "speed did not go up");
});
test("Halloween: in October a spider, pumpkin or ghost crosses without blocking taps, and Settings turns it off", async (p) => {
  await signIn(p);
  const kinds = await p.evaluate(() => ["spider", "pumpkin", "ghost", "skeleton"].map(k => { const el = window.__demo.spookyOnce(k); el.dataset.t = "1"; return getComputedStyle(el).pointerEvents; }));
  ok(kinds.every(x => x === "none"), "a Halloween visitor would block taps");
  ok(await p.evaluate(() => !!document.querySelector(".spk-skeleton svg .sk-arm") && !!document.querySelector(".spk-skeleton svg .sk-skull")), "the skeleton visitor has no waving arm or nodding skull");
  ok(await p.evaluate(() => fetch((ON_PREVIEW ? "preview/" : "app/") + "sounds/" + XMAS_FILES.skeleton).then(r => r.ok && r.headers.get("content-length") !== "0")), "the skeleton's recording is missing");
  ok(await p.evaluate(() => fetch((ON_PREVIEW ? "preview/" : "app/") + "sounds/" + XMAS_FILES.laugh).then(r => r.ok && r.headers.get("content-length") !== "0")), "the skeleton's laugh recording is missing");
  await p.waitForTimeout(3200); ok(await p.evaluate(() => document.querySelector(".spk-skeleton").classList.contains("sk-waving")), "the skeleton didn't start waving once he stopped");
  const picks = await p.evaluate(() => { const out = []; for (let i = 0; i < 40; i++) { const el = window.__demo.spookyOnce(); out.push(el.className.replace("spk spk-", "").split(" ")[0]); el.remove(); } return out; });
  ok(picks.every((k, i) => i === 0 || k !== picks[i - 1]), "a visitor came twice running: " + picks.join(","));
  const drops = await p.evaluate(() => { let n = 0; for (let i = 0; i < 40; i++) { const el = window.__demo.spookyOnce("pumpkin"); if (/translate\(.*-\d+px\) rotate\(0deg\)/.test(el.getAnimations()[0].effect.getKeyframes()[0].transform)) n++; el.remove(); } return n; });
  ok(drops > 5 && drops < 35, "the pumpkin dropped from the top " + drops + " times in 40");
  await p.waitForTimeout(9500);
  ok(!(await p.$(".spk[data-t]")), "Halloween visitors should leave the screen when done");
  await p.tap("[data-go=settings]"); await p.waitForTimeout(400);
  const october = await p.evaluate(() => new Date().getMonth() === 9);
  if (october) { await p.click("#spookyTgl"); await p.waitForTimeout(200); ok((await state(p)).settings.noSpooky === true, "the Halloween switch did not turn it off"); }
  else ok(!(await p.$("#spookyTgl")), "the Halloween switch should only show in October");
});

test("Halloween: with Reduce Motion on, visitors still come with their sounds, fading in and out in one spot", async (p) => {
  if (new Date().getMonth() !== 9) return;
  await p.emulateMedia({ reducedMotion: "reduce" });
  await signIn(p); await p.tap(".cb-end").catch(() => {}); await p.waitForTimeout(300);
  ok(await p.evaluate(() => spookyOn()), "visitors were turned off by Reduce Motion");
  const r = await p.evaluate(() => { const el = window.__demo.spookyOnce ? window.__demo.spookyOnce("ghost") : spookyOnce("ghost"); const a = el.getAnimations(); return { calm: el.classList.contains("spk-calm"), n: a.length, kf: a[0] && a[0].effect.getKeyframes().map(k => k.transform || "").join("") }; });
  ok(r.calm && r.n === 1 && !r.kf, "the visitor still moved across the screen with Reduce Motion on");
  ok(/Reduce Motion is on/.test(await p.evaluate(() => "Opened the app" + (calmMotion() ? " (Reduce Motion is on)" : ""))), "the activity log wouldn't show Reduce Motion");
});
test("Halloween sounds: a visitor makes a sound after the first tap, but not during a conversation", async (p) => {
  await signIn(p); await p.tap(".cb-end").catch(() => {}); await p.waitForTimeout(300); await p.tap("nav >> text=Contacts"); await p.waitForTimeout(300);
  const a = await p.evaluate(() => { const n = window.__demo.spkPlayed; window.__demo.spookyOnce("ghost").dataset.t = "1"; return window.__demo.spkPlayed - n; });
  ok(a === 1, "the ghost made no sound when no conversation was on");
  const stuck = await p.evaluate(async () => { const c = window.__demo.spkCtx; Object.defineProperty(c, "state", { get: () => "interrupted" }); /* what iOS leaves behind after the background */
    document.dispatchEvent(new Event("visibilitychange")); await new Promise(r => setTimeout(r, 1300)); const gone = window.__demo.spkCtx !== c;
    window.__demo.spkUnlock(); await new Promise(r => setTimeout(r, 200)); const fresh = window.__demo.spkCtx, n = window.__demo.spkPlayed; window.__demo.spookyOnce("ghost").dataset.t = "1"; return { gone, fresh: !!fresh && fresh !== c && fresh.state === "running", played: window.__demo.spkPlayed - n }; });
  ok(stuck.gone && stuck.fresh && stuck.played === 1, "a sound engine stuck after the background wasn't replaced on the next tap: " + JSON.stringify(stuck));
  await p.tap("nav >> text=Home"); await p.waitForTimeout(200); await p.tap("nav .micbtn"); await p.waitForTimeout(600);
  const live = await p.isVisible(".cb-end");
  const b = await p.evaluate(() => { const n = window.__demo.spkPlayed; window.__demo.spookyOnce("spider").dataset.t = "1"; return window.__demo.spkPlayed - n; });
  ok(live, "no conversation started"); ok(b === 0, "a Halloween visitor made a sound during a conversation");
});
test("Spooky mode: Ara turns it on and off, with the night look, slower host voice and new rules", async (p) => {
  if (new Date().getMonth() !== 9) return; // spooky mode only exists in October
  await signIn(p); await p.waitForTimeout(400);
  const n = await p.evaluate(() => __sent.length);
  const on = await ara(p, "set_spooky_mode", { on: true });
  ok(on.ok && on.spooky, "Ara couldn't turn spooky mode on");
  const look = await p.evaluate(() => ({ cls: document.documentElement.classList.contains("spooky"), candle: !!document.querySelector(".top .candle"), bg: getComputedStyle(document.body).backgroundColor }));
  ok(look.cls && look.candle, "the night look or the candle by the logo didn't appear");
  const owl = await ara(p, "show_visitor", { visitor: "owl" });
  ok(owl.ok && await p.evaluate(() => !!document.querySelector(".spk-owl")), "Ara couldn't send the owl across the screen: " + JSON.stringify(owl));
  const snow = await ara(p, "show_visitor", { visitor: "snow" });
  ok(!snow.ok && /Christmas mode/.test(snow.error || ""), "a Christmas visitor was sent in spooky mode");
  await tab(p, "Contacts"); const sb = await p.evaluate(() => getComputedStyle(document.querySelector(".search")).backgroundColor);
  ok(sb !== "rgb(255, 255, 255)", "the search box stayed white in spooky mode (Carverhill's screenshot, Oct 26): " + sb);
  await tab(p, "Home");
  const upd = await p.evaluate((n) => __sent.slice(n).map(s => JSON.parse(s)).filter(e => e.type === "session.update" && e.session.audio).at(-1), n);
  ok(upd && /SPOOKY MODE IS ON/.test(upd.session.instructions), "Ara wasn't given the spooky rules");
  ok(Math.abs(upd.session.audio.output.speed - 0.9) < 0.001, "Ara's voice didn't slow down a touch");
  const n2 = await p.evaluate(() => __sent.length);
  const again = await ara(p, "set_spooky_mode", { on: true });
  const spoke = await p.evaluate((n) => __sent.slice(n).some(s => JSON.parse(s).type === "response.create"), n2);
  ok(again.already && !spoke, "asking for spooky mode again (as after Carry on) made Ara announce it a second time");
  const off = await ara(p, "set_spooky_mode", { on: false });
  ok(off.ok && !off.spooky, "Ara couldn't turn spooky mode off");
  ok(!(await p.evaluate(() => document.documentElement.classList.contains("spooky"))), "the night look stayed on after normal mode");
});
test("Spooky mode: Ara greets as the haunted-house host from her first words, and welcomes back the same way", async (p) => {
  if (new Date().getMonth() !== 9) return;
  await signIn(p); await p.tap(".cb-end").catch(() => {}); await p.waitForTimeout(300);
  await p.evaluate(() => window.__demo.setSpooky(true));
  const n = await p.evaluate(() => __sent.length);
  await p.evaluate(() => startCall()); await p.waitForTimeout(700);
  const sent = await p.evaluate((n) => __sent.slice(n).map(s => JSON.parse(s)), n);
  const cfg = sent.find(e => e.type === "session.update" && e.session.instructions);
  ok(cfg && /SPOOKY MODE IS ON/.test(cfg.session.instructions), "a new conversation in spooky mode didn't start with the spooky rules");
  const hi = sent.filter(e => e.item && e.item.type === "force_message").map(e => e.item.content[0].text).join(" ");
  ok(/^Mwahaha\.\.\. welcome to the haunted CRM\. Hi/.test(hi), "Ara's scripted greeting wasn't spooky: " + hi);
  ok(/Welcome back to the haunted CRM/.test(await p.evaluate(() => resumeLine({ lines: [], draft: "" }))), "Carry on's welcome back wasn't spooky");
  await p.tap(".cb-end").catch(() => {}); await p.evaluate(() => window.__demo.setSpooky(false));
  const n2 = await p.evaluate(() => __sent.length);
  await p.evaluate(() => startCall()); await p.waitForTimeout(700);
  const hi2 = await p.evaluate((n) => __sent.slice(n).map(s => JSON.parse(s)).filter(e => e.type === "conversation.item.create").map(e => JSON.stringify(e)).join(" "), n2);
  ok(/Hi Sam, I'm/.test(hi2) && !/haunted/.test(hi2), "the normal greeting changed");
});
test("Christmas mode (any time): look, wreath, nativity, Ara as a Christmas host, one theme at a time", async (p) => {
  await signIn(p); await p.tap(".cb-end").catch(() => {}); await p.waitForTimeout(300);
  const n = await p.evaluate(() => __sent.length);
  await p.evaluate(() => startCall()); await p.waitForTimeout(600);
  const on = await ara(p, "set_christmas_mode", { on: true });
  ok(on.ok && on.christmas, "Ara couldn't turn Christmas mode on");
  await p.tap("nav >> text=Home").catch(() => {}); await p.waitForTimeout(300);
  const look = await p.evaluate(() => ({ cls: document.documentElement.classList.contains("xmas"), spooky: document.documentElement.classList.contains("spooky"), wreath: !!document.querySelector(".top .wreath"), nat: !!document.querySelector("main .nativity") }));
  ok(look.cls && !look.spooky, "the Christmas look didn't replace the others");
  ok(look.wreath && look.nat, "no wreath by the logo or no nativity scene on Home");
  const upd = await p.evaluate((n) => __sent.slice(n).map(s => JSON.parse(s)).filter(e => e.type === "session.update" && e.session.instructions).at(-1), n);
  ok(upd && /CHRISTMAS MODE IS ON/.test(upd.session.instructions) && !/SPOOKY MODE IS ON/.test(upd.session.instructions), "Ara wasn't given the Christmas rules");
  const again = await ara(p, "set_christmas_mode", { on: true });
  ok(again.already, "asking for Christmas mode again made Ara announce it a second time");
  ok(/Welcome back, and Merry Christmas/.test(await p.evaluate(() => resumeLine({ lines: [], draft: "" }))), "Carry on's welcome back wasn't Christmassy");
  await p.tap(".cb-end").catch(() => {});
  const n2 = await p.evaluate(() => __sent.length);
  await p.evaluate(() => startCall()); await p.waitForTimeout(600);
  const hi = await p.evaluate((n) => __sent.slice(n).map(s => JSON.parse(s)).filter(e => e.type === "conversation.item.create").map(e => JSON.stringify(e)).join(" "), n2);
  ok(/Merry Christmas, and welcome to the Christmas CRM/.test(hi), "Ara's greeting wasn't Christmassy");
  if (await p.evaluate(() => spookySeason())) { await ara(p, "set_spooky_mode", { on: true });
    ok(await p.evaluate(() => spookyMode() && !xmasMode()), "spooky mode and Christmas mode were on together"); await ara(p, "set_spooky_mode", { on: false }); }
  await p.tap(".cb-end").catch(() => {});
  await p.evaluate(() => window.__demo.setXmas(false));
  ok(!(await p.evaluate(() => document.documentElement.classList.contains("xmas") || !!document.querySelector(".nativity"))), "the Christmas look stayed after normal mode");
});
test("Christmas mode: visitors and sounds (sleigh bells, ho ho ho, chime, carol), Santa asks for a tap, Settings switch", async (p) => {
  await signIn(p); await p.tap(".cb-end").catch(() => {}); await p.waitForTimeout(300);
  await p.evaluate(() => window.__demo.setXmas(true));
  await p.tap("nav >> text=Home").catch(() => {}); await p.waitForTimeout(200);
  await p.evaluate(() => { spkCtx = null; delete window.__demo.state.settings.seenOwlHint; document.getElementById("modal").innerHTML = ""; document.querySelectorAll(".owlhint").forEach(e => e.remove()); window.__demo.owlHint(); }); /* the sign-in's own owl may still be flying off on a slow machine; a leftover one would stop a fresh one from appearing */
  await p.waitForTimeout(1000);
  ok(await p.isVisible(".owlhint >> text=Tap me to hear me ho ho ho!"), "Santa didn't ask for a tap");
  ok((await p.textContent(".owlhint-owl")).includes("🎅"), "it wasn't Santa");
  const n = await p.evaluate(() => window.__demo.spkPlayed);
  await p.tap(".owlhint-owl"); await p.waitForTimeout(500);
  ok(await p.isVisible(".owlhint >> text=Ho ho ho! Sounds are on."), "Santa didn't say the sounds are on");
  ok(await p.evaluate((n) => window.__demo.spkPlayed > n, n), "Santa didn't ho ho ho");
  await p.waitForTimeout(3300);
  const kinds = ["snow", "gift", "elf", "reindeer", "sleigh", "tree"];
  const made = await p.evaluate((kinds) => kinds.map(k => { const before = window.__demo.spkPlayed, el = window.__demo.spookyOnce(k); return { k, el: !!el && el.isConnected, sound: window.__demo.spkPlayed > before }; }), kinds);
  made.forEach(m => ok(m.el && m.sound, `the ${m.k} visitor didn't appear with its sound`));
  const sounds = await p.evaluate(() => ["bells", "hohoho", "chime", "carol", "giggle", "twinkle"].map(k => spookySound(k)));
  ok(sounds.every(Boolean), "a Christmas sound didn't play");
  await p.evaluate(() => ["merry", "jingle"].forEach(k => spookySound(k)));
  const files = await p.evaluate(async () => (await Promise.all(["merry", "bells", "hohoho", "jingle"].map(k => xmasDec[k]))).map(b => !!b && b.duration > 0.5));
  ok(files.every(Boolean), "a Christmas sound file (Santa's voice or the sleigh bells) didn't load");
  const cue = await p.evaluate(() => { const n = window.__demo.spkPlayed; openForm("contact"); return window.__demo.spkPlayed - n; });
  ok(cue === 1, "no sleigh bells when a form opened in Christmas mode");
  await p.evaluate(() => { V = null; renderOverlay(); });
  const won = await p.evaluate(() => { const n = window.__demo.spkPlayed; celebrate(); const party = document.querySelector(".party"); return { played: window.__demo.spkPlayed - n, gifts: party.querySelectorAll(".bat").length, balloons: party.querySelectorAll(".bl").length, sleigh: !!document.querySelector(".spk-sleigh") }; });
  ok(won.played >= 1 && won.gifts === 9 && !won.balloons && won.sleigh, "Closed Won wasn't celebrated with gifts, the sleigh and a carol");
  await p.tap("header .setbtn"); await p.waitForTimeout(300);
  ok(await p.isChecked("#xmasMode"), "Settings didn't show Christmas mode as on");
  await p.uncheck("#xmasMode"); await p.waitForTimeout(300);
  ok(!(await p.evaluate(() => xmasMode())), "Settings couldn't turn Christmas mode off");
});
test("Spooky mode: a creak when a form opens, thunder on Save, bats and a cackle on Closed Won, visitors more often", async (p) => {
  if (new Date().getMonth() !== 9) return;
  await signIn(p); await p.tap(".cb-end").catch(() => {}); await p.waitForTimeout(300); await p.tap("nav >> text=Contacts"); await p.waitForTimeout(300);
  await p.tap("header .setbtn"); await p.waitForTimeout(300); await p.check("#spookyMode"); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.documentElement.classList.contains("spooky")), "the Settings switch didn't turn spooky mode on");
  const creak = await p.evaluate(() => { const n = window.__demo.spkPlayed; openForm("contact"); return window.__demo.spkPlayed - n; });
  ok(creak === 1, "no creak when a form opened");
  await p.evaluate(() => { V = null; renderOverlay(); });
  const won = await p.evaluate(() => { const n = window.__demo.spkPlayed; celebrate(); const party = document.querySelector(".party"); return { played: window.__demo.spkPlayed - n, bats: party.querySelectorAll(".bat").length, balloons: party.querySelectorAll(".bl").length }; });
  ok(won.played === 1 && won.bats > 0 && won.balloons === 0, "Closed Won didn't bring bats and the organ sting instead of balloons");
  const bat = await p.evaluate(() => { const n = window.__demo.spkPlayed; const el = window.__demo.spookyOnce("bat"); return { played: window.__demo.spkPlayed - n, bats: el.querySelectorAll("i").length }; });
  ok(bat.played === 1 && bat.bats === 3, "the bats didn't fly over with a squeak");
  const owl = await p.evaluate(() => { const n = window.__demo.spkPlayed; const el = window.__demo.spookyOnce("owl"); return { played: window.__demo.spkPlayed - n, owl: el.textContent }; });
  ok(owl.played === 1 && owl.owl === "🦉", "the owl didn't come by with a hoot");
  const thunder = await p.evaluate(() => { const n = window.__demo.spkPlayed; spookyCue("thunder"); return window.__demo.spkPlayed - n; });
  ok(thunder === 1, "no thunder");
  await p.uncheck("#spookyMode"); await p.waitForTimeout(300);
  const quiet = await p.evaluate(() => { const n = window.__demo.spkPlayed; openForm("contact"); return window.__demo.spkPlayed - n; });
  ok(quiet === 0, "a form still creaked after spooky mode was turned off");
});
test("Halloween: an owl asks for a tap so sounds can play, hoots when tapped, and comes back on every load until someone taps", async (p) => {
  if (new Date().getMonth() !== 9) return;
  await signIn(p); await p.tap(".cb-end").catch(() => {}); await p.waitForTimeout(300); await p.tap("nav >> text=Home"); await p.waitForTimeout(300);
  await p.evaluate(() => { spkCtx = null; delete window.__demo.state.settings.seenOwlHint; document.getElementById("modal").innerHTML = ""; document.querySelectorAll(".owlhint").forEach(e => e.remove()); window.__demo.owlHint(); }); /* the sign-in's own owl may still be flying off on a slow machine; a leftover one would stop a fresh one from appearing */
  const seen = await p.waitForSelector(".owlhint >> text=Tap me to hear me hoot!", { timeout: 5000 }).then(() => true, () => false); // waits as long as a busy machine needs
  ok(seen, "the owl with its speech bubble didn't appear");
  const n = await p.evaluate(() => window.__demo.spkPlayed);
  await p.tap(".owlhint-owl"); await p.waitForTimeout(500);
  ok(await p.isVisible(".owlhint >> text=Sounds are on"), "the owl didn't say the sounds are on");
  ok(await p.evaluate((n) => window.__demo.spkPlayed > n, n), "the owl didn't hoot");
  ok(await p.evaluate(() => fetch((ON_PREVIEW ? "preview/" : "app/") + "sounds/owl-hoot.mp3").then(r => r.ok && r.headers.get("content-length") !== "0")) && await p.evaluate(() => fetch((ON_PREVIEW ? "preview/" : "app/") + "sounds/" + XMAS_FILES.pumpkin).then(r => r.ok)), "the owl or pumpkin recording is missing");
  ok((await state(p)).settings.seenOwlHint === true, "the owl would come back next time");
  await p.waitForTimeout(3300);
  ok(!(await p.isVisible(".owlhint")), "the owl didn't fly away");
  await p.evaluate(() => { spkCtx = null; window.__demo.owlHint(); }); await p.waitForTimeout(1000);
  ok(await p.isVisible(".owlhint >> text=Tap me to hear me hoot!"), "the owl didn't come back on a silent load");
  await p.tap(".owlhint-owl"); await p.waitForTimeout(3600);
  await p.evaluate(() => { window.__demo.owlHint(); }); await p.waitForTimeout(400);
  ok(!(await p.isVisible(".owlhint")), "the owl came back although sound was already on");
});

test("Settings: the location switch asks the phone first, and connection notes carry the spot only while it is on", async (p) => {
  await signIn(p);
  await p.evaluate(() => { const pos = { coords: { latitude: 40.12345, longitude: -74.56789, accuracy: 12 } };
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (ok) => ok(pos), watchPosition: (ok) => { ok(pos); return 7; }, clearWatch: () => {} } }); });
  await p.tap("[data-go=settings] >> nth=0"); await p.waitForTimeout(400);
  ok(await p.isVisible("text=Your exact location is added to the notes about the voice line only if you turn that on in Settings"), "the privacy notice doesn't mention the location switch");
  ok(!(await p.isChecked("#locTgl")), "the location switch is not off by default");
  ok(!(await p.evaluate(() => locInfo())), "a connection row carried a location while the switch was off");
  await p.click("#locTgl"); await p.waitForTimeout(300);
  ok((await state(p)).settings.shareLocation === true, "the switch did not save");
  const row = await p.evaluate(() => { locStart(); netLog("Test", 5); return ACT.q[ACT.q.length - 1].text; });
  ok(/^Connection: Test\. .*test request 5 ms, at 40\.12345,-74\.56789 \(±12 m\)$/.test(row), "the connection row has no location: " + row);
  await p.click("#locTgl"); await p.waitForTimeout(300);
  ok(!(await state(p)).settings.shareLocation, "the switch did not turn off");
  const row2 = await p.evaluate(() => { netLog("Test", 5); return ACT.q[ACT.q.length - 1].text; });
  ok(!/40\.12345/.test(row2), "a connection row still carried the location after the switch was turned off: " + row2);
});
test("Hey Ara start-up address (#call): one big mic, one tap starts the conversation; Settings shows the address", async (p) => {
  await signIn(p); const url = p.url().split("#")[0]; await p.goto(url + "?a=1#call"); await p.waitForTimeout(900); /* a hash alone would not reload the page */
  ok(await p.isVisible("text=Talk to Ara"), "the #call start-up screen is missing");
  ok(!/call/.test(await p.evaluate(() => location.hash)), "#call stayed in the address (a reload would ask again)");
  await p.tap("text=Not now"); await p.waitForTimeout(200); ok(!(await p.isVisible("text=Talk to Ara")), "Not now did not close it");
  await p.goto(url + "?b=2#call"); await p.waitForTimeout(900);
  await p.tap(".wl-mic.big"); await p.waitForTimeout(600);
  ok(await p.evaluate(() => __sent.some(s => s.includes("session.update"))), "the tap did not start Ara");
  ok(!(await p.isVisible("text=Talk to Ara")), "the start-up screen stayed over the call");
  await p.waitForTimeout(4600); const open = (await p.evaluate(() => __logs)).flatMap(b => b.events.map(e => e.text)); /* log rows go out in batches */
  ok(open.some(t => /Hey Ara start-up address/.test(t)), "the start-up open was not logged: " + open.slice(-5).join(" | "));
  await p.tap(".cb-end").catch(() => {}); await p.waitForTimeout(300); await p.tap("nav >> text=Home").catch(() => {}); await p.waitForTimeout(200);
  await p.tap("[data-go=settings] >> nth=0"); await p.waitForTimeout(400);
  ok(/#call$/.test(await p.inputValue("#callUrl")), "Settings does not show the start-up address");
  ok(await p.isVisible("text=Vocal Shortcuts"), "the Shortcut steps are missing from Settings");
}, { page: "preview-flow.html" }); /* the start-up address is on preview only until Carverhill has tried it (Oct 26) */
test("The #call address on a first visit leaves the welcome in place", async (p) => {
  await p.goto(p.url().split("#")[0] + "?a=1#call"); await p.waitForTimeout(900);
  ok(await p.isVisible("text=Meet your new voice assistant!"), "the welcome is missing");
  ok(!(await p.isVisible("text=Talk to Ara")), "the start-up screen covered the welcome");
}, { page: "preview-flow.html" });

};
