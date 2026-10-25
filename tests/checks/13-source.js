// Source checks that need no browser: every app script parses on its own, and no `//` comment
// has swallowed code on the same line (Oct 25: a note inserted mid-line commented out the rest of
// a long line in voice.js and six checks failed; this catches it before the page is even opened).
const { execFileSync } = require("child_process");
module.exports = ({ test, ok, fs, path }) => {
  test("Source: every app script parses, and no // comment swallows code on its line", async () => {
    const root = path.join(__dirname, "..", "..");
    for (const f of fs.readdirSync(path.join(root, "preview")).filter(f => f.endsWith(".js"))) {
      try { new Function(fs.readFileSync(path.join(root, "preview", f), "utf8")); }
      catch (e) { ok(false, `preview/${f} does not parse: ${e.message}`); }
    }
    let out = "";
    try { out = execFileSync("node", [path.join(root, "tools", "lint-comments.js")], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
    catch (e) { ok(false, (e.stderr || e.message).split("\n").filter(Boolean).slice(0, 3).join(" | ")); }
    ok(/files clean/.test(out), "comment lint gave no clean report");
  }, { always: true });
};
