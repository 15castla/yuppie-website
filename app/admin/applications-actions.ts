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

  const { data: application } = await adminClient
    .from("applications")
    .select(
      "email, full_name, phone, stripe_customer_id, stripe_payment_method_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (!application?.stripe_customer_id || !application.stripe_payment_method_id) {
    await adminClient
      .from("applications")
      .update({ payment_error: "No saved card on file for this application." })
      .eq("id", id);
    revalidatePath("/admin/applications");
    revalidatePath("/admin");
    return;
  }

  let subscriptionId: string;

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

  const { data: updated } = await adminClient
    .from("applications")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminEmail,
      stripe_subscription_id: subscriptionId,
      payment_error: null,
    })
    .eq("id", id)
    .select("email, full_name, phone")
    .maybeSingle();

  if (updated?.email) {
    const { data: invite } = await adminClient
      .from("invited_emails")
      .insert({
        email: updated.email,
        application_id: id,
      })
      .select("invite_code")
      .maybeSingle();

    if (invite?.invite_code) {
      const email = updated.email;
      const fullName = updated.full_name;
      const phone = updated.phone;
      const inviteCode = invite.invite_code;

      after(async () => {
        try {
          await sendWelcomeEmail({ to: email, fullName, inviteCode });
        } catch (err) {
          console.error(
            `sendWelcomeEmail failed for application ${id} (${email}):`,
            err,
          );
        }

        if (phone) {
          try {
            await sendWelcomeSms({ to: phone, inviteCode });
          } catch (err) {
            console.error(
              `sendWelcomeSms failed for application ${id} (${email}):`,
              err,
            );
          }
        }
      });
    }
  }

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
