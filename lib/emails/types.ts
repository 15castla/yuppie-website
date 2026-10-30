// The contract between the emails module (lib/emails, owned by the emails
// agent) and the code that sends (lib/server/messages, the foundation).
//
// One name per email or text, and one typed data object per name. Every value
// an email shows comes from here: the renderer never reads the database, the
// clock or Stripe. Dates and times are formatted by the caller, in
// Europe/London, in the kit's style ("Tue 27 Oct" and a 24-hour "18:30"),
// because the You page and the event pages show the same strings and they
// must agree. The renderer escapes every value, keeps dates on one line, and
// makes every link absolute on NEXT_PUBLIC_SITE_URL (https://clubyuppie.com
// when unset).
//
// The words, layout and states are the approved round 2 designs
// (rebrand/v4/specs/r2c.md, files out/r2c-send-*.html|.txt) and, for the
// reminders and the chat nudge, round 3 (notif-email-reminder-event,
// notif-email-reminder-plan, msg-email-new-message; v3/specs/notifications.md
// 3.4 and 3.7, v3/specs/messages.md 3.7).
//
// Stage 2 (Phase B) added: plan-changed, plan-cancelled, photo-removed,
// admin-new-report, new-message and plan-reminder (emails), and
// reminders-on, event-reminder and plan-reminder (texts).

// ---------------------------------------------------------------- shared shapes

/** A date and a 24-hour time, formatted by the caller (Europe/London): `{ date: "Thu 29 Oct", time: "18:30" }`. */
export type EmailDateTime = { date: string; time: string };

/**
 * A date on its own, formatted by the caller: "Thu 12 Nov" (weekday, day,
 * short month). Where the design shows the short form ("until 12 Nov") the
 * renderer drops the weekday itself, so pass the long form.
 */
export type EmailDate = string;

/** Money, formatted by the caller: "£25", "£10", "£12.50". */
export type EmailMoney = string;

/** The card as the designs write it: "Visa ending 4242". `null` when unknown: its row is left out. */
export type EmailCard = string | null;

/**
 * A link: an absolute URL ("https://…", "mailto:…") or a path on the site
 * ("/members/you", ROUTES.x, eventHref(slug)), which the renderer makes
 * absolute. Optional link fields have the default the design gives.
 */
export type EmailLink = string;

/**
 * Where an event is: the venue name (events.location) and, once the club has
 * saved it, the exact address (event_addresses.address; written on one line
 * with commas or on several lines, either works). With no address the Where
 * row shows the venue name only and Open in Maps searches for the venue
 * (r2c, booking confirmed, States).
 */
export type EmailPlace = { venue: string; address?: string | null };

/** A refund that is on its way to a card. */
export type EmailRefund = {
  /** What goes back: "£25". */
  amount: EmailMoney;
  /** "Visa ending 4242", or null when unknown (the To row is left out). */
  card: EmailCard;
};

// ---------------------------------------------------------------- 1. joining

/** 1. To the applicant, when `submitApplication` succeeds. */
export type ApplicationReceivedData = {
  /** The applicant's full name as typed: "Hannah Reed". */
  fullName: string;
  /** When the application was sent. */
  sent: EmailDateTime;
};

/** 2. The welcome, to the new member after `approve()` (with the welcome text). */
export type ApprovalData = {
  /** First name for the headline ("You’re in, Hannah."). Blank or null gives "You’re in." */
  firstName?: string | null;
  /** The email they log in with (the Login row). */
  loginEmail: string;
  /** The first payment just taken, "£10" (the row reads "£10, taken today"). null or absent: the Paid row is left out. */
  paid?: EmailMoney | null;
  /** The renewal date from the subscription, "Wed 25 Nov". null or absent: the Renews row is left out. */
  renewsOn?: EmailDate | null;
  /** Default "/member-login". */
  loginUrl?: EmailLink;
};

/** 3. To the applicant, when an admin declines with the email switch on (B-D3, C-D2). Never a text. */
export type DeclineData = {
  /**
   * True once the saved card was released in Stripe (C-D8, the payment
   * method detached). Then the email says so. False if the release failed or
   * there was no card: the line is left out, so the email never claims it.
   */
  cardReleased: boolean;
  /** Default "/apply". */
  applyUrl?: EmailLink;
};

