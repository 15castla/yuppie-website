"use client";

// Leaving a paid plan, and the host cancelling one. Kit counterpart:
// pages_pay.leave_body() and cancel_body(). Leaving is easy and says what you
// get back; the host cancelling refunds everyone with no work.
//
//   leave / full   more than 24 hours before: "You'll get your £22 back in
//                  full" (automatic)
//   leave / late   less than 24 hours: "Too late for an automatic refund."
//                  Ask the host, stay in, or leave without a refund
//   left           "You've left." (refunded)
//   asked          "Request sent to Dan."
//   cancel         the host: "Cancel this plan?" with every payer listed
//   cancelled      "Plan cancelled."
//
// LOCAL DEMO STATE: the buttons change what this tab shows. With a backend
// each becomes a server action (LeaveResult, CancelPaidResult) and the server
// re-checks the 24 hour line when the member taps, because a plan can cross it
// while the sheet is open. needs_device_check: every sheet.

import { useId } from "react";

import { Avatar, Button, Icon, KitLink } from "@/components/members/kit";
import { Sheet } from "@/components/members/invite/sheet";
import { gbp } from "@/lib/members/invite/format";
import type { InvitePayment, OpenInvite } from "@/lib/members/invite/types";
import { messageThreadHref, openInviteReceiptHref } from "@/lib/members/routes";
import { BACK_5_10, MoneyList, PayActions, PayHead, PayMark, PlanTile, PriceLines } from "./pay-parts";

export function PaidLeaveSheet({
  invite,
  timing,
  onClose,
  onLeave,
  onAsk,
}: {
  invite: OpenInvite;
  timing: "full" | "late";
  onClose: () => void;
  /** `refund`: leave and be refunded in full (automatic); false: leave without a refund. */
  onLeave: (refund: boolean) => void;
  onAsk: () => void;
}) {
  const id = useId();
  const host = invite.host.firstName;
  const amount = gbp(invite.you.payment?.amountPence ?? invite.cost?.pricePence ?? 0);
  if (timing === "full") {
    return (
      <Sheet labelledBy={id} onClose={onClose} variant="pay">
        <PayHead id={id} title="Leave this plan?" onClose={onClose} />
        <p className="pay-p">
          You’ll get your {amount} back in full. Your place goes back to the plan and {host} is told.
        </p>
        <PlanTile invite={invite} photoOf={invite.host} />
        <MoneyList
          items={[
            { icon: "undo", text: `${amount} goes back to your card. It usually lands in ${BACK_5_10}.` },
            { icon: "clock", text: "It’s more than 24 hours until the plan, so this is automatic." },
          ]}
        />
        <PayActions>
          <Button block onClick={onClose}>
            Stay in
          </Button>
          <Button block variant="outline" className="pay-danger" onClick={() => onLeave(true)}>
            {`Leave and get ${amount} back`}
          </Button>
        </PayActions>
      </Sheet>
    );
  }
  return (
    <Sheet labelledBy={id} onClose={onClose} variant="pay">
      <PayHead id={id} title="Too late for an automatic refund." onClose={onClose} />
      <p className="pay-p">
        It’s less than 24 hours until this plan, so {host} decides whether to refund your {amount}.
      </p>
      <PlanTile invite={invite} photoOf={invite.host} />
      <MoneyList
        items={[
          {
            icon: "banknote",
            text: `Your ${amount} stays held by Club Yuppie until ${host} answers. If you leave without asking, it goes to ${host} after the plan.`,
          },
        ]}
      />
      <PayActions>
        <Button block icon={<Icon name="message" size={20} />} onClick={onAsk}>
          {`Ask ${host} for a refund`}
        </Button>
        <Button block variant="outline" onClick={onClose}>
          Stay in
        </Button>
        <Button variant="quiet" danger onClick={() => onLeave(false)}>
          Leave without a refund
        </Button>
      </PayActions>
    </Sheet>
  );
}

export function LeftSheet({ invite, onClose }: { invite: OpenInvite; onClose: () => void }) {
  const id = useId();
  const host = invite.host.firstName;
  const payment = invite.you.payment;
  const amount = gbp(payment?.amountPence ?? invite.cost?.pricePence ?? 0);
  return (
    <Sheet labelledBy={id} onClose={onClose} variant="pay">
      <PayMark icon="check" />
      <PayHead id={id} title="You’ve left." />
      <p className="pay-p">{host} has been told, and your place is back in the plan.</p>
      <PlanTile invite={invite} photoOf={invite.host}>
        <PriceLines lines={{ kind: "refunded", pence: payment?.refund?.amountPence ?? payment?.amountPence ?? 0 }} />
      </PlanTile>
      <MoneyList
        items={[
          { icon: "undo", text: `Your ${amount} is on its way back to your card. It usually lands in ${BACK_5_10}.` },
          {
            icon: "mail",
            text: (
              <>
                Receipt sent to sam@example.com.{" "}
                <KitLink className="mk-inline-link" href={openInviteReceiptHref(invite.id)}>
                  See receipt
                </KitLink>
              </>
            ),
          },
        ]}
      />
      <PayActions>
        <Button block onClick={onClose}>
          Done
        </Button>
      </PayActions>
    </Sheet>
  );
}

