"use client";

// You > Payments: the host's money. Kit counterpart: pages_pay.payments_main().
// Reached from You. Every paid plan with who paid and where the money is, in
// plain words.
//
// Since 16 Nov 2026 (Albert: "the vinted way"): a host needs nothing set up to
// add a price. Once a plan is over its money is theirs, and the "Your money"
// card offers two buttons: Add to my credit (Club Yuppie credit at once, spent
// on events and Open Invites, never turned back into cash) and Withdraw to my
// bank (Get paid first: Stripe checks it's them, then it goes to their bank).
// Get paid's card shows only once it is started.
//
//   full        paid plans: the money card (when some is theirs), the totals, the rows
//   empty       no paid plans: the closing band with "Post an Open Invite"
//
// A view of HostPayments (lib/server/plan-payments.ts hostPayments). Live: the
// buttons are the server's (app/members/you/payments/actions.ts) and Get paid
// goes to Stripe (components/members/payments/get-paid.tsx). In the preview
// harness both buttons only change what the tab shows.
//
// needs_device_check: the money sheets and the Get paid hand-off (web, app) and Stripe's outline screen (app).

import "@/components/members/invite/invite.css";

import { useCallback, useId, useState } from "react";
import { useRouter } from "next/navigation";

import { BackLink, BackRow, Button, Card, DateColumn, Icon, KitLink, Main, Pill, TitleBlock } from "@/components/members/kit";
import { InkDrawing } from "@/components/members/invite/ink-drawing";
import { Sheet } from "@/components/members/invite/sheet";
import { goToSessionEnded, isSessionEnded } from "@/components/members/session-ended";
import { dateColumn, formatDay, gbp } from "@/lib/members/invite/format";
import type { GetPaid, HostPaidPlan, HostPayments } from "@/lib/members/invite/types";
import { ROUTES, youPaymentsPlanHref } from "@/lib/members/routes";
import { addMoneyToCreditAction, withdrawMoneyAction, type MoneyAnswer } from "@/app/members/you/payments/actions";
import { GetPaidCard, GetPaidHandOff, GetPaidSlim, useGetPaidRefresh, type GetPaidMode } from "./get-paid";
import { MoneyList, PayActions, PayHead, PayMark } from "./pay-parts";
import { joinNames } from "./leave-sheets";

/** Stripe's hosted onboarding and dashboard, through the members route that makes the link. */
const STRIPE_HREF = "/members/you/payments/stripe";

const STEPS = [
  "Members pay Club Yuppie when they say they’re in.",
  "Club Yuppie holds the money until the plan is over.",
  "Then it’s yours: add it to your credit, or withdraw it to your bank.",
];

const PILL: Record<HostPaidPlan["status"], { label: string; kind: "outline" | "ink" | "muted"; warn?: boolean }> = {
  held: { label: "Held", kind: "outline" },
  asked: { label: "Asked", kind: "outline", warn: true },
  ready: { label: "Yours", kind: "ink" },
  credited: { label: "To credit", kind: "muted" },
  "on-its-way": { label: "On its way", kind: "ink" },
  "paid-out": { label: "Withdrawn", kind: "muted" },
  refunded: { label: "Refunded", kind: "muted" },
};

