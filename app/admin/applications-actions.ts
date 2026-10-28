"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "./require-admin";
import { createAdminSupabaseClient } from "./admin-client";
import { stripe } from "@/lib/stripe";
import { declineApplicationById, sendApprovalMessages } from "@/lib/server/applications";
import { audit } from "@/lib/server/audit";
import { absoluteUrl } from "@/lib/server/config";
import { sendAdminAlert } from "@/lib/server/messages";

// The installed @supabase/auth-js version has no getUserByEmail(), and
// listUsers() takes no email/filter param (verified against
// node_modules/@supabase/auth-js/dist/module/GoTrueAdminApi.d.ts), so
// finding an existing user by email means paging through everyone and
// matching locally.
async function findAuthUserIdByEmail(
  adminClient: ReturnType<typeof createAdminSupabaseClient>,
  email: string,
): Promise<string | null> {
  const targetEmail = email.toLowerCase();
  let page = 1;

  for (;;) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      console.error(`listUsers failed while looking up ${email}:`, error);
      return null;
    }

    const match = data.users.find((user) => user.email?.toLowerCase() === targetEmail);
    if (match) return match.id;

    if (!data.nextPage) return null;
    page = data.nextPage;
  }
}

async function approve(id: string, adminEmail: string, adminId: string) {
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
  // atomically, in the RPC below, so this alone means a previous attempt
  // already finished the whole thing. Safe no-op for a duplicate click.
  if (application.status === "approved") {
    console.log(`approve: application ${id} already fully approved, skipping`);
    return;
  }

  let subscriptionId = application.stripe_subscription_id;

  // No recorded charge yet on this application, so do the charge. If
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
      const subscription = await stripe.subscriptions.create(
        {
          customer: application.stripe_customer_id,
          items: [{ price: process.env.STRIPE_PRICE_ID_MEMBERSHIP! }],
          default_payment_method: application.stripe_payment_method_id,
          payment_behavior: "error_if_incomplete",
          off_session: true,
        },
        // A double click is one subscription; a retry a minute later (after a
        // declined card is fixed) is a fresh attempt.
        { idempotencyKey: `approve-sub-${id}-${Math.floor(Date.now() / 60000)}` },
      );
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
          payment_error: `Charged (Stripe subscription ${subscriptionId}) but failed to save that. Do not approve again without checking Stripe and the database first. Error: ${recordError.message}`,
        })
        .eq("id", id);
      revalidatePath("/admin/applications");
      revalidatePath("/admin");
      return;
    }
  }

  // From here on, the charge is guaranteed done and recorded (on this
  // attempt or a previous one). Everything below is account provisioning.

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: application.email,
    email_confirm: true,
  });

  let authUserId: string;

  if (authError || !authData.user) {
    if (authError?.code === "email_exists") {
      // Supabase enforces unique emails on auth.users, so this collision
      // can only be one of two things: a prior approve() attempt that got
      // as far as creating the Auth user but failed before/at the RPC
      // below, or an existing admin/staff account becoming a paying member
      // under the same email. Either way it's safe to attach membership to
      // that existing user rather than reject the approval.
      const existingUserId = await findAuthUserIdByEmail(adminClient, application.email);

      if (!existingUserId) {
        console.error(
          `approve: email_exists for application ${id} (${application.email}) but no matching user found via listUsers`,
        );
        await adminClient
          .from("applications")
          .update({
            payment_error: `Payment succeeded (Stripe subscription ${subscriptionId}). Supabase reports this email is already registered, but the matching account couldn’t be found. Check Supabase Auth manually before retrying.`,
          })
          .eq("id", id);
        revalidatePath("/admin/applications");
        revalidatePath("/admin");
        return;
      }

      authUserId = existingUserId;
    } else {
      console.error(`Auth account creation failed for application ${id}:`, authError);
      await adminClient
        .from("applications")
        .update({
          payment_error: `Payment succeeded (Stripe subscription ${subscriptionId}) but the member account could not be created: ${authError?.message ?? "unknown error"}. It’s safe to click Approve again: this will retry account creation without charging again.`,
        })
        .eq("id", id);
      revalidatePath("/admin/applications");
      revalidatePath("/admin");
      return;
    }
  } else {
    authUserId = authData.user.id;
  }

  const { error: rpcError } = await adminClient.rpc(
    "approve_application_and_create_member",
    {
      p_application_id: id,
      p_auth_user_id: authUserId,
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
        payment_error: `Payment succeeded (Stripe subscription ${subscriptionId}) but the member account could not be finished: ${rpcError.message}. It’s safe to click Approve again: this will retry account creation without charging again.`,
      })
      .eq("id", id);
    revalidatePath("/admin/applications");
    revalidatePath("/admin");
    return;
  }

  // Audit-only from here on: login and membership_status don't depend on
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
  const approvedSubscriptionId = subscriptionId;

  // The rewritten welcome email and the short welcome text (C-D4), through
  // the message service (message_log, once per application, never throws).
  after(() =>
    sendApprovalMessages({
      applicationId: id,
      memberId: authUserId,
      email,
      fullName,
      phone,
      subscriptionId: approvedSubscriptionId,
    }),
  );
  await audit(adminId, "application.approve", { type: "application", id }, { email, member_id: authUserId, subscription: subscriptionId });

  revalidatePath("/admin/applications");
  revalidatePath("/admin");
}

