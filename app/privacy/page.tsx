import { cn } from "@/lib/utils";
import {
  almarai,
  instrumentSerif,
} from "@/components/templates/creative-studio/fonts";
import {
  INNER_PAGE_H1_CLASS,
  SITE_CONTAINER_CLASS,
  SITE_FONT_STYLE,
  INNER_MAIN_PADDING_CLASS,
  SITE_PAGE_CLASS,
  TEXT_LINK_CLASS,
} from "@/components/site/ui";
type PolicySection = { heading: string; paragraphs: string[] };

const POLICY_SECTIONS: PolicySection[] = [
  {
    heading: "What we collect",
    paragraphs: [
      "When you apply to join, we collect your full name, email address, phone number, employer, role title, and any social media handles you choose to give us (LinkedIn, Instagram).",
      "If you're approved and become a member, we also hold your profile details (bio, avatar), your membership status, and your booking history for events.",
      "If you pay for membership or a paid event, payment is handled entirely by Stripe. We never see or store your card details ourselves; we hold a reference (a Stripe customer and subscription ID) so we can manage your billing.",
      "We do not use analytics or tracking cookies. The only cookie we set is a strictly necessary one that keeps you signed in, which doesn't require separate consent under UK law.",
    ],
  },
  {
    heading: "Why we collect it",
    paragraphs: [
      "To assess your application, run your membership, let you book events, take payment, and send you emails about your account (login codes, booking confirmations, and updates about your application or membership). We don't send marketing emails at this time; if that ever changes, we'll give you a clear way to opt out.",
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
      "We keep application data for as long as needed to consider it and for a reasonable period after in case you reapply. We keep member data for as long as you're a member, and for a limited period after you leave in case of billing or legal queries, after which it's deleted.",
    ],
  },
  {
    heading: "Your rights",
    paragraphs: [
      "Under UK data protection law, you can ask us at any time to see what data we hold on you, correct it if it's wrong, or delete it. To do any of this, email hello@clubyuppie.com and we'll act on it as soon as we can.",
    ],
  },
  {
    heading: "Changes to this policy",
    paragraphs: [
      "If this policy changes, we'll update the date at the top. Continuing to use Yuppie after a change means you accept the updated policy.",
    ],
  },
  {
    heading: "Contact",
    paragraphs: ["Questions about this policy or your data: hello@clubyuppie.com."],
  },
];

const CONTACT_EMAIL = "hello@clubyuppie.com";

// Renders a paragraph's text with any occurrence of the contact email
// turned into a real mailto link, without needing to hand-author JSX for
// the one or two sections that happen to mention it.
function renderWithEmailLink(text: string) {
  const parts = text.split(CONTACT_EMAIL);
  return parts.flatMap((part, index) => {
    const node = <span key={`text-${index}`}>{part}</span>;
    if (index === parts.length - 1) return [node];
    return [
      node,
      <a
        key={`email-${index}`}
        href={`mailto:${CONTACT_EMAIL}`}
        className={TEXT_LINK_CLASS}
      >
        {CONTACT_EMAIL}
      </a>,
    ];
  });
}

export default function PrivacyPage() {
  const lastUpdated = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // The wording above and below is the live policy, unchanged; only the
  // styling follows the option D design (design-ref/boards/DPrivacy).
  return (
    <div className={cn(almarai.variable, instrumentSerif.variable, SITE_PAGE_CLASS)} style={SITE_FONT_STYLE}>
      <main className={cn(SITE_CONTAINER_CLASS, INNER_MAIN_PADDING_CLASS)}>
        {/* Below lg, one column capped at 760px, as before. From lg, two:
            the title and date on the left, sticky, and the policy on the
            right at 760px max. The left column's h1 is sized down there
            so "Privacy" and "Policy" fit its width without breaking. */}
        <article className="grid max-w-[760px] grid-cols-1 gap-4 md:gap-5 lg:max-w-none lg:grid-cols-[minmax(240px,1fr)_minmax(0,760px)] lg:gap-x-16 lg:gap-y-0">
          <div className="flex flex-col gap-4 md:gap-5 lg:sticky lg:top-8 lg:self-start">
            <h1 className={cn(INNER_PAGE_H1_CLASS, "lg:text-[clamp(44px,4.4vw,64px)]")}>Yuppie Privacy Policy</h1>
            <p className="m-0 text-sm text-site-muted md:text-[15px]">Last updated: {lastUpdated}</p>
          </div>

          <div className="flex min-w-0 flex-col gap-8 md:gap-10">
            <p className="m-0 text-base leading-[1.6] md:text-lg">
              This policy explains what personal data Yuppie (&quot;we&quot;,
              &quot;us&quot;) collects through clubyuppie.com and the Yuppie
              app, why, and what rights you have over it. Yuppie is operated
              by Club Yuppie, registered at 1 Westmoreland Mansions,
              Westminster, London W1G 8TN.
            </p>

            {POLICY_SECTIONS.map((section) => (
              <section
                key={section.heading}
                className="flex flex-col gap-3 border-t-[1.5px] border-foreground pt-5 md:gap-3.5 md:pt-6"
              >
                <h2 className="m-0 text-xl font-extrabold tracking-[-0.01em] md:text-2xl">{section.heading}</h2>
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index} className="m-0 text-base leading-[1.65] md:text-[17px]">
                    {renderWithEmailLink(paragraph)}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </article>
      </main>
    </div>
  );
}
