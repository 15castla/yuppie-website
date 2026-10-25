// EXAMPLE DATA: invented people and places, never shown to real members (flag off, 404 in production)
//
// The fake adapter for Messages, Updates, Blocked members and the
// notification settings. It returns exactly the types in
// lib/members/messages/types.ts, from the shared example content of the
// approved designs (v3 CONTENT.md and CONTENT3.md): Sam is the signed-in
// member; Jasmin, Priya, Tom, Marcus, Aisha, Dan, Chloe and Ollie are
// invented. Only "Psycle, Oxford Circus" is a real venue (approved for the
// public site); every other place is a placeholder. The example clock is Fri 23
// Oct 2026, 10:41 (London). Nothing is stored: every change a member makes on
// the screens (send, report, block, leave, mute, a switch) is client state.

import { examplePhoto, type ExamplePhotoKey } from "./example-photos";
import type {
  BlockedMember,
  Chat,
  ChatItem,
  ChatMessage,
  ChatParticipant,
  ChatPlan,
  ChatSystemLine,
  ChatThread,
  MemberRef,
  NotificationPreferences,
  UnreadCounts,
  UpdateItem,
} from "../messages/types";
import { DEFAULT_CHANNELS, DEFAULT_TOPICS } from "../messages/types";

/** The example clock: Fri 23 Oct 2026, 10:41 London (BST). */
export const EXAMPLE_NOW = "2026-10-23T10:41:00+01:00";

const person = (id: string, firstName: string, key: ExamplePhotoKey): MemberRef => ({
  id,
  firstName,
  photoUrl: examplePhoto(key),
});

export const SAM = person("sam", "Sam", "S");
export const JASMIN = person("jasmin", "Jasmin", "J");
export const PRIYA = person("priya", "Priya", "P");
export const TOM = person("tom", "Tom", "T");
export const MARCUS = person("marcus", "Marcus", "M");
export const AISHA = person("aisha", "Aisha", "A");
export const DAN = person("dan", "Dan", "D");
export const CHLOE = person("chloe", "Chloe", "C");
export const OLLIE = person("ollie", "Ollie", "O");

export const EXAMPLE_PEOPLE: Record<string, MemberRef> = {
  sam: SAM,
  jasmin: JASMIN,
  priya: PRIYA,
  tom: TOM,
  marcus: MARCUS,
  aisha: AISHA,
  dan: DAN,
  chloe: CHLOE,
  ollie: OLLIE,
};

// ---------------------------------------------------------------------------
// The plans the chats belong to (clocks go back on Sun 25 Oct: +01:00 before, +00:00 after)

const BRUNCH: ChatPlan = {
  id: "saturday-morning-class",
  title: "Saturday morning class + brunch",
  startsAt: "2026-10-24T10:00:00+01:00",
  place: "Psycle, Oxford Circus",
  host: JASMIN,
  going: [JASMIN, PRIYA, SAM],
  placesLeft: 1,
  priceMinor: null,
  status: "open",
};

const WALK: ChatPlan = {
  id: "sunday-walk-and-coffee",
  title: "Sunday walk and coffee",
  startsAt: "2026-10-25T11:00:00+00:00",
  place: "Calder Park",
  host: PRIYA,
  going: [PRIYA, AISHA, OLLIE, SAM],
  placesLeft: 2,
  priceMinor: null,
  status: "open",
};

const PADEL: ChatPlan = {
  id: "padel-then-pizza",
  title: "Padel, then pizza",
  startsAt: "2026-10-29T19:00:00+00:00",
  place: "Northgate Courts",
  host: TOM,
  going: [TOM, DAN, CHLOE],
  placesLeft: 1,
  priceMinor: null,
  status: "open",
};

const RIVER_RUN: ChatPlan = {
  id: "5km-by-the-river",
  title: "5km by the river, then breakfast",
  startsAt: "2026-10-31T08:00:00+00:00",
  place: "Calder Park",
  host: MARCUS,
  going: [MARCUS, OLLIE, PRIYA, DAN],
  placesLeft: 4,
  priceMinor: null,
  status: "open",
};

const COMEDY: ChatPlan = {
  id: "comedy-night-two-spare-tickets",
  title: "Comedy night, two spare tickets",
  startsAt: "2026-10-30T20:00:00+00:00",
  place: "The Bell Room",
  host: DAN,
  going: [SAM, PRIYA],
  placesLeft: 0,
  priceMinor: 2200,
  status: "open",
};

