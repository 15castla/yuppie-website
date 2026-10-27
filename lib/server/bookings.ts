import "server-only";

// Club-event bookings: making them (only through book_event, the database
// function that locks the event row), cancelling them, and refunding them.
//
// Rules (brief 5.3, decisions A-D1, A-D7, A-D8, B-D8, C-D11):
// - A booking is never confirmed without a succeeded PaymentIntent for the
//   event's price, in GBP, carrying this member and event in its metadata.
// - Active, ending and problem members only; not past; not cancelled;
//   capacity under the event row lock. A paid booking that lands on a full
//   event still books and alerts the club (no hold while paying).
// - A member cancels free until FREE_CANCEL_HOURS before the start, with the
//   money going back automatically; after that only "without a refund".
//   If the club moved the event after the booking was made, free whatever
//   the date.
// - Every refund uses the idempotency key refund-booking-<id>, records what
//   happened on the booking, and never throws: a failed refund leaves
//   refund_status 'failed' and alerts the club.

import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import { eventHref, ROUTES } from "@/lib/members/routes";
import type { BookingCancelReason as EmailBookingCancelReason, EmailData } from "@/lib/emails";
import { FREE_CANCEL_HOURS, adminAlertsEmail } from "./config";
import {
  BOOKING_ROW_COLUMNS,
  EVENT_ROW_COLUMNS,
  errorMessage,
  one,
  serviceDb,
  type BookingCancelReason,
  type BookingCancelledBy,
  type BookingRow,
  type EventRow,
  type RefundStatus,
} from "./db";
import { dayDate, dayDateTime, pounds, time24 } from "./format";
import { later } from "./later";
import { sendAdminAlert, sendEmail } from "./messages";
import { cardLabelForPaymentIntent } from "./stripe/card";

export { FREE_CANCEL_HOURS };

const HOUR = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// The cancel rule
// ---------------------------------------------------------------------------

/** The last moment a booking can be cancelled with an automatic refund (start minus 48 hours). */
export function freeCancelUntil(startTime: string | Date): Date {
  return new Date(new Date(startTime).getTime() - FREE_CANCEL_HOURS * HOUR);
}

export type CancelTerms = {
  /** The member may cancel now and get the money back automatically. */
  free: boolean;
  /** window: more than 48 hours to go. changed: the club moved the event after this booking (C-D11). late: inside 48 hours. started: too late to cancel at all. */
  why: "window" | "changed" | "late" | "started";
  /** The free-cancel deadline (start minus 48 hours). */
  freeUntil: Date;
};

export function cancelTerms(
  booking: Pick<BookingRow, "booked_at">,
  event: Pick<EventRow, "start_time" | "changed_at">,
  now: Date = new Date(),
): CancelTerms {
  const start = new Date(event.start_time);
  const freeUntil = freeCancelUntil(start);
  if (start.getTime() <= now.getTime()) return { free: false, why: "started", freeUntil };
  if (event.changed_at && new Date(event.changed_at).getTime() > new Date(booking.booked_at).getTime()) {
    return { free: true, why: "changed", freeUntil };
  }
  if (now.getTime() < freeUntil.getTime()) return { free: true, why: "window", freeUntil };
  return { free: false, why: "late", freeUntil };
}

// ---------------------------------------------------------------------------
// Making a booking
// ---------------------------------------------------------------------------

export type BookingOutcome =
  | { ok: true; status: "booked"; bookingId: string; overCapacity: boolean }
  | { ok: true; status: "already_booked"; bookingId: string; samePayment: boolean }
  | { ok: false; status: "full" | "started" | "cancelled" | "inactive" | "not_found" | "requires_payment" | "error"; error?: string };

