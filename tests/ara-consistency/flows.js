// Officer sides of the conversations, taken from real calls in the activity log (Oct 24-25) with names, emails and events made up.
// Each flow starts on a fresh copy of the preview with its five example contacts, in hands-free mode as most real calls were.
//   lines     what the officer says, in order (the officer answers Ara's save, "substantive" and "anything else" questions on their own)
//   subst     the answer to "Was it a substantive interaction?"
//   tool      the tool Ara must call for the task
//   saved     what the app must save (matched against its "saved" log rows)
//   rated     the officer names a capacity rating in this flow (Ara must not read out the whole list)
//   heard     fields that must reach the form exactly as the officer said them (checked in the tool calls' arguments; spoken runs)
module.exports = [
  { id: "new-contact", title: "Add a new contact",
    lines: ["Can we go into hands-free mode and create a new contact?", "Jordan Pike, P I K E.", "J Pike at gmail dot com for email.", "Let's go with capacity C."],
    tool: "show_contact_draft", saved: /Contact added/, rated: true, heard: { first: "Jordan", last: "Pike", email: "jpike@gmail.com", capacity: "C" } },
  { id: "capacity-named", title: "Set a capacity rating the officer names",
    lines: ["Let's go into hands-free mode.", "Add a capacity rating of B for James Okafor."],
    tool: "set_capacity_rating", saved: /Capacity rated B/, rated: true, heard: { contact_name: /James Okafor/i, rating: "B" } },
  { id: "log-interaction", title: "Log an interaction",
    lines: ["Let's go into hands-free mode.", "Log an interaction with James Okafor.", "I met him yesterday at the Citizens Alliance Halloween party, in person. We talked about his interest in the North Dakota work.",
      "The next step is to call him today to talk about a donation of twenty-five thousand dollars."],
    subst: "Yes, it was.", tool: "show_interaction_draft", saved: /Interaction report/, heard: { contact_name: /James Okafor/i, meetingType: /in person/i } },
  { id: "plan-ask", title: "Plan an ask",
    lines: ["Let's go into hands-free mode.", "Let's plan an ask for Priya Sandaruwan.", "The Pennsylvania C4.", "Pennsylvania.", "Today.", "Twenty-five thousand dollars.", "An outright gift."],
    tool: "show_ask_plan_draft", saved: /Ask planned/, heard: { contact_name: /Priya Sandaruwan/i, fund: /Pennsylvania C4/, campaign: /Pennsylvania/, amount: 25000 } },
  { id: "record-ask", title: "Record an accepted ask",
    lines: ["Let's go into hands-free mode.", "Record the ask for Elena Vasquez.", "It was an in-person meeting today, and she accepted.", "I need to collect the check from her later today."],
    tool: "show_ask_result_draft", saved: /Ask recorded: Accepted/, heard: { contact_name: /Elena Vasquez/i, response: /accepted/i, meetingType: /in person/i } },
  { id: "record-gift", title: "Record a gift",
    lines: ["Let's go into hands-free mode.", "Ken Ito sent a check for thirty thousand dollars today, let's record the gift.", "By check."],
    tool: "show_gift_draft", saved: /Gift recorded/, heard: { contact_name: /Ken Ito/i, amount: 30000, method: /check/i } },
  // a save followed by a second form (Oct 25, after the "forms only on the officer's word" guard)
  { id: "contact-then-opp", title: "Add a new contact, then create their opportunity",
    lines: ["Can we go into hands-free mode and create a new contact?", "Jordan Pike, P I K E.", "J Pike at gmail dot com for email.", "Let's go with capacity C.",
      "Yes, let's do that.", "The North Dakota Fed PAC.", "North Dakota.", "Twenty-five thousand dollars."],
    tool: "show_opportunity_draft", saved: /Opportunity created/, rated: true, heard: { last: "Pike", email: "jpike@gmail.com" } }, // 1.0 saves the opportunity before entity and amount are asked, so the script never says them
  // Carverhill's 7:41 PM call, Oct 29: an accepted ask saved by the officer's yes, then a yes to the app's next-step question (record the gift)
  { id: "ask-then-gift", title: "Record an accepted ask, then the gift on the app's next-step question",
    lines: ["Let's go into hands-free mode.", "Record the ask for Elena Vasquez. It was a video call yesterday and she accepted the forty thousand. She's excited to write the check.", "Yes, it was substantive. The next step is to collect the check from her, due today.",
      "Yes, let's do that.", "By wire."],
    tool: "show_gift_draft", saved: /Gift recorded/, subst: "Yes, it was substantive. The next step is to collect the check from her, due today.", heard: { response: /accepted/i, method: /wire/i } },
  { id: "plan-then-record", title: "Plan an ask, then record it",
    lines: ["Let's go into hands-free mode.", "Let's plan an ask for Priya Sandaruwan.", "The Pennsylvania C4.", "Pennsylvania.", "Today.", "Twenty-five thousand dollars.",
      "Yes, let's do that.", "It was an in-person meeting today, and she accepted.", "I need to collect the check from her later today."],
    tool: "show_ask_result_draft", saved: /Ask recorded/, heard: { fund: /Pennsylvania C4/, amount: 25000, response: /accepted/i } },
  // the officer doesn't give a next step until Ara asks for one
  { id: "log-interaction-ask", title: "Log an interaction, next step only when asked",
    lines: ["Let's go into hands-free mode.", "Log an interaction with James Okafor.", "I met him yesterday at the Citizens Alliance Halloween party, in person. We talked about the North Dakota work.",
      "Yes. I'll call him on Friday to talk about a gift."],
    subst: "Yes, it was.", tool: "show_interaction_draft", saved: /Interaction report/, heard: { contact_name: /James Okafor/i } },
  // harder officers (Oct 28, Carverhill "yes go ahead"): lines that sound like a real drive, for the engines' hearing rather than their manners
  { id: "rambling-interaction", title: "Log an interaction from a long, rambling summary",
    lines: ["Let's go into hands-free mode.", "Log an interaction with Ruth Abernathy.",
      "So I had lunch with Ruth on Tuesday, well, it was supposed to be coffee but it turned into lunch, and we talked about her daughter's wedding first, then the campaign, she's worried about the Idaho PAC spending, and she said she might be able to do something bigger next year if the fourth quarter goes well, oh, and she asked about the gala, anyway, it was in person.",
      "Send her the gala invitation by Friday."],
    subst: "Yes, it was.", tool: "show_interaction_draft", saved: /Interaction report/, heard: { contact_name: /Ruth Abernathy/i, meetingType: /in person/i, summary: /Idaho/i } },
  { id: "amount-corrected", title: "Record a gift with the amount corrected mid-sentence",
    lines: ["Let's go into hands-free mode.", "Ken Ito sent a check for twenty, no, twenty-five thousand dollars today, let's record the gift.", "By check."],
    tool: "show_gift_draft", saved: /Gift recorded/, heard: { contact_name: /Ken Ito/i, amount: 25000, method: /check/i } },
  { id: "mobile-digits", title: "Add a new contact with a mobile number read out digit by digit",
    lines: ["Can we go into hands-free mode and create a new contact?", "Morgan Reyes, R E Y E S.", "No email, but the mobile is six one seven, five five five, zero one four two.", "Let's go with capacity D."],
    tool: "show_contact_draft", saved: /Contact added/, rated: true, heard: { first: "Morgan", last: "Reyes", mobile: /^\D*6\D*1\D*7\D*5\D*5\D*5\D*0\D*1\D*4\D*2\D*$/, capacity: "D" } },
];
