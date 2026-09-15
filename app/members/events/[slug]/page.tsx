import { notFound } from "next/navigation";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { EVENT_COLUMNS, type Event } from "@/components/members/event-types";
import { EventDetailView } from "@/components/members/event-detail-view";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Same rationale as the events list: shared catalog content, read via
  // the service-role client. The booked count is likewise an aggregate
  // across all members, not this member's own data, so it's read the
  // same way rather than through the RLS-scoped per-member client.
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

  return <EventDetailView event={event as Event} bookedCount={bookedCount ?? 0} />;
}