async function bookEvent(
  memberId: string,
  eventId: string,
  amountPence: number,
  paymentIntentId: string | null,
  allowOverCapacity: boolean,
): Promise<BookingOutcome> {
  const { data, error } = await serviceDb().rpc("book_event", {
    p_member: memberId,
    p_event: eventId,
    p_amount: amountPence,
    p_payment_intent: paymentIntentId,
    p_allow_over_capacity: allowOverCapacity,
  });
  if (error || !data) {
    console.error(`book_event failed for member ${memberId}, event ${eventId}:`, error);
    return { ok: false, status: "error", error: error?.message ?? "no result" };
  }
  const result = data as { status: string; booking_id?: string; over_capacity?: boolean; same_payment?: boolean };
  if (result.status === "booked" && result.booking_id) {
    return { ok: true, status: "booked", bookingId: result.booking_id, overCapacity: Boolean(result.over_capacity) };
  }
  if (result.status === "already_booked" && result.booking_id) {
    return { ok: true, status: "already_booked", bookingId: result.booking_id, samePayment: Boolean(result.same_payment) };
  }
  if (["full", "started", "cancelled", "inactive", "not_found"].includes(result.status)) {
    return { ok: false, status: result.status as "full" | "started" | "cancelled" | "inactive" | "not_found" };
  }
  return { ok: false, status: "error", error: `unexpected book_event result ${result.status}` };
}

/** Book an event that is included in the membership (price 0). Sends the confirmation after the response. */
export async function bookIncludedEvent(memberId: string, eventId: string): Promise<BookingOutcome> {
  const { data: event } = await serviceDb().from("events").select("price_pence").eq("id", eventId).maybeSingle();
  if (!event) return { ok: false, status: "not_found" };
  if (event.price_pence) return { ok: false, status: "requires_payment" };

  const outcome = await bookEvent(memberId, eventId, 0, null, false);
  if (outcome.ok && outcome.status === "booked") {
    const bookingId = outcome.bookingId;
    later(`booking-confirmed email for ${bookingId}`, () => sendBookingConfirmedEmail(bookingId));
  }
  return outcome;
}

export type PaidBookingResult =
  | { booked: true; bookingId: string }
  | { booked: false; reason: "not_ours" | "not_succeeded" | "amount_mismatch" | "full" | "started" | "cancelled" | "inactive" | "not_found" | "requires_payment" | "error" };

/**
 * Record the booking for a succeeded PaymentIntent. The page (confirmEventPayment)
 * and the webhook (payment_intent.succeeded) both call this, in either order or
 * at once; book_event makes the second call a no-op. Only the call that made
 * the row sends the confirmation and any club alert.
 */
export async function confirmPaidBooking(paymentIntent: Stripe.PaymentIntent): Promise<PaidBookingResult> {
  const memberId = paymentIntent.metadata?.member_id;
  const eventId = paymentIntent.metadata?.event_id;
  if (!memberId || !eventId) return { booked: false, reason: "not_ours" };
  if (paymentIntent.status !== "succeeded") return { booked: false, reason: "not_succeeded" };

  const db = serviceDb();
  const { data: event } = await db.from("events").select(EVENT_ROW_COLUMNS).eq("id", eventId).maybeSingle<EventRow>();
  if (!event) {
    await alertPaidNotBooked(paymentIntent, memberId, eventId, null, "The event no longer exists.");
    return { booked: false, reason: "not_found" };
  }

  // Today's check, kept: the payment must be for this event's price, in pounds.
  if (paymentIntent.currency !== "gbp" || paymentIntent.amount !== event.price_pence || event.price_pence <= 0) {
    await alertPaidNotBooked(
      paymentIntent,
      memberId,
      eventId,
      event,
      `The payment was ${pounds(paymentIntent.amount)} (${paymentIntent.currency}) but the event costs ${pounds(event.price_pence)}.`,
    );
    return { booked: false, reason: "amount_mismatch" };
  }

  const outcome = await bookEvent(memberId, eventId, paymentIntent.amount, paymentIntent.id, true);

  if (outcome.ok && outcome.status === "booked") {
    const bookingId = outcome.bookingId;
    if (outcome.overCapacity) {
      later(`over-capacity alert for ${paymentIntent.id}`, () => flagBookingForReview("over_capacity", paymentIntent, memberId, event));
    }
    later(`booking-confirmed email for ${bookingId}`, () => sendBookingConfirmedEmail(bookingId));
    return { booked: true, bookingId };
  }

  if (outcome.ok && outcome.status === "already_booked") {
    if (!outcome.samePayment) {
      // Booked already under another payment: paid twice (two tabs, say). The
      // booking stands; the second charge needs a look.
      later(`paid-twice alert for ${paymentIntent.id}`, () => flagBookingForReview("paid_twice", paymentIntent, memberId, event));
    }
    return { booked: true, bookingId: outcome.bookingId };
  }

  const why: Record<string, string> = {
    full: "The event is full.",
    started: "The event had already started when the payment went through.",
    cancelled: "The club cancelled the event while the member was paying.",
    inactive: "The membership is paused or has ended.",
    not_found: "The event no longer exists.",
    error: "The booking could not be saved.",
  };
  const reason = outcome.ok ? "error" : outcome.status;
  await alertPaidNotBooked(paymentIntent, memberId, eventId, event, why[reason] ?? "The booking could not be saved.");
  return { booked: false, reason };
}

