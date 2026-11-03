// The Concierge's permission screen (3 Nov 2026, Apple guideline 5.1.2(i): explicit permission before personal data
// goes to a third-party AI). Shown in the Concierge tab, in place of the Concierge, until the member agrees
// (members.concierge_consent_at); the server sends nothing to Anthropic before that (app/members/concierge/actions.ts).
// "Turn off the Concierge" in the memory sheet brings it back. Pure: props in, markup out.

import "./concierge.css";

import { Button, KitLink, Main, PerkDrawing, TitleBlock } from "@/components/members/kit";
import { ROUTES } from "@/lib/members/routes";

const POINTS = [
  "What you ask it, and what it remembers about your taste, is sent to Anthropic, the company that makes the AI, to work out an answer. It may also search the web for places.",
  "Your account details (name, email and phone number) aren’t sent. Don’t tell it anything you’d rather keep private, such as health details.",
  "We keep the conversation for you. You can turn the Concierge off at any time from the Concierge itself, and deleting your account clears it.",
];

export function ConciergeConsentView({ agree, notNowHref }: { agree: () => void | Promise<void>; notNowHref: string }) {
  return (
    <Main className="cn-page cn-consent">
      <TitleBlock title="Concierge." sub="It learns your taste." />
      <section className="cn-hero" aria-label="Before you ask">
        <div className="mk-wrap">
          <div className="cn-hero-in">
            <p className="mk-lead cn-intro">
              Before you ask: <span className="mk-nb">it’s an AI.</span>
            </p>
            <span className="mk-art cn-art" aria-hidden="true">
              <PerkDrawing name="phone" />
            </span>
          </div>
        </div>
      </section>
      <section className="mk-section mk-first">
        <div className="mk-wrap">
          <ul className="cn-consent-list">
            {POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <div className="cn-consent-acts">
            <form action={agree}>
              <Button type="submit" blockPhone>
                Agree and continue
              </Button>
            </form>
            <Button variant="outline" href={notNowHref} blockPhone>
              Not now
            </Button>
          </div>
          <p className="mk-meta-line cn-consent-more">
            More in the <KitLink href={ROUTES.youHelpPrivacy}>privacy policy</KitLink>.
          </p>
        </div>
      </section>
    </Main>
  );
}
