// Checks: the live page. tests/bot.js loads this file and passes in its helpers.
module.exports = ({ test, ok, fresh, signIn, state, tab, ara, said, titleOf, PAGE, fs, path }) => {

test("Live page loads as Citizens VCRM and checks version.json", async (p) => {
  ok((await p.title()) === "Citizens VCRM", `live title is "${await p.title()}"`);
  ok(await p.evaluate(() => document.documentElement.outerHTML.includes('VERSION_FILE = "version.json"')), "live page reads the preview version file");
  ok(await p.isVisible("text=Meet your new voice assistant!"), "live welcome missing");
}, { page: "index.html", always: true });

};
