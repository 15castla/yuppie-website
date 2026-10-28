"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { stripe } from "@/lib/stripe";
import { eventCalendarHref } from "@/lib/members/routes";
import { bookIncludedEvent, cancelBookingByMember, cancelTerms } from "@/lib/server/bookings";
import { calendarForMember, getEventAddressForMember } from "@/lib/server/events";
import { requireMember } from "../require-member";
import { getEventCapacity } from "./booking-capacity";
import { confirmPaidBooking } from "./confirm-paid-booking";
import { hasEventStarted } from "@/components/members/events-data";

// The page showed a spot and the server found none: someone booked just before (r2a, the server message example).
const EVENT_FULL_ERROR = "That was the last spot. Someone booked just before you.";
const ALREADY_BOOKED_ERROR = "You’re already booked in for this event.";
const EVENT_STARTED_ERROR = "This event has already started, so it can’t be booked.";
const EVENT_CANCELLED_ERROR = "This event has been cancelled, so it can’t be booked.";
const INACTIVE_ERROR = "Your membership isn’t active, so you can’t book.";
const BOOKING_FAILED_ERROR = "We couldn’t book your spot. Nothing was taken. Please try again.";

// Free and included events: one tap books (r2a section 3). The booking itself
// is lib/server/bookings.ts bookIncludedEvent: book_event in the database
// takes a lock on the event row, so the capacity check and the insert cannot
// race. The confirmation email goes after the response.
export async function rsvpToEvent(
  formData: FormData,
): Promise<{ success: boolean; error?: string; bookingId?: string }> {
  const member = await requireMember();
  const eventId = formData.get("event_id");

  if (typeof eventId !== "string" || !eventId) {
    return { success: false, error: "Missing event." };
  }

  const outcome = await bookIncludedEvent(member.id, eventId);
  if (outcome.ok) {
    if (outcome.status === "already_booked") return { success: false, error: ALREADY_BOOKED_ERROR };
    // Every /members page, so nothing in the client router cache
    // (next.config.ts staleTimes) shows stale personal state.
    revalidatePath("/members", "layout");
    return { success: true, bookingId: outcome.bookingId };
  }

  switch (outcome.status) {
    case "not_found":
      return { success: false, error: "That event couldn’t be found." };
    case "requires_payment":
      // The price decides whether a booking needs payment, not which button
      // was clicked, so a paid event can't be booked for free by calling this.
      return { success: false, error: "This event requires payment." };
    case "started":
      return { success: false, error: EVENT_STARTED_ERROR };
    case "full":
      return { success: false, error: EVENT_FULL_ERROR };
    case "cancelled":
      return { success: false, error: EVENT_CANCELLED_ERROR };
    case "inactive":
      return { success: false, error: INACTIVE_ERROR };
    default:
      return { success: false, error: BOOKING_FAILED_ERROR };
  }
}

export type CreateEventPaymentIntentResult =
  | { success: true; clientSecret: string }
  | {
      success: false;
      error: string;
      /**
       * Why, for the page (r2a 2 and 3): "error" means payment could not be opened (the sheet's "We couldn't open
       * payment"); the others are a message in the strip above the bar.
       */
      reason?: "not_found" | "started" | "cancelled" | "free" | "no_customer" | "already_booked" | "full" | "error";
    };

