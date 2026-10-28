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
import { FREE_CANCEL_HOURS, MAX_REFUND_ATTEMPTS, REFUND_RETRY_AFTER_MINUTES, adminAlertsEmail } from "./config";
import {
  BOOKING_ROW_COLUMNS,
  EVENT_ROW_COLUMNS,
  errorMessage,
  one,
  serviceDb,
  stripeErrorCode,
  type BookingCancelReason,
  type BookingCancelledBy,
  type BookingRow,
  type EventRow,
  type RefundStatus,
} from "./db";
import { dayDate, pounds, time24 } from "./format";
import { later } from "./later";
import { sendEmail } from "./messages";
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
  | {
      booked: false;
      reason: "not_ours" | "not_succeeded" | "amount_mismatch" | "full" | "started" | "cancelled" | "inactive" | "not_found" | "requires_payment" | "error";
      /** The payment could never be booked (the event was cancelled, started or deleted, or the membership ended), so it was refunded automatically (QA3-09). */
      refunded?: boolean;
    };

/** A database error on the paid path: the webhook answers 500 so Stripe sends the event again, and the page treats it as still processing. */
export class TransientBookingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientBookingError";
  }
}

/**
 * Record the booking for a succeeded PaymentIntent. The page (confirmEventPayment)
 * and the webhook (payment_intent.succeeded) both call this, in either order or
 * at once; book_event makes the second call a no-op. Only the call that made
 * the row sends the confirmation and any club alert.
 *
 * A payment that can never become a booking (the club cancelled the event, it
 * started, it was deleted, or the membership ended while the member paid) is
 * refunded automatically and the club alerted. A full event still books (A-D7).
 * A database error throws TransientBookingError (nothing is decided on it).
 */
export async function confirmPaidBooking(paymentIntent: Stripe.PaymentIntent): Promise<PaidBookingResult> {
  const memberId = paymentIntent.metadata?.member_id;
  const eventId = paymentIntent.metadata?.event_id;
  if (!memberId || !eventId) return { booked: false, reason: "not_ours" };
  if (paymentIntent.status !== "succeeded") return { booked: false, reason: "not_succeeded" };

  const db = serviceDb();
  const { data: event, error: eventError } = await db.from("events").select(EVENT_ROW_COLUMNS).eq("id", eventId).maybeSingle<EventRow>();
  if (eventError) throw new TransientBookingError(`reading event ${eventId}: ${eventError.message}`);
  if (!event) {
    const refund = await refundUnbookedPayment(paymentIntent, "not_found");
    await alertPaidNotBooked(paymentIntent, memberId, eventId, null, "The event no longer exists.", refund);
    return { booked: false, reason: "not_found", refunded: refund.ok };
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

  const reason = outcome.ok ? "error" : outcome.status;
  if (reason === "error") {
    // Nothing was decided: Stripe sends the webhook again and the page shows "still processing".
    throw new TransientBookingError(`book_event for payment intent ${paymentIntent.id}: ${outcome.ok ? "unexpected" : outcome.error ?? "error"}`);
  }
  const why: Record<string, string> = {
    full: "The event is full.",
    started: "The event had already started when the payment went through.",
    cancelled: "The club cancelled the event while the member was paying.",
    inactive: "The membership is paused or has ended.",
    not_found: "The event no longer exists.",
    requires_payment: "The booking could not be saved.",
  };
  // These can never become a booking: give the money back now (QA3-09).
  const refund = reason === "started" || reason === "cancelled" || reason === "inactive" || reason === "not_found"
    ? await refundUnbookedPayment(paymentIntent, reason)
    : null;
  await alertPaidNotBooked(paymentIntent, memberId, eventId, event, why[reason] ?? "The booking could not be saved.", refund);
  return { booked: false, reason, refunded: refund?.ok ?? false };
}

type UnbookedRefund = { ok: boolean; refundId?: string; error?: string };

/**
 * Refund a paid PaymentIntent that has no booking, in full. The page and the
 * webhook may both get here for one payment: the idempotency key makes it one
 * refund. Never throws.
 */
async function refundUnbookedPayment(paymentIntent: Stripe.PaymentIntent, why: string): Promise<UnbookedRefund> {
  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntent.id,
        reason: "requested_by_customer",
        metadata: { payment_intent: paymentIntent.id, member_id: paymentIntent.metadata?.member_id ?? "", event_id: paymentIntent.metadata?.event_id ?? "", why: `paid_not_booked:${why}` },
      },
      { idempotencyKey: `refund-unbooked-${paymentIntent.id}` },
    );
    if (refund.status === "failed" || refund.status === "canceled") return { ok: false, refundId: refund.id, error: refund.failure_reason ?? "refund failed" };
    return { ok: true, refundId: refund.id };
  } catch (err) {
    // The other caller (page or webhook) is making this same refund right now, or made it already.
    const code = stripeErrorCode(err);
    if (code === "idempotency_key_in_use" || code === "charge_already_refunded") return { ok: true };
    console.error(`refundUnbookedPayment ${paymentIntent.id} failed:`, err);
    return { ok: false, error: errorMessage(err).slice(0, 300) };
  }
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
  refund: UnbookedRefund | null = null,
): Promise<void> {
  console.error(`BOOKING_NEEDS_REVIEW paid_not_booked: payment intent ${paymentIntent.id}, member ${memberId}, event ${eventId}: ${why}${refund ? (refund.ok ? " Refunded automatically." : ` The automatic refund failed: ${refund.error}`) : ""}`);
  // The admin booking review email (lib/emails, reason paid_not_booked). Same dedupe key as the plain alert it replaces.
  await sendEmail({
    template: "admin-booking-review",
    to: adminAlertsEmail(),
    data: {
      reason: "paid_not_booked",
      memberName: await memberName(memberId),
      event: event
        ? { title: event.title, start: { date: dayDate(event.start_time), time: time24(event.start_time) } }
        : { title: "an event that no longer exists", start: { date: "Not known", time: "event deleted" } },
      amount: pounds(paymentIntent.amount),
      paymentIntentId: paymentIntent.id,
      memberUrl: `/admin/members/${memberId}`,
      detail: refund && !refund.ok ? `${why} The automatic refund failed: ${refund.error ?? "no reason given"}` : why,
      refunded: Boolean(refund?.ok),
    },
    dedupeKey: `admin-alert:paid-not-booked:${paymentIntent.id}`,
    refs: { memberId, eventId: event ? eventId : null },
  });
}

