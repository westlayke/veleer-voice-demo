// Checks: first visit: welcome, name and privacy notice. tests/bot.js loads this file and passes in its helpers.
module.exports = ({ test, ok, fresh, signIn, state, tab, ara, said, titleOf, PAGE, fs, path }) => {

test("First visit shows the big mic and the short privacy line", async (p) => {
  ok(await p.isVisible("text=Meet your new voice assistant!"), "welcome heading missing");
  ok(await p.isVisible(".wl-mic.big"), "big mic missing");
  ok(await p.isVisible("text=Conversations and taps are saved to improve the proof of concept"), "short privacy line missing");
});
test("Typing a name saves it, shows the full privacy notice, and starts Ara", async (p) => {
  await p.tap("text=I'd rather type my name");
  ok(await p.isVisible("text=What's your first name?"), "name screen heading missing");
  ok(await p.isVisible("text=No audio is kept. Kept for 90 days."), "full privacy notice missing on the name screen");
  await p.tap("text=Start"); ok(await p.isVisible("#wlErr"), "empty name was accepted");
  await p.fill("#wlName", "Sam"); await p.press("#wlName", "Enter"); await p.waitForTimeout(500);
  ok((await state(p)).settings.userName === "Sam", "name not saved");
  ok(await p.isVisible("header >> text=Sam"), "name not in the header");
  ok(await p.evaluate(() => __sent.some(s => s.includes("session.update"))), "Ara's conversation did not start");
});

};
