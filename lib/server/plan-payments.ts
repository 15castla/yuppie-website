import "server-only";

// Paid Open Invite (Albert, 15 Nov 2026: "Ok shall we build the ability to add costs to open invite"), on the money
// rules approved on 25 Oct (round 3 call 2). Stripe Connect, separate charges and transfers:
//   - Get paid: each host has a Stripe connected account (Express: Stripe's hosted onboarding checks who they are
//     and keeps their bank details; Club Yuppie never sees them). host_accounts keeps its status as last read.
//   - Pay and join: a place is held for 10 minutes (hold_plan_place), a PaymentIntent on Club Yuppie's own account
//     holds the card (capture_method manual), and only once the place is taken under the plan's lock
//     (join_paid_plan) is the card captured. A plan that filled first is never charged: the hold is cancelled.
//   - The money stays with Club Yuppie until the plan is over: 24 hours after it starts the sweep sends each payment
//     to the host's account (a transfer from that very charge, source_transaction), and Stripe pays it into their
//     bank, about 2 working days after the plan. Club Yuppie covers the card fees and takes no cut.
//   - Refunds: leaving more than 24 hours before is refunded automatically; later, the member asks the host (kept
//     if there is no answer by the start); the host or the club cancelling refunds everyone; the club can refund
//     one payment from Admin. A refund Stripe did not confirm is tried again by the sweep (refund_due).
// The database rules are in supabase/migrations/20261115090000_paid_plans.sql.

import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import type {
  GetPaid,
  GetPaidStatus,
  HostPaidPlan,
  HostPayments,
  HostPlanPayments,
  InviteMember,
  InvitePayment,
  PaymentRefund,
  PaymentStatus,
  Receipt,
} from "@/lib/members/invite/types";
import { BOOKING_FEE_PENCE } from "@/lib/members/invite/types";
import { cardLabel } from "./stripe/card";
import { serviceDb } from "./db";
import { londonWall, londonWallToDate } from "./format";
import { notify } from "./notify";
import { peopleRefs } from "./people";

// ---------------------------------------------------------------------------- rows and words

export type PaymentRow = {
  id: string;
  receipt_no: number;
  plan_id: string;
  payer_id: string;
  host_id: string;
  hold_id: string | null;
  amount_pence: number;
  /** Club Yuppie's booking fee paid with the place (15 Nov 2026). */
  fee_pence: number;
  /** What went back to the card. */
  refunded_pence: number | null;
  payment_intent_id: string;
  charge_id: string | null;
  method: string | null;
  status: "held" | "refund_asked" | "refund_due" | "refunded" | "paid_out";
  paid_at: string;
  refund_asked_at: string | null;
  refund_reason: "left-in-time" | "host-cancelled" | "host-agreed" | "club" | null;
  refund_due_at: string | null;
  refund_id: string | null;
  refund_tries: number;
  refunded_at: string | null;
  transfer_id: string | null;
  transfer_tries: number;
  transferred_at: string | null;
  payout_on: string | null;
};

const PAYMENT_COLUMNS =
  "id, receipt_no, plan_id, payer_id, host_id, hold_id, amount_pence, fee_pence, refunded_pence, payment_intent_id, charge_id, method, status, paid_at, refund_asked_at, refund_reason, refund_due_at, refund_id, refund_tries, refunded_at, transfer_id, transfer_tries, transferred_at, payout_on";

/** How long a place is held while the member pays. */
export const HOLD_MINUTES = 10;
/** The money goes to the host this long after the plan starts (a no-show can be reported and refunded first). */
export const PAYOUT_AFTER_HOURS = 24;
/** Refused refunds and transfers are tried this many times by the sweep, then the club is told in the logs. */
const MAX_TRIES = 5;

const DAY = 86_400_000;

/** The day `n` working days (Monday to Friday) after `from`, at 09:00 London. */
export function workingDaysAfter(from: Date | string, n: number): Date {
  const w = londonWall(from);
  let date = new Date(Date.UTC(w.year, w.month - 1, w.day));
  let left = n;
  while (left > 0) {
    date = new Date(date.getTime() + DAY);
    const dow = date.getUTCDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return londonWallToDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), 9);
}

/** "About 2 working days after the plan": the day the host is told to expect it. */
export function payoutDayFor(startsAt: string): string {
  return workingDaysAfter(startsAt, 2).toISOString();
}

/** Card refunds usually land in 5 to 10 working days: the date by which one should have. */
const refundExpectedBy = (at: string) => workingDaysAfter(at, 10).toISOString();

export function paymentStatus(row: Pick<PaymentRow, "status">): PaymentStatus {
  if (row.status === "refund_asked") return "refund-asked";
  if (row.status === "refund_due" || row.status === "refunded") return "refunded";
  if (row.status === "paid_out") return "paid-out";
  return "held";
}

/**
 * What a refund gives back (15 Nov 2026): the place, and the booking fee too when the plan was cancelled (by the host
 * or the club) or the club refunded it. A member who leaves keeps the place's money only.
 */
export function refundPenceFor(row: Pick<PaymentRow, "amount_pence" | "fee_pence" | "refund_reason">): number {
  const feeBack = row.refund_reason === "host-cancelled" || row.refund_reason === "club";
  return row.amount_pence + (feeBack ? row.fee_pence ?? 0 : 0);
}

export function toInvitePayment(row: PaymentRow, payer: InviteMember): InvitePayment {
  const refunded = row.status === "refund_due" || row.status === "refunded";
  const refundedAt = row.refunded_at ?? row.refund_due_at ?? row.paid_at;
  const refund: PaymentRefund | null = refunded
    ? {
        amountPence: row.refunded_pence ?? refundPenceFor(row),
        reason: row.refund_reason ?? "club",
        refundedAt: new Date(refundedAt).toISOString(),
        expectedBy: refundExpectedBy(refundedAt),
      }
    : null;
  return {
    id: row.id,
    receiptNumber: String(row.receipt_no).padStart(4, "0"),
    inviteId: row.plan_id,
    payer,
    amountPence: row.amount_pence,
    feePence: row.fee_pence ?? 0,
    paidAt: new Date(row.paid_at).toISOString(),
    method: row.method ?? "Card",
    status: paymentStatus(row),
    refundAskedAt: row.status === "refund_asked" && row.refund_asked_at ? new Date(row.refund_asked_at).toISOString() : null,
    refund,
  };
}

