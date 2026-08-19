"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./require-admin";
import { createAdminSupabaseClient } from "./admin-client";
import { sendWelcomeEmail } from "./send-welcome-email";

async function setApplicationStatus(
  formData: FormData,
  status: "approved" | "rejected",
) {
  const admin = await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const adminClient = createAdminSupabaseClient();
  const { data: application } = await adminClient
    .from("applications")
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: admin.email,
    })
    .eq("id", id)
    .select("email, full_name")
    .maybeSingle();

  if (status === "approved" && application?.email) {
    const { data: invite } = await adminClient
      .from("invited_emails")
      .insert({
        email: application.email,
        application_id: id,
      })
      .select("invite_code")
      .maybeSingle();

    if (invite?.invite_code) {
      try {
        await sendWelcomeEmail({
          to: application.email,
          fullName: application.full_name,
          inviteCode: invite.invite_code,
        });
      } catch (err) {
        console.error("sendWelcomeEmail failed:", err);
      }
    }
  }

  revalidatePath("/admin/applications");
}

export async function approveApplication(formData: FormData) {
  await setApplicationStatus(formData, "approved");
}

export async function rejectApplication(formData: FormData) {
  await setApplicationStatus(formData, "rejected");
}