async function memberName(memberId: string): Promise<string> {
  const { data } = await serviceDb().from("members").select("full_name, email").eq("id", memberId).maybeSingle();
  return data?.full_name?.trim() || data?.email || memberId;
}

async function flagBookingForReview(
  reason: "paid_twice" | "over_capacity",
  paymentIntent: Stripe.PaymentIntent,
  memberId: string,
  event: EventRow,
): Promise<void> {
  console.error(`BOOKING_NEEDS_REVIEW ${reason}: payment intent ${paymentIntent.id}, member ${memberId}, event ${event.id}`);
  const base = {
    memberName: await memberName(memberId),
    event: { title: event.title, start: { date: dayDate(event.start_time), time: time24(event.start_time) } },
    amount: pounds(paymentIntent.amount),
    paymentIntentId: paymentIntent.id,
    memberUrl: `/admin/members/${memberId}`,
  };
  let data: EmailData["admin-booking-review"];
  if (reason === "over_capacity") {
    const { count } = await serviceDb()
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("status", "confirmed");
    data = { ...base, reason, booked: count ?? 0, capacity: event.capacity ?? 0 };
  } else {
    data = { ...base, reason };
  }
  await sendEmail({
    template: "admin-booking-review",
    to: adminAlertsEmail(),
    data,
    dedupeKey: `admin-booking-review:${paymentIntent.id}:${reason}`,
    refs: { memberId, eventId: event.id },
  });
}

async function alertPaidNotBooked(
  paymentIntent: Stripe.PaymentIntent,
  memberId: string,
  eventId: string,
  event: EventRow | null,
  why: string,
): Promise<void> {
  console.error(`BOOKING_NEEDS_REVIEW paid_not_booked: payment intent ${paymentIntent.id}, member ${memberId}, event ${eventId}: ${why}`);
  await sendAdminAlert({
    subject: "Booking needs a look: paid but not booked",
    heading: "Paid, but not booked.",
    lines: [
      `${await memberName(memberId)} paid ${pounds(paymentIntent.amount)} for ${event?.title ?? "an event"}, but no booking was made. ${why}`,
      ...(event ? [`When: ${dayDateTime(event.start_time)}`] : []),
      `Payment: ${paymentIntent.id}`,
      `Open in Stripe: https://dashboard.stripe.com/payments/${paymentIntent.id}`,
      "Nothing was refunded automatically. Refund it in Stripe, or book the member by hand.",
    ],
    dedupeKey: `admin-alert:paid-not-booked:${paymentIntent.id}`,
    refs: { memberId, eventId },
  });
}

// ---------------------------------------------------------------------------
// Emails about one booking
// ---------------------------------------------------------------------------

type BookingWithEvent = BookingRow & {
  event: (EventRow & { address: { address: string } | { address: string }[] | null }) | null;
  member: { id: string; email: string; full_name: string | null } | null;
};

