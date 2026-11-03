// The community rules (3 Nov 2026, Apple guideline 1.2), in two places: the rules gate every member agrees to once
// before using the members area (app/members/rules: full screen, no tabs, like the membership and photo gates) and
// the permanent copy in Help (app/members/you/help/rules). One text: components/site/rules-data.ts. Pure: props in,
// markup out.

import "@/components/members/you/you.css";
import "@/components/members/gates/gates.css";
import "./rules.css";

import { BareChrome } from "@/components/members/shell/bare-chrome";
import { Wordmark } from "@/components/members/shell/wordmark";
import type { ReactNode } from "react";

import type { ShellMode } from "@/components/members/shell/types";
import { Button, Main, Serif } from "@/components/members/kit";
import { SubPageHead } from "@/components/members/you/you-parts";
import { CONTACT_EMAIL } from "@/components/site/links";
import { RULE_SECTIONS, RULES_INTRO } from "@/components/site/rules-data";

// The contact address inside the rules becomes a real mailto link, as in the privacy policy.
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

function RulesBody() {
  return (
    <>
      <p className="yu-pol-intro">{RULES_INTRO}</p>
      <div className="yu-pols">
        {RULE_SECTIONS.map((section) => (
          <section className="yu-pol" key={section.heading}>
            <h2 className="mk-h2">{section.heading}</h2>
            {section.paragraphs.map((paragraph, index) => (
              <p key={index}>{withEmailLink(paragraph)}</p>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}

/** The gate: the rules, then "I agree". Log out for anyone who would rather not. */
export function RulesGateView({
  mode,
  agree,
  signOut,
  deleteAccount,
}: {
  mode: ShellMode;
  /** Saves the agreement (members.rules_agreed_at) and goes on to the page the gate stopped them on. */
  agree: () => void | Promise<void>;
  signOut: () => void | Promise<void>;
  /** The quiet "Delete my account" (the membership gate's), for anyone who would rather leave. */
  deleteAccount?: ReactNode;
}) {
  const isApp = mode === "app";
  const logOut = (
    <form action={signOut}>
      <Button variant="quiet" type="submit" className={isApp ? "yu-quiet" : undefined}>
        Log out
      </Button>
    </form>
  );
  return (
    <>
      <div className="yu-gate-bar">
        <div className="mk-wrap">
          <div className="yu-in">
            <Wordmark />
            {logOut}
          </div>
        </div>
      </div>
      <Main className="yu-main rl-gate">
        <BareChrome />
        <div className="mk-wrap">
          <h1 className="mk-h1 rl-h1">
            Community <Serif>rules.</Serif>
          </h1>
          <p className="mk-lead rl-lead">Agree once to use Club Yuppie.</p>
          <RulesBody />
          <form action={agree} className="rl-agree">
            <Button type="submit" blockPhone>
              I agree
            </Button>
          </form>
          <div className="yu-quiet-row rl-quiet">
            {isApp ? logOut : null}
            {deleteAccount}
          </div>
        </div>
      </Main>
    </>
  );
}

/** Help > Community rules: the same text, to read again. */
export function RulesHelpView() {
  return (
    <Main className="yu-main yu-subpage">
      <SubPageHead title="Community rules." sub="How members treat each other." />
      <div className="mk-wrap">
        <RulesBody />
      </div>
    </Main>
  );
}