// ---------------------------------------------------------------------------
// Emails about one booking
// ---------------------------------------------------------------------------

type BookingWithEvent = BookingRow & {
  event: (EventRow & { address: { address: string } | { address: string }[] | null }) | null;
  member: { id: string; email: string; full_name: string | null; deleted_at: string | null } | null;
};

async function loadBooking(bookingId: string): Promise<BookingWithEvent | null> {
  const { data, error } = await serviceDb()
    .from("bookings")
    .select(
      `${BOOKING_ROW_COLUMNS}, event:events(${EVENT_ROW_COLUMNS}, address:event_addresses(address)), member:members(id, email, full_name, deleted_at)`,
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
  // A deleted account gets the account-deleted email and nothing else (QA3-05).
  if (booking.member.deleted_at || booking.cancel_reason === "account_deleted") return;
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
  /**
   * none: nothing to refund. skipped: already refunded (or in hand) by an earlier call. pending: Stripe has it,
   * or Stripe did not answer and the refunds job will try again (retrying). failed: the last try failed; the
   * club has been alerted.
   */
  status: "none" | "succeeded" | "pending" | "failed" | "skipped";
  refundPence: number;
  refundId?: string | null;
  error?: string;
  /** Stripe did not answer this time: the refunds job tries again with the same idempotency key. */
  retrying?: boolean;
};

type RefundRow = Pick<BookingRow, "id" | "amount_pence" | "stripe_payment_intent_id" | "member_id" | "event_id" | "refund_status" | "refund_pence" | "stripe_refund_id"> & {
  refund_attempts: number | null;
};
const REFUND_ROW_COLUMNS = "id, amount_pence, stripe_payment_intent_id, member_id, event_id, refund_status, refund_pence, stripe_refund_id, refund_attempts";

/**
 * What a booking's payment was, in pence. Bookings made before the Phase A migration carry 0 with a real
 * payment: Stripe's amount_received says what was taken, and it is saved on the booking (QA3-01).
 */
async function paidPence(row: Pick<RefundRow, "id" | "amount_pence" | "stripe_payment_intent_id">): Promise<{ pence: number; backfilled: boolean }> {
  if (row.amount_pence > 0 || !row.stripe_payment_intent_id) return { pence: row.amount_pence, backfilled: false };
  const pi = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);
  const pence = pi.status === "succeeded" ? pi.amount_received ?? 0 : 0;
  if (pence > 0) {
    const { error } = await serviceDb().from("bookings").update({ amount_pence: pence }).eq("id", row.id).eq("amount_pence", 0);
    if (error) throw error;
  }
  return { pence, backfilled: pence > 0 };
}

