// The data Open Invite and paid plans need from a backend. NO BACKEND EXISTS
// YET: these types are the build spec for it, and the fake adapters in
// lib/members/mock/ (open-invite.ts, payments.ts) return exactly these
// shapes. Every screen under components/members/invite and
// components/members/payments reads these types and nothing else.
//
// Conventions (so the backend and the screens agree):
//   - Times are ISO 8601 strings with an offset. Every time a member sees is
//     Europe/London, 24-hour, with a leading zero ("Fri 30 Oct, 20:00").
//   - Money is an integer number of pence in GBP (pricePence: 2200 is £22).
//   - A member is shown to other members by first name and photo only.
//   - No field here is ever a raw database status: screens turn them into
//     plain words ("Held", "Refunded", "Not set up").

// ---------------------------------------------------------------- Open Invite

/** The five types of plan the post form offers (one is required). */
export const INVITE_TYPES = ["Sport", "Food and drink", "Wellness", "Culture", "Something else"] as const;
export type InviteType = (typeof INVITE_TYPES)[number];

/** A member as other members see them. */
export type InviteMember = {
  id: string;
  firstName: string;
  /** Required for anyone who reaches these screens (the photo gate); null only draws the initial. */
  photoUrl: string | null;
};

/**
 * scheduled: still to happen (it may be full). cancelled: the host cancelled.
 * finished: the start time has passed. "Full" is not stored: it is
 * going.length === places. The backend moves scheduled to finished.
 */
export type InviteStatus = "scheduled" | "cancelled" | "finished";

/** A question a member sent the host before deciding (what the host sees on their own plan). */
export type InviteQuestion = {
  /** The one-to-one thread in Messages. */
  threadId: string;
  from: InviteMember;
  /** The latest question text. */
  text: string;
  unread: number;
};

/** What the signed-in member is to this plan. */
export type InviteViewer = {
  role: "host" | "going" | "guest";
  /** The plan chat, once the member is in or hosting. Null for a guest. */
  chatId: string | null;
  /** Unread messages in the plan chat. */
  unreadInChat: number;
  /** The latest message in the plan chat, for the "Plan chat" row ("Priya: I’ll bring my own towel."). Null: no messages yet. */
  chatPreview: { from: string; text: string } | null;
  /**
   * Guest only: the one-to-one thread with the host. Exists as an id before
   * the first message (Messages creates it on send), so "Ask Tom" always has
   * somewhere to go. Null for the host and for people who are in.
   */
  askThreadId: string | null;
  /** Guest only: the host's last reply to a question this member asked. */
  hostReply: string | null;
  /** Host only: who asked a question, newest first. */
  questions: InviteQuestion[];
  /** The member's own payment for a place on a paid plan (null: free plan, or not paid). */
  payment: InvitePayment | null;
  /** Host only, paid plan: the money so far (null on a free plan). */
  hostMoney: HostPlanMoney | null;
  /** The signed-in member's own email address: where payment receipts go ("Receipt sent to ..."). Never another member's. */
  receiptEmail: string;
};

export type OpenInvite = {
  id: string;
  /** Required, 50 characters at most. */
  title: string;
  type: InviteType;
  /** Start time. The 24-hour refund rule and "past" are worked out from it. */
  startsAt: string;
  /** A venue or a meeting point, never a home address. */
  where: string;
  /** Optional, 280 characters at most. */
  note: string | null;
  /** How many people the plan takes, 2 to 12. Includes the host when hostGoing. */
  places: number;
  /** "I'm going too". Unticked for spare tickets: then places are all for others. */
  hostGoing: boolean;
  host: InviteMember;
  /** Who is in, in the order they said yes (on a paid plan: in the order they paid). Includes the host when hostGoing. */
  going: InviteMember[];
  status: InviteStatus;
  /** Null on a free plan (the default). */
  cost: InviteCost | null;
  you: InviteViewer;
};

