// EXAMPLE DATA: invented people and places. A 404 on the live site unless MEMBERS_SHOW_EXAMPLES=on is set there (guard.ts), and then every screen that uses it says it is an example (kit/example-note.tsx).
//
// Open Invite's example plans, for the preview harness (app/dev-preview/registry/invite.tsx) and the Messages
// example threads. Stage 2 gave Open Invite a real backend (lib/server/plans.ts): no members page reads this file
// any more, and its example adapter functions are gone. The shapes are exactly lib/members/invite/types.ts's.
//
// The people and plans are the shared example content of the approved designs
// (CONTENT.md and CONTENT3.md). Every venue is a fictional placeholder except
// "Psycle, Oxford Circus". The example "now" is Sun 25 Oct 2026, 09:41.
//
// A plan can appear twice with a different relation to Sam (for example the
// Comedy night is open on the browse page and paid on the Yours page): the
// designs drew it both ways, so the adapter keeps both under different ids.

import { examplePhoto, type ExamplePhotoKey } from "./example-photos";
import type {
  InviteMember,
  InvitePayment,
  InviteQuestion,
  InviteType,
  OpenInvite,
  OpenInviteFeed,
  OpenInviteYours,
} from "@/lib/members/invite/types";

/** The example "now": Sun 25 Oct 2026, 09:41 in London (GMT). */
export const EXAMPLE_NOW = "2026-10-25T09:41:00Z";

const member = (id: string, firstName: string, key: ExamplePhotoKey): InviteMember => ({
  id,
  firstName,
  photoUrl: examplePhoto(key),
});

export const SAM = member("sam", "Sam", "S");
const JASMIN = member("jasmin", "Jasmin", "J");
const PRIYA = member("priya", "Priya", "P");
const TOM = member("tom", "Tom", "T");
const MARCUS = member("marcus", "Marcus", "M");
const AISHA = member("aisha", "Aisha", "A");
const DAN = member("dan", "Dan", "D");
const CHLOE = member("chloe", "Chloe", "C");
const OLLIE = member("ollie", "Ollie", "O");

const GUEST = (id: string): OpenInvite["you"] => ({
  role: "guest",
  chatId: null,
  unreadInChat: 0,
  chatPreview: null,
  askThreadId: `ask-${id}`,
  hostReply: null,
  receiptEmail: "sam@example.com",
  questions: [],
  payment: null,
  hostMoney: null,
});

type Seed = Omit<OpenInvite, "you" | "status" | "cost" | "hostGoing" | "note"> &
  Partial<Pick<OpenInvite, "status" | "cost" | "hostGoing" | "note">> & {
    you?: Partial<OpenInvite["you"]>;
  };

function invite(seed: Seed): OpenInvite {
  const { you, ...rest } = seed;
  return {
    status: "scheduled",
    cost: null,
    hostGoing: true,
    note: null,
    ...rest,
    you: { ...GUEST(seed.id), ...you },
  };
}

function question(from: InviteMember, text: string, threadId: string): InviteQuestion {
  return { from, text, threadId, unread: 1 };
}

// ---------------------------------------------------------------- the money

/** Sam paid £22 for Comedy night on Sun 25 Oct, 09:41. Receipt 0417. */
export const SAM_COMEDY_PAYMENT: InvitePayment = {
  id: "pay-0417",
  receiptNumber: "0417",
  inviteId: "comedy-night-paid",
  payer: SAM,
  amountPence: 2200,
  paidAt: "2026-10-25T09:41:00Z",
  method: "Visa ending 4242",
  status: "held",
  refundAskedAt: null,
  refund: null,
};

/** Tom paid £40 for Sam's Polo match on Sun 25 Oct, 09:41. */
export const TOM_POLO_PAYMENT: InvitePayment = {
  id: "pay-0418",
  receiptNumber: "0418",
  inviteId: "polo-match",
  payer: TOM,
  amountPence: 4000,
  paidAt: "2026-10-25T09:41:00Z",
  method: "Visa ending 4242",
  status: "held",
  refundAskedAt: null,
  refund: null,
};