const COMEDY_CANCELLED: ChatPlan = { ...COMEDY, status: "cancelled" };

const SPIN: ChatPlan = {
  id: "saturday-spin",
  title: "Saturday spin",
  startsAt: "2026-10-17T10:00:00+01:00",
  place: "Psycle, Oxford Circus",
  host: AISHA,
  going: [AISHA, MARCUS, SAM],
  placesLeft: 0,
  priceMinor: null,
  status: "finished",
};

/** Sam's own plan (the Yours view of Open Invite): Wed 4 Nov, full at 4 of 4 once Priya joined. */
const MINE_CLIMBING: ChatPlan = {
  id: "climbing-and-a-pint",
  title: "Climbing and a pint",
  startsAt: "2026-11-04T18:30:00+00:00",
  place: "The Boulder Yard",
  host: SAM,
  going: [SAM, AISHA, MARCUS, PRIYA],
  placesLeft: 0,
  priceMinor: null,
  status: "open",
};

const participant = (member: MemberRef, role: "host" | "member"): ChatParticipant => ({
  member,
  role,
  isYou: member.id === SAM.id,
  blockedByYou: false,
});

// ---------------------------------------------------------------------------
// Chats

const BRUNCH_CHAT: Chat = {
  id: "c-brunch",
  kind: "plan",
  plan: BRUNCH,
  other: null,
  participants: [participant(JASMIN, "host"), participant(PRIYA, "member"), participant(SAM, "member")],
  status: "open",
  closedReason: null,
  muted: false,
  unreadCount: 2,
  lastMessage: { senderId: PRIYA.id, text: "Ignore that, brunch. Obviously brunch.", at: "2026-10-23T09:13:00+01:00" },
  lastActivityAt: "2026-10-23T09:13:00+01:00",
};

const TOM_CHAT: Chat = {
  id: "c-tom",
  kind: "question",
  plan: PADEL,
  other: TOM,
  participants: [participant(TOM, "host"), participant(SAM, "member")],
  status: "open",
  closedReason: null,
  muted: false,
  unreadCount: 1,
  lastMessage: { senderId: TOM.id, text: "Totally. Doubles, all levels, I’ll bring spare rackets.", at: "2026-10-22T17:05:00+01:00" },
  lastActivityAt: "2026-10-22T17:05:00+01:00",
};

const COMEDY_CHAT: Chat = {
  id: "c-comedy",
  kind: "plan",
  plan: COMEDY,
  other: null,
  participants: [participant(DAN, "host"), participant(SAM, "member"), participant(PRIYA, "member")],
  status: "open",
  closedReason: null,
  muted: false,
  unreadCount: 0,
  // As the inbox design draws it: the system line is the last thing the row shows.
  lastMessage: { senderId: null, text: "Priya paid and is in", at: "2026-10-21T20:15:00+01:00" },
  lastActivityAt: "2026-10-21T20:15:00+01:00",
};

const WALK_CHAT: Chat = {
  id: "c-walk",
  kind: "plan",
  plan: WALK,
  other: null,
  participants: [
    participant(PRIYA, "host"),
    participant(AISHA, "member"),
    participant(OLLIE, "member"),
    participant(SAM, "member"),
  ],
  status: "open",
  closedReason: null,
  muted: false,
  unreadCount: 0,
  lastMessage: { senderId: PRIYA.id, text: "Meet by the bandstand.", at: "2026-10-21T18:31:00+01:00" },
  lastActivityAt: "2026-10-21T18:31:00+01:00",
};

const MARCUS_CHAT: Chat = {
  id: "c-marcus",
  kind: "question",
  plan: RIVER_RUN,
  other: MARCUS,
  participants: [participant(MARCUS, "host"), participant(SAM, "member")],
  status: "open",
  closedReason: null,
  muted: false,
  unreadCount: 0,
  lastMessage: { senderId: MARCUS.id, text: "Around six minutes a kilometre, no rush.", at: "2026-10-19T12:30:00+01:00" },
  lastActivityAt: "2026-10-19T12:30:00+01:00",
};

const SPIN_CHAT: Chat = {
  id: "c-spin",
  kind: "plan",
  plan: SPIN,
  other: null,
  participants: [participant(AISHA, "host"), participant(MARCUS, "member"), participant(SAM, "member")],
  status: "closed",
  closedReason: "plan_finished",
  muted: false,
  unreadCount: 0,
  // As the inbox design draws it: Aisha is the sender of the last line.
  lastMessage: { senderId: AISHA.id, text: "Same time next week?", at: "2026-10-18T12:05:00+01:00" },
  lastActivityAt: "2026-10-18T12:05:00+01:00",
};