/** What the browse page needs: the plans, and the count on the Yours switch. */
export type OpenInviteFeed = {
  /** Upcoming plans, soonest first (the viewer's own and joined plans included). */
  invites: OpenInvite[];
  /** Plans with something new for the viewer (the number on "Yours"). The backend decides what counts. */
  yoursCount: number;
  /** The signed-in member: their photo is on the "Got a plan?" row. */
  me: InviteMember;
  /** The server's clock (ISO, with offset). "This week" and the 24-hour refund rule are worked out from it, so the screen and the server agree. */
  now: string;
};

/** One plan's page: the plan, the signed-in member and the server's clock. */
export type OpenInvitePage = {
  invite: OpenInvite;
  me: InviteMember;
  now: string;
};

/** What the post form needs before it opens. */
export type NewOpenInviteContext = {
  me: InviteMember;
  /** Whether the member can charge yet: a cost needs Get paid finished. */
  getPaid: GetPaid;
  /** Today's date in London (YYYY-MM-DD): the earliest date the form takes. */
  today: string;
  now: string;
};

/** The Yours page: three groups. */
export type OpenInviteYours = {
  posted: OpenInvite[];
  joined: OpenInvite[];
  /** Finished plans, newest first. */
  past: OpenInvite[];
  me: InviteMember;
  now: string;
  /** The count on the Yours switch (the same number as the feed's yoursCount). */
  yoursCount: number;
};

/** What the post form sends. The server checks every rule again. */
export type NewOpenInvite = {
  title: string;
  type: InviteType;
  /** Local date (YYYY-MM-DD, today or later) and 24-hour time (HH:MM), London. */
  date: string;
  time: string;
  where: string;
  places: number;
  hostGoing: boolean;
  note: string;
  /** Present only when "Add a cost" is on. */
  cost: { pricePence: number; faceValueConfirmed: boolean } | null;
};

/** Field errors the post form shows, keyed by field. The messages are written in the form. */
export type NewOpenInviteField = "title" | "type" | "date" | "time" | "where" | "price" | "faceValue" | "getPaid";

// ---------------------------------------------------------------- paid plans

/** The cost a host put on a plan. Free is the default: no cost. */
export type InviteCost = {
  /** Per person, in pence. From MIN_PRICE_PENCE (£1) to MAX_PRICE_PENCE (£200). */
  pricePence: number;
  /** The host ticked "I'm not charging more than it cost me". Stored with the plan. */
  faceValueConfirmed: boolean;
};

export const MIN_PRICE_PENCE = 100;
/** An example cap per person at launch (a decision for Albert, payments spec D4). */
export const MAX_PRICE_PENCE = 20000;

/** Where a member's money is. */
export type PaymentStatus =
  | "held" // taken, held by Club Yuppie until the plan is over
  | "refund-asked" // the member left inside 24 hours and asked the host for a refund
  | "refunded"
  | "paid-out"; // the plan happened and the host was paid

export type PaymentRefund = {
  amountPence: number;
  /** left-in-time: more than 24 hours before, automatic. host-cancelled: automatic. host-agreed: the host said yes inside 24 hours. */
  reason: "left-in-time" | "host-cancelled" | "host-agreed";
  refundedAt: string;
  /** Card refunds usually land in 5 to 10 working days: the date by which they should have. */
  expectedBy: string;
};

/** One member's payment for one place. */
export type InvitePayment = {
  id: string;
  /** The number on the receipt ("0417"). */
  receiptNumber: string;
  inviteId: string;
  payer: InviteMember;
  amountPence: number;
  paidAt: string;
  /** How it was paid, in words: "Visa ending 4242". Never a full card number. */
  method: string;
  status: PaymentStatus;
  /** Set when status is "refund-asked": when the member asked. */
  refundAskedAt: string | null;
  refund: PaymentRefund | null;
};

/** The host's money on one paid plan. */
export type HostPlanMoney = {
  payments: InvitePayment[];
  /** When the host is paid: about 2 working days after the plan. Null once paid out or if nothing is held. */
  payoutOn: string | null;
  getPaid: GetPaidStatus;
};

