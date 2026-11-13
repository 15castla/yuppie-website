// The privacy policy's text, shared by the public page (app/privacy) and the
// in-app Help page (app/members/you/help/privacy), so the two can never drift.
// The company and its registered office come from components/site/links.ts,
// the one place for them.
//
// Rewritten 3 Nov 2026 for the App Store submission: the earlier text predated
// member photos, Open Invite, Messages, texts and the Concierge (which sends
// questions to Anthropic, only with the member's permission: Apple guideline
// 5.1.2(i)), and its "Last updated" date was worked out on every visit. Each
// line below describes what the code does; change the two together.

import { CONTACT_EMAIL, LEGAL_ENTITY, REGISTERED_OFFICE } from "./links";

export type PolicySection = { heading: string; paragraphs: string[] };

// Change this whenever the policy's substance changes.
const LAST_UPDATED = "3 November 2026";

export const POLICY_SECTIONS: PolicySection[] = [
  {
    heading: "What we collect",
    paragraphs: [
      "When you apply to join, we collect your full name, email address, phone number, employer, role title, and any social media handles you choose to give us (LinkedIn, Instagram).",
      "If you’re approved and become a member, we also hold your profile (bio and photo), your membership status, and your bookings for events.",
      "Your photo is required, kept private and shown only to signed-in members, next to your name on Open Invites and in messages. When you add it, the app may check on your phone that it shows a face; only the answer (a face or not) is saved with it. The club may look at photos to keep the club safe.",
      "When you use Open Invite and Messages, we keep the plans you post and join, the messages and questions you send, and any reports you make or members you block, so the features work and we can deal with reports.",
      "When you use the Concierge, we keep your questions, its answers and what it remembers about your taste (which you can see and forget from the Concierge).",
      "If you pay for membership or a paid event, payment is handled entirely by Stripe. We never see or store your card details ourselves; we hold a reference (a Stripe customer and subscription ID) so we can manage your billing.",
      "We do not use analytics, advertising or tracking cookies. We set a strictly necessary cookie that keeps you signed in and, in the app, one that tells our site it is running in the app. Neither needs separate consent under UK law.",
    ],
  },
  {
    heading: "Why we collect it",
    paragraphs: [
      "To assess your application, run your membership, let you book events, run Open Invite, Messages and the Concierge, keep the club safe, take payment, and contact you about your account: login codes, booking confirmations, updates about your plans and messages, and updates about your application or membership. You choose which updates reach you by email or text in Notifications. We don’t send marketing emails at this time; if that ever changes, we’ll give you a clear way to opt out.",
      "We rely on our contract with you to run your membership, on your consent for the Concierge, and on our legitimate interest in keeping members safe for reports and blocks.",
    ],
  },
  {
    heading: "Who we share it with",
    paragraphs: [
      "Other members see your first name, photo and what you post or send on Open Invite and in Messages. They never see your email address or phone number, unless you share them in a message yourself.",
      "Our service providers, each only for its own job: Supabase (our database, login and file storage), Vercel (which runs our website and app), Stripe (payments), Resend (emails) and Twilio (texts). None of them may use your data for their own purposes.",
      "The Concierge uses Claude, an AI made by Anthropic. Only once you’ve agreed, what you ask it and what it remembers about your taste are sent to Anthropic to work out an answer, and it may search the web for places. Your name, email and phone number are not sent. You can stop using the Concierge at any time from the Concierge itself.",
    ],
  },
  {
    heading: "How long we keep it",
    paragraphs: [
      "We keep application data for as long as needed to consider it and for a reasonable period after in case you reapply. We keep member data for as long as you’re a member, and for a limited period after you leave in case of billing or legal queries, after which it’s deleted.",
      "You can delete your account at any time from your Profile in the app or on the website. That deletes your photos and your Concierge conversation, cancels the plans you host and your future bookings, removes your blocks, and hides your messages from other members. We keep the text of your messages, and a record of the emails and texts we sent you, in case they’re needed for a safety report or a billing or legal query.",
    ],
  },
  {
    heading: "Your rights",
    paragraphs: [
      `Under UK data protection law, you can ask us at any time to see what data we hold on you, correct it if it’s wrong, or delete it. To do any of this, email ${CONTACT_EMAIL} and we’ll act on it as soon as we can. You can also complain to the Information Commissioner’s Office (ico.org.uk).`,
    ],
  },
  {
    heading: "Changes to this policy",
    paragraphs: [
      "If this policy changes, we’ll update the date at the top. If a change affects how we use your data, we’ll tell you before it happens.",
    ],
  },
  {
    heading: "Contact",
    paragraphs: [`Questions about this policy or your data: ${CONTACT_EMAIL}.`],
  },
];

// The paragraph above the sections: what the policy covers and who runs the club.
export function policyIntro(): string {
  return `This policy explains what personal data Club Yuppie (“we”, “us”) collects through clubyuppie.com and the Club Yuppie app, why, and what rights you have over it. Club Yuppie is run by ${LEGAL_ENTITY.name}, a company registered in England and Wales (company number ${LEGAL_ENTITY.number}), whose registered office is ${REGISTERED_OFFICE}.`;
}

// "Last updated": a fixed date, the day the policy last changed.
export function policyLastUpdated(): string {
  return LAST_UPDATED;
}