/**
 * Refunds Stripe already has for this payment (an earlier attempt that went through before a crash, or one
 * made by hand in the Dashboard), so a retry never refunds twice.
 */
async function refundsAlreadyMade(paymentIntentId: string, bookingId: string): Promise<{ pence: number; latest: Stripe.Refund | null; ours: Stripe.Refund | null }> {
  const list = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 });
  const live = list.data.filter((r) => r.status === "succeeded" || r.status === "pending");
  const ours = live.find((r) => r.metadata?.booking_id === bookingId) ?? null;
  const latest = [...live].sort((a, b) => b.created - a.created)[0] ?? null;
  return { pence: live.reduce((sum, r) => sum + r.amount, 0), latest, ours };
}

function refundStatusOf(refund: Pick<Stripe.Refund, "status">): RefundStatus {
  return refund.status === "succeeded" ? "succeeded" : refund.status === "failed" || refund.status === "canceled" ? "failed" : "pending";
}

/**
 * Refund what was paid for a booking, in full. Idempotent: a booking already
 * refunded (or being refunded) is skipped, and Stripe gets the idempotency key
 * refund-booking-<id> on every attempt. Never throws.
 *
 * Every path leaves a status on the booking (QA3-07): a Stripe error or no
 * answer leaves "pending" with the error and the attempt count, and the
 * refunds job tries again (retry: true) with the same key, first asking Stripe
 * whether an earlier attempt went through. After MAX_REFUND_ATTEMPTS the
 * booking is "failed" and the club is alerted. A database error before the
 * claim leaves the row as it was ("none"), which the refunds job also picks up.
 */
