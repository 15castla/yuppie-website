"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "./require-admin";
import { createAdminSupabaseClient } from "./admin-client";
import { audit } from "@/lib/server/audit";
import { adjustCreditByAdmin } from "@/lib/server/credit";

// A member's page, Nominations and credit (12 Nov 2026): add or take off credit by hand, with a reason the member
// sees in their history; and how many nominations they may make (5 unless the club gives more). Audited.

export type CreditActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function adminAdjustCredit(memberId: string, pence: number, reason: string): Promise<CreditActionResult> {
  const admin = await requireAdmin();
  if (!admin.email) return { ok: false, error: "Your admin account has no email address." };
  if (!memberId) return { ok: false, error: "That member couldn’t be found." };
  const result = await adjustCreditByAdmin({ memberId, amountPence: pence, reason, adminEmail: admin.email });
  await audit(admin.id, "member.credit", { type: "member", id: memberId }, result.ok ? { pence, reason } : { pence, reason, error: result.error });
  if (!result.ok) return result;
  revalidatePath(`/admin/members/${memberId}`);
  const amount = `£${(Math.abs(pence) / 100).toFixed(2).replace(/\.00$/, "")}`;
  return { ok: true, message: pence > 0 ? `Added ${amount}.` : `Took off ${amount}.` };
}

export async function adminSetNominationsAllowed(memberId: string, allowed: number): Promise<CreditActionResult> {
  const admin = await requireAdmin();
  const n = Math.trunc(allowed);
  if (!memberId) return { ok: false, error: "That member couldn’t be found." };
  if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, error: "Enter a number from 0 to 100." };
  const { error } = await createAdminSupabaseClient().from("members").update({ nominations_allowed: n }).eq("id", memberId);
  await audit(admin.id, "member.nominations_allowed", { type: "member", id: memberId }, error ? { allowed: n, error: error.message } : { allowed: n });
  if (error) return { ok: false, error: "Saving that failed. Try again." };
  revalidatePath(`/admin/members/${memberId}`);
  return { ok: true, message: `Saved. They can make ${n} nomination${n === 1 ? "" : "s"}.` };
}