const ref = (refs: Map<string, InviteMember>, id: string): InviteMember => refs.get(id) ?? { id, firstName: "Member", photoUrl: null };

/** Every payment on these plans, oldest first. */
export async function paymentsForPlans(planIds: string[]): Promise<PaymentRow[]> {
  if (!planIds.length) return [];
  const { data, error } = await serviceDb().from("plan_payments").select(PAYMENT_COLUMNS).in("plan_id", planIds).order("paid_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PaymentRow[];
}

// ---------------------------------------------------------------------------- Get paid (Stripe Connect)

type HostAccountRow = { member_id: string; stripe_account_id: string; status: GetPaidStatus; account_ending: string | null; checked_at: string | null };

async function hostAccount(memberId: string): Promise<HostAccountRow | null> {
  const { data, error } = await serviceDb()
    .from("host_accounts")
    .select("member_id, stripe_account_id, status, account_ending, checked_at")
    .eq("member_id", memberId)
    .maybeSingle<HostAccountRow>();
  if (error) throw error;
  return data ?? null;
}

/** Stripe's account, in the four steps the host sees. */
export function getPaidStatusOf(account: Stripe.Account): GetPaidStatus {
  const requirements = account.requirements;
  const due = [...(requirements?.currently_due ?? []), ...(requirements?.past_due ?? [])];
  if (!account.details_submitted) return "not-set-up";
  if (account.capabilities?.transfers === "active" && account.payouts_enabled) return "ready";
  if (due.length || (requirements?.disabled_reason ?? "").startsWith("requirements.past_due")) return "needs-info";
  return "in-review";
}

async function bankEnding(account: Stripe.Account): Promise<string | null> {
  const listed = account.external_accounts?.data?.[0] as { last4?: string } | undefined;
  if (listed?.last4) return listed.last4;
  try {
    const list = await stripe.accounts.listExternalAccounts(account.id, { limit: 1 });
    return (list.data[0] as { last4?: string } | undefined)?.last4 ?? null;
  } catch {
    return null;
  }
}

/** Read the host's account from Stripe again and keep what it says. Never throws: the last known status stays. */
export async function refreshHostAccount(memberId: string): Promise<HostAccountRow | null> {
  const row = await hostAccount(memberId);
  if (!row) return null;
  try {
    const account = await stripe.accounts.retrieve(row.stripe_account_id);
    const status = getPaidStatusOf(account);
    const ending = await bankEnding(account);
    const next = { status, account_ending: ending, checked_at: new Date().toISOString() };
    await serviceDb().from("host_accounts").update(next).eq("member_id", memberId);
    const became = row.status !== "ready" && status === "ready";
    if (became) console.log(`plan-payments: Get paid is ready for ${memberId}`);
    return { ...row, ...next };
  } catch (err) {
    console.error(`plan-payments: reading the Stripe account of ${memberId} failed:`, err);
    return row;
  }
}

/** How long a status that is not "ready" is trusted before Stripe is asked again (the page, the post form). */
const RECHECK_MS = 60_000;

/**
 * The host's Get paid, for the Payments page and the post form. `fresh`: ask Stripe again unless it is ready (or
 * was just checked). A payout waiting on Stripe ("needs more info") shows as paused.
 */
export async function getPaidFor(memberId: string, { fresh = false }: { fresh?: boolean | "now" } = {}): Promise<GetPaid> {
  let row = await hostAccount(memberId);
  // "now": back from Stripe (?getpaid=back), so ask whatever the last check.
  if (row && fresh && row.status !== "ready" && (fresh === "now" || Date.now() - new Date(row.checked_at ?? 0).getTime() > RECHECK_MS)) {
    row = await refreshHostAccount(memberId);
  }
  if (!row) return { status: "not-set-up", accountEnding: null, paused: null };
  let paused: GetPaid["paused"] = null;
  if (row.status !== "ready") {
    const { data } = await serviceDb()
      .from("plan_payments")
      .select("amount_pence, plans!inner(starts_at)")
      .eq("host_id", memberId)
      .in("status", ["held", "refund_asked"]);
    const due = ((data ?? []) as unknown as { amount_pence: number; plans: { starts_at: string } }[]).filter(
      (p) => new Date(p.plans.starts_at).getTime() + PAYOUT_AFTER_HOURS * 3_600_000 <= Date.now(),
    );
    if (due.length) {
      paused = {
        amountPence: due.reduce((sum, p) => sum + p.amount_pence, 0),
        dueOn: payoutDayFor(due.map((p) => p.plans.starts_at).sort()[0]),
      };
    }
  }
  return { status: row.status, accountEnding: row.status === "ready" ? row.account_ending : null, paused };
}

/** The cached status only (no Stripe call): for drawing plans. */
export async function getPaidStatuses(memberIds: string[]): Promise<Map<string, GetPaidStatus>> {
  const out = new Map<string, GetPaidStatus>();
  if (!memberIds.length) return out;
  const { data } = await serviceDb().from("host_accounts").select("member_id, status").in("member_id", [...new Set(memberIds)]);
  for (const r of (data ?? []) as { member_id: string; status: GetPaidStatus }[]) out.set(r.member_id, r.status);
  return out;
}

function isInvalidRequest(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "type" in err && (err as { type: string }).type === "StripeInvalidRequestError");
}

/**
 * The host's connected account, made the first time. Express (Stripe's hosted onboarding and dashboard), in the UK,
 * as an individual, for transfers only (Club Yuppie takes the payments; the host only receives). Should Stripe
 * refuse that set-up, the next one is tried (card payments too, then no business details), and each refusal is
 * logged.
 */