// ---------------------------------------------------------------- the plans

const CLASS_NOTE = "Booked the 10:00 ride. Brunch afterwards at a place round the corner. Beginners welcome.";

const SATURDAY_CLASS = invite({
  id: "saturday-class",
  title: "Saturday morning class + brunch",
  type: "Wellness",
  startsAt: "2026-10-24T10:00:00+01:00",
  where: "Psycle, Oxford Circus",
  note: CLASS_NOTE,
  places: 4,
  host: JASMIN,
  going: [JASMIN, PRIYA, SAM],
  you: {
    role: "going",
    chatId: "chat-saturday-class",
    askThreadId: null,
    unreadInChat: 2,
    chatPreview: { from: "Priya", text: "I’ll bring my own towel. Anyone want a coffee after?" },
  },
});

const SUNDAY_WALK = invite({
  id: "sunday-walk",
  title: "Sunday walk and coffee",
  type: "Wellness",
  startsAt: "2026-10-25T11:00:00Z",
  where: "Calder Park",
  note: "Gentle loop, about an hour, then coffee.",
  places: 6,
  host: PRIYA,
  going: [PRIYA, AISHA],
});

const PADEL_PIZZA = invite({
  id: "padel-pizza",
  title: "Padel, then pizza",
  type: "Sport",
  startsAt: "2026-10-29T19:00:00Z",
  where: "Northgate Courts",
  note: "Doubles, all levels. Spare rackets if you need one.",
  places: 4,
  host: TOM,
  going: [TOM, DAN, CHLOE],
});

const GALLERY_LATE = invite({
  id: "gallery-late",
  title: "Gallery late and a drink",
  type: "Culture",
  startsAt: "2026-10-30T18:30:00Z",
  where: "Marlow Gallery",
  note: "Late opening, then a drink round the corner. Come on your own or with a friend.",
  places: 4,
  host: AISHA,
  going: [AISHA],
});

const COMEDY_NOTE = "Can’t make it. Selling at what I paid, face value. Tickets are on your phone.";

const COMEDY_NIGHT = invite({
  id: "comedy-night",
  title: "Comedy night, two spare tickets",
  type: "Culture",
  startsAt: "2026-10-30T20:00:00Z",
  where: "The Bell Room",
  note: COMEDY_NOTE,
  places: 2,
  hostGoing: false,
  host: DAN,
  going: [],
  cost: { pricePence: 2200, faceValueConfirmed: true },
});

const FIVE_KM = invite({
  id: "five-km-river",
  title: "5km by the river, then breakfast",
  type: "Sport",
  startsAt: "2026-10-31T08:00:00Z",
  where: "Calder Park",
  note: "Easy pace, nobody gets left behind. Breakfast at the café by the bridge.",
  places: 8,
  host: MARCUS,
  going: [MARCUS, OLLIE, PRIYA, DAN],
});

const CLIMBING = invite({
  id: "climbing-pint",
  title: "Climbing and a pint",
  type: "Sport",
  startsAt: "2026-11-04T18:30:00Z",
  where: "The Boulder Yard",
  note: "Beginners welcome, shoes can be hired at the desk.",
  places: 4,
  host: SAM,
  going: [SAM],
  you: {
    role: "host",
    chatId: "chat-climbing-pint",
    askThreadId: null,
    unreadInChat: 0,
    questions: [
      question(AISHA, "Do I need my own shoes?", "ask-climbing-pint-aisha"),
      question(DAN, "Is this fine for a first-timer?", "ask-climbing-pint-dan"),
    ],
  },
});

