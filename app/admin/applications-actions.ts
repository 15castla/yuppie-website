"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "./require-admin";
import { createAdminSupabaseClient } from "./admin-client";
import { sendWelcomeEmail } from "./send-welcome-email";
import { sendWelcomeSms } from "./send-welcome-sms";
import { stripe } from "@/lib/stripe";

async function approve(id: string, adminEmail: string) {
  const adminClient = createAdminSupabaseClient();

  // Single fetch covers everything below: the idempotency check
  // (status / stripe_subscription_id), the charge (customer / payment
  // method), and the member row (email / full_name / phone).
  const { data: application } = await adminClient
    .from("applications")
    .select(
      "status, email, full_name, phone, stripe_customer_id, stripe_payment_method_id, stripe_subscription_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (!application) {
    console.error(`approve: application ${id} not found`);
    return;
  }

  // status only ever flips to "approved" together with the member row,
  // atomically, in the RPC below — so this alone means a previous attempt
  // already finished the whole thing. Safe no-op for a duplicate click.
  if (application.status === "approved") {
    console.log(`approve: application ${id} already fully approved, skipping`);
    return;
  }

  let subscriptionId = application.stripe_subscription_id;

  // No recorded charge yet on this application — do the charge. If
  // subscriptionId is already set (a previous attempt charged Stripe but
  // failed before/at account creation), skip straight past this whole
  // block without creating a second subscription.
  if (!subscriptionId) {
    if (!application.stripe_customer_id || !application.stripe_payment_method_id) {
      await adminClient
        .from("applications")
        .update({ payment_error: "No saved card on file for this application." })
        .eq("id", id);
      revalidatePath("/admin/applications");
      revalidatePath("/admin");
      return;
    }

    try {
      const subscription = await stripe.subscriptions.create({
        customer: application.stripe_customer_id,
        items: [{ price: process.env.STRIPE_PRICE_ID_MEMBERSHIP! }],
        default_payment_method: application.stripe_payment_method_id,
        payment_behavior: "error_if_incomplete",
        off_session: true,
      });
      subscriptionId = subscription.id;
    } catch (err) {
      console.error(`Subscription creation failed for application ${id}:`, err);
      const message =
        err instanceof Error ? err.message : "Payment failed. Please try again.";

      await adminClient
        .from("applications")
        .update({ payment_error: message })
        .eq("id", id);

      revalidatePath("/admin/applications");
      revalidatePath("/admin");
      return;
    }

    // Record the charge immediately, before anything else, so a retry
    // after this point sees this application as already charged (via the
    // stripe_subscription_id check above) and skips straight to account
    // creation instead of risking a second subscription.
    const { error: recordError } = await adminClient
      .from("applications")
      .update({ stripe_subscription_id: subscriptionId, payment_error: null })
      .eq("id", id);

    if (recordError) {
      console.error(
        `CRITICAL: application ${id} was charged (Stripe subscription ${subscriptionId}) but recording it failed:`,
        recordError,
      );
      await adminClient
        .from("applications")
        .update({
          payment_error: `Charged (Stripe subscription ${subscriptionId}) but failed to save that — do not approve again without checking Stripe and the database first. Error: ${recordError.message}`,
        })
        .eq("id", id);
      revalidatePath("/admin/applications");
      revalidatePath("/admin");
      return;
    }
  }

  // From here on the charge is guaranteed done and recorded — on this
  // attempt or a previous one. Everything below is account provisioning.

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: application.email,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    console.error(`Auth account creation failed for application ${id}:`, authError);

    // A prior attempt already got as far as creating the Auth user, then
    // failed before/at the RPC step below — retrying lands back here and
    // createUser correctly rejects the duplicate email. That's a distinct,
    // more specific situation than "account could not be created" (which
    // reads as if no account exists at all), so it gets its own message
    // rather than the generic one.
    const message =
      authError?.code === "email_exists"
        ? `Payment succeeded (Stripe subscription ${subscriptionId}). An account for this email may already exist from a previous attempt — check Supabase Auth before retrying.`
        : `Payment succeeded (Stripe subscription ${subscriptionId}) but the member account could not be created: ${authError?.message ?? "unknown error"}. It's safe to click Approve again — this will retry account creation without charging again.`;

    await adminClient
      .from("applications")
      .update({ payment_error: message })
      .eq("id", id);
    revalidatePath("/admin/applications");
    revalidatePath("/admin");
    return;
  }

  const { error: rpcError } = await adminClient.rpc(
    "approve_application_and_create_member",
    {
      p_application_id: id,
      p_auth_user_id: authData.user.id,
      p_reviewed_by: adminEmail,
    },
  );

  if (rpcError) {
    console.error(
      `approve_application_and_create_member RPC failed for application ${id}:`,
      rpcError,
    );
    await adminClient
      .from("applications")
      .update({
        payment_error: `Payment succeeded (Stripe subscription ${subscriptionId}) but the member account could not be finished: ${rpcError.message}. It's safe to click Approve again — this will retry account creation without charging again.`,
      })
      .eq("id", id);
    revalidatePath("/admin/applications");
    revalidatePath("/admin");
    return;
  }

  // Audit-only from here on — login and membership_status don't depend on
  // this succeeding, so it doesn't gate the welcome email/SMS below.
  const { error: inviteError } = await adminClient
    .from("invited_emails")
    .insert({ email: application.email, application_id: id });

  if (inviteError) {
    console.error(
      `invited_emails audit insert failed for application ${id}:`,
      inviteError,
    );
  }

  const email = application.email;
  const fullName = application.full_name;
  const phone = application.phone;

  after(async () => {
    try {
      await sendWelcomeEmail({ to: email, fullName });
    } catch (err) {
      console.error(
        `sendWelcomeEmail failed for application ${id} (${email}):`,
        err,
      );
    }

    if (phone) {
      try {
        await sendWelcomeSms({ to: phone });
      } catch (err) {
        console.error(
          `sendWelcomeSms failed for application ${id} (${email}):`,
          err,
        );
      }
    }
  });

  revalidatePath("/admin/applications");
  revalidatePath("/admin");
}

async function reject(id: string, adminEmail: string) {
  const adminClient = createAdminSupabaseClient();

  await adminClient
    .from("applications")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminEmail,
    })
    .eq("id", id);

  revalidatePath("/admin/applications");
  revalidatePath("/admin");
}

export async function approveApplication(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin.email) return;
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;
  await approve(id, admin.email);
}

export async function rejectApplication(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin.email) return;
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;
  await reject(id, admin.email);
}
