"use server";

import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

export type SubmitApplicationResult =
  | { success: true }
  | { success: false; error: string; isDuplicate?: boolean };

export type CreateSetupIntentResult =
  | { success: true; clientSecret: string }
  | { success: false; error: string };

const REQUIRED_FIELDS: { name: string; label: string }[] = [
  { name: "full_name", label: "Full name" },
  { name: "email", label: "Email" },
  { name: "phone", label: "Phone" },
  { name: "employer", label: "Employer" },
  { name: "role_title", label: "Role / job title" },
  { name: "linkedin_url", label: "LinkedIn URL" },
  { name: "instagram_username", label: "Instagram username" },
];

export async function createCardSetupIntent(): Promise<CreateSetupIntentResult> {
  try {
    const setupIntent = await stripe.setupIntents.create({
      payment_method_types: ["card"],
      // Attempt authentication now, while the applicant is present, so the
      // off-session charge at approval time is far less likely to need
      // further authentication from them.
      usage: "off_session",
    });

    if (!setupIntent.client_secret) {
      return { success: false, error: "Could not start card setup. Please try again." };
    }

    return { success: true, clientSecret: setupIntent.client_secret };
  } catch (err) {
    console.error("createCardSetupIntent error:", err);
    return { success: false, error: "Could not start card setup. Please try again." };
  }
}

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

  const paymentMethodId = formData.get("stripe_payment_method_id");
  if (typeof paymentMethodId !== "string" || !paymentMethodId) {
    return {
      success: false,
      error: "Card details are required to apply. Please try again.",
    };
  }

  const fullName = formData.get("full_name") as string;
  const email = formData.get("email") as string;

  let stripeCustomerId: string;

  try {
    const customer = await stripe.customers.create({
      name: fullName,
      email,
      payment_method: paymentMethodId,
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    stripeCustomerId = customer.id;
  } catch (err) {
    console.error("Stripe customer creation error:", err);
    return {
      success: false,
      error: "Something went wrong saving your card. Please try again.",
    };
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );

    const { error } = await supabase.from("applications").insert({
      full_name: fullName,
      email,
      phone: formData.get("phone") as string,
      employer: formData.get("employer") as string,
      role_title: formData.get("role_title") as string,
      linkedin_url: formData.get("linkedin_url") as string,
      instagram_username: formData.get("instagram_username") as string,
      stripe_customer_id: stripeCustomerId,
      stripe_payment_method_id: paymentMethodId,
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
