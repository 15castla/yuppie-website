// Preview screens for Open Invite (browse, post, edit, plan page, Yours) and the paid-plan screens. OWNED BY THE OPEN INVITE BUILDER.
// One id per screen: "invite-<name>" for Open Invite and "pay-<name>" for the paid plans.
// EXAMPLE CONTENT: every person, place and plan comes from lib/members/mock/open-invite.ts. The buttons answer
// from those examples (components/members/invite/preview.tsx InvitePreview: stand-ins for the server actions,
// nothing is read or written), so a screen can be pressed through here with no login and no database.
//
// Plan-page states and the sheets drawn over them use the same plan for the
// same state as the approved designs (pages_oi.py): open and full on "Padel,
// then pizza", in on "Saturday morning class + brunch", own on "Climbing and
// a pint", cancelled on "Gallery late and a drink", past on "Saturday spin".

import "@/components/members/invite/invite.css";

import type { ReactNode } from "react";

import {
  OpenInviteError,
  OpenInviteLoading,
  OpenInviteView,
} from "@/components/members/invite/browse-view";
import { InviteCard } from "@/components/members/invite/invite-card";
import { valuesOf } from "@/components/members/invite/form-values";
import { PlanLoading, PlanView } from "@/components/members/invite/plan-view";
import { InvitePreview } from "@/components/members/invite/preview";
import { askedForRefund, cancelled } from "@/components/members/invite/preview-state";
import { PostedView, PostLoading, PostView, type PostErrors, type PostValues } from "@/components/members/invite/post-view";
import type { Moment } from "@/components/members/invite/use-moments";
import { YoursLoading, YoursView } from "@/components/members/invite/yours-view";
import { GetPaidBoard } from "@/components/members/payments/get-paid";
import { PaymentsView } from "@/components/members/payments/payments-view";
import { PlanPaymentsView } from "@/components/members/payments/plan-payments-view";
import { ReceiptView } from "@/components/members/payments/receipt-view";
import { COST_ERROR, type CostValues } from "@/lib/members/invite/cost";
import { examplePhoto } from "@/lib/members/mock/example-photos";
import {
  EXAMPLE_FEED,
  EXAMPLE_INVITES as P,
  EXAMPLE_NOW,
  EXAMPLE_PEOPLE,
  EXAMPLE_YOURS,
  SAM,
  TOM_POLO_PAYMENT,
} from "@/lib/members/mock/open-invite";
import { EXAMPLE_HOST_PAYMENTS, EXAMPLE_PLAN_PAYMENTS, EXAMPLE_RECEIPTS } from "@/lib/members/mock/payments";
import type { InviteMember, NewOpenInviteContext, OpenInvite, OpenInvitePage } from "@/lib/members/invite/types";
import type { PreviewParams, PreviewScreen } from "./types";

const FLAGS = ["openInvite", "messages"] as const;

const CONTEXT: NewOpenInviteContext = {
  me: SAM,
  getPaid: { status: "ready", accountEnding: "4321", paused: null },
  today: "2026-10-25",
  now: EXAMPLE_NOW,
};

const page = (invite: OpenInvite): OpenInvitePage => ({ invite, me: SAM, now: EXAMPLE_NOW });
/** A screen whose buttons answer from these example plans. */
const withPlans = (plans: OpenInvite[], node: ReactNode) => (
  <InvitePreview plans={plans} me={SAM} now={EXAMPLE_NOW}>
    {node}
  </InvitePreview>
);

