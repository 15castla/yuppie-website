import "server-only";

// Stripe webhook processing. The route (app/api/stripe/webhook/route.ts)
// verifies the signature and hands the event here. Each event id is written
// to stripe_events first, so a retried delivery that was processed already is
// skipped; one that failed half way is processed again (every handler is
// idempotent on its own as well).
//
// Rules (QA3 round):
// - A database or Stripe error in a handler throws, so the route answers 500
//   and Stripe sends the event again; the event is marked processed only after
//   its handler finished (QA3-10).
// - Membership events are matched to the member by subscription id. The
//   customer id is a fallback only for a member with no subscription on file,
//   so an event about another subscription of the same customer never ends a
//   membership, and a one-off invoice is not a membership payment (QA3-08).
// - Subscription state comes from Stripe as it is now, not from the payload
//   (events arrive in any order, QA3-03).

import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import { confirmPaidBooking, recordRefundFromCharge } from "../bookings";
import { errorMessage, serviceDb, type EndedReason } from "../db";
import {
  clearMembershipPaymentFailed,
  endMembership,
  recordMembershipPaymentFailed,
  retryMembershipPayment,
  syncSubscription,
  syncSubscriptionCard,
} from "../membership-actions";
import { currentSubscription, idOf, subscriptionEnded } from "./subscription";

export const HANDLED_EVENT_TYPES = [
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "invoice.payment_failed",
  "invoice.paid",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.refunded",
  // QA3-02: a card saved in the billing portal pays the failed membership invoice; N1: and is the card the
  // next renewal charges, also for a subscription made before this release with a card of its own.
  "customer.updated",
  "payment_method.attached",
] as const;

export type WebhookOutcome = { status: "processed" | "duplicate" | "ignored"; type: string; detail?: unknown };

type MemberRef = {
  id: string;
  membership_status: string;
  stripe_subscription_id: string | null;
  ended_reason: EndedReason | null;
  deleted_at: string | null;
  payment_failed_at: string | null;
  cancel_at: string | null;
  cancel_requested_at: string | null;
};
const MEMBER_REF = "id, membership_status, stripe_subscription_id, ended_reason, deleted_at, payment_failed_at, cancel_at, cancel_requested_at";

/** The subscription an invoice belongs to (the 2025+ API moved it under parent; older payloads have it at the top). */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const fromParent = idOf(invoice.parent?.subscription_details?.subscription ?? null);
  if (fromParent) return fromParent;
  const legacy = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  return idOf(legacy ?? null);
}

/** The member a subscription belongs to: by its id; by the customer only for a member with no subscription on file. */
async function memberForSubscription(subscriptionId: string | null, customerId: string | null): Promise<MemberRef | null> {
  if (!subscriptionId) return null;
  const db = serviceDb();
  const { data, error } = await db.from("members").select(MEMBER_REF).eq("stripe_subscription_id", subscriptionId).limit(1).maybeSingle<MemberRef>();
  if (error) throw new Error(`finding the member for subscription ${subscriptionId}: ${error.message}`);
  if (data) return data;
  const byCustomer = await memberForCustomer(customerId);
  return byCustomer && !byCustomer.stripe_subscription_id ? byCustomer : null;
}

/** The one member with this Stripe customer (none when there are two). */
async function memberForCustomer(customerId: string | null): Promise<MemberRef | null> {
  if (!customerId) return null;
  const { data, error } = await serviceDb().from("members").select(MEMBER_REF).eq("stripe_customer_id", customerId).limit(2);
  if (error) throw new Error(`finding the member for customer ${customerId}: ${error.message}`);
  return data?.length === 1 ? (data[0] as MemberRef) : null;
}

function endedReasonFor(member: MemberRef, sub: Stripe.Subscription): EndedReason {
  if (member.deleted_at) return "account_deleted";
  if (member.ended_reason) return member.ended_reason;
  // A cancel the member asked for wins over a failed payment (a cancel made in the grace days, QA1-01).
  if (member.cancel_requested_at || member.cancel_at) return "member_cancelled";
  if (member.payment_failed_at || sub.cancellation_details?.reason === "payment_failed") return "payment_failed";
  // Stripe says "cancellation_requested" for any cancel made through the API or the Dashboard. A member's own
  // cancel is always on file here (cancel_requested_at), so with none on file it was the club (QA3-05).
  return "admin_cancelled";
}

async function endForSubscription(member: MemberRef, sub: Stripe.Subscription): Promise<unknown> {
  const reason = endedReasonFor(member, sub);
  const endedAt = sub.ended_at ? new Date(sub.ended_at * 1000).toISOString() : null;
  const result = await endMembership(member.id, reason, { endedAt });
  return { member: member.id, reason, transitioned: result.transitioned, cancelledBookings: result.cancelledBookings.length };
}

