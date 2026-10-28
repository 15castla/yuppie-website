import "server-only";

// The memberships job. Safe to run every 15 minutes:
// 1. A failed payment whose grace ran out (C-D12): cancel the Stripe
//    subscription now and end the membership (payment_failed).
// 2. A cancel date that has passed with no membership end recorded (the
//    webhook was missed): end the membership (member_cancelled).
// 3. Any ended member who still has a future booking: cancel and refund it
//    (A-D8), in case an earlier run stopped half way.
// Each step is idempotent (endMembership and the booking cancels are).

import { stripe } from "@/lib/stripe";
import { errorMessage, serviceDb, stripeErrorCode } from "../db";
import { cancelFutureBookingsForMember } from "../bookings";
import { endMembership } from "../membership-actions";

export type MembershipsSummary = {
  graceEnded: string[];
  cancelDatePassed: string[];
  bookingsSwept: number;
  errors: { memberId: string; error: string }[];
};

export async function runMemberships(now: Date = new Date()): Promise<MembershipsSummary> {
  const db = serviceDb();
  const summary: MembershipsSummary = { graceEnded: [], cancelDatePassed: [], bookingsSwept: 0, errors: [] };
  const nowIso = now.toISOString();

  // 1. Grace ran out.
  const { data: graceOver, error: graceError } = await db
    .from("members")
    .select("id, stripe_subscription_id, grace_until")
    .is("ended_at", null)
    .is("deleted_at", null)
    .not("payment_failed_at", "is", null)
    .lte("grace_until", nowIso);
  if (graceError) throw graceError;
  for (const m of graceOver ?? []) {
    try {
      if (m.stripe_subscription_id) {
        try {
          await stripe.subscriptions.cancel(m.stripe_subscription_id, {}, { idempotencyKey: `sub-cancel-now-${m.stripe_subscription_id}` });
        } catch (err) {
          if (stripeErrorCode(err) !== "resource_missing") throw err;
        }
      }
      await endMembership(m.id, "payment_failed", { endedAt: m.grace_until });
      summary.graceEnded.push(m.id);
    } catch (err) {
      summary.errors.push({ memberId: m.id, error: errorMessage(err) });
    }
  }

  // 2. Cancel date passed, nothing recorded.
  const { data: pastCancel, error: cancelError } = await db
    .from("members")
    .select("id, cancel_at")
    .is("ended_at", null)
    .is("deleted_at", null)
    .not("cancel_at", "is", null)
    .lte("cancel_at", nowIso);
  if (cancelError) throw cancelError;
  for (const m of pastCancel ?? []) {
    try {
      await endMembership(m.id, "member_cancelled", { endedAt: m.cancel_at });
      summary.cancelDatePassed.push(m.id);
    } catch (err) {
      summary.errors.push({ memberId: m.id, error: errorMessage(err) });
    }
  }

  // 3. Ended members with a future confirmed booking left.
  const { data: leftovers, error: leftError } = await db
    .from("bookings")
    .select("member_id, member:members!inner(membership_status, deleted_at), event:events!inner(start_time)")
    .eq("status", "confirmed")
    .eq("member.membership_status", "cancelled")
    .gt("event.start_time", nowIso);
  if (leftError) throw leftError;
  const memberIds = [...new Set((leftovers ?? []).map((b) => b.member_id as string))];
  for (const memberId of memberIds) {
    const { data: m } = await db.from("members").select("deleted_at").eq("id", memberId).maybeSingle();
    const swept = await cancelFutureBookingsForMember(memberId, m?.deleted_at ? "account_deleted" : "membership_ended");
    summary.bookingsSwept += swept.length;
  }
  return summary;
}
