// Every email: its data (./types.ts) to the shell's spec (./shell.ts). The
// words are r2c.md's, message by message ("Subject", "Preheader", "Headline",
// "Intro", "Card", "Button", "Small print", "Footer", and the strings under
// "States"). Where a state was not drawn, the comment says which drawn
// strings it reuses; nothing here is new copy except the decline email's
// card line (C-D8, marked).

import { MEMBERSHIP_PRICE, SUPPORT_EMAIL, absoluteUrl, firstWord, shortDate } from "./config";
import { html, inlineLink, join, escapeText, type Inline } from "./escape";
import { whereValue, type CardRow, type EmailSpec, type ResolvedOptions } from "./shell";
import type {
  AccountDeletedData,
  AdminBookingReviewData,
  AdminNewApplicationData,
  ApplicationReceivedData,
  ApprovalData,
  BookingCancelledData,
  BookingConfirmedData,
  BookingConfirmedIncludedData,
  CancelRequestedData,
  DeclineData,
  EmailChangedData,
  EmailData,
  EmailDateTime,
  EmailName,
  EmailPlace,
  EventCancelledData,
  EventChangedData,
  EventReminderData,
  MembershipEndedData,
  PaymentFailedData,
} from "./types";

const INK = "#1B1512";

const at = (dt: EmailDateTime) => `${dt.date}, ${dt.time}`;
const hasAddress = (place: EmailPlace) => Boolean(place.address && place.address.trim());
const where = (place: EmailPlace): CardRow => {
  const w = whereValue(place);
  return { label: "Where", value: w.value, map: w.map };
};
const row = (label: string, value: Inline): CardRow => ({ label, value });
const rowIf = (label: string, value: Inline | null | undefined): CardRow[] =>
  value === null || value === undefined || (typeof value === "string" && !value.trim()) ? [] : [row(label, value)];