async function loadBooking(bookingId: string): Promise<BookingWithEvent | null> {
  const { data, error } = await serviceDb()
    .from("bookings")
    .select(
      `${BOOKING_ROW_COLUMNS}, event:events(${EVENT_ROW_COLUMNS}, address:event_addresses(address)), member:members(id, email, full_name)`,
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error) console.error(`loadBooking ${bookingId} failed:`, error);
  if (!data) return null;
  const row = data as unknown as BookingWithEvent & { event: unknown; member: unknown };
  return { ...row, event: one(row.event as BookingWithEvent["event"] | BookingWithEvent["event"][]), member: one(row.member as BookingWithEvent["member"] | BookingWithEvent["member"][]) };
}

function addressOf(event: BookingWithEvent["event"]): string | null {
  const a = one(event?.address ?? null);
  return a?.address?.trim() || null;
}

function emailEvent(event: Pick<EventRow, "title" | "start_time">) {
  return { title: event.title, start: { date: dayDate(event.start_time), time: time24(event.start_time) } };
}

/** About ten working days after a date, "Mon 9 Nov" (Stripe's usual 5 to 10). */
export function refundArrivesBy(from: Date | string): string {
  const d = new Date(from);
  let added = 0;
  while (added < 10) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) added += 1;
  }
  return dayDate(d);
}

export async function sendBookingConfirmedEmail(bookingId: string): Promise<void> {
  const booking = await loadBooking(bookingId);
  if (!booking?.event || !booking.member || booking.status !== "confirmed") return;
  const event = booking.event;
  const place = { venue: event.location?.trim() || event.title, address: addressOf(event) };
  const bookingUrl = eventHref(event.slug);
  const calendarUrl = `${eventHref(event.slug)}/calendar.ics`;
  const refs = { memberId: booking.member_id, bookingId: booking.id, eventId: event.id };
  const dedupeKey = `booking-confirmed:${booking.id}`;

  if (booking.amount_pence > 0) {
    const until = freeCancelUntil(event.start_time);
    await sendEmail({
      template: "booking-confirmed",
      to: booking.member.email,
      data: {
        event: emailEvent(event),
        place,
        paid: pounds(booking.amount_pence),
        card: await cardLabelForPaymentIntent(booking.stripe_payment_intent_id),
        cancelUntil: until.getTime() > Date.now() ? { date: dayDate(until), time: time24(until) } : null,
        bookingUrl,
        calendarUrl,
      },
      dedupeKey,
      refs,
    });
  } else {
    await sendEmail({
      template: "booking-confirmed-included",
      to: booking.member.email,
      data: { event: emailEvent(event), place, bookingUrl, calendarUrl },
      dedupeKey,
      refs,
    });
  }
}

