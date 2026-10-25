// The public FAQ's questions and answers, shared by the public page (app/faq)
// and the in-app Help pages (app/members/you/help/faq), so the two can never
// drift. Moved here unchanged from app/faq/page.tsx (a Next page file cannot
// export data); each entry only gained an `id`, so the in-app list can pick
// the ones a member needs by name rather than by position.

export type FaqEntry = { id: string; question: string; answer: string };

// Copy from the approved board (design-ref/boards/DFaq.dc.html).
export const FAQ_ITEMS: FaqEntry[] = [
  {
    id: "membership",
    question: "How does membership work? Can I cancel at any time?",
    answer:
      "Yes. It’s £10 a month, cancel whenever you like. No lock-in, no faff.",
  },
  {
    id: "approval",
    question: "How will I know if my application’s been approved?",
    answer:
      "Every application is reviewed by our membership committee, so it’s not instant. If you’re in, we’ll tell you by text and email.",
  },
  {
    id: "charged",
    question: "Will I be charged when I apply?",
    answer:
      "No, your card details are saved securely with Stripe when you apply, but you’re not charged anything. We only take payment once your application’s approved, and you can cancel any time after that.",
  },
  {
    id: "pay-events",
    question: "Do I have to pay for events, or are they included in membership?",
    answer:
      "Membership covers your discounts and access. Events are run at cost and never marked up, and some are free for members.",
  },
  {
    id: "perks",
    question: "What additional perks do I get, beyond access to events?",
    answer:
      "Discounts at partner restaurants, bars, barbers, gyms and sports clubs. Plus access to things that aren’t open to the public: skip-the-queue entry at partner venues, guest lists and first dibs before things sell out.",
  },
  {
    id: "book",
    question: "How do I book onto events?",
    answer:
      "You can book through your Members Area or the Club Yuppie app, downloadable from the App Store and Google Play. Everything happening that month is listed there, so you just pick what you fancy.",
  },
];

// The questions in the order people wonder, under two labels (round 2
// inner pages spec 5.1 and D4.1). Numbers index FAQ_ITEMS above, which
// keeps every question and answer exactly as approved and in its original
// order; only the order shown changes. `openIndex` is an index into
// FAQ_ITEMS, so the first answer (question 0, "How does membership work?")
// is still the one open on arrival and is still the first row.
export const FAQ_GROUPS: { label: string; items: number[] }[] = [
  { label: "Joining", items: [0, 2, 1] },
  { label: "Once you’re in", items: [3, 5, 4] },
];