const COMEDY_CANCELLED_CHAT: Chat = {
  ...COMEDY_CHAT,
  id: "c-comedy-cancelled",
  plan: COMEDY_CANCELLED,
  status: "closed",
  closedReason: "host_cancelled",
};

/** The inbox, in the order the design draws it: open chats by latest activity, then closed ones. */
export const EXAMPLE_CHATS: Chat[] = [BRUNCH_CHAT, TOM_CHAT, COMEDY_CHAT, WALK_CHAT, MARCUS_CHAT, SPIN_CHAT];

// ---------------------------------------------------------------------------
// Threads

const text = (chatId: string, n: number, sender: MemberRef, body: string, sentAt: string): ChatMessage => ({
  kind: "text",
  id: `${chatId}-m${n}`,
  clientId: `${chatId}-cl${n}`,
  chatId,
  senderId: sender.id,
  text: body,
  sentAt,
  status: "visible",
});

const system = (
  chatId: string,
  n: number,
  event: ChatSystemLine["event"],
  who: MemberRef | null,
  at: string,
): ChatSystemLine => ({ kind: "system", id: `${chatId}-s${n}`, at, event, memberId: who?.id ?? null });

function brunchItems(): ChatItem[] {
  const c = "c-brunch";
  return [
    system(c, 1, "opened", JASMIN, "2026-10-21T18:00:00+01:00"),
    text(c, 1, JASMIN, "Welcome both. I’ve booked the 10:00 ride, bikes are sorted at the studio.", "2026-10-21T18:02:00+01:00"),
    text(c, 2, PRIYA, "Brilliant. First time at Psycle, is it a hard one?", "2026-10-21T18:20:00+01:00"),
    text(c, 3, JASMIN, "Hard but fun. Nobody watches you, I promise.", "2026-10-21T18:24:00+01:00"),
    system(c, 2, "joined", SAM, "2026-10-22T08:10:00+01:00"),
    text(c, 4, SAM, "Count me in. Where do we meet?", "2026-10-22T08:15:00+01:00"),
    text(c, 5, JASMIN, "Outside the studio at 09:45. Brunch place is two minutes away.", "2026-10-22T08:40:00+01:00"),
    // A phone number goes through: it is plain text, not a link.
    text(c, 6, JASMIN, "I’m on 07700 900456 if you get lost.", "2026-10-22T08:45:00+01:00"),
    text(c, 7, PRIYA, "I’ll bring my own towel. Anyone want a coffee after?", "2026-10-23T09:12:00+01:00"),
    text(c, 8, PRIYA, "Ignore that, brunch. Obviously brunch.", "2026-10-23T09:13:00+01:00"),
  ];
}

function tomItems(): ChatItem[] {
  const c = "c-tom";
  return [
    text(c, 1, SAM, "Is this fine for a beginner?", "2026-10-22T16:40:00+01:00"),
    text(c, 2, TOM, "Totally. Doubles, all levels, I’ll bring spare rackets.", "2026-10-22T17:05:00+01:00"),
  ];
}

function walkItems(): ChatItem[] {
  const c = "c-walk";
  return [
    system(c, 1, "opened", PRIYA, "2026-10-21T17:30:00+01:00"),
    text(c, 1, PRIYA, "Gentle loop, about an hour, then coffee. Dogs welcome.", "2026-10-21T17:40:00+01:00"),
    text(c, 2, AISHA, "Count me in.", "2026-10-21T17:52:00+01:00"),
    // The reported message of the Reports example (reason: pressure to pay outside the app).
    text(c, 3, OLLIE, "Easier if you just send me the money, bank details in my bio.", "2026-10-21T18:20:00+01:00"),
    text(c, 4, SAM, "See you there.", "2026-10-21T18:25:00+01:00"),
    text(c, 5, PRIYA, "Meet by the bandstand.", "2026-10-21T18:31:00+01:00"),
  ];
}