async function sendBookingCancelledEmail(
  bookingId: string,
  reason: EmailBookingCancelReason,
  extra: { membershipEndedOn?: string } = {},
): Promise<void> {
  const booking = await loadBooking(bookingId);
  if (!booking?.event || !booking.member || booking.status !== "cancelled") return;
  const refunded = booking.refund_status === "succeeded" || booking.refund_status === "pending";
  const cancelledAt = booking.cancelled_at ?? new Date().toISOString();
  await sendEmail({
    template: "booking-cancelled",
    to: booking.member.email,
    data: {
      reason,
      event: emailEvent(booking.event),
      cancelled: { date: dayDate(cancelledAt), time: time24(cancelledAt) },
      refund:
        refunded && (booking.refund_pence ?? booking.amount_pence) > 0
          ? {
              amount: pounds(booking.refund_pence ?? booking.amount_pence),
              card: await cardLabelForPaymentIntent(booking.stripe_payment_intent_id),
              arrivesBy: refundArrivesBy(cancelledAt),
            }
          : null,
      membershipEndedOn: extra.membershipEndedOn,
      eventsUrl: ROUTES.events,
    },
    dedupeKey: `booking-cancelled:${booking.id}`,
    refs: { memberId: booking.member_id, bookingId: booking.id, eventId: booking.event_id },
  });
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export type RefundOutcome = {
  /** none: nothing to refund. skipped: already refunded (or in hand) by an earlier call. */
  status: "none" | "succeeded" | "pending" | "failed" | "skipped";
  refundPence: number;
  refundId?: string | null;
  error?: string;
};

/**
 * Refund what was paid for a booking, in full. Idempotent: a booking already
 * refunded (or being refunded) is skipped, and Stripe gets the idempotency key
 * refund-booking-<id>. Never throws.
 */
export async function refundBooking(
  booking: Pick<BookingRow, "id" | "amount_pence" | "stripe_payment_intent_id" | "member_id" | "event_id">,
): Promise<RefundOutcome> {
  try {
    if (!booking.stripe_payment_intent_id || booking.amount_pence <= 0) return { status: "none", refundPence: 0 };
    const db = serviceDb();

    const { data: claimed, error: claimError } = await db
      .from("bookings")
      .update({ refund_status: "pending", refund_error: null })
      .eq("id", booking.id)
      .eq("refund_status", "none")
      .select("id");
    if (claimError) throw claimError;
    if (!claimed?.length) {
      const { data: current } = await db.from("bookings").select("refund_status, refund_pence, stripe_refund_id").eq("id", booking.id).maybeSingle();
      const status = (current?.refund_status as RefundStatus | undefined) ?? "none";
      if (status === "failed") return { status: "failed", refundPence: 0, error: "an earlier refund failed" };
      return { status: "skipped", refundPence: current?.refund_pence ?? 0, refundId: current?.stripe_refund_id ?? null };
    }

    let refund: Stripe.Refund;
    try {
      refund = await stripe.refunds.create(
        {
          payment_intent: booking.stripe_payment_intent_id,
          amount: booking.amount_pence,
          reason: "requested_by_customer",
          metadata: { booking_id: booking.id },
        },
        { idempotencyKey: `refund-booking-${booking.id}` },
      );
    } catch (err) {
      const message = errorMessage(err).slice(0, 500);
      console.error(`refundBooking: Stripe refund failed for booking ${booking.id}:`, err);
      await db.from("bookings").update({ refund_status: "failed", refund_error: message }).eq("id", booking.id);
      await alertRefundFailed(booking, message);
      return { status: "failed", refundPence: 0, error: message };
    }

    const status: RefundStatus = refund.status === "succeeded" ? "succeeded" : refund.status === "failed" || refund.status === "canceled" ? "failed" : "pending";
    await db
      .from("bookings")
      .update({ refund_status: status, refund_pence: refund.amount, stripe_refund_id: refund.id, refund_error: status === "failed" ? refund.failure_reason ?? "refund failed" : null })
      .eq("id", booking.id);
    if (status === "failed") {
      await alertRefundFailed(booking, refund.failure_reason ?? "refund failed");
      return { status: "failed", refundPence: 0, refundId: refund.id, error: refund.failure_reason ?? "refund failed" };
    }
    return { status, refundPence: refund.amount, refundId: refund.id };
  } catch (err) {
    console.error(`refundBooking ${booking.id} failed unexpectedly:`, err);
    return { status: "failed", refundPence: 0, error: errorMessage(err) };
  }
}

async function alertRefundFailed(
  booking: Pick<BookingRow, "id" | "amount_pence" | "stripe_payment_intent_id" | "member_id" | "event_id">,
  error: string,
): Promise<void> {
  const { data: event } = await serviceDb().from("events").select("title, start_time").eq("id", booking.event_id).maybeSingle();
  await sendAdminAlert({
    subject: "Booking needs a look: refund failed",
    heading: "A refund didn’t go through.",
    lines: [
      `${await memberName(booking.member_id)} should get ${pounds(booking.amount_pence)} back for ${event?.title ?? "an event"}, but Stripe refused the refund.`,
      ...(event ? [`When: ${dayDateTime(event.start_time)}`] : []),
      `Stripe said: ${error}`,
      `Payment: ${booking.stripe_payment_intent_id}`,
      `Open in Stripe: https://dashboard.stripe.com/payments/${booking.stripe_payment_intent_id}`,
      "The booking is cancelled. Refund it in Stripe by hand; the member is emailed once the refund goes through.",
    ],
    dedupeKey: `admin-alert:refund-failed:${booking.id}`,
    refs: { memberId: booking.member_id, bookingId: booking.id, eventId: booking.event_id },
  });
}

/** charge.refunded: a refund went through (ours, or one made by hand in Stripe). Records it on the booking. */
export async function recordRefundFromCharge(charge: Stripe.Charge): Promise<{ bookingId: string | null; changed: boolean }> {
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return { bookingId: null, changed: false };
  const db = serviceDb();
  const { data: booking } = await db
    .from("bookings")
    .select(BOOKING_ROW_COLUMNS)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle<BookingRow>();
  if (!booking) return { bookingId: null, changed: false };
  if (booking.refund_status === "succeeded" && booking.refund_pence === charge.amount_refunded) {
    return { bookingId: booking.id, changed: false };
  }
  const wasFailed = booking.refund_status === "failed";
  await db
    .from("bookings")
    .update({ refund_status: charge.amount_refunded > 0 ? "succeeded" : booking.refund_status, refund_pence: charge.amount_refunded, refund_error: null })
    .eq("id", booking.id);
  // A refund that failed here and was then made by hand: the member's
  // cancellation email waited for it.
  if (wasFailed && booking.status === "cancelled" && charge.amount_refunded > 0) {
    const reason = booking.cancel_reason;
    if (reason === "event_cancelled") await sendEventCancelledEmail(booking.id);
    else if (reason === "member" || reason === "member_late" || reason === "event_changed" || reason === "membership_ended") {
      await sendBookingCancelledEmail(booking.id, reason);
    }
  }
  return { bookingId: booking.id, changed: true };
}

// ---------------------------------------------------------------------------
// Cancelling
// ---------------------------------------------------------------------------

async function markCancelled(bookingId: string, by: BookingCancelledBy, reason: BookingCancelReason): Promise<BookingRow | null> {
  const { data, error } = await serviceDb()
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: by, cancel_reason: reason })
    .eq("id", bookingId)
    .eq("status", "confirmed")
    .select(BOOKING_ROW_COLUMNS);
  if (error) {
    console.error(`markCancelled ${bookingId} failed:`, error);
    return null;
  }
  return (data?.[0] as BookingRow | undefined) ?? null;
}

