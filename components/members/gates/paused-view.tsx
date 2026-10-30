// The paused gate (r2a section 8, decision A-D4): a paused member sees this and nothing else (help pages and
// Log out excepted). Drawn in the same shell and grammar as the approved ended gate
// (components/members/you/ended-view.tsx): the wordmark and Log out up top on the web, the status area on top
// in the app, the hero with the drawing standing on the 3px rule, a cream band ("To get going again", three
// steps), the quiet exits and the giant wordmark. Pure: props in, markup out. Kit counterpart: pages_r2a
// gate_paused().

import "@/components/members/you/you.css";
import "./gates.css";

import type { ReactNode } from "react";

import { BareChrome } from "@/components/members/shell/bare-chrome";
import { Wordmark } from "@/components/members/shell/wordmark";
import type { ShellMode } from "@/components/members/shell/types";
import { Button, Main, SectionTitle, Serif } from "@/components/members/kit";
import { YouFoot } from "@/components/members/you/you-parts";
import { CONTACT_EMAIL } from "@/components/site/links";
import { EventArt } from "@/components/members/event/event-art";

const STEPS = [
  "Get in touch and tell us you’d like it back.",
  "We check your membership and any payment.",
  "We switch it on and email you.",
];

export function MembershipPausedView({
  mode,
  legal,
  appVersion,
  signOut,
  deleteAccount,
}: {
  mode: ShellMode;
  legal: string[];
  appVersion?: string | null;
  signOut: () => void | Promise<void>;
  /** The quiet "Delete my account" control (the You area's dialog). */
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
      <Main pad={false} className="yu-main yu-gatemain">
        <BareChrome />
        <section className="yu-gate-hero gt-hero">
          <div className="mk-wrap">
            <div className="mk-head">
              <div className="yu-gate-grid">
                <div className="yu-gate-words">
                  <h1 className="mk-h1 yu-gate-h1">
                    Your membership <Serif>is paused.</Serif>
                  </h1>
                  <p className="mk-lead yu-gate-lead">Events, Discounts and Access are switched off until it’s back on.</p>
                  <div className="yu-gate-acts">
                    <Button blockPhone href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("My paused membership")}`}>
                      Get in touch
                    </Button>
                  </div>
                </div>
                <div className="yu-gate-art gt-art" aria-hidden="true">
                  <EventArt name="trainer" width={244.5} line={2.4} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mk-band" aria-label="To get going again">
          <div className="mk-wrap">
            <div className="mk-inner">
              <SectionTitle title="To get going again" />
              <ol className="gt-steps">
                {STEPS.map((step, index) => (
                  <li key={step}>
                    <span className="mk-serif">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <p className="gt-note">Your details, photo and bookings are kept while it’s paused.</p>
            </div>
          </div>
        </section>

        <section className="mk-section" style={{ marginTop: 32 }}>
          <div className="mk-wrap">
            <div className="yu-quiet-row">
              {isApp ? logOut : null}
              {deleteAccount}
            </div>
          </div>
        </section>

        <YouFoot legal={legal} appVersion={isApp ? appVersion : null} />
      </Main>
    </>
  );
}
