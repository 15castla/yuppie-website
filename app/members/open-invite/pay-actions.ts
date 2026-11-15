"use server";

// Paid Open Invite's server actions (15 Nov 2026): Pay and join, leaving a paid plan, the host's answer to a refund
// request, and "Email me a copy". The money rules are lib/server/plan-payments.ts's; each action checks the member
// (asMember: SESSION_ENDED when the session has gone) and Open Invite's door, and answers the plan as it is now.

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";

import type { HostPlanPayments, OpenInvite } from "@/lib/members/invite/types";
import { personRef } from "@/lib/server/people";
import {
  answerPlanRefund,
  hostPlanPayments,
  leavePaidPlan,
  releasePlanHold,
  settlePlanPayment,
  startPlanPayment,
} from "@/lib/server/plan-payments";
import { canSeePlan, inviteFor, planById } from "@/lib/server/plans";
import { notify } from "@/lib/server/notify";
import type { SessionEnded } from "@/components/members/session-ended";
import { asMember, type Failed } from "../action-kit";
import { paidPlansShown, requireOpenInvite } from "./guard";

const fresh = () => revalidatePath("/members", "layout");
const NOT_FOUND = "That plan couldn’t be found.";

async function door(): Promise<void> {
  await requireOpenInvite();
  if (!paidPlansShown()) notFound();
}

export type StartPayAnswer =
  | { ok: true; clientSecret: string; amountPence: number; heldUntil: string }
  | { ok: false; kind: "full" | "already-in" | "refused"; error: string; invite: OpenInvite | null };

/** Pay and join, step 1: hold a place (10 minutes) and open payment for it. Nothing is taken yet. */
export async function startPlanPaymentAction(planId: string): Promise<StartPayAnswer | SessionEnded | Failed> {
  await door();
  return asMember("startPlanPayment", async (member, viewer) => {
    const row = await planById(planId);
    if (!row || !(await canSeePlan(viewer.id, row))) return { ok: false, kind: "refused", error: NOT_FOUND, invite: null };
    const host = await personRef(row.host_id);
    const r = await startPlanPayment(
      { id: member.id, email: member.email, stripe_customer_id: member.stripe_customer_id },
      { id: row.id, host_id: row.host_id, title: row.title, price_pence: row.price_pence },
      host.firstName,
    );
    if (r.kind === "ready") return { ok: true, clientSecret: r.clientSecret, amountPence: r.amountPence, heldUntil: r.heldUntil };
    const invite = await inviteFor(viewer, planId);
    if (r.kind === "full") return { ok: false, kind: "full", error: "The last place has gone.", invite };
    if (r.kind === "already-in") return { ok: false, kind: "already-in", error: "You’re in already.", invite };
    return { ok: false, kind: "refused", error: r.error, invite };
  });
}

export type ConfirmPayAnswer =
  | { ok: true; kind: "paid"; invite: OpenInvite; pence: number }
  | { ok: false; kind: "full" | "price-changed" | "declined" | "pending" | "refused"; newPricePence?: number | null; invite: OpenInvite | null; error: string };

const CONFIRM_WORDS = {
  full: "That was the last place. Nothing was taken.",
  "price-changed": "The price changed. Nothing was taken.",
  declined: "Your card was declined. Nothing was taken.",
  pending: "Your payment is still being checked.",
  refused: "You couldn’t join this plan. Nothing was taken.",
} as const;

/** Pay and join, step 2: the card is held; take the place, then the money (or let the card go). */
export async function confirmPlanPaymentAction(paymentIntentId: string, planId: string): Promise<ConfirmPayAnswer | SessionEnded | Failed> {
  await door();
  const result = await asMember("confirmPlanPayment", async (_member, viewer) => {
    if (typeof paymentIntentId !== "string" || !paymentIntentId.startsWith("pi_")) return { ok: false as const, kind: "refused" as const, invite: null, error: CONFIRM_WORDS.refused };
    const r = await settlePlanPayment(paymentIntentId, viewer.id);
    const invite = await inviteFor(viewer, planId);
    if (r.kind === "paid") return { ok: true as const, kind: "paid" as const, invite: invite!, pence: invite?.you.payment?.amountPence ?? invite?.cost?.pricePence ?? 0 };
    if (r.kind === "not-ours") return { ok: false as const, kind: "refused" as const, invite, error: CONFIRM_WORDS.refused };
    return {
      ok: false as const,
      kind: r.kind,
      newPricePence: r.kind === "price-changed" ? r.newPricePence : undefined,
      invite,
      error: CONFIRM_WORDS[r.kind],
    };
  });
  if ("ok" in result && result.ok) fresh();
  return result;
}

