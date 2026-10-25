"use client";

// The "I'm in" moments: sheets on a phone, dialogs on a computer. Kit
// counterpart: pages_oi.sheet_body(). Free plans only here: a paid plan's
// Pay and join, receipt and leave sheets are in components/members/payments.
//
//   success   "You're in."           after I'm in
//   withdraw  "Withdraw from this plan?"
//   report    reasons, Send report   then "Report sent."
//   taken     "That was the last place."
//   cancel    "Cancel this plan?" then "Plan cancelled." (the host; a free plan.
//             The designs draw this for a paid plan only: the free words are new.)

import { useId, useState, type ReactNode } from "react";

import { Button, Icon } from "@/components/members/kit";
import { formatWhen } from "@/lib/members/invite/format";
import type { InviteMember, OpenInvite } from "@/lib/members/invite/types";
import { messageThreadHref } from "@/lib/members/routes";
import { cn } from "@/lib/utils";
import { Sheet } from "./sheet";

export function PlanSummary({ invite }: { invite: Pick<OpenInvite, "title" | "startsAt" | "where"> }) {
  return (
    <div className="oi-sh-sum">
      <b>{invite.title}</b>
      <span>
        {formatWhen(invite.startsAt)} · {invite.where}
      </span>
    </div>
  );
}

/** "Tom and Priya can see you're in": the host, then one other person who is in. */
export function seenByNames(invite: OpenInvite, me: InviteMember): string {
  const others = invite.going.filter((person) => person.id !== me.id && person.id !== invite.host.id);
  const names = [invite.host.firstName, ...others.slice(0, 1).map((person) => person.firstName)];
  return names.join(" and ");
}

function Actions({ children, column = false }: { children: ReactNode; column?: boolean }) {
  return <div className={cn("oi-sh-act", column && "is-col")}>{children}</div>;
}

export function JoinedSheet({
  invite,
  me,
  onClose,
}: {
  invite: OpenInvite;
  me: InviteMember;
  onClose: () => void;
}) {
  const id = useId();
  return (
    <Sheet labelledBy={id} onClose={onClose}>
      <span className="oi-sh-icon">
        <Icon name="check" size={26} />
      </span>
      <h2 className="oi-sh-h" id={id}>
        You’re in.
      </h2>
      <p className="oi-sh-p">{seenByNames(invite, me)} can see you’re in. The plan chat is open, so say hello.</p>
      <PlanSummary invite={invite} />
      <Actions>
        <Button block href={invite.you.chatId ? messageThreadHref(invite.you.chatId) : undefined} icon={<Icon name="message" size={20} />}>
          Open chat
        </Button>
        <Button block variant="outline" onClick={onClose}>
          Done
        </Button>
      </Actions>
    </Sheet>
  );
}