export type MemberCancelResult =
  | { ok: true; reason: "member" | "member_late" | "event_changed"; refund: RefundOutcome }
  | { ok: false; reason: "not_found" | "already_cancelled" | "started" | "late" | "error"; freeUntil?: string };

/**
 * A member cancels their own booking. Inside 48 hours (and the event not
 * moved) this refuses with "late" unless withoutRefund is set, which cancels
 * with no refund (the sheet's quiet "Cancel without a refund").
 */
export async function cancelBookingByMember(
  memberId: string,
  bookingId: string,
  options: { withoutRefund?: boolean } = {},
): Promise<MemberCancelResult> {
  try {
    const { data } = await serviceDb()
      .from("bookings")
      .select(`${BOOKING_ROW_COLUMNS}, event:events(${EVENT_ROW_COLUMNS})`)
      .eq("id", bookingId)
      .eq("member_id", memberId)
      .maybeSingle();
    if (!data) return { ok: false, reason: "not_found" };
    const booking = data as unknown as BookingRow & { event: EventRow | EventRow[] | null };
    const event = one(booking.event);
    if (!event) return { ok: false, reason: "not_found" };
    if (booking.status !== "confirmed") return { ok: false, reason: "already_cancelled" };

    const terms = cancelTerms(booking, event);
    if (terms.why === "started") return { ok: false, reason: "started", freeUntil: terms.freeUntil.toISOString() };
    if (!terms.free && !options.withoutRefund) return { ok: false, reason: "late", freeUntil: terms.freeUntil.toISOString() };

    const reason = terms.free ? (terms.why === "changed" ? "event_changed" : "member") : "member_late";
    const cancelled = await markCancelled(booking.id, "member", reason);
    if (!cancelled) return { ok: false, reason: "already_cancelled" };

    const refund = terms.free ? await refundBooking(cancelled) : { status: "none" as const, refundPence: 0 };
    if (refund.status !== "failed") {
      later(`booking-cancelled email for ${booking.id}`, () => sendBookingCancelledEmail(booking.id, reason));
    }
    return { ok: true, reason, refund };
  } catch (err) {
    console.error(`cancelBookingByMember ${bookingId} failed:`, err);
    return { ok: false, reason: "error" };
  }
}

