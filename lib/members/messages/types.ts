// Messages and notification settings: the data the screens need, and so the
// data the backend supplies (BUILD_BRIEF section 6, "types first"). Stage 2
// built it: lib/server/chats.ts, updates.ts, blocks.ts, reports.ts and
// notification-prefs.ts return exactly these types, through the actions in
// app/members/messages/ and app/members/you/. The preview harness draws the
// same types from fixtures (lib/members/mock/messages.ts).
//
// Conventions
//   - Every timestamp is ISO 8601 with an offset ("2026-10-23T09:13:00+01:00").
//     The views format it in Europe/London, 24-hour, with a leading zero.
//   - Money is in pence ("priceMinor": 2200 is £22). A free plan has null.
//   - A member is always a MemberRef: a first name and a photo (a member with
//     no photo cannot be in a chat, so photoUrl is only null for a photo the
//     club has just removed).
//   - Backend rules the screens assume are written next to the type they
//     belong to, under "Backend needs".

// ---------------------------------------------------------------------------
// People

export type MemberRef = {
  id: string;
  /** First name only: the club never shows a surname to another member. */
  firstName: string;
  /** Read from the profile at send time, so a removed photo disappears from old chats too. */
  photoUrl: string | null;
};

// ---------------------------------------------------------------------------
// Chats (the inbox, Chats tab)

/**
 * The Open Invite a chat belongs to. A chat always belongs to an Open Invite:
 * it starts when someone says they are in (a plan chat) or asks the host a
 * question (a question). Nothing else creates a chat.
 */
export type ChatPlan = {
  /** The Open Invite id: openInviteHref(id). */
  id: string;
  title: string;
  startsAt: string;
  /** Typed by the host ("Psycle, Oxford Circus"). */
  place: string;
  host: MemberRef;
  /** Who is in, the host first when the host is going. */
  going: MemberRef[];
  /** 0 means full. */
  placesLeft: number;
  /** Pence per person; null for a free plan. */
  priceMinor: number | null;
  /** "finished" 24 hours after the plan; "cancelled" when the host cancels (then every payment is refunded). */
  status: "open" | "finished" | "cancelled";
  /** Who cancelled it, once cancelled: "club" when the club removed it or cancelled it for its host (optional: the host). */
  cancelledBy?: "host" | "club" | null;
};

export type ChatKind = "plan" | "question";

export type ChatParticipant = {
  member: MemberRef;
  role: "host" | "member";
  isYou: boolean;
  /** You blocked this member: you no longer see their messages, even in a plan chat you share. */
  blockedByYou: boolean;
};

export type ChatPreview = {
  /** null for a system line ("Priya paid and is in"): it has no sender. */
  senderId: string | null;
  text: string;
  at: string;
};

export type Chat = {
  id: string;
  kind: ChatKind;
  plan: ChatPlan;
  /** Question threads only: the other person (the host when you asked, the asker when you host). */
  other: MemberRef | null;
  participants: ChatParticipant[];
  /**
   * "closed" is read only: a plan chat 24 hours after the plan, at once when
   * the host cancels; a question when the invite closes.
   */
  status: "open" | "closed";
  closedReason: "plan_finished" | "host_cancelled" | "invite_closed" | null;
  /** Per member, per chat. A muted chat sends no push and no nudge email, but still shows new messages here. */
  muted: boolean;
  /** Messages you have not seen. The inbox dot is unreadCount > 0. */
  unreadCount: number;
  lastMessage: ChatPreview | null;
  lastActivityAt: string;
};

// ---------------------------------------------------------------------------
// A thread (one chat's messages)

/**
 * A message. Text only, 500 characters (enforced on the server), control
 * characters stripped, rate limit suggested at 20 a minute ("Slow down a
 * moment."). A phone number or an email address goes through; a link is
 * refused with LINK_BLOCKED_LINE. The client sends a clientId so a retry never
 * double posts.
 */
export type ChatMessage = {
  kind: "text";
  id: string;
  clientId: string;
  chatId: string;
  senderId: string;
  text: string;
  sentAt: string;
  /** "removed": a report was upheld; shown as "Message removed" to everyone in the chat. */
  status: "visible" | "removed";
};