function comedyItems(): ChatItem[] {
  const c = "c-comedy";
  return [
    system(c, 1, "opened", DAN, "2026-10-21T18:05:00+01:00"),
    text(c, 1, DAN, "Can’t make it, so these are yours at face value. Doors are at 19:30.", "2026-10-21T18:10:00+01:00"),
    system(c, 2, "paid", SAM, "2026-10-21T18:55:00+01:00"),
    text(c, 2, SAM, "Got them, thank you. Are they seats?", "2026-10-21T19:02:00+01:00"),
    text(c, 3, DAN, "Seats, row F, side by side. I’ll send the tickets to your phone tonight.", "2026-10-21T19:10:00+01:00"),
    system(c, 3, "paid", PRIYA, "2026-10-21T20:10:00+01:00"),
    text(c, 4, PRIYA, "Hi both. Is the door easy to find?", "2026-10-21T20:15:00+01:00"),
  ];
}

function comedyCancelledItems(): ChatItem[] {
  return [
    ...comedyItems().map((item) => ({ ...item, id: item.id.replace("c-comedy", "c-comedy-cancelled") })),
    system("c-comedy-cancelled", 4, "cancelled", DAN, "2026-10-22T09:30:00+01:00"),
  ];
}

function spinItems(): ChatItem[] {
  const c = "c-spin";
  return [
    text(c, 1, AISHA, "Great ride, everyone. Brunch was worth it.", "2026-10-17T11:48:00+01:00"),
    text(c, 2, SAM, "Best hour of my week. Thanks for organising.", "2026-10-17T11:52:00+01:00"),
    text(c, 3, MARCUS, "Same time next week?", "2026-10-17T12:05:00+01:00"),
    system(c, 1, "closed", null, "2026-10-18T10:00:00+01:00"),
  ];
}

function marcusItems(): ChatItem[] {
  const c = "c-marcus";
  return [
    text(c, 1, SAM, "How fast is the pace? I’m a beginner.", "2026-10-19T12:10:00+01:00"),
    text(c, 2, MARCUS, "Around six minutes a kilometre, no rush.", "2026-10-19T12:30:00+01:00"),
  ];
}

function climbingItems(): ChatItem[] {
  const c = "c-climbing";
  return [
    system(c, 1, "opened", SAM, "2026-10-19T19:05:00+01:00"),
    system(c, 2, "joined", AISHA, "2026-10-19T19:30:00+01:00"),
    system(c, 3, "joined", MARCUS, "2026-10-19T20:10:00+01:00"),
    system(c, 4, "joined", PRIYA, "2026-10-23T10:32:00+01:00"),
  ];
}

const thread = (chat: Chat, items: ChatItem[], firstUnreadId: string | null, safetyNoteSeen = true): ChatThread => ({
  chat,
  items,
  firstUnreadId,
  safetyNoteSeen,
});

/** Sam's own plan has a chat too, but it is not in the inbox list (the design's list is the five the member has news from). */
const CLIMBING_CHAT: Chat = {
  id: "c-climbing",
  kind: "plan",
  plan: MINE_CLIMBING,
  other: null,
  participants: [participant(SAM, "host"), participant(AISHA, "member"), participant(MARCUS, "member"), participant(PRIYA, "member")],
  status: "open",
  closedReason: null,
  muted: false,
  unreadCount: 0,
  lastMessage: null,
  lastActivityAt: "2026-10-23T10:32:00+01:00",
};

export const EXAMPLE_THREADS: Record<string, ChatThread> = {
  "c-brunch": thread(BRUNCH_CHAT, brunchItems(), "c-brunch-m7"),
  "c-tom": thread(TOM_CHAT, tomItems(), "c-tom-m2"),
  "c-comedy": thread(COMEDY_CHAT, comedyItems(), null),
  "c-comedy-cancelled": thread(COMEDY_CANCELLED_CHAT, comedyCancelledItems(), null),
  "c-walk": thread(WALK_CHAT, walkItems(), null),
  "c-marcus": thread(MARCUS_CHAT, marcusItems(), null),
  "c-spin": thread(SPIN_CHAT, spinItems(), null),
  "c-climbing": thread(CLIMBING_CHAT, climbingItems(), null),
};

/** A brand new question: nothing sent yet (Sam asking Tom about Padel, then pizza). */
export const EXAMPLE_NEW_QUESTION: ChatThread = thread(
  { ...TOM_CHAT, id: "c-tom-new", unreadCount: 0, lastMessage: null },
  [],
  null,
);

EXAMPLE_THREADS["c-tom-new"] = EXAMPLE_NEW_QUESTION;

/** The first time a member opens any chat: the safety note shows once, then lives in chat info. */
export const EXAMPLE_FIRST_VISIT: ChatThread = {
  ...EXAMPLE_THREADS["c-brunch"],
  safetyNoteSeen: false,
};

