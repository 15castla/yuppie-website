"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { stripe } from "@/lib/stripe";
import { requireMember } from "../require-member";

export async function rsvpToEvent(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const member = await requireMember();
  const eventId = formData.get("event_id");

  if (typeof eventId !== "string" || !eventId) {
    return { success: false, error: "Missing event." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("bookings")
    .insert({ member_id: member.id, event_id: eventId, status: "confirmed" });

  if (error) {
    console.error(`rsvpToEvent failed for member ${member.id}, event ${eventId}:`, error);
    return {
      success: false,
      error: "Something went wrong booking your spot. Please try again.",
    };
  }

  revalidatePath("/members");
  revalidatePath("/members/profile");
  return { success: true };
}

export type CreateEventPaymentIntentResult =
  | { success: true; clientSecret: string }
  | { success: false; error: string };

// Embedded payment flow, replacing the old Stripe Checkout redirect
// (createEventCheckoutSession). Reads the event straight from the table
// (not getCachedEventBySlug) since price and title need to be current at
// the moment of charging, not whatever was cached up to 60s ago. The
// actual booking row only gets created by the webhook
// (app/api/stripe/webhook/route.ts) once Stripe confirms the payment
// succeeded, not here: this action only ever gets as far as handing back
// a PaymentIntent client secret for the on-page Payment Element to use.
export async function createEventPaymentIntent(
  formData: FormData,
): Promise<CreateEventPaymentIntentResult> {
  const member = await requireMember();
  const eventId = formData.get("event_id");

  if (typeof eventId !== "string" || !eventId) {
    return { success: false, error: "Missing event." };
  }

  const adminClient = createAdminSupabaseClient();
  const { data: event } = await adminClient
    .from("events")
    .select("title, price_pence")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    return { success: false, error: "That event couldn't be found." };
  }

  // Never trust the client on this: a free event's button should already
  // call rsvpToEvent instead, but the price is what actually decides
  // whether a charge happens, not which button was clicked.
  if (!event.price_pence) {
    return { success: false, error: "This event doesn't require payment." };
  }

  if (!member.stripe_customer_id) {
    console.error(`createEventPaymentIntent: member ${member.id} has no stripe_customer_id`);
    return {
      success: false,
      error: "No payment details on file for your account. Please contact us.",
    };
  }

  const supabase = await createClient();
  const { data: existingBooking } = await supabase
    .from("bookings")
    .select("id")
    .eq("member_id", member.id)
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .maybeSingle();

  if (existingBooking) {
    return { success: false, error: "You're already booked in for this event." };
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: event.price_pence,
      currency: "gbp",
      customer: member.stripe_customer_id,
      description: event.title,
      automatic_payment_methods: { enabled: true },
      metadata: { member_id: member.id, event_id: eventId },
    });

    if (!paymentIntent.client_secret) {
      console.error(`createEventPaymentIntent: PaymentIntent ${paymentIntent.id} has no client_secret`);
      return {
        success: false,
        error: "Something went wrong starting payment. Please try again.",
      };
    }

    return { success: true, clientSecret: paymentIntent.client_secret };
  } catch (err) {
    console.error(`createEventPaymentIntent failed for member ${member.id}, event ${eventId}:`, err);
    return {
      success: false,
      error: "Something went wrong starting payment. Please try again.",
    };
  }
}