// ---------------------------------------------------------------- 2. login and account (Resend; the codes are Supabase templates)

/** 6. Security notice to the OLD address, after a login email change is confirmed. */
export type EmailChangedData = {
  /** The address before the change (the Was row; the email goes here). */
  oldEmail: string;
  /** The address now (the Now row and the preheader). */
  newEmail: string;
  /** When the change went through. */
  changed: EmailDateTime;
};

/** 8. To the member's address, sent just before the account is anonymised (brief 5.6). */
export type AccountDeletedData = {
  /** True when the member hosted Open Invite plans (Phase B): adds "Plans you were hosting are cancelled…". Default false. */
  hostedPlans?: boolean;
  /**
   * True when the club deleted it (the admin's Delete member, the same deleteAccount path): the email does not
   * say the member asked. Default false: Delete my account, "because you asked us to".
   */
  byClub?: boolean;
};

// ---------------------------------------------------------------- 3. membership

/** 9. The member cancelled (cancel at period end). */
export type CancelRequestedData = {
  /** The day access ends (members.cancel_at): "Thu 12 Nov". The headline and intro show "12 Nov". */
  endsOn: EmailDate;
  /** The plan price, default "£10" (the Plan row reads "£10 a month"). */
  price?: EmailMoney;
  /** True when the member has a club event booked after `endsOn` (A-D8): adds "Events you’ve booked after that date are cancelled and refunded." */
  bookingsAfterEnd: boolean;
  /** Phase B: true when they host an Open Invite plan after `endsOn`. Default false. */
  hostedPlansAfterEnd?: boolean;
  /** "Keep my membership". Default "/members/you". */
  keepUrl?: EmailLink;
};

/**
 * Why the membership ended (members.ended_reason). The design draws two:
 * "member_cancelled" (Why: You cancelled) and "payment_failed" (Why: Payment
 * failed, and the first line names the amount). "admin_cancelled" has no
 * drawn Why words, so its Why row is left out.
 */
export type MembershipEndedReason = "member_cancelled" | "payment_failed" | "admin_cancelled";

/** 10. The membership has ended (Stripe customer.subscription.deleted, or the memberships job). */
export type MembershipEndedData = {
  /** The day it ended: "Thu 12 Nov". */
  endedOn: EmailDate;
  reason: MembershipEndedReason;
  /** The payment that failed, "£10". Used by "payment_failed" only; default "£10". */
  amount?: EmailMoney;
  /** "Apply again". Default "/apply". */
  applyUrl?: EmailLink;
};

/** 11. A membership payment failed (Stripe invoice.payment_failed): once per failed invoice. */
export type PaymentFailedData = {
  /** "£10". Also in the subject: "We couldn’t take your £10". */
  amount: EmailMoney;
  /** "Visa ending 4242", or null (row left out). */
  card: EmailCard;
  /** The day the payment failed (members.payment_failed_at): "Thu 12 Nov". */
  triedOn: EmailDate;
  /** The last day to fix it (members.grace_until, tried plus 3 days, C-D12): "Sun 15 Nov". The You page shows the same date. */
  until: EmailDate;
  /** "Update card": the Stripe billing portal entry. Default "/members/billing" (the design's route). */
  updateCardUrl?: EmailLink;
};

// ---------------------------------------------------------------- 4. events

/** The event an email is about. */
export type EmailEvent = {
  /** events.title: "Padel & Pints". */
  title: string;
  /** The start: `{ date: "Thu 29 Oct", time: "18:30" }`. */
  start: EmailDateTime;
};

/** 12. A paid booking was recorded (send once, from the path that inserted the row). */
export type BookingConfirmedData = {
  event: EmailEvent;
  place: EmailPlace;
  /** What was paid (bookings.amount_pence, formatted): "£25". */
  paid: EmailMoney;
  /** "Visa ending 4242", or null (row left out). */
  card: EmailCard;
  /**
   * The free-cancel deadline (start minus FREE_CANCEL_HOURS, A-D1): `{ date: "Tue 27 Oct", time: "18:30" }`.
   * null when it has already passed (a booking made inside 48 hours): the
   * "You can cancel until … and get your £25 back." sentence is left out.
   */
  cancelUntil: EmailDateTime | null;
  /** "See your booking": the event page. */
  bookingUrl: EmailLink;
  /** "Add to calendar": the event's .ics file. */
  calendarUrl: EmailLink;
};

