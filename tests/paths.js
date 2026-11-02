// The path map: every path a call through the app can take, drawn from the app's own tables (forms, fields, tools, voice commands) plus the
// line, guard and check events the app logs, and which of them one conversation touched. Carverhill, Nov 1 2026 ("have it exercise all the
// possible paths in the app"): every harness readout ends with "Paths covered: N of M" and the misses, so the next goals are the gaps.
// Evaluated in the page (window.__acts from the harness's act() wrapper, window.__sent) by Patient Pat and the real-Ara run; pathsLines sums them.
const pathsInPage = () => {
  const rows = window.__acts || [], parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
  const steps = rows.filter(a => a.role === "step").map(a => a.text), saved = rows.filter(a => a.role === "form").map(a => a.text);
  const sent = (window.__sent || []).map(s => typeof s === "string" ? parse(s) : s).filter(Boolean);
  const outs = sent.filter(e => e.item && e.item.type === "function_call_output").map(e => parse(e.item.output) || {});
  const calls = steps.map(t => t.match(/^([a-z_]+) (\{[\s\S]*\})$/)).filter(Boolean).map(m => m[1]);
  const okCalls = calls.filter((name, i) => !(outs[i] && outs[i].ok === false)); /* the app answers every call in order; a refused one completed nothing */
  const some = (re) => steps.some(t => re.test(t)), paths = [];
  const add = (group, id, name, hit) => paths.push({ group, id, name, hit: !!hit });
  // forms: opened by its tool, saved, saved on the officer's yes; the optional fields answered or skipped (by field key)
  const opt = new Set();
  Object.entries(ACTIONS).forEach(([k, A]) => {
    const tool = (TOOLS.find(t => t.action === k) || {}).name, title = Object.values(ACTIONS).filter(x => x.title === A.title).length > 1 ? `${A.title} (${k})` : A.title; /* two forms share "Record gift" */
    if (tool) add("forms", `form.${k}.opened`, `${title}: opened (${tool})`, okCalls.includes(tool));
    add("forms", `form.${k}.saved`, `${title}: saved`, saved.some(s => s.startsWith(A.title + ".") || s.startsWith(A.title + " (")));
    add("forms", `form.${k}.yes`, `${title}: saved on the officer's yes to the read-back`, some(new RegExp("^the officer's yes to the " + A.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " read-back saved")));
    (A.fields || []).filter(f => !f.fixed && !f.req && f.k !== "forName" && !opt.has(f.k)).forEach(f => { opt.add(f.k); add("optional", `opt.${f.k}`, `Optional field ${f.label} (${f.k}) answered or skipped`, some(new RegExp("^optional field (skipped: )?" + f.k + "\\b"))); });
  });
  // the read-back and the save
  add("readback", "rb.no", "No to the read-back (change something)", some(/^the officer's no \(/));
  add("readback", "rb.amount", "The amount check after the yes", some(/read-back: the app checks the amount itself/));
  add("readback", "rb.notYes", "An answer not taken as the yes (the read-back no longer last, or before the amount check)", some(/not taken as (a|the amount) yes/));
  add("readback", "rb.toolSave", "Saved by Ara's save_form after the officer's yes", outs.some(o => o.saved === true && !o.already));
  add("readback", "rb.lateSave", "A late save_form refused after a save by words", outs.some(o => o.already === true));
  add("readback", "rb.cantSave", "A yes that can't save (something missing)", some(/read-back, but it can't be saved/));
  // the next step after a save
  add("next", "next.yes", "Yes to the next step offer", some(/^The officer said yes to setting the next step now|opens the step/));
  add("next", "next.no", "No to the next step offer", some(/^a no to the next step/));
  add("next", "next.ara", "Ara asked the next-step question herself", some(/^Ara asked the next-step question herself/));
  add("next", "next.followNo", "No to the suggested follow-up task", some(/^The officer said no to the suggested follow-up task/));
  add("next", "next.lateYes", "A late yes after the save (already saved)", some(/already saved and the next step itself|late-yes/));
  // optional-field flow
  add("optional", "opt.back", "Back to an earlier optional field", some(/^optional fields: back to /));
  add("optional", "opt.early", "An optional answer given before its question", some(/^optional fields: the officer's answer came before the questions/));
  add("optional", "opt.entity", "An entity answer taken at another optional question", some(/^optional fields: answer taken for the entity/));
  // voice commands the app handles itself
  [...new Set(VOICE_CMDS.map(v => v[1]).concat(["cancel", "restart"]))].forEach(c => add("commands", `cmd.${c}`, `Voice command: ${c}`, steps.includes("voice command " + c)));
  add("commands", "cmd.closeForm", "close_form (clear or close)", some(/^close_form (clear|close)/));
  add("commands", "cmd.handsFree", "Hands-free switched on or off", some(/^hands-free (on|off)/));
  // lookups and the other tools, from the tool list the app sends Ara
  toolDefs().map(t => t.name).filter(n => !TOOLS.some(t => t.name === n) && !/^(optional_fields|save_form|close_form|set_hands_free|set_spooky_mode|set_christmas_mode|set_speaking_speed|set_user_name|get_demo_changes|show_visitor)$/.test(n)).forEach(n => add("lookups", `tool.${n}`, `Tool ${n} completed`, okCalls.includes(n)));
  // the line
  add("line", "line.drop", "Reconnected after a drop (no form open)", some(/^Reconnected: (?!.*form)/));
  add("line", "line.dropForm", "Reconnected after a drop with a form open", some(/^Reconnected: .*form/));
  add("line", "line.lock", "Line reopened after a phone lock", some(/^Line reopened: /));
  add("line", "line.slow", "Scripted line not started on a slow line: fresh line", some(/^Scripted line not started after/));
  add("line", "line.kept", "A slow line test alone kept a line that answered", some(/^The voice line answered .* the line is kept/));
  add("line", "line.quiet", "The line went quiet: fresh line", some(/^The line went quiet/));
  add("line", "line.fallback", "Scripted line didn't play: Ara says it instead", some(/^Scripted line didn't play in/));
  add("line", "line.lateCopy", "A late copy of a line cut", some(/^Late copy cut|^Scripted line played late/));
  add("line", "line.noSound", "A line came without sound", some(/^Ara's line came without sound|^\(no sound\) Ara's line/));
  add("line", "line.noWords", "A reply with no words", some(/^Ara's reply had no words/));
  add("line", "line.hidden", "App hidden (lock or switch away)", some(/^App hidden for/));
  add("line", "line.soundPaused", "Sound paused by the phone", some(/^Sound paused by the phone/));
  add("line", "line.micMuted", "Mic muted by the phone", some(/^Mic muted by the phone/));
  add("line", "line.soundBack", "A line said again after the sound came back", some(/^Sound is back: |^Sound started afresh/));
  add("line", "line.idleAsk", "Quiet: the hang-up question", some(/^Quiet for .* hang up/));
  add("line", "line.idleStay", "The hang-up question answered with other words", some(/^The officer answered the hang-up question with other words/));
  add("line", "line.hangUp", "Hung up after the goodbye", some(/^Hanging up \(/));
  add("line", "line.resume", "Same conversation picked up after a drop", some(/same conversation|Couldn't pick up the same conversation/));
  // the guards
  add("guards", "guard.notAsked", "A form refused: the officer hasn't asked for it", some(/refused: the officer hasn't asked for the/));
  add("guards", "guard.notNamed", "A tool refused: the officer hasn't named the contact", some(/refused: the officer hasn't named/));
  add("guards", "guard.leftOut", "A value the officer never said was left out", some(/^Left out /));
  add("guards", "guard.ownWords", "Ara said the scripted line in her own words", some(/said the scripted line in (her|its) own words/));
  add("guards", "guard.doubled", "A second answer to the same ask cut off", some(/started a second answer to the same ask/));
  add("guards", "guard.noise", "Noise not taken as the officer speaking", some(/^Heard only noise/));
  add("guards", "guard.replayed", "A tool call refused as a replay after a drop", some(/^A tool call a guard refused while Ara was asked where we were/));
  add("guards", "guard.wordsOnly", "Ara answered in words without the tool call: asked again", some(/^Ara answered again without the tool call|asked again with/));
  // the checks on Ara
  add("checks", "check.first", "Ara asked a checked question first time", some(/^Ara asked the question herself: /));
  add("checks", "check.nudged", "Ara asked a checked question after one nudge", some(/^Ara asked the question herself after one nudge/));
  add("checks", "check.never", "Ara never asked a checked question", some(/^Ara's reply still didn't ask/));
  add("checks", "check.where", "Ara said where we were after a drop (checked)", some(/Ara is asked to say where we were herself/));
  add("checks", "check.handed", "A line handed to Ara instead of scripted", some(/^Handed to Ara to (say|ask) herself/));
  add("checks", "check.subst", "Ara asked whether the interaction was substantive", some(/^Ara is asked whether the interaction was substantive herself/));
  return paths;
};
// the report lines, from the per-conversation maps: the union of hits over the map, by group, and the misses
function pathsLines(convs) {
  const map = new Map(); convs.forEach(c => (c.paths || []).forEach(p => { const m = map.get(p.id) || { group: p.group, name: p.name, hits: 0 }; if (p.hit) m.hits++; map.set(p.id, m); }));
  const all = [...map.values()], hit = all.filter(p => p.hits), groups = [...new Set(all.map(p => p.group))];
  const lines = [`Paths covered: ${hit.length} of ${all.length}` + (all.length ? ` (${Math.round(100 * hit.length / all.length)}%)` : "") + ", in " + convs.length + " conversations.", "",
    "| Group | Covered | Of | Not covered |", "|---|---|---|---|",
    ...groups.map(g => { const ps = all.filter(p => p.group === g), miss = ps.filter(p => !p.hits); return `| ${g} | ${ps.length - miss.length} | ${ps.length} | ${miss.map(p => p.name).join("; ") || "none"} |`; })];
  return lines;
}
module.exports = { pathsInPage, pathsLines };
