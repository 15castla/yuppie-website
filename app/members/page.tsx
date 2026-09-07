import { createClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { EVENT_COLUMNS, type Event } from "@/components/members/event-types";
import { requireMember } from "./require-member";
import { HomeView, type UpcomingBooking } from "@/components/members/home-view";

export default async function MembersHomePage() {
  const member = await requireMember();
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [{ data: bookingsData, error }, { data: pickedEventsData }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, status, event:events!inner(id, title, start_time, end_time, location)")
      .eq("member_id", member.id)
      .gte("event.start_time", nowIso)
      .order("start_time", { referencedTable: "events", ascending: true })
      .limit(2),
    // Same shared-catalog rationale as app/members/events/page.tsx — read
    // via the service-role client, not the member-scoped one.
    createAdminSupabaseClient()
      .from("events")
      .select(EVENT_COLUMNS)
      .gte("start_time", nowIso)
      .order("start_time", { ascending: true })
      .limit(2),
  ]);

  if (error) {
    console.error(`Failed to load upcoming bookings for member ${member.id}:`, error);
  }

  const upcomingBookings = (bookingsData ?? []) as unknown as UpcomingBooking[];
  const pickedEvents = (pickedEventsData ?? []) as Event[];

  return (
    <HomeView
      member={member}
      upcomingBookings={upcomingBookings}
      pickedEvents={pickedEvents}
    />
  );
}
