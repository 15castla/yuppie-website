"use server";

// The host's money from paid plans (16 Nov 2026, Albert: "the vinted way"): once a plan is over its money is the
// host's, and You > Payments offers two buttons: Add to my credit (Club Yuppie credit at once, no checks, never
// turned back into cash) and Withdraw to my bank (Get paid first: Stripe checks who they are, then it goes to their
// bank). The money rules are lib/server/plan-payments.ts's.

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";

import type { GetPaidStatus, HostPayments } from "@/lib/members/invite/types";
import { creditHostMoney, hostPayments, withdrawHostMoney } from "@/lib/server/plan-payments";
import { paidPlansShown, requireOpenInvite } from "@/app/members/open-invite/guard";
import type { SessionEnded } from "@/components/members/session-ended";
import { asMember, type Failed } from "../../action-kit";

const fresh = () => revalidatePath("/members", "layout");

async function door(): Promise<void> {
  await requireOpenInvite();
  if (!paidPlansShown()) notFound();
}

export type MoneyAnswer =
  | { ok: true; pence: number; payments: HostPayments; arriveBy?: string; failedPence?: number }
  | { ok: false; kind: "get-paid"; status: GetPaidStatus; error: string; payments: HostPayments }
  | { ok: false; kind: "nothing" | "failed"; error: string; payments: HostPayments };

/** Add the host's ready money to their Club Yuppie credit. */
export async function addMoneyToCreditAction(): Promise<MoneyAnswer | SessionEnded | Failed> {
  await door();
  const result = await asMember("addMoneyToCredit", async (_m, viewer) => {
    const r = await creditHostMoney(viewer.id);
    const payments = await hostPayments(viewer.id);
    if (!r.pence) return { ok: false as const, kind: "nothing" as const, error: "There’s nothing waiting to add. Look again.", payments };
    return { ok: true as const, pence: r.pence, payments };
  });
  if ("ok" in result && result.ok) fresh();
  return result;
}

/** Withdraw the host's ready money to their bank (Get paid must be ready). */
export async function withdrawMoneyAction(): Promise<MoneyAnswer | SessionEnded | Failed> {
  await door();
  const result = await asMember("withdrawMoney", async (_m, viewer) => {
    const r = await withdrawHostMoney(viewer.id);
    const payments = await hostPayments(viewer.id);
    if (r.ok) return { ok: true as const, pence: r.pence, arriveBy: r.arriveBy, failedPence: r.failedPence, payments };
    if (r.kind === "get-paid") {
      return { ok: false as const, kind: "get-paid" as const, status: r.status, error: "Set up Get paid first, so Stripe can check it’s you.", payments };
    }
    if (r.kind === "nothing") return { ok: false as const, kind: "nothing" as const, error: "There’s nothing waiting to withdraw. Look again.", payments };
    return { ok: false as const, kind: "failed" as const, error: "Stripe didn’t take it just now. Nothing was lost. Try again in a moment.", payments };
  });
  if ("ok" in result && result.ok) fresh();
  return result;
}