async function dispatch(event: Stripe.Event): Promise<WebhookOutcome> {
  const type = event.type;
  const previous = (event.data as { previous_attributes?: Record<string, unknown> }).previous_attributes;
  switch (type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      if (!pi.metadata?.member_id || !pi.metadata?.event_id) return { status: "ignored", type };
      const result = await confirmPaidBooking(pi);
      return { status: "processed", type, detail: result };
    }
    case "payment_intent.payment_failed": {
      // Nothing to record: the member saw the decline on the page and nothing was booked.
      const pi = event.data.object as Stripe.PaymentIntent;
      return { status: "processed", type, detail: { paymentIntent: pi.id, booking: pi.metadata?.event_id ? "not made" : "not ours" } };
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const member = await memberForSubscription(invoiceSubscriptionId(invoice), idOf(invoice.customer));
      if (!member) return { status: "ignored", type };
      const result = await recordMembershipPaymentFailed(member.id, {
        id: invoice.id ?? event.id,
        amount: invoice.amount_due ?? invoice.total ?? 0,
        paymentMethodId: idOf((invoice.default_payment_method as string | { id: string } | null) ?? null),
        failedAt: new Date(event.created * 1000).toISOString(),
      });
      return { status: "processed", type, detail: { member: member.id, ...result } };
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const member = await memberForSubscription(invoiceSubscriptionId(invoice), idOf(invoice.customer));
      if (!member) return { status: "ignored", type };
      return { status: "processed", type, detail: { member: member.id, cleared: await clearMembershipPaymentFailed(member.id) } };
    }
    case "customer.subscription.updated": {
      const payload = event.data.object as Stripe.Subscription;
      const member = await memberForSubscription(payload.id, idOf(payload.customer));
      if (!member) return { status: "ignored", type };
      const sub = await currentSubscription(payload.id);
      if (!sub || subscriptionEnded(sub)) return { status: "processed", type, detail: await endForSubscription(member, sub ?? payload) };
      return { status: "processed", type, detail: { member: member.id, ...(await syncSubscription(member.id, sub, previous)) } };
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const member = await memberForSubscription(sub.id, idOf(sub.customer));
      if (!member) return { status: "ignored", type, detail: { member: null } };
      return { status: "processed", type, detail: await endForSubscription(member, sub) };
    }
    case "charge.refunded": {
      return { status: "processed", type, detail: await recordRefundFromCharge(event.data.object as Stripe.Charge) };
    }
    case "customer.updated": {
      // Only a new invoice default card matters.
      if (!previous || !("invoice_settings" in previous)) return { status: "ignored", type };
      const payload = event.data.object as Stripe.Customer;
      const member = await memberForCustomer(payload.id);
      if (!member || member.deleted_at || member.membership_status === "cancelled") return { status: "ignored", type };
      // The customer as it is now (a later change may have arrived first).
      const customer = await stripe.customers.retrieve(payload.id);
      const pm = "deleted" in customer && customer.deleted ? null : idOf((customer as Stripe.Customer).invoice_settings?.default_payment_method ?? null);
      // A failed payment: the new card becomes the subscription's and pays the open invoice now (QA3-02).
      if (member.payment_failed_at) return { status: "processed", type, detail: { member: member.id, ...(await retryMembershipPayment(member.id, pm)) } };
      // Otherwise: a subscription with a card of its own (made before this release) takes the new one (N1).
      return { status: "processed", type, detail: { member: member.id, card: await syncSubscriptionCard(member.id, pm) } };
    }
    case "payment_method.attached": {
      const pm = event.data.object as Stripe.PaymentMethod;
      const member = await memberForCustomer(idOf(pm.customer));
      if (!member?.payment_failed_at) return { status: "ignored", type };
      return { status: "processed", type, detail: { member: member.id, ...(await retryMembershipPayment(member.id, pm.id)) } };
    }
    default:
      return { status: "ignored", type };
  }
}

/** Record, skip if already processed, dispatch, mark processed. Throws when a handler fails (the route answers 500 so Stripe retries). */
export async function processStripeEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  const db = serviceDb();
  const { data: inserted, error: insertError } = await db
    .from("stripe_events")
    .upsert({ id: event.id, type: event.type }, { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  if (insertError) throw insertError;
  if (!inserted?.length) {
    const { data: existing, error: readError } = await db.from("stripe_events").select("processed_at").eq("id", event.id).maybeSingle();
    if (readError) throw readError;
    if (existing?.processed_at) return { status: "duplicate", type: event.type };
  }

  let outcome: WebhookOutcome;
  try {
    outcome = await dispatch(event);
  } catch (err) {
    await db.from("stripe_events").update({ error: errorMessage(err).slice(0, 1000) }).eq("id", event.id);
    throw err;
  }
  // Processed only once the handler finished. If this write fails the event is processed again on the next
  // delivery, which every handler allows.
  const { error: doneError } = await db.from("stripe_events").update({ processed_at: new Date().toISOString(), error: null }).eq("id", event.id);
  if (doneError) console.error(`stripe_events: marking ${event.id} processed failed:`, doneError);
  return outcome;
}
