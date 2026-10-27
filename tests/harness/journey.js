// The journey Testing Terry walks: a new contact all the way to a gift that closes the opportunity Closed Won.
// Stitched from Carverhill's real calls (Oct 23-27) with the names and details made up; the officer's words are kept as spoken.
// Each step ends in a save. A turn is one thing the officer says, with the tool Ara (the stand-in) calls for it, or nothing
// when the app takes the words itself. `field` names the form field the turn fills, so a fault can be aimed at one field per step.
const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date(), yesterday = new Date(today.getTime() - 86400000);
const friday = new Date(today); friday.setDate(today.getDate() + ((5 - today.getDay() + 7) % 7 || 7));
const T = iso(today), Y = iso(yesterday), F = iso(friday);
const C = "Jordan Pike";

module.exports = [
  { id: "contact", title: "New contact", saved: /Contact (added|saved)/, turns: [
    { say: "Let's create a new contact. Jordan Pike, P I K E.", tool: ["show_contact_draft", { first: "Jordan", last: "Pike" }], field: "name" },
    { say: "J Pike at gmail dot com for email.", tool: ["show_contact_draft", { first: "Jordan", last: "Pike", email: "jpike@gmail.com" }], field: "email" },
    { say: "No.", tool: null, field: "mobile", scripted: true, ara: "Do you have a mobile number for Jordan?" },
    { say: "Let's go with capacity C.", tool: ["optional_fields", { step: "answer", value: "C" }], field: "capacity", scripted: true, opt: true },
    { say: "I met him at the Citizens Alliance Halloween party.", tool: ["optional_fields", { step: "answer", value: "Met at the Citizens Alliance Halloween party" }], field: "howMet", scripted: true, opt: true },
    { say: "Neither.", tool: ["optional_fields", { step: "answer", value: "neither" }], field: "flags", scripted: true, opt: true },
    { say: "Yes.", tool: ["save_form", { confirmed: true }], field: "save", yes: true } ] },
  { id: "opportunity", title: "New opportunity", saved: /Opportunity created/, turns: [
    { say: "Yes, let's create the opportunity for Jordan.", tool: ["show_opportunity_draft", { contact_name: C }], field: "open" },
    { say: "The North Dakota Fed PAC.", tool: ["optional_fields", { step: "answer", value: "C.A. North Dakota Fed PAC" }], field: "entity", scripted: true, opt: true },
    { say: "North Dakota.", tool: ["optional_fields", { step: "answer", value: "North Dakota" }], field: "campaign", scripted: true, opt: true },
    { say: "Twenty-five thousand dollars.", tool: ["optional_fields", { step: "answer", value: "25000" }], field: "potential", scripted: true, opt: true },
    { say: "Move on.", tool: ["optional_fields", { step: "skip" }], field: "notes", scripted: true, opt: true },
    { say: "Yes.", tool: ["save_form", { confirmed: true }], field: "save", yes: true } ] },
  { id: "interaction", title: "Interaction report", saved: /Interaction report/, turns: [
    { say: "Log an interaction with Jordan Pike. I met him yesterday at the Citizens Alliance Halloween party, in person. We talked about his interest in the North Dakota work.",
      tool: ["show_interaction_draft", { contact_name: C, date: Y, meetingType: "In person", summary: "Met at the Citizens Alliance Halloween party; talked about his interest in the North Dakota work." }], field: "summary", scripted: true },
    { say: "Yes, it was.", tool: ["show_interaction_draft", { contact_name: C, substantive: true }], field: "substantive" },
    { say: "The next step is to call him on Friday to talk about a donation.", tool: ["show_interaction_draft", { contact_name: C, nextStep: "Call Jordan to talk about a donation", nextDue: F }], field: "nextStep", scripted: true },
    { say: "Yes.", tool: ["save_form", { confirmed: true }], field: "save", yes: true } ] },
  { id: "cultivate", title: "Move to Cultivation", saved: /Moved to Cultivation|Decision recorded/, turns: [
    { say: "Yes.", tool: ["show_cultivation_decision", { contact_name: C, decision: "Move to Cultivation" }], field: "decision", scripted: true, ara: "Next is to confirm the move to Cultivation. Want to do that now?" },
    { say: "Yes.", tool: ["save_form", { confirmed: true }], field: "save", yes: true } ] },
  { id: "plan", title: "Planned ask", saved: /Ask planned|Planned ask/, turns: [
    { say: "Yes, let's plan the ask for Jordan.", tool: ["show_ask_plan_draft", { contact_name: C }], field: "open", ara: "Next is to add a planned ask. Want to do that now?" },
    { say: "The North Dakota Fed PAC.", tool: ["show_ask_plan_draft", { contact_name: C, fund: "C.A. North Dakota Fed PAC" }], field: "entity" },
    { say: "Today.", tool: ["show_ask_plan_draft", { contact_name: C, plannedDate: T }], field: "plannedDate" },
    { say: "Twenty-five thousand dollars.", tool: ["show_ask_plan_draft", { contact_name: C, amount: 25000 }], field: "amount", scripted: true },
    { say: "Yes.", tool: ["save_form", { confirmed: true }], field: "save", yes: true } ] },
  { id: "ask", title: "Record the ask", saved: /Ask recorded/, turns: [
    { say: "Record the ask for Jordan. It was an in-person meeting today, and he accepted.", tool: ["show_ask_result_draft", { contact_name: C, date: T, meetingType: "In person", response: "Accepted", summary: "In-person meeting; he accepted." }], field: "response" },
    { say: "I need to collect the check from him later today.", tool: ["show_ask_result_draft", { contact_name: C, nextStep: "Collect the check from Jordan", nextDue: T }], field: "nextStep", scripted: true },
    { say: "Yes.", tool: ["save_form", { confirmed: true }], field: "save", yes: true } ] },
  { id: "gift", title: "Record gift", saved: /Gift recorded/, turns: [
    { say: "Jordan sent a check for twenty-five thousand dollars today, let's record the gift.", tool: ["show_gift_draft", { contact_name: C, amount: 25000, date: T, method: "Check" }], field: "amount", scripted: true },
    { say: "Yes.", tool: ["save_form", { confirmed: true }], field: "save", yes: true },
    { say: "Yes, that's right.", tool: ["save_form", { confirmed: true }], field: "amount check", yes: true } ] },
];
module.exports.dates = { T, Y, F };
