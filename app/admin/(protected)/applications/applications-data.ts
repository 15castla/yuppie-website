import "server-only";

// Applications for the admin list and card, read with the service role after requireAdmin().

import { cache } from "react";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { requireAdmin } from "@/app/admin/require-admin";

import type { AppTab } from "./app-tabs";

export type { AppTab };

/** A payment problem on a waiting application, from the text approve() saved (r2b 16: plain words, raw behind Details). */
export type PaymentProblem = "card" | "nocard" | "account" | "unsaved";

export type AppListRow = {
  id: string;
  name: string;
  email: string;
  tab: AppTab;
  employer: string | null;
  role: string | null;
  createdAt: string;
  reviewedAt: string | null;
  problem: PaymentProblem | null;
};

export function paymentProblem(app: { payment_error: string | null; stripe_subscription_id: string | null }): PaymentProblem | null {
  const raw = app.payment_error?.trim();
  if (!raw) return null;
  if (/failed to save that/i.test(raw)) return "unsaved";
  if (/no saved card/i.test(raw)) return "nocard";
  if (app.stripe_subscription_id || /^Payment succeeded/i.test(raw)) return "account";
  return "card";
}

export function tabOf(status: string): AppTab {
  return status === "approved" ? "approved" : status === "rejected" ? "declined" : "waiting";
}

export const listApplications = cache(async function listApplications(): Promise<AppListRow[]> {
  await requireAdmin();
  const { data, error } = await createAdminSupabaseClient()
    .from("applications")
    .select("id, full_name, email, status, employer, role_title, created_at, reviewed_at, payment_error, stripe_subscription_id")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(`applications list: ${error.message}`);
  const rows: AppListRow[] = (data ?? []).map((a) => ({
    id: a.id as string,
    name: (a.full_name as string | null)?.trim() || (a.email as string),
    email: a.email as string,
    tab: tabOf(a.status as string),
    employer: a.employer as string | null,
    role: a.role_title as string | null,
    createdAt: a.created_at as string,
    reviewedAt: a.reviewed_at as string | null,
    problem: tabOf(a.status as string) === "waiting" ? paymentProblem(a as { payment_error: string | null; stripe_subscription_id: string | null }) : null,
  }));
  // Waiting: oldest first. Approved and Declined: the latest decision first.
  const byDecision = (x: AppListRow, y: AppListRow) => (y.reviewedAt ?? y.createdAt).localeCompare(x.reviewedAt ?? x.createdAt);
  return [
    ...rows.filter((r) => r.tab === "waiting"),
    ...rows.filter((r) => r.tab === "approved").sort(byDecision),
    ...rows.filter((r) => r.tab === "declined").sort(byDecision),
  ];
});
