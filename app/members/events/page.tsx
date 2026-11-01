import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/app/members/require-member";
import { getCachedEvents, getFullEventIds } from "@/components/members/events-data";
import { EventsView } from "@/components/members/events-view";
import { openInviteOn } from "@/lib/members/flags";
import { detectShellMode } from "@/lib/members/shell-mode";

export default async function MembersEventsPage() {
  // The member's own confirmed bookings, through the member-scoped client
  // (same query as the detail page's memberBooking), so each row can show
  // "Booked" in place of its price, and the "Your plans" block can list the
  // next ones. Passed down as a plain array: a Set can't cross the
  // server/client boundary.
  //
  // "Your plans" is the removed Home page's rule (confirmed bookings, events
  // that have not started, soonest first) read from these same two results:
  // getCachedEvents already holds only upcoming events and bookings holds
  // every confirmed one, so the block can never disagree with the Booked
  // pills, and it costs no extra query.
  const member = await requireMember();
  const supabase = await createClient();
  const [mode, events, fullEventIds, { data: bookings }] = await Promise.all([
    detectShellMode(),
    getCachedEvents(),
    getFullEventIds(),
    supabase
      .from("bookings")
      .select("event_id")
      .eq("member_id", member.id)
      .eq("status", "confirmed"),
  ]);

  const bookedEventIds = (bookings ?? []).map((booking) => booking.event_id as string);

  // The empty state links to Open Invite only where Open Invite is on: the
  // flag, and in the app its own switch too (decision 6).
  return (
    <EventsView
      events={events}
      bookedEventIds={bookedEventIds}
      fullEventIds={fullEventIds}
      openInvite={openInviteOn(mode)}
    />
  );
}
