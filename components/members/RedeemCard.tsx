"use client";

// The redeem card: what a member shows to staff at a till or a door. Rebuilt
// on the members kit from the approved design (v3 specs/discounts-access.md,
// section D, shots disc-board-redeem and access-redeem-*).
//
// Two parts, so the preview harness can draw every state:
//   RedeemCardView  the dialog and its states (loading, active, ended, other,
//                   error). A pure component of props, plus the dialog's
//                   keyboard behaviour (Escape, Tab kept inside, scroll lock,
//                   focus returned to the row that opened it).
//   RedeemCard      the real card: re-reads the membership every time it opens
//                   (getRedemptionStatus, app/members/redemption-actions.ts)
//                   and hands the answer to the view.
//
// A trust display for venue staff, not a redemption system: no QR code, no
// logging, nothing tracked. Membership status is re-fetched fresh every time
// this opens rather than trusting whatever was true when the page first
// loaded, since a static card is trivially screenshotted and handed to someone
// who isn't a member. "Checked 09:41" is the time of that fresh read, so an
// old screenshot gives itself away.
//
// A membership that is not active sees plain words and nothing that looks like
// a pass: no photo, no green dot, no offer, and the raw status value
// ("cancelled", "paused", "Unknown") is never printed.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";

import { getRedemptionStatus, type RedemptionStatus } from "@/app/members/redemption-actions";
import { Avatar, Button, Icon, Pill, Status } from "@/components/members/kit";
import { CARD_HELP_HREF, REJOIN_HREF, type RedeemPerk } from "@/components/members/discounts/perk-model";
import "@/components/members/discounts/discounts.css";

export type RedeemPhase =
  | { kind: "loading" }
  | { kind: "active"; name: string; photoUrl: string | null; checked: string }
  // The membership has ended (cancelled): "Your membership has ended."
  | { kind: "ended" }
  // Paused, or no member row: "We can’t show your card right now."
  | { kind: "other" }
  // The check itself failed (a lost connection): the same words, and a way to try again.
  | { kind: "error" };

const CHECKED_ZONE = "Europe/London";

// "09:41": 24-hour, leading zero, the club's own time zone (events and the
// card agree), from the server's clock.
export function formatChecked(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: CHECKED_ZONE,
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

export function phaseFor(status: RedemptionStatus | null): RedeemPhase {
  if (!status) return { kind: "other" };
  if (status.membership_status === "active") {
    return {
      kind: "active",
      name: status.full_name?.trim() || "Member",
      photoUrl: status.avatar_url,
      checked: formatChecked(status.checked_at),
    };
  }
  if (status.membership_status === "cancelled") return { kind: "ended" };
  return { kind: "other" };
}

// The card's content for each state. Plain words for anything that is not an
// active membership; the status value itself is never printed.
function RedeemBody({
  phase,
  perk,
  titleId,
  onRetry,
}: {
  phase: RedeemPhase;
  perk: RedeemPerk;
  titleId: string;
  onRetry?: () => void;
}) {
  switch (phase.kind) {
    case "loading":
      return (
        <>
          <div className="dc-who" aria-hidden="true">
            <i className="mk-sk dc-sk-photo" />
            <i className="mk-sk dc-sk-name2" />
            <i className="mk-sk dc-sk-status" />
          </div>
          <p className="dc-load" id={titleId}>
            Checking your membership.
          </p>
        </>
      );
    case "active":
      return (
        <>
          <div className="dc-who">
            <Avatar photoUrl={phase.photoUrl} name={phase.name} size={144} />
            <h2 className="dc-who-name" id={titleId}>
              {phase.name}
            </h2>
            <Status>Active member</Status>
            {phase.checked ? <p className="dc-checked">Checked {phase.checked}</p> : null}
          </div>
          <div className="dc-perk">
            <h3 className="dc-perk-name">{perk.name}</h3>
            {perk.meta ? <p className="dc-perk-meta">{perk.meta}</p> : null}
            <p className="dc-perk-line">{perk.headline}</p>
            {perk.badge ? (
              <div className="dc-card-badge">
                <Pill kind="ink">{perk.badge}</Pill>
              </div>
            ) : null}
          </div>
        </>
      );
    case "ended":
      return (
        <div className="dc-gone">
          <h2 className="dc-gone-h" id={titleId}>
            Your membership has ended.
          </h2>
          <p className="mk-lead">Get in touch to rejoin.</p>
          <div className="dc-gone-act">
            <Button href={REJOIN_HREF} block>
              Get in touch
            </Button>
          </div>
        </div>
      );
    case "other":
    case "error":
      return (
        <div className="dc-gone">
          <h2 className="dc-gone-h" id={titleId}>
            We can’t show your card right now.
          </h2>
          <p className="mk-lead">Get in touch and we’ll sort it.</p>
          <div className="dc-gone-act">
            <Button href={CARD_HELP_HREF} block>
              Get in touch
            </Button>
            {phase.kind === "error" ? (
              <Button variant="quiet" onClick={onRetry}>
                Try again
              </Button>
            ) : null}
          </div>
        </div>
      );
  }
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const noop = () => {};

export function RedeemCardView({
  phase,
  perk,
  onClose = noop,
  onRetry,
}: {
  phase: RedeemPhase;
  perk: RedeemPerk;
  /** Always given by the real card. Left out only by the preview harness, which draws a static card from the server and cannot pass a function. */
  onClose?: () => void;
  /** The error state's "Try again". */
  onRetry?: () => void;
}) {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // Dialog behaviour: focus moves into the card (and back to the row that
  // opened it), Escape closes, Tab stays inside, the page behind does not scroll.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cardRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const card = cardRef.current;
      if (!card) return;
      const focusable = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        card.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!card.contains(active) || (event.shiftKey && (active === first || active === card))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const loading = phase.kind === "loading";

  return (
    <>
      <div className="mk-scrim" aria-hidden="true" onClick={onClose} />
      <div
        className="dc-modal"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-busy={loading || undefined}
          tabIndex={-1}
          className={loading ? "dc-card dc-is-load" : "dc-card"}
        >
          <div className="dc-card-top">
            <Image
              src="/yuppie_logo_forte_forward.png"
              alt="Club Yuppie"
              width={1942}
              height={641}
              sizes="96px"
              className="mk-wm"
            />
            <button type="button" className="mk-icon-btn dc-x" aria-label="Close" onClick={onClose}>
              <Icon name="x" size={22} />
            </button>
          </div>
          <div aria-live="polite">
            <RedeemBody phase={phase} perk={perk} titleId={titleId} onRetry={onRetry} />
          </div>
        </div>
      </div>
    </>
  );
}

export function RedeemCard({ perk, onClose }: { perk: RedeemPerk; onClose: () => void }) {
  const [phase, setPhase] = useState<RedeemPhase>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  // A fresh read every time the card opens (and on "Try again").
  useEffect(() => {
    let cancelled = false;
    getRedemptionStatus()
      .then((status) => {
        if (!cancelled) setPhase(phaseFor(status));
      })
      .catch(() => {
        if (!cancelled) setPhase({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setPhase({ kind: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  return <RedeemCardView phase={phase} perk={perk} onClose={onClose} onRetry={retry} />;
}