const POLO_MATCH = invite({
  id: "polo-match",
  title: "Polo match, two spare tickets",
  type: "Sport",
  startsAt: "2026-11-14T14:00:00Z",
  where: "Hartley Polo Grounds",
  note: "Two seats together, at face value. Tickets are on your phone.",
  places: 2,
  hostGoing: false,
  host: SAM,
  going: [TOM],
  cost: { pricePence: 4000, faceValueConfirmed: true },
  you: {
    role: "host",
    chatId: "chat-polo-match",
    askThreadId: null,
    questions: [question(PRIYA, "Are the two seats together?", "ask-polo-match-priya")],
    hostMoney: { payments: [TOM_POLO_PAYMENT], payoutOn: "2026-11-17T09:00:00Z", getPaid: "ready" },
  },
});

// ---- the same plans, in the other states the designs drew

const PADEL_FULL = invite({
  ...PADEL_PIZZA,
  id: "padel-pizza-full",
  going: [TOM, DAN, CHLOE, OLLIE],
});

const PADEL_ASKED = invite({
  ...PADEL_PIZZA,
  id: "padel-pizza-asked",
  you: { askThreadId: "c-tom", hostReply: "Totally. Doubles, all levels, I’ll bring spare rackets." },
});

const GALLERY_CANCELLED = invite({
  ...GALLERY_LATE,
  id: "gallery-late-cancelled",
  status: "cancelled",
});

const SATURDAY_SPIN = invite({
  id: "saturday-spin",
  title: "Saturday spin",
  type: "Wellness",
  startsAt: "2026-10-17T10:00:00+01:00",
  where: "Psycle, Oxford Circus",
  places: 4,
  host: JASMIN,
  going: [JASMIN, SAM, PRIYA, TOM],
  status: "finished",
  you: { role: "going", chatId: "chat-saturday-spin", askThreadId: null },
});

const SUNDAY_WALK_PAST = invite({
  id: "sunday-walk-past",
  title: "Sunday walk and coffee",
  type: "Wellness",
  startsAt: "2026-10-11T11:00:00+01:00",
  where: "Calder Park",
  places: 6,
  host: SAM,
  going: [SAM, PRIYA, AISHA],
  status: "finished",
  you: { role: "host", chatId: "chat-sunday-walk-past", askThreadId: null },
});

const COMEDY_PAID = invite({
  ...COMEDY_NIGHT,
  id: "comedy-night-paid",
  going: [SAM],
  you: {
    role: "going",
    chatId: "chat-comedy-night",
    askThreadId: null,
    unreadInChat: 2,
    chatPreview: { from: "Dan", text: "Meet by the main door, I’ve sent the tickets." },
    payment: SAM_COMEDY_PAYMENT,
  },
});

const COMEDY_FULL = invite({
  ...COMEDY_NIGHT,
  id: "comedy-night-full",
  going: [PRIYA, TOM],
});

const COMEDY_CANCELLED = invite({
  ...COMEDY_NIGHT,
  id: "comedy-night-cancelled",
  going: [],
  status: "cancelled",
  you: {
    role: "guest",
    askThreadId: null,
    payment: {
      ...SAM_COMEDY_PAYMENT,
      inviteId: "comedy-night-cancelled",
      status: "refunded",
      refund: {
        amountPence: 2200,
        reason: "host-cancelled",
        refundedAt: "2026-10-26T18:05:00Z",
        expectedBy: "2026-11-09T18:05:00Z",
      },
    },
  },
});

/** Sam left Comedy night more than 24 hours before and was refunded in full. */
const COMEDY_LEFT = invite({
  ...COMEDY_NIGHT,
  id: "comedy-night-left",
  going: [],
  you: {
    payment: {
      ...SAM_COMEDY_PAYMENT,
      inviteId: "comedy-night-left",
      status: "refunded",
      refund: {
        amountPence: 2200,
        reason: "left-in-time",
        refundedAt: "2026-10-27T09:41:00Z",
        expectedBy: "2026-11-10T09:41:00Z",
      },
    },
  },
});