async function sendEventCancelledEmail(bookingId: string): Promise<void> {
  const booking = await loadBooking(bookingId);
  if (!booking?.event || !booking.member) return;
  const refunded = booking.refund_status === "succeeded" || booking.refund_status === "pending";
  await sendEmail({
    template: "event-cancelled",
    to: booking.member.email,
    data: {
      event: emailEvent(booking.event),
      reason: booking.event.cancel_note,
      refund:
        refunded && (booking.refund_pence ?? 0) > 0
          ? { amount: pounds(booking.refund_pence ?? booking.amount_pence), card: await cardLabelForPaymentIntent(booking.stripe_payment_intent_id) }
          : null,
      eventsUrl: ROUTES.events,
    },
    dedupeKey: `event-cancelled:${booking.id}`,
    refs: { memberId: booking.member_id, bookingId: booking.id, eventId: booking.event_id },
  });
}

export type EventCancelSummary = {
  ok: boolean;
  error?: string;
  /** Bookings cancelled by this call. */
  cancelled: number;
  refunded: number;
  refundFailed: number;
  /** Paid bookings whose refund was already done by an earlier call. */
  alreadyRefunded: number;
};

/**
 * The club cancels an event (B-D8): marks it cancelled, cancels every
 * confirmed booking, refunds the paid ones in full and emails each member.
 * Safe to run again: done bookings and refunds are skipped.
 */
export async function cancelBookingsForEvent(
  eventId: string,
  adminId: string | null,
  options: { note?: string | null } = {},
): Promise<EventCancelSummary> {
  const summary: EventCancelSummary = { ok: true, cancelled: 0, refunded: 0, refundFailed: 0, alreadyRefunded: 0 };
  try {
    const db = serviceDb();
    const { data: event } = await db.from("events").select("id, cancelled_at").eq("id", eventId).maybeSingle();
    if (!event) return { ...summary, ok: false, error: "not_found" };
    const note = options.note?.trim() || null;
    const { error: eventError } = await db
      .from("events")
      .update({ cancelled_at: event.cancelled_at ?? new Date().toISOString(), ...(note !== null || !event.cancelled_at ? { cancel_note: note } : {}) })
      .eq("id", eventId);
    if (eventError) return { ...summary, ok: false, error: eventError.message };

    const { data: bookings } = await db.from("bookings").select(BOOKING_ROW_COLUMNS).eq("event_id", eventId).eq("status", "confirmed");
    for (const row of (bookings ?? []) as BookingRow[]) {
      const cancelled = await markCancelled(row.id, "club", "event_cancelled");
      if (!cancelled) continue;
      summary.cancelled += 1;
      const refund = await refundBooking(cancelled);
      if (refund.status === "succeeded" || refund.status === "pending") summary.refunded += 1;
      if (refund.status === "failed") summary.refundFailed += 1;
      if (refund.status !== "failed") {
        later(`event-cancelled email for ${row.id}`, () => sendEventCancelledEmail(row.id));
      }
    }

    // A rerun after a crash: bookings cancelled by an earlier run whose refund never started.
    const { data: leftovers } = await db
      .from("bookings")
      .select(BOOKING_ROW_COLUMNS)
      .eq("event_id", eventId)
      .eq("status", "cancelled")
      .eq("cancel_reason", "event_cancelled")
      .eq("refund_status", "none")
      .gt("amount_pence", 0);
    for (const row of (leftovers ?? []) as BookingRow[]) {
      const refund = await refundBooking(row);
      if (refund.status === "succeeded" || refund.status === "pending") summary.refunded += 1;
      if (refund.status === "failed") summary.refundFailed += 1;
      if (refund.status !== "failed") later(`event-cancelled email for ${row.id}`, () => sendEventCancelledEmail(row.id));
    }
    const { count } = await db
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("refund_status", "succeeded");
    summary.alreadyRefunded = Math.max(0, (count ?? 0) - summary.refunded);
    void adminId;
    return summary;
  } catch (err) {
    console.error(`cancelBookingsForEvent ${eventId} failed:`, err);
    return { ...summary, ok: false, error: errorMessage(err) };
  }
}