// ---------------------------------------------------------------------------
// Variants for the states the preview draws (a thread with nothing unread, a long message, a removed message)

const nothingUnread = (t: ChatThread): ChatThread => ({
  ...t,
  chat: { ...t.chat, unreadCount: 0 },
  firstUnreadId: null,
});

/** 330 characters from Jasmin: the bubble grows and nothing is truncated. */
export const EXAMPLE_LONG_REPLY =
  "A few things before Saturday. Wear trainers you don’t mind sweating in. The studio lends cycling shoes at the desk, so don’t buy any. Lockers are downstairs and take a pound coin. Arrive ten minutes early so we get bikes side by side, then we walk to brunch together. If you’re running late, say so here and we’ll save you a seat.";

/** 488 of 500 characters: the input grows to four lines and the counter shows. */
export const EXAMPLE_DRAFT_488 =
  "Thanks for all of this. Quick summary so I have it right: we meet outside the studio at 09:45, the ride starts at 10:00, and the studio lends cycling shoes, so I only need a towel and water. " +
  "Lockers take a pound coin, which I will find. Brunch afterwards at the place, two minutes away. I’m happy to book a table for four if someone can tell me roughly what time we’ll be done, " +
  "and I’ll ask the cafe whether they take bookings on a Saturday morning, because it might be busy. Sounds good?";
/** Exactly 500: the counter turns red and typing stops. */
export const EXAMPLE_DRAFT_500 = `${EXAMPLE_DRAFT_488} Thanks all.`;
/** A link: refused before send. */
export const EXAMPLE_DRAFT_LINK = "The brunch place is here: www.example.com/brunch";
/** A phone number goes through. */
export const EXAMPLE_DRAFT_NUMBER = "I’m on 07700 900123 too, ring me when you’re outside.";
export const EXAMPLE_DRAFT_TYPING = "Brilliant, I’ll find you outside at 09:45.";
export const EXAMPLE_DRAFT_KEYBOARD = "On my way. See you outside at 09:45";

const brunchRead = nothingUnread(EXAMPLE_THREADS["c-brunch"]);

export const EXAMPLE_THREAD_VARIANTS = {
  /** The plan chat with nothing unread (no "new messages" divider). */
  brunchRead,
  /** Yesterday's short exchange, then a 330-character message from Jasmin. */
  brunchLong: {
    ...brunchRead,
    items: [
      system("c-brunch", 2, "joined", SAM, "2026-10-22T08:10:00+01:00"),
      text("c-brunch", 4, SAM, "Count me in. Where do we meet?", "2026-10-22T08:15:00+01:00"),
      text("c-brunch", 5, JASMIN, "Outside the studio at 09:45. Brunch place is two minutes away.", "2026-10-22T08:40:00+01:00"),
      text("c-brunch", 9, JASMIN, EXAMPLE_LONG_REPLY, "2026-10-23T09:30:00+01:00"),
    ],
  } satisfies ChatThread,
  /** The first time a member opens a chat: the safety note, over the start of the chat. */
  brunchFirstVisit: {
    ...brunchRead,
    items: brunchRead.items.slice(0, 3),
    safetyNoteSeen: false,
  } satisfies ChatThread,
  /** Ollie's message was reported and removed: "Message removed", for everyone in the chat. */
  walkRemoved: {
    ...EXAMPLE_THREADS["c-walk"],
    items: EXAMPLE_THREADS["c-walk"].items.map((item) =>
      item.kind === "text" && item.id === "c-walk-m3" ? { ...item, status: "removed" as const } : item,
    ),
  } satisfies ChatThread,
} as const;

// ---------------------------------------------------------------------------
// Updates (Open Invite only, newest first)


const update = (item: Partial<UpdateItem> & Pick<UpdateItem, "id" | "kind" | "at" | "plan">): UpdateItem => ({
  read: false,
  chatId: null,
  actor: null,
  role: "host",
  reminderHours: null,
  previousStartsAt: null,
  refundMinor: null,
  goingCount: null,
  ...item,
});

