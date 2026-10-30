import type Stripe from "stripe";
import { NextResponse } from "next/server";

import { stripe } from "@/lib/stripe";
import { processStripeEvent } from "@/lib/server/stripe/webhook";

// Route handlers default to the Node.js runtime already, but the Stripe SDK
// specifically requires Node, so this is set explicitly.
export const runtime = "nodejs";

// Stripe webhooks: verify the signature, then lib/server/stripe/webhook.ts
// records the event id (a retried delivery that was processed is skipped) and
// runs one handler per type: payment_intent.succeeded (a paid booking, the
// same idempotent path the page uses), payment_intent.payment_failed,
// invoice.payment_failed and invoice.paid (membership payment trouble and its
// fix), customer.subscription.updated and .deleted (cancel dates, pause, the
// end of a membership with its D8 refunds) and charge.refunded.
//
// A handler that throws answers 500 so Stripe retries; anything else is 200.
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

  try {
    const outcome = await processStripeEvent(event);
    return NextResponse.json({ received: true, ...outcome });
  } catch (err) {
    console.error(`Stripe webhook ${event.type} ${event.id} failed:`, err);
    return NextResponse.json({ received: false, error: "Handler failed." }, { status: 500 });
  }
}
