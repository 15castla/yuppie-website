"use client";

// You > Payments: the host's money. Kit counterpart: pages_pay.payments_main().
// Reached from You. Every paid plan with who paid and where the money is, in
// plain words, and the Get paid card (or one quiet line once it is ready).
//
//   full        ready and paid plans: the line, the three totals, the rows
//   attention   Stripe needs more info: the card says so and the payout is paused
//   new         nothing set up, no paid plans
//   review      Stripe is checking the details, no paid plans
//   empty       ready, no paid plans yet: the closing band with "Post an Open Invite"
//
// A view of HostPayments (lib/server/plan-payments.ts hostPayments). Live: Get
// paid goes to Stripe (components/members/payments/get-paid.tsx), the four
// statuses come from Stripe, and the page asks again when the host comes back.
// In the preview harness Get paid is demo state: "Done" on the outline of
// Stripe's screen marks it ready in that tab and releases a paused payout.
//
// needs_device_check: the Get paid hand-off sheet (web, app) and Stripe's outline screen (app).

import "@/components/members/invite/invite.css";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { BackLink, BackRow, Button, DateColumn, KitLink, Main, Pill, TitleBlock } from "@/components/members/kit";
import { InkDrawing } from "@/components/members/invite/ink-drawing";
import { dateColumn, formatDay, gbp } from "@/lib/members/invite/format";
import type { GetPaid, HostPaidPlan, HostPayments } from "@/lib/members/invite/types";
import { ROUTES, youPaymentsPlanHref } from "@/lib/members/routes";
import { GetPaidCard, GetPaidHandOff, GetPaidSlim, useGetPaidRefresh, type GetPaidMode } from "./get-paid";

/** Stripe's hosted onboarding and dashboard, through the members route that makes the link. */
const STRIPE_HREF = "/members/you/payments/stripe";
import { joinNames } from "./leave-sheets";

const STEPS = [
  "Members pay Club Yuppie when they say they’re in.",
  "Club Yuppie holds the money until the plan is over.",
  "About 2 working days after the plan, it goes to your bank.",
];

const PILL: Record<HostPaidPlan["status"], { label: string; kind: "outline" | "ink" | "muted"; warn?: boolean }> = {
  held: { label: "Held", kind: "outline" },
  "on-its-way": { label: "On its way", kind: "ink" },
  "paid-out": { label: "Paid out", kind: "muted" },
  refunded: { label: "Refunded", kind: "muted" },
  paused: { label: "Paused", kind: "outline", warn: true },
  asked: { label: "Asked", kind: "outline", warn: true },
};

function planLines(plan: HostPaidPlan): { who: string; when: string } {
  const who = plan.payersNote ?? `${joinNames(plan.payers)} paid ${gbp(plan.amountPence)}`;
  switch (plan.status) {
    case "held":
      return { who, when: plan.payoutOn ? `Out about ${formatDay(plan.payoutOn)}` : "Held until the plan is over" };
    case "on-its-way":
      return { who, when: plan.payoutOn ? `Due ${formatDay(plan.payoutOn)}` : "On its way to your bank" };
    case "paid-out":
      return { who, when: plan.paidOutOn ? `Paid out ${formatDay(plan.paidOutOn)}` : "Paid out" };
    case "refunded":
      return { who, when: "Refunded in full, so no payout" };
    case "paused":
      return { who, when: "Paused until you add the missing info" };
    case "asked":
      return { who, when: "Waiting for your answer" };
  }
}

function PlanRow({ plan }: { plan: HostPaidPlan }) {
  const { who, when } = planLines(plan);
  const pill = PILL[plan.status];
  const date = dateColumn(plan.startsAt);
  return (
    <KitLink href={youPaymentsPlanHref(plan.inviteId)} className="mk-row pay-prow">
      <DateColumn weekday={date.weekday} day={date.day} />
      <span className="mk-body">
        <span className="mk-title">{plan.title}</span>
        <span className="mk-meta">{who}</span>
        <span className="mk-meta pay-when">{when}</span>
      </span>
      <span className="mk-end pay-pend">
        <b>{gbp(plan.amountPence)}</b>
        <Pill kind={pill.kind} className={pill.warn ? "mk-warn" : undefined}>
          {pill.label}
        </Pill>
      </span>
    </KitLink>
  );
}

function Stats({ payments, paused }: { payments: HostPayments; paused: boolean }) {
  const cells = [
    { k: "Held", v: payments.heldPence, s: "until the plan" },
    { k: "On its way", v: payments.onItsWayPence, s: paused ? "paused" : "to your bank" },
    { k: "Paid out", v: payments.paidOutPence, s: "so far" },
  ];
  return (
    <div className="pay-stats">
      {cells.map((cell) => (
        <div className="c" key={cell.k}>
          <div className="k">{cell.k}</div>
          <div className="v">{gbp(cell.v)}</div>
          <div className="s">{cell.s}</div>
        </div>
      ))}
    </div>
  );
}