/** A line the system writes into the stream. */
export type ChatSystemLine = {
  kind: "system";
  id: string;
  at: string;
  /**
   * opened: "Jasmin opened this chat". joined: "Sam is in". paid: "Sam paid and
   * is in" (only once a payment succeeds). cancelled: "Dan cancelled this plan.
   * Everyone is refunded." (and the chat closes). closed: "This chat closed.
   * Plan chats close 24 hours after the plan."
   */
  event: "opened" | "joined" | "paid" | "cancelled" | "closed";
  /** Who it is about (null for "closed", and for a cancel by the club). */
  memberId: string | null;
  /**
   * That member's name and photo, from the server, so the line keeps their name after they leave the chat
   * (a withdrawn member is no longer a participant). Optional: example data may leave it out.
   */
  member?: MemberRef | null;
};

export type ChatItem = ChatMessage | ChatSystemLine;

export type ChatThread = {
  chat: Chat;
  /** Oldest first. */
  items: ChatItem[];
  /** The "N new messages" divider goes before this item; null when nothing is new. */
  firstUnreadId: string | null;
  /** The first-time safety note has been shown (once ever, then it lives in chat info). */
  safetyNoteSeen: boolean;
};

/** A message waiting to leave the device (client state only, never stored by the backend). */
export type OutgoingMessage = {
  clientId: string;
  text: string;
  state: "sending" | "failed";
};

export const MESSAGE_MAX_LENGTH = 500;
/** The counter shows from this many characters. */
export const MESSAGE_COUNTER_FROM = 450;
/** The counter turns ink up to here, then error red at the limit. */
export const MESSAGE_COUNTER_NEAR = 480;

// ---------------------------------------------------------------------------
// Updates (the inbox, Updates tab)

/**
 * What happened on the plans you host or are in. Open Invite only: Club
 * events never write to it (their reminders arrive by push, email and text).
 * One record per event. Suggest keeping 30 days.
 */
export type UpdateKind = "joined" | "left" | "full" | "place_opened" | "changed" | "cancelled" | "reminder";

export type UpdateItem = {
  id: string;
  kind: UpdateKind;
  at: string;
  read: boolean;
  /** The member it is about (joined, left, cancelled by the host, changed by the host); null when nobody did anything (full, reminder). */
  actor: MemberRef | null;
  /** The plan it is about, as it stands now (the computer's right-hand pane previews it). */
  plan: ChatPlan;
  /** The plan chat you can open from the update, when there is one. */
  chatId: string | null;
  /** Your part in the plan. */
  role: "host" | "going";
  /** reminder: how long before the plan starts. */
  reminderHours: 24 | 2 | null;
  /** changed: the start time before the change. */
  previousStartsAt: string | null;
  /** cancelled on a paid plan: what goes back on your card. */
  refundMinor: number | null;
  /** full: how many are going. */
  goingCount: number | null;
};

/** What the messages icon adds up: unread chats plus unread updates (not messages). 10 or more reads "9+". */
export type UnreadCounts = {
  chats: number;
  updates: number;
};

// ---------------------------------------------------------------------------
// Block and report

export type BlockedMember = {
  member: MemberRef;
  blockedAt: string;
};

/**
 * Block: the blocker no longer sees the other person's messages (even in a
 * plan chat they share) and the other person cannot start a question. The
 * other person is not told and still sees the blocker's messages. Unblock
 * reverses it.
 */
export type BlockAction = { memberId: string; chatId: string | null };

export type MessageReportReason =
  | "rude"
  | "harassment"
  | "spam"
  | "pay_outside"
  | "threats"
  | "other";

/** A member report has one more reason than a message report. */
export type MemberReportReason = MessageReportReason | "photo_not_them_or_unsuitable";

export type PhotoReportReason = "not_them" | "not_suitable" | "other";

export type ReportTarget =
  | { kind: "message"; chatId: string; messageId: string }
  | { kind: "member"; chatId: string; memberId: string }
  | { kind: "photo"; chatId: string | null; memberId: string }
  | { kind: "plan"; planId: string };

export type ReportDraft = {
  target: ReportTarget;
  /** One of the three reason sets, by target kind (a plan report uses the Open Invite designer's reasons). */
  reason: MemberReportReason | PhotoReportReason | string;
};

/**
 * A report, as the moderation queue (admin, not built here) will hold it.
 * Backend needs: record message, reporter, reason, thread context, status and
 * who acted and when; email Albert on every new report and nudge when one is
 * open past 12 hours; remove replaces the message with "Message removed" for
 * everyone and tells the reporter the outcome; suspend takes the member out of
 * every chat and Open Invite until lifted; a photo report goes to the same
 * queue and "Remove photo" asks the member to add another.
 */
