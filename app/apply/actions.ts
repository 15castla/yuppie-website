"use server";

import { createClient } from "@supabase/supabase-js";

export type SubmitApplicationResult =
  | { success: true }
  | { success: false; error: string; isDuplicate?: boolean };

const REQUIRED_FIELDS: { name: string; label: string }[] = [
  { name: "full_name", label: "Full name" },
  { name: "email", label: "Email" },
  { name: "phone", label: "Phone" },
  { name: "employer", label: "Employer" },
  { name: "role_title", label: "Role / job title" },
  { name: "linkedin_url", label: "LinkedIn URL" },
  { name: "instagram_username", label: "Instagram username" },
];

export async function submitApplication(
  formData: FormData,
): Promise<SubmitApplicationResult> {
  const missingField = REQUIRED_FIELDS.find(({ name }) => {
    const value = formData.get(name);
    return typeof value !== "string" || !value.trim();
  });

  if (missingField) {
    return { success: false, error: `${missingField.label} is required.` };
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );

    const { error } = await supabase.from("applications").insert({
      full_name: formData.get("full_name") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
      employer: formData.get("employer") as string,
      role_title: formData.get("role_title") as string,
      linkedin_url: formData.get("linkedin_url") as string,
      instagram_username: formData.get("instagram_username") as string,
    });

    if (error) {
      console.error("submitApplication insert error:", error);

      if (error.code === "23505") {
        return {
          success: false,
          error: "You've already got an application with us. We'll be in touch soon.",
          isDuplicate: true,
        };
      }

      return {
        success: false,
        error: "Something went wrong submitting your application. Please try again.",
      };
    }

    return { success: true };
  } catch (err) {
    console.error("submitApplication unexpected error:", err);
    return {
      success: false,
      error: "Something went wrong submitting your application. Please try again.",
    };
  }
}
