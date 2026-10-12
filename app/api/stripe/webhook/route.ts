import type Stripe from "stripe";
import { NextResponse } from "next/server";

import { stripe } from "@/lib/stripe";
import { confirmPaidBooking } from "@/app/members/events/confirm-paid-booking";

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

  // Same idempotent insert the page itself calls (confirmEventPayment in
  // app/members/events/actions.ts) once a payment completes in place. This
  // stays as the path for payments that finish elsewhere: Apple Pay or 3D
  // Secure redirects, or a member closing the app mid-payment. Stripe also
  // retries delivery, which the same idempotency makes a no-op.
  const { booked } = await confirmPaidBooking(paymentIntentId, memberId, eventId);

  if (!booked) {
    // confirmPaidBooking has logged the details. Still a 200: Stripe
    // would otherwise keep retrying an event whose failure is on this end
    // (e.g. a schema issue), not something a retry could fix on its own,
    // and the payment has already succeeded either way, so this needs
    // manual follow-up rather than an automatic retry loop.
    return NextResponse.json({ received: true, error: "Booking insert failed." });
  }

  return NextResponse.json({ received: true });
}
