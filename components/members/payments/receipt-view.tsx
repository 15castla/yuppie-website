"use client";

// A receipt for a paid plan, for the member who paid. Kit counterpart:
// pages_pay.receipt_main(). Reached from the plan page ("See receipt") and from
// the success sheet. A pure view of Receipt.
//
//   paid       "Paid Sun 25 Oct."      where the money is, the refund rule, the tickets promise
//   refunded   "Refunded Tue 27 Oct."  why, when, and when it should reach the card
//
// "Email me a copy" sends the receipt email again to Receipt.email (live, 15 Nov
// 2026; in the preview harness it only marks itself as sent).
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
import { emailReceiptAction } from "@/app/members/open-invite/pay-actions";
import { goToSessionEnded, isSessionEnded } from "@/components/members/session-ended";

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
  if (reason === "club") return "Club Yuppie refunded it";
  return `${host} agreed to refund you`;
}

export function ReceiptView({ receipt, live = false }: { receipt: Receipt; live?: boolean }) {
  const { payment, invite } = receipt;
  const host = invite.host.firstName;
  const price = gbp(payment.amountPence);
  // The place and Club Yuppie's booking fee (15 Nov 2026): the card was charged both.
  const fee = payment.feePence ?? 0;
  const total = gbp(payment.amountPence + fee);
  const refund = payment.status === "refunded" ? payment.refund : null;
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  // "Email me a copy": the receipt email again (live, 15 Nov 2026); the harness only marks it sent.
  async function emailCopy() {
    if (!live) return setSent(true);
    if (sending || sent) return;
    setSending(true);
    try {
      const result = await emailReceiptAction(invite.id);
      if (isSessionEnded(result)) return goToSessionEnded();
      if (result.ok) setSent(true);
    } finally {
      setSending(false);
    }
  }

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
                {fee ? (
                  <>
                    <Line label="Place" value={price} />
                    <Line label="Booking fee" value={gbp(fee)} />
                  </>
                ) : null}
                <div className="pay-r is-total">
                  <span>Total paid</span>
                  <b>{total}</b>
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
              <Button block variant="outline" data-needs-net="" pending={sending} onClick={() => void emailCopy()}>
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
