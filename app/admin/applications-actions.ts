"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
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
      const email = application.email;
      const fullName = application.full_name;
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
      });
    }
  }

  revalidatePath("/admin/applications");
  revalidatePath("/admin");
}

export async function approveApplication(formData: FormData) {
  await setApplicationStatus(formData, "approved");
}

export async function rejectApplication(formData: FormData) {
  await setApplicationStatus(formData, "rejected");
}
