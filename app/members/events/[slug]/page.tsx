import { notFound } from "next/navigation";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { requireMember } from "@/app/members/require-member";
import { loadMyBooking } from "@/app/members/events/my-booking";
import { paidNotBookedFor } from "@/app/members/events/paid-not-booked";
import { getCachedEventBySlug, hasEventStarted } from "@/components/members/events-data";
import { EventPageView } from "@/components/members/event/event-page-view";
import { toPageBooking, type ClubCancelledBooking, type EventPageData, type PaymentReturn } from "@/components/members/event/model";
import { FREE_CANCEL_HOURS, freeCancelUntil } from "@/lib/server/bookings";

// The event page (r2a sections 1 to 5). Everything that decides what the member may do is worked out here, on
// the server, for this request: whether the event has started, how many are booked, the member's own confirmed
// booking with the exact address (A-D3: only then; loadMyBooking reads it through the server), whether
// cancelling is free now (48 hours, A-D1 B; or the club moved it, C-D11), whether the club cancelled it, and
// whether a payment of this member's for it went through without becoming a booking ("Paid, but not booked
// yet.", which must survive a reload: paid-not-booked.ts).
// The view (components/members/event/event-page-view.tsx) is a pure component of this.
/** Now, on the server, is before this moment. */
function isStillBefore(moment: Date): boolean {
  return Date.now() < moment.getTime();
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ payment_intent?: string; payment_intent_client_secret?: string; redirect_status?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const member = await requireMember();
  const event = await getCachedEventBySlug(slug);
  if (!event) notFound();

  const db = createAdminSupabaseClient();
  const started = hasEventStarted(event);
  // The booked count is an aggregate across every member (the service-role client, never cached: spots change).
  const [{ count: bookedCount }, myBooking, cancelledMine, paidAlready] = await Promise.all([
    db.from("bookings").select("*", { count: "exact", head: true }).eq("event_id", event.id).eq("status", "confirmed"),
    loadMyBooking(member.id, event.id),
    event.cancelled_at
      ? db
          .from("bookings")
          .select("amount_pence, refund_status")
          .eq("member_id", member.id)
          .eq("event_id", event.id)
          .eq("status", "cancelled")
          .eq("cancel_reason", "event_cancelled")
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Only a paid, open event can be in this state (and only without a booking: checked below).
    !event.cancelled_at && !started && (event.price_pence ?? 0) > 0 ? paidNotBookedFor(member.id, event.id) : Promise.resolve(null),
  ]);

  const paidNotBooked = !myBooking && Boolean(paidAlready);

  const freeUntil = freeCancelUntil(event.start_time);
  const clubCancelled: ClubCancelledBooking | null = cancelledMine.data
    ? {
        amountPence: cancelledMine.data.amount_pence ?? 0,
        refunded: cancelledMine.data.refund_status === "succeeded" || cancelledMine.data.refund_status === "pending",
      }
    : null;

  // Back from the bank (a redirect-based check or a wallet): Stripe adds these to the return address. The view
  // checks the payment with the server (confirmEventPayment), never with what the address says.
  const paymentReturn: PaymentReturn | null =
    query.payment_intent && query.payment_intent_client_secret && query.redirect_status
      ? { paymentIntentId: query.payment_intent, clientSecret: query.payment_intent_client_secret, redirectStatus: query.redirect_status }
      : null;

  const data: EventPageData = {
    event: {
      id: event.id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      category: event.category,
      location: event.location,
      startTime: event.start_time,
      endTime: event.end_time,
      pricePence: event.price_pence ?? 0,
      capacity: event.capacity ?? 0,
      imageUrl: event.image_url,
      focalX: event.image_focal_x ?? 50,
      focalY: event.image_focal_y ?? 50,
      cancelledAt: event.cancelled_at,
      cancelNote: event.cancel_note,
    },
    bookedCount: bookedCount ?? 0,
    booking: myBooking && !event.cancelled_at ? toPageBooking(myBooking) : null,
    started,
    freeUntil: freeUntil.toISOString(),
    freeCancelHours: FREE_CANCEL_HOURS,
    freeWindowOpen: isStillBefore(freeUntil),
    memberEmail: member.email,
    clubCancelled,
    paymentReturn,
    paidNotBooked,
  };

  return <EventPageView data={data} />;
}