// ---- long text: the longest name and title the product allows (oi-edge-long-*)
const LONG_NAME = "Maria-Alexandra Van Der Westhuizen-Smith";
const LONG_TITLE = "Early swim at the lido, then a slow breakfast out";
const longHost: InviteMember = { id: "long-host", firstName: LONG_NAME, photoUrl: examplePhoto("M") };
const LONG_PLANS: OpenInvite[] = [
  {
    ...P.fiveKm,
    id: "long-1",
    title: LONG_TITLE,
    where: "Calder Park Lido and the café opposite",
    startsAt: "2026-10-31T07:30:00Z",
    places: 12,
    host: longHost,
    going: [
      longHost,
      EXAMPLE_PEOPLE.PRIYA,
      EXAMPLE_PEOPLE.TOM,
      EXAMPLE_PEOPLE.MARCUS,
      EXAMPLE_PEOPLE.AISHA,
      EXAMPLE_PEOPLE.DAN,
      EXAMPLE_PEOPLE.CHLOE,
    ],
  },
  {
    ...P.saturdayClass,
    id: "long-2",
    title: "Sunday market walk, then lunch",
    where: "Calder Park",
    startsAt: "2026-11-01T11:00:00Z",
    places: 12,
    host: longHost,
    going: [longHost, SAM],
    you: { ...P.saturdayClass.you, unreadInChat: 12 },
  },
];

// the longest paid card: £149.50, a two-line title, a 40-character name, 12 places (oi-cards-paid-long)
const LONG_PAID: OpenInvite = {
  ...P.fiveKm,
  id: "long-paid",
  title: LONG_TITLE,
  where: "Calder Park",
  places: 12,
  host: longHost,
  going: [longHost, EXAMPLE_PEOPLE.PRIYA, EXAMPLE_PEOPLE.TOM, EXAMPLE_PEOPLE.MARCUS, EXAMPLE_PEOPLE.AISHA, EXAMPLE_PEOPLE.DAN, EXAMPLE_PEOPLE.CHLOE],
  cost: { pricePence: 14950, faceValueConfirmed: true },
};
// the plan page with the longest title and name (oi-edge-long-invite)
const LONG_PAGE_PLAN: OpenInvite = {
  ...P.fiveKm,
  id: "long-page",
  title: LONG_TITLE,
  host: longHost,
  going: [longHost, EXAMPLE_PEOPLE.OLLIE, EXAMPLE_PEOPLE.PRIYA, EXAMPLE_PEOPLE.DAN],
};

// ---- the plan page: one plan per state
type PlanCase = { invite: OpenInvite; moment?: Moment; pending?: boolean };
const sheetOn = (invite: OpenInvite, kind: Moment["kind"]): PlanCase => ({
  invite,
  moment: { kind, id: invite.id } as Moment,
});

const PLAN_CASES: Record<string, PlanCase> = {
  open: { invite: P.padelPizza },
  pending: { invite: P.padelPizza, pending: true },
  asked: { invite: P.padelAsked },
  in: { invite: P.saturdayClass },
  full: { invite: P.padelFull },
  own: { invite: P.climbing },
  cancelled: { invite: P.galleryCancelled },
  past: { invite: P.spin },
  long: { invite: LONG_PAGE_PLAN },
  // paid plans (the paid plans flag): the plan page in every money state
  "paid-open": { invite: P.comedy },
  "paid-in": { invite: P.comedyPaid },
  "paid-full": { invite: P.comedyFull },
  "paid-own": { invite: P.polo },
  "paid-cancelled": { invite: P.comedyCancelled },
  // the "I'm in" moments (oi-moments)
  joined: sheetOn(P.saturdayClass, "joined"),
  withdraw: sheetOn(P.saturdayClass, "withdraw"),
  report: sheetOn(P.padelPizza, "report"),
  "report-sent": sheetOn(P.padelPizza, "report-sent"),
  taken: sheetOn(P.padelPizza, "taken"),
  cancel: sheetOn(P.climbing, "cancel"),
  "cancel-done": sheetOn(P.climbing, "cancelled"),
  // the server said no (not drawn: the server's own words and Done)
  refused: { invite: P.padelPizza, moment: { kind: "refused", id: P.padelPizza.id, message: "This plan has started." } },
  "refused-network": { invite: P.padelPizza, moment: { kind: "refused", id: P.padelPizza.id, message: "That didn’t go through. Try again in a moment." } },
};

