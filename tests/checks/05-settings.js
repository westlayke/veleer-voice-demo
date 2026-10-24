// Checks: Settings, the name, speaking speed and the activity log. tests/bot.js loads this file and passes in its helpers.
module.exports = ({ test, ok, fresh, signIn, state, tab, ara, said, titleOf, PAGE, fs, path }) => {

test("Settings: speaking speed saves, Restart asks first", async (p) => {
  await signIn(p); await p.tap("[data-go=settings] >> nth=0"); await p.waitForTimeout(400);
  ok(await titleOf(p) === "Settings", "Settings did not open");
  ok(await p.isVisible("text=No audio is kept"), "privacy notice missing from Settings");
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
  ok(ev.filter(x => x === "open: Opened the app").length === 1, "opening the app was not logged exactly once: " + ev.slice(0, 4).join(" | "));
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
  const kinds = await p.evaluate(() => ["spider", "pumpkin", "ghost"].map(k => { const el = window.__demo.spookyOnce(k); el.dataset.t = "1"; return getComputedStyle(el).pointerEvents; }));
  ok(kinds.every(x => x === "none"), "a Halloween visitor would block taps");
  await p.waitForTimeout(9500);
  ok(!(await p.$(".spk[data-t]")), "Halloween visitors should leave the screen when done");
  await p.tap("[data-go=settings]"); await p.waitForTimeout(400);
  const october = await p.evaluate(() => new Date().getMonth() === 9);
  if (october) { await p.click("#spookyTgl"); await p.waitForTimeout(200); ok((await state(p)).settings.noSpooky === true, "the Halloween switch did not turn it off"); }
  else ok(!(await p.$("#spookyTgl")), "the Halloween switch should only show in October");
});

test("Halloween sounds: a visitor makes a sound after the first tap, but not during a conversation", async (p) => {
  await signIn(p); await p.tap(".cb-end").catch(() => {}); await p.waitForTimeout(300); await p.tap("nav >> text=Contacts"); await p.waitForTimeout(300);
  const a = await p.evaluate(() => { const n = window.__demo.spkPlayed; window.__demo.spookyOnce("ghost").dataset.t = "1"; return window.__demo.spkPlayed - n; });
  ok(a === 1, "the ghost made no sound when no conversation was on");
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
  const upd = await p.evaluate((n) => __sent.slice(n).map(s => JSON.parse(s)).filter(e => e.type === "session.update" && e.session.audio).at(-1), n);
  ok(upd && /SPOOKY MODE IS ON/.test(upd.session.instructions), "Ara wasn't given the spooky rules");
  ok(Math.abs(upd.session.audio.output.speed - 0.9) < 0.001, "Ara's voice didn't slow down a touch");
  const off = await ara(p, "set_spooky_mode", { on: false });
  ok(off.ok && !off.spooky, "Ara couldn't turn spooky mode off");
  ok(!(await p.evaluate(() => document.documentElement.classList.contains("spooky"))), "the night look stayed on after normal mode");
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
};