// Embedded payment flow. Reads the event straight from the table (not
// getCachedEventBySlug) since price and title need to be current at the
// moment of charging. The booking row is only made once Stripe confirms the
// payment succeeded (confirmEventPayment below, or the webhook), never here.
export async function createEventPaymentIntent(
  formData: FormData,
): Promise<CreateEventPaymentIntentResult> {
  const member = await requireMember();
  const eventId = formData.get("event_id");

  if (typeof eventId !== "string" || !eventId) {
    return { success: false, error: "Missing event.", reason: "not_found" };
  }

  const adminClient = createAdminSupabaseClient();
  const { data: event } = await adminClient
    .from("events")
    .select("title, price_pence, start_time, cancelled_at")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    return { success: false, error: "That event couldn’t be found.", reason: "not_found" };
  }

  // Checked before a PaymentIntent exists, so payment for a past or
  // cancelled event is never started.
  if (hasEventStarted(event)) {
    return { success: false, error: EVENT_STARTED_ERROR, reason: "started" };
  }
  if (event.cancelled_at) {
    return { success: false, error: EVENT_CANCELLED_ERROR, reason: "cancelled" };
  }

  // Never trust the client on this: the price decides whether a charge happens.
  if (!event.price_pence) {
    return { success: false, error: "This event doesn’t require payment.", reason: "free" };
  }

  if (!member.stripe_customer_id) {
    console.error(`createEventPaymentIntent: member ${member.id} has no stripe_customer_id`);
    return {
      success: false,
      error: "No payment details on file for your account. Please contact us.",
      reason: "no_customer",
    };
  }

  const { data: existingBooking } = await adminClient
    .from("bookings")
    .select("id")
    .eq("member_id", member.id)
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .maybeSingle();

  if (existingBooking) {
    return { success: false, error: ALREADY_BOOKED_ERROR, reason: "already_booked" };
  }

  // Checked before a PaymentIntent exists, so a full event never gets as far
  // as taking payment. A booking that lands on a full event after payment
  // still books and alerts the club (no hold while paying, A-D7).
  try {
    const capacity = await getEventCapacity(adminClient, eventId);
    if (capacity?.isFull) {
      return { success: false, error: EVENT_FULL_ERROR, reason: "full" };
    }
  } catch (err) {
    console.error(`createEventPaymentIntent: capacity check failed for event ${eventId}:`, err);
    return {
      success: false,
      error: "Something went wrong starting payment. Please try again.",
      reason: "error",
    };
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: event.price_pence,
        currency: "gbp",
        customer: member.stripe_customer_id,
        description: event.title,
        automatic_payment_methods: { enabled: true },
        metadata: { member_id: member.id, event_id: eventId },
      },
      // A double tap within the same minute reuses one PaymentIntent.
      { idempotencyKey: `event-pi-${member.id}-${eventId}-${event.price_pence}-${Math.floor(Date.now() / 60000)}` },
    );

    if (!paymentIntent.client_secret) {
      console.error(`createEventPaymentIntent: PaymentIntent ${paymentIntent.id} has no client_secret`);
      return {
        success: false,
        error: "Something went wrong starting payment. Please try again.",
        reason: "error",
      };
    }

    return { success: true, clientSecret: paymentIntent.client_secret };
  } catch (err) {
    console.error(`createEventPaymentIntent failed for member ${member.id}, event ${eventId}:`, err);
    return {
      success: false,
      error: "Something went wrong starting payment. Please try again.",
      reason: "error",
    };
  }
}

export type ConfirmEventPaymentResult =
  | { booked: true }
  | { booked: false; pending: true }
  | {
      booked: false;
      pending?: false;
      error: string;
      /**
       * What the page shows (r2a 3): not_paid, the card box again ("Your card was declined"); paid_not_booked,
       * "Paid, but not booked yet." with no pay button; check_failed, Stripe could not be asked (treated as still
       * processing: the webhook books it); mismatch, the payment is not for this member and event.
       */
      reason: "missing" | "check_failed" | "mismatch" | "not_paid" | "paid_not_booked";
    };

// Called by the payment form once Stripe's confirmPayment (or the return
// from a redirect) resolves on the page, so the button only says "Booked"
// once a booking row really exists. Asks Stripe for the payment intent's
// status itself rather than trusting what the browser reports, and only
// books on "succeeded". "processing" means the charge hasn't completed:
// nothing is recorded yet, and the webhook books it if and when it does.
export async function confirmEventPayment(
  paymentIntentId: string,
  eventId: string,
): Promise<ConfirmEventPaymentResult> {
  const member = await requireMember({ allowGated: true });

  if (!paymentIntentId || !eventId) {
    return { booked: false, error: "Missing payment details.", reason: "missing" };
  }

  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (err) {
    console.error(`confirmEventPayment: couldn't retrieve payment intent ${paymentIntentId}:`, err);
    return {
      booked: false,
      error: "We couldn’t check your payment. Please refresh the page, or contact us if you’ve been charged.",
      reason: "check_failed",
    };
  }

  // The payment intent has to be this member's, for this event, as set
  // by createEventPaymentIntent.
  if (
    paymentIntent.metadata?.member_id !== member.id ||
    paymentIntent.metadata?.event_id !== eventId
  ) {
    console.error(
      `confirmEventPayment: payment intent ${paymentIntentId} metadata doesn't match member ${member.id}, event ${eventId}`,
    );
    return { booked: false, error: "That payment doesn’t match this booking.", reason: "mismatch" };
  }

  if (paymentIntent.status === "processing") {
    return { booked: false, pending: true };
  }

  if (paymentIntent.status !== "succeeded") {
    return {
      booked: false,
      error: "Your payment didn’t go through. Please try again.",
      reason: "not_paid",
    };
  }

  // By now the member has been charged: the booking is recorded (or, if it
  // cannot be, the club is alerted and the page shows "Paid, but not booked yet").
  const { booked } = await confirmPaidBooking(paymentIntentId, member.id, eventId, paymentIntent);
  if (!booked) {
    return {
      booked: false,
      error: "Your payment went through, but we couldn’t confirm your booking. Please contact us.",
      reason: "paid_not_booked",
    };
  }

  revalidatePath("/members", "layout");
  return { booked: true };
}

// ---------------------------------------------------------------------------
// Cancelling a booking (r2a section 5, decisions A-D1 and C-D11)
// ---------------------------------------------------------------------------

