// EXAMPLE DATA: invented people and places, never shown to real members (flag off, 404 in production)
//
// The fake adapter for paid plans: the host's Payments pages, one plan's
// payments, and a member's receipt. It returns exactly the types in
// lib/members/invite/types.ts. Nothing here writes anything: paying, leaving,
// refunding and Get paid are local client state in the views.
//
// Sam is the example host, with four paid plans so every status shows (the
// designs' payments.md section 7 lists the added ones). The example "now" is
// Sun 25 Oct 2026, 09:41.

import { EXAMPLE_INVITES, EXAMPLE_NOW, EXAMPLE_PEOPLE, TOM_POLO_PAYMENT } from "./open-invite";
import type {
  GetPaid,
  HostPaidPlan,
  HostPayments,
  HostPlanPayments,
  InvitePayment,
  OpenInvite,
  Receipt,
} from "@/lib/members/invite/types";

const { AISHA, PRIYA, MARCUS, JASMIN } = EXAMPLE_PEOPLE;

/** The scenarios the Payments page is drawn in. */
export type PaymentsScenario = "full" | "new" | "review" | "empty" | "attention";

// ---------------------------------------------------------------- the host's paid plans

const POLO: HostPaidPlan = {
  inviteId: "polo-match",
  title: "Polo match, two spare tickets",
  startsAt: "2026-11-14T14:00:00Z",
  payers: ["Tom"],
  amountPence: 4000,
  status: "held",
  payoutOn: "2026-11-17T09:00:00Z",
  paidOutOn: null,
  payersNote: null,
};

const POTTERY: HostPaidPlan = {
  inviteId: "pottery-class",
  title: "Pottery class, one spare place",
  startsAt: "2026-10-24T10:30:00+01:00",
  payers: ["Aisha"],
  amountPence: 3500,
  status: "on-its-way",
  payoutOn: "2026-10-27T09:00:00Z",
  paidOutOn: null,
  payersNote: null,
};

const GIG: HostPaidPlan = {
  inviteId: "gig-night",
  title: "Gig, two spare tickets",
  startsAt: "2026-10-10T19:30:00+01:00",
  payers: ["Priya", "Marcus"],
  amountPence: 3600,
  status: "paid-out",
  payoutOn: null,
  paidOutOn: "2026-10-13T09:00:00Z",
  payersNote: null,
};

const PADEL: HostPaidPlan = {
  inviteId: "padel-doubles",
  title: "Padel doubles, one spare place",
  startsAt: "2026-10-17T10:00:00+01:00",
  payers: ["Jasmin"],
  amountPence: 1200,
  status: "refunded",
  payoutOn: null,
  paidOutOn: null,
  payersNote: "Jasmin paid, then left in time",
};

const PLANS: HostPaidPlan[] = [POLO, POTTERY, GIG, PADEL];

const READY: GetPaid = { status: "ready", accountEnding: "4321", paused: null };

const SCENARIOS: Record<PaymentsScenario, HostPayments> = {
  full: { getPaid: READY, heldPence: 4000, onItsWayPence: 3500, paidOutPence: 3600, plans: PLANS },
  attention: {
    getPaid: { status: "needs-info", accountEnding: null, paused: { amountPence: 3500, dueOn: "2026-10-27T09:00:00Z" } },
    heldPence: 4000,
    onItsWayPence: 3500,
    paidOutPence: 3600,
    plans: PLANS.map((plan) => (plan.status === "on-its-way" ? { ...plan, status: "paused" as const } : plan)),
  },
  new: { getPaid: { status: "not-set-up", accountEnding: null, paused: null }, heldPence: 0, onItsWayPence: 0, paidOutPence: 0, plans: [] },
  review: { getPaid: { status: "in-review", accountEnding: null, paused: null }, heldPence: 0, onItsWayPence: 0, paidOutPence: 0, plans: [] },
  empty: { getPaid: READY, heldPence: 0, onItsWayPence: 0, paidOutPence: 0, plans: [] },
};

export const EXAMPLE_HOST_PAYMENTS = SCENARIOS;

export async function getHostPayments(scenario: PaymentsScenario = "full"): Promise<HostPayments> {
  return SCENARIOS[scenario];
}

// ---------------------------------------------------------------- one plan's payments

const payment = (
  id: string,
  receiptNumber: string,
  inviteId: string,
  payer: InvitePayment["payer"],
  amountPence: number,
  paidAt: string,
  method: string,
): InvitePayment => ({
  id,
  receiptNumber,
  inviteId,
  payer,
  amountPence,
  paidAt,
  method,
  status: "held",
  refundAskedAt: null,
  refund: null,
});

/** Tom paid £40 and asked for a refund inside 24 hours: Sam answers. */
export const TOM_POLO_ASKED: InvitePayment = {
  ...TOM_POLO_PAYMENT,
  status: "refund-asked",
  refundAskedAt: "2026-11-13T20:00:00Z",
};

