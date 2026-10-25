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
import { POLICY_SECTIONS, policyIntro, policyLastUpdated } from "@/components/site/privacy-data";

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
  const lastUpdated = policyLastUpdated();

  // The wording above and below is the live policy, unchanged; only the
  // styling follows the option D design (design-ref/boards/DPrivacy).
  return (
    <div className={cn(almarai.variable, instrumentSerif.variable, SITE_PAGE_CLASS)} style={SITE_FONT_STYLE}>
      <main className={cn(SITE_CONTAINER_CLASS, INNER_MAIN_PADDING_CLASS)}>
        {/* Below lg, one column capped at 760px, as before. From lg, two:
            the title and date on the left, sticky (128px from the top: the
            94px site header plus 34px), and the policy on the
            right at 760px max. The left column's h1 is sized down there
            so "Privacy" and "Policy" fit its width without breaking. */}
        <article className="grid max-w-[760px] grid-cols-1 gap-4 md:gap-5 lg:max-w-none lg:grid-cols-[minmax(240px,1fr)_minmax(0,760px)] lg:gap-x-16 lg:gap-y-0">
          <div className="flex flex-col gap-4 md:gap-5 lg:sticky lg:top-32 lg:self-start">
            <h1 className={cn(INNER_PAGE_H1_CLASS, "lg:text-[clamp(44px,4.4vw,64px)]")}>Club Yuppie privacy policy</h1>
            <p className="m-0 text-sm text-site-muted md:text-[15px]">Last updated: {lastUpdated}</p>
          </div>

          <div className="flex min-w-0 flex-col gap-8 md:gap-10">
            <p className="m-0 text-base leading-[1.6] md:text-lg">{policyIntro()}</p>

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
