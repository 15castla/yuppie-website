import { notFound } from "next/navigation";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { getCachedEventBySlug } from "@/components/members/events-data";
import { EventDetailView } from "@/components/members/event-detail-view";

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ payment_intent_client_secret?: string; redirect_status?: string }>;
}) {
  const { slug } = await params;
  const { payment_intent_client_secret, redirect_status } = await searchParams;
  // Set only when Stripe has redirected the browser back here (Apple Pay,
  // some 3D Secure checks) rather than confirming the payment in place:
  // this reopens the payment modal with the same PaymentIntent so
  // EventPaymentForm's own redirect-return handling can pick up where it
  // left off. A normal first visit to this page has neither param.
  const initialClientSecret =
    redirect_status && payment_intent_client_secret ? payment_intent_client_secret : null;

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
      initialClientSecret={initialClientSecret}
    />
  );
}
