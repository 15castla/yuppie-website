"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
// react-phone-number-input's own root export bundles its React PhoneInput
// component together with its validation utilities in the same module —
// importing it here (a server-only "use server" file with no React tree to
// render into) breaks build-time module evaluation, and its /core subpath
// needs metadata passed in manually. Validating directly against the
// underlying libphonenumber-js (already a transitive dependency, added
// here as a direct one) avoids both.
import { isValidPhoneNumber } from "libphonenumber-js";

import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { requireMember } from "../require-member";

export async function updateProfile(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const member = await requireMember();

  const fullName = formData.get("full_name");
  const phone = formData.get("phone");
  const employer = formData.get("employer");

  if (typeof fullName !== "string" || !fullName.trim()) {
    return { success: false, error: "Full name is required." };
  }

  if (typeof phone !== "string" || !isValidPhoneNumber(phone)) {
    return { success: false, error: "Please enter a valid phone number." };
  }

  // bio is intentionally not part of this form — leave the column alone
  // rather than writing it here.
  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({
      full_name: fullName.trim(),
      phone,
      employer: typeof employer === "string" && employer.trim() ? employer.trim() : null,
    })
    .eq("id", member.id);

  if (error) {
    console.error(`updateProfile failed for member ${member.id}:`, error);
    return { success: false, error: "Something went wrong saving your details." };
  }

  revalidatePath("/members/profile");
  revalidatePath("/members");
  return { success: true };
}

// A well-defined single Stripe call, safe to build for real: sets the
// subscription to cancel at the end of the current billing period rather
// than immediately. Deliberately does not touch members.membership_status
// here — there's no webhook handler in this codebase yet to flip it to
// "cancelled" once the period actually ends, and guessing an in-between
// status not in the existing active/paused/cancelled set would be worse
// than leaving it alone.
export async function cancelMembership(): Promise<{ success: boolean; error?: string }> {
  const member = await requireMember();

  if (!member.stripe_subscription_id) {
    return { success: false, error: "No active subscription found for this account." };
  }

  try {
    await stripe.subscriptions.update(member.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
  } catch (err) {
    console.error(`cancelMembership failed for member ${member.id}:`, err);
    return {
      success: false,
      error: "Something went wrong cancelling your membership. Please try again.",
    };
  }

  revalidatePath("/members/profile");
  return { success: true };
}

// Real, but genuinely fallible: current_period_end lives per subscription
// item in this Stripe API version, not on the subscription itself. Callers
// treat a null return as "omit the row" rather than showing a fake date.
export async function getNextBillingDate(
  subscriptionId: string | null,
): Promise<string | null> {
  if (!subscriptionId) return null;

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const periodEndUnix = subscription.items.data[0]?.current_period_end;
    if (!periodEndUnix) return null;

    return new Date(periodEndUnix * 1000).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch (err) {
    console.error(`getNextBillingDate failed for subscription ${subscriptionId}:`, err);
    return null;
  }
}

export async function signOutMember() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
