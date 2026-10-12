import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/app/members/require-member";
import { getCachedEvents } from "@/components/members/events-data";
import { EventsView } from "@/components/members/events-view";

export default async function MembersEventsPage() {
  // The member's own confirmed bookings, through the member-scoped client
  // (same query as the detail page's memberBooking), so each card can show
  // "Booked" in place of its price. Passed down as a plain array: a Set
  // can't cross the server/client boundary.
  const member = await requireMember();
  const supabase = await createClient();
  const [events, { data: bookings }] = await Promise.all([
    getCachedEvents(),
    supabase
      .from("bookings")
      .select("event_id")
      .eq("member_id", member.id)
      .eq("status", "confirmed"),
  ]);

  const bookedEventIds = (bookings ?? []).map((booking) => booking.event_id as string);

  return <EventsView events={events} bookedEventIds={bookedEventIds} />;
}
