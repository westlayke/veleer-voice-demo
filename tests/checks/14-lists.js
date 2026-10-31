// Checks: each multiple-choice list lives in one place (Oct 31, Carverhill). Every list is in preview/lists.js. For entities: its table (ENTITIES) is the only
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


test("One lists module: short forms are heard for every list, and the evidence guard agrees with the answer-taker (Oct 31, 3:02 PM call)", async (p) => {
  const bad = await p.evaluate(() => {
    const out = [], one = (k, t, want) => { const h = listMatch(k, t).hits; if (h.length !== 1 || h[0] !== want) out.push(`${k}: "${t}" -> ${JSON.stringify(h)}, not ${want}`); };
    [["fund", "C3", "Citizens Alliance C3"], ["fund", "C-3.", "Citizens Alliance C3"], ["fund", "the c 3", "Citizens Alliance C3"], ["fund", "Idaho C4", "C.A. Idaho C4"],
     ["capacity", "bee", "B"], ["capacity", "it's a C", "C"], ["capacity", "about 300 thousand", "A"], ["method", "card", "Credit card"], ["method", "a check", "Check"],
     ["meetingType", "in-person", "In person"], ["askType", "a pledge", "Pledge"], ["frequency", "every month", "Monthly"], ["confirmedBy", "by email", "Email"], ["status", "waiting", "Waiting"]].forEach(a => one(...a));
    if (listMatch("fund", "C4").hits.length !== 5) out.push("\"C4\" should fit the five C4s");
    if (listTake("fund", "C4") !== null) out.push("\"C4\" was taken as one entity");
    if (listMatch("fund", "Idaho").hits.length !== 2) out.push("\"Idaho\" should fit two entities");
    /* Ara sends the spoken name, the officer said the short form: the guard must agree (the 3:02 PM call refused "C-3" three times) */
    if (fieldEvidence("plan", { k: "fund", type: "select" }, "National C3", {}, ["c-3."]) !== true) out.push("evidence: spoken National C3 with \"c-3.\" refused");
    if (fieldEvidence("plan", { k: "fund", type: "select" }, "Citizens Alliance C3", {}, ["c3"]) !== true) out.push("evidence: C3 refused");
    Object.entries(LISTS()).forEach(([k, vals]) => { if (!Array.isArray(vals) || !vals.filter(Boolean).length) out.push("empty list " + k); });
    if (onlyNoise("[B]") || onlyNoise("[B] that's it")) out.push("\"[B]\" taken as noise"); if (!onlyNoise("[noise]") || !onlyNoise(" [breath] [music] ")) out.push("a sound tag wasn't noise");
    return out;
  });
  ok(!bad.length, bad.slice(0, 6).join(" | "));
});

test("One lists module: an entity answer that fits several is asked back, a repeat is confirmed not taken for the next question, and an answer before the question has played is not taken (Oct 31, 2:50 PM call)", async (p) => {
  await signIn(p); await p.waitForFunction(() => window.__ws && G.status === "Listening", null, { timeout: 8000 }); await p.waitForTimeout(300);
  await p.evaluate(() => { G.hands = false; const c = S.contacts.find(x => x.first === "Ken"); c.capacity = "B"; S.opps = S.opps.filter(o => o.contactId !== c.id); save(); });
  await said(p, "Create an opportunity for Ken.");
  let r = await ara(p, "show_opportunity_draft", { contact_name: "Ken Ito" });
  await said(p, "The details."); r = await ara(p, "optional_fields", { step: "start" });
  await said(p, "C4."); r = await ara(p, "optional_fields", { step: "answer", value: "C4" });
  ok(/^Which one: .*Idaho C4.*\?$/.test(r.ask_exactly || "") && r.ok !== false, "\"C4\" wasn't asked back as which one: " + JSON.stringify(r).slice(0, 300));
  await said(p, "Idaho C4."); r = await ara(p, "optional_fields", { step: "answer", value: "Idaho C4" });
  let d = await p.evaluate(() => V.data);
  ok(d.fund === "C.A. Idaho C4" && /campaign/i.test(r.ask_exactly || ""), "the entity wasn't taken after which one: " + JSON.stringify({ fund: d.fund, r }).slice(0, 300));
  await said(p, "Idaho C4."); r = await ara(p, "optional_fields", { step: "answer", value: "Idaho C4" });
  d = await p.evaluate(() => V.data);
  ok(!d.campaign && r.repeat === "fund" && /^Idaho C4 is on the form\..*campaign/i.test(r.ask_exactly || ""), "a repeated answer wasn't confirmed with the open question: " + JSON.stringify({ campaign: d.campaign, r }).slice(0, 300));
  r = await ara(p, "optional_fields", { step: "answer", value: "Idaho C4" });
  ok(r.repeat === "fund" && !/campaign/i.test(r.ask_exactly || ""), "a second repeat asked the question again: " + JSON.stringify(r).slice(0, 300));
  // an answer that arrives while the app's question is still waiting to play is not taken
  await p.evaluate(() => { G.pendingForce = "Which campaign: National, or Idaho?"; });
  r = await ara(p, "optional_fields", { step: "answer", value: "National" });
  d = await p.evaluate(() => { const x = V.data; G.pendingForce = null; return x; });
  ok(!d.campaign && r.waiting && /came before the app's question had played/.test(await p.log()), "an answer before the question played was taken: " + JSON.stringify({ campaign: d.campaign, r }).slice(0, 300));
  await said(p, "Idaho."); r = await ara(p, "optional_fields", { step: "answer", value: "Idaho" });
  ok((await p.evaluate(() => V.data.campaign)) === "Idaho", "the campaign wasn't taken once the question had played: " + JSON.stringify(r).slice(0, 300));
});
};
