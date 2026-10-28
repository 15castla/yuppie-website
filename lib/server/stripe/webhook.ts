import "server-only";

// Stripe webhook processing. The route (app/api/stripe/webhook/route.ts)
// verifies the signature and hands the event here. Each event id is written
// to stripe_events first, so a retried delivery that was processed already is
// skipped; one that failed half way is processed again (every handler is
// idempotent on its own as well).

import type Stripe from "stripe";

import { confirmPaidBooking, recordRefundFromCharge } from "../bookings";
import { errorMessage, serviceDb, type EndedReason } from "../db";
import {
  clearMembershipPaymentFailed,
  endMembership,
  recordMembershipPaymentFailed,
  syncSubscription,
} from "../membership-actions";

export const HANDLED_EVENT_TYPES = [
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "invoice.payment_failed",
  "invoice.paid",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.refunded",
] as const;

export type WebhookOutcome = { status: "processed" | "duplicate" | "ignored"; type: string; detail?: unknown };

type MemberRef = { id: string; membership_status: string; ended_reason: EndedReason | null; deleted_at: string | null; payment_failed_at: string | null; cancel_at: string | null; cancel_requested_at: string | null };
const MEMBER_REF = "id, membership_status, ended_reason, deleted_at, payment_failed_at, cancel_at, cancel_requested_at";

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/** The subscription an invoice belongs to (the 2025+ API moved it under parent; older payloads have it at the top). */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const fromParent = idOf(invoice.parent?.subscription_details?.subscription ?? null);
  if (fromParent) return fromParent;
  const legacy = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  return idOf(legacy ?? null);
}

async function findMember(subscriptionId: string | null, customerId: string | null): Promise<MemberRef | null> {
  const db = serviceDb();
  if (subscriptionId) {
    const { data } = await db.from("members").select(MEMBER_REF).eq("stripe_subscription_id", subscriptionId).limit(1).maybeSingle<MemberRef>();
    if (data) return data;
  }
  if (customerId) {
    const { data } = await db.from("members").select(MEMBER_REF).eq("stripe_customer_id", customerId).limit(2);
    if (data?.length === 1) return data[0] as MemberRef;
  }
  return null;
}

function endedReasonFor(member: MemberRef, sub: Stripe.Subscription): EndedReason {
  if (member.deleted_at) return "account_deleted";
  if (member.ended_reason) return member.ended_reason;
  if (member.payment_failed_at || sub.cancellation_details?.reason === "payment_failed") return "payment_failed";
  if (member.cancel_requested_at || member.cancel_at || sub.cancellation_details?.reason === "cancellation_requested") return "member_cancelled";
  return "admin_cancelled";
}

async function subscriptionEnded(sub: Stripe.Subscription): Promise<unknown> {
  const member = await findMember(sub.id, idOf(sub.customer));
  if (!member) return { member: null };
  const reason = endedReasonFor(member, sub);
  const endedAt = sub.ended_at ? new Date(sub.ended_at * 1000).toISOString() : null;
  const result = await endMembership(member.id, reason, { endedAt });
  return { member: member.id, reason, transitioned: result.transitioned, cancelledBookings: result.cancelledBookings.length };
}

async function dispatch(event: Stripe.Event): Promise<WebhookOutcome> {
  const type = event.type;
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
      const member = await findMember(invoiceSubscriptionId(invoice), idOf(invoice.customer));
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
      const member = await findMember(invoiceSubscriptionId(invoice), idOf(invoice.customer));
      if (!member) return { status: "ignored", type };
      return { status: "processed", type, detail: { member: member.id, cleared: await clearMembershipPaymentFailed(member.id) } };
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      if (sub.status === "canceled") return { status: "processed", type, detail: await subscriptionEnded(sub) };
      const member = await findMember(sub.id, idOf(sub.customer));
      if (!member) return { status: "ignored", type };
      const previous = (event.data as { previous_attributes?: Record<string, unknown> }).previous_attributes;
      return { status: "processed", type, detail: { member: member.id, ...(await syncSubscription(member.id, sub, previous)) } };
    }
    case "customer.subscription.deleted": {
      return { status: "processed", type, detail: await subscriptionEnded(event.data.object as Stripe.Subscription) };
    }
    case "charge.refunded": {
      return { status: "processed", type, detail: await recordRefundFromCharge(event.data.object as Stripe.Charge) };
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
    const { data: existing } = await db.from("stripe_events").select("processed_at").eq("id", event.id).maybeSingle();
    if (existing?.processed_at) return { status: "duplicate", type: event.type };
  }

  try {
    const outcome = await dispatch(event);
    await db.from("stripe_events").update({ processed_at: new Date().toISOString(), error: null }).eq("id", event.id);
    return outcome;
  } catch (err) {
    await db.from("stripe_events").update({ error: errorMessage(err).slice(0, 1000) }).eq("id", event.id);
    throw err;
  }
}
