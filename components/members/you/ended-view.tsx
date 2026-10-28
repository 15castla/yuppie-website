// The membership-ended gate: a full screen with no tabs, no photo and no Open
// Invite. Drawn from the approved design (specs/you.md "Membership states").
// The gate page (app/members/membership) shows it to ended members; Delete my
// account opens the members area's one Delete dialog (deleteMyAccount, which
// works from the gate).
//
// Web: Rejoin (to the public application) and Contact us. App: only "Get in
// touch", because Apple's rules keep billing and sign-up links out of the app.
// Pure: props in, markup out.

import "./you.css";

import { BareChrome } from "@/components/members/shell/bare-chrome";
import { Wordmark } from "@/components/members/shell/wordmark";
import type { ShellMode } from "@/components/members/shell/types";
import { Button, Icon, KitLink, Main, PerkDrawing, SectionTitle, Serif, cssVars } from "@/components/members/kit";
import { CONTACT_EMAIL } from "@/components/site/links";
import { DeleteAccountLink } from "./delete-account-link";
import { YouFoot } from "./you-parts";
import type { SessionEnded } from "@/components/members/session-ended";

const REASONS = [
  { title: "Events", text: "Supper clubs, Padel & Pints and nights out. Run by us, at cost.", art: "coupes" },
  { title: "Discounts", text: "Money off at restaurants, bars, barbers, gyms and sports clubs.", art: "tag" },
  { title: "Access", text: "Members’ clubs, guest lists and first dibs.", art: "rope" },
] as const;

export function MembershipEndedView({
  mode,
  endedOn,
  legal,
  appVersion,
  signOut,
  deleteAccount,
}: {
  mode: ShellMode;
  /** "12 Nov". */
  endedOn: string | null;
  legal: string[];
  appVersion?: string | null;
  signOut: () => void | Promise<void>;
  /** The preview's stand-in for deleteMyAccount (the live gate leaves it out: the dialog's default is the real action). */
  deleteAccount?: (confirmation: string) => Promise<{ ok: false; error: string } | SessionEnded | void>;
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
      {/* On the web the gate has its own small bar: the wordmark and Log out. The app has no bar (the status area is the top). */}
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
        <section className="yu-gate-hero">
          <div className="mk-wrap">
            <div className="mk-head">
              <div className="yu-gate-grid">
                <div className="yu-gate-words">
                  <h1 className="mk-h1 yu-gate-h1">
                    Your membership <Serif>has ended.</Serif>
                  </h1>
                  <p className="mk-lead yu-gate-lead">
                    {endedOn ? `It ended on ${endedOn}. ` : ""}Thanks for being a member.
                  </p>
                  <div className="yu-gate-acts">
                    {isApp ? (
                      <Button blockPhone href={`mailto:${CONTACT_EMAIL}`}>
                        Get in touch
                      </Button>
                    ) : (
                      <>
                        <Button blockPhone href="/apply">
                          Rejoin
                          <Icon name="arrow-right" size={20} />
                        </Button>
                        <KitLink className="mk-link" href="/contact">
                          Contact us
                        </KitLink>
                      </>
                    )}
                  </div>
                </div>
                <div className="mk-art yu-gate-art" style={cssVars({ "--slot": "171px", "--fs": 2.35 })}>
                  <PerkDrawing name="rope" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mk-band yu-gate-band" aria-label="What you get as a member">
          <div className="mk-wrap">
            <div className="mk-inner">
              <SectionTitle title="Come back for" />
              <div className="pk-list yu-reasons">
                {REASONS.map((reason) => (
                  <div className="pk-row" key={reason.title}>
                    <span className="pk-txt">
                      <h3>{reason.title}</h3>
                      <p>{reason.text}</p>
                    </span>
                    <span className="pk-art">
                      <PerkDrawing name={reason.art} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mk-section" style={{ marginTop: 32 }}>
          <div className="mk-wrap">
            <div className="yu-quiet-row">
              {isApp ? logOut : null}
              <DeleteAccountLink deleteAccount={deleteAccount} />
            </div>
          </div>
        </section>

        <YouFoot legal={legal} appVersion={isApp ? appVersion : null} />
      </Main>
    </>
  );
}
