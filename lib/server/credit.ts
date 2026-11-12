import "server-only";

// Club Yuppie credit (Albert, 11 to 12 Nov 2026), server only. Credit is not money: it is added for a nomination the
// committee approves (lib/server/nominations.ts) or by the club in Admin, and spent on Club events; it is never paid
// out. Every change is a row in credit_ledger (+ added, - spent), so a balance is the sum of a member's rows and the
// history is the rows themselves. A row with a dedupe key is written once, however often it is asked for.

import type { CreditRow } from "@/lib/members/nominate/types";
import { serviceDb } from "./db";
import { dayMonth, firstName, pounds } from "./format";

export type CreditKind = "nomination" | "admin" | "booking" | "refund";

type LedgerRow = {
  id: string;
  amount_pence: number;
  kind: CreditKind;
  note: string | null;
  created_at: string;
  application: { full_name: string | null } | { full_name: string | null }[] | null;
};

/** A member's credit now, in pence (never below 0 in practice: spending checks it first). */
export async function creditBalance(memberId: string): Promise<number> {
  const { data, error } = await serviceDb().from("credit_ledger").select("amount_pence").eq("member_id", memberId);
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + (row.amount_pence as number), 0);
}

/** What a history row says: "Ann's nomination", "From Club Yuppie", or the club's own note. */
function labelFor(row: LedgerRow): string {
  const app = Array.isArray(row.application) ? row.application[0] : row.application;
  if (row.kind === "nomination") {
    const name = firstName(app?.full_name);
    return name ? `${name}’s nomination` : "A nomination";
  }
  if (row.note?.trim()) return row.note.trim();
  if (row.kind === "admin") return row.amount_pence > 0 ? "From Club Yuppie" : "Taken off by Club Yuppie";
  return row.kind === "refund" ? "Back from a booking" : "A booking";
}

/** A member's credit history, newest first (the Nominate page, and Admin). */
export async function creditHistory(memberId: string, limit = 50): Promise<CreditRow[]> {
  const { data, error } = await serviceDb()
    .from("credit_ledger")
    .select("id, amount_pence, kind, note, created_at, application:applications(full_name)")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as LedgerRow[]).map((row) => ({ id: row.id, amountPence: row.amount_pence, label: labelFor(row), at: dayMonth(row.created_at) }));
}

export type AddCreditResult = { ok: true; added: boolean } | { ok: false; error: string };

/** One ledger row. A dedupe key already written answers added: false (nothing changes). */
export async function addCredit(input: {
  memberId: string;
  amountPence: number;
  kind: CreditKind;
  dedupeKey?: string | null;
  applicationId?: string | null;
  bookingId?: string | null;
  note?: string | null;
  createdBy?: string | null;
}): Promise<AddCreditResult> {
  const { error } = await serviceDb()
    .from("credit_ledger")
    .insert({
      member_id: input.memberId,
      amount_pence: input.amountPence,
      kind: input.kind,
      dedupe_key: input.dedupeKey ?? null,
      application_id: input.applicationId ?? null,
      booking_id: input.bookingId ?? null,
      note: input.note?.trim() || null,
      created_by: input.createdBy ?? null,
    });
  if (!error) return { ok: true, added: true };
  if (error.code === "23505") return { ok: true, added: false };
  console.error("credit: adding a row failed:", error);
  return { ok: false, error: "Saving the credit failed." };
}

export type AdjustCreditResult = { ok: true; balancePence: number } | { ok: false; error: string };

/**
 * The club adds or takes off credit by hand (Admin, a member's page), with a reason the member sees in their
 * history. Taking off more than they have is refused.
 */
export async function adjustCreditByAdmin(input: { memberId: string; amountPence: number; reason: string; adminEmail: string }): Promise<AdjustCreditResult> {
  const pence = Math.trunc(input.amountPence);
  const reason = input.reason.trim();
  if (!Number.isFinite(pence) || pence === 0) return { ok: false, error: "Enter an amount other than £0." };
  if (Math.abs(pence) > 100000) return { ok: false, error: "Keep it to £1,000 or less at a time." };
  if (!reason) return { ok: false, error: "Add a reason. The member sees it in their credit history." };
  if (reason.length > 200) return { ok: false, error: "Keep the reason to 200 characters." };
  const balance = await creditBalance(input.memberId);
  if (balance + pence < 0) return { ok: false, error: `They only have ${pounds(balance)} of credit.` };
  const saved = await addCredit({ memberId: input.memberId, amountPence: pence, kind: "admin", note: reason, createdBy: input.adminEmail });
  if (!saved.ok) return saved;
  return { ok: true, balancePence: balance + pence };
}