/** 13. A booking for an event included in the membership was recorded. */
export type BookingConfirmedIncludedData = {
  event: EmailEvent;
  place: EmailPlace;
  bookingUrl: EmailLink;
  calendarUrl: EmailLink;
  /**
   * The 48-hour mark (start minus FREE_CANCEL_HOURS). null when it has already passed (a booking made inside
   * 48 hours): "Cancel up to 48 hours before" is left out. Left out of the data (older callers): kept in.
   */
  cancelUntil?: EmailDateTime | null;
};

/**
 * Why a booking was cancelled (bookings.cancel_reason, the ones that email
 * the member about one booking):
 * - "member": the member cancelled in the free window (drawn, paid and free).
 * - "member_late": the member chose "Cancel without a refund" inside 48 hours (A-D1).
 * - "event_changed": the member cancelled after the club moved the event (C-D11: full refund whatever the date).
 * - "membership_ended": the membership ended and this future booking went with it (A-D8, refunded in full).
 * Only "member" is drawn word for word; see renderers/booking-cancelled.ts for what the others reuse.
 */
export type BookingCancelReason = "member" | "member_late" | "event_changed" | "membership_ended" | "not_booked";

/** For "not_booked" (QA1-12): why a payment that went through could not become a booking. */
export type NotBookedWhy = "event_cancelled" | "event_started" | "event_gone" | "membership_paused" | "membership_ended";

/** 14. One booking was cancelled. */
export type BookingCancelledData = {
  reason: BookingCancelReason;
  event: EmailEvent;
  /** When it was cancelled (bookings.cancelled_at): the Date row. */
  cancelled: EmailDateTime;
  /**
   * The refund, or null when nothing goes back (an included event, or a late
   * cancel without a refund). With a refund the email is the drawn paid one;
   * without, the free one (no To row, no Refunded total).
   */
  refund: (EmailRefund & {
    /** About 10 working days after the cancel date: "Mon 9 Nov" ("…usually lands in 5 to 10 working days, by Mon 9 Nov."). */
    arrivesBy: EmailDate;
  }) | null;
  /** For "membership_ended": the day the membership ended, "Thu 12 Nov". */
  membershipEndedOn?: EmailDate;
  /**
   * For "member_late" on a paid booking (cancelled inside 48 hours without a refund): what was paid, "£25". The
   * email then says it is not refunded. Left out for an included booking.
   */
  notRefunded?: EmailMoney;
  /**
   * For "not_booked" (QA1-12): the payment went through just as booking stopped being possible, so nothing was
   * booked and it was refunded in full automatically (refund is then required). One email per payment.
   */
  notBookedWhy?: NotBookedWhy;
  /** "See what’s on". Default "/members/events". */
  eventsUrl?: EmailLink;
};

/** 15. The club cancelled an event: one email per confirmed booking (B-D8). */
export type EventCancelledData = {
  event: EmailEvent;
  /**
   * The admin's optional reason, the words after "because":
   * "the courts are closed that evening". Trimmed; a leading "because" and a
   * trailing full stop are dropped. Blank or null: the sentence ends after the date.
   */
  reason?: string | null;
  /** The refund for a paid booking, or null for an included one. */
  refund: EmailRefund | null;
  /** "See what’s on". Default "/members/events". */
  eventsUrl?: EmailLink;
};

/**
 * What the club moved (r2c 16: "Lists only what moved: time, place, or both").
 * "time" covers a new date, a new start time, or both.
 */
export type EventChangeKind = "time" | "place" | "both";

/** 16. The club changed the date, time or place of an event this member is booked on. */
export type EventChangedData = {
  moved: EventChangeKind;
  /** The title and the start as it is NOW. */
  event: EmailEvent;
  /** The start before the change (the Was row). Needed for "time" and "both". */
  wasStart?: EmailDateTime;
  /** The venue before the change (the second Was row). Needed for "place" and "both". */
  wasVenue?: string;
  /** Where it is now (unchanged for "time"). */
  place: EmailPlace;
  /** What this member paid, "£25", for "…get your £25 back, whatever the date." null for an included event. */
  paid: EmailMoney | null;
  /** "See your booking": the event page. */
  bookingUrl: EmailLink;
};