export type CancelledFutureBooking = {
  bookingId: string;
  eventId: string;
  title: string;
  startTime: string;
  amountPence: number;
  refund: RefundOutcome;
};

/**
 * When a membership ends (A-D8) or the account is deleted: cancel every
 * confirmed booking for an event that has not started, refund paid ones in
 * full, and (membership ended) email each one. Safe to run again.
 */
export async function cancelFutureBookingsForMember(
  memberId: string,
  reason: "membership_ended" | "account_deleted",
  options: { membershipEndedOn?: string; email?: boolean } = {},
): Promise<CancelledFutureBooking[]> {
  const out: CancelledFutureBooking[] = [];
  try {
    const db = serviceDb();
    const { data } = await db
      .from("bookings")
      .select(`${BOOKING_ROW_COLUMNS}, event:events!inner(${EVENT_ROW_COLUMNS})`)
      .eq("member_id", memberId)
      .eq("status", "confirmed")
      .gt("event.start_time", new Date().toISOString());
    for (const raw of (data ?? []) as unknown as (BookingRow & { event: EventRow | EventRow[] | null })[]) {
      const event = one(raw.event);
      if (!event) continue;
      const cancelled = await markCancelled(raw.id, "system", reason);
      if (!cancelled) continue;
      const refund = await refundBooking(cancelled);
      out.push({ bookingId: raw.id, eventId: event.id, title: event.title, startTime: event.start_time, amountPence: raw.amount_pence, refund });
      if (reason === "membership_ended" && options.email !== false && refund.status !== "failed") {
        later(`booking-cancelled email for ${raw.id}`, () =>
          sendBookingCancelledEmail(raw.id, "membership_ended", { membershipEndedOn: options.membershipEndedOn }),
        );
      }
    }
  } catch (err) {
    console.error(`cancelFutureBookingsForMember ${memberId} failed:`, err);
  }
  return out;
}

/** The member's confirmed bookings for events that start after a date (the cancel dialog's D8 warning). */
export async function bookingsAfter(memberId: string, after: string | Date): Promise<{ bookingId: string; title: string; startTime: string; slug: string }[]> {
  const { data } = await serviceDb()
    .from("bookings")
    .select(`id, event:events!inner(${EVENT_ROW_COLUMNS})`)
    .eq("member_id", memberId)
    .eq("status", "confirmed")
    .gt("event.start_time", new Date(after).toISOString());
  return ((data ?? []) as unknown as { id: string; event: EventRow | EventRow[] | null }[])
    .map((row) => ({ row, event: one(row.event) }))
    .filter((x): x is { row: { id: string; event: EventRow | EventRow[] | null }; event: EventRow } => Boolean(x.event))
    .map(({ row, event }) => ({ bookingId: row.id, title: event.title, startTime: event.start_time, slug: event.slug }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}