async function connectedAccountFor(member: { id: string; email: string }): Promise<string> {
  const existing = await hostAccount(member.id);
  if (existing) return existing.stripe_account_id;
  const base: Stripe.AccountCreateParams = {
    type: "express",
    country: "GB",
    email: member.email,
    business_type: "individual",
    metadata: { member_id: member.id, club: "Club Yuppie" },
  };
  const profile: Stripe.AccountCreateParams.BusinessProfile = {
    mcc: "7999",
    product_description: "Sharing the cost of plans with other Club Yuppie members (Open Invite).",
  };
  const tries: Stripe.AccountCreateParams[] = [
    { ...base, business_profile: profile, capabilities: { transfers: { requested: true } } },
    { ...base, business_profile: profile, capabilities: { transfers: { requested: true }, card_payments: { requested: true } } },
    { ...base, capabilities: { transfers: { requested: true }, card_payments: { requested: true } } },
  ];
  let account: Stripe.Account | null = null;
  let lastError: unknown = null;
  for (const [index, params] of tries.entries()) {
    try {
      account = await stripe.accounts.create(params, { idempotencyKey: `host-account-${member.id}-${index}` });
      break;
    } catch (err) {
      lastError = err;
      console.error(`plan-payments: Stripe refused account set-up ${index + 1} for ${member.id}:`, err);
      if (!isInvalidRequest(err)) break;
    }
  }
  if (!account) throw lastError ?? new Error("No connected account");
  const { error } = await serviceDb()
    .from("host_accounts")
    .upsert({ member_id: member.id, stripe_account_id: account.id, status: "not-set-up", checked_at: new Date().toISOString() }, { onConflict: "member_id", ignoreDuplicates: true });
  if (error) throw error;
  return (await hostAccount(member.id))!.stripe_account_id;
}

/**
 * Where "Continue to Stripe" (or "Manage on Stripe") goes: Stripe's hosted onboarding (a one-use link, valid a few
 * minutes), or, once the details are in, the host's Stripe dashboard. `back`: where Stripe sends them afterwards;
 * `again`: where an expired link goes (it makes a new one).
 */
export async function getPaidLink(member: { id: string; email: string }, manage: boolean, back: string, again: string): Promise<string> {
  const accountId = await connectedAccountFor(member);
  const row = await refreshHostAccount(member.id);
  if (manage && row && (row.status === "ready" || row.status === "in-review")) {
    try {
      return (await stripe.accounts.createLoginLink(accountId)).url;
    } catch (err) {
      console.error(`plan-payments: the Stripe dashboard link for ${member.id} failed (onboarding instead):`, err);
    }
  }
  const link = await stripe.accountLinks.create({ account: accountId, type: "account_onboarding", return_url: back, refresh_url: again });
  return link.url;
}

// ---------------------------------------------------------------------------- Pay and join

export type StartPayResult =
  | { kind: "ready"; clientSecret: string; amountPence: number; heldUntil: string; paymentIntentId: string }
  | { kind: "full" }
  | { kind: "already-in" }
  | { kind: "refused"; error: string };

type PlanForPay = { id: string; host_id: string; title: string; price_pence: number | null };

const HOLD_WORDS: Record<string, string> = {
  started: "This plan has started.",
  cancelled: "This plan was cancelled.",
  host: "It’s your plan, so you’re in already.",
  free: "This plan is free now. Close this and tap I’m in.",
  blocked: "That plan couldn’t be found.",
  inactive: "Your membership isn’t active, so you can’t join plans.",
  not_found: "That plan couldn’t be found.",
};

/** Pay and join, step 1: hold a place and make the PaymentIntent the pay sheet draws Stripe's fields for. */
export async function startPlanPayment(member: { id: string; email: string; stripe_customer_id: string | null }, plan: PlanForPay, hostName: string): Promise<StartPayResult> {
  if (plan.price_pence === null) return { kind: "refused", error: HOLD_WORDS.free };
  const statuses = await getPaidStatuses([plan.host_id]);
  if (statuses.get(plan.host_id) !== "ready") {
    return { kind: "refused", error: `${hostName} can’t take payments right now, so nobody can pay to join yet.` };
  }
  const { data, error } = await serviceDb().rpc("hold_plan_place", { p_member: member.id, p_plan: plan.id, p_minutes: HOLD_MINUTES });
  if (error) throw error;
  const r = data as { status: string; hold_id?: string; amount?: number; held_until?: string };
  if (r.status === "full") return { kind: "full" };
  if (r.status === "already_in") return { kind: "already-in" };
  if (r.status !== "held" || !r.hold_id || !r.amount || !r.held_until) return { kind: "refused", error: HOLD_WORDS[r.status] ?? HOLD_WORDS.not_found };

  // The place and Club Yuppie's booking fee, in one payment (the host gets the place's price).
  const total = r.amount + BOOKING_FEE_PENCE;
  const pi = await stripe.paymentIntents.create(
    {
      amount: total,
      currency: "gbp",
      ...(member.stripe_customer_id ? { customer: member.stripe_customer_id } : {}),
      capture_method: "manual",
      automatic_payment_methods: { enabled: true },
      description: `${plan.title} (Open Invite)`,
      transfer_group: `plan-${plan.id}`,
      metadata: { kind: "plan", plan_id: plan.id, member_id: member.id, hold_id: r.hold_id, host_id: plan.host_id, fee_pence: String(BOOKING_FEE_PENCE) },
    },
    { idempotencyKey: `plan-pi-${r.hold_id}-fee` },
  );
  await serviceDb().from("plan_holds").update({ payment_intent_id: pi.id }).eq("id", r.hold_id);
  if (!pi.client_secret) return { kind: "refused", error: "We couldn’t open payment. Nothing was taken." };
  return { kind: "ready", clientSecret: pi.client_secret, amountPence: total, heldUntil: new Date(r.held_until).toISOString(), paymentIntentId: pi.id };
}

/** What happened to a PaymentIntent for a place (the pay sheet's answer, the webhook's, the sweep's). */
export type SettleResult =
  | { kind: "paid"; paymentId: string; planId: string; memberId: string; joinedNow: boolean }
  | { kind: "full" }
  | { kind: "price-changed"; newPricePence: number | null }
  | { kind: "declined" }
  | { kind: "pending" }
  | { kind: "refused"; reason: string }
  | { kind: "not-ours" };

async function methodOf(pi: Stripe.PaymentIntent): Promise<string | null> {
  const pm = pi.payment_method;
  if (pm && typeof pm !== "string") return cardLabel(pm);
  if (typeof pm === "string") {
    try {
      return cardLabel(await stripe.paymentMethods.retrieve(pm));
    } catch {
      return null;
    }
  }
  return null;
}

