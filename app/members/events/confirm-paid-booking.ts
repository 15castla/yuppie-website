import { after } from "next/server";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { sendEmail } from "@/app/admin/resend-client";
import { getEventCapacity } from "./booking-capacity";

// The one place a paid booking row is ever inserted. Called by the Stripe
// webhook (payment_intent.succeeded) and by confirmEventPayment in
// actions.ts, straight after the member's payment completes on the page.
// Both can run for the same payment, in either order or at once, so this
// has to be idempotent: a booking already recorded against this payment
// intent is a no-op, and losing an insert race to the other caller (the
// unique index on bookings(member_id, event_id)) counts as booked.
//
// Callers must already have confirmed with Stripe that the payment
// intent's status is "succeeded"; this doesn't re-check it.
//
// Not in actions.ts because every export of a "use server" file becomes
// a callable server action.

const REVIEW_ALERT_TO = "hello@clubyuppie.com";

type BookingIds = { memberId: string; eventId: string; paymentIntentId: string };

// Logs a booking that needs a human to look at it, and emails the same
// details to the team inbox. The email goes out after the response and is
// best-effort: a failed send is logged, never retried.
function flagBookingForReview(reason: string, message: string, ids: BookingIds) {
  console.error(`BOOKING_NEEDS_REVIEW ${reason}: ${message}`);
  after(async () => {
    try {
      await sendEmail({
        to: REVIEW_ALERT_TO,
        subject: `Booking needs review: ${reason}`,
        html: `<p>${message}</p>
<p>Member: ${ids.memberId}<br />Event: ${ids.eventId}<br />Payment intent: ${ids.paymentIntentId}</p>`,
      });
    } catch (err) {
      console.error(`Booking review alert email failed for payment intent ${ids.paymentIntentId}:`, err);
    }
  });
}

export async function confirmPaidBooking(
  paymentIntentId: string,
  memberId: string,
  eventId: string,
): Promise<{ booked: boolean }> {
  const ids = { memberId, eventId, paymentIntentId };
  const adminClient = createAdminSupabaseClient();

  const bookingForThisPayment = async () => {
    const { data } = await adminClient
      .from("bookings")
      .select("id")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle();
    return data;
  };

  if (await bookingForThisPayment()) {
    return { booked: true };
  }

  // A confirmed booking for this member and event, but under a different
  // payment: they've paid twice (two tabs, say). The unique index means a
  // second row can't be inserted, and they're already booked; what needs
  // follow-up is the second charge (refund it in Stripe).
  const { data: memberBooking } = await adminClient
    .from("bookings")
    .select("id")
    .eq("member_id", memberId)
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .limit(1)
    .maybeSingle();

  if (memberBooking) {
    flagBookingForReview(
      "paid twice",
      `Member ${memberId} already had booking ${memberBooking.id} for event ${eventId} when payment intent ${paymentIntentId} succeeded. No second booking created; this charge likely needs refunding.`,
      ids,
    );
    return { booked: true };
  }

  const { error } = await adminClient.from("bookings").insert({
    member_id: memberId,
    event_id: eventId,
    status: "confirmed",
    stripe_payment_intent_id: paymentIntentId,
  });

  if (error) {
    // 23505 is the unique index. If the row that beat this one is for this
    // same payment, the other caller (webhook or page) got there first.
    if (error.code === "23505" && (await bookingForThisPayment())) {
      return { booked: true };
    }
    console.error(
      `confirmPaidBooking: failed to insert booking for member ${memberId}, event ${eventId}, payment intent ${paymentIntentId}:`,
      error,
    );
    return { booked: false };
  }

  // createEventPaymentIntent already refuses a full event, but the event
  // can fill up while this member is still on the payment form. The charge
  // has succeeded by now, so the booking stands: a paid member is never
  // silently dropped, and nothing is refunded automatically. It's flagged
  // instead (honour the extra spot, or refund in Stripe). Checked after
  // the insert, so only the caller that actually recorded the booking
  // sends the alert.
  try {
    const capacity = await getEventCapacity(adminClient, eventId);
    if (capacity && capacity.confirmed > capacity.capacity) {
      flagBookingForReview(
        "over capacity",
        `Event ${eventId} has ${capacity.confirmed}/${capacity.capacity} confirmed bookings after payment intent ${paymentIntentId} (member ${memberId}) succeeded. Booking recorded anyway.`,
        ids,
      );
    }
  } catch (err) {
    console.error(`confirmPaidBooking: capacity check failed for event ${eventId}:`, err);
  }

  return { booked: true };
}
