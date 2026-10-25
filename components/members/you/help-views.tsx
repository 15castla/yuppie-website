// The in-app Help pages that need no state: the index, Contact us and the
// Privacy policy (FAQs is faq-view.tsx, which opens and closes). The native app
// redirects the public /faq, /contact and /privacy out of the app, so each has
// a page of its own here, on the same sub page frame as every You sub page.
// Pure: props in, markup out.

import "./you.css";

import { Icon, KitLink, Main, Row, Rows } from "@/components/members/kit";
import { CONTACT_EMAIL } from "@/components/site/links";
import type { PolicySection } from "@/components/site/privacy-data";
import { ROUTES } from "@/lib/members/routes";
import { SubPageHead } from "./you-parts";

// Help: the three pages, as one list. The lines under the titles are the
// design's own subtitles for each page.
export function HelpIndexView() {
  return (
    <Main className="yu-main yu-subpage">
      <SubPageHead title="Help." />
      <div className="mk-wrap">
        <section className="mk-section mk-first">
          <Rows>
            <Row href={ROUTES.youHelpFaq} className="yu-nav" title="FAQs" meta="Answers to the usual questions." end={<Icon name="chevron-right" size={20} />} />
            <Row href={ROUTES.youHelpContact} className="yu-nav" title="Contact us" meta="We’re here to help." end={<Icon name="chevron-right" size={20} />} />
            <Row href={ROUTES.youHelpPrivacy} className="yu-nav" title="Privacy policy" meta="How we look after your details." end={<Icon name="chevron-right" size={20} />} />
          </Rows>
        </section>
      </div>
    </Main>
  );
}

// Contact us: two whole-row links, the address (the page's job) and the FAQs
// (most questions are answered there). A mailto: link; the app hands it to the
// phone's mail app (needs_device_check).
export function ContactView() {
  return (
    <Main className="yu-main yu-subpage">
      <SubPageHead title="Contact us." sub="We’re here to help." />
      <div className="mk-wrap">
        <nav className="yu-ctrows" aria-label="Contact">
          <a className="yu-ct" href={`mailto:${CONTACT_EMAIL}`}>
            <span className="mk-term">Email</span>
            <span className="yu-ar" aria-hidden="true">
              <Icon name="arrow-right" size={20} />
            </span>
            <span className="yu-v">{CONTACT_EMAIL}</span>
          </a>
          <KitLink className="yu-ct" href={ROUTES.youHelpFaq}>
            <span className="mk-term">Questions</span>
            <span className="yu-ar" aria-hidden="true">
              <Icon name="arrow-right" size={20} />
            </span>
            <span className="yu-v">Read the FAQs</span>
          </KitLink>
        </nav>
      </div>
    </Main>
  );
}

// The contact address inside policy text becomes a real mailto link, as on the
// public page.
function withEmailLink(text: string) {
  const parts = text.split(CONTACT_EMAIL);
  return parts.flatMap((part, index) => {
    const node = <span key={`t${index}`}>{part}</span>;
    if (index === parts.length - 1) return [node];
    return [
      node,
      <a key={`e${index}`} href={`mailto:${CONTACT_EMAIL}`}>
        {CONTACT_EMAIL}
      </a>,
    ];
  });
}

// Privacy policy: the public policy's own text (components/site/privacy-data.ts),
// in a readable measure.
export function PrivacyView({ intro, lastUpdated, sections }: { intro: string; lastUpdated: string; sections: PolicySection[] }) {
  return (
    <Main className="yu-main yu-subpage">
      <SubPageHead title="Privacy policy." sub="How we look after your details." />
      <div className="mk-wrap">
        <p className="mk-meta-line yu-pol-date">Last updated {lastUpdated}</p>
        <p className="yu-pol-intro">{intro}</p>
        <div className="yu-pols">
          {sections.map((section) => (
            <section className="yu-pol" key={section.heading}>
              <h2 className="mk-h2">{section.heading}</h2>
              {section.paragraphs.map((paragraph, index) => (
                <p key={index}>{withEmailLink(paragraph)}</p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </Main>
  );
}
