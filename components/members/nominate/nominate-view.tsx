"use client";

// Nominate a friend (/members/you/nominate, 12 Nov 2026; Albert: "Each member will get 5 referrals, each time they
// refer a member if approved their account will be credited with £10 (can then be spent on events etc.)", "it's 5
// nominations (doesn't matter if they get approved or not)").
//
// The deal first, then the member's link (Share, Copy link) and code, how many nominations are left, who they have
// nominated (Applied, Approved +£10, or Nomination used: someone not accepted is never named as such), and their
// credit with its history. On a computer, "How it works" sits in the right-hand rail. A view of plain props: the page
// (app/members/you/nominate/page.tsx) passes the member's data; the preview harness passes example data.

import "@/components/members/you/you.css";
import "./nominate.css";

import { useEffect, useState } from "react";

import { Avatar, Button, Card, Icon, Main, Pill, Rows, SectionTitle } from "@/components/members/kit";
import { SubPageHead } from "@/components/members/you/you-parts";
import { NOMINATION_CREDIT_PENCE, nominationsLeft, type NominatePageData, type NominationRow } from "@/lib/members/nominate/types";
import { gbp, signedGbp } from "./money";

type Copied = "link" | "code" | null;

/** The link without https://, in pieces a line may break between ("clubyuppie.com/apply?" "n=SAM-7K2Q"). */
const linkParts = (link: string) => link.replace(/^https?:\/\//, "").split(/(?<=\?)/);

const STATUS_META: Record<NominationRow["status"], (at: string) => string> = {
  applied: (at) => `Applied ${at} · With the committee`,
  approved: (at) => `Approved · Applied ${at}`,
  used: (at) => `Nomination used · ${at}`,
};

function NominationItem({ row }: { row: NominationRow }) {
  return (
    <div className="mk-row nm-row">
      <Avatar name={row.firstName} size={44} tone={row.status === "approved" ? undefined : "pale"} />
      <span className="mk-body">
        <span className="mk-title">{row.firstName}</span>
        <span className="mk-meta">{STATUS_META[row.status](row.at)}</span>
      </span>
      <span className="mk-end">
        {row.status === "approved" ? (
          <Pill kind="ink">+{gbp(NOMINATION_CREDIT_PENCE)}</Pill>
        ) : row.status === "applied" ? (
          <Pill>Applied</Pill>
        ) : null}
      </span>
    </div>
  );
}

function Dots({ allowed, used }: { allowed: number; used: number }) {
  if (allowed > 10) return null;
  return (
    <span className="nm-dots" aria-hidden="true">
      {Array.from({ length: allowed }, (_, i) => (
        <span key={i} className={`nm-dot${i < used ? " is-used" : ""}`} />
      ))}
    </span>
  );
}

function HowItWorks({ allowed }: { allowed: number }) {
  return (
    <section className="nm-how" aria-labelledby="nm-how-h">
      <SectionTitle title={<span id="nm-how-h">How it works</span>} />
      <ol className="nm-steps">
        <li className="nm-step">
          <span className="mk-serif">1</span>
          <span>Send someone your link, or give them your code.</span>
        </li>
        <li className="nm-step">
          <span className="mk-serif">2</span>
          <span>They apply. The committee decides, as it does for everyone.</span>
        </li>
        <li className="nm-step">
          <span className="mk-serif">3</span>
          <span>If they’re approved, {gbp(NOMINATION_CREDIT_PENCE)} goes on your credit for Club events.</span>
        </li>
      </ol>
      <p className="nm-small">
        You have {allowed} nominations. Each application made with your link or code uses one, whatever the committee decides.
      </p>
    </section>
  );
}

export function NominateView({
  data,
  demoCopied = null,
  demoShare = false,
}: {
  data: NominatePageData;
  /** Preview only: draw "Copied". */
  demoCopied?: Copied;
  /** Preview only: draw Share, as on a phone. */
  demoShare?: boolean;
}) {
  const left = nominationsLeft(data);
  const [copied, setCopied] = useState<Copied>(demoCopied);
  const [canShare, setCanShare] = useState(demoShare);

  // Share is the phone's own sheet (WhatsApp, Messages, Mail): only where the browser or the app has one.
  useEffect(() => {
    // The browser's own answer, known only after the first paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanShare(demoShare || (typeof navigator !== "undefined" && typeof navigator.share === "function"));
  }, [demoShare]);
  useEffect(() => {
    if (!copied || demoCopied) return;
    const timer = window.setTimeout(() => setCopied(null), 2500);
    return () => window.clearTimeout(timer);
  }, [copied, demoCopied]);

  async function copy(what: "link" | "code") {
    const text = what === "link" ? data.link : data.code;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      // No clipboard here: select the words so they can be copied by hand.
      const node = document.getElementById(what === "link" ? "nm-link" : "nm-code");
      if (node) window.getSelection()?.selectAllChildren(node);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "Club Yuppie", text: data.shareText, url: data.link });
    } catch {
      // Closed the sheet, or sharing failed: nothing to do (Copy link is beside it).
    }
  }

  return (
    <Main className="yu-main yu-subpage nm-sub">
      <SubPageHead title="Nominate a friend." sub="Good people know good people." />
      <div className="mk-wrap">
        <div className="mk-cols">
          <div>
            <p className="nm-intro">
              Send your link to someone you’d like to see in the club. If the committee approves them, we add{" "}
              <b>{gbp(NOMINATION_CREDIT_PENCE)} to your credit</b> to spend on Club events.
            </p>

            {left > 0 ? (
              <>
                <Card className="nm-link-card">
                  <span className="mk-term">Your link</span>
                  <span className="nm-link" id="nm-link">
                    {linkParts(data.link).map((part, i) => (
                      <span key={i} className="nm-nowrap">
                        {i > 0 ? <wbr /> : null}
                        {part}
                      </span>
                    ))}
                  </span>
                  <div className="nm-actions">
                    {canShare ? (
                      <Button icon={<Icon name="upload" size={20} />} onClick={() => void share()}>
                        Share
                      </Button>
                    ) : null}
                    <Button variant={canShare ? "outline" : "primary"} icon={<Icon name={copied === "link" ? "check" : "copy"} size={20} />} onClick={() => void copy("link")}>
                      {copied === "link" ? "Copied" : "Copy link"}
                    </Button>
                  </div>
                  <div className="nm-code-line">
                    <span>Or they can add your code when they apply:</span>
                    <span className="nm-code" id="nm-code">
                      {data.code}
                    </span>
                    <Button variant="quiet" size="sm" onClick={() => void copy("code")}>
                      {copied === "code" ? "Copied" : "Copy code"}
                    </Button>
                  </div>
                </Card>
                <p className="nm-count">
                  <Dots allowed={data.allowed} used={data.used} />
                  <span>
                    {left} of {data.allowed} nominations left.
                  </span>
                </p>
              </>
            ) : (
              <Card className="nm-done">
                <h2>You’ve used all {data.allowed} nominations.</h2>
                <p>Thank you for bringing people in. Anyone can still apply on clubyuppie.com without a nomination.</p>
              </Card>
            )}

            <section className="nm-section" aria-labelledby="nm-noms-h">
              <SectionTitle title={<span id="nm-noms-h">Your nominations</span>} />
              {data.nominations.length ? (
                <Rows>
                  {data.nominations.map((row) => (
                    <NominationItem key={row.id} row={row} />
                  ))}
                </Rows>
              ) : (
                <p className="nm-empty">No one yet. When someone applies with your link or code, they’ll show here.</p>
              )}
            </section>

            <section className="nm-section" aria-labelledby="nm-credit-h">
              <SectionTitle title={<span id="nm-credit-h">Your credit</span>} />
              <div className="nm-balance">
                <span className="nm-balance-num">{gbp(data.creditPence)}</span>
              </div>
              <p className="nm-balance-line">Spend it on any Club event. It comes off when you pay.</p>
              {data.history.length ? (
                <Rows className="nm-history">
                  {data.history.map((row) => (
                    <div className="mk-row nm-row" key={row.id}>
                      <span className="mk-body">
                        <span className="mk-title">{row.label}</span>
                        <span className="mk-meta">{row.at}</span>
                      </span>
                      <span className="mk-end">
                        <span className={`nm-amount${row.amountPence < 0 ? " is-spent" : ""}`}>{signedGbp(row.amountPence)}</span>
                      </span>
                    </div>
                  ))}
                </Rows>
              ) : null}
              <p className="nm-small">Credit is for Club events. It isn’t money, so it can’t be paid out or used for your membership.</p>
            </section>
          </div>
          <div className="mk-rail">
            <HowItWorks allowed={data.allowed} />
          </div>
        </div>
      </div>
    </Main>
  );
}
