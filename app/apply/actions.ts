"use server";

import { createClient } from "@supabase/supabase-js";

export type SubmitApplicationResult =
  | { success: true }
  | { success: false; error: string };

export async function submitApplication(
  formData: FormData,
): Promise<SubmitApplicationResult> {
  const fullName = formData.get("full_name");
  const email = formData.get("email");

  if (
    typeof fullName !== "string" ||
    !fullName.trim() ||
    typeof email !== "string" ||
    !email.trim()
  ) {
    return { success: false, error: "Full name and email are required." };
  }

  // TEMPORARY: surfaces the real error (instead of a generic message) to
  // debug the production failure. Revert to a generic user-facing message
  // once the root cause is fixed.
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );

    const { error } = await supabase.from("applications").insert({
      full_name: fullName,
      email,
      phone: (formData.get("phone") as string) || null,
      employer: (formData.get("employer") as string) || null,
      role_title: (formData.get("role_title") as string) || null,
      linkedin_url: (formData.get("linkedin_url") as string) || null,
    });

    if (error) {
      console.error("submitApplication insert error:", error);
      return {
        success: false,
        error: `Supabase error: ${error.message} (code: ${error.code ?? "unknown"})`,
      };
    }

    return { success: true };
  } catch (err) {
    console.error("submitApplication unexpected error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Unexpected error: ${message}` };
  }
}