/** Which reminder: the day before at the same clock time, or 2 hours before. */
export type ReminderWindow = "24h" | "2h";

/** Event reminder emails (round 3, notif-email-reminder-event), 24 hours and 2 hours before. */
export type EventReminderData = {
  window: ReminderWindow;
  event: EmailEvent;
  place: EmailPlace;
  bookingUrl: EmailLink;
};

// ---------------------------------------------------------------- 4b. Open Invite plans (stage 2: free plans only)

/**
 * The Open Invite plan an email is about. Plan titles and places are typed by
 * the host: pass them as they are (the renderer escapes them).
 */
export type EmailPlan = {
  /** The plan's title: "Sunday walk and coffee". */
  title: string;
  /** The start: `{ date: "Sun 25 Oct", time: "11:30" }`. */
  start: EmailDateTime;
};

/**
 * 17. A host changed the time or place of a plan: to everyone who is in (not the host). The time row covers a new
 * date, a new time or both, as for a club event ("time" | "place" | "both", EventChangeKind).
 */
export type PlanChangedData = {
  moved: EventChangeKind;
  /** The host's first name: "Priya" ("Priya changed the time for …", the Host row). */
  hostName: string;
  /** The title and the start as it is NOW. */
  plan: EmailPlan;
  /** The start before the change (the Was row). Needed for "time" and "both". */
  wasStart?: EmailDateTime;
  /** The place before the change (the second Was row). Needed for "place" and "both". */
  wasPlace?: string;
  /** Where it is now, as the host typed it ("Calder Park"): the Where row with Open in Maps. */
  place: string;
  /** "See the plan": openInviteHref(id). */
  planUrl: EmailLink;
};

/**
 * 18. A host cancelled a FREE plan: to everyone who was in. Free wording only ("Nothing to pay and nothing to
 * do."). A paid plan never uses this email: stage 3 sends the approved round 3 refund email
 * (pay-email-refund-host) as its own name, so nothing here changes then.
 */
export type PlanCancelledData = {
  /** The host's first name: "Priya". */
  hostName: string;
  /** The title and the start it had. */
  plan: EmailPlan;
  /** As the host typed it: "Calder Park". */
  place: string;
  /** "See Open Invite". Default "/members/open-invite" (ROUTES.openInvite). */
  openInviteUrl?: EmailLink;
};

/** 24h and 2h before a plan: to the host (when going) and everyone who is in (round 3, notif-email-reminder-plan). */
export type PlanReminderData = {
  window: ReminderWindow;
  plan: EmailPlan;
  /** As the host typed it: "Psycle, Oxford Circus" (the Where row with Open in Maps, and the preheader). */
  place: string;
  /**
   * First names of the others going, in the order they said yes (the host first when going), WITHOUT the member
   * this goes to: ["Jasmin", "Priya"] gives "Jasmin and Priya are going too." and "Going: Jasmin, Priya and you".
   * Empty: those words and the Going row are left out.
   */
  others: string[];
  /** "See the plan": openInviteHref(id). */
  planUrl: EmailLink;
};

// ---------------------------------------------------------------- 4c. Messages (stage 2)

/**
 * Which chat the nudge is about. "plan": a plan chat (drawn). "question": a member asked the host a question, to the
 * host. "reply": the host answered, to the member who asked. Every chat belongs to a plan, so the chat is named by
 * the plan's title; the sender is never named (messages decision 1 A).
 */
export type ChatEmailKind = "plan" | "question" | "reply";

/**
 * The chat nudge (round 3, msg-email-new-message): unread after 15 minutes, at most one per chat an hour, none when
 * the member turned email off or muted the chat (the dispatcher decides). Never the message text or the sender.
 */
export type NewMessageData = {
  /** Default "plan". */
  kind?: ChatEmailKind;
  /** The chat's plan: its title is the chat name. */
  plan: EmailPlan;
  /** The plan's place as the host typed it (the Where row). */
  place: string;
  /** Unread messages in this chat, 1 or more (the New row: "2 messages"). */
  newCount: number;
  /** "Read the chat". Default "/members/messages" (as drawn); messageThreadHref(chatId) works too. */
  chatUrl?: EmailLink;
};

