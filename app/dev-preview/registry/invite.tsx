// Preview screens for Open Invite (browse, post, plan page, Yours) and the paid-plan screens. OWNED BY THE OPEN INVITE BUILDER.
// One id per screen: "invite-<name>" for Open Invite and "pay-<name>" for the paid plans.
// EXAMPLE CONTENT: every person, place and plan comes from lib/members/mock/open-invite.ts.
//
// Plan-page states and the sheets drawn over them use the same plan for the
// same state as the approved designs (pages_oi.py): open and full on "Padel,
// then pizza", in on "Saturday morning class + brunch", own on "Climbing and
// a pint", cancelled on "Gallery late and a drink", past on "Saturday spin".

import "@/components/members/invite/invite.css";

import {
  OpenInviteError,
  OpenInviteLoading,
  OpenInviteView,
} from "@/components/members/invite/browse-view";
import { InviteCard } from "@/components/members/invite/invite-card";
import { PlanLoading, PlanView } from "@/components/members/invite/plan-view";
import { PostedView, PostLoading, PostView, type PostErrors, type PostValues } from "@/components/members/invite/post-view";
import type { Moment } from "@/components/members/invite/use-moments";
import { YoursLoading, YoursView } from "@/components/members/invite/yours-view";
import { COST_ERROR, type CostValues } from "@/lib/members/invite/cost";
import { examplePhoto } from "@/lib/members/mock/example-photos";
import {
  EXAMPLE_FEED,
  EXAMPLE_INVITES as P,
  EXAMPLE_NOW,
  EXAMPLE_PEOPLE,
  EXAMPLE_YOURS,
  SAM,
} from "@/lib/members/mock/open-invite";
import type { InviteMember, NewOpenInviteContext, OpenInvite, OpenInvitePage } from "@/lib/members/invite/types";
import type { PreviewScreen } from "./types";

const FLAGS = ["openInvite", "messages"] as const;

const CONTEXT: NewOpenInviteContext = {
  me: SAM,
  getPaid: { status: "ready", accountEnding: "4321", paused: null },
  today: "2026-10-25",
  now: EXAMPLE_NOW,
};

const page = (invite: OpenInvite): OpenInvitePage => ({ invite, me: SAM, now: EXAMPLE_NOW });

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

export const inviteScreens: PreviewScreen[] = [
  {
    id: "invite-browse",
    title: "Open Invite: browse",
    states: ["default", "pending", "filter", "empty", "loading", "error", "long", "joined", "taken"],
    tab: "invite",
    showMessages: true,
    defaultFlags: FLAGS,
    render: ({ state, flags }) => {
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
    },
    frame: ({ state }) => (state === "loading" ? { showMessages: true } : {}),
  },
  {
    id: "invite-yours",
    title: "Open Invite: Yours",
    states: ["default", "empty", "loading", "past-only"],
    tab: "invite",
    showMessages: true,
    defaultFlags: FLAGS,
    render: ({ state, flags }) => {
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
    },
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
      return (
        <PlanView
          page={page(entry.invite)}
          paidPlans={flags.paidPlans}
          initialMoment={entry.moment ?? null}
          initialPendingId={entry.pending ? entry.invite.id : null}
        />
      );
    },
  },
  {
    id: "invite-post",
    title: "Open Invite: post a plan",
    states: ["empty", "filled", "errors", "pending", "done", "loading", "done-paid", ...POST_COST_STATES],
    tab: "invite",
    showMessages: false,
    dock: "own",
    defaultFlags: FLAGS,
    frame: ({ state }) => (state === "done" || state === "done-paid" ? { dock: "tabs" } : {}),
    render: ({ state, flags }) => {
      switch (state) {
        case "filled":
          return <PostView context={CONTEXT} paidPlans={flags.paidPlans} initial={FILLED} />;
        case "errors":
          return <PostView context={CONTEXT} paidPlans={flags.paidPlans} initialErrors={ERRORS} />;
        case "pending":
          return <PostView context={CONTEXT} paidPlans={flags.paidPlans} initial={FILLED} initialPosting />;
        case "done":
          return <PostedView invite={P.climbing} me={SAM} />;
        case "done-paid":
          return <PostedView invite={P.polo} me={SAM} />;
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
          <section className="mk-band oi-band" aria-label="Open Invite cards">
            <div className="mk-wrap">
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
];
