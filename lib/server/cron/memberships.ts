import "server-only";

// The memberships job. Safe to run every 15 minutes. It asks Stripe before it
// ends anything: our rows can be behind (a missed or late webhook), Stripe is
// the truth (QA3-02, QA3-03).
// 1. A failed payment whose grace ran out (C-D12): if Stripe shows the
//    subscription paid up after all, clear the problem; otherwise cancel the
//    Stripe subscription now and end the membership (payment_failed, or
//    member_cancelled when the member had asked to cancel in the grace days).
// 2. A cancel date that has passed with no membership end recorded: if Stripe
//    shows the subscription ended (or its cancel moment passed), end it
//    (member_cancelled); if Stripe is not set to cancel at all, clear the
//    stale cancel date instead; if Stripe's cancel date is later, use it.
// 3. Any ended member who still has a future booking: cancel and refund it
//    (A-D8), in case an earlier run stopped half way.
// 4. A member in the payment problem state who was never sent the
//    payment-failed email (release/reconcile-members.mjs set the grace, or the
//    webhook's send failed before it was logged): send it now for the open
//    invoice, with the webhook's dedupe key (C-D12; N3).
// Each step is idempotent (endMembership and the booking cancels are).

import { stripe } from "@/lib/stripe";
import { errorMessage, serviceDb, stripeErrorCode } from "../db";
import { cancelFutureBookingsForMember } from "../bookings";
import { clearMembershipPaymentFailed, endMembership, recordMembershipPaymentFailed } from "../membership-actions";
import { periodEndSeconds } from "../stripe/period";
import { currentSubscription, idOf, latestInvoiceOf, stripeCancelAt, subscriptionEnded, subscriptionPaidUp } from "../stripe/subscription";

export type MembershipsSummary = {
  graceEnded: string[];
  /** Grace over, but Stripe shows the subscription paid: the problem was cleared instead (QA3-02). */
  graceCleared: string[];
  cancelDatePassed: string[];
  /** Cancel date passed here, but Stripe is not set to cancel: the stale date was cleared (QA3-03). */
  cancelCleared: string[];
  /** Cancel date passed here, but Stripe ends it later: that date was saved. */
  cancelMoved: string[];
  bookingsSwept: number;
  /** Payment problem on file but no payment-failed email sent: sent now (N3). */
  paymentEmails: string[];
  errors: { memberId: string; error: string }[];
};