const ALL: OpenInvite[] = [
  SATURDAY_CLASS,
  SUNDAY_WALK,
  PADEL_PIZZA,
  GALLERY_LATE,
  COMEDY_NIGHT,
  FIVE_KM,
  CLIMBING,
  POLO_MATCH,
  PADEL_FULL,
  PADEL_ASKED,
  GALLERY_CANCELLED,
  SATURDAY_SPIN,
  SUNDAY_WALK_PAST,
  COMEDY_PAID,
  COMEDY_FULL,
  COMEDY_CANCELLED,
  COMEDY_LEFT,
];

// ---------------------------------------------------------------- the example feed and Yours


/** The browse page: upcoming plans, soonest first. The first card is the one Sam is in, with 1 unread. */
export const EXAMPLE_FEED: OpenInviteFeed = {
  invites: [
    { ...SATURDAY_CLASS, you: { ...SATURDAY_CLASS.you, unreadInChat: 1 } },
    SUNDAY_WALK,
    PADEL_PIZZA,
    GALLERY_LATE,
    COMEDY_NIGHT,
    FIVE_KM,
    CLIMBING,
    POLO_MATCH,
  ],
  yoursCount: 2,
  me: SAM,
  now: EXAMPLE_NOW,
};

/** Yours: posted by Sam, joined by Sam, and past. */
export const EXAMPLE_YOURS: OpenInviteYours = {
  posted: [CLIMBING, POLO_MATCH],
  joined: [SATURDAY_CLASS, COMEDY_PAID],
  past: [SATURDAY_SPIN, SUNDAY_WALK_PAST],
  me: SAM,
  now: EXAMPLE_NOW,
  yoursCount: 2,
};

/**
 * Which plan a chat or question id belongs to, and how (the Messages example
 * adapter builds a thread from it when it has none of its own, so every
 * "Open chat", "Ask ..." and host question on an invite opens a screen).
 */
export function findInviteByThreadId(
  threadId: string,
): { invite: OpenInvite; kind: "plan" | "ask" | "question"; from: InviteMember | null; text: string | null } | null {
  for (const entry of ALL) {
    if (entry.you.chatId === threadId) return { invite: entry, kind: "plan", from: null, text: null };
    if (entry.you.askThreadId === threadId) return { invite: entry, kind: "ask", from: null, text: null };
    const asked = entry.you.questions.find((q) => q.threadId === threadId);
    if (asked) return { invite: entry, kind: "question", from: asked.from, text: asked.text };
  }
  // The harness's stand-in "I'm in" and Pay and join (components/members/invite/preview-state.ts) open chat-<plan id>.
  for (const entry of ALL) {
    if (threadId === `chat-${entry.id}`) return { invite: entry, kind: "plan", from: null, text: null };
  }
  return null;
}

/** The example plans, for the preview harness and the fake adapters. */
export const EXAMPLE_INVITES = {
  saturdayClass: SATURDAY_CLASS,
  sundayWalk: SUNDAY_WALK,
  padelPizza: PADEL_PIZZA,
  gallery: GALLERY_LATE,
  comedy: COMEDY_NIGHT,
  fiveKm: FIVE_KM,
  climbing: CLIMBING,
  polo: POLO_MATCH,
  padelFull: PADEL_FULL,
  padelAsked: PADEL_ASKED,
  galleryCancelled: GALLERY_CANCELLED,
  spin: SATURDAY_SPIN,
  sundayWalkPast: SUNDAY_WALK_PAST,
  comedyPaid: COMEDY_PAID,
  comedyFull: COMEDY_FULL,
  comedyCancelled: COMEDY_CANCELLED,
  comedyLeft: COMEDY_LEFT,
} as const;

export const EXAMPLE_PEOPLE = { SAM, JASMIN, PRIYA, TOM, MARCUS, AISHA, DAN, CHLOE, OLLIE } as const;

export const EXAMPLE_TYPES: readonly InviteType[] = ["Sport", "Food and drink", "Wellness", "Culture", "Something else"];