/** The pay sheet closed without paying: the place goes back to the plan now. */
export async function releasePlanHoldAction(planId: string): Promise<{ ok: true } | SessionEnded | Failed> {
  await door();
  return asMember("releasePlanHold", async (_m, viewer) => {
    await releasePlanHold(viewer.id, planId);
    return { ok: true as const };
  });
}

export type LeavePaidActionAnswer =
  | { ok: true; kind: "refunded" | "asked" | "left-no-refund"; invite: OpenInvite | null }
  | { ok: false; error: string; timing?: "full" | "late"; invite: OpenInvite | null };

const LEAVE_WORDS: Record<string, string> = {
  late: "It’s now less than 24 hours before, so it’s too late for an automatic refund.",
  in_time: "It’s more than 24 hours before, so you can leave with a full refund.",
  no_payment: "We couldn’t find your payment for this plan.",
  not_in: "You’re not in this plan.",
  started: "This plan has started, so you can’t leave now.",
  host: "It’s your plan: cancel it instead.",
  not_found: NOT_FOUND,
};

/** Leave a paid plan: refund (more than 24 hours before), ask the host (later), or leave without a refund. */
export async function leavePaidPlanAction(planId: string, mode: "refund" | "ask" | "no_refund"): Promise<LeavePaidActionAnswer | SessionEnded | Failed> {
  await door();
  const result = await asMember("leavePaidPlan", async (_m, viewer) => {
    if (mode !== "refund" && mode !== "ask" && mode !== "no_refund") return { ok: false as const, error: NOT_FOUND, invite: null };
    const r = await leavePaidPlan(viewer.id, planId, mode);
    const invite = await inviteFor(viewer, planId);
    if (r.ok) return { ok: true as const, kind: r.kind, invite };
    const timing = r.reason === "late" ? ("late" as const) : r.reason === "in_time" ? ("full" as const) : undefined;
    return { ok: false as const, error: LEAVE_WORDS[r.reason] ?? NOT_FOUND, timing, invite };
  });
  if ("ok" in result && result.ok) fresh();
  return result;
}

export type RefundAnswerAction = { ok: true; plan: HostPlanPayments } | { ok: false; error: string; plan: HostPlanPayments | null };

/** The host answers a refund request on their plan: refund it (the place goes back) or keep it. */
export async function answerRefundAction(planId: string, paymentId: string, answer: "refund" | "keep"): Promise<RefundAnswerAction | SessionEnded | Failed> {
  await door();
  const result = await asMember("answerRefund", async (_m, viewer) => {
    if (answer !== "refund" && answer !== "keep") return { ok: false as const, error: NOT_FOUND, plan: null };
    const r = await answerPlanRefund(viewer.id, paymentId, answer);
    const plan = await hostPlanPayments(viewer.id, planId);
    if (r.ok) return { ok: true as const, plan: plan! };
    const words = { not_asked: "That was answered already.", started: "The plan has started, so you keep it.", not_found: "That payment couldn’t be found." } as const;
    return { ok: false as const, error: words[r.reason], plan };
  });
  if ("ok" in result && result.ok) fresh();
  return result;
}

/** "Email me a copy" on a receipt: the receipt email again, to the member's own address. */
export async function emailReceiptAction(planId: string): Promise<{ ok: true } | SessionEnded | Failed> {
  await door();
  return asMember("emailReceipt", async (member) => {
    const { serviceDb } = await import("@/lib/server/db");
    const { data } = await serviceDb().from("plan_payments").select("id").eq("plan_id", planId).eq("payer_id", member.id).order("paid_at", { ascending: false }).limit(1);
    const payment = (data ?? [])[0] as { id: string } | undefined;
    if (!payment) return { ok: false as const, error: "We couldn’t find that receipt." };
    await notify({ type: "plan.receipt", paymentId: payment.id, copy: true });
    return { ok: true as const };
  });
}
