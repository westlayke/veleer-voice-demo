#!/usr/bin/env node
// Catches a `//` comment that swallowed code on the same line (a comment inserted mid-line
// comments out everything after it, which cost us six failing checks on Oct 25).
// Rule: after `//` the rest of the line must not look like code: a statement ending in `;`,
// a block `{ ... }`, or an assignment to a known variable. Strings and regexes are skipped
// so a `//` inside "https://..." is not a comment.
// Usage: node tools/lint-comments.js [files...]   (default: preview/*.js and tests/**/*.js)
const fs = require("fs"), path = require("path");
const args = process.argv.slice(2);
if (!args.length) process.chdir(path.join(__dirname, "..")); // the default list is relative to the repo root, wherever the script is run from (the suite is often run from tests/)
const files = args.length ? args : [
  ...fs.readdirSync("preview").filter(f => f.endsWith(".js")).map(f => "preview/" + f),
  "tests/bot.js", ...fs.readdirSync("tests/checks").map(f => "tests/checks/" + f)];
// strong code signals that prose almost never has: a call ending in `;`, a dotted or declared assignment,
// a statement keyword right after `;` or `}`, or `) {` opening a block
const CODE = /[\w$\]]\([^()]*\)\s*;|\b[\w$]+(\.[\w$]+)+\s*=[^=>]|^\s*(const|let|var)\s+[\w$]+\s*=|[;}]\s*(const|let|var|return|await|G\.|S\.)\b|\)\s*\{/;
const problems = [];
function commentTail(line) {
  // walk the line, skipping strings, template literals and regex literals
  let i = 0, q = null;
  while (i < line.length) {
    const c = line[i];
    if (q) { if (c === "\\") i++; else if (c === q) q = null; }
    else if (c === '"' || c === "'" || c === "`") q = c;
    else if (c === "/" && line[i + 1] === "/") return line.slice(i + 2);
    else if (c === "/" && line[i + 1] === "*") { const e = line.indexOf("*/", i + 2); if (e < 0) return null; i = e + 1; }
    else if (c === "/" && /[(,=:;!&|?{}[\s]$/.test(line.slice(0, i).trimEnd().slice(-1) || "(")) {
      // regex literal: skip to its end
      let j = i + 1, cls = false;
      for (; j < line.length; j++) { const d = line[j]; if (d === "\\") { j++; continue; } if (d === "[") cls = true; else if (d === "]") cls = false; else if (d === "/" && !cls) break; }
      i = j;
    }
    i++;
  }
  return null;
}
for (const f of files) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  lines.forEach((line, n) => {
    const tail = commentTail(line);
    if (tail === null) return;
    const t = tail.trim();
    if (!t || /^(https?:|eslint|@ts|prettier)/.test(t)) return;
    if (CODE.test(t)) problems.push(`${f}:${n + 1}: comment looks like it swallowed code: //${tail.slice(0, 120)}`);
  });
}
if (problems.length) { console.error(problems.join("\n")); console.error(`\n${problems.length} suspicious comment(s). Use /* ... */ to put a note inside a line.`); process.exit(1); }
console.log(`comment lint: ${files.length} files clean`);