// ---- the post form
const FILLED: Partial<PostValues> = {
  title: "Climbing and a pint",
  type: "Sport",
  date: "2026-11-04",
  time: "18:30",
  where: "The Boulder Yard",
  places: 4,
  hostGoing: true,
  note: "Beginners welcome, shoes can be hired at the desk.",
};
const ERRORS: PostErrors = {
  title: "Add a title, a few words is fine.",
  type: "Pick a type so people can find it.",
  date: "Pick a date from today.",
  where: "Say where you’re meeting.",
};

// ---- the post form with a cost (the paid polo example of oi-post-cost)
const PAID_FILLED: Partial<PostValues> = {
  title: "Polo match, two spare tickets",
  type: "Sport",
  date: "2026-11-14",
  time: "14:00",
  where: "Hartley Polo Grounds",
  places: 2,
  hostGoing: false,
  note: "Two seats together, at face value. Tickets are on your phone.",
};
const costOn = (patch: Partial<CostValues> = {}): Partial<PostValues> => ({
  ...PAID_FILLED,
  cost: { on: true, price: "40", tick: true, ...patch },
});
const getPaidContext = (status: "not-set-up" | "needs-info" | "in-review" | "ready"): NewOpenInviteContext => ({
  ...CONTEXT,
  getPaid: { status, accountEnding: status === "ready" ? "4321" : null, paused: null },
});
const POST_COST_STATES = [
  "cost-off",
  "cost-new",
  "cost-ready",
  "cost-needs-info",
  "cost-review",
  "cost-blank",
  "cost-zero",
  "cost-high",
  "cost-untick",
  "cost-getpaid",
  "getpaid-sheet",
  "getpaid-stripe",
] as const;

// ---- paid plans: the plan page with a pay, leave or cancel sheet open (the underlay is the real plan page)
const PAY_FLAGS = ["openInvite", "messages", "paidPlans"] as const;
const PAY_PAGE_FLAGS = ["openInvite", "paidPlans"] as const;
// A second payer needs her own payment id and receipt number (Tom's are pay-0418 and 0418): two rows with one id share a React key.
const PRIYA_POLO_PAYMENT = {
  ...TOM_POLO_PAYMENT,
  id: "pay-0419",
  receiptNumber: "0419",
  payer: EXAMPLE_PEOPLE.PRIYA,
  paidAt: "2026-10-25T10:05:00Z",
};
const POLO_TWO: OpenInvite = {
  ...P.polo,
  id: "polo-match-two",
  going: [EXAMPLE_PEOPLE.TOM, EXAMPLE_PEOPLE.PRIYA],
  you: {
    ...P.polo.you,
    hostMoney: { payments: [TOM_POLO_PAYMENT, PRIYA_POLO_PAYMENT], payoutOn: "2026-11-17T09:00:00Z", getPaid: "ready" },
  },
};
// The paid plan the moment it is posted (invite-post / done-paid): the same title and cost, and nobody in it, nobody who has paid, nobody who has asked.
// What the real form builds (previewInvite in post-view.tsx), so the card reads "2 places open" and shows no money line.
const POLO_POSTED: OpenInvite = {
  ...P.polo,
  going: [],
  you: { ...P.polo.you, questions: [], hostMoney: null },
};
const POLO_CANCELLED: OpenInvite = cancelled(P.polo, EXAMPLE_NOW);
const POLO_TWO_CANCELLED: OpenInvite = cancelled(POLO_TWO, EXAMPLE_NOW);
const PAY_STATES = ["ready", "paying", "declined", "bank", "bank-screen", "full", "full-refunded", "price", "hold-expired", "success", "load-error"] as const;
type PayStateName = (typeof PAY_STATES)[number];
const LEAVE_CASES: Record<string, PlanCase> = {
  full: { invite: P.comedyPaid, moment: { kind: "leave", id: P.comedyPaid.id, timing: "full" } },
  late: { invite: P.comedyPaid, moment: { kind: "leave", id: P.comedyPaid.id, timing: "late" } },
  left: { invite: P.comedyLeft, moment: { kind: "left", id: P.comedyLeft.id } },
  asked: { invite: askedForRefund(P.comedyPaid, EXAMPLE_NOW), moment: { kind: "asked", id: P.comedyPaid.id } },
  "cancel-one": { invite: P.polo, moment: { kind: "cancel", id: P.polo.id } },
  "cancel-two": { invite: POLO_TWO, moment: { kind: "cancel", id: POLO_TWO.id } },
  "cancel-done": { invite: POLO_CANCELLED, moment: { kind: "cancelled", id: POLO_CANCELLED.id } },
  "cancel-done-two": { invite: POLO_TWO_CANCELLED, moment: { kind: "cancelled", id: POLO_TWO_CANCELLED.id } },
};
const planWith = (entry: PlanCase) =>
  withPlans(
    [entry.invite],
    <PlanView page={page(entry.invite)} paidPlans initialMoment={entry.moment ?? null} initialPendingId={entry.pending ? entry.invite.id : null} />,
  );

