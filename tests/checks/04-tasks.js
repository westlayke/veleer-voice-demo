// Checks: tasks: statuses, drafts and what Ara reads out. tests/bot.js loads this file and passes in its helpers.
module.exports = ({ test, ok, fresh, signIn, state, tab, ara, said, titleOf, PAGE, fs, path }) => {

test("Task circle marks Done, Undo brings it back", async (p) => {
  await signIn(p); await tab(p, "Tasks");
  const id = await p.$eval(".trow", r => r.dataset.tid);
  await p.tap(".trow .tcheck"); await p.waitForTimeout(300);
  ok((await state(p)).tasks.find(t => t.id === id).done, "task not marked done");
  ok(await p.isVisible("text=Done >> nth=0"), "no Done section");
  await p.tap("#undoBtn"); await p.waitForTimeout(300);
  ok(!(await state(p)).tasks.find(t => t.id === id).done, "Undo did not bring the task back");
});
test("Needs attention: the All count and the group counts drop when an item is resolved", async (p) => {
  await signIn(p);
  const counts = () => p.evaluate(() => { const b = [...document.querySelectorAll(".na-chips button")].map(x => [x.textContent.replace(/\s*\d+$/, "").trim(), +x.querySelector("b").textContent]); return { chips: Object.fromEntries(b), items: attentionItems().length }; });
  const before = await counts();
  const tid = await p.evaluate(() => { const t = S.tasks.find(t => !t.done && t.due && t.due <= addDays(todayISO(), 7)); return t && t.id; });
  ok(tid, "no task this week in Needs attention to resolve");
  await tab(p, "Tasks"); await p.tap(`.trow[data-tid="${tid}"] .tcheck`); await p.waitForTimeout(300); await tab(p, "Home"); await p.waitForTimeout(200);
  const after = await counts();
  ok(after.chips.All === before.chips.All - 1 && after.chips.All === after.items && after.chips.Tasks === before.chips.Tasks - 1, `All went from ${before.chips.All} to ${after.chips.All} (${after.items} items), Tasks from ${before.chips.Tasks} to ${after.chips.Tasks}`);
});
test("Status picker sets Waiting with a check-back date", async (p) => {
  await signIn(p); await tab(p, "Tasks");
  const id = await p.$eval(".trow", r => r.dataset.tid);
  await p.tap(".trow .tstat"); await p.waitForTimeout(250);
  await p.tap("[data-ts=waiting]"); await p.fill("#tsUntil", "2026-12-15"); await p.tap("#tsWaitGo"); await p.waitForTimeout(300);
  const t = (await state(p)).tasks.find(t => t.id === id);
  ok(t.status === "waiting" && t.due === "2026-12-15", `task is ${t.status}, due ${t.due}`);
});
test("Ara: reading open tasks matches the Tasks list", async (p) => {
  await signIn(p);
  const r = await ara(p, "get_my_tasks", { which: "all" });
  const open = (await state(p)).tasks.filter(t => !t.done).length;
  ok(r.ok && r.open_tasks_total === open, `Ara heard ${r.open_tasks_total} open tasks, the app has ${open}`);
  ok(await titleOf(p) === "Tasks", "Tasks screen did not open");
});
test("Ara: a long task list gives counts first, and one person's tasks can be asked for", async (p) => {
  await signIn(p);
  await p.evaluate(() => { const c = S.contacts[0]; for (let i = 0; i < 12; i++) S.tasks.push({ id: "lt" + i, contactId: c.id, text: "Long list task " + i, due: "2026-10-01", done: false }); save(); });
  const all = await ara(p, "get_my_tasks", { which: "all" });
  ok(all.ok && all.count > 8 && all.by_status && all.people_with_most_tasks && all.people_with_most_tasks[0].n >= 12 && /counts in one sentence/.test(all.say), "a long list wasn't summarised first: " + JSON.stringify({ count: all.count, say: all.say }));
  const one = await ara(p, "get_my_tasks", { which: "all", contact_name: await p.evaluate(() => nameOf(S.contacts[0])) });
  ok(one.ok && one.count >= 12 && one.tasks.every(t => /Long list task|/.test(t.task)) && one.for_person !== "everyone", "one person's tasks weren't filtered: " + JSON.stringify({ count: one.count, for: one.for_person }));
  await p.evaluate(() => { S.tasks = S.tasks.filter(t => !/^lt/.test(t.id)); save(); });
});
test("Ara: changing a task's status asks first, then saves", async (p) => {
  await signIn(p);
  const ask = await ara(p, "set_task_status", { task: "Pennsylvania update", status: "done", confirmed: false });
  ok(ask.ok && /^Mark '[^']*Pennsylvania update' for [A-Z][^,]+, due [A-Z][a-z]{2} \d+, as done\?$/.test(ask.ask_exactly || ""), "the question doesn't name the task, the person and the due date: " + JSON.stringify(ask));
  ok(!(await state(p)).tasks.find(t => /Pennsylvania/.test(t.text)).done, "saved before the officer said yes");
  const yes = await ara(p, "set_task_status", { task: "Pennsylvania update", status: "done", confirmed: true });
  ok(yes.saved, "not saved after yes");
  ok((await state(p)).tasks.find(t => /Pennsylvania/.test(t.text)).done, "task not done after yes");
  const none = await ara(p, "set_task_status", { task: "zebra crossing", status: "done", confirmed: false });
  ok(!none.ok, "a task that doesn't exist was matched");
});
test("Ara: a task draft opens on screen and nothing saves until Save", async (p) => {
  await signIn(p); const n = (await state(p)).tasks.length;
  await ara(p, "show_task_draft", { contact_name: "Ruth Abernathy", text: "Send Ruth the board deck", due: "2026-11-30" });
  ok(await p.isVisible("[data-act=save]"), "draft sheet did not open");
  ok((await p.inputValue("#f_text")) === "Send Ruth the board deck", "draft text not filled in");
  ok((await state(p)).tasks.length === n, "task saved without tapping Save");
  await p.tap("[data-act=save]"); await p.waitForTimeout(400);
  ok((await state(p)).tasks.length === n + 1, "task not saved after Save");
});

};