async function cancelQuietly(piId: string): Promise<void> {
  try {
    await stripe.paymentIntents.cancel(piId);
  } catch (err) {
    console.error(`plan-payments: cancelling ${piId} failed (Stripe lets a hold lapse after 7 days):`, err);
  }
}

async function closeHold(holdId: string | undefined, status: "closed" | "released" = "closed"): Promise<void> {
  if (holdId) await serviceDb().from("plan_holds").update({ status }).eq("id", holdId).neq("status", "paid");
}

/**
 * Settle a PaymentIntent for a place: with the card held, take the place (join_paid_plan, under the plan's lock),
 * then capture. A plan that filled, a price that moved, a plan that was cancelled: the hold is cancelled and nothing
 * is taken. Safe to call again for the same PaymentIntent (the page, the webhook and the sweep may all try).
 */
export async function settlePlanPayment(paymentIntentId: string, expectMember?: string): Promise<SettleResult> {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["payment_method"] });
  const md = pi.metadata ?? {};
  if (md.kind !== "plan" || !md.plan_id || !md.member_id) return { kind: "not-ours" };
  if (expectMember && md.member_id !== expectMember) return { kind: "not-ours" };

  if (pi.status === "processing" || pi.status === "requires_action" || pi.status === "requires_confirmation") return { kind: "pending" };
  if (pi.status === "requires_payment_method" || pi.status === "canceled") {
    if (pi.status === "canceled") await closeHold(md.hold_id);
    return { kind: "declined" };
  }

  const method = await methodOf(pi);
  // The payment is the place and the booking fee (metadata.fee_pence); the place's price must still be the plan's.
  const fee = Math.max(0, Number(md.fee_pence ?? 0) || 0);
  const place = pi.amount - fee;
  const { data, error } = await serviceDb().rpc("join_paid_plan", {
    p_member: md.member_id,
    p_plan: md.plan_id,
    p_hold: md.hold_id ?? null,
    p_payment_intent: pi.id,
    p_amount: place,
    p_method: method,
    p_fee: fee,
  });
  if (error) throw error;
  const r = data as { status: string; payment_id?: string; full?: boolean; price?: number | null };

  if (r.status === "joined" || r.status === "already_paid") {
    const paymentId = r.payment_id!;
    if (pi.status === "requires_capture") {
      try {
        const captured = await stripe.paymentIntents.capture(pi.id, {}, { idempotencyKey: `plan-capture-${pi.id}` });
        const charge = typeof captured.latest_charge === "string" ? captured.latest_charge : (captured.latest_charge?.id ?? null);
        await serviceDb().from("plan_payments").update({ charge_id: charge }).eq("id", paymentId);
      } catch (err) {
        console.error(`plan-payments: capturing ${pi.id} failed, the place is given back:`, err);
        await serviceDb().rpc("undo_paid_join", { p_payment: paymentId });
        await cancelQuietly(pi.id);
        return { kind: "declined" };
      }
    } else if (pi.status === "succeeded") {
      const charge = typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge?.id ?? null);
      if (charge) await serviceDb().from("plan_payments").update({ charge_id: charge }).eq("id", paymentId).is("charge_id", null);
    }
    if (r.status === "joined") {
      await notify({ type: "plan.joined", planId: md.plan_id, memberId: md.member_id, full: Boolean(r.full), paidPence: place });
      await notify({ type: "plan.receipt", paymentId });
    }
    return { kind: "paid", paymentId, planId: md.plan_id, memberId: md.member_id, joinedNow: r.status === "joined" };
  }

  // Not taken: let the card go (or, if Stripe already took it, give it back).
  if (pi.status === "succeeded") {
    try {
      await stripe.refunds.create({ payment_intent: pi.id, metadata: { reason: `plan ${r.status}` } }, { idempotencyKey: `plan-unjoined-${pi.id}` });
    } catch (err) {
      console.error(`plan-payments: refunding ${pi.id} (taken, no place) failed:`, err);
    }
  } else {
    await cancelQuietly(pi.id);
  }
  await closeHold(md.hold_id);
  if (r.status === "full") return { kind: "full" };
  if (r.status === "price_changed") return { kind: "price-changed", newPricePence: r.price ?? null };
  if (r.status === "already_in") {
    const { data: existing } = await serviceDb()
      .from("plan_payments")
      .select("id")
      .eq("plan_id", md.plan_id)
      .eq("payer_id", md.member_id)
      .in("status", ["held", "refund_asked", "paid_out"])
      .order("paid_at", { ascending: false })
      .limit(1);
    const found = (existing ?? [])[0] as { id: string } | undefined;
    if (found) return { kind: "paid", paymentId: found.id, planId: md.plan_id, memberId: md.member_id, joinedNow: false };
  }
  return { kind: "refused", reason: r.status };
}

/** The member closed the pay sheet without paying: the place goes back at once (and an untouched hold is let go). */
export async function releasePlanHold(memberId: string, planId: string): Promise<void> {
  const { data } = await serviceDb()
    .from("plan_holds")
    .update({ status: "released" })
    .eq("plan_id", planId)
    .eq("member_id", memberId)
    .eq("status", "open")
    .select("id, payment_intent_id");
  for (const hold of (data ?? []) as { id: string; payment_intent_id: string | null }[]) {
    if (!hold.payment_intent_id) continue;
    try {
      const pi = await stripe.paymentIntents.retrieve(hold.payment_intent_id);
      if (pi.status === "requires_payment_method" || pi.status === "requires_confirmation") {
        await cancelQuietly(pi.id);
        await closeHold(hold.id);
      } else if (pi.status === "requires_capture") {
        await settlePlanPayment(pi.id, memberId);
      }
    } catch (err) {
      console.error(`plan-payments: letting go of hold ${hold.id} failed (the sweep checks it):`, err);
    }
  }
}

// ---------------------------------------------------------------------------- refunds

/**
 * Send a decided refund (refund_due) to Stripe. Idempotent per payment. `tell`: the member hears about it on its own
 * (not when the plan's cancel already told them). Returns whether Stripe took it.
 */
