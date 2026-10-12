import type Stripe from "stripe";
import { NextResponse, after } from "next/server";

import { stripe } from "@/lib/stripe";
import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { sendEmail } from "@/app/admin/resend-client";
import { getEventCapacity } from "@/app/members/events/booking-capacity";

// Route handlers default to the Node.js runtime already (only opting
// into "edge" is special-cased), but the Stripe SDK specifically
// requires Node, so this is set explicitly rather than left implicit.
export const runtime = "nodejs";

const REVIEW_ALERT_TO = "hello@clubyuppie.com";

// Logs a booking that needs a human to look at it, and emails the same
// details to the team inbox. The email goes out after the response (so
// Stripe gets its 200 straight away) and is best-effort: a failed send is
// logged, never retried. Stripe's occasional redelivery of an event can
// mean the same alert arrives twice.
function flagBookingForReview(
  reason: string,
  message: string,
  ids: { memberId: string; eventId: string; paymentIntentId: string },
) {
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
      console.error(`Stripe webhook: review alert email failed for payment intent ${ids.paymentIntentId}:`, err);
    }
  });
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    console.error("Stripe webhook: missing signature header or STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type !== "payment_intent.succeeded") {
    return NextResponse.json({ received: true });
  }

  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const memberId = paymentIntent.metadata?.member_id;
  const eventId = paymentIntent.metadata?.event_id;
  const paymentIntentId = paymentIntent.id;

  if (!memberId || !eventId) {
    // Not every payment_intent.succeeded event is an event booking: the
    // membership subscription flow's invoice payments fire this same
    // event type too, they just don't carry this metadata (subscriptions
    // are created synchronously in app/admin/applications-actions.ts, not
    // through this webhook), so this just isn't one of ours to handle.
    return NextResponse.json({ received: true });
  }

  const adminClient = createAdminSupabaseClient();

  // Stripe can and does retry webhook delivery, so this has to be safe
  // to receive the same event more than once. Checking for an existing
  // booking against this exact payment intent (rather than relying on a
  // database constraint) is what makes a duplicate delivery a no-op
  // instead of a duplicate booking.
  const { data: existingBooking } = await adminClient
    .from("bookings")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (existingBooking) {
    return NextResponse.json({ received: true });
  }

  // createEventPaymentIntent already refuses a full event, but the event
  // can fill up (or the member can book through another tab) while they're
  // still on the payment form. By the time this runs the charge has
  // succeeded, so the booking is still recorded: a paid member is never
  // silently dropped, and nothing is refunded automatically. Instead it's
  // flagged (log + email, see flagBookingForReview) so it can be followed
  // up by hand: honour the extra spot, or refund in Stripe.
  const ids = { memberId, eventId, paymentIntentId };
  try {
    const capacity = await getEventCapacity(adminClient, eventId);
    if (capacity?.isFull) {
      flagBookingForReview(
        "over capacity",
        `Event ${eventId} already had ${capacity.confirmed}/${capacity.capacity} confirmed bookings when payment intent ${paymentIntentId} (member ${memberId}) succeeded. Booking recorded anyway.`,
        ids,
      );
    }
  } catch (err) {
    console.error(`Stripe webhook: capacity check failed for event ${eventId}:`, err);
  }

  const { data: memberBooking } = await adminClient
    .from("bookings")
    .select("id")
    .eq("member_id", memberId)
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .limit(1)
    .maybeSingle();

  // bookings has a unique index on (member_id, event_id), so a second
  // booking row can't be inserted. The member is already booked; what
  // needs follow-up is the second charge (refund it in Stripe).
  if (memberBooking) {
    flagBookingForReview(
      "paid twice",
      `Member ${memberId} already had booking ${memberBooking.id} for event ${eventId} when payment intent ${paymentIntentId} succeeded. No second booking created; this charge likely needs refunding.`,
      ids,
    );
    return NextResponse.json({ received: true });
  }

  const { error } = await adminClient.from("bookings").insert({
    member_id: memberId,
    event_id: eventId,
    status: "confirmed",
    stripe_payment_intent_id: paymentIntentId,
  });

  if (error) {
    console.error(
      `Stripe webhook: failed to insert booking for member ${memberId}, event ${eventId}, payment intent ${paymentIntentId}:`,
      error,
    );
    // Still a 200: Stripe would otherwise keep retrying an event whose
    // failure is on this end (e.g. a schema issue), not something a
    // retry could fix on its own, and the payment has already
    // succeeded either way, so this needs manual follow-up rather than
    // an automatic retry loop.
    return NextResponse.json({ received: true, error: "Booking insert failed." });
  }

  return NextResponse.json({ received: true });
}
