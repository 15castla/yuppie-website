// Kit counterpart: pages_you.member_card(state). The pale card with the
// price, the status and one line about the next step. Pure: no fetching, no
// actions. The card's own button (Manage, Keep my membership, Update card)
// only appears when the data carries one, and no live code supplies any yet
// (they need a Stripe billing link and an undo for a cancel), so the live
// page shows the status and the date only.

import { Button, Card } from "@/components/members/kit";
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

function Foot({ data }: { data: MembershipCardData }) {
  const block = data.state !== "active";
  const size = block ? "md" : "sm";
  const action = !data.action ? null : data.action.href ? (
    <Button size={size} href={data.action.href} block={block}>
      {data.action.label}
    </Button>
  ) : (
    <Button size={size} block={block}>
      {data.action.label}
    </Button>
  );

  if (data.state === "active") {
    if (!data.renews && !action) return null;
    return (
      <div className="yu-mem-foot">
        {data.renews ? <p>Renews {data.renews}</p> : <span />}
        {action}
      </div>
    );
  }
  if (data.state === "ending") {
    const until = data.endsOn ?? "then";
    return (
      <div className={cn("yu-mem-foot", action && "yu-col")}>
        <p>You’ve cancelled, so nothing more is taken. You keep everything until {until}.</p>
        {action}
      </div>
    );
  }
  if (data.state === "problem") {
    return (
      <div className="yu-mem-foot yu-col">
        <p>
          <b>We couldn’t take £10 on {data.failedOn}.</b> Update your card by {data.updateBy} to keep your membership.
        </p>
        {action}
      </div>
    );
  }
  return null;
}

export function MembershipCard({ data }: { data: MembershipCardData }) {
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
      <Foot data={data} />
    </Card>
  );
}
