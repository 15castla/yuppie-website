"use client";

// A receipt for a paid plan, for the member who paid. Kit counterpart:
// pages_pay.receipt_main(). Reached from the plan page ("See receipt") and from
// the success sheet. A pure view of Receipt.
//
//   paid       "Paid Sun 25 Oct."      where the money is, the refund rule, the tickets promise
//   refunded   "Refunded Tue 27 Oct."  why, when, and when it should reach the card
//
// "Email me a copy" only marks itself as sent here (nothing is emailed). With a
// backend it resends the receipt email to Receipt.email.
//
// needs_device_check: none (no fixed overlays).

import "@/components/members/invite/invite.css";

import { useState } from "react";

import { BackLink, BackRow, Button, Card, Icon, Main, Pill, TitleBlock } from "@/components/members/kit";
import { formatDay, formatRefundUntil, formatWhen, gbp } from "@/lib/members/invite/format";
import type { PaymentRefund, Receipt } from "@/lib/members/invite/types";
import { openInviteHref } from "@/lib/members/routes";
import { BarMessages } from "@/components/members/invite/top-block";
import { useShell } from "@/components/members/shell/shell-context";
import { BACK_5_10, MoneyList } from "./pay-parts";

const CONTACT = "hello@clubyuppie.com";

/** The messages icon in the web phone bar. The app's receipt (a sub page) draws none, as designed. */
function WebMessages() {
  const { mode } = useShell();
  return mode === "web" ? <BarMessages /> : null;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="pay-r">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function refundWhy(reason: PaymentRefund["reason"], host: string): string {
  if (reason === "left-in-time") return "You left more than 24 hours before";
  if (reason === "host-cancelled") return `${host} cancelled the plan`;
  return `${host} agreed to refund you`;
}

export function ReceiptView({ receipt }: { receipt: Receipt }) {
  const { payment, invite } = receipt;
  const host = invite.host.firstName;
  const price = gbp(payment.amountPence);
  const refund = payment.status === "refunded" ? payment.refund : null;
  const [sent, setSent] = useState(false);

  const sub = refund ? `Refunded ${formatDay(refund.refundedAt)}.` : `Paid ${formatDay(payment.paidAt)}.`;

  const lines = refund
    ? [
        {
          icon: "undo" as const,
          text: `Your ${gbp(refund.amountPence)} is on its way back to your card. It usually lands in ${BACK_5_10}, by ${formatDay(refund.expectedBy)}.`,
        },
        { icon: "check" as const, text: "Nothing more to pay." },
      ]
    : payment.status === "paid-out"
      ? [{ icon: "check" as const, text: `The plan is over, so your ${price} has gone to ${host}. Nothing more to pay.` }]
      : payment.status === "refund-asked"
        ? [
            { icon: "banknote" as const, text: `Your ${price} stays held by Club Yuppie until ${host} answers your refund request.` },
          ]
        : [
            { icon: "banknote" as const, text: `Club Yuppie holds your ${price} until the plan is over. Then it goes to ${host}.` },
            {
              icon: "undo" as const,
              text: `Leave until ${formatRefundUntil(invite.startsAt)} for a full refund. After that, ask ${host}.`,
            },
            {
              icon: "shield" as const,
              text: `Tickets didn’t arrive? Tell us before the plan starts and we’ll look into it before ${host} is paid.`,
            },
          ];

  return (
    <Main className="pay-subpage">
      <BackRow href={openInviteHref(invite.id)} label="Plan" actions={<WebMessages />} />
      <div className="mk-wrap pay-crumbwrap">
        <div className="pay-crumb">
          <BackLink href={openInviteHref(invite.id)} label="Plan" />
        </div>
      </div>
      <TitleBlock title="Receipt." sub={sub} actions={null} />
      <div className="mk-wrap">
        <div className="pay-rgrid">
          <div>
            <Card className="pay-rc" data-state={refund ? "refunded" : "paid"}>
              <div className="pay-rc-top">
                <span className="mk-term">Receipt {payment.receiptNumber}</span>
                {refund ? <Pill kind="muted">Refunded</Pill> : <Pill kind="ink">Paid</Pill>}
              </div>
              <h2 className="pay-rc-h">{invite.title}</h2>
              <p className="pay-rc-m">
                {formatWhen(invite.startsAt)} · {invite.where}
              </p>
              <div className="pay-rc-rows">
                <Line label="Host" value={host} />
                <Line label="Paid by" value={receipt.paidBy} />
                <Line label="Paid with" value={payment.method} />
                <Line label="Paid on" value={formatWhen(payment.paidAt)} />
                <div className="pay-r is-total">
                  <span>Total paid</span>
                  <b>{price}</b>
                </div>
              </div>
              {refund ? (
                <div className="pay-rrefund">
                  <span className="mk-term">Refund</span>
                  <Line label="Why" value={refundWhy(refund.reason, host)} />
                  <Line label="Refunded on" value={formatWhen(refund.refundedAt)} />
                  <div className="pay-r is-total">
                    <span>Refunded</span>
                    <b>{gbp(refund.amountPence)}</b>
                  </div>
                </div>
              ) : null}
            </Card>
          </div>
          <div className="pay-rside">
            <MoneyList className="pay-rmoney" items={lines} />
            <div className="pay-ract">
              <Button block variant="outline" onClick={() => setSent(true)}>
                <Icon name={sent ? "check" : "mail"} size={20} />
                {sent ? "Copy sent" : "Email me a copy"}
              </Button>
            </div>
            <p className="pay-fine pay-rfine" role="status">
              {sent ? (
                <>A copy of this receipt is on its way to {receipt.email}.</>
              ) : (
                <>
                  Questions about a payment? Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </Main>
  );
}
