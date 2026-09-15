import { cache } from "react";
import { notFound } from "next/navigation";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { EVENT_COLUMNS, type Event } from "@/components/members/event-types";

// Wrapped in React's cache() so the two independent Suspense boundaries in
// page.tsx (main content + RSVP bar, kept separate so the RSVP bar can
// stay a sibling of <main> — see event-detail-view.tsx) share one Supabase
// round-trip per request instead of fetching the same event twice.
export const getEventBySlug = cache(async (slug: string) => {
  // Same rationale as the events list: shared catalog content, read via
  // the service-role client.
  const adminClient = createAdminSupabaseClient();

  const { data: event } = await adminClient
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (!event) {
    notFound();
  }

  const { count: bookedCount } = await adminClient
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("event_id", event.id)
    .eq("status", "confirmed");

  return { event: event as Event, bookedCount: bookedCount ?? 0 };
});
