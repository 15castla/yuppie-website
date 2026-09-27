"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
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

// Real Stripe Checkout, replacing the old bookPaidEventStub. Reads the
// event straight from the table (not getCachedEventBySlug) since price
// and title need to be current at the moment of charging, not whatever
// was cached up to 60s ago. The actual booking row only gets created by
// the webhook (app/api/stripe/webhook/route.ts) once Stripe confirms the
// payment succeeded, not here: this action only ever gets as far as
// redirecting to Stripe.
export async function createEventCheckoutSession(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const member = await requireMember();
  const eventId = formData.get("event_id");

  if (typeof eventId !== "string" || !eventId) {
    return { success: false, error: "Missing event." };
  }

  const adminClient = createAdminSupabaseClient();
  const { data: event } = await adminClient
    .from("events")
    .select("title, price_pence, slug")
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
    console.error(`createEventCheckoutSession: member ${member.id} has no stripe_customer_id`);
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

  let checkoutUrl: string;

  try {
    // No env var or hardcoded domain for the site origin: this only ever
    // needs to work in production, so the incoming request's own host
    // header is the simplest source of truth for where to send Stripe
    // back to.
    const host = (await headers()).get("host");
    const eventUrl = `https://${host}/members/events/${event.slug}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: member.stripe_customer_id,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            unit_amount: event.price_pence,
            product_data: { name: event.title },
          },
          quantity: 1,
        },
      ],
      metadata: { member_id: member.id, event_id: eventId },
      payment_intent_data: {
        metadata: { member_id: member.id, event_id: eventId },
      },
      success_url: `${eventUrl}?checkout=success`,
      cancel_url: `${eventUrl}?checkout=cancelled`,
    });

    if (!session.url) {
      console.error(`createEventCheckoutSession: Stripe session ${session.id} has no url`);
      return {
        success: false,
        error: "Something went wrong starting checkout. Please try again.",
      };
    }

    checkoutUrl = session.url;
  } catch (err) {
    console.error(`createEventCheckoutSession failed for member ${member.id}, event ${eventId}:`, err);
    return {
      success: false,
      error: "Something went wrong starting checkout. Please try again.",
    };
  }

  // Deliberately outside the try/catch above: redirect() works by
  // throwing internally, and a catch block wrapping it would treat that
  // as a real failure and swallow the redirect instead of letting it
  // happen.
  redirect(checkoutUrl);
}
