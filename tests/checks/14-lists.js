// Checks: each multiple-choice list lives in one place (Oct 31, Carverhill). For entities: the table in preview/core.js (ENTITIES) is the only
// copy; every spoken name is heard as its own entity by both the matcher and the evidence guard; and no record name that differs from its
// spoken name ("C.A. ...") ever reaches the voice service. See the doc "Changing a multiple-choice list in Citizens VCRM".
module.exports = ({ test, ok, signIn, ara, said }) => {

test("One entity list: every spoken name is unique, and the matcher and the evidence guard both hear it as that entity (Oct 31)", async (p) => {
  const bad = await p.evaluate(() => {
    const out = [], seen = new Set();
    ENTITIES.forEach(([rec, spoken]) => {
      if (seen.has(spoken.toLowerCase())) out.push("spoken name used twice: " + spoken); seen.add(spoken.toLowerCase());
      if (/c\.a\./i.test(spoken)) out.push("spoken name keeps C.A.: " + spoken);
      if (fundFromSpoken(spoken) !== rec) out.push(`"${spoken}" turns into ${fundFromSpoken(spoken)}, not ${rec}`);
      for (const t of [spoken, "the " + spoken.toLowerCase() + ".", "it's the " + spoken.toLowerCase()]) {
        const h = matchEntity(t).hits; if (h.length !== 1 || h[0] !== rec) out.push(`matcher: "${t}" -> ${JSON.stringify(h)}`);
        if (!entityHeardIn(rec, [t.toLowerCase()])) out.push(`evidence guard: "${t}" not counted for ${rec}`);
        if (fieldEvidence("plan", { k: "fund", type: "select" }, rec, {}, [t.toLowerCase()]) !== true) out.push(`fieldEvidence: "${t}" not counted for ${rec}`);
      }
      if (toSpoken("x " + rec + " y") !== "x " + spoken + " y") out.push("toSpoken misses " + rec);
    });
    const cfg = JSON.stringify(sessionCfg()); /* Ara's instructions and Grok's tools as built, before the last-step swap in wire() */
    SPOKEN_SWAP.forEach(([rec]) => { if (cfg.includes(rec)) out.push("Ara's set-up names " + rec); });
    return out;
  });
  ok(!bad.length, bad.slice(0, 6).join(" | "));
});

test("One entity list: an ask planned by the spoken name keeps the entity, is not asked again, and nothing sent to the voice service says C.A. (Oct 31 loop)", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await p.evaluate(() => { G.hands = false; const c = S.contacts.find(x => x.first === "Ruth"); S.opps.filter(o => o.contactId === c.id).forEach(o => { o.fund = ""; o.campaign = ""; }); }); /* tap mode, and an opportunity with no entity yet, so the form asks for one */
  await said(p, "Plan an ask for Ruth, twenty-five thousand dollars, today.");
  await ara(p, "show_ask_plan_draft", { contact_name: "Ruth Abernathy", amount: 25000, plannedDate: new Date().toISOString().slice(0, 10) });
  await said(p, "National C4.");
  const r = await ara(p, "show_ask_plan_draft", { contact_name: "Ruth Abernathy", fund: "National C4" });
  ok((await p.inputValue("#f_fund")) === "C.A. of America Action C4", "the entity said as \"National C4\" wasn't kept: " + (await p.inputValue("#f_fund")) + " " + JSON.stringify(r).slice(0, 300));
  ok(!/Which entity/.test(JSON.stringify(r)), "the entity was asked again after \"National C4\": " + JSON.stringify(r).slice(0, 300));
  await ara(p, "get_opportunity_details", { contact_name: "Ruth Abernathy" }).catch(() => {}); /* reads the record, whose entity is a record name */
  const leaks = await p.evaluate(() => __sent.filter(s => typeof s === "string" && SPOKEN_SWAP.some(([rec]) => s.includes(rec))).map(s => s.slice(0, 160)));
  ok(!leaks.length, "a record name reached the voice service: " + leaks.slice(0, 2).join(" | "));
});

};
