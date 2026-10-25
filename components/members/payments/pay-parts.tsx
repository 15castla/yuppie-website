// The small pieces every payment sheet is made of. Kit counterparts: the p_hd,
// p_sum, p_money and plan_sum builders of the approved design (pages_pay.py).
// One set of plain-words money lines, so no screen says anything different
// about where the money is: "Your £22 is held by Club Yuppie until the plan is
// over. Then it goes to Dan." and "Leave more than 24 hours before and you get
// it all back."

import type { ReactNode } from "react";

import { Avatar, Icon, type IconName } from "@/components/members/kit";
import { formatWhen, gbp } from "@/lib/members/invite/format";
import type { InviteMember, OpenInvite } from "@/lib/members/invite/types";
import { cn } from "@/lib/utils";

import "./payments.css";

/** Refunds reach a card in 5 to 10 working days: the usual card time, never a promise. */
export const BACK_5_10 = "5 to 10 working days";

/** Where the buyer's money is, before and after paying. */
export function heldLine(amount: string, host: string): string {
  return `Your ${amount} is held by Club Yuppie until the plan is over. Then it goes to ${host}.`;
}

export const REFUND_RULE = "Leave more than 24 hours before and you get it all back.";

/** The sheet's heading, with a close button on a phone (a computer's dialog has its own corner button). */
export function PayHead({
  id,
  title,
  sub,
  onClose,
  closeOff = false,
}: {
  id: string;
  title: ReactNode;
  sub?: ReactNode;
  /** Draws the phone's close button. Omit for the states that have none (the bank check, the results). */
  onClose?: () => void;
  closeOff?: boolean;
}) {
  return (
    <>
      <div className="pay-hd">
        <h2 className="pay-h" id={id}>
          {title}
        </h2>
        {onClose ? (
          <button
            type="button"
            className={cn("mk-icon-btn pay-x", closeOff && "is-off")}
            aria-label="Close"
            aria-disabled={closeOff || undefined}
            onClick={closeOff ? undefined : onClose}
          >
            <Icon name="x" size={22} />
          </button>
        ) : null}
      </div>
      {sub ? <p className="pay-sub">{sub}</p> : null}
    </>
  );
}

/** A round mark above a result's heading: a tick, an outline "i", a red alert. */
export function PayMark({ icon, tone = "ink" }: { icon: IconName; tone?: "ink" | "line" | "bad" }) {
  return (
    <span className={cn("pay-ic", tone === "line" && "is-line", tone === "bad" && "is-bad")}>
      <Icon name={icon} size={icon === "circle-alert" ? 24 : 26} />
    </span>
  );
}

/** The plan in the sheet: the host's photo, the title and when and where, with an optional price block under it. */
export function PlanTile({
  invite,
  photoOf,
  children,
}: {
  invite: Pick<OpenInvite, "title" | "startsAt" | "where">;
  /** Whose photo leads the tile: the host's by default, the payer's on the host's refund sheet. */
  photoOf: InviteMember;
  children?: ReactNode;
}) {
  return (
    <div className="pay-sum">
      <div className="hd">
        <Avatar photoUrl={photoOf.photoUrl} name={photoOf.firstName} size={40} />
        <div className="tx">
          <b className="pay-t">{invite.title}</b>
          <span className="m">
            {formatWhen(invite.startsAt)} · {invite.where}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

export type PriceLines =
  | { kind: "pay"; pence: number }
  | { kind: "paid"; pence: number }
  | { kind: "changed"; wasPence: number; nowPence: number }
  | { kind: "refunded"; pence: number };

/** The one price. Never a fee line: Club Yuppie covers the card fee (payments spec D1, option A). */
export function PriceLines({ lines }: { lines: PriceLines }) {
  const total = (label: string, pence: number) => (
    <div className="pay-line is-total">
      <span>{label}</span>
      <b>{gbp(pence)}</b>
    </div>
  );
  return (
    <div className="pay-lines">
      {lines.kind === "pay" ? total("You’ll pay", lines.pence) : null}
      {lines.kind === "paid" ? total("Paid", lines.pence) : null}
      {lines.kind === "refunded" ? total("Refunded", lines.pence) : null}
      {lines.kind === "changed" ? (
        <>
          <div className="pay-line">
            <span>Was</span>
            <s>{gbp(lines.wasPence)}</s>
          </div>
          {total("You’ll pay", lines.nowPence)}
        </>
      ) : null}
    </div>
  );
}

/** Lines with an icon: where the money is, when it moves. */
export function MoneyList({ items, className }: { items: { icon: IconName; text: ReactNode }[]; className?: string }) {
  return (
    <ul className={cn("pay-money", className)}>
      {items.map((item, index) => (
        <li key={index}>
          <Icon name={item.icon} size={20} />
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** The sheet's actions: stacked full-width buttons. */
export function PayActions({ children, tight = false }: { children: ReactNode; tight?: boolean }) {
  return <div className={cn("pay-act2", tight && "is-tight")}>{children}</div>;
}