export async function runMemberships(now: Date = new Date()): Promise<MembershipsSummary> {
  const db = serviceDb();
  const summary: MembershipsSummary = { graceEnded: [], graceCleared: [], cancelDatePassed: [], cancelCleared: [], cancelMoved: [], bookingsSwept: 0, paymentEmails: [], errors: [] };
  const nowIso = now.toISOString();

  // 1. Grace ran out.
  const { data: graceOver, error: graceError } = await db
    .from("members")
    .select("id, stripe_subscription_id, grace_until, cancel_requested_at")
    .is("ended_at", null)
    .is("deleted_at", null)
    .not("payment_failed_at", "is", null)
    .lte("grace_until", nowIso);
  if (graceError) throw graceError;
  for (const m of graceOver ?? []) {
    try {
      if (m.stripe_subscription_id) {
        const sub = await currentSubscription(m.stripe_subscription_id);
        if (sub && !subscriptionEnded(sub) && (await subscriptionPaidUp(sub))) {
          // The card was fixed and the invoice paid; invoice.paid never reached us.
          await clearMembershipPaymentFailed(m.id);
          summary.graceCleared.push(m.id);
          continue;
        }
        if (sub && !subscriptionEnded(sub)) {
          try {
            await stripe.subscriptions.cancel(m.stripe_subscription_id, {}, { idempotencyKey: `sub-cancel-now-${m.stripe_subscription_id}` });
          } catch (err) {
            if (stripeErrorCode(err) !== "resource_missing") throw err;
          }
        }
      }
      await endMembership(m.id, m.cancel_requested_at ? "member_cancelled" : "payment_failed", { endedAt: m.grace_until });
      summary.graceEnded.push(m.id);
    } catch (err) {
      summary.errors.push({ memberId: m.id, error: errorMessage(err) });
    }
  }

  // 2. Cancel date passed, nothing recorded.
  const { data: pastCancel, error: cancelError } = await db
    .from("members")
    .select("id, cancel_at, stripe_subscription_id")
    .is("ended_at", null)
    .is("deleted_at", null)
    .not("cancel_at", "is", null)
    .lte("cancel_at", nowIso);
  if (cancelError) throw cancelError;
  for (const m of pastCancel ?? []) {
    try {
      let endedAt: string | null = m.cancel_at;
      if (m.stripe_subscription_id) {
        const sub = await currentSubscription(m.stripe_subscription_id);
        if (sub && !subscriptionEnded(sub)) {
          const stripeEnd = stripeCancelAt(sub, periodEndSeconds(sub));
          if (!stripeEnd) {
            // Stripe is not cancelling it (a "Keep my membership" whose event came late, or a stale row): it goes on.
            const { error } = await db.from("members").update({ cancel_at: null, cancel_requested_at: null, cancel_reason: null }).eq("id", m.id).is("ended_at", null);
            if (error) throw error;
            summary.cancelCleared.push(m.id);
            continue;
          }
          if (stripeEnd.getTime() > now.getTime()) {
            const { error } = await db.from("members").update({ cancel_at: stripeEnd.toISOString() }).eq("id", m.id).is("ended_at", null);
            if (error) throw error;
            summary.cancelMoved.push(m.id);
            continue;
          }
          // Stripe's cancel moment has passed; it ends the subscription itself any moment now.
          endedAt = stripeEnd.toISOString();
        }
        // Ended in Stripe: it ends here on the date the member was given (cancel_at).
      }
      await endMembership(m.id, "member_cancelled", { endedAt });
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
    try {
      const { data: m, error } = await db.from("members").select("deleted_at").eq("id", memberId).maybeSingle();
      if (error) throw error;
      const swept = await cancelFutureBookingsForMember(memberId, m?.deleted_at ? "account_deleted" : "membership_ended");
      summary.bookingsSwept += swept.length;
    } catch (err) {
      summary.errors.push({ memberId, error: errorMessage(err) });
    }
  }

  // 4. In the payment problem state and never told.
  const { data: problems, error: problemError } = await db
    .from("members")
    .select("id, stripe_subscription_id, payment_failed_at")
    .is("ended_at", null)
    .is("deleted_at", null)
    .not("payment_failed_at", "is", null)
    .not("stripe_subscription_id", "is", null)
    .gt("grace_until", nowIso);
  if (problemError) throw problemError;
  for (const m of problems ?? []) {
    try {
      const since = new Date(new Date(m.payment_failed_at as string).getTime() - 60 * 60 * 1000).toISOString();
      const { count, error } = await db
        .from("message_log")
        .select("id", { count: "exact", head: true })
        .eq("member_id", m.id)
        .eq("template", "payment-failed")
        .gte("created_at", since);
      if (error) throw error;
      if (count) continue;
      const sub = await currentSubscription(m.stripe_subscription_id as string);
      const invoice = sub && !subscriptionEnded(sub) ? await latestInvoiceOf(sub) : null;
      if (!invoice?.id || invoice.status !== "open") continue;
      const sent = await recordMembershipPaymentFailed(m.id, {
        id: invoice.id,
        amount: invoice.amount_due ?? invoice.total ?? 0,
        paymentMethodId: idOf((invoice.default_payment_method as string | { id: string } | null) ?? null),
        failedAt: m.payment_failed_at,
      });
      if (sent.emailed) summary.paymentEmails.push(m.id);
    } catch (err) {
      summary.errors.push({ memberId: m.id, error: errorMessage(err) });
    }
  }
  return summary;
}