export type Report = ReportDraft & {
  id: string;
  reporterId: string;
  createdAt: string;
  status: "open" | "message_removed" | "photo_removed" | "warned" | "suspended" | "dismissed";
};

// ---------------------------------------------------------------------------
// Notification settings

/** The five topics (what a member hears about). */
export type NotificationTopic = "host" | "in" | "reminder24" | "reminder2" | "clubChanges";

/** The three channels (how). */
export type NotificationChannel = "push" | "email" | "text";

/**
 * Push needs the app and its permission. "unavailable": a browser (the web has
 * no push yet). "denied": notifications are off for the app in the phone's
 * settings, so the switch is off and the page offers "Open Settings" (the app
 * cannot turn it on itself). "not_asked": the app has not asked yet (it asks
 * the first time a member says "I'm in" or posts a plan).
 */
export type PushPermission = "granted" | "denied" | "not_asked" | "unavailable";

export type NotificationPreferences = {
  topics: Record<NotificationTopic, boolean>;
  channels: Record<NotificationChannel, boolean>;
  /** Where email goes (the member's account email). */
  email: string;
  /** The mobile number text goes to; null: none on file, so the Text switch stays off until one is added. */
  mobileNumber: string | null;
  /** Switching Text on sends one check text; "Change number" re-verifies. */
  textCheck: "none" | "sent" | "verified";
  pushPermission: PushPermission;
};

/** Defaults: push on (app only), email on, both reminders on, text off, host and in on, club changes on. */
export const DEFAULT_TOPICS: Record<NotificationTopic, boolean> = {
  host: true,
  in: true,
  reminder24: true,
  reminder2: true,
  clubChanges: true,
};
export const DEFAULT_CHANNELS: Record<NotificationChannel, boolean> = {
  push: true,
  email: true,
  text: false,
};

/**
 * One row per thing that can happen (specs/notifications.md 3.5). A
 * notification goes out when its topic is on AND its channel is on AND the
 * channel is allowed for that trigger. The push payload carries the title
 * "Club Yuppie", one line, a thread id (so iOS groups by plan) and a deep link,
 * never a message or a sender name.
 */
export type NotificationTrigger = {
  id: string;
  group: "host" | "in" | "reminders" | "club";
  topic: NotificationTopic | null;
  push: boolean;
  /** Also written to the Updates list. */
  updates: boolean;
  /** "chat_nudge": unread after 15 minutes, at most one per chat per hour, none if muted or email is off. "always": the club's emailed receipts. */
  email: "yes" | "no" | "chat_nudge" | "always";
  text: boolean;
};

export const NOTIFICATION_TRIGGERS: readonly NotificationTrigger[] = [
  { id: "host.joined", group: "host", topic: "host", push: true, updates: true, email: "no", text: false },
  { id: "host.left", group: "host", topic: "host", push: true, updates: true, email: "no", text: false },
  { id: "host.full", group: "host", topic: "host", push: true, updates: true, email: "no", text: false },
  { id: "host.question", group: "host", topic: "host", push: true, updates: false, email: "chat_nudge", text: false },
  { id: "host.message", group: "host", topic: "host", push: true, updates: false, email: "chat_nudge", text: false },
  { id: "host.paid", group: "host", topic: "host", push: true, updates: true, email: "yes", text: false },
  { id: "host.payout", group: "host", topic: "host", push: true, updates: true, email: "yes", text: false },
  { id: "in.message", group: "in", topic: "in", push: true, updates: false, email: "chat_nudge", text: false },
  { id: "in.reply", group: "in", topic: "in", push: true, updates: false, email: "chat_nudge", text: false },
  { id: "in.changed", group: "in", topic: "in", push: true, updates: true, email: "yes", text: false },
  { id: "in.cancelled", group: "in", topic: "in", push: true, updates: true, email: "yes", text: false },
  { id: "in.full", group: "in", topic: "in", push: true, updates: true, email: "no", text: false },
  { id: "in.place_opened", group: "in", topic: "in", push: true, updates: true, email: "no", text: false },
  { id: "reminder.24h", group: "reminders", topic: "reminder24", push: true, updates: true, email: "yes", text: true },
  { id: "reminder.2h", group: "reminders", topic: "reminder2", push: true, updates: true, email: "yes", text: true },
  { id: "club.booked", group: "club", topic: null, push: true, updates: false, email: "always", text: false },
  { id: "club.changed", group: "club", topic: "clubChanges", push: true, updates: false, email: "yes", text: false },
];