// QA2-04: only a waiting application may be approved. Checked here, before approve() charges the card (a
// page left open after another admin declined or approved it), and again in the database function
// (approve_application_and_create_member, migration 20261028090200) for anything that slips between.
type ApplicationGate =
  | { ok: true }
  | { ok: false; code: "not_found" | "approved" | "declined"; error: string };

async function waitingOnly(applicationId: string): Promise<ApplicationGate> {
  const { data } = await createAdminSupabaseClient()
    .from("applications")
    .select("status, reviewed_at, reviewed_by")
    .eq("id", applicationId)
    .maybeSingle();
  if (!data) return { ok: false, code: "not_found", error: "That application couldn’t be found." };
  if (data.status === "approved") return { ok: false, code: "approved", error: "This application was approved already, so nothing was charged again." };
  if (data.status !== "pending") return { ok: false, code: "declined", error: "This application was declined, so nothing was charged." };
  return { ok: true };
}

export async function approveApplication(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin.email) return;
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;
  const gate = await waitingOnly(id);
  if (!gate.ok) {
    await audit(admin.id, "application.approve_refused", { type: "application", id }, { reason: gate.code });
    return;
  }
  await approve(id, admin.email, admin.id);
}

export type ApproveApplicationResult =
  | { ok: true; memberId: string | null }
  | { ok: false; code?: "not_found" | "approved" | "declined" | "payment"; error: string };

// The card's Approve (after its confirm dialog, B-D17): the same approve() as the form action above, then
// what happened, so the card can show the receipt or the plain banner for the payment problem.
export async function adminApproveApplication(applicationId: string): Promise<ApproveApplicationResult> {
  const admin = await requireAdmin();
  if (!admin.email) return { ok: false, error: "Your admin account has no email address." };
  if (!applicationId) return { ok: false, code: "not_found", error: "That application couldn’t be found." };
  const gate = await waitingOnly(applicationId);
  if (!gate.ok) {
    await audit(admin.id, "application.approve_refused", { type: "application", id: applicationId }, { reason: gate.code });
    return gate;
  }
  await approve(applicationId, admin.email, admin.id);
  const adminClient = createAdminSupabaseClient();
  const { data: app } = await adminClient.from("applications").select("status, email, payment_error").eq("id", applicationId).maybeSingle();
  if (!app) return { ok: false, code: "not_found", error: "That application couldn’t be found." };
  if (app.status !== "approved") {
    await audit(admin.id, "application.approve_failed", { type: "application", id: applicationId }, { payment_error: app.payment_error ?? null });
    return { ok: false, code: app.status === "rejected" ? "declined" : "payment", error: app.payment_error ?? "The application wasn’t approved." };
  }
  const { data: member } = await adminClient.from("members").select("id").eq("email", app.email).maybeSingle();
  return { ok: true, memberId: member?.id ?? null };
}

export type DeclineApplicationResult =
  | { ok: true; cardReleased: boolean; emailed: boolean }
  | { ok: false; code?: "not_found" | "approved" | "charged" | "error"; error: string };

