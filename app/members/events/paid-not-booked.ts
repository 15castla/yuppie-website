import "server-only";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { stripe } from "@/lib/stripe";

// "Paid, but not booked yet." (r2a section 3) after a reload, and never a second payment for it.
//
// The source: the row the paid-not-booked path already writes. When a succeeded payment cannot become a
// booking, lib/server/bookings.ts alertPaidNotBooked emails the club, and every email is logged in
// message_log with this member, this event and the dedupe key below (which carries the PaymentIntent id).
// That row is the trigger only; the payment is then checked: no booking was ever made with it (the club may
// have booked the member in since), it is this member's and this event's and it succeeded, and it has not
// been refunded (the club may have refunded it in Stripe, and then the member may book again).
//
// Only a member who has such a row pays the Stripe calls; everyone else costs one small database read.
// Not in actions.ts because every export of a "use server" file becomes a callable server action.

const ALERT_KEY = "admin-alert:paid-not-booked:";

/** amountPence: what was taken (null when Stripe could not be asked; the page then names the event's price). */
export async function paidNotBookedFor(memberId: string, eventId: string): Promise<{ paymentIntentId: string; amountPence: number | null } | null> {
  const db = createAdminSupabaseClient();
  const { data: rows, error } = await db
    .from("message_log")
    .select("dedupe_key")
    .eq("member_id", memberId)
    .eq("event_id", eventId)
    .like("dedupe_key", `${ALERT_KEY}%`)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) {
    console.error(`paidNotBookedFor: message_log read failed for member ${memberId}, event ${eventId}:`, error);
    return null;
  }

  for (const row of rows ?? []) {
    const paymentIntentId = String(row.dedupe_key ?? "").slice(ALERT_KEY.length);
    if (!paymentIntentId.startsWith("pi_")) continue;

    const { count } = await db
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("stripe_payment_intent_id", paymentIntentId);
    if (count) continue;

    let amountPence: number | null = null;
    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (pi.status !== "succeeded" || pi.metadata?.member_id !== memberId || pi.metadata?.event_id !== eventId) continue;
      const refunds = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 20 });
      const refunded = refunds.data
        .filter((refund) => refund.status === "succeeded" || refund.status === "pending")
        .reduce((total, refund) => total + refund.amount, 0);
      amountPence = pi.amount_received || pi.amount;
      if (refunded >= amountPence) continue;
    } catch (err) {
      // Stripe could not say: keep the member from paying twice.
      console.error(`paidNotBookedFor: could not check payment ${paymentIntentId}:`, err);
    }
    return { paymentIntentId, amountPence };
  }
  return null;
}