// ---- the screens, by state
function browseScreen({ state, flags }: PreviewParams): ReactNode {
  const paidPlans = flags.paidPlans;
  switch (state) {
    case "pending":
      return <OpenInviteView feed={EXAMPLE_FEED} paidPlans={paidPlans} initialPendingId={P.sundayWalk.id} />;
    case "filter":
      return <OpenInviteView feed={EXAMPLE_FEED} paidPlans={paidPlans} initialFilter="Food and drink" />;
    case "empty":
      return <OpenInviteView feed={{ ...EXAMPLE_FEED, invites: [], yoursCount: 0 }} paidPlans={paidPlans} />;
    case "loading":
      return <OpenInviteLoading />;
    case "error":
      return <OpenInviteError />;
    case "long":
      return <OpenInviteView feed={{ ...EXAMPLE_FEED, invites: LONG_PLANS }} paidPlans={paidPlans} />;
    case "long-paid":
      return <OpenInviteView feed={{ ...EXAMPLE_FEED, invites: [LONG_PAID, ...LONG_PLANS] }} paidPlans />;
    case "joined":
      return (
        <OpenInviteView
          feed={EXAMPLE_FEED}
          paidPlans={paidPlans}
          initialMoment={{ kind: "joined", id: P.saturdayClass.id }}
        />
      );
    case "taken":
      return (
        <OpenInviteView
          feed={EXAMPLE_FEED}
          paidPlans={paidPlans}
          initialMoment={{ kind: "taken", id: P.padelPizza.id }}
        />
      );
    default:
      return <OpenInviteView feed={EXAMPLE_FEED} paidPlans={paidPlans} />;
  }
}

function yoursScreen({ state, flags }: PreviewParams): ReactNode {
  switch (state) {
    case "empty":
      return <YoursView yours={{ ...EXAMPLE_YOURS, posted: [], joined: [], past: [], yoursCount: 0 }} paidPlans={flags.paidPlans} />;
    case "past-only":
      return <YoursView yours={{ ...EXAMPLE_YOURS, posted: [], joined: [], yoursCount: 0 }} paidPlans={flags.paidPlans} />;
    case "loading":
      return <YoursLoading />;
    default:
      return <YoursView yours={EXAMPLE_YOURS} paidPlans={flags.paidPlans} />;
  }
}