export type CancelBookingResult =
  | {
      ok: true;
      /** none: an included event, or cancelled without a refund. failed: the club has been alerted. */
      refund: "none" | "succeeded" | "pending" | "failed" | "skipped";
      refundPence: number;
      /** Cancelled inside 48 hours without a refund. */
      late: boolean;
    }
  | {
      ok: false;
      /** late: inside 48 hours; offer Email us, Keep my booking and "Cancel without a refund" (call again with withoutRefund). */
      reason: "not_found" | "already_cancelled" | "started" | "late" | "error";
      error: string;
      /** The free-cancel deadline, ISO. */
      freeUntil?: string;
    };

export async function cancelBooking(
  bookingId: string,
  options: { withoutRefund?: boolean } = {},
): Promise<CancelBookingResult> {
  const member = await requireMember();
  if (!bookingId) return { ok: false, reason: "not_found", error: "That booking couldn’t be found." };

  const result = await cancelBookingByMember(member.id, bookingId, { withoutRefund: Boolean(options.withoutRefund) });
  if (result.ok) {
    revalidatePath("/members", "layout");
    return {
      ok: true,
      refund: result.refund.status,
      refundPence: result.refund.refundPence,
      late: result.reason === "member_late",
    };
  }
  const errors: Record<typeof result.reason, string> = {
    not_found: "That booking couldn’t be found.",
    already_cancelled: "This booking is already cancelled.",
    started: "This event has started, so the booking can’t be cancelled.",
    late: "It’s less than 48 hours until the event, so we can’t refund you automatically.",
    error: "We couldn’t cancel. Your booking is still on. Check your connection and try again. Nothing was refunded yet.",
  };
  return { ok: false, reason: result.reason, error: errors[result.reason], freeUntil: result.freeUntil };
}

// ---------------------------------------------------------------------------
// The booking card, the address and Add to calendar (A-D3, r2a section 4)
// ---------------------------------------------------------------------------

export type MyBooking = {
  bookingId: string;
  amountPence: number;
  bookedAt: string;
  /** The exact address (null until the club has saved one). Only ever sent to a member with this confirmed booking. */
  address: string | null;
  /** The free-cancel deadline (start minus 48 hours), ISO. */
  freeUntil: string;
  /** Cancelling now gives the money back automatically (inside the window, or the club moved the event, C-D11). */
  freeNow: boolean;
  /** The club moved the event after this booking (C-D11). */
  moved: boolean;
  calendarUrl: string;
  /** Google Calendar, filled in (the web shows it under Add to calendar). */
  googleUrl: string | null;
};

/** The member's confirmed booking for an event, with what the booking card shows. Null when not booked. */
export async function getMyBooking(eventId: string): Promise<MyBooking | null> {
  const member = await requireMember();
  if (!eventId) return null;
  const db = createAdminSupabaseClient();
  const { data } = await db
    .from("bookings")
    .select("id, amount_pence, booked_at, event:events(slug, start_time, changed_at)")
    .eq("member_id", member.id)
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const event = (Array.isArray(data.event) ? data.event[0] : data.event) as { slug: string; start_time: string; changed_at: string | null } | null;
  if (!event) return null;
  const terms = cancelTerms({ booked_at: data.booked_at }, event);
  const calendar = await calendarForMember(member.id, { id: eventId });
  return {
    bookingId: data.id,
    amountPence: data.amount_pence,
    bookedAt: data.booked_at,
    address: await getEventAddressForMember(member.id, eventId),
    freeUntil: terms.freeUntil.toISOString(),
    freeNow: terms.free,
    moved: terms.why === "changed",
    calendarUrl: eventCalendarHref(event.slug),
    googleUrl: calendar?.googleUrl ?? null,
  };
}

/** The exact address, for a member with a confirmed booking; null for anyone else ("Exact address sent after booking"). */
export async function getMyEventAddress(eventId: string): Promise<string | null> {
  const member = await requireMember();
  if (!eventId) return null;
  return getEventAddressForMember(member.id, eventId);
}

export type CalendarLinks = {
  /** Download the .ics (web: Apple Calendar or Outlook; the app opens the same file). */
  icsUrl: string;
  /** Google Calendar, filled in. */
  googleUrl: string;
  /** The file itself, for a client that builds its own download. */
  ics: string;
  filename: string;
};

/** Add to calendar, for a member's confirmed booking. Null when not booked. */
export async function getCalendarLinks(eventId: string): Promise<CalendarLinks | null> {
  const member = await requireMember();
  if (!eventId) return null;
  const data = await calendarForMember(member.id, { id: eventId });
  if (!data) return null;
  const db = createAdminSupabaseClient();
  const { data: event } = await db.from("events").select("slug").eq("id", eventId).maybeSingle();
  return { icsUrl: eventCalendarHref(event?.slug ?? ""), googleUrl: data.googleUrl, ics: data.ics, filename: data.filename };
}
