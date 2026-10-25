// Checks: moving around: tabs, titles, back buttons and lists. tests/bot.js loads this file and passes in its helpers.
module.exports = ({ test, ok, fresh, signIn, state, tab, ara, said, titleOf, PAGE, fs, path }) => {

test("Every tab opens with its title centred", async (p) => {
  await signIn(p);
  for (const [t, title] of [["Contacts", "Contacts"], ["Opportunities", "Opportunities"], ["Tasks", "Tasks"]]) {
    await tab(p, t); ok(await titleOf(p) === title, `${t} tab shows "${await titleOf(p)}"`);
    const c = await p.$eval("header.top h1", h => { const r = h.getBoundingClientRect(); return r.left + r.width / 2; });
    ok(Math.abs(c - 195) < 6, `${title} title is not centred (${Math.round(c)} px)`);
  }
});
test("Contact opens from the list and the back button returns", async (p) => {
  await signIn(p); await tab(p, "Contacts");
  await p.tap("[data-contact] >> nth=0"); await p.waitForTimeout(400);
  ok(await titleOf(p) === "Contact", "contact record did not open");
  const b = await p.$eval(".back", e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, t: e.textContent.trim() }; });
  ok(b.t === "Contacts", `back button says "${b.t}"`); ok(b.w >= 44 && b.h >= 44, `back button tap area is ${Math.round(b.w)}x${Math.round(b.h)}`);
  await p.tap(".back"); await p.waitForTimeout(300); ok(await titleOf(p) === "Contacts", "back did not return to Contacts");
});
test("Opportunity opens from the list and the back button returns", async (p) => {
  await signIn(p); await tab(p, "Opportunities");
  await p.tap("[data-opp] >> nth=0"); await p.waitForTimeout(400);
  ok(await titleOf(p) === "Opportunity", "opportunity record did not open");
  await p.tap(".back"); await p.waitForTimeout(300); ok(await titleOf(p) === "Opportunities", "back did not return to Opportunities");
});
test("No screen scrolls sideways on a phone", async (p) => {
  await signIn(p);
  for (const t of ["Home", "Contacts", "Opportunities", "Tasks"]) {
    await tab(p, t); const w = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(w <= 391, `${t} is ${w} px wide on a 390 px phone`);
  }
});

test("Top bar: the + button sits in the top-right corner, with Settings just to its left", async (p) => {
  await signIn(p);
  for (const t of ["Home", "Contacts", "Tasks"]) { if (t !== "Home") await tab(p, t);
    const [a, g] = await p.evaluate(() => [".top .addbtn", ".top .setbtn"].map(s => document.querySelector(s).getBoundingClientRect().left));
    ok(a > g, `on ${t} the + button is not to the right of Settings`);
    ok(await p.evaluate(() => innerWidth - document.querySelector(".top .addbtn").getBoundingClientRect().right) < 24, `on ${t} the + button is not in the corner`); }
});
test("A computer screen gets a left menu, a two-column Home and the Opportunities list beside the open opportunity; a phone keeps the phone layout", async (p) => {
  await signIn(p);
  ok(!(await p.$("main.home-wide")), "the phone got the computer layout");
  await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(400);
  ok(await p.$("main.home-wide .hcol"), "Home didn't switch to two columns on a wide screen");
  ok(await p.evaluate(() => getComputedStyle(document.querySelector(".tabbar")).width === "220px"), "the tab bar didn't become a left menu");
  await p.evaluate(() => go("board")); await p.waitForTimeout(300);
  const first = await p.$eval(".split-list [aria-current=true]", r => r.dataset.opp).catch(() => null);
  ok(first && await p.$(".split-detail .stepper, .split-detail h2, .split-detail section"), "the list and the open opportunity aren't side by side");
  const other = await p.$$eval(".split-list [data-opp]", rs => rs.map(r => r.dataset.opp));
  await p.click(`.split-list [data-opp="${other[2]}"]`); await p.waitForTimeout(300);
  ok(await p.$eval(".split-list [aria-current=true]", r => r.dataset.opp) === other[2] && (await state(p)).screen === "board", "picking another opportunity didn't show it beside the list");
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400);
  ok(!(await p.$("main.split")), "going back to phone width kept the computer layout");
});
};
