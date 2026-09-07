"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

// No Stripe Checkout/PaymentIntent flow exists yet for event bookings —
// stripe_payment_intent_id is a column on bookings, but nothing populates
// it anywhere in this codebase. This stub keeps the paid-event button real
// in the UI without pretending to charge anyone; wiring it up for real
// needs its own scoping pass.
export async function bookPaidEventStub(
  formData: FormData,
): Promise<{ success: boolean; message: string }> {
  const member = await requireMember();
  const eventId = formData.get("event_id");

  console.log(
    `bookPaidEventStub: member ${member.id} attempted to book paid event ${String(eventId)} — no payment flow wired up yet.`,
  );

  return {
    success: false,
    message: "Booking with payment isn't live yet.",
  };
}
