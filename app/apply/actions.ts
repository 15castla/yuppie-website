"use server";

import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";
import { sendApplicationEmails } from "@/lib/server/applications";
import { applicantStanding, type ApplicantStanding } from "@/lib/server/rejoin";
import { CONTACT_EMAIL } from "@/components/site/links";

export type SubmitApplicationResult =
  | { success: true }
  | { success: false; error: string; isDuplicate?: boolean; signIn?: boolean };

export type ApplicantCheckResult = { ok: true } | { ok: false; error: string; isDuplicate: true; signIn?: boolean };

// What /apply says to someone who cannot apply with this email (lib/server/rejoin.ts). An ended member can.
const WAITING = "You’ve already got an application with us. We’ll be in touch soon.";
// The form adds "Sign in instead." as a link to /member-login (signIn).
const ALREADY_MEMBER = "You’re already a member.";
// A membership that ended, on an account that has a newer email now: approval finds the account by email.
const MOVED = "Your membership is under a newer email. Apply with that one instead.";

function refusal(standing: ApplicantStanding): ApplicantCheckResult {
  if (standing.kind === "waiting") return { ok: false, error: WAITING, isDuplicate: true };
  if (standing.kind === "member") return { ok: false, error: ALREADY_MEMBER, isDuplicate: true, signIn: true };
  if (standing.kind === "moved") return { ok: false, error: MOVED, isDuplicate: true };
  return { ok: true };
}

/**
 * Before the card step: can this email apply? So a member or someone already waiting is told before they enter a
 * card. submitApplication checks again (this is only the early answer).
 */
export async function checkApplicant(rawEmail: string): Promise<ApplicantCheckResult> {
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (!email) return { ok: true };
  try {
    return refusal(await applicantStanding(email));
  } catch (err) {
    // The submit checks again; a lookup that failed here does not stop the form.
    console.error("checkApplicant failed:", err);
    return { ok: true };
  }
}

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
      payment_method_types: ["card", "link"],
      // Attempt authentication now, while the applicant is present, so the
      // off-session charge at approval time is far less likely to need
      // further authentication from them.
      usage: "off_session",
    });

    if (!setupIntent.client_secret) {
      return { success: false, error: "We couldn’t start card setup. Have another go." };
    }

    return { success: true, clientSecret: setupIntent.client_secret };
  } catch (err) {
    console.error("createCardSetupIntent error:", err);
    return { success: false, error: "We couldn’t start card setup. Have another go." };
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
      error: "Add your card to apply. You won’t be charged until you’re approved.",
    };
  }

  const fullName = formData.get("full_name") as string;
  // Normalized once, up front, so this exact canonical form is what gets
  // sent to Stripe and stored in the DB, matching what the
  // applications_email_unique_active index compares against
  // (lower(email)), so "Test@Example.com" and "test@example.com" are
  // recognized as the same applicant.
  const email = (formData.get("email") as string).trim().toLowerCase();

  // Who is applying (lib/server/rejoin.ts), before anything is made in Stripe: someone waiting or a current member
  // is told so; an ended member applies again, their old approved application superseded below.
  let standing: ApplicantStanding;
  try {
    standing = await applicantStanding(email);
  } catch (err) {
    console.error("submitApplication: who is applying failed:", err);
    return {
      success: false,
      error: `We couldn’t send your application. Have another go, or email ${CONTACT_EMAIL} if it keeps happening.`,
    };
  }
  const refused = refusal(standing);
  if (!refused.ok) return { success: false, error: refused.error, isDuplicate: true, signIn: refused.signIn };

  let stripeCustomerId: string;

  try {
    const customer = await stripe.customers.create(
      {
        name: fullName,
        email,
        payment_method: paymentMethodId,
        invoice_settings: { default_payment_method: paymentMethodId },
      },
      // One saved card makes one customer, even if the form is sent twice.
      { idempotencyKey: `apply-customer-${paymentMethodId}` },
    );
    stripeCustomerId = customer.id;
  } catch (err) {
    console.error("Stripe customer creation error:", err);
    return {
      success: false,
      error: "We couldn’t save your card. Have another go.",
    };
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );

    // An ended member applying again: their old approved application stops holding the email (kept, marked
    // superseded) so the new one can go in; put back if the new one does not.
    const supersede = standing.kind === "rejoin" ? standing.supersede : null;
    let superseded = false;
    if (supersede) {
      const { data: marked, error: markError } = await supabase
        .from("applications")
        .update({ superseded_at: new Date().toISOString() })
        .eq("id", supersede)
        .eq("status", "approved")
        .is("superseded_at", null)
        .select("id");
      if (markError) {
        console.error("submitApplication: superseding the old application failed:", markError);
        return {
          success: false,
          error: `We couldn’t send your application. Have another go, or email ${CONTACT_EMAIL} if it keeps happening.`,
        };
      }
      superseded = Boolean(marked?.length);
    }

    const { data: inserted, error } = await supabase.from("applications").insert({
      full_name: fullName,
      email,
      phone: formData.get("phone") as string,
      employer: formData.get("employer") as string,
      role_title: formData.get("role_title") as string,
      linkedin_url: formData.get("linkedin_url") as string,
      instagram_username: formData.get("instagram_username") as string,
      stripe_customer_id: stripeCustomerId,
      stripe_payment_method_id: paymentMethodId,
    }).select("id").single();

    if (error) {
      console.error("submitApplication insert error:", error);
      if (superseded && supersede) {
        const { error: undoError } = await supabase.from("applications").update({ superseded_at: null }).eq("id", supersede);
        if (undoError) console.error(`submitApplication: putting application ${supersede} back failed:`, undoError);
      }

      if (error.code === "23505") {
        return {
          success: false,
          error: WAITING,
          isDuplicate: true,
        };
      }

      return {
        success: false,
        error: `We couldn’t send your application. Have another go, or email ${CONTACT_EMAIL} if it keeps happening.`,
      };
    }

    // "Thanks for applying" to the applicant (C-D3) and one alert to the
    // club (C-D7), after the response. Never fails the application.
    const applicationId = inserted?.id as string | undefined;
    if (applicationId) {
      after(() => sendApplicationEmails(applicationId));
    }

    return { success: true };
  } catch (err) {
    console.error("submitApplication unexpected error:", err);
    return {
      success: false,
      error: `We couldn’t send your application. Have another go, or email ${CONTACT_EMAIL} if it keeps happening.`,
    };
  }
}
