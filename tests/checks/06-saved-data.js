// Checks: data saved on the phone and its upgrades. tests/bot.js loads this file and passes in its helpers.
module.exports = ({ test, ok, fresh, signIn, state, tab, ara, said, titleOf, PAGE, fs, path }) => {

test("Older saved data is upgraded once, in order, and newer data is left alone", async (p) => {
  await signIn(p);
  const ver = (await state(p)).dataVersion; ok(ver >= 6, "a new phone should start at the latest data version, got " + ver);
  // make the saved data look like it came from a phone before versioning
  await p.evaluate(() => { const S = JSON.parse(localStorage.getItem("veleer-voice-demo-v1") || JSON.stringify(window.__demo.state));
    delete S.dataVersion; const ex = S.contacts.find(c => c.example); ex.mobile = ""; delete ex.gifts;
    const o = S.opps.find(o => o.asks && o.asks.length) || S.opps[0]; o.asks = o.asks && o.asks.length ? o.asks : [{ amount: 1000 }];
    o.asks[0].response = "Yes"; o.asks[0].fund = "C3 - Citizens Alliance"; o.asks[0].campaign = "National"; window.__oid = o.id;
    localStorage.setItem("veleer-voice-demo-v1", JSON.stringify(S)); localStorage.setItem("__t_oid", o.id); localStorage.setItem("__t_cid", ex.id); });
  await p.reload(); await p.waitForTimeout(700);
  let st = await state(p); const oid = await p.evaluate(() => localStorage.getItem("__t_oid")), cid = await p.evaluate(() => localStorage.getItem("__t_cid"));
  let a = st.opps.find(o => o.id === oid).asks[0], c = st.contacts.find(c => c.id === cid);
  ok(st.dataVersion === ver, "upgraded data should be at version " + ver + ", got " + st.dataVersion);
  ok(a.response === "Accepted" && a.fund === "Citizens Alliance C3", "old ask response and entity should be upgraded, got " + a.response + " / " + a.fund);
  ok(c.mobile && Array.isArray(c.gifts), "example contact should get its mobile and giving history back");
  // data already at the latest version runs no steps, so an old-style value stays as saved
  await p.evaluate(() => { const S = window.__demo.state; S.opps.find(o => o.id === localStorage.getItem("__t_oid")).asks[0].response = "Yes";
    localStorage.setItem("veleer-voice-demo-v1", JSON.stringify(S)); });
  await p.reload(); await p.waitForTimeout(700);
  st = await state(p); a = st.opps.find(o => o.id === oid).asks[0];
  ok(a.response === "Yes", "data at the latest version should not be upgraded again, got " + a.response);
});

};
