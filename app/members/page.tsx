import { createClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { EVENT_COLUMNS, type Event } from "@/components/members/event-types";
import { requireMember } from "./require-member";
import { HomeView, type UpcomingBooking } from "@/components/members/home-view";

export default async function MembersHomePage() {
  const member = await requireMember();
  const supabase = await createClient();
  const adminClient = createAdminSupabaseClient();
  const nowIso = new Date().toISOString();

  const [{ data: bookingsData, error }, { data: bookedData }, { count: upcomingCount }] =
    await Promise.all([
      // Only confirmed bookings: anything else isn't "Booked".
      supabase
        .from("bookings")
        .select(`id, status, event:events!inner(${EVENT_COLUMNS})`)
        .eq("member_id", member.id)
        .eq("status", "confirmed")
        .gte("event.start_time", nowIso)
        .order("start_time", { referencedTable: "events", ascending: true })
        .limit(2),
      // Every event this member has a confirmed booking for (their own rows,
      // through the member-scoped client, same as app/members/events/page.tsx),
      // so "Picked for you" never suggests one they're already going to.
      supabase
        .from("bookings")
        .select("event_id")
        .eq("member_id", member.id)
        .eq("status", "confirmed"),
      // Whether any upcoming events exist at all, so an empty "Picked for
      // you" can say "booked on everything" rather than "nothing lined up".
      adminClient
        .from("events")
        .select("id", { count: "exact", head: true })
        .gte("start_time", nowIso),
    ]);

  if (error) {
    console.error(`Failed to load upcoming bookings for member ${member.id}:`, error);
  }

  // The next 2 upcoming events the member hasn't booked. Excluded in the
  // query itself (rather than fetching 2 and filtering), so it still finds
  // 2 when the member has booked several of the soonest. Same
  // shared-catalog rationale as app/members/events/page.tsx: read via the
  // service-role client.
  const bookedEventIds = (bookedData ?? []).map((booking) => booking.event_id as string);
  let pickedQuery = adminClient
    .from("events")
    .select(EVENT_COLUMNS)
    .gte("start_time", nowIso)
    .order("start_time", { ascending: true })
    .limit(2);
  if (bookedEventIds.length > 0) {
    pickedQuery = pickedQuery.not("id", "in", `(${bookedEventIds.join(",")})`);
  }
  const { data: pickedEventsData } = await pickedQuery;

  const upcomingBookings = (bookingsData ?? []) as unknown as UpcomingBooking[];
  const pickedEvents = (pickedEventsData ?? []) as Event[];

  return (
    <HomeView
      member={member}
      upcomingBookings={upcomingBookings}
      pickedEvents={pickedEvents}
      hasUpcomingEvents={(upcomingCount ?? 0) > 0}
    />
  );
}
