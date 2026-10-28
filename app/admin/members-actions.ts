"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "./require-admin";
import { createAdminSupabaseClient } from "./admin-client";
import { audit } from "@/lib/server/audit";
import { deleteAccount } from "@/lib/server/membership-actions";

// Delete member (r2b 15, Danger zone), QA2-02 / QA3-06: the same path as the member's own Delete my account
// (lib/server/membership-actions.ts deleteAccount, brief 5.6), never a hard delete. It cancels the Stripe
// subscription now, cancels and refunds every future booking (account_deleted), removes the photo, emails the
// member, anonymises the members row (kept, so bookings and payment records survive), frees the email for a
// new application and bans the auth user. Safe to press again: what is done is skipped. Audited.

export type DeleteMemberResult = { success: true; refunded: number } | { success: false; error: string };

const ERRORS: Record<string, string> = {
  not_found: "That member couldn’t be found.",
  stripe: "Stripe didn’t cancel the subscription, so nothing was deleted. Try again in a moment.",
};

export async function deleteMember(memberId: string): Promise<DeleteMemberResult> {
  const admin = await requireAdmin();
  if (!memberId) return { success: false, error: ERRORS.not_found };

  const { data: before } = await createAdminSupabaseClient()
    .from("members")
    .select("id, stripe_subscription_id, deleted_at")
    .eq("id", memberId)
    .maybeSingle();
  if (!before) return { success: false, error: ERRORS.not_found };

  // The club deleted it: the account-deleted email says so, not "you asked us to".
  const result = await deleteAccount(memberId, { by: "club" });
  await audit(admin.id, "member.delete", { type: "member", id: memberId }, {
    subscription: before.stripe_subscription_id ?? null,
    already_deleted: Boolean(before.deleted_at),
    ...(result.ok ? { refunded: result.refunded } : { code: result.code, error: result.error }),
  });
  if (!result.ok) {
    return {
      success: false,
      error: ERRORS[result.code] ?? "The member wasn’t fully deleted. Try again: anything already done is skipped.",
    };
  }
  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath("/admin");
  return { success: true, refunded: result.refunded };
}
