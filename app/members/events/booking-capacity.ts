import type { SupabaseClient } from "@supabase/supabase-js";

// Shared by rsvpToEvent, createEventPaymentIntent (actions.ts) and the
// Stripe webhook. Not in actions.ts itself because every export of a
// "use server" file becomes a callable server action.
//
// Counted with the service-role client: it's an aggregate across all
// members, which a member-scoped client can't see (same reasoning as
// bookedCount in app/members/events/[slug]/page.tsx).
//
// A check followed by an insert, not an atomic reservation: two requests
// for the last spot at the same instant can both pass. Closing that fully
// needs a database-side guard (a locking function or constraint).
export async function getEventCapacity(
  adminClient: SupabaseClient,
  eventId: string,
): Promise<{ capacity: number; confirmed: number; isFull: boolean } | null> {
  const { data: event } = await adminClient
    .from("events")
    .select("capacity")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return null;

  const { count, error } = await adminClient
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "confirmed");

  if (error) {
    throw error;
  }

  const confirmed = count ?? 0;
  return { capacity: event.capacity, confirmed, isFull: confirmed >= event.capacity };
}
