// The privacy policy's text, shared by the public page (app/privacy) and the
// in-app Help page (app/members/you/help/privacy), so the two can never drift.
// Moved here unchanged from app/privacy/page.tsx (a Next page file cannot
// export data). The registered office and company come from
// components/site/links.ts, the one place for them.

import { COMPANY, REGISTERED_OFFICE } from "./links";

export type PolicySection = { heading: string; paragraphs: string[] };

export const POLICY_SECTIONS: PolicySection[] = [
  {
    heading: "What we collect",
    paragraphs: [
      "When you apply to join, we collect your full name, email address, phone number, employer, role title, and any social media handles you choose to give us (LinkedIn, Instagram).",
      "If you’re approved and become a member, we also hold your profile details (bio, avatar), your membership status, and your booking history for events.",
      "If you pay for membership or a paid event, payment is handled entirely by Stripe. We never see or store your card details ourselves; we hold a reference (a Stripe customer and subscription ID) so we can manage your billing.",
      "We do not use analytics or tracking cookies. The only cookie we set is a strictly necessary one that keeps you signed in, which doesn’t require separate consent under UK law.",
    ],
  },
  {
    heading: "Why we collect it",
    paragraphs: [
      "To assess your application, run your membership, let you book events, take payment, and send you emails about your account (login codes, booking confirmations, and updates about your application or membership). We don’t send marketing emails at this time; if that ever changes, we’ll give you a clear way to opt out.",
    ],
  },
  {
    heading: "Who we share it with",
    paragraphs: [
      "Stripe (payment processing), Supabase (our database and login provider), and Resend (the service that sends our emails). Each only receives what they need to do their job, and none of them are permitted to use your data for their own purposes.",
    ],
  },
  {
    heading: "How long we keep it",
    paragraphs: [
      "We keep application data for as long as needed to consider it and for a reasonable period after in case you reapply. We keep member data for as long as you’re a member, and for a limited period after you leave in case of billing or legal queries, after which it’s deleted.",
    ],
  },
  {
    heading: "Your rights",
    paragraphs: [
      "Under UK data protection law, you can ask us at any time to see what data we hold on you, correct it if it’s wrong, or delete it. To do any of this, email hello@clubyuppie.com and we’ll act on it as soon as we can.",
    ],
  },
  {
    heading: "Changes to this policy",
    paragraphs: [
      "If this policy changes, we’ll update the date at the top. Continuing to use Club Yuppie after a change means you accept the updated policy.",
    ],
  },
  {
    heading: "Contact",
    paragraphs: ["Questions about this policy or your data: hello@clubyuppie.com."],
  },
];

// The paragraph above the sections: what the policy covers and who runs the
// club. Before the company details are set in links.ts it reads as it always
// has; once they are, it names the company, its number and its office.
export function policyIntro(): string {
  const covers =
    "This policy explains what personal data Yuppie (“we”, “us”) collects through clubyuppie.com and the Yuppie app, why, and what rights you have over it.";
  const operator =
    COMPANY.name && COMPANY.number
      ? `Yuppie is operated by ${COMPANY.name}, registered in England and Wales (company number ${COMPANY.number}), with its registered office at ${REGISTERED_OFFICE}.`
      : `Yuppie is operated by Club Yuppie, registered at ${REGISTERED_OFFICE}.`;
  return `${covers} ${operator}`;
}

// "Last updated": today's date, as the public page has always shown it
// (computed on each load, not a fixed revision date).
export function policyLastUpdated(): string {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
