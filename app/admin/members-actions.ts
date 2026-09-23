"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "./require-admin";
import { createAdminSupabaseClient } from "./admin-client";
import { stripe } from "@/lib/stripe";

// Permanently deletes a member's row from `members`. If they have a Stripe
// subscription on file, it's cancelled immediately first (not
// cancel_at_period_end like the member's own self-service cancelMembership
// in app/members/profile/actions.ts, since there's no reason to let billing
// continue for an account that's about to stop existing in our system).
// Cancellation happens before the delete and blocks it on failure, so this
// can't leave an orphaned Stripe subscription with no member row left to
// find it from.
export async function deleteMember(
  memberId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();

  if (!memberId) {
    return { success: false, error: "Missing member." };
  }

  const adminClient = createAdminSupabaseClient();
  const { data: member, error: fetchError } = await adminClient
    .from("members")
    .select("stripe_subscription_id")
    .eq("id", memberId)
    .maybeSingle();

  if (fetchError || !member) {
    console.error(`deleteMember: member ${memberId} not found:`, fetchError);
    return { success: false, error: "Member not found." };
  }

  if (member.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(member.stripe_subscription_id);
    } catch (err) {
      // Already cancelled/gone on Stripe's side isn't a reason to block
      // deletion, since there's nothing left to cancel. This is a real,
      // expected case: a member who self-cancelled via cancelMembership sets
      // cancel_at_period_end, and once that period actually ends Stripe
      // cancels the subscription on its own. There's no webhook in this
      // codebase to sync that back, so stripe_subscription_id stays
      // populated here even though Stripe already considers it gone (see
      // cancelMembership's own comment on the missing webhook).
      const code = err && typeof err === "object" && "code" in err ? err.code : undefined;
      if (code !== "resource_missing") {
        console.error(`deleteMember: Stripe cancellation failed for member ${memberId}:`, err);
        const message = err instanceof Error ? err.message : "Stripe cancellation failed.";
        return {
          success: false,
          error: `Couldn't cancel their Stripe subscription, so the account wasn't deleted: ${message}`,
        };
      }
    }
  }

  const { error } = await adminClient.from("members").delete().eq("id", memberId);

  if (error) {
    console.error(`deleteMember failed for member ${memberId}:`, error);
    return { success: false, error: "Something went wrong deleting that member." };
  }

  revalidatePath("/admin/members");
  revalidatePath("/admin");
  return { success: true };
}
