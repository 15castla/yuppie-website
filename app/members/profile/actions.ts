"use server";

import { redirect } from "next/navigation";
import { revalidatePath, unstable_cache } from "next/cache";
import { after } from "next/server";
// react-phone-number-input's own root export bundles its React PhoneInput
// component together with its validation utilities in the same module, and
// importing it here (a server-only "use server" file with no React tree to
// render into) breaks build-time module evaluation, and its /core subpath
// needs metadata passed in manually. Validating directly against the
// underlying libphonenumber-js (already a transitive dependency, added
// here as a direct one) avoids both.
import { isValidPhoneNumber } from "libphonenumber-js";

import { createClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { stripe } from "@/lib/stripe";
import { dayDate, time24 } from "@/lib/server/format";
import { sendEmail } from "@/lib/server/messages";
import { requestCancel } from "@/lib/server/membership-actions";
import { uploadMemberMedia } from "@/lib/media-storage";
import { requireMember } from "../require-member";

export async function updateProfile(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const member = await requireMember();

  const fullName = formData.get("full_name");
  const phone = formData.get("phone");
  const employer = formData.get("employer");
  const roleTitle = formData.get("role_title");

  if (typeof fullName !== "string" || !fullName.trim()) {
    return { success: false, error: "Enter your name." };
  }

  if (typeof phone !== "string" || !isValidPhoneNumber(phone)) {
    return { success: false, error: "Enter a mobile number, like 07700 900123." };
  }

  // bio is intentionally not part of this form. Leave the column alone
  // rather than writing it here.
  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({
      full_name: fullName.trim(),
      phone,
      employer: typeof employer === "string" && employer.trim() ? employer.trim() : null,
      role_title: typeof roleTitle === "string" && roleTitle.trim() ? roleTitle.trim() : null,
    })
    .eq("id", member.id);

  if (error) {
    console.error(`updateProfile failed for member ${member.id}:`, error);
    return { success: false, error: "Your details didn’t save. Try again." };
  }

  // Every /members page, so nothing in the client router cache
  // (next.config.ts staleTimes) shows stale personal state.
  revalidatePath("/members", "layout");
  return { success: true };
}

const EMAIL_CHANGE_ERRORS = {
  invalid: "That email address doesn’t look right. Check it and try again.",
  unchanged: "That’s already your email address. Enter a different one.",
  inUse: "That email is already used by another account. Enter a different one.",
  rateLimited: "Too many tries. Wait a few minutes, then try again.",
  mfaRequired: "For security, complete two-factor verification before changing your email.",
  generic: "We couldn’t send the code. Try again.",
  incorrect: "That code is wrong or has expired. Send a new code.",
  noPending: "There’s no email change waiting to be confirmed. Start again.",
  syncFailed: "Your email was changed, but we couldn’t update your profile. Contact us.",
};

// Starts a login-email change through Supabase Auth's own flow rather
// than writing members.email directly: updateUser({ email }) emails a
// 6-digit code to the new address (and, when "secure email change" is on
// in the project's Auth settings, a second code to the current address).
// Nothing changes until verifyEmailChange below accepts the code(s).
//
// The project's "Change Email Address" template must show {{ .Token }},
// not a {{ .ConfirmationURL }} link: Outlook's Safe Links scanner opens
// links in emails before the recipient does, which would use up the
// change (the same problem that moved member login to typed codes).
export async function requestEmailChange(
  newEmailInput: string,
): Promise<{ success: boolean; error?: string }> {
  const member = await requireMember();
  const newEmail = newEmailInput.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return { success: false, error: EMAIL_CHANGE_ERRORS.invalid };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: EMAIL_CHANGE_ERRORS.generic };
  }
  if (newEmail === user.email?.toLowerCase()) {
    return { success: false, error: EMAIL_CHANGE_ERRORS.unchanged };
  }

  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) {
    console.error(`requestEmailChange failed for member ${member.id}:`, error);
    if (error.code === "email_exists" || error.code === "user_already_exists") {
      return { success: false, error: EMAIL_CHANGE_ERRORS.inUse };
    }
    if (error.code === "email_address_invalid" || error.code === "validation_failed") {
      return { success: false, error: EMAIL_CHANGE_ERRORS.invalid };
    }
    if (
      error.status === 429 ||
      error.code === "over_email_send_rate_limit" ||
      error.code === "over_request_rate_limit"
    ) {
      return { success: false, error: EMAIL_CHANGE_ERRORS.rateLimited };
    }
    // Accounts with an MFA factor enrolled (in practice, admins who are
    // also members) need an AAL2 session to change their email.
    if (error.code === "insufficient_aal") {
      return { success: false, error: EMAIL_CHANGE_ERRORS.mfaRequired };
    }
    return { success: false, error: EMAIL_CHANGE_ERRORS.generic };
  }

  return { success: true };
}