export async function sendRefund(paymentId: string, { tell = true }: { tell?: boolean } = {}): Promise<boolean> {
  const db = serviceDb();
  const { data: row } = await db.from("plan_payments").select(PAYMENT_COLUMNS).eq("id", paymentId).maybeSingle<PaymentRow>();
  if (!row || row.status !== "refund_due") return row?.status === "refunded";
  try {
    // The place, and the booking fee only when the plan was cancelled or the club refunded it.
    const amount = refundPenceFor(row);
    const refund = await stripe.refunds.create(
      { payment_intent: row.payment_intent_id, amount, reason: "requested_by_customer", metadata: { payment_id: row.id, plan_id: row.plan_id, why: row.refund_reason ?? "" } },
      { idempotencyKey: `plan-refund-${row.id}-${amount}` },
    );
    // (charge.refunded may have marked it refunded a moment ago: the refund's id is kept either way)
    await db
      .from("plan_payments")
      .update({ status: "refunded", refund_id: refund.id, refunded_pence: amount, refunded_at: new Date().toISOString() })
      .eq("id", row.id)
      .in("status", ["refund_due", "refunded"])
      .is("refund_id", null);
    if (tell) await notify({ type: "plan.refunded", paymentId: row.id });
    return true;
  } catch (err) {
    console.error(`plan-payments: refund of ${row.id} (${row.payment_intent_id}) failed, try ${row.refund_tries + 1}:`, err);
    await db.from("plan_payments").update({ refund_tries: row.refund_tries + 1 }).eq("id", row.id);
    return false;
  }
}

/** The plan was cancelled (by the host or the club): every payment still held is refunded in full. */
export async function refundPlan(planId: string, reason: "host-cancelled" | "club"): Promise<{ refunded: PaymentRow[]; totalPence: number }> {
  const { data, error } = await serviceDb()
    .from("plan_payments")
    .update({ status: "refund_due", refund_reason: reason, refund_due_at: new Date().toISOString() })
    .eq("plan_id", planId)
    .in("status", ["held", "refund_asked"])
    .select(PAYMENT_COLUMNS);
  if (error) throw error;
  const rows = (data ?? []) as PaymentRow[];
  for (const row of rows) await sendRefund(row.id, { tell: false });
  return { refunded: rows, totalPence: rows.reduce((sum, r) => sum + r.amount_pence, 0) };
}

/** What each member going gets back, for the cancel notifications. */
export async function refundsByPayer(planId: string): Promise<Record<string, number>> {
  const { data } = await serviceDb().from("plan_payments").select("payer_id, amount_pence, fee_pence").eq("plan_id", planId).in("status", ["refund_due", "refunded"]).in("refund_reason", ["host-cancelled", "club"]);
  const out: Record<string, number> = {};
  // Cancelled: the place and the booking fee.
  for (const r of (data ?? []) as { payer_id: string; amount_pence: number; fee_pence: number }[]) out[r.payer_id] = (out[r.payer_id] ?? 0) + r.amount_pence + (r.fee_pence ?? 0);
  return out;
}

/**
 * A refund made by hand in Stripe's dashboard (charge.refunded): a plan payment refunded in full is recorded as
 * refunded by the club. A part refund is left as it is (and logged), for the club to sort out.
 */
export async function recordPlanRefundFromCharge(charge: Stripe.Charge): Promise<{ paymentId: string | null; changed: boolean }> {
  const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!piId) return { paymentId: null, changed: false };
  const db = serviceDb();
  const { data: row } = await db.from("plan_payments").select("id, status, amount_pence, fee_pence").eq("payment_intent_id", piId).maybeSingle();
  if (!row) return { paymentId: null, changed: false };
  if (row.status === "refunded") return { paymentId: row.id, changed: false };
  if (charge.amount_refunded < row.amount_pence) {
    console.error(`plan-payments: a part refund of ${row.id} was made in Stripe (${charge.amount_refunded} of ${row.amount_pence}); left as it is`);
    return { paymentId: row.id, changed: false };
  }
  const at = new Date().toISOString();
  // Our own refund, its webhook a moment before we wrote it down: keep its reason. One made by hand: the club's.
  const { data } =
    row.status === "refund_due"
      ? await db.from("plan_payments").update({ status: "refunded", refunded_at: at, refunded_pence: charge.amount_refunded }).eq("id", row.id).eq("status", "refund_due").select("id")
      : await db
          .from("plan_payments")
          .update({ status: "refunded", refund_reason: "club", refunded_at: at, refund_due_at: at, refunded_pence: charge.amount_refunded })
          .eq("id", row.id)
          .in("status", ["held", "refund_asked"])
          .select("id");
  return { paymentId: row.id, changed: Boolean(data?.length) };
}

// ---------------------------------------------------------------------------- leaving and the host's answer

export type LeavePaidAnswer =
  | { ok: true; kind: "refunded" | "asked" | "left-no-refund" }
  | { ok: false; reason: "late" | "in_time" | "no_payment" | "not_in" | "started" | "host" | "not_found" };

/** A member leaves a paid plan (the 24-hour line is checked again at the tap). */
export async function leavePaidPlan(memberId: string, planId: string, mode: "refund" | "ask" | "no_refund"): Promise<LeavePaidAnswer> {
  const { data, error } = await serviceDb().rpc("leave_paid_plan", { p_member: memberId, p_plan: planId, p_mode: mode });
  if (error) throw error;
  const r = data as { status: string; payment_id?: string; was_full?: boolean; refund?: boolean };
  if (r.status === "asked") {
    await notify({ type: "plan.refund_asked", paymentId: r.payment_id! });
    return { ok: true, kind: "asked" };
  }
  if (r.status === "left") {
    await notify({ type: "plan.left", planId, memberId, wasFull: Boolean(r.was_full) });
    if (r.refund) await sendRefund(r.payment_id!);
    return { ok: true, kind: r.refund ? "refunded" : "left-no-refund" };
  }
  return { ok: false, reason: (["late", "in_time", "no_payment", "not_in", "started", "host"].includes(r.status) ? r.status : "not_found") as Exclude<LeavePaidAnswer, { ok: true }>["reason"] };
}

export type RefundAnswerResult = { ok: true; kind: "refunded" | "kept" } | { ok: false; reason: "not_asked" | "started" | "not_found" };

