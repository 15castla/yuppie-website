"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "./require-admin";
import { createAdminSupabaseClient } from "./admin-client";

// Revoking a membership just means setting membership_status to
// "cancelled" — the same three-value enum ('active' | 'paused' |
// 'cancelled') everywhere else in the app already understands (see
// admin/(protected)/members/page.tsx's STATUS_FILTERS and the Dashboard's
// "Cancelled / Expired" stat card). Deliberately does NOT touch Stripe
// (no cancellation call to stripe_subscription_id) and does NOT delete the
// member row — this only flips the flag admins already use to tell who's
// still an active member. Called directly from a client component
// (RevokeMembershipButton) rather than wired as a <form action>, so it
// takes a plain memberId argument instead of FormData.
export async function revokeMembership(
  memberId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();

  if (!memberId) {
    return { success: false, error: "Missing member." };
  }

  const adminClient = createAdminSupabaseClient();
  const { error } = await adminClient
    .from("members")
    .update({ membership_status: "cancelled" })
    .eq("id", memberId);

  if (error) {
    console.error(`revokeMembership failed for member ${memberId}:`, error);
    return { success: false, error: "Something went wrong revoking that membership." };
  }

  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath("/admin");
  return { success: true };
}
