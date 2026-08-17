"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./require-admin";
import { createAdminSupabaseClient } from "./admin-client";

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
    .select("email")
    .maybeSingle();

  if (status === "approved" && application?.email) {
    await adminClient.from("invited_emails").insert({
      email: application.email,
      application_id: id,
    });
  }

  revalidatePath("/admin/applications");
}

export async function approveApplication(formData: FormData) {
  await setApplicationStatus(formData, "approved");
}

export async function rejectApplication(formData: FormData) {
  await setApplicationStatus(formData, "rejected");
}