function postScreen({ state, flags }: PreviewParams): ReactNode {
  switch (state) {
    case "filled":
      return <PostView context={CONTEXT} paidPlans={flags.paidPlans} initial={FILLED} />;
    case "errors":
      return <PostView context={CONTEXT} paidPlans={flags.paidPlans} initialErrors={ERRORS} />;
    case "pending":
      return <PostView context={CONTEXT} paidPlans={flags.paidPlans} initial={FILLED} initialPosting />;
    case "server-error":
      return <PostView context={CONTEXT} paidPlans={flags.paidPlans} initial={FILLED} initialFormError="Your plan didn’t post. Try again." />;
    case "done":
      return <PostedView invite={P.climbing} me={SAM} />;
    case "done-paid":
      return <PostedView invite={POLO_POSTED} me={SAM} />;
    case "loading":
      return <PostLoading />;
    // the cost option (paid plans are on in all of these)
    case "cost-off":
      return <PostView context={CONTEXT} paidPlans initial={PAID_FILLED} />;
    case "cost-new":
      return <PostView context={getPaidContext("not-set-up")} paidPlans initial={costOn()} />;
    case "cost-ready":
      return <PostView context={CONTEXT} paidPlans initial={costOn()} />;
    case "cost-needs-info":
      return <PostView context={getPaidContext("needs-info")} paidPlans initial={costOn()} />;
    case "cost-review":
      return <PostView context={getPaidContext("in-review")} paidPlans initial={costOn()} />;
    case "cost-blank":
      return <PostView context={CONTEXT} paidPlans initial={costOn({ price: "" })} initialErrors={{ price: COST_ERROR.blank }} />;
    case "cost-zero":
      return <PostView context={CONTEXT} paidPlans initial={costOn({ price: "0" })} initialErrors={{ price: COST_ERROR.zero }} />;
    case "cost-high":
      return <PostView context={CONTEXT} paidPlans initial={costOn({ price: "400" })} initialErrors={{ price: COST_ERROR.high }} />;
    case "cost-untick":
      return <PostView context={CONTEXT} paidPlans initial={costOn({ tick: false })} initialErrors={{ faceValue: COST_ERROR.untick }} />;
    case "cost-getpaid":
      return (
        <PostView
          context={getPaidContext("not-set-up")}
          paidPlans
          initial={costOn()}
          initialErrors={{ getPaid: COST_ERROR.getPaid }}
        />
      );
    case "getpaid-sheet":
      return <PostView context={getPaidContext("not-set-up")} paidPlans initial={costOn()} initialMode="intro" />;
    case "getpaid-stripe":
      return <PostView context={getPaidContext("not-set-up")} paidPlans initial={costOn()} initialMode="stripe" />;
    default:
      return <PostView context={CONTEXT} paidPlans={flags.paidPlans} />;
  }
}