export async function refundBooking(
  booking: Pick<BookingRow, "id" | "amount_pence" | "stripe_payment_intent_id" | "member_id" | "event_id">,
  options: { retry?: boolean } = {},
): Promise<RefundOutcome> {
  if (!booking.stripe_payment_intent_id) return { status: "none", refundPence: 0 };
  const db = serviceDb();
  let row: RefundRow | null = null;
  try {
    const { data, error } = await db.from("bookings").select(REFUND_ROW_COLUMNS).eq("id", booking.id).maybeSingle<RefundRow>();
    if (error) throw error;
    row = data;
    if (!row || !row.stripe_payment_intent_id) return { status: "none", refundPence: 0 };
    if (row.refund_status === "succeeded") return { status: "skipped", refundPence: row.refund_pence ?? 0, refundId: row.stripe_refund_id };
    if (row.refund_status === "failed") return { status: "failed", refundPence: 0, error: "an earlier refund failed" };
    // Pending: in hand. Only the refunds job takes one up again, and only when Stripe never confirmed it.
    if (row.refund_status === "pending" && (!options.retry || row.stripe_refund_id)) {
      return { status: "skipped", refundPence: row.refund_pence ?? 0, refundId: row.stripe_refund_id };
    }

    const { pence: amount, backfilled } = await paidPence(row);
    if (amount <= 0) return { status: "none", refundPence: 0 };

    // The claim: one caller at a time, on the status and the attempt count it read.
    const attempts = row.refund_attempts ?? 0;
    const { data: claimed, error: claimError } = await db
      .from("bookings")
      .update({ refund_status: "pending", refund_attempts: attempts + 1, refund_attempted_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("refund_status", row.refund_status)
      .eq("refund_attempts", attempts)
      .select("id");
    if (claimError) throw claimError;
    if (!claimed?.length) return { status: "skipped", refundPence: 0 };
    const attempt = attempts + 1;

    // A retry, or a booking from before the migration: did Stripe refund it already?
    let toRefund = amount;
    if (attempts > 0 || backfilled) {
      const made = await refundsAlreadyMade(row.stripe_payment_intent_id, row.id);
      const found = made.ours ?? (made.pence >= amount ? made.latest : null);
      if (found) {
        const status = made.ours ? refundStatusOf(made.ours) : made.latest && refundStatusOf(made.latest) === "succeeded" ? "succeeded" : "pending";
        const pence = made.ours ? made.ours.amount : made.pence;
        const { error } = await db.from("bookings").update({ refund_status: status, refund_pence: pence, stripe_refund_id: found.id, refund_error: null }).eq("id", row.id);
        if (error) throw error;
        return { status, refundPence: pence, refundId: found.id };
      }
      toRefund = amount - made.pence;
    }

    let refund: Stripe.Refund;
    try {
      refund = await stripe.refunds.create(
        {
          payment_intent: row.stripe_payment_intent_id,
          amount: toRefund,
          reason: "requested_by_customer",
          metadata: { booking_id: row.id },
        },
        { idempotencyKey: `refund-booking-${row.id}` },
      );
    } catch (err) {
      // Another caller is making this very refund right now (same key): theirs records it.
      if (stripeErrorCode(err) === "idempotency_key_in_use") return { status: "pending", refundPence: amount };
      // Refunded already (by hand in the Dashboard, before this): record what Stripe has.
      if (stripeErrorCode(err) === "charge_already_refunded") {
        const made = await refundsAlreadyMade(row.stripe_payment_intent_id, row.id);
        if (made.latest) {
          const status = refundStatusOf(made.ours ?? made.latest);
          const { error } = await db.from("bookings").update({ refund_status: status, refund_pence: made.pence, stripe_refund_id: (made.ours ?? made.latest).id, refund_error: null }).eq("id", row.id);
          if (error) throw error;
          return { status, refundPence: made.pence, refundId: (made.ours ?? made.latest).id };
        }
      }
      const message = errorMessage(err).slice(0, 500);
      // Stripe refused it (no such payment, already refunded, disputed): trying again cannot help. Stripe did
      // not answer, or failed on its side: the refunds job tries again, up to MAX_REFUND_ATTEMPTS in all.
      const final = !transientStripeError(err) || attempt >= MAX_REFUND_ATTEMPTS;
      console.error(`refundBooking: Stripe refund attempt ${attempt} failed for booking ${row.id}${final ? " (giving up)" : " (the refunds job tries again)"}:`, err);
      // Only over a claim nobody else has finished (a concurrent caller may have recorded the refund meanwhile).
      const { error } = await db
        .from("bookings")
        .update({ refund_status: final ? "failed" : "pending", refund_error: message })
        .eq("id", row.id)
        .eq("refund_status", "pending")
        .is("stripe_refund_id", null);
      if (error) console.error(`refundBooking: saving the failure for booking ${row.id} failed:`, error);
      if (final) {
        await alertRefundFailed({ ...row, amount_pence: amount }, message);
        return { status: "failed", refundPence: 0, error: message };
      }
      return { status: "pending", refundPence: amount, error: message, retrying: true };
    }

    const status = refundStatusOf(refund);
    const refunded = (amount - toRefund) + refund.amount;
    const { error: saveError } = await db
      .from("bookings")
      .update({ refund_status: status, refund_pence: refunded, stripe_refund_id: refund.id, refund_error: status === "failed" ? refund.failure_reason ?? "refund failed" : null })
      .eq("id", row.id);
    // Stripe has the refund; the refunds job finds it on Stripe and records it (refundsAlreadyMade).
    if (saveError) console.error(`refundBooking: saving refund ${refund.id} on booking ${row.id} failed:`, saveError);
    if (status === "failed") {
      await alertRefundFailed({ ...row, amount_pence: amount }, refund.failure_reason ?? "refund failed");
      return { status: "failed", refundPence: 0, refundId: refund.id, error: refund.failure_reason ?? "refund failed" };
    }
    return { status, refundPence: refunded, refundId: refund.id };
  } catch (err) {
    // A database error, or Stripe not answering the amount lookup: whatever the row says now ("none", or
    // "pending" after the claim) is what the refunds job picks up.
    console.error(`refundBooking ${booking.id} did not finish (the refunds job retries it):`, err);
    return { status: "pending", refundPence: row?.amount_pence ?? booking.amount_pence, error: errorMessage(err), retrying: true };
  }
}

/** An error worth trying again: no answer, a Stripe-side failure, a rate limit or a lock (not a refusal). */
function transientStripeError(err: unknown): boolean {
  if (!err || typeof err !== "object") return true;
  const e = err as { type?: string; statusCode?: number; code?: string };
  if (e.type === "StripeConnectionError" || e.type === "StripeAPIError" || e.type === "StripeRateLimitError") return true;
  if (e.code === "lock_timeout" || e.code === "rate_limit") return true;
  if (typeof e.statusCode === "number") return e.statusCode >= 500 || e.statusCode === 429 || e.statusCode === 409;
  // Not a Stripe answer at all (a timeout, the network).
  return !e.type?.startsWith("Stripe");
}

/** A pending refund Stripe accepted: ask Stripe again (refunds to some cards take days). */
async function refreshPendingRefund(row: RefundRow): Promise<RefundStatus> {
  if (!row.stripe_refund_id) return row.refund_status;
  const refund = await stripe.refunds.retrieve(row.stripe_refund_id);
  const status = refundStatusOf(refund);
  if (status === "pending") return status;
  const { error } = await serviceDb()
    .from("bookings")
    .update({ refund_status: status, refund_error: status === "failed" ? refund.failure_reason ?? "refund failed" : null })
    .eq("id", row.id)
    .eq("refund_status", "pending");
  if (error) throw error;
  if (status === "failed") await alertRefundFailed(row, refund.failure_reason ?? "refund failed");
  return status;
}

/** The email a cancelled booking's member gets once its refund is in hand (the first sends it; dedupe keys stop a second). */
async function sendCancellationEmail(bookingId: string): Promise<void> {
  const booking = await loadBooking(bookingId);
  if (!booking || booking.status !== "cancelled") return;
  const reason = booking.cancel_reason;
  if (reason === "event_cancelled") return sendEventCancelledEmail(bookingId);
  if (reason === "member" || reason === "member_late" || reason === "event_changed") return sendBookingCancelledEmail(bookingId, reason);
  if (reason === "membership_ended") {
    const { data: member } = await serviceDb().from("members").select("ended_at").eq("id", booking.member_id).maybeSingle();
    return sendBookingCancelledEmail(bookingId, "membership_ended", { membershipEndedOn: member?.ended_at ? dayDate(member.ended_at) : undefined });
  }
}

/** Cancel reasons that give the money back (member_late does not; admin is not used by Phase A). */
const REFUNDED_CANCEL_REASONS = ["member", "event_changed", "event_cancelled", "membership_ended", "account_deleted"] as const;

export type RefundsSummary = {
  /** Refunds tried again (Stripe never answered, or answered with an error). */
  retried: { bookingId: string; status: RefundOutcome["status"] }[];
  /** Cancelled with money to give back, but the refund never started. */
  started: { bookingId: string; status: RefundOutcome["status"] }[];
  /** Pending at Stripe: asked again. */
  refreshed: { bookingId: string; status: RefundStatus }[];
  errors: { bookingId: string; error: string }[];
};

/**
 * The refunds job (GET /api/cron/refunds, every 15 minutes; QA3-07). Safe to run again and alongside the
 * other jobs: each refund is claimed on its status and attempt count, and Stripe gets the same idempotency
 * key every time.
 */
export async function runRefunds(now: Date = new Date()): Promise<RefundsSummary> {
  const db = serviceDb();
  const summary: RefundsSummary = { retried: [], started: [], refreshed: [], errors: [] };
  const due = new Date(now.getTime() - REFUND_RETRY_AFTER_MINUTES * 60 * 1000).toISOString();

  // 1. Claimed, but Stripe never confirmed it (a crash or a timeout), or Stripe answered with an error.
  const { data: stuck, error: stuckError } = await db
    .from("bookings")
    .select(REFUND_ROW_COLUMNS)
    .eq("status", "cancelled")
    .eq("refund_status", "pending")
    .is("stripe_refund_id", null)
    .not("stripe_payment_intent_id", "is", null)
    .or(`refund_attempted_at.is.null,refund_attempted_at.lte.${due}`)
    .limit(200);
  if (stuckError) throw stuckError;
  for (const row of (stuck ?? []) as RefundRow[]) {
    const outcome = await refundBooking(row, { retry: true });
    summary.retried.push({ bookingId: row.id, status: outcome.status });
    if (outcome.status === "succeeded" || (outcome.status === "pending" && !outcome.retrying)) await sendCancellationEmail(row.id);
  }

  // 2. Cancelled in a way that gives the money back, but no refund was ever started (a crash between the two).
  const { data: unstarted, error: unstartedError } = await db
    .from("bookings")
    .select(REFUND_ROW_COLUMNS)
    .eq("status", "cancelled")
    .eq("refund_status", "none")
    .not("stripe_payment_intent_id", "is", null)
    .in("cancel_reason", [...REFUNDED_CANCEL_REASONS])
    .lte("cancelled_at", due)
    .limit(200);
  if (unstartedError) throw unstartedError;
  for (const row of (unstarted ?? []) as RefundRow[]) {
    const outcome = await refundBooking(row);
    if (outcome.status === "none") continue;
    summary.started.push({ bookingId: row.id, status: outcome.status });
    if (outcome.status === "succeeded" || (outcome.status === "pending" && !outcome.retrying)) await sendCancellationEmail(row.id);
  }

  // 3. Pending at Stripe.
  const { data: pending, error: pendingError } = await db
    .from("bookings")
    .select(REFUND_ROW_COLUMNS)
    .eq("refund_status", "pending")
    .not("stripe_refund_id", "is", null)
    .limit(200);
  if (pendingError) throw pendingError;
  for (const row of (pending ?? []) as RefundRow[]) {
    try {
      const status = await refreshPendingRefund(row);
      if (status !== "pending") summary.refreshed.push({ bookingId: row.id, status });
    } catch (err) {
      summary.errors.push({ bookingId: row.id, error: errorMessage(err) });
    }
  }
  return summary;
}

async function alertRefundFailed(
  booking: Pick<BookingRow, "id" | "amount_pence" | "stripe_payment_intent_id" | "member_id" | "event_id">,
  error: string,
): Promise<void> {
  const { data: event } = await serviceDb().from("events").select("title, start_time").eq("id", booking.event_id).maybeSingle();
  // The admin booking review email (lib/emails, reason refund_failed). Same dedupe key as the plain alert it replaces.
  await sendEmail({
    template: "admin-booking-review",
    to: adminAlertsEmail(),
    data: {
      reason: "refund_failed",
      memberName: await memberName(booking.member_id),
      event: event
        ? { title: event.title, start: { date: dayDate(event.start_time), time: time24(event.start_time) } }
        : { title: "an event that no longer exists", start: { date: "Not known", time: "event deleted" } },
      amount: pounds(booking.amount_pence),
      paymentIntentId: booking.stripe_payment_intent_id ?? "",
      bookingId: booking.id,
      memberUrl: `/admin/members/${booking.member_id}`,
      detail: error,
    },
    dedupeKey: `admin-alert:refund-failed:${booking.id}`,
    refs: { memberId: booking.member_id, bookingId: booking.id, eventId: booking.event_id },
  });
}

/**
 * charge.refunded: a refund went through (ours, or one made by hand in Stripe). Records it on the booking. A
 * database error throws, so Stripe sends the event again (QA3-10).
 */
export async function recordRefundFromCharge(charge: Stripe.Charge): Promise<{ bookingId: string | null; changed: boolean }> {
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return { bookingId: null, changed: false };
  const db = serviceDb();
  const { data: booking, error: readError } = await db
    .from("bookings")
    .select(BOOKING_ROW_COLUMNS)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle<BookingRow>();
  if (readError) throw readError;
  if (!booking) return { bookingId: null, changed: false };
  if (booking.refund_status === "succeeded" && booking.refund_pence === charge.amount_refunded) {
    return { bookingId: booking.id, changed: false };
  }
  // Waiting on it: a refund that failed here and was then made by hand, or one Stripe never confirmed to us.
  const waited = booking.refund_status === "failed" || (booking.refund_status === "pending" && !booking.stripe_refund_id);
  const { error } = await db
    .from("bookings")
    .update({
      refund_status: charge.amount_refunded > 0 ? "succeeded" : booking.refund_status,
      refund_pence: charge.amount_refunded,
      refund_error: null,
      // A booking from before the migration: the charge says what was paid (QA3-01).
      ...(booking.amount_pence === 0 && charge.amount > 0 ? { amount_pence: charge.amount } : {}),
    })
    .eq("id", booking.id);
  if (error) throw error;
  // The member's cancellation email waited for the refund.
  if (waited && booking.status === "cancelled" && charge.amount_refunded > 0) await sendCancellationEmail(booking.id);
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
  // A database error is not "already cancelled": the caller says it failed (and a webhook is sent again).
  if (error) throw error;
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
    const { data, error } = await serviceDb()
      .from("bookings")
      .select(`${BOOKING_ROW_COLUMNS}, event:events(${EVENT_ROW_COLUMNS})`)
      .eq("id", bookingId)
      .eq("member_id", memberId)
      .maybeSingle();
    if (error) throw error;
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

    const refund: RefundOutcome = terms.free ? await refundBooking(cancelled) : { status: "none", refundPence: 0 };
    // Not while the refund is failed or still being tried: the email says the money is on its way. The refunds
    // job (or charge.refunded, after a refund by hand) sends it once it is.
    if (refund.status !== "failed" && !refund.retrying) {
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
  if (!booking?.event || !booking.member || booking.member.deleted_at) return;
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
    const { data: event, error: readError } = await db.from("events").select("id, cancelled_at").eq("id", eventId).maybeSingle();
    if (readError) throw readError;
    if (!event) return { ...summary, ok: false, error: "not_found" };
    const note = options.note?.trim() || null;
    const { error: eventError } = await db
      .from("events")
      .update({ cancelled_at: event.cancelled_at ?? new Date().toISOString(), ...(note !== null || !event.cancelled_at ? { cancel_note: note } : {}) })
      .eq("id", eventId);
    if (eventError) return { ...summary, ok: false, error: eventError.message };

    const { data: bookings, error: bookingsError } = await db.from("bookings").select(BOOKING_ROW_COLUMNS).eq("event_id", eventId).eq("status", "confirmed");
    if (bookingsError) throw bookingsError;
    for (const row of (bookings ?? []) as BookingRow[]) {
      const cancelled = await markCancelled(row.id, "club", "event_cancelled");
      if (!cancelled) continue;
      summary.cancelled += 1;
      const refund = await refundBooking(cancelled);
      if (refund.status === "succeeded" || refund.status === "pending") summary.refunded += 1;
      if (refund.status === "failed") summary.refundFailed += 1;
      if (refund.status !== "failed" && !refund.retrying) {
        later(`event-cancelled email for ${row.id}`, () => sendEventCancelledEmail(row.id));
      }
    }

    // A rerun after a crash: bookings cancelled by an earlier run whose refund never started, or was claimed
    // and never answered by Stripe (tried again with the same idempotency key; the refunds job does the same).
    const { data: leftovers, error: leftoversError } = await db
      .from("bookings")
      .select(BOOKING_ROW_COLUMNS)
      .eq("event_id", eventId)
      .eq("status", "cancelled")
      .eq("cancel_reason", "event_cancelled")
      .in("refund_status", ["none", "pending"])
      .is("stripe_refund_id", null)
      .not("stripe_payment_intent_id", "is", null);
    if (leftoversError) throw leftoversError;
    for (const row of (leftovers ?? []) as BookingRow[]) {
      const refund = await refundBooking(row, { retry: row.refund_status === "pending" });
      if (refund.status === "none" || refund.status === "skipped") continue;
      if (refund.status === "succeeded" || refund.status === "pending") summary.refunded += 1;
      if (refund.status === "failed") summary.refundFailed += 1;
      if (refund.status !== "failed" && !refund.retrying) later(`event-cancelled email for ${row.id}`, () => sendEventCancelledEmail(row.id));
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
  // Throws on a database error (QA3-10): the webhook answers 500 and Stripe sends it again; the jobs and
  // Delete my account report it and run again. Everything done so far is safe to repeat.
  const out: CancelledFutureBooking[] = [];
  const db = serviceDb();
  const { data, error } = await db
    .from("bookings")
    .select(`${BOOKING_ROW_COLUMNS}, event:events!inner(${EVENT_ROW_COLUMNS})`)
    .eq("member_id", memberId)
    .eq("status", "confirmed")
    .gt("event.start_time", new Date().toISOString());
  if (error) throw error;
  for (const raw of (data ?? []) as unknown as (BookingRow & { event: EventRow | EventRow[] | null })[]) {
    const event = one(raw.event);
    if (!event) continue;
    const cancelled = await markCancelled(raw.id, "system", reason);
    if (!cancelled) continue;
    const refund = await refundBooking(cancelled);
    out.push({ bookingId: raw.id, eventId: event.id, title: event.title, startTime: event.start_time, amountPence: raw.amount_pence, refund });
    if (reason === "membership_ended" && options.email !== false && refund.status !== "failed" && !refund.retrying) {
      later(`booking-cancelled email for ${raw.id}`, () =>
        sendBookingCancelledEmail(raw.id, "membership_ended", { membershipEndedOn: options.membershipEndedOn }),
      );
    }
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
