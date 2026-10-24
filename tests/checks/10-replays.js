// Checks: replays of real sessions (tests/replays/*.json; names and contact details changed). tests/bot.js loads this file and passes in its helpers.
module.exports = ({ test, ok, fresh, signIn, state, tab, ara, said, titleOf, PAGE, fs, path }) => {

for (const f of fs.readdirSync(path.join(__dirname, "..", "replays")).filter(f => f.endsWith(".json"))) {
  const r = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "replays", f), "utf8"));
  test("Replay: " + r.name, async (p) => {
    if (r.start === "no-name") { await p.tap(".wl-mic.big"); await p.waitForTimeout(600); } else await signIn(p);
    for (const [i, st] of r.steps.entries()) {
      const at = `step ${i + 1}`;
      if (st.said) { await said(p, st.said); await p.waitForTimeout(50); continue; }
      const out = await ara(p, st.tool, st.args); const x = st.expect || {};
      if (x.status) ok(String(out.status || "").includes(x.status), `${at}: Ara was not told "${x.status}": ${out.status || out.error}`);
      if (x.notSaved) ok(out.saved === false, `${at}: saved without confirming`);
      if (x.userName) ok((await state(p)).settings.userName === x.userName, `${at}: name is not ${x.userName}`);
      for (const [sel, want] of Object.entries(x.field || {})) { const got = await p.inputValue(sel); ok(got === want, `${at}: ${sel} is "${got}", expected "${want}"`); }
    }
  });
}

};
