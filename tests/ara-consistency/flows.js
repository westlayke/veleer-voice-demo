// Officer sides of the conversations, taken from real calls in the activity log (Oct 24-25) with names, emails and events made up.
// Each flow starts on a fresh copy of the preview with its five example contacts, in hands-free mode as most real calls were.
//   lines     what the officer says, in order (the officer answers Ara's save, "substantive" and "anything else" questions on their own)
//   subst     the answer to "Was it a substantive interaction?"
//   tool      the tool Ara must call for the task
//   saved     what the app must save (matched against its "saved" log rows)
//   rated     the officer names a capacity rating in this flow (Ara must not read out the whole list)
// a line starting with "!" is said at that point whatever Ara just asked (a side remark, "are you there?", "where were we?")
const stepOf = (c) => c.acts.filter(a => a.role === "step").map(a => a.text).join("\n");
module.exports = [
  { id: "new-contact", title: "Add a new contact",
    lines: ["Can we go into hands-free mode and create a new contact?", "Jordan Pike, P I K E.", "J Pike at gmail dot com for email.", "Let's go with capacity C."],
    tool: "show_contact_draft", saved: /Contact added/, rated: true },
  { id: "capacity-named", title: "Set a capacity rating the officer names",
    lines: ["Let's go into hands-free mode.", "Add a capacity rating of B for James Okafor."],
    tool: "set_capacity_rating", saved: /Capacity rated B/, rated: true },
  { id: "log-interaction", title: "Log an interaction",
    lines: ["Let's go into hands-free mode.", "Log an interaction with James Okafor.", "I met him yesterday at the Citizens Alliance Halloween party, in person. We talked about his interest in the North Dakota work.",
      "The next step is to call him today to talk about a donation of twenty-five thousand dollars."],
    subst: "Yes, it was.", tool: "show_interaction_draft", saved: /Interaction report/ },
  { id: "plan-ask", title: "Plan an ask",
    lines: ["Let's go into hands-free mode.", "Let's plan an ask for Priya Sandaruwan.", "The Pennsylvania C4.", "Pennsylvania.", "Today.", "Twenty-five thousand dollars.", "An outright gift."],
    tool: "show_ask_plan_draft", saved: /Ask planned/ },
  { id: "record-ask", title: "Record an accepted ask",
    lines: ["Let's go into hands-free mode.", "Record the ask for Elena Vasquez.", "It was an in-person meeting today, and she accepted.", "I need to collect the check from her later today."],
    tool: "show_ask_result_draft", saved: /Ask recorded: Accepted/ },
  { id: "record-gift", title: "Record a gift",
    lines: ["Let's go into hands-free mode.", "Ken Ito sent a check for thirty thousand dollars today, let's record the gift.", "By check."],
    tool: "show_gift_draft", saved: /Gift recorded/ },
  // a save followed by a second form (Oct 25, after the "forms only on the officer's word" guard)
  { id: "contact-then-opp", title: "Add a new contact, then create their opportunity",
    lines: ["Can we go into hands-free mode and create a new contact?", "Jordan Pike, P I K E.", "J Pike at gmail dot com for email.", "Let's go with capacity C.",
      "Yes, let's do that.", "The North Dakota Fed PAC.", "North Dakota.", "Twenty-five thousand dollars."],
    tool: "show_opportunity_draft", saved: /Opportunity created/, rated: true },
  { id: "plan-then-record", title: "Plan an ask, then record it",
    lines: ["Let's go into hands-free mode.", "Let's plan an ask for Priya Sandaruwan.", "The Pennsylvania C4.", "Pennsylvania.", "Today.", "Twenty-five thousand dollars.",
      "Yes, let's do that.", "It was an in-person meeting today, and she accepted.", "I need to collect the check from her later today."],
    tool: "show_ask_result_draft", saved: /Ask recorded/ },
  // the officer doesn't give a next step until Ara asks for one
  { id: "log-interaction-ask", title: "Log an interaction, next step only when asked",
    lines: ["Let's go into hands-free mode.", "Log an interaction with James Okafor.", "I met him yesterday at the Citizens Alliance Halloween party, in person. We talked about the North Dakota work.",
      "Yes. I'll call him on Friday to talk about a gift."],
    subst: "Yes, it was.", tool: "show_interaction_draft", saved: /Interaction report/ },
  // from Jim's Oct 27 2:26 PM call: the situations that went wrong, each in one conversation
  { id: "contact-there", title: "New contact, 'are you there?' mid-form",
    lines: ["Can we go into hands-free mode and create a new contact?", "Jordan Pike, P I K E.", "!Are you there?", "J Pike at gmail dot com for email.", "Let's go with capacity C."],
    tool: "show_contact_draft", saved: /Contact added/, rated: true,
    rules: [{ id: "app_answers_there", text: "", ok: (c) => [/The app answers "are you there" itself inside the form/.test(stepOf(c)), "no app answer to 'are you there' in the log"] }] },
  { id: "contact-wherewerewe", title: "New contact, 'where were we?' at the save question",
    lines: ["Can we go into hands-free mode and create a new contact?", "Jordan Pike, P I K E.", "J Pike at gmail dot com for email.", "!Oh, right. Okay, where were we?", "Save it."],
    tool: "show_contact_draft", saved: /Contact added/,
    rules: [{ id: "where_not_save", text: "", ok: (c) => { const st = stepOf(c), i = st.indexOf("The officer asked where the form stands"), j = st.indexOf("The officer chose to save (\"Oh, right"); return [i >= 0 && j < 0, j >= 0 ? "'where were we' was taken as a save" : "the app didn't say where the form stands"]; } }] },
  { id: "interaction-stepnodue", title: "Log an interaction, yes to substantive, step without a date",
    lines: ["Let's go into hands-free mode.", "Log an interaction with James Okafor.", "I met him yesterday at the Citizens Alliance Halloween party, in person. We talked about his interest in the North Dakota work.",
      "The next step is to call him to talk about a donation.", "Friday."],
    subst: "Yes.", tool: "show_interaction_draft", saved: /Interaction report/,
    rules: [{ id: "yes_not_summary", text: "", ok: (c) => { const f = c.acts.find(a => a.role === "form" && /Interaction report/.test(a.text)); return [!!f && !/Summary: Yes\b/.test(f.text), f ? f.text.slice(0, 200) : "no form saved"]; } },
      { id: "due_asked_alone", text: "", ok: (c) => [c.forced.some(x => x === "When is it due?") || c.replies.some(r => /^When is it due\?$/.test(r.text.trim())), "no 'When is it due?' on its own"] }] },
  { id: "plan-ask-list", title: "Plan an ask, 'can you list them?' at the entity question",
    lines: ["Let's go into hands-free mode.", "Let's plan an ask for Priya Sandaruwan.", "!Can you list them for me?", "The Pennsylvania C4.", "Pennsylvania.", "Today.", "Twenty-five thousand dollars.", "An outright gift."],
    tool: "show_ask_plan_draft", saved: /Ask planned/ },
];