const withStop = (s: string) => (/[.?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

const WHY_APPLIED = "You’re getting this because you applied to Club Yuppie.";
const WHY_BOOKED = "You’re getting this because you booked an event with Club Yuppie.";
const WHY_ADMIN = "This goes to the admin address.";

type Build<N extends EmailName> = (data: EmailData[N], o: ResolvedOptions) => EmailSpec;

// ---------------------------------------------------------------- 1. joining

const applicationReceived: Build<"application-received"> = (d: ApplicationReceivedData) => ({
  subject: "We’ve got your application",
  pre: "Your card hasn’t been charged. You’ll hear from us by text and email.",
  label: "Application received",
  h1: { a: "Thanks for applying.", b: "We’ll be in touch.", br: true },
  intro: ["Your application is with our membership committee now. If you’re in, you’ll hear from us by text and email."],
  blocks: [{ kind: "card", rows: [row("Name", d.fullName.trim()), row("Sent", at(d.sent)), row("Card", "Saved, not charged")] }],
  below: `If you’re in, it’s ${MEMBERSHIP_PRICE} a month. Cancel any time.`,
  art: "rope",
  foot: "applicant",
  why: WHY_APPLIED,
});

const approval: Build<"approval"> = (d: ApprovalData, o) => {
  const first = d.firstName?.trim() ?? "";
  return {
    subject: "You’re in - welcome to Club Yuppie",
    pre: "Your account is ready. Log in with this email address.",
    label: "Welcome",
    // States: with a first name "You’re in, Hannah."; without one just "You’re in."
    h1: first ? { a: "You’re in,", b: withStop(first), br: false } : { a: "You’re in.", b: "", br: false },
    intro: ["The committee said yes, and your account is ready. Log in with this email address and see what’s on."],
    blocks: [
      {
        kind: "card",
        rows: [
          row("Login", d.loginEmail),
          ...rowIf("Paid", d.paid ? `${d.paid}, taken today` : null),
          ...rowIf("Renews", d.renewsOn),
        ],
      },
    ],
    button: { label: "Log in", url: absoluteUrl(d.loginUrl ?? "/member-login", o.site) },
    below: `It’s ${MEMBERSHIP_PRICE} a month. Cancel any time. Each time you log in, we email you a code.`,
    art: "group",
    foot: "applicant",
    why: WHY_APPLIED,
  };
};

const decline: Build<"decline"> = (d: DeclineData, o) => ({
  subject: "Your Club Yuppie application",
  pre: "It’s a no this time. You haven’t been charged.",
  label: "Your application",
  h1: { a: "Thanks for applying.", b: "It’s a no this time.", br: true },
  intro: [
    d.cardReleased
      ? // NEW COPY (C-D8: "the email says so"; r2c drew the email before the decision, without the line).
        "Not everyone gets in, and we don’t explain individual decisions. You haven’t been charged, and we’ve removed the card you saved."
      : "Not everyone gets in, and we don’t explain individual decisions. You haven’t been charged.",
    join(inlineLink("Apply again", absoluteUrl(d.applyUrl ?? "/apply", o.site), INK), " whenever you like."),
  ],
  foot: "applicant",
  why: WHY_APPLIED,
});

// ---------------------------------------------------------------- 2. account

const emailChanged: Build<"email-changed"> = (d: EmailChangedData) => ({
  subject: "Your Club Yuppie login email was changed",
  pre: `It’s now ${d.newEmail}. If that wasn’t you, tell us right away.`,
  label: "Security notice",
  h1: { a: "Your login email", b: "was changed.", br: true },
  intro: [
    "Your Club Yuppie login email was changed. If you made the change, you don’t need to do anything. If you didn’t, email us right away.",
  ],
  blocks: [{ kind: "card", rows: [row("Was", d.oldEmail), row("Now", d.newEmail), row("When", at(d.changed))] }],
  button: { label: "Email us", url: `mailto:${SUPPORT_EMAIL}` },
  below: "From now on, login codes go to the new address.",
  foot: "member",
  why: "We sent this to the address that was on your Club Yuppie account before the change.",
  always: "We always send security emails.",
});

const accountDeleted: Build<"account-deleted"> = (d: AccountDeletedData) => ({
  subject: "Your Club Yuppie account is deleted",
  pre: "Your details, photo and messages are gone. Your membership has ended.",
  label: "Account",
  h1: { a: "Your account", b: "is deleted.", br: true },
  intro: [
    "We’ve deleted your details, photo and messages. Your membership ended today, so there’s no refund for the rest of this month. Nothing more will be taken.",
    // States: only a member who hosted plans sees the second paragraph.
    ...(d.hostedPlans ? ["Plans you were hosting are cancelled, and anyone who paid is refunded."] : []),
  ],
  below: "We keep only what the law asks us to, such as payment records.",
  foot: "member",
  why: "You’re getting this because you asked us to delete your Club Yuppie account.",
  always: "We always send account emails.",
});

// ---------------------------------------------------------------- 3. membership

const cancelRequested: Build<"cancel-requested"> = (d: CancelRequestedData, o) => {
  const short = shortDate(d.endsOn);
  const events = "Events you’ve booked after that date are cancelled and refunded.";
  const plans = "Plans you host after that date are cancelled too, and anyone who paid is refunded.";
  // States: the paragraph shows only when something is booked or hosted after the end date.
  const below = d.hostedPlansAfterEnd ? `${events} ${plans}` : d.bookingsAfterEnd ? events : undefined;
  return {
    subject: `Your membership ends on ${d.endsOn}`,
    pre: "You’ve cancelled, so nothing more is taken. You keep everything until then.",
    label: "Membership",
    h1: { a: "Cancelled.", b: `You’re in until ${short}.`, br: true },
    intro: [`You’ve cancelled, so nothing more is taken. You keep everything until ${short}.`],
    blocks: [
      {
        kind: "card",
        rows: [row("Plan", `${d.price ?? MEMBERSHIP_PRICE} a month`), row("Ends", d.endsOn), row("After", "No more payments")],
      },
    ],
    button: { label: "Keep my membership", url: absoluteUrl(d.keepUrl ?? "/members/you", o.site) },
    below,
    foot: "member",
    why: "You’re getting this because you cancelled your Club Yuppie membership.",
    always: "We always send account emails.",
  };
};

const membershipEnded: Build<"membership-ended"> = (d: MembershipEndedData, o) => {
  const why =
    d.reason === "member_cancelled" ? "You cancelled" : d.reason === "payment_failed" ? "Payment failed" : null;
  return {
    subject: "Your Club Yuppie membership has ended",
    pre: "Nothing more will be taken. Want back in? Apply again.",
    label: "Membership",
    h1: { a: "Your membership", b: "has ended.", br: true },
    intro: [
      d.reason === "payment_failed"
        ? `Your membership ended on ${d.endedOn} because we couldn’t take your ${d.amount ?? MEMBERSHIP_PRICE}.`
        : `Your membership ended on ${d.endedOn}, and nothing more will be taken.`,
      "If you want back in, you’ll need to apply again and go through approval.",
    ],
    // admin_cancelled: no Why words were drawn, so the row is left out.
    blocks: [{ kind: "card", rows: [row("Ended", d.endedOn), ...rowIf("Why", why)] }],
    button: { label: "Apply again", url: absoluteUrl(d.applyUrl ?? "/apply", o.site) },
    foot: "member",
    why: "You’re getting this because your Club Yuppie membership ended.",
    always: "We always send account emails.",
  };
};

const paymentFailed: Build<"payment-failed"> = (d: PaymentFailedData, o) => ({
  subject: `We couldn’t take your ${d.amount}`,
  pre: `Update your card by ${d.until} to keep your membership.`,
  label: "Payment failed",
  h1: { a: "We couldn’t take", b: `your ${d.amount}.`, br: true },
  intro: [`We couldn’t take ${d.amount} on ${shortDate(d.triedOn)}. Update your card by ${shortDate(d.until)} to keep your membership.`],
  blocks: [
    {
      kind: "card",
      rows: [row("Amount", d.amount), ...rowIf("Card", d.card), row("Tried", d.triedOn), row("Until", d.until)],
    },
  ],
  button: { label: "Update card", url: absoluteUrl(d.updateCardUrl ?? "/members/billing", o.site) },
  below: "We’ll try your card again as soon as you save the new one.",
  foot: "member",
  q: "Questions about a payment?",
  why: "You’re getting this because a payment for your Club Yuppie membership failed.",
  always: "We always send payment emails.",
});

// ---------------------------------------------------------------- 4. events

// States (booking confirmed): with no exact address saved yet the Where row
// shows the venue name only, so "The exact address is below/inside" is left
// out and the preheader is the intro's first sentence.
function confirmedIntro(title: string, place: EmailPlace) {
  const first = `Your place at ${title} is confirmed.`;
  return hasAddress(place)
    ? { pre: `${place.venue.trim()}. The exact address is inside.`, intro: `${first} The exact address is below.` }
    : { pre: first, intro: first };
}

const bookingConfirmed: Build<"booking-confirmed"> = (d: BookingConfirmedData, o) => {
  const t = confirmedIntro(d.event.title, d.place);
  return {
    subject: `Booked: ${d.event.title}, ${at(d.event.start)}`,
    pre: t.pre,
    label: "Booking confirmed",
    h1: { a: "Booked.", b: "See you there.", br: true },
    intro: [t.intro],
    blocks: [
      {
        kind: "card",
        rows: [row("Event", d.event.title), row("When", at(d.event.start)), where(d.place), ...rowIf("Card", d.card)],
        total: { label: "Total paid", value: d.paid },
      },
    ],
    button: { label: "See your booking", url: absoluteUrl(d.bookingUrl, o.site) },
    links2: [{ label: "Add to calendar", url: absoluteUrl(d.calendarUrl, o.site) }],
    // A booking made inside the free-cancel window has no deadline to promise: that sentence is left out.
    below:
      "We’ll remind you 24 hours and 2 hours before." +
      (d.cancelUntil ? ` You can cancel until ${at(d.cancelUntil)} and get your ${d.paid} back.` : ""),
    art: "coupes",
    foot: "member",
    why: WHY_BOOKED,
    always: "We always send booking emails.",
  };
};

const bookingConfirmedIncluded: Build<"booking-confirmed-included"> = (d: BookingConfirmedIncludedData, o) => {
  const t = confirmedIntro(d.event.title, d.place);
  return {
    subject: `Booked: ${d.event.title}, ${at(d.event.start)}`,
    pre: t.pre,
    label: "Booking confirmed",
    h1: { a: "Booked.", b: "See you there.", br: true },
    intro: [t.intro],
    blocks: [
      {
        kind: "card",
        rows: [row("Event", d.event.title), row("When", at(d.event.start)), where(d.place), row("Cost", "Included in your membership")],
      },
    ],
    button: { label: "See your booking", url: absoluteUrl(d.bookingUrl, o.site) },
    links2: [{ label: "Add to calendar", url: absoluteUrl(d.calendarUrl, o.site) }],
    below:
      "We’ll remind you 24 hours and 2 hours before. Can’t make it? Cancel up to 48 hours before, so someone else can have your place.",
    art: "coupes",
    foot: "member",
    why: WHY_BOOKED,
    always: "We always send booking emails.",
  };
};

// Booking cancelled. Drawn: the member cancelled in time, paid (the whole
// email) and free (the strings under States). Not drawn, built from drawn
// strings only:
// - member_late and event_changed: the same two layouts (with a refund the
//   paid one, without the free one), without the Cancelled row, whose only
//   drawn value is "More than 48 hours before".
// - membership_ended: the intro is the membership-ended email's first line
//   plus the cancel-requested email's "Events you’ve booked after that date
//   are cancelled and refunded." (free: "Your place has gone back to the
//   other members."), and the footer is the membership-ended email's reason.
const bookingCancelled: Build<"booking-cancelled"> = (d: BookingCancelledData, o) => {
  const { title, start } = d.event;
  const ended = d.reason === "membership_ended";
  const endedLine = `Your membership ended on ${d.membershipEndedOn ?? d.cancelled.date}, and nothing more will be taken.`;
  const inTime = d.reason === "member" ? [row("Cancelled", "More than 48 hours before")] : [];
  const r = d.refund;
  const common = {
    subject: `Cancelled: ${title}, ${start.date}`,
    label: "Booking cancelled",
    button: { label: "See what’s on", url: absoluteUrl(d.eventsUrl ?? "/members/events", o.site) },
    art: "coupes" as const,
    foot: "member" as const,
    why: ended
      ? "You’re getting this because your Club Yuppie membership ended."
      : "You’re getting this because you cancelled a booking with Club Yuppie.",
    always: "We always send payment emails.",
    q: "Questions about a payment?",
  };
  if (r) {
    return {
      ...common,
      pre: `Your ${r.amount} is on its way back. It usually lands in 5 to 10 working days.`,
      h1: { a: `Your ${r.amount} is`, b: "on its way back.", br: true },
      intro: ended
        ? [endedLine, "Events you’ve booked after that date are cancelled and refunded."]
        : [
            `You cancelled ${title}, so you get it all back. It goes to the card you paid with and usually lands in 5 to 10 working days, by ${r.arrivesBy}.`,
          ],
      blocks: [
        {
          kind: "card",
          rows: [row("Event", title), row("When", at(start)), ...inTime, ...rowIf("To", r.card), row("Date", at(d.cancelled))],
          total: { label: "Refunded", value: r.amount },
        },
      ],
      below: "Nothing more to pay. Your place has gone back to the other members.",
    };
  }
  return {
    ...common,
    pre: "Your place has gone back to the other members.",
    h1: { a: "Cancelled.", b: "See you next time.", br: true },
    intro: ended
      ? [endedLine, "Your place has gone back to the other members."]
      : [`You cancelled ${title} on ${at(start)}. Your place has gone back to the other members.`],
    blocks: [{ kind: "card", rows: [row("Event", title), row("When", at(start)), ...inTime, row("Date", at(d.cancelled))] }],
    below: "Nothing to pay and nothing to do.",
  };
};

/** The admin's reason as the words after "because": trimmed, without a leading "because" or a trailing full stop. */
export function cancelReasonClause(reason: string | null | undefined): string {
  return (reason ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^because\s+/i, "")
    .replace(/[.!\s]+$/, "")
    .trim();
}

const eventCancelled: Build<"event-cancelled"> = (d: EventCancelledData, o) => {
  const { title, start } = d.event;
  const because = cancelReasonClause(d.reason);
  // States: with no reason the first sentence ends after the date.
  const first = because ? `We’re cancelling ${title} on ${start.date} because ${because}.` : `We’re cancelling ${title} on ${start.date}.`;
  const r = d.refund;
  return {
    subject: `${title} on ${start.date} is cancelled`,
    pre: r ? `Your ${r.amount} is on its way back to your card.` : "Nothing to pay and nothing to do.",
    label: "Event cancelled",
    h1: { a: title, b: "is off.", br: true },
    intro: [
      r
        ? `${first} Your ${r.amount} is on its way back to the card you paid with. It usually lands in 5 to 10 working days.`
        : `${first} It was part of your membership, so there’s nothing to pay or to get back.`,
    ],
    blocks: [
      r
        ? {
            kind: "card",
            rows: [row("Event", title), row("Was", at(start)), ...rowIf("To", r.card)],
            total: { label: "Refunded", value: r.amount },
          }
        : { kind: "card", rows: [row("Event", title), row("Was", at(start))] },
    ],
    button: { label: "See what’s on", url: absoluteUrl(d.eventsUrl ?? "/members/events", o.site) },
    below: "Nothing to do. You didn’t have to ask.",
    foot: "member",
    why: WHY_BOOKED,
    always: "We always send booking emails.",
    q: "Questions about a payment?",
  };
};

// Event changed. Drawn: a time change on a paid event. "Lists only what
// moved: time, place, or both (a place change adds a Was row for the
// place)": a place change says "place" where the drawn email says "time"
// and asks "Can’t make it now?" (the plan-changed email's words); an
// included event has nothing to refund, so the refund words are left out.
const eventChanged: Build<"event-changed"> = (d: EventChangedData, o) => {
  const { title, start } = d.event;
  const was = d.wasStart;
  const moved = d.moved;
  const timeMoved = moved !== "place" && was !== undefined;
  const placeMoved = moved !== "time";
  const nowWhen = was && was.date !== start.date ? at(start) : start.time;
  const venue = d.place.venue.trim();
  const pre =
    moved === "place"
      ? `It’s now at ${venue}. Your booking stands.`
      : moved === "both"
        ? `It’s now ${nowWhen} at ${venue}. Your booking stands.`
        : `It’s now ${nowWhen}. Your booking stands.`;
  const what = moved === "place" ? "place" : moved === "both" ? "time and place" : "time";
  const changed = moved === "both" ? `The time and place for ${title} have changed.` : `The ${what} for ${title} has changed.`;
  const ifNot = `If the new ${moved === "both" ? "time or place" : what} doesn’t work, you can cancel${d.paid ? " for a full refund" : ""}.`;
  const ask = moved === "time" ? "Can’t make the new time?" : "Can’t make it now?";
  const rows: CardRow[] = [row("Event", title)];
  if (timeMoved && was) rows.push(row("Was", at(was)), row("Now", at(start)));
  else rows.push(row("When", at(start)));
  if (placeMoved && d.wasVenue) rows.push(row("Was", d.wasVenue));
  rows.push(where(d.place));
  return {
    subject: `Date or place changed: ${title}`,
    pre,
    label: "Event changed",
    h1: { a: "Something’s moved.", b: "Your booking stands.", br: true },
    intro: [`${changed} ${ifNot}`],
    blocks: [{ kind: "card", rows }],
    button: { label: "See your booking", url: absoluteUrl(d.bookingUrl, o.site) },
    below: d.paid
      ? `${ask} Cancel from your booking and get your ${d.paid} back, whatever the date.`
      : `${ask} Cancel from your booking, whatever the date.`,
    foot: "member",
    switchLink: true,
    why: WHY_BOOKED,
  };
};

// Event reminder (round 3, notif-email-reminder-event and the 2-hour row on
// notif-board-text): only the subject, headline and first line change.
const eventReminder: Build<"event-reminder"> = (d: EventReminderData, o) => {
  const { title, start } = d.event;
  const two = d.window === "2h";
  return {
    subject: two ? `In 2 hours, ${start.time}: ${title}` : `Tomorrow, ${start.time}: ${title}`,
    pre: `${d.place.venue.trim()}. Your booking is below.`,
    label: "Event reminder",
    h1: { a: two ? "In 2 hours." : `Tomorrow at ${start.time}.`, b: "See you there.", br: true },
    intro: [
      two
        ? `${title} starts at ${start.time}.${hasAddress(d.place) ? " Here’s the address." : ""}`
        : `${title} is tomorrow. Here’s everything you need.`,
    ],
    blocks: [{ kind: "card", rows: [row("Event", title), row("When", at(start)), where(d.place)] }],
    button: { label: "See your booking", url: absoluteUrl(d.bookingUrl, o.site) },
    art: "coupes",
    foot: "member",
    switchLink: true,
    why: WHY_BOOKED,
  };
};

// ---------------------------------------------------------------- 5. Albert's inbox

const adminNewApplication: Build<"admin-new-application"> = (d: AdminNewApplicationData, o) => {
  const name = d.fullName.trim();
  const role = d.role?.trim() || "";
  const employer = d.employer?.trim() || "";
  const roleRow = [role, employer].filter(Boolean).join(", ");
  const roleAt = role && employer ? `${role} at ${employer}` : role || employer;
  return {
    subject: `New application: ${name}`,
    pre: roleAt ? `${roleAt}. Card saved, not charged.` : "Card saved, not charged.",
    label: "Application",
    h1: { a: "New application.", b: withStop(name), br: true },
    intro: [`${firstWord(name)} applied at ${d.sent.time}. The card is saved and hasn’t been charged.`],
    blocks: [
      {
        kind: "card",
        rows: [
          row("Name", name),
          ...rowIf("Role", roleRow),
          row("Sent", at(d.sent)),
          row("Card", "Saved, not charged"),
          row("Waiting", `${d.waiting} application${d.waiting === 1 ? "" : "s"}`),
        ],
      },
    ],
    button: { label: "Review application", url: absoluteUrl(d.reviewUrl ?? "/admin/applications", o.site) },
    below: "Phone, LinkedIn and Instagram are in the admin console, not in this email.",
    foot: "admin",
    why: WHY_ADMIN,
  };
};

// Booking needs review. Drawn: paid twice, and over capacity (strings under
// States). refund_failed and paid_not_booked were added for the foundation
// in the same layout, in the drawn email's plain style (an internal email to
// Albert): what happened, then what to do.
function reviewWords(d: AdminBookingReviewData, member: string, title: string) {
  switch (d.reason) {
    case "paid_twice":
      return {
        subject: "Booking needs review: paid twice",
        pre: `${member} paid twice for ${title}. One payment needs refunding.`,
        intro: `${member} was already booked on ${title} when a second payment of ${d.amount} went through. No second booking was made. The extra payment probably needs refunding.`,
        reason: "Paid twice",
        detail: null,
        below: "The booking stands. Nothing was refunded automatically.",
      };
    case "over_capacity":
      return {
        subject: "Booking needs review: over capacity",
        pre: `${title} now has ${d.booked} of ${d.capacity} places booked after ${member} paid.`,
        intro: `${title} now has ${d.booked} of ${d.capacity} places booked after ${member} paid ${d.amount}. The booking stands. You may want to refund one place.`,
        reason: "Over capacity",
        detail: null,
        below: "The booking stands. Nothing was refunded automatically.",
      };
    case "refund_failed":
      return {
        subject: "Booking needs review: refund failed",
        pre: `Stripe refused the ${d.amount} refund to ${member} for ${title}. Refund it by hand.`,
        intro: `${member}’s booking on ${title} is cancelled, but Stripe refused the ${d.amount} refund. Refund it by hand in Stripe.`,
        reason: "Refund failed",
        detail: { label: "Error", value: d.detail },
        below: "The booking stays cancelled. The money hasn’t gone back yet.",
      };
    case "paid_not_booked":
      if (d.refunded) {
        return {
          subject: "Booking needs review: paid, not booked",
          pre: `${member} paid ${d.amount} for ${title}, but no booking was made. It was refunded automatically.`,
          intro: `${member} paid ${d.amount} for ${title}, but the booking couldn’t be recorded, so the payment was refunded automatically. Nothing to do, unless you want to book them in by hand.`,
          reason: "Paid, not booked",
          detail: { label: "Why", value: d.detail },
          below: "Nothing was booked. The payment was refunded automatically.",
        };
      }
      return {
        subject: "Booking needs review: paid, not booked",
        pre: `${member} paid ${d.amount} for ${title}, but no booking was made.`,
        intro: `${member} paid ${d.amount} for ${title}, but the booking couldn’t be recorded. Book them in by hand, or refund the payment in Stripe.`,
        reason: "Paid, not booked",
        detail: { label: "Why", value: d.detail },
        below: "Nothing was booked and nothing was refunded automatically.",
      };
  }
}

const mono = (id: string) =>
  html(`<span style="font-size:14px;line-height:20px;font-weight:700;word-break:break-all;">${escapeText(id)}</span>`, id);

const adminBookingReview: Build<"admin-booking-review"> = (d: AdminBookingReviewData, o) => {
  const { title, start } = d.event;
  const member = d.memberName.trim();
  const pi = d.paymentIntentId;
  const w = reviewWords(d, member, title);
  return {
    subject: w.subject,
    pre: w.pre,
    label: "Needs review",
    h1: { a: "Booking needs", b: "a look.", br: true },
    intro: [w.intro],
    blocks: [
      {
        kind: "card",
        rows: [
          row("Member", member),
          row("Event", title),
          row("When", at(start)),
          row("Reason", w.reason),
          ...rowIf(w.detail?.label ?? "", w.detail?.value?.trim() || null),
          row("Amount", d.amount),
          ...(d.bookingId?.trim() ? [row("Booking", mono(d.bookingId.trim()))] : []),
          row("Payment", mono(pi)),
        ],
      },
    ],
    button: {
      label: "Open in Stripe",
      url: absoluteUrl(d.stripeUrl ?? `https://dashboard.stripe.com/payments/${encodeURIComponent(pi)}`, o.site),
    },
    links2: [{ label: "Open the member", url: absoluteUrl(d.memberUrl ?? "/admin/members", o.site) }],
    below: w.below,
    foot: "admin",
    why: WHY_ADMIN,
  };
};

export const BUILDERS: { [N in EmailName]: Build<N> } = {
  "application-received": applicationReceived,
  approval,
  decline,
  "email-changed": emailChanged,
  "account-deleted": accountDeleted,
  "cancel-requested": cancelRequested,
  "membership-ended": membershipEnded,
  "payment-failed": paymentFailed,
  "booking-confirmed": bookingConfirmed,
  "booking-confirmed-included": bookingConfirmedIncluded,
  "booking-cancelled": bookingCancelled,
  "event-cancelled": eventCancelled,
  "event-changed": eventChanged,
  "event-reminder": eventReminder,
  "admin-new-application": adminNewApplication,
  "admin-booking-review": adminBookingReview,
};

export const EMAIL_NAMES = Object.keys(BUILDERS) as EmailName[];