export function AskedSheet({ invite, onClose }: { invite: OpenInvite; onClose: () => void }) {
  const id = useId();
  const host = invite.host.firstName;
  const amount = gbp(invite.you.payment?.amountPence ?? invite.cost?.pricePence ?? 0);
  return (
    <Sheet labelledBy={id} onClose={onClose} variant="pay">
      <PayMark icon="check" />
      <PayHead id={id} title={`Request sent to ${host}.`} />
      <p className="pay-p">
        {host} decides whether to refund your {amount}. You’re still in the plan until {host} answers, and we’ll tell
        you.
      </p>
      <MoneyList items={[{ icon: "banknote", text: `Your ${amount} stays held by Club Yuppie until then.` }]} />
      <PayActions>
        <Button
          block
          href={invite.you.chatId ? messageThreadHref(invite.you.chatId) : undefined}
          icon={<Icon name="message" size={20} />}
        >
          Open chat
        </Button>
        <Button block variant="outline" onClick={onClose}>
          Done
        </Button>
      </PayActions>
    </Sheet>
  );
}

/** "Tom", "Tom and Priya", "Tom, Priya and Marcus". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function RefundRows({ payers }: { payers: InvitePayment[] }) {
  const total = payers.reduce((sum, payment) => sum + payment.amountPence, 0);
  return (
    <div className="pay-sum">
      <div className="pay-lines is-bare">
        {payers.map((payment) => (
          <div className="pay-line is-who" key={payment.id}>
            <span className="w">
              <Avatar photoUrl={payment.payer.photoUrl} name={payment.payer.firstName} size={28} />
              <span>{payment.payer.firstName}</span>
            </span>
            <span>{gbp(payment.amountPence)}</span>
          </div>
        ))}
        <div className="pay-line is-total">
          <span>Refunded in all</span>
          <b>{gbp(total)}</b>
        </div>
      </div>
    </div>
  );
}

/** The host cancels a paid plan with at least one payer: everyone who paid is refunded automatically. */
export function PaidCancelSheet({
  payers,
  onClose,
  onConfirm,
}: {
  payers: InvitePayment[];
  onClose: () => void;
  onConfirm: () => void;
}) {
  const id = useId();
  const names = joinNames(payers.map((payment) => payment.payer.firstName));
  const one = payers.length === 1;
  return (
    <Sheet labelledBy={id} onClose={onClose} variant="pay">
      <PayHead id={id} title="Cancel this plan?" onClose={onClose} />
      <p className="pay-p">
        {one ? `${names} is` : "Everyone who paid is"} refunded automatically, and everyone is told straight away.
      </p>
      <RefundRows payers={payers} />
      <MoneyList
        items={[
          {
            icon: "undo",
            text: one
              ? `${names}’s money goes back to ${names}’s card in ${BACK_5_10}.`
              : `Their money goes back to their cards in ${BACK_5_10}.`,
          },
          { icon: "banknote", text: "You won’t be paid for this plan." },
        ]}
      />
      <PayActions>
        <Button block onClick={onClose}>
          Keep the plan
        </Button>
        <Button block variant="outline" className="pay-danger" onClick={onConfirm}>
          {`Cancel and refund ${names}`}
        </Button>
      </PayActions>
    </Sheet>
  );
}

export function PaidCancelledSheet({ payers, onClose }: { payers: InvitePayment[]; onClose: () => void }) {
  const id = useId();
  const names = joinNames(payers.map((payment) => payment.payer.firstName));
  const one = payers.length === 1;
  const total = gbp(payers.reduce((sum, payment) => sum + (payment.refund?.amountPence ?? payment.amountPence), 0));
  return (
    <Sheet labelledBy={id} onClose={onClose} variant="pay">
      <PayMark icon="check" />
      <PayHead id={id} title="Plan cancelled." />
      <p className="pay-p">
        {names} {one ? "is" : "are"} refunded {total} in all and {one ? "has" : "have"} been told.
      </p>
      <MoneyList
        items={[
          { icon: "undo", text: `The money reaches ${one ? `${names}’s card` : "their cards"} in ${BACK_5_10}.` },
          { icon: "mail", text: "Each person gets a receipt by email." },
        ]}
      />
      <PayActions>
        <Button block onClick={onClose}>
          Done
        </Button>
      </PayActions>
    </Sheet>
  );
}