export const EXAMPLE_UPDATES: UpdateItem[] = [
  update({ id: "u1", kind: "joined", at: "2026-10-23T10:32:00+01:00", actor: PRIYA, plan: MINE_CLIMBING, chatId: "c-climbing" }),
  update({ id: "u2", kind: "left", at: "2026-10-23T10:18:00+01:00", actor: TOM, plan: MINE_CLIMBING, chatId: "c-climbing" }),
  update({
    id: "u3",
    kind: "reminder",
    at: "2026-10-23T10:00:00+01:00",
    plan: BRUNCH,
    chatId: "c-brunch",
    role: "going",
    reminderHours: 24,
  }),
  update({
    id: "u4",
    kind: "cancelled",
    at: "2026-10-22T16:20:00+01:00",
    read: true,
    actor: DAN,
    plan: { ...COMEDY_CANCELLED, title: "Comedy night" },
    chatId: "c-comedy-cancelled",
    role: "going",
    refundMinor: 2200,
  }),
  update({
    id: "u5",
    kind: "changed",
    at: "2026-10-22T11:05:00+01:00",
    read: true,
    actor: PRIYA,
    plan: { ...WALK, startsAt: "2026-10-25T11:30:00+00:00" },
    chatId: "c-walk",
    role: "going",
    previousStartsAt: "2026-10-25T11:00:00+00:00",
  }),
  update({ id: "u6", kind: "full", at: "2026-10-19T19:00:00+01:00", read: true, plan: MINE_CLIMBING, chatId: "c-climbing", goingCount: 4 }),
];

export const EXAMPLE_UNREAD: UnreadCounts = { chats: 2, updates: 3 };

// ---------------------------------------------------------------------------
// Blocked members

export const EXAMPLE_BLOCKED: BlockedMember[] = [
  { member: OLLIE, blockedAt: "2026-10-24T09:00:00+01:00" },
  { member: CHLOE, blockedAt: "2026-10-21T09:00:00+01:00" },
];

// ---------------------------------------------------------------------------
// Notification settings

export const EXAMPLE_PREFERENCES_WEB: NotificationPreferences = {
  topics: { ...DEFAULT_TOPICS },
  channels: { ...DEFAULT_CHANNELS },
  email: "sam@example.com",
  mobileNumber: "07700 900123",
  textCheck: "none",
  pushPermission: "unavailable",
};

export const EXAMPLE_PREFERENCES_APP: NotificationPreferences = {
  ...EXAMPLE_PREFERENCES_WEB,
  pushPermission: "granted",
};

/** The settings page's other drawn states (specs/notifications.md 3.1). */
export const EXAMPLE_PREFERENCES_VARIANTS = {
  /** Text switched on: the check text was sent. */
  textOn: {
    ...EXAMPLE_PREFERENCES_WEB,
    channels: { ...DEFAULT_CHANNELS, text: true },
    textCheck: "sent",
  } satisfies NotificationPreferences,
  /** No mobile number on file: the Text switch stays off. */
  noNumber: { ...EXAMPLE_PREFERENCES_WEB, mobileNumber: null } satisfies NotificationPreferences,
  /** A switch whose save failed (the page marks the row; the switch is where it was). */
  failed: {
    ...EXAMPLE_PREFERENCES_WEB,
    topics: { ...DEFAULT_TOPICS, reminder24: false },
  } satisfies NotificationPreferences,
  /** In the app, with notifications off for Club Yuppie in the phone's settings. */
  denied: { ...EXAMPLE_PREFERENCES_APP, pushPermission: "denied" } satisfies NotificationPreferences,
  /** A mixed set: host updates off, 2 hours off, text on. */
  mixed: {
    ...EXAMPLE_PREFERENCES_APP,
    topics: { ...DEFAULT_TOPICS, host: false, reminder2: false },
    channels: { ...DEFAULT_CHANNELS, text: true },
    textCheck: "verified",
  } satisfies NotificationPreferences,
};

// ---------------------------------------------------------------------------
// The adapter (what the pages call; the backend will replace each function)

export async function listChats(): Promise<Chat[]> {
  return EXAMPLE_CHATS;
}

export async function getThread(chatId: string): Promise<ChatThread | null> {
  return EXAMPLE_THREADS[chatId] ?? null;
}

export async function listUpdates(): Promise<UpdateItem[]> {
  return EXAMPLE_UPDATES;
}

export async function getUnreadCounts(): Promise<UnreadCounts> {
  return EXAMPLE_UNREAD;
}

export async function listBlockedMembers(): Promise<BlockedMember[]> {
  return EXAMPLE_BLOCKED;
}

export async function getNotificationPreferences(mode: "web" | "app"): Promise<NotificationPreferences> {
  return mode === "app" ? EXAMPLE_PREFERENCES_APP : EXAMPLE_PREFERENCES_WEB;
}

/** The signed-in member of the example data. */
export const EXAMPLE_YOU = SAM;
