"use client";

// You > Payments > one plan. Kit counterpart: pages_pay.plan_pay_main() and
// refund_sheet_body(). Who paid, where the money is, and a refund request to
// answer (a member who leaves inside 24 hours asks the host).
//
//   held       Tom paid £40 and it is held until the plan is over
//   request    Tom asked for a refund: "Refund £40 to Tom?" with Refund and Keep it
//
// A pure view of HostPlanPayments. Answering is LOCAL DEMO STATE: "Refund" marks
// the payment refunded in this tab and "Keep it" puts it back to held. With a
// backend each is RefundAnswer: a refund goes to the original card (about 5 to
// 10 working days), the place goes back to the plan, the member is told by
// email and in the app, and an unanswered request defaults to "keep" once the
// plan has happened (payments spec D3).
//
// needs_device_check: the refund sheet (web, app).

import "@/components/members/invite/invite.css";

import { useId, useState, type ReactNode } from "react";

import { Avatar, BackLink, BackRow, Button, Card, cssVars, Main, Pill } from "@/components/members/kit";
import { Sheet } from "@/components/members/invite/sheet";
import { formatDay, formatWhen, gbp } from "@/lib/members/invite/format";
import type { HostPlanPayments, InvitePayment, RefundAnswer } from "@/lib/members/invite/types";
import { ROUTES } from "@/lib/members/routes";
import { BACK_5_10, MoneyList, PayActions, PayHead } from "./pay-parts";
import { joinNames } from "./leave-sheets";

const DAY = 86_400_000;

/** Money still with the plan: not refunded. */
const counts = (payment: InvitePayment) => payment.status !== "refunded";

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="pay-r">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

/** "Refund £40 to Tom?" The payer leads the tile, so the host sees whose money it is. */
export function RefundSheet({
  payment,
  title,
  onClose,
  onRefund,
}: {
  payment: InvitePayment;
  /** The plan's title. */
  title: string;
  onClose: () => void;
  onRefund: () => void;
}) {
  const id = useId();
  const name = payment.payer.firstName;
  const amount = gbp(payment.amountPence);
  return (
    <Sheet labelledBy={id} onClose={onClose} variant="pay">
      <PayHead id={id} title={`Refund ${amount} to ${name}?`} onClose={onClose} />
      <p className="pay-p">
        {name}’s {amount} goes back to {name}’s card, usually in {BACK_5_10}. The place goes back to the plan, and you
        won’t be paid for it.
      </p>
      <div className="pay-sum">
        <div className="hd">
          <Avatar photoUrl={payment.payer.photoUrl} name={name} size={40} />
          <div className="tx">
            <b className="pay-t">
              {name}, {title}
            </b>
            <span className="m">
              Paid {amount} · {formatWhen(payment.paidAt)}
            </span>
          </div>
        </div>
      </div>
      <PayActions>
        <Button block onClick={onRefund}>
          Refund {amount}
        </Button>
        <Button block variant="outline" onClick={onClose}>
          Not now
        </Button>
      </PayActions>
    </Sheet>
  );
}

function PaidRow({ payment }: { payment: InvitePayment }) {
  const name = payment.payer.firstName;
  const amount = gbp(payment.amountPence);
  const refunded = payment.status === "refunded";
  return (
    <div className="mk-row pay-prow2">
      <Avatar photoUrl={payment.payer.photoUrl} name={name} size={48} />
      <span className="mk-body">
        <span className="mk-title">{name}</span>
        <span className="mk-meta">
          {refunded && payment.refund
            ? `Refunded ${gbp(payment.refund.amountPence)} · ${formatWhen(payment.refund.refundedAt)}`
            : `Paid ${amount} · ${formatWhen(payment.paidAt)}`}
        </span>
      </span>
      <span className="mk-end">
        {refunded ? (
          <Pill kind="muted">Refunded</Pill>
        ) : payment.status === "paid-out" ? (
          <Pill kind="muted">Paid out</Pill>
        ) : (
          <Pill>Held</Pill>
        )}
      </span>
    </div>
  );
}