export function WithdrawSheet({
  invite,
  onClose,
  onConfirm,
}: {
  invite: OpenInvite;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const id = useId();
  return (
    <Sheet labelledBy={id} onClose={onClose}>
      <h2 className="oi-sh-h" id={id}>
        Withdraw from this plan?
      </h2>
      <p className="oi-sh-p">
        Your place goes back to the invite and {invite.host.firstName} is told. You can join again if there’s still
        room.
      </p>
      <Actions>
        <Button block onClick={onClose}>
          Stay in
        </Button>
        <Button block variant="outline" className="oi-danger" onClick={onConfirm}>
          Withdraw
        </Button>
      </Actions>
    </Sheet>
  );
}

export const REPORT_REASONS = [
  "Payment outside Club Yuppie",
  "Price above what it cost",
  "Unkind or rude",
  "Feels unsafe",
  "Not a real plan",
  "Something else",
] as const;

export function ReportSheet({
  invite,
  withPrice,
  onClose,
  onSend,
  initialReason = 0,
}: {
  invite: OpenInvite;
  /** Paid plans are on: "Price above what it cost" is one of the reasons (the design lists it on every plan). Off, there is no price in the product. */
  withPrice: boolean;
  onClose: () => void;
  onSend: (reason: string) => void;
  initialReason?: number;
}) {
  const id = useId();
  const [reason, setReason] = useState(initialReason);
  const reasons = REPORT_REASONS.filter((text) => withPrice || invite.cost || text !== "Price above what it cost");
  return (
    <Sheet labelledBy={id} onClose={onClose}>
      <h2 className="oi-sh-h" id={id}>
        Report this invite
      </h2>
      <p className="oi-sh-p">Tell us what’s wrong. {invite.host.firstName} won’t be told who reported it.</p>
      <div className="oi-reasons" role="radiogroup" aria-label="Reason">
        {reasons.map((text, index) => (
          <label key={text} className={cn("oi-reason", index === reason && "is-on")}>
            <input
              type="radio"
              name="report-reason"
              className="mk-sr"
              checked={index === reason}
              onChange={() => setReason(index)}
            />
            <span className="rd" aria-hidden="true" />
            <span>{text}</span>
          </label>
        ))}
      </div>
      <Actions>
        <Button block onClick={() => onSend(reasons[reason])}>
          Send report
        </Button>
        <Button block variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </Actions>
    </Sheet>
  );
}

export function ReportSentSheet({ onClose }: { onClose: () => void }) {
  const id = useId();
  return (
    <Sheet labelledBy={id} onClose={onClose}>
      <span className="oi-sh-icon">
        <Icon name="check" size={26} />
      </span>
      <h2 className="oi-sh-h" id={id}>
        Report sent.
      </h2>
      <p className="oi-sh-p">Thanks. We read every report and act if we need to.</p>
      <Actions>
        <Button block onClick={onClose}>
          Done
        </Button>
      </Actions>
    </Sheet>
  );
}

export function TakenSheet({
  invite,
  onClose,
  seeOtherHref,
}: {
  invite: OpenInvite;
  onClose: () => void;
  seeOtherHref: string;
}) {
  const id = useId();
  const host = invite.host.firstName;
  return (
    <Sheet labelledBy={id} onClose={onClose}>
      <span className="oi-sh-icon is-line">
        <Icon name="info" size={26} />
      </span>
      <h2 className="oi-sh-h" id={id}>
        That was the last place.
      </h2>
      <p className="oi-sh-p">Someone got there first. You can ask {host} to let you know if a place opens.</p>
      <Actions>
        <Button
          block
          href={invite.you.askThreadId ? messageThreadHref(invite.you.askThreadId) : undefined}
          icon={<Icon name="message" size={20} />}
        >
          {`Ask ${host.split(" ")[0]}`}
        </Button>
        <Button block variant="outline" href={seeOtherHref}>
          See other invites
        </Button>
      </Actions>
    </Sheet>
  );
}

export function CancelSheet({
  invite,
  onClose,
  onConfirm,
}: {
  invite: OpenInvite;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const id = useId();
  const others = invite.going.filter((person) => person.id !== invite.host.id).length;
  return (
    <Sheet labelledBy={id} onClose={onClose}>
      <h2 className="oi-sh-h" id={id}>
        Cancel this plan?
      </h2>
      <p className="oi-sh-p">
        {others === 0
          ? "Nobody else has said yes yet. The plan comes off the list."
          : "Everyone who’s in is told straight away, and the plan comes off the list."}
      </p>
      <PlanSummary invite={invite} />
      <Actions>
        <Button block onClick={onClose}>
          Keep the plan
        </Button>
        <Button block variant="outline" className="oi-danger" onClick={onConfirm}>
          Cancel the plan
        </Button>
      </Actions>
    </Sheet>
  );
}

export function CancelledSheet({ invite, onClose }: { invite: OpenInvite; onClose: () => void }) {
  const id = useId();
  const others = invite.going.filter((person) => person.id !== invite.host.id).length;
  return (
    <Sheet labelledBy={id} onClose={onClose}>
      <span className="oi-sh-icon">
        <Icon name="check" size={26} />
      </span>
      <h2 className="oi-sh-h" id={id}>
        Plan cancelled.
      </h2>
      <p className="oi-sh-p">
        {others === 0 ? "It’s off the list." : "Everyone who was in has been told."}
      </p>
      <Actions>
        <Button block onClick={onClose}>
          Done
        </Button>
      </Actions>
    </Sheet>
  );
}