/** Stripe's account check, in four steps. The host never sees a Stripe word beyond the hand-off. */
export type GetPaidStatus = "not-set-up" | "needs-info" | "in-review" | "ready";

export type GetPaid = {
  status: GetPaidStatus;
  /** Ready: the last four digits of the bank account the money goes to. */
  accountEnding: string | null;
  /** Needs more info: a payout that is paused (money safe, nothing lost). */
  paused: { amountPence: number; dueOn: string } | null;
};

/** One row of the host's Payments list: a paid plan. */
export type HostPaidPlan = {
  inviteId: string;
  title: string;
  startsAt: string;
  /** Who paid: first names. */
  payers: string[];
  /** What the payers paid in all (or the refunded amount on a refunded plan). */
  amountPence: number;
  status: "held" | "on-its-way" | "paid-out" | "refunded" | "paused" | "asked";
  /** Held and on-its-way: when the host is paid. */
  payoutOn: string | null;
  /** Paid out: when it went to the bank. */
  paidOutOn: string | null;
  /** Refunded: "Jasmin paid, then left in time" and so on (plain words, written by the backend). */
  payersNote: string | null;
};

/** The host's Payments page (You > Payments). */
export type HostPayments = {
  getPaid: GetPaid;
  heldPence: number;
  onItsWayPence: number;
  paidOutPence: number;
  plans: HostPaidPlan[];
};

/** One plan's payments, for the host. */
export type HostPlanPayments = {
  invite: Pick<OpenInvite, "id" | "title" | "startsAt" | "where" | "places" | "cost">;
  payments: InvitePayment[];
  payoutOn: string | null;
  /** The server's clock (ISO): the page tells a plan still to come from one that is over, and stamps an answer, from it. */
  now: string;
};

/** A receipt, for the member who paid. */
export type Receipt = {
  payment: InvitePayment;
  invite: Pick<OpenInvite, "id" | "title" | "startsAt" | "where" | "host" | "status">;
  /** The member's own email address: "Email me a copy" sends the receipt here. */
  email: string;
  /** The member's full name, as on their account. */
  paidBy: string;
};

// ---------------------------------------------------------------- paying, leaving, cancelling (what the server answers)

/**
 * Pay and join, step 1: the server reserves a place for the member while the
 * pay sheet is open (about 10 minutes) and returns when the hold runs out.
 * The card is never taken until the place is secure (payments spec D9).
 */
export type PayHold = {
  inviteId: string;
  /** What this member would pay now, in pence (the price may have changed since the page was drawn). */
  amountPence: number;
  heldUntil: string;
};

/** Pay and join, step 2: what happened when the member pressed Pay. Card details never reach Club Yuppie's own servers: the card fields are Stripe's. */
export type PayResult =
  | { kind: "paid"; payment: InvitePayment }
  | { kind: "declined" } // the card was declined: nothing taken, the place is still held
  | { kind: "bank-check" } // the bank wants to check it is them (3D Secure): the member leaves for the bank's screen and comes back
  | { kind: "full"; refunded: boolean } // the last place went first. refunded: the money had been taken and was returned in full
  | { kind: "price-changed"; newPricePence: number } // the host changed the price while the member was paying: nothing taken
  | { kind: "hold-expired" } // the member took longer than the hold: nothing taken
  | { kind: "error" }; // the payment form could not open: nothing taken

/** A member leaves a paid plan. More than 24 hours before the start: refunded automatically. Inside 24 hours: ask the host, or leave without a refund. */
export type LeaveResult =
  | { kind: "refunded"; payment: InvitePayment }
  | { kind: "asked"; payment: InvitePayment } // refund-asked: the member stays in until the host answers
  | { kind: "left-no-refund" };

/** The host cancels a paid plan: every payer is refunded in full, automatically, and told. */
export type CancelPaidResult = {
  refunded: InvitePayment[];
  totalPence: number;
};

/** The host answers a refund request (inside 24 hours): refund it, or keep it. The member's place goes back to the plan on a refund. */
export type RefundAnswer = "refund" | "keep";
