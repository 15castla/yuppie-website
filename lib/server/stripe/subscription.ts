import "server-only";

import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import { stripeErrorCode } from "../db";

// Reading a membership subscription as Stripe has it now. Webhooks arrive in
// any order and can be days late, so the handlers and the memberships job
// decide on this, never on an event's payload (QA3-02, QA3-03).

/** The subscription now, with its latest invoice; null when Stripe has no such subscription. Other errors throw. */
export async function currentSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] });
  } catch (err) {
    if (stripeErrorCode(err) === "resource_missing") return null;
    throw err;
  }
}

/** A subscription that will never bill again. */
export function subscriptionEnded(sub: Pick<Stripe.Subscription, "status"> | null): boolean {
  return !sub || sub.status === "canceled" || sub.status === "incomplete_expired";
}

/** The subscription's latest invoice as an object (expanded, or fetched when Stripe gave only its id). */
export async function latestInvoiceOf(sub: Stripe.Subscription): Promise<Stripe.Invoice | null> {
  const latest = sub.latest_invoice;
  if (!latest) return null;
  if (typeof latest !== "string") return latest;
  return stripe.invoices.retrieve(latest);
}

/** Paid up: running, and the latest invoice is paid (the card was fixed, even if invoice.paid never reached us). */
export async function subscriptionPaidUp(sub: Stripe.Subscription): Promise<boolean> {
  if (sub.status !== "active" && sub.status !== "trialing") return false;
  const invoice = await latestInvoiceOf(sub);
  return !invoice || invoice.status === "paid";
}

/** The moment Stripe will end the subscription (cancel_at, or the period end when cancelling then), or null. */
export function stripeCancelAt(sub: Stripe.Subscription, periodEnd: number | null): Date | null {
  if (sub.cancel_at) return new Date(sub.cancel_at * 1000);
  if (sub.cancel_at_period_end && periodEnd) return new Date(periodEnd * 1000);
  return null;
}

/** An id from a Stripe field that may be expanded. */
export function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