function AskedRow({
  payment,
  onRefund,
  onKeep,
}: {
  payment: InvitePayment;
  onRefund: () => void;
  onKeep: () => void;
}) {
  const name = payment.payer.firstName;
  const amount = gbp(payment.amountPence);
  return (
    <>
      <div className="mk-row pay-prow2 is-ask">
        <Avatar photoUrl={payment.payer.photoUrl} name={name} size={48} />
        <span className="mk-body">
          <span className="mk-title">{name} asked for a refund</span>
          <span className="mk-meta">
            Left less than 24 hours before{payment.refundAskedAt ? ` · ${formatWhen(payment.refundAskedAt)}` : ""}
          </span>
        </span>
        <span className="mk-end">
          <Pill className="mk-warn">Asked</Pill>
        </span>
      </div>
      <div className="pay-ask">
        <p>
          Refund <b>{amount}</b> to {name}? It goes back to {name}’s card. {name}’s place goes back to the plan and you
          won’t be paid for it.
        </p>
        <div className="a">
          <Button size="sm" onClick={onRefund}>
            Refund {amount}
          </Button>
          <Button size="sm" variant="outline" onClick={onKeep}>
            Keep it
          </Button>
        </div>
      </div>
    </>
  );
}

export function PlanPaymentsView({
  plan,
  initialRefund = false,
}: {
  plan: HostPlanPayments;
  /** The refund sheet open on arrival (the preview harness draws it). */
  initialRefund?: boolean;
}) {
  const { invite } = plan;
  const price = invite.cost?.pricePence ?? 0;
  const [payments, setPayments] = useState<InvitePayment[]>(plan.payments);
  const [sheet, setSheet] = useState<InvitePayment | null>(
    initialRefund ? (plan.payments.find((payment) => payment.status === "refund-asked") ?? null) : null,
  );
  const [said, setSaid] = useState("");

  const over = new Date(invite.startsAt).getTime() < new Date(plan.now).getTime();
  const live = payments.filter(counts);
  const asked = payments.filter((payment) => payment.status === "refund-asked");
  const held = payments.filter((payment) => payment.status === "held" || payment.status === "refund-asked");
  const paidOut = payments.filter((payment) => payment.status === "paid-out");
  const sum = (list: InvitePayment[]) => list.reduce((total, payment) => total + payment.amountPence, 0);
  const open = Math.max(0, invite.places - live.length);
  const payout = plan.payoutOn ? formatDay(plan.payoutOn) : null;

  // The pill under the crumb: where the plan's money is.
  const state =
    held.length > 0
      ? over
        ? { label: "On its way", ink: true }
        : { label: "Held", ink: false }
      : paidOut.length > 0
        ? { label: "Paid out", ink: false, muted: true }
        : { label: "Refunded", ink: false, muted: true };

  const answer = (payment: InvitePayment, choice: RefundAnswer) => {
    const name = payment.payer.firstName;
    if (choice === "refund") {
      setPayments((all) =>
        all.map((entry) =>
          entry.id === payment.id
            ? {
                ...entry,
                status: "refunded" as const,
                refundAskedAt: null,
                refund: {
                  amountPence: entry.amountPence,
                  reason: "host-agreed" as const,
                  refundedAt: plan.now,
                  expectedBy: new Date(new Date(plan.now).getTime() + 14 * DAY).toISOString(),
                },
              }
            : entry,
        ),
      );
      setSaid(`${name} was refunded ${gbp(payment.amountPence)}.`);
    } else {
      setPayments((all) =>
        all.map((entry) => (entry.id === payment.id ? { ...entry, status: "held" as const, refundAskedAt: null } : entry)),
      );
      setSaid(`You kept ${name}’s ${gbp(payment.amountPence)}.`);
    }
    setSheet(null);
  };

  const rows: [string, string][] = [
    ["Paid so far", `${gbp(sum(live))} of ${gbp(invite.places * price)}`],
    ["Held for you", gbp(sum(held))],
    [
      "You’re paid",
      asked.length > 0
        ? "Depends on your answer"
        : held.length > 0
          ? payout
            ? `About ${payout}`
            : "About 2 working days after the plan"
          : paidOut.length > 0
            ? "Paid out"
            : "Nothing to pay out",
    ],
  ];

  const money: { icon: "banknote" | "undo" | "check"; text: ReactNode }[] = [];
  if (asked.length > 0) {
    const first = asked[0].payer.firstName;
    money.push({
      icon: "banknote",
      text: `${gbp(sum(held))} is held by Club Yuppie until you answer. If you refund it, it goes back to ${first}’s card. If you keep it, it comes to you about ${payout ?? "2 working days after the plan"}.`,
    });
  } else if (held.length > 0) {
    money.push({
      icon: "banknote",
      text: `${gbp(sum(held))} is held by Club Yuppie. It goes to your bank about 2 working days after the plan${payout ? `, on ${payout}` : ""}.`,
    });
  } else if (paidOut.length > 0) {
    money.push({ icon: "check", text: `${gbp(sum(paidOut))} has gone to your bank.` });
  }
  const refunded = payments.filter((payment) => payment.status === "refunded");
  if (refunded.length > 0) {
    const names = joinNames(refunded.map((payment) => payment.payer.firstName));
    money.push({
      icon: "undo",
      text:
        held.length + paidOut.length > 0
          ? `${names} ${refunded.length > 1 ? "were" : "was"} refunded ${gbp(sum(refunded))}, so that is not part of your payout.`
          : `${names} ${refunded.length > 1 ? "were" : "was"} refunded in full, so there is no payout.`,
    });
  }

  return (
    <Main className="pay-subpage">
      <BackRow href={ROUTES.youPayments} label="Payments" />
      <div className="mk-wrap pay-crumbwrap">
        <div className="pay-crumb">
          <BackLink href={ROUTES.youPayments} label="Payments" />
        </div>
      </div>
      <div className="mk-wrap pay-dh">
        <div className="pay-pills">
          <Pill kind={state.muted ? "muted" : state.ink ? "ink" : "outline"}>{state.label}</Pill>
          <Pill>{gbp(price)} each</Pill>
        </div>
        <h1 className="pay-dh1">{invite.title}</h1>
        <p className="pay-dmeta">
          {formatWhen(invite.startsAt)} · {invite.where}
        </p>
      </div>
      <div className="mk-wrap">
        <div className="pay-dgrid">
          <div>
            <Card className="pay-dsum">
              {rows.map(([label, value]) => (
                <Kv key={label} label={label} value={value} />
              ))}
            </Card>
            <MoneyList className="pay-dmoney" items={money} />
          </div>
          <div>
            <section className="mk-section">
              <div className="mk-sh">
                <h2 className="mk-h2">Who paid</h2>
                <span className="pay-meta">
                  {live.length} of {invite.places} {invite.places === 1 ? "place" : "places"}
                </span>
              </div>
              <div className="mk-rows">
                {payments.map((payment) =>
                  payment.status === "refund-asked" ? (
                    <AskedRow
                      key={payment.id}
                      payment={payment}
                      onRefund={() => setSheet(payment)}
                      onKeep={() => answer(payment, "keep")}
                    />
                  ) : (
                    <PaidRow key={payment.id} payment={payment} />
                  ),
                )}
                {open > 0 && !over ? (
                  <div className="mk-row pay-prow2 is-open">
                    <span className="pay-seat is-s" style={cssVars({ "--s": "48px" })} aria-hidden="true" />
                    <span className="mk-body">
                      <span className="mk-title pay-quiet">
                        {open} {open === 1 ? "place" : "places"} open
                      </span>
                      <span className="mk-meta">{gbp(price)} when someone pays</span>
                    </span>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      </div>
      <p className="mk-sr" role="status">
        {said}
      </p>
      {sheet ? (
        <RefundSheet
          payment={sheet}
          title={invite.title}
          onClose={() => setSheet(null)}
          onRefund={() => answer(sheet, "refund")}
        />
      ) : null}
    </Main>
  );
}
