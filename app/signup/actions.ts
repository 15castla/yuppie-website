"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient } from "@/app/admin/admin-client";

export async function confirmInvite(formData: FormData) {
  const code = formData.get("code");
  if (typeof code !== "string" || !code) return;

  const adminClient = createAdminSupabaseClient();
  const { data: invite } = await adminClient
    .from("invited_emails")
    .select("used, expires_at")
    .eq("invite_code", code)
    .maybeSingle();

  if (!invite || invite.used || new Date(invite.expires_at) < new Date()) {
    return;
  }

  await adminClient
    .from("invited_emails")
    .update({ used: true })
    .eq("invite_code", code);

  revalidatePath("/signup");
}