export const inviteScreens: PreviewScreen[] = [
  {
    id: "invite-browse",
    title: "Open Invite: browse",
    states: ["default", "pending", "filter", "empty", "loading", "error", "long", "long-paid", "joined", "taken"],
    tab: "invite",
    showMessages: true,
    defaultFlags: FLAGS,
    render: (params) => withPlans([...EXAMPLE_FEED.invites, ...LONG_PLANS, LONG_PAID], browseScreen(params)),
    frame: ({ state }) => (state === "loading" ? { showMessages: true } : {}),
  },
  {
    id: "invite-yours",
    title: "Open Invite: Yours",
    states: ["default", "empty", "loading", "past-only"],
    tab: "invite",
    showMessages: true,
    defaultFlags: FLAGS,
    render: (params) => withPlans([...EXAMPLE_YOURS.posted, ...EXAMPLE_YOURS.joined], yoursScreen(params)),
  },
  {
    id: "invite-plan",
    title: "Open Invite: a plan",
    states: Object.keys(PLAN_CASES).concat("loading"),
    tab: "invite",
    showMessages: true,
    dock: "own",
    defaultFlags: FLAGS,
    render: ({ state, flags }) => {
      if (state === "loading") return <PlanLoading />;
      const entry = PLAN_CASES[state] ?? PLAN_CASES.open;
      return withPlans(
        [entry.invite],
        <PlanView
          page={page(entry.invite)}
          paidPlans={flags.paidPlans}
          initialMoment={entry.moment ?? null}
          initialPendingId={entry.pending ? entry.invite.id : null}
        />,
      );
    },
  },
  {
    id: "invite-post",
    title: "Open Invite: post a plan",
    states: ["empty", "filled", "errors", "pending", "server-error", "done", "loading", "done-paid", ...POST_COST_STATES],
    tab: "invite",
    showMessages: false,
    dock: "own",
    defaultFlags: FLAGS,
    frame: ({ state }) => (state === "done" || state === "done-paid" ? { dock: "tabs" } : {}),
    render: (params) => withPlans([], postScreen(params)),
  },
  {
    id: "invite-edit",
    title: "Open Invite: edit a plan (the host)",
    states: ["default", "errors", "pending", "loading"],
    tab: "invite",
    showMessages: false,
    dock: "own",
    defaultFlags: FLAGS,
    render: ({ state }) => {
      if (state === "loading") return <PostLoading editing />;
      const plan = P.climbing;
      const others = plan.going.filter((person) => person.id !== SAM.id);
      const node = (
        <PostView
          context={CONTEXT}
          initial={valuesOf(plan)}
          editing={{ id: plan.id, title: plan.title, others }}
          initialPosting={state === "pending"}
          initialErrors={state === "errors" ? { time: "Pick a time from now." } : undefined}
          initialFormError={state === "errors" ? "2 people are going, so keep at least 2 places." : undefined}
        />
      );
      return withPlans([plan], node);
    },
  },
  {
    id: "invite-cards",
    title: "Open Invite: the card in every state",
    states: ["free", "paid"],
    tab: "invite",
    showMessages: true,
    defaultFlags: FLAGS,
    render: ({ state }) => {
      const cards: { key: string; invite: OpenInvite; pending?: boolean; mode?: "posted"; questions?: boolean }[] =
        state === "paid"
          ? [
              { key: "paid-open", invite: P.comedy },
              { key: "paid-in", invite: P.comedyPaid },
              { key: "paid-full", invite: P.comedyFull },
              { key: "paid-own", invite: P.polo },
              { key: "paid-cancelled", invite: P.comedyCancelled },
              { key: "paid-past", invite: { ...P.comedyFull, id: "comedy-night-past", status: "finished" } },
              { key: "paid-posted", invite: P.polo, mode: "posted" },
            ]
          : [
              { key: "open", invite: P.padelPizza },
              { key: "pending", invite: P.padelPizza, pending: true },
              { key: "in", invite: { ...P.saturdayClass, you: { ...P.saturdayClass.you, unreadInChat: 2 } } },
              { key: "full", invite: P.padelFull },
              { key: "own", invite: P.climbing },
              { key: "posted", invite: P.climbing, mode: "posted" },
              { key: "past", invite: P.spin },
              { key: "cancelled", invite: P.galleryCancelled },
            ];
      return (
        <main className="mk-main">
          <h1 className="mk-sr">Open Invite cards</h1>
          <section className="mk-band oi-band" aria-label="Open Invite cards">
            <div className="mk-wrap">
              <h2 className="mk-sr">Every state</h2>
              <div className="oi-feed is-one">
                {cards.map((card) => (
                  <InviteCard key={card.key} invite={card.invite} me={SAM} pending={card.pending} mode={card.mode} />
                ))}
              </div>
            </div>
          </section>
        </main>
      );
    },
  },
  // ---- paid plans: every payment screen and state (flag: paidPlans)
  {
    id: "pay-sheet",
    title: "Paid plans: the pay sheet",
    states: PAY_STATES,
    tab: "invite",
    showMessages: true,
    dock: "own",
    defaultFlags: PAY_FLAGS,
    render: ({ state }) => {
      const kind = (PAY_STATES as readonly string[]).includes(state) ? (state as PayStateName) : "ready";
      return planWith({
        invite: P.comedy,
        moment: { kind: "pay", id: P.comedy.id, state: kind, newPricePence: kind === "price" ? 2500 : undefined },
      });
    },
  },
  {
    id: "pay-leave",
    title: "Paid plans: leave, refund and cancel",
    states: Object.keys(LEAVE_CASES),
    tab: "invite",
    showMessages: true,
    dock: "own",
    defaultFlags: PAY_FLAGS,
    render: ({ state }) => planWith(LEAVE_CASES[state] ?? LEAVE_CASES.full),
  },
  {
    id: "pay-receipt",
    title: "Paid plans: a receipt",
    states: ["paid", "refunded-left", "refunded-cancelled", "refund-asked", "paid-out"],
    tab: "invite",
    showMessages: true,
    defaultFlags: PAY_FLAGS,
    render: ({ state }) => {
      switch (state) {
        case "refunded-left":
          return <ReceiptView receipt={EXAMPLE_RECEIPTS.left} />;
        case "refunded-cancelled":
          return <ReceiptView receipt={EXAMPLE_RECEIPTS.cancelled} />;
        case "refund-asked":
          return (
            <ReceiptView
              receipt={{
                ...EXAMPLE_RECEIPTS.paid,
                payment: { ...EXAMPLE_RECEIPTS.paid.payment, status: "refund-asked", refundAskedAt: "2026-10-29T20:30:00Z" },
              }}
            />
          );
        case "paid-out":
          return (
            <ReceiptView
              receipt={{ ...EXAMPLE_RECEIPTS.paid, payment: { ...EXAMPLE_RECEIPTS.paid.payment, status: "paid-out" } }}
            />
          );
        default:
          return <ReceiptView receipt={EXAMPLE_RECEIPTS.paid} />;
      }
    },
  },
  {
    id: "pay-payments",
    title: "Paid plans: You > Payments (the host's money)",
    states: ["full", "attention", "new", "review", "empty", "getpaid-sheet", "getpaid-stripe", "attention-stripe"],
    tab: null,
    youCurrent: true,
    showMessages: false,
    defaultFlags: PAY_PAGE_FLAGS,
    render: ({ state }) => {
      switch (state) {
        case "attention":
          return <PaymentsView payments={EXAMPLE_HOST_PAYMENTS.attention} />;
        case "new":
          return <PaymentsView payments={EXAMPLE_HOST_PAYMENTS.new} />;
        case "review":
          return <PaymentsView payments={EXAMPLE_HOST_PAYMENTS.review} />;
        case "empty":
          return <PaymentsView payments={EXAMPLE_HOST_PAYMENTS.empty} />;
        case "getpaid-sheet":
          return <PaymentsView payments={EXAMPLE_HOST_PAYMENTS.new} initialMode="intro" />;
        case "getpaid-stripe":
          return <PaymentsView payments={EXAMPLE_HOST_PAYMENTS.new} initialMode="stripe" />;
        case "attention-stripe":
          return <PaymentsView payments={EXAMPLE_HOST_PAYMENTS.attention} initialMode="stripe" />;
        default:
          return <PaymentsView payments={EXAMPLE_HOST_PAYMENTS.full} />;
      }
    },
  },
  {
    id: "pay-getpaid",
    title: "Paid plans: Get paid, the four entry cards and the quiet line",
    states: ["cards"],
    tab: null,
    youCurrent: true,
    showMessages: false,
    defaultFlags: PAY_PAGE_FLAGS,
    render: () => <GetPaidBoard />,
  },
  {
    id: "pay-plan",
    title: "Paid plans: You > Payments > one plan",
    states: ["held", "request", "refund", "on-its-way", "paid-out", "refunded"],
    tab: null,
    youCurrent: true,
    showMessages: false,
    defaultFlags: PAY_PAGE_FLAGS,
    render: ({ state }) => {
      switch (state) {
        case "request":
          return <PlanPaymentsView plan={EXAMPLE_PLAN_PAYMENTS["polo-match-asked"]} />;
        case "refund":
          return <PlanPaymentsView plan={EXAMPLE_PLAN_PAYMENTS["polo-match-asked"]} initialRefund />;
        case "on-its-way":
          return <PlanPaymentsView plan={EXAMPLE_PLAN_PAYMENTS["pottery-class"]} />;
        case "paid-out":
          return <PlanPaymentsView plan={EXAMPLE_PLAN_PAYMENTS["gig-night"]} />;
        case "refunded":
          return <PlanPaymentsView plan={EXAMPLE_PLAN_PAYMENTS["padel-doubles"]} />;
        default:
          return <PlanPaymentsView plan={EXAMPLE_PLAN_PAYMENTS["polo-match"]} />;
      }
    },
  },
];
