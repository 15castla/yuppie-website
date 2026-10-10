import { cn } from "@/lib/utils";
import {
  almarai,
  instrumentSerif,
} from "@/components/templates/creative-studio/fonts";
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
        className="text-foreground/70 underline-offset-2 transition-colors hover:text-foreground hover:underline"
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

  return (
    <div
      className={cn(
        almarai.variable,
        instrumentSerif.variable,
        "flex flex-1 flex-col bg-background text-foreground antialiased",
      )}
      style={{
        fontFamily: "var(--font-almarai), ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <section className="relative flex flex-1 flex-col overflow-hidden">
        <main className="relative z-10 flex flex-1 flex-col items-center px-4 pt-[calc(7rem+var(--safe-top))] pb-20 sm:px-6 sm:pt-[calc(8rem+var(--safe-top))] sm:pb-28 md:pb-32">
          <div className="flex w-full max-w-3xl flex-col items-center gap-3 text-center">
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-foreground sm:text-xs optical-trim">
              PRIVACY POLICY
            </span>

            <h1 className="text-3xl leading-[0.95] text-foreground sm:text-4xl sm:leading-[0.9] md:text-5xl font-extrabold optical-trim">
              Yuppie Privacy Policy
            </h1>

            <p className="text-sm text-foreground-muted sm:text-base">
              Last updated: {lastUpdated}
            </p>

            <p className="max-w-2xl text-sm text-foreground-muted sm:text-base">
              This policy explains what personal data Yuppie (&quot;we&quot;,
              &quot;us&quot;) collects through clubyuppie.com and the Yuppie
              app, why, and what rights you have over it. Yuppie is operated
              by Club Yuppie, registered at 1 Westmoreland Mansions,
              Westminster, London W1G 8TN.
            </p>
          </div>

          <div className="mt-12 flex w-full max-w-3xl flex-col gap-4">
            {POLICY_SECTIONS.map((section) => (
              <div
                key={section.heading}
                className="rounded-2xl border border-foreground/10 bg-background-muted p-6 sm:p-8"
              >
                <h2 className="text-sm font-bold text-foreground sm:text-base">
                  {section.heading}
                </h2>
                <div className="mt-3 flex flex-col gap-3">
                  {section.paragraphs.map((paragraph, index) => (
                    <p
                      key={index}
                      className="text-sm leading-relaxed text-foreground-muted sm:text-base"
                    >
                      {renderWithEmailLink(paragraph)}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </main>
      </section>
    </div>
  );
}
