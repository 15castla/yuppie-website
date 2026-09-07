import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { EVENT_COLUMNS, type Event } from "@/components/members/event-types";
import { EventsView } from "@/components/members/events-view";

export default async function MembersEventsPage() {
  // Events are shared catalog content, identical for every member, not
  // member-scoped data — read via the service-role client rather than the
  // RLS-scoped per-member one used elsewhere in this area for a member's
  // own rows (bookings, profile).
  const adminClient = createAdminSupabaseClient();
  const { data, error } = await adminClient
    .from("events")
    .select(EVENT_COLUMNS)
    .order("start_time", { ascending: true });

  if (error) {
    console.error("Failed to load events:", error);
  }

  return <EventsView events={(data ?? []) as Event[]} />;
}