/** QA2-08: the saved card is still in Stripe after a decline. One alert to the club inbox per application. */
async function alertCardNotReleased(applicationId: string) {
  const { data: app } = await createAdminSupabaseClient()
    .from("applications")
    .select("full_name, email, stripe_customer_id, stripe_payment_method_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) return;
  const name = app.full_name?.trim() || app.email;
  await sendAdminAlert({
    subject: `Saved card not removed: ${name}`,
    heading: "A declined applicant’s card is still saved in Stripe",
    lines: [
      `${name}’s application is declined, but Stripe didn’t remove the card they saved when they applied.`,
      "Open the application in the admin and choose Try again, or remove the card in Stripe.",
      `Application: ${absoluteUrl(`/admin/applications/${applicationId}`)}`,
      `Stripe customer: ${app.stripe_customer_id ?? "none"}`,
      `Card: ${app.stripe_payment_method_id ?? "none"}`,
    ],
    dedupeKey: `card-not-released:${applicationId}`,
    refs: { applicationId },
  });
}

// Decline (B-D9: the word is Decline, the database value stays "rejected").
// Releases the saved card (C-D8) and, with sendEmail (the switch, on by
// default, B-D3), sends the kind decline email (C-D2). Audited. Refused for an
// approved application, and for a waiting one that has been charged already
// (its account is half made: finish it instead; the card switches Decline off).
export async function declineApplication(
  applicationId: string,
  options: { sendEmail?: boolean } = {},
): Promise<DeclineApplicationResult> {
  const admin = await requireAdmin();
  if (!applicationId) return { ok: false, code: "not_found", error: "That application couldn’t be found." };
  const { data: before } = await createAdminSupabaseClient()
    .from("applications")
    .select("status, stripe_subscription_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!before) return { ok: false, code: "not_found", error: "That application couldn’t be found." };
  if (before.status === "approved") return { ok: false, code: "approved", error: "This application was approved already, so it can’t be declined." };
  if (before.status === "pending" && before.stripe_subscription_id) {
    return { ok: false, code: "charged", error: "This person has paid already, so the application can’t be declined. Finish the account instead." };
  }
  const sendEmail = options.sendEmail !== false;
  const result = await declineApplicationById(applicationId, admin.email ?? admin.id, { sendEmail });
  if (!result.ok) {
    await audit(admin.id, "application.decline_failed", { type: "application", id: applicationId }, { error: result.error });
    return { ok: false, code: "error", error: "We couldn’t decline that application. Try again in a moment." };
  }
  await audit(admin.id, "application.decline", { type: "application", id: applicationId }, {
    send_email: sendEmail,
    emailed: result.emailed,
    card_released: result.cardReleased,
    already_declined: result.alreadyDeclined,
  });
  if (!result.cardReleased) await alertCardNotReleased(applicationId);
  revalidatePath("/admin/applications");
  revalidatePath("/admin");
  return { ok: true, cardReleased: result.cardReleased, emailed: result.emailed };
}

export type ReleaseCardResult = { ok: true; cardReleased: boolean } | { ok: false; error: string };

// QA2-08: Try again on a declined application whose saved card Stripe didn't remove. Detaches it again (same
// idempotency key), sends nothing. Audited.
export async function adminReleaseApplicationCard(applicationId: string): Promise<ReleaseCardResult> {
  const admin = await requireAdmin();
  if (!applicationId) return { ok: false, error: "That application couldn’t be found." };
  const { data: app } = await createAdminSupabaseClient().from("applications").select("status").eq("id", applicationId).maybeSingle();
  if (!app) return { ok: false, error: "That application couldn’t be found." };
  if (app.status !== "rejected") return { ok: false, error: "Only a declined application’s card is removed here." };
  const result = await declineApplicationById(applicationId, admin.email ?? admin.id, { sendEmail: false });
  await audit(admin.id, "application.release_card", { type: "application", id: applicationId }, result.ok ? { card_released: result.cardReleased } : { error: result.error });
  if (!result.ok) return { ok: false, error: "We couldn’t reach Stripe. Try again in a moment." };
  revalidatePath("/admin/applications");
  return { ok: true, cardReleased: result.cardReleased };
}

// Today's form action (the Reject button), kept: now the same Decline. A
// "send_email" field of "off" (the switch) skips the email.
export async function rejectApplication(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;
  await declineApplication(id, { sendEmail: formData.get("send_email") !== "off" });
}