function planLines(plan: HostPaidPlan): { who: string; when: string } {
  const who = plan.payersNote ?? `${joinNames(plan.payers)} paid ${gbp(plan.amountPence)}`;
  switch (plan.status) {
    case "held":
      return { who, when: plan.payoutOn ? `Yours from ${formatDay(plan.payoutOn)}` : "Held until the plan is over" };
    case "asked":
      return { who, when: "Waiting for your answer" };
    case "ready":
      return { who, when: "Yours: add it to your credit or withdraw it" };
    case "credited":
      return { who, when: "Added to your credit" };
    case "on-its-way":
      return { who, when: plan.payoutOn ? `In your bank about ${formatDay(plan.payoutOn)}` : "On its way to your bank" };
    case "paid-out":
      return { who, when: plan.paidOutOn ? `Withdrawn, in your bank ${formatDay(plan.paidOutOn)}` : "Withdrawn to your bank" };
    case "refunded":
      return { who, when: "Refunded in full" };
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

function Stats({ payments }: { payments: HostPayments }) {
  const cells = [
    { k: "Held", v: payments.heldPence, s: "until the plan" },
    { k: "Yours", v: payments.readyPence, s: "to add or withdraw" },
    { k: "Credit", v: payments.creditBalancePence, s: "to spend" },
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

/** "Your money": what is the host's now, and the two ways to take it (16 Nov 2026). */
function MoneyCard({ pence, onCredit, onWithdraw }: { pence: number; onCredit: () => void; onWithdraw: () => void }) {
  return (
    <Card className="pay-gp pay-money-card" data-state="ready">
      <div className="pay-gp-top">
        <span className="mk-term">Your money</span>
      </div>
      <h3 className="pay-gp-h">{gbp(pence)} is yours.</h3>
      <p className="pay-gp-p">From your plans that are over. Add it to your Club Yuppie credit to spend on events and Open Invites, or withdraw it to your bank.</p>
      <div className="pay-gp-act pay-money-act">
        <Button block onClick={onCredit}>
          Add to my credit
        </Button>
        <Button block variant="outline" onClick={onWithdraw}>
          Withdraw to my bank
        </Button>
      </div>
      <p className="pay-gp-fine">Credit can’t be turned back into cash. Withdrawing needs Get paid, so Stripe can check it’s you.</p>
    </Card>
  );
}

type MoneySheet =
  | { kind: "credit" | "withdraw"; state: "ask" | "busy" }
  | { kind: "credit"; state: "done"; pence: number; balance: number }
  | { kind: "withdraw"; state: "done"; pence: number; arriveBy: string; failedPence: number }
  | { kind: "credit" | "withdraw"; state: "error"; error: string };

/** The two money sheets: ask, then what happened. */
function MoneySheetView({
  sheet,
  pence,
  getPaid,
  onConfirm,
  onClose,
}: {
  sheet: MoneySheet;
  pence: number;
  getPaid: GetPaid;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const busy = sheet.state === "busy";
  let body;
  if (sheet.state === "done" && sheet.kind === "credit") {
    body = (
      <>
        <PayMark icon="check" />
        <PayHead id={id} title={`${gbp(sheet.pence)} added to your credit.`} />
        <p className="pay-p">You have {gbp(sheet.balance)} of credit to spend on Club events and Open Invite places. It comes off what you pay first.</p>
        <PayActions>
          <Button block onClick={onClose}>
            Done
          </Button>
        </PayActions>
      </>
    );
  } else if (sheet.state === "done" && sheet.kind === "withdraw") {
    body = (
      <>
        <PayMark icon="check" />
        <PayHead id={id} title={`${gbp(sheet.pence)} is on its way.`} />
        <p className="pay-p">
          It should reach your bank by {formatDay(sheet.arriveBy)}. Your first withdrawal can take up to a week while Stripe sets things up.
          {sheet.failedPence ? ` ${gbp(sheet.failedPence)} didn’t go through: it’s still yours to try again.` : ""}
        </p>
        <PayActions>
          <Button block onClick={onClose}>
            Done
          </Button>
        </PayActions>
      </>
    );
  } else if (sheet.state === "error") {
    body = (
      <>
        <PayMark icon="circle-alert" tone="bad" />
        <PayHead id={id} title="That didn’t go through." />
        <p className="pay-p">{sheet.error}</p>
        <PayActions>
          <Button block onClick={onClose}>
            Close
          </Button>
        </PayActions>
      </>
    );
  } else if (sheet.kind === "credit") {
    body = (
      <>
        <PayHead id={id} title={`Add ${gbp(pence)} to your credit?`} onClose={onClose} closeOff={busy} />
        <MoneyList
          items={[
            { icon: "gift", text: "Spend it on Club events and Open Invite places. It comes off what you pay first." },
            { icon: "info", text: "Credit can’t be withdrawn to your bank later. To have the money in your bank instead, choose Withdraw." },
          ]}
        />
        <PayActions>
          <Button block data-needs-net="" pending={busy} onClick={busy ? undefined : onConfirm}>
            {busy ? "Adding…" : `Add ${gbp(pence)} to my credit`}
          </Button>
          <Button block variant="outline" disabled={busy} onClick={onClose}>
            Not now
          </Button>
        </PayActions>
      </>
    );
  } else {
    body = (
      <>
        <PayHead id={id} title={`Withdraw ${gbp(pence)} to your bank?`} onClose={onClose} closeOff={busy} />
        <MoneyList
          items={[
            {
              icon: "landmark",
              text: getPaid.accountEnding ? (
                <>
                  It goes to the account ending <b>{getPaid.accountEnding}</b>, usually in 2 working days.
                </>
              ) : (
                "It goes to the bank account you gave Stripe, usually in 2 working days."
              ),
            },
          ]}
        />
        <PayActions>
          <Button block data-needs-net="" pending={busy} onClick={busy ? undefined : onConfirm}>
            {busy ? "Withdrawing…" : `Withdraw ${gbp(pence)}`}
          </Button>
          <Button block variant="outline" disabled={busy} onClick={onClose}>
            Not now
          </Button>
        </PayActions>
      </>
    );
  }
  return (
    <Sheet labelledBy={id} onClose={onClose} dismissable={!busy} variant="pay">
      {body}
    </Sheet>
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
  payments: initial,
  initialMode = null,
  live = false,
  notice = null,
}: {
  payments: HostPayments;
  initialMode?: GetPaidMode;
  /** The real page (15 Nov 2026): the buttons and Get paid are the server's, and the page asks again when the host comes back. */
  live?: boolean;
  /** A line from the server: Stripe could not be reached. */
  notice?: string | null;
}) {
  const router = useRouter();
  // The harness keeps its own copy (its buttons change only this tab); live, the server's answer replaces it.
  const [answered, setAnswered] = useState<HostPayments | null>(null);
  const payments = answered ?? initial;
  const [demoGetPaid, setGetPaid] = useState<GetPaid>(initial.getPaid);
  const [mode, setMode] = useState<GetPaidMode>(initialMode);
  const [sheet, setSheet] = useState<MoneySheet | null>(null);
  // Live: the server's Get paid, fresh on every refresh; the harness keeps its own.
  const getPaid = live ? initial.getPaid : demoGetPaid;
  const refresh = useCallback(() => {
    setAnswered(null);
    router.refresh();
  }, [router]);
  useGetPaidRefresh(refresh, live);

  const ready = getPaid.status === "ready";
  const plans = payments.plans;
  const hasPlans = plans.length > 0;
  const yours = payments.readyPence;
  const demoReady: GetPaid = { status: "ready", accountEnding: getPaid.accountEnding ?? "4321", paused: null };

  const handOff = (
    <GetPaidHandOff mode={mode} onMode={setMode} onDone={() => setGetPaid(demoReady)} stripeHref={live ? STRIPE_HREF : undefined} />
  );

  const openWithdraw = () => {
    // Withdrawing needs Get paid: not started, its hand-off; started but not done, Stripe again.
    if (!ready) {
      setMode(getPaid.status === "not-set-up" ? "intro" : "stripe");
      return;
    }
    setSheet({ kind: "withdraw", state: "ask" });
  };

  const apply = (kind: "credit" | "withdraw", result: MoneyAnswer | Awaited<ReturnType<typeof addMoneyToCreditAction>>) => {
    if (isSessionEnded(result)) return goToSessionEnded();
    if ("payments" in result) setAnswered(result.payments);
    if (result.ok) {
      if (kind === "credit") setSheet({ kind, state: "done", pence: result.pence, balance: result.payments.creditBalancePence });
      else setSheet({ kind, state: "done", pence: result.pence, arriveBy: result.arriveBy ?? new Date().toISOString(), failedPence: result.failedPence ?? 0 });
      return;
    }
    if ("kind" in result && result.kind === "get-paid") {
      setSheet(null);
      setMode(result.status === "not-set-up" ? "intro" : "stripe");
      return;
    }
    setSheet({ kind, state: "error", error: result.error });
  };

  const confirm = async () => {
    if (!sheet || sheet.state !== "ask") return;
    const kind = sheet.kind;
    setSheet({ kind, state: "busy" });
    if (!live) {
      // The harness: the money moves in this tab only.
      const next: HostPayments =
        kind === "credit"
          ? { ...payments, readyPence: 0, creditedPence: payments.creditedPence + yours, creditBalancePence: payments.creditBalancePence + yours, plans: plans.map((p) => (p.status === "ready" ? { ...p, status: "credited" as const } : p)) }
          : { ...payments, readyPence: 0, onItsWayPence: payments.onItsWayPence + yours, plans: plans.map((p) => (p.status === "ready" ? { ...p, status: "on-its-way" as const } : p)) };
      setAnswered(next);
      setSheet(
        kind === "credit"
          ? { kind, state: "done", pence: yours, balance: next.creditBalancePence }
          : { kind, state: "done", pence: yours, arriveBy: new Date(Date.now() + 2 * 86_400_000).toISOString(), failedPence: 0 },
      );
      return;
    }
    try {
      apply(kind, kind === "credit" ? await addMoneyToCreditAction() : await withdrawMoneyAction());
    } catch {
      setSheet({ kind, state: "error", error: "That didn’t go through. Try again in a moment." });
    }
  };

  const moneySheet = sheet ? (
    <MoneySheetView sheet={sheet} pence={yours} getPaid={getPaid} onConfirm={() => void confirm()} onClose={() => setSheet(null)} />
  ) : null;

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

  // Get paid shows once it is started (nobody needs it before they withdraw): the quiet line when ready.
  const getPaidBlock = ready ? (
    <GetPaidSlim onManage={() => setMode("stripe")} />
  ) : getPaid.status !== "not-set-up" ? (
    <GetPaidCard getPaid={getPaid} onMode={setMode} />
  ) : null;

  if (!hasPlans) {
    return (
      <Main className="pay-subpage is-fill">
        {head}
        {getPaidBlock || payments.creditBalancePence ? (
          <div className="mk-wrap pay-slimwrap">
            {getPaidBlock}
            {payments.creditBalancePence ? (
              <p className="pay-none">
                <Icon name="gift" size={18} /> You have {gbp(payments.creditBalancePence)} of Club Yuppie credit to spend.
              </p>
            ) : null}
          </div>
        ) : null}
        <section className="mk-band pay-eband" aria-label="No paid plans">
          <div className="mk-wrap">
            <div className="pay-ein">
              <div className="pay-ew">
                <h2 className="pay-eh">
                  No paid plans <span className="mk-serif">yet.</span>
                </h2>
                <p className="mk-lead">
                  Add a cost when you post a plan, like for spare tickets. Who paid, and your money once the plan is over, shows up here.
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
        {moneySheet}
      </Main>
    );
  }

  const slot =
    yours > 0 || getPaidBlock ? (
      <div className="pay-slot">
        {yours > 0 ? <MoneyCard pence={yours} onCredit={() => setSheet({ kind: "credit", state: "ask" })} onWithdraw={openWithdraw} /> : null}
        {getPaidBlock}
        <div className="pay-rail-how mk-show-desk">
          <HowBlock />
        </div>
      </div>
    ) : (
      <div className="pay-slot mk-show-desk">
        <div className="pay-rail-how">
          <HowBlock />
        </div>
      </div>
    );

  return (
    <Main className="pay-subpage">
      {head}
      <div className="mk-wrap">
        <div className="pay-cols">
          <div className="pay-main-col">
            <section className="mk-section">
              <Stats payments={payments} />
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
          {slot}
        </div>
      </div>
      <div className="mk-wrap pay-how-phone mk-show-phone">
        <HowBlock />
      </div>
      {handOff}
      {moneySheet}
    </Main>
  );
}
