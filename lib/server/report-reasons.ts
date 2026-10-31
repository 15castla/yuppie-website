// Report reasons: the ids the database stores (reports_reason_check) and the words the member picked, which the
// admin email and the queue show. Message, member and photo reasons are lib/members/messages/report-reasons.ts;
// the plan reasons are the Open Invite sheet's six (components/members/invite/moments.tsx REPORT_REASONS, in
// the same order), given ids here. Pure: no I/O.

import { REASONS } from "@/lib/members/messages/report-reasons";

export type ReportKind = "message" | "member" | "photo" | "plan";

export const PLAN_REASONS: readonly { id: string; label: string }[] = [
  { id: "payment_outside", label: "Payment outside Club Yuppie" },
  { id: "price_above_cost", label: "Price above what it cost" },
  { id: "unkind", label: "Unkind or rude" },
  { id: "unsafe", label: "Feels unsafe" },
  { id: "not_real", label: "Not a real plan" },
  { id: "other", label: "Something else" },
];

export function reasonsFor(kind: ReportKind): readonly { id: string; label: string }[] {
  if (kind === "plan") return PLAN_REASONS;
  return REASONS[kind];
}

/** The stored id for what the sheet sent: an id, or the label the Open Invite sheet sends. Null when it is not a reason for this kind. */
export function reasonId(kind: ReportKind, given: unknown): string | null {
  if (typeof given !== "string") return null;
  const list = reasonsFor(kind);
  const hit = list.find((r) => r.id === given) ?? list.find((r) => r.label === given.trim());
  return hit ? hit.id : null;
}

export function reasonLabel(kind: ReportKind, id: string): string {
  return reasonsFor(kind).find((r) => r.id === id)?.label ?? id;
}