// ---------------------------------------------------------------- 4d. Photos (stage 2)

/**
 * Why the club removed a photo (photo spec: the admin's Remove dialog, three reasons, stored and shown to the member):
 * "not_clear" it wasn’t a clear photo of you; "not_member" it wasn’t a photo of the member; "not_suitable" it wasn’t
 * suitable for the club.
 */
export type PhotoRemovedReason = "not_clear" | "not_member" | "not_suitable";

/** 7. To the member, when an admin removes their photo in the Photos queue. */
export type PhotoRemovedData = {
  reason: PhotoRemovedReason;
  /** "Add a new photo". Default "/members" (as drawn: the photo gate meets them there). */
  addPhotoUrl?: EmailLink;
};

// ---------------------------------------------------------------- 5. Albert's inbox (to ADMIN_ALERTS_EMAIL, C-D7)

/** 19. One per new application. */
export type AdminNewApplicationData = {
  /** "Hannah Reed". The intro uses the first word ("Hannah applied at 09:41."). */
  fullName: string;
  /** applications.role_title: "Associate". Optional. */
  role?: string | null;
  /** applications.employer: "Calder Partners". Optional. */
  employer?: string | null;
  sent: EmailDateTime;
  /** Pending applications, this one included (the Waiting row: "3 applications"). */
  waiting: number;
  /** "Review application". Default "/admin/applications". */
  reviewUrl?: EmailLink;
};

/** What was reported (lib/members/messages/types.ts ReportTarget kinds). */
export type ReportEmailKind = "message" | "member" | "photo" | "plan";

/**
 * 20. One per new report (messages decision 4 A, C-D7). The reported words or photo are never in the email: only
 * the reason, the names and the counts.
 */
export type AdminNewReportData = {
  kind: ReportEmailKind;
  /** The reason as the member picked it (the label, not the id): "Pressure to pay outside the app". Also the subject. */
  reason: string;
  /** First name of the member reported (for a plan, its host): "Ollie". */
  about: string;
  /** First name of the member who reported: "Sam". */
  by: string;
  /** "message": the title of the plan the chat belongs to; "plan": the plan's title. Not used for member and photo. */
  planTitle?: string | null;
  /** When the report was sent. */
  sent: EmailDateTime;
  /** Open reports, this one included (the Open row: "2 reports"). */
  open: number;
  /** "Open the report". Default "/admin/reports". */
  reportUrl?: EmailLink;
};

/**
 * Why a paid booking needs a look. Drawn: "paid_twice" and "over_capacity"
 * (flagBookingForReview). Added for the foundation in the same layout:
 * "refund_failed" (Stripe refused a refund: refund by hand) and
 * "paid_not_booked" (the money was taken but no booking could be recorded:
 * book them by hand or refund).
 */
export type BookingReviewReason = "paid_twice" | "over_capacity" | "refund_failed" | "paid_not_booked";

/** 21. A paid booking needs a look. */
export type AdminBookingReviewData = {
  /** "Sam Taylor". */
  memberName: string;
  event: EmailEvent;
  /** The payment that went through (for refund_failed: the refund Stripe refused): "£25". */
  amount: EmailMoney;
  /** The Stripe PaymentIntent id (the Payment row and the Stripe link). */
  paymentIntentId: string;
  /** bookings.id, when there is one: adds a Booking row. Optional for every reason. */
  bookingId?: string;
  /** "Open in Stripe". Default https://dashboard.stripe.com/payments/<paymentIntentId> (pass the /test/ one in test mode if wanted). */
  stripeUrl?: EmailLink;
  /** "Open the member". Default "/admin/members". */
  memberUrl?: EmailLink;
} & (
  | { reason: "paid_twice" }
  | {
      reason: "over_capacity";
      /** Confirmed bookings now, this one included, and the capacity: "25 of 24 places". */
      booked: number;
      capacity: number;
    }
  | {
      reason: "refund_failed";
      /** Stripe's error text, as Stripe gave it (the Error row): "This charge has already been refunded." Optional. */
      detail?: string;
    }
  | {
      reason: "paid_not_booked";
      /** Why the booking was blocked (the Why row): "The event was cancelled before the payment went through." Optional. */
      detail?: string;
      /** The payment could never be booked and was refunded automatically (fixer 1, QA3-09). Optional, default false. */
      refunded?: boolean;
    }
);

