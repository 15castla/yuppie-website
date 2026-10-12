import { notFound } from "next/navigation";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/app/members/require-member";
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
  //
  // Whether this member is already booked is their own row, so that one
  // goes through the member-scoped client (same query as the duplicate
  // check in app/members/events/actions.ts). It's what lets the button
  // show "Booked" on any later visit, not just right after booking.
  const member = await requireMember();
  const adminClient = createAdminSupabaseClient();
  const supabase = await createClient();
  const [{ count: bookedCount }, { data: memberBooking }] = await Promise.all([
    adminClient
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("status", "confirmed"),
    supabase
      .from("bookings")
      .select("id")
      .eq("member_id", member.id)
      .eq("event_id", event.id)
      .eq("status", "confirmed")
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <EventDetailView
      event={event}
      bookedCount={bookedCount ?? 0}
      initialBooked={Boolean(memberBooking)}
      initialClientSecret={initialClientSecret}
    />
  );
}