function HowBlock() {
  return (
    <div className="pay-how">
      <h2 className="mk-h2">How you get paid</h2>
      <ol>
        {STEPS.map((step, index) => (
          <li key={step}>
            <span className="mk-serif">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Crumb({ label }: { label: string }) {
  return (
    <div className="mk-wrap pay-crumbwrap">
      <div className="pay-crumb">
        <BackLink href={ROUTES.you} label={label} />
      </div>
    </div>
  );
}

export function PaymentsView({
  payments,
  initialMode = null,
  live = false,
  notice = null,
}: {
  payments: HostPayments;
  initialMode?: GetPaidMode;
  /** The real page (15 Nov 2026): Get paid goes to Stripe, and the page asks again when the host comes back. */
  live?: boolean;
  /** A line from the server: Stripe could not be reached. */
  notice?: string | null;
}) {
  const router = useRouter();
  const [demoGetPaid, setGetPaid] = useState<GetPaid>(payments.getPaid);
  const [mode, setMode] = useState<GetPaidMode>(initialMode);
  // Live: the server's Get paid, fresh on every refresh; the harness keeps its own.
  const getPaid = live ? payments.getPaid : demoGetPaid;
  const refresh = useCallback(() => router.refresh(), [router]);
  useGetPaidRefresh(refresh, live);

  const ready = getPaid.status === "ready";
  // A paused payout is released once Get paid is ready (demo: the host pressed Done).
  const plans = payments.plans.map((plan) =>
    plan.status === "paused" && ready ? { ...plan, status: "on-its-way" as const } : plan,
  );
  const paused = !ready && getPaid.paused !== null;
  const hasPlans = plans.length > 0;
  const demoReady: GetPaid = { status: "ready", accountEnding: getPaid.accountEnding ?? "4321", paused: null };

  const handOff = (
    <GetPaidHandOff mode={mode} onMode={setMode} onDone={() => setGetPaid(demoReady)} stripeHref={live ? STRIPE_HREF : undefined} />
  );
  const head = (
    <>
      <BackRow href={ROUTES.you} label="Profile" />
      <Crumb label="Profile" />
      <TitleBlock title="Payments." sub="Money from your paid plans." actions={null} />
      {notice ? (
        <div className="mk-wrap">
          <p className="pay-notice" role="status">
            {notice}
          </p>
        </div>
      ) : null}
    </>
  );

  if (!hasPlans && ready) {
    return (
      <Main className="pay-subpage is-fill">
        {head}
        <div className="mk-wrap pay-slimwrap">
          <GetPaidSlim onManage={() => setMode("stripe")} />
        </div>
        <section className="mk-band pay-eband" aria-label="No paid plans">
          <div className="mk-wrap">
            <div className="pay-ein">
              <div className="pay-ew">
                <h2 className="pay-eh">
                  No paid plans <span className="mk-serif">yet.</span>
                </h2>
                <p className="mk-lead">
                  Add a cost when you post a plan, like for spare tickets. Who paid and when you’re paid shows up here.
                </p>
                <div className="pay-eact">
                  <Button href={ROUTES.openInviteNew} blockPhone>
                    Post an Open Invite
                  </Button>
                </div>
              </div>
              <div className="pay-ea">
                <InkDrawing name="coupes" w={170} line={2} />
              </div>
            </div>
          </div>
        </section>
        {handOff}
      </Main>
    );
  }

  const card = ready ? <GetPaidSlim onManage={() => setMode("stripe")} /> : <GetPaidCard getPaid={getPaid} onMode={setMode} />;

  if (!hasPlans) {
    const none =
      getPaid.status === "in-review"
        ? "Nothing here yet. You can add a cost to a plan as soon as Stripe has checked your details."
        : "Nothing here yet. Plans with a cost show up here, with who paid and when you’re paid.";
    return (
      <Main className="pay-subpage">
        {head}
        <div className="mk-wrap">
          <div className="pay-cols">
            <div className="pay-main-col">
              <section className="mk-section">
                <div className="mk-sh">
                  <h2 className="mk-h2">Paid plans</h2>
                </div>
                <p className="pay-none">{none}</p>
              </section>
              <section className="mk-section">
                <HowBlock />
              </section>
            </div>
            <div className="pay-slot">{card}</div>
          </div>
        </div>
        {handOff}
      </Main>
    );
  }

  return (
    <Main className="pay-subpage">
      {head}
      <div className="mk-wrap">
        <div className="pay-cols">
          <div className="pay-main-col">
            <section className="mk-section">
              <Stats payments={payments} paused={paused} />
            </section>
            <section className="mk-section">
              <div className="mk-sh">
                <h2 className="mk-h2">Paid plans</h2>
                <span className="pay-meta">
                  {plans.length} {plans.length === 1 ? "plan" : "plans"}
                </span>
              </div>
              <div className="mk-rows">
                {plans.map((plan) => (
                  <PlanRow key={plan.inviteId} plan={plan} />
                ))}
              </div>
            </section>
          </div>
          <div className="pay-slot">
            {card}
            <div className="pay-rail-how mk-show-desk">
              <HowBlock />
            </div>
          </div>
        </div>
      </div>
      <div className="mk-wrap pay-how-phone mk-show-phone">
        <HowBlock />
      </div>
      {handOff}
    </Main>
  );
}