/** The host answers a refund request: refund (the place goes back to the plan) or keep it. */
export async function answerPlanRefund(hostId: string, paymentId: string, answer: "refund" | "keep"): Promise<RefundAnswerResult> {
  const { data, error } = await serviceDb().rpc("answer_plan_refund", { p_host: hostId, p_payment: paymentId, p_answer: answer });
  if (error) throw error;
  const r = data as { status: string; payer_id?: string; was_full?: boolean };
  if (r.status === "kept") {
    await notify({ type: "plan.refund_kept", paymentId });
    return { ok: true, kind: "kept" };
  }
  if (r.status === "refunded") {
    const { data: pay } = await serviceDb().from("plan_payments").select("plan_id").eq("id", paymentId).maybeSingle();
    if (pay) await notify({ type: "plan.left", planId: pay.plan_id, memberId: r.payer_id!, wasFull: Boolean(r.was_full), quietToHost: true });
    await sendRefund(paymentId);
    return { ok: true, kind: "refunded" };
  }
  return { ok: false, reason: (["not_asked", "started"].includes(r.status) ? r.status : "not_found") as "not_asked" | "started" | "not_found" };
}

// ---------------------------------------------------------------------------- the sweep (cron: the refunds job)

export type PlanMoneySummary = { settled: number; released: number; refundsRetried: number; refundsSent: number; paidOut: number; payoutsWaiting: number; errors: number };

/**
 * Every 15 minutes, with the refunds job: (1) PaymentIntents whose card was held but never settled (the app was
 * closed after the bank's check): settled now, or let go; (2) refunds Stripe did not confirm: tried again; (3) the
 * payouts: 24 hours after a plan starts, each payment still held goes to the host's Stripe account (an unanswered
 * refund request is kept). A host whose Get paid is not ready waits ("paused"), with the money safe.
 */
export async function runPlanMoney(now: Date = new Date()): Promise<PlanMoneySummary> {
  const db = serviceDb();
  const summary: PlanMoneySummary = { settled: 0, released: 0, refundsRetried: 0, refundsSent: 0, paidOut: 0, payoutsWaiting: 0, errors: 0 };

  // (1) holds with a PaymentIntent and no payment, a few minutes old (the member may still be paying)
  const { data: holds } = await db
    .from("plan_holds")
    .select("id, member_id, payment_intent_id, status, held_until, created_at")
    .not("payment_intent_id", "is", null)
    .in("status", ["open", "released"])
    .lt("created_at", new Date(now.getTime() - 5 * 60_000).toISOString())
    .gt("created_at", new Date(now.getTime() - 8 * DAY).toISOString())
    .limit(50);
  for (const hold of (holds ?? []) as { id: string; member_id: string; payment_intent_id: string; status: string; held_until: string }[]) {
    try {
      const pi = await stripe.paymentIntents.retrieve(hold.payment_intent_id);
      if (pi.status === "requires_capture" || pi.status === "succeeded") {
        const r = await settlePlanPayment(pi.id);
        if (r.kind === "paid") summary.settled += 1;
        else summary.released += 1;
      } else if (pi.status === "canceled") {
        await closeHold(hold.id);
        summary.released += 1;
      } else if (new Date(hold.held_until).getTime() < now.getTime() - 30 * 60_000) {
        // Never paid, long after the hold ran out: let it go.
        if (pi.status !== "processing") await cancelQuietly(pi.id);
        await closeHold(hold.id);
        summary.released += 1;
      }
    } catch (err) {
      summary.errors += 1;
      console.error(`plan-payments sweep: hold ${hold.id} failed:`, err);
    }
  }

  // (2) refunds decided but not confirmed
  const { data: due } = await db.from("plan_payments").select("id, refund_tries, refund_reason").eq("status", "refund_due").lt("refund_tries", MAX_TRIES).limit(50);
  for (const row of (due ?? []) as { id: string; refund_tries: number; refund_reason: string | null }[]) {
    summary.refundsRetried += 1;
    if (await sendRefund(row.id, { tell: row.refund_reason !== "host-cancelled" && row.refund_reason !== "club" })) summary.refundsSent += 1;
    else summary.errors += 1;
  }

  // (3) payouts
  const cutoff = new Date(now.getTime() - PAYOUT_AFTER_HOURS * 3_600_000).toISOString();
  const { data: ready } = await db
    .from("plan_payments")
    .select(`${PAYMENT_COLUMNS}, plans!inner(starts_at, status, title)`)
    .in("status", ["held", "refund_asked"])
    .lt("plans.starts_at", cutoff)
    .eq("plans.status", "scheduled")
    .lt("transfer_tries", MAX_TRIES)
    .limit(100);
  const rows = (ready ?? []) as unknown as (PaymentRow & { plans: { starts_at: string } })[];
  const hosts = new Map<string, HostAccountRow | null>();
  const sent = new Map<string, { hostId: string; planId: string; pence: number; startsAt: string }>();
  for (const row of rows) {
    if (!hosts.has(row.host_id)) {
      const acct = await hostAccount(row.host_id);
      hosts.set(row.host_id, acct && acct.status !== "ready" ? await refreshHostAccount(row.host_id) : acct);
    }
    const acct = hosts.get(row.host_id);
    if (!acct || acct.status !== "ready") {
      summary.payoutsWaiting += 1;
      continue;
    }
    try {
      let charge = row.charge_id;
      if (!charge) {
        const pi = await stripe.paymentIntents.retrieve(row.payment_intent_id);
        charge = typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge?.id ?? null);
      }
      const transfer = await stripe.transfers.create(
        {
          amount: row.amount_pence,
          currency: "gbp",
          destination: acct.stripe_account_id,
          transfer_group: `plan-${row.plan_id}`,
          ...(charge ? { source_transaction: charge } : {}),
          metadata: { payment_id: row.id, plan_id: row.plan_id },
        },
        { idempotencyKey: `plan-transfer-${row.id}` },
      );
      await db
        .from("plan_payments")
        .update({ status: "paid_out", transfer_id: transfer.id, transferred_at: now.toISOString(), payout_on: payoutDayFor(row.plans.starts_at).slice(0, 10), refund_asked_at: null, charge_id: charge })
        .eq("id", row.id)
        .in("status", ["held", "refund_asked"]);
      summary.paidOut += 1;
      const key = `${row.host_id}:${row.plan_id}`;
      const so_far = sent.get(key);
      sent.set(key, { hostId: row.host_id, planId: row.plan_id, pence: (so_far?.pence ?? 0) + row.amount_pence, startsAt: row.plans.starts_at });
    } catch (err) {
      summary.errors += 1;
      console.error(`plan-payments sweep: transfer of ${row.id} failed, try ${row.transfer_tries + 1}:`, err);
      await db.from("plan_payments").update({ transfer_tries: row.transfer_tries + 1 }).eq("id", row.id);
    }
  }
  for (const s of sent.values()) await notify({ type: "plan.payout", planId: s.planId, hostId: s.hostId, pence: s.pence });
  return summary;
}

