import type Stripe from "stripe";
import { NextResponse } from "next/server";

import { stripe } from "@/lib/stripe";
import { createAdminSupabaseClient } from "@/app/admin/admin-client";

// Route handlers default to the Node.js runtime already (only opting
// into "edge" is special-cased), but the Stripe SDK specifically
// requires Node, so this is set explicitly rather than left implicit.
export const runtime = "nodejs";

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
