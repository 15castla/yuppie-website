import { notFound } from "next/navigation";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { getCachedEventBySlug } from "@/components/members/events-data";
import { EventDetailView } from "@/components/members/event-detail-view";

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { slug } = await params;
  const { checkout } = await searchParams;
  const initialCheckoutStatus = checkout === "success" || checkout === "cancelled" ? checkout : null;

  const event = await getCachedEventBySlug(slug);

  if (!event) {
    notFound();
  }

  // Booked count is an aggregate across all members, not this member's own
  // data, so it's read via the service-role client like the event row
  // above, but NOT cached (unlike getCachedEventBySlug), since "spots
  // left" genuinely changes as members book and should stay accurate.
  const adminClient = createAdminSupabaseClient();
  const { count: bookedCount } = await adminClient
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("event_id", event.id)
    .eq("status", "confirmed");

  return (
    <EventDetailView
      event={event}
      bookedCount={bookedCount ?? 0}
      initialCheckoutStatus={initialCheckoutStatus}
    />
  );
}
