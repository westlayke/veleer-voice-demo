// Officer sides of the conversations, taken from real calls in the activity log (Oct 24-25) with names, emails and events made up.
// Each flow starts on a fresh copy of the preview with its five example contacts, in hands-free mode as most real calls were.
//   lines     what the officer says, in order (the officer answers Ara's save, "substantive" and "anything else" questions on their own)
//   subst     the answer to "Was it a substantive interaction?"
//   tool      the tool Ara must call for the task
//   saved     what the app must save (matched against its "saved" log rows)
//   rated     the officer names a capacity rating in this flow (Ara must not read out the whole list)
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
];
