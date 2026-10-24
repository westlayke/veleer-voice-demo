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

};