// ---------------------------------------------------------------- the maps

/** Every email sent through Resend. The three Supabase Auth emails are files in supabase/templates/, not these. */
export type EmailData = {
  "application-received": ApplicationReceivedData;
  approval: ApprovalData;
  decline: DeclineData;
  "email-changed": EmailChangedData;
  "account-deleted": AccountDeletedData;
  "cancel-requested": CancelRequestedData;
  "membership-ended": MembershipEndedData;
  "payment-failed": PaymentFailedData;
  "booking-confirmed": BookingConfirmedData;
  "booking-confirmed-included": BookingConfirmedIncludedData;
  "booking-cancelled": BookingCancelledData;
  "event-cancelled": EventCancelledData;
  "event-changed": EventChangedData;
  "event-reminder": EventReminderData;
  "admin-new-application": AdminNewApplicationData;
  "admin-booking-review": AdminBookingReviewData;
  // stage 2
  "plan-changed": PlanChangedData;
  "plan-cancelled": PlanCancelledData;
  "plan-reminder": PlanReminderData;
  "new-message": NewMessageData;
  "photo-removed": PhotoRemovedData;
  "admin-new-report": AdminNewReportData;
};

export type EmailName = keyof EmailData;

/** What renderEmail returns: everything a send needs except the addresses (see EMAIL_FROM, EMAIL_REPLY_TO). */
export type RenderedEmail = {
  subject: string;
  /** The inbox preview line (already inside the html, hidden). */
  preheader: string;
  html: string;
  /** The plain-text part, the same words. */
  text: string;
};

/** The welcome text, C-D4 A: "Club Yuppie: You’re in. Log in: clubyuppie.com/member-login". */
export type WelcomeTextData = Record<string, never>;

/** Sent once when a member turns texts on (the check text): "Club Yuppie: reminders by text are on. Turn them off any time at …". */
export type RemindersOnTextData = Record<string, never>;

/**
 * A reminder by text (r2c "Texts", round 3 notif-board-text), 24 hours or 2 hours before a club event or an Open
 * Invite plan. The words are fixed; the renderer keeps the text in the standard alphabet and one part:
 * - a plan title is cut at 40 characters and a plan place at 30, with no ellipsis (notifications 3.7);
 * - typed punctuation that would make the whole text Unicode (’ ‘ “ ” – — … and the like) is written as its plain
 *   twin in the inserted values, so a host’s "Sam’s drinks" does not double the cost.
 * smsCount(body) gives the characters, the encoding and the parts for message_log.
 */
export type ReminderTextData = {
  window: ReminderWindow;
  /** The event or plan title: "Padel & Pints". */
  title: string;
  /** The start, 24-hour: "18:30". */
  time: string;
  /** Club event: the venue (events.location), "Northgate Courts". Plan: the place as typed, "Psycle, Oxford Circus". */
  place: string;
  /**
   * Quiet hours (notifications decision 2 B) hold a text due between 22:00 and 07:00 until 07:00, so it no longer
   * lands exactly 24 or 2 hours before. Pass the day it now lands on, relative to the start: "today" gives
   * "… is today at 18:30, …" (NEW COPY), "tomorrow" gives the 24-hour words. Leave out for a text sent on time.
   */
  day?: "today" | "tomorrow";
};

/** Every text sent through Twilio (sender name "ClubYuppie"). Texts are reminders only, plus the welcome. */
export type TextData = {
  welcome: WelcomeTextData;
  // stage 2
  "reminders-on": RemindersOnTextData;
  "event-reminder": ReminderTextData;
  "plan-reminder": ReminderTextData;
};

export type TextName = keyof TextData;

export type RenderEmail = <N extends EmailName>(name: N, data: EmailData[N]) => RenderedEmail;
export type RenderText = <N extends TextName>(name: N, data: TextData[N]) => string;