// Checks one code from an email change started by requestEmailChange.
// `sentTo` says which inbox the code came from: "new" (always required)
// or "current" (only when secure email change is on). The addresses
// come from the session's own auth user, not the client.
//
// After a valid code, the auth user is re-read to see whether the change
// has actually taken effect. With secure email change on, the first of
// the two codes is accepted but changes nothing yet; Supabase returns
// no user or session for it. So "done" is decided by auth.users.email
// matching the new address, not by verifyOtp succeeding.
//
// members.email has no link to auth.users.email (nothing syncs them), so
// it's updated here once the change is confirmed. That write uses the
// service-role client, scoped to this member's id, with the value taken
// from the auth user Supabase just confirmed, never from the client.
// members' own RLS policies aren't in this repo's migrations, so this
// doesn't depend on whether they let a member write their email column.
export async function verifyEmailChange(
  sentTo: "new" | "current",
  codeInput: string,
): Promise<
  | { status: "done"; email: string }
  | { status: "needs_other_code" }
  | { status: "error"; error: string }
> {
  const member = await requireMember();
  const code = codeInput.replace(/\D/g, "");
  if (code.length !== 6) {
    return { status: "error", error: "Enter the 6-digit code from your email." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const pendingEmail = user?.new_email;
  if (!user?.email || !pendingEmail) {
    return { status: "error", error: EMAIL_CHANGE_ERRORS.noPending };
  }

  const { error: verifyError } = await supabase.auth.verifyOtp({
    email: sentTo === "new" ? pendingEmail : user.email,
    token: code,
    type: "email_change",
  });
  if (verifyError) {
    console.error(`verifyEmailChange (${sentTo}) failed for member ${member.id}:`, verifyError);
    return { status: "error", error: EMAIL_CHANGE_ERRORS.incorrect };
  }

  const {
    data: { user: updatedUser },
  } = await supabase.auth.getUser();
  if (updatedUser?.email?.toLowerCase() !== pendingEmail.toLowerCase()) {
    return { status: "needs_other_code" };
  }

  // Tell the previous address, in case the change wasn't the member's own.
  // Scheduled before the members.email sync so it still goes out if that
  // fails (the login change has already happened either way). Best-effort,
  // after the response, same as the welcome email.
  const previousEmail = user.email;
  const confirmedEmail = updatedUser.email;
  const changedAt = new Date();
  after(async () => {
    // The rewritten security notice (r2c 6), through the message service
    // (message_log; never throws).
    await sendEmail({
      template: "email-changed",
      to: previousEmail,
      data: { oldEmail: previousEmail, newEmail: confirmedEmail, changed: { date: dayDate(changedAt), time: time24(changedAt) } },
      dedupeKey: `email-changed:${member.id}:${confirmedEmail.toLowerCase()}:${changedAt.getTime()}`,
      refs: { memberId: member.id },
    });
  });

  const { error: syncError } = await createAdminSupabaseClient()
    .from("members")
    .update({ email: updatedUser.email })
    .eq("id", member.id);
  if (syncError) {
    console.error(`verifyEmailChange: members.email sync failed for member ${member.id}:`, syncError);
    return { status: "error", error: EMAIL_CHANGE_ERRORS.syncFailed };
  }

  // So receipts and failed-payment notices follow the new address.
  // Best-effort: the login change has already happened, so a Stripe
  // failure is logged rather than reported as a failed change.
  if (member.stripe_customer_id) {
    try {
      await stripe.customers.update(
        member.stripe_customer_id,
        { email: updatedUser.email },
        { idempotencyKey: `customer-email-${member.stripe_customer_id}-${updatedUser.email.toLowerCase()}-${Math.floor(Date.now() / 60000)}` },
      );
    } catch (err) {
      console.error(`verifyEmailChange: Stripe email sync failed for member ${member.id}:`, err);
    }
  }

  revalidatePath("/members", "layout");
  return { status: "done", email: updatedUser.email };
}

// Storage write goes through the service-role client (uploadMemberMedia):
// there's no member-writable storage policy, by design (see the
// partner_perks migration's comment). But the members.avatar_url update
// itself goes through the request-scoped client, same as updateProfile
// above, so it's still bounded by that member's own row via RLS + the
// .eq("id", member.id) below, not just by requireMember() having run.
export async function updateAvatar(
  formData: FormData,
): Promise<{ success: boolean; error?: string; url?: string }> {
  // allowMissingPhoto: this is the action that gives a member their first
  // photo, so the photo gate (require-member.ts) must not turn it away.
  const member = await requireMember({ allowMissingPhoto: true });

  const photo = formData.get("photo");
  if (!(photo instanceof File)) {
    return { success: false, error: "Choose a photo to upload." };
  }

  const uploaded = await uploadMemberMedia("avatars", member.id, photo);
  if (uploaded.error) {
    return { success: false, error: uploaded.error };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({ avatar_url: uploaded.url })
    .eq("id", member.id);

  if (error) {
    console.error(`updateAvatar failed for member ${member.id}:`, error);
    return { success: false, error: "Your photo uploaded but didn’t save. Try again." };
  }

  revalidatePath("/members", "layout");
  return { success: true, url: uploaded.url };
}

// Clears avatar_url back to null so the profile falls back to the plain
// initials avatar (initialsFor in components/members/ui.tsx). Same
// rationale as removeEventImage/removePerkLogo: doesn't delete the old
// file from the member-media bucket. lib/media-storage.ts has no
// deletion helper, and an orphaned file only costs storage space, not
// correctness.
export async function removeAvatar(): Promise<{ success: boolean; error?: string }> {
  // allowMissingPhoto: it leaves the member without a photo, and a retry or a
  // second tab must not be bounced to the gate halfway through.
  const member = await requireMember({ allowMissingPhoto: true });

  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({ avatar_url: null })
    .eq("id", member.id);

  if (error) {
    console.error(`removeAvatar failed for member ${member.id}:`, error);
    return { success: false, error: "Your photo wasn’t removed. Try again." };
  }

  revalidatePath("/members", "layout");
  return { success: true };
}

// Today's one-step Cancel membership, kept under its name for the You page:
// sets the subscription to cancel at the end of the billing period and now
// also stores the end date (members.cancel_at), so the card shows "Ends 12
// Nov", the gate opens on that date, and the cancel-requested email goes.
// The two-step flow with a reason is requestCancelMembership in
// app/members/you/actions.ts; both use lib/server/membership-actions.ts.
export async function cancelMembership(): Promise<{ success: boolean; error?: string }> {
  const member = await requireMember();
  const result = await requestCancel(member.id, null);
  if (!result.ok) {
    return { success: false, error: result.error };
  }
  revalidatePath("/members", "layout");
  return { success: true };
}

// Real, but genuinely fallible: current_period_end lives per subscription
// item in this Stripe API version, not on the subscription itself. Callers
// treat a null return as "omit the row" rather than showing a fake date.
// Cached for an hour since a billing date only actually changes once a
// month, so there's no reason to hit Stripe's API on every profile page load.
const getCachedNextBillingDate = unstable_cache(
  async (subscriptionId: string) => {
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
  },
  ["next-billing-date"],
  { revalidate: 3600 },
);

export async function getNextBillingDate(
  subscriptionId: string | null,
): Promise<string | null> {
  if (!subscriptionId) return null;
  return getCachedNextBillingDate(subscriptionId);
}

export async function signOutMember() {
  const supabase = await createClient();
  // Local scope only — see app/admin/actions.ts's signOut() for why:
  // Supabase's default (global) scope would also sign this member out
  // of any other session on another device signed into the same account.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
