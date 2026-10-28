// Kit counterpart: pages_you.member_card(state), plus r2a section 8's warning line. The pale card with the
// price, the status and one line about the next step, and its one button:
//   active    green dot, "Renews 12 Nov", Manage (the Stripe billing portal, /members/billing)
//   ending    amber dot, "Ends 12 Nov", the sentence, Keep my membership; and, when a booked club event
//             falls after the end date, the warning line (D8: "Sunrise Wellness Retreat, Sun 15 Nov, is
//             after this date. Your place goes if you leave.")
//   problem   red dot, "Payment failed", "We couldn’t take £10 on 12 Nov. Update your card by 15 Nov to
//             keep your membership.", Update card (the portal, opened on the card form)
//   paused, cancelled   the status only (those members see the gate, not You; the preview draws them)
// Pure: no fetching. The button is a link when the data carries an href (the billing portal; a plain <a>,
// never next/link, so nothing prefetches a portal session), else a button that calls onAction.

import type { ReactNode } from "react";

import { buttonClass, Button, Card, Icon } from "@/components/members/kit";
import { cn } from "@/lib/utils";
import type { MembershipCardData } from "@/lib/members/you/types";

function StatusWord({ data }: { data: MembershipCardData }) {
  switch (data.state) {
    case "active":
      return <span className="mk-status">Active</span>;
    case "ending":
      return <span className="mk-status mk-warn">{data.endsOn ? `Ends ${data.endsOn}` : "Ending"}</span>;
    case "problem":
      return <span className="mk-status yu-bad">Payment failed</span>;
    case "paused":
      return <span className="mk-status mk-warn">Paused</span>;
    default:
      return <span className="mk-status mk-off">Cancelled</span>;
  }
}

// Lucide's calendar-x, as r2a draws it (inline here rather than in the kit's shared icon set).
function CalendarX() {
  return (
    <svg className="mk-ico" width={20} height={20} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7.5" />
      <path d="M3 10h18" />
      <path d="m17 17 4 4" />
      <path d="m21 17-4 4" />
    </svg>
  );
}

function names(items: { title: string; when: string }[]): string {
  const parts = items.map((item) => `${item.title}, ${item.when}`);
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join("; ")} and ${parts.at(-1)}`;
}

/** D8: the club events booked after the end date. One event reads exactly as r2a draws it. */
function AfterEndWarning({ items }: { items: { title: string; when: string }[] }) {
  if (items.length === 0) return null;
  const one = items.length === 1;
  return (
    <div className="yu-mem-warn" role="note">
      <CalendarX />
      <div>
        <b>{names(items)},</b> {one ? "is after this date. Your place goes if you leave." : "are after this date. Your places go if you leave."}
      </div>
    </div>
  );
}

export function MembershipCard({
  data,
  onAction,
  pending = false,
  error,
}: {
  data: MembershipCardData;
  /** The card's button when it is not a link (Keep my membership). */
  onAction?: () => void;
  pending?: boolean;
  /** What went wrong with the button's action, under the button. */
  error?: string | null;
}) {
  const block = data.state !== "active";
  const size = block ? "md" : "sm";
  const action = data.action;
  let button: ReactNode = null;
  if (action?.href) {
    button = (
      <a
        href={action.href}
        className={buttonClass({ size, block })}
        {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {action.label}
      </a>
    );
  } else if (action) {
    button = (
      <Button size={size} block={block} pending={pending} onClick={pending ? undefined : onAction}>
        {pending ? "Working…" : action.label}
      </Button>
    );
  }
  const errorLine = error ? (
    <p className="yu-mem-err" role="alert">
      <Icon name="circle-alert" size={16} />
      <span>{error}</span>
    </p>
  ) : null;

  let foot: ReactNode = null;
  if (data.state === "active") {
    foot =
      data.renews || button ? (
        <div className="yu-mem-foot">
          {data.renews ? <p>Renews {data.renews}</p> : <span />}
          {button}
        </div>
      ) : null;
  } else if (data.state === "ending") {
    foot = (
      <div className={cn("yu-mem-foot", button && "yu-col")}>
        <p>You’ve cancelled, so nothing more is taken. You keep everything until {data.endsOn ?? "then"}.</p>
        {button}
      </div>
    );
  } else if (data.state === "problem") {
    foot = (
      <div className="yu-mem-foot yu-col">
        <p>
          <b>We couldn’t take £10{data.failedOn ? ` on ${data.failedOn}` : ""}.</b> Update your card{data.updateBy ? ` by ${data.updateBy}` : ""} to keep your
          membership.
        </p>
        {button}
      </div>
    );
  }

  return (
    <Card className="yu-mem" data-state={data.state}>
      <div className="yu-mem-top">
        <span className="mk-term">Membership</span>
        <StatusWord data={data} />
      </div>
      <p className="yu-price">
        <span className="yu-amt">£10</span>
        <span className="yu-per">a month</span>
      </p>
      {data.state === "ending" ? <AfterEndWarning items={data.afterEnd ?? []} /> : null}
      {foot}
      {errorLine}
    </Card>
  );
}