// ---------------------------------------------------------------------------- what the pages show

/** HostPaidPlan.status for one plan's payments. */
function planMoneyStatus(rows: PaymentRow[], startsAt: string, ready: boolean, now: Date): HostPaidPlan["status"] {
  const live = rows.filter((r) => r.status !== "refunded" && r.status !== "refund_due");
  if (!live.length) return "refunded";
  if (live.some((r) => r.status === "refund_asked") && new Date(startsAt).getTime() > now.getTime()) return "asked";
  if (live.every((r) => r.status === "paid_out")) {
    const day = live.map((r) => r.payout_on ?? "").sort().pop() ?? "";
    return day && new Date(`${day}T23:59:59Z`).getTime() >= now.getTime() ? "on-its-way" : "paid-out";
  }
  const dueAt = new Date(startsAt).getTime() + PAYOUT_AFTER_HOURS * 3_600_000;
  if (!ready && dueAt <= now.getTime()) return "paused";
  return "held";
}

/** You > Payments: the host's paid plans, newest first. */
export async function hostPayments(memberId: string, now: Date = new Date(), { backFromStripe = false }: { backFromStripe?: boolean } = {}): Promise<HostPayments> {
  const getPaid = await getPaidFor(memberId, { fresh: backFromStripe ? "now" : true });
  const { data, error } = await serviceDb().from("plan_payments").select(PAYMENT_COLUMNS).eq("host_id", memberId).order("paid_at", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as PaymentRow[];
  const planIds = [...new Set(rows.map((r) => r.plan_id))];
  const { data: plans } = planIds.length
    ? await serviceDb().from("plans").select("id, title, starts_at").in("id", planIds)
    : { data: [] as { id: string; title: string; starts_at: string }[] };
  const refs = await peopleRefs(rows.map((r) => r.payer_id));
  const ready = getPaid.status === "ready";
  let held = 0;
  let onWay = 0;
  let out = 0;
  const list: HostPaidPlan[] = [];
  for (const plan of (plans ?? []) as { id: string; title: string; starts_at: string }[]) {
    const mine = rows.filter((r) => r.plan_id === plan.id);
    const status = planMoneyStatus(mine, plan.starts_at, ready, now);
    const live = mine.filter((r) => r.status !== "refunded" && r.status !== "refund_due");
    const counted = status === "refunded" ? mine : live;
    const amount = counted.reduce((sum, r) => sum + r.amount_pence, 0);
    for (const r of live) {
      if (r.status === "paid_out") {
        if (status === "on-its-way") onWay += r.amount_pence;
        else out += r.amount_pence;
      } else held += r.amount_pence;
    }
    const paidOutDay = live.map((r) => r.payout_on).filter(Boolean).sort().pop() ?? null;
    const refundedNames = mine.filter((r) => r.status === "refunded" || r.status === "refund_due").map((r) => ref(refs, r.payer_id).firstName);
    list.push({
      inviteId: plan.id,
      title: plan.title,
      startsAt: new Date(plan.starts_at).toISOString(),
      payers: counted.map((r) => ref(refs, r.payer_id).firstName),
      amountPence: amount,
      status,
      payoutOn: status === "held" || status === "on-its-way" || status === "asked" ? (paidOutDay ? new Date(`${paidOutDay}T09:00:00Z`).toISOString() : payoutDayFor(plan.starts_at)) : null,
      paidOutOn: status === "paid-out" && paidOutDay ? new Date(`${paidOutDay}T09:00:00Z`).toISOString() : null,
      payersNote: status === "refunded" ? `${refundedNames.join(", ")} refunded in full` : null,
    });
  }
  list.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return { getPaid, heldPence: held, onItsWayPence: onWay, paidOutPence: out, plans: list };
}

/** You > Payments > one plan (the host's), or null. */
export async function hostPlanPayments(memberId: string, planId: string, now: Date = new Date()): Promise<HostPlanPayments | null> {
  const { data: plan } = await serviceDb().from("plans").select("id, host_id, title, starts_at, place, places, price_pence, face_value_confirmed").eq("id", planId).maybeSingle();
  if (!plan || plan.host_id !== memberId) return null;
  const rows = await paymentsForPlans([planId]);
  const refs = await peopleRefs(rows.map((r) => r.payer_id));
  const held = rows.some((r) => r.status === "held" || r.status === "refund_asked");
  const paidOut = rows.find((r) => r.status === "paid_out" && r.payout_on);
  return {
    invite: {
      id: plan.id,
      title: plan.title,
      startsAt: new Date(plan.starts_at).toISOString(),
      where: plan.place,
      places: plan.places,
      cost: plan.price_pence === null ? null : { pricePence: plan.price_pence, faceValueConfirmed: plan.face_value_confirmed, bookingFeePence: BOOKING_FEE_PENCE },
    },
    payments: rows.map((r) => toInvitePayment(r, ref(refs, r.payer_id))),
    payoutOn: held ? payoutDayFor(plan.starts_at) : paidOut ? new Date(`${paidOut.payout_on}T09:00:00Z`).toISOString() : null,
    now: now.toISOString(),
  };
}

/** The receipt for this member's latest payment on a plan, or null. */
export async function receiptFor(member: { id: string; email: string; full_name: string | null }, planId: string, now: Date = new Date()): Promise<Receipt | null> {
  const { data } = await serviceDb().from("plan_payments").select(PAYMENT_COLUMNS).eq("plan_id", planId).eq("payer_id", member.id).order("paid_at", { ascending: false }).limit(1);
  const row = ((data ?? []) as PaymentRow[])[0];
  if (!row) return null;
  const { data: plan } = await serviceDb().from("plans").select("id, host_id, title, starts_at, place, status").eq("id", planId).maybeSingle();
  if (!plan) return null;
  const refs = await peopleRefs([member.id, plan.host_id]);
  const status = plan.status === "cancelled" ? "cancelled" : new Date(plan.starts_at).getTime() <= now.getTime() ? "finished" : "scheduled";
  return {
    payment: toInvitePayment(row, ref(refs, member.id)),
    invite: { id: plan.id, title: plan.title, startsAt: new Date(plan.starts_at).toISOString(), where: plan.place, host: ref(refs, plan.host_id), status },
    email: member.email,
    paidBy: member.full_name?.trim() || ref(refs, member.id).firstName,
  };
}

/** The Payments row on You: Get paid's status, and the member's latest payment for a place still to come. */
export async function paymentsSummary(memberId: string, now: Date = new Date()): Promise<{ lines: string[]; warn?: boolean }> {
  const status = (await getPaidStatuses([memberId])).get(memberId) ?? "not-set-up";
  const words: Record<GetPaidStatus, string> = { "not-set-up": "not set up", "needs-info": "needs more info", "in-review": "in review", ready: "ready" };
  const lines = [`Get paid: ${words[status]}`];
  const { data } = await serviceDb()
    .from("plan_payments")
    .select("amount_pence, fee_pence, status, plans!inner(title, starts_at)")
    .eq("payer_id", memberId)
    .in("status", ["held", "refund_asked"])
    .gt("plans.starts_at", now.toISOString())
    .order("paid_at", { ascending: false })
    .limit(1);
  const latest = ((data ?? []) as unknown as { amount_pence: number; fee_pence: number; plans: { title: string } }[])[0];
  if (latest) lines.unshift(`Paid ${gbpWords(latest.amount_pence + (latest.fee_pence ?? 0))} for ${latest.plans.title}`);
  return { lines, warn: status === "needs-info" };
}

const gbpWords = (pence: number) => (pence % 100 ? `£${(pence / 100).toFixed(2)}` : `£${pence / 100}`);

// ---------------------------------------------------------------------------- Admin

export type AdminPaymentRow = {
  id: string;
  receipt: string;
  planId: string;
  planTitle: string;
  startsAt: string;
  payerId: string;
  payerName: string;
  hostId: string;
  hostName: string;
  amountPence: number;
  /** Club Yuppie's booking fee paid with it. */
  feePence: number;
  /** What went back to the card. */
  refundedPence: number | null;
  method: string;
  status: PaymentRow["status"];
  paidAt: string;
  refundReason: PaymentRow["refund_reason"];
  refundedAt: string | null;
  payoutOn: string | null;
  tries: number;
};

/** Admin > Payments: every plan payment, newest first, with names. */
export async function adminPayments(limit = 200): Promise<AdminPaymentRow[]> {
  const db = serviceDb();
  const { data, error } = await db.from("plan_payments").select(PAYMENT_COLUMNS).order("paid_at", { ascending: false }).limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as PaymentRow[];
  const planIds = [...new Set(rows.map((r) => r.plan_id))];
  const people = [...new Set(rows.flatMap((r) => [r.payer_id, r.host_id]))];
  const [{ data: plans }, { data: members }] = await Promise.all([
    planIds.length ? db.from("plans").select("id, title, starts_at").in("id", planIds) : Promise.resolve({ data: [] }),
    people.length ? db.from("members").select("id, full_name").in("id", people) : Promise.resolve({ data: [] }),
  ]);
  const planBy = new Map(((plans ?? []) as { id: string; title: string; starts_at: string }[]).map((p) => [p.id, p]));
  const nameBy = new Map(((members ?? []) as { id: string; full_name: string | null }[]).map((m) => [m.id, m.full_name?.trim() || "Member"]));
  return rows.map((r) => ({
    id: r.id,
    receipt: String(r.receipt_no).padStart(4, "0"),
    planId: r.plan_id,
    planTitle: planBy.get(r.plan_id)?.title ?? "Plan",
    startsAt: planBy.get(r.plan_id)?.starts_at ?? r.paid_at,
    payerId: r.payer_id,
    payerName: nameBy.get(r.payer_id) ?? "Member",
    hostId: r.host_id,
    hostName: nameBy.get(r.host_id) ?? "Member",
    amountPence: r.amount_pence,
    feePence: r.fee_pence ?? 0,
    refundedPence: r.refunded_pence ?? (r.status === "refund_due" ? refundPenceFor(r) : null),
    method: r.method ?? "Card",
    status: r.status,
    paidAt: r.paid_at,
    refundReason: r.refund_reason,
    refundedAt: r.refunded_at ?? r.refund_due_at,
    payoutOn: r.payout_on,
    tries: Math.max(r.refund_tries, r.transfer_tries),
  }));
}

/**
 * Admin refunds one payment in full (the club's call: a no-show, a complaint). Only while the money is still with
 * Club Yuppie; once it has gone to the host it is refunded in Stripe (reverse the transfer first). The member leaves
 * the plan if it is still to come.
 */
export async function adminRefundPayment(paymentId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = serviceDb();
  const { data: row } = await db.from("plan_payments").select(PAYMENT_COLUMNS).eq("id", paymentId).maybeSingle<PaymentRow>();
  if (!row) return { ok: false, error: "That payment couldn’t be found." };
  if (row.status === "paid_out") return { ok: false, error: "This has gone to the host already. Reverse the transfer in Stripe first, then refund it there." };
  if (row.status === "refunded") return { ok: false, error: "This was refunded already." };
  if (row.status !== "refund_due") {
    const { data: moved } = await db
      .from("plan_payments")
      .update({ status: "refund_due", refund_reason: "club", refund_due_at: new Date().toISOString() })
      .eq("id", paymentId)
      .in("status", ["held", "refund_asked"])
      .select("id");
    if (!moved?.length) return { ok: false, error: "That payment changed just now. Look again." };
    const { data: left } = await db.rpc("leave_plan", { p_member: row.payer_id, p_plan: row.plan_id });
    const l = left as { status: string; was_full?: boolean } | null;
    if (l?.status === "left") await notify({ type: "plan.left", planId: row.plan_id, memberId: row.payer_id, wasFull: Boolean(l.was_full) });
  }
  const sent = await sendRefund(paymentId);
  return sent ? { ok: true } : { ok: false, error: "Stripe didn’t take the refund. It will be tried again every 15 minutes; look again later." };
}