const POLO_INVITE = EXAMPLE_INVITES.polo;
const POLO_PAGE: HostPlanPayments["invite"] = {
  id: POLO_INVITE.id,
  title: POLO_INVITE.title,
  startsAt: POLO_INVITE.startsAt,
  where: POLO_INVITE.where,
  places: POLO_INVITE.places,
  cost: POLO_INVITE.cost,
};

const PLAN_PAYMENTS: Record<string, HostPlanPayments> = {
  "polo-match": { invite: POLO_PAGE, payments: [TOM_POLO_PAYMENT], payoutOn: "2026-11-17T09:00:00Z", now: EXAMPLE_NOW },
  "polo-match-asked": {
    invite: { ...POLO_PAGE, id: "polo-match-asked" },
    payments: [TOM_POLO_ASKED],
    payoutOn: "2026-11-17T09:00:00Z",
    now: EXAMPLE_NOW,
  },
  "pottery-class": {
    invite: {
      id: "pottery-class",
      title: POTTERY.title,
      startsAt: POTTERY.startsAt,
      where: "The Clay Room",
      places: 1,
      cost: { pricePence: 3500, faceValueConfirmed: true },
    },
    payments: [payment("pay-0391", "0391", "pottery-class", AISHA, 3500, "2026-10-17T14:12:00+01:00", "Visa ending 1881")],
    payoutOn: "2026-10-27T09:00:00Z",
    now: EXAMPLE_NOW,
  },
  "gig-night": {
    invite: {
      id: "gig-night",
      title: GIG.title,
      startsAt: GIG.startsAt,
      where: "The Corn Exchange",
      places: 2,
      cost: { pricePence: 1800, faceValueConfirmed: true },
    },
    payments: [
      { ...payment("pay-0374", "0374", "gig-night", PRIYA, 1800, "2026-10-03T12:30:00+01:00", "Mastercard ending 0097"), status: "paid-out" },
      { ...payment("pay-0375", "0375", "gig-night", MARCUS, 1800, "2026-10-04T18:02:00+01:00", "Visa ending 4242"), status: "paid-out" },
    ],
    payoutOn: null,
    now: EXAMPLE_NOW,
  },
  "padel-doubles": {
    invite: {
      id: "padel-doubles",
      title: PADEL.title,
      startsAt: PADEL.startsAt,
      where: "Northgate Courts",
      places: 1,
      cost: { pricePence: 1200, faceValueConfirmed: true },
    },
    payments: [
      {
        ...payment("pay-0380", "0380", "padel-doubles", JASMIN, 1200, "2026-10-08T09:10:00+01:00", "Visa ending 4242"),
        status: "refunded",
        refund: {
          amountPence: 1200,
          reason: "left-in-time",
          refundedAt: "2026-10-12T10:00:00+01:00",
          expectedBy: "2026-10-26T10:00:00+01:00",
        },
      },
    ],
    payoutOn: null,
    now: EXAMPLE_NOW,
  },
};

/** The plans' payments by id, ready-made for the preview harness. */
export const EXAMPLE_PLAN_PAYMENTS = PLAN_PAYMENTS;

export async function getHostPlanPayments(inviteId: string): Promise<HostPlanPayments | null> {
  return PLAN_PAYMENTS[inviteId] ?? null;
}

// ---------------------------------------------------------------- receipts

/** A receipt for a plan the member paid for, or null (the plan has no payment of theirs). */
function receiptFor(invite: OpenInvite): Receipt | null {
  const paid = invite.you.payment;
  if (!paid) return null;
  return {
    payment: paid,
    invite: {
      id: invite.id,
      title: invite.title,
      startsAt: invite.startsAt,
      where: invite.where,
      host: invite.host,
      status: invite.status,
    },
    email: invite.you.receiptEmail,
    paidBy: "Sam Taylor",
  };
}

const RECEIPT_INVITES: OpenInvite[] = [
  EXAMPLE_INVITES.comedyPaid,
  EXAMPLE_INVITES.comedyCancelled,
  EXAMPLE_INVITES.comedyLeft,
];

/** The receipts the designs draw, ready-made for the preview harness. */
export const EXAMPLE_RECEIPTS = {
  paid: receiptFor(EXAMPLE_INVITES.comedyPaid) as Receipt,
  left: receiptFor(EXAMPLE_INVITES.comedyLeft) as Receipt,
  cancelled: receiptFor(EXAMPLE_INVITES.comedyCancelled) as Receipt,
};

/** A member's receipt for a paid plan, or null (the page then 404s). */
export async function getReceipt(inviteId: string): Promise<Receipt | null> {
  const invite = RECEIPT_INVITES.find((entry) => entry.id === inviteId);
  return invite ? receiptFor(invite) : null;
}

export const EXAMPLE_RECEIPT_IDS = {
  paid: "comedy-night-paid",
  cancelled: "comedy-night-cancelled",
  left: "comedy-night-left",
} as const;
