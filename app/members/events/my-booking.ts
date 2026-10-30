import "server-only";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { eventCalendarHref } from "@/lib/members/routes";
import { cancelTerms } from "@/lib/server/bookings";
import { calendarForMember, getEventAddressForMember } from "@/lib/server/events";

// The member's confirmed booking for an event, with what the booking card shows (A-D3, r2a section 4). Read by
// the event page on the server and by the getMyBooking action after booking. Not in actions.ts because every
// export of a "use server" file becomes a callable server action.

export type MyBooking = {
  bookingId: string;
  amountPence: number;
  bookedAt: string;
  /** The exact address (null until the club has saved one). Only ever sent to a member with this confirmed booking. */
  address: string | null;
  /** The free-cancel deadline (start minus 48 hours), ISO. */
  freeUntil: string;
  /** Cancelling now gives the money back automatically (inside the window, or the club moved the event, C-D11). */
  freeNow: boolean;
  /** The club moved the event after this booking (C-D11). */
  moved: boolean;
  calendarUrl: string;
  /** Google Calendar, filled in (the web shows it under Add to calendar). */
  googleUrl: string | null;
};

/** The member's confirmed booking for an event. Null when not booked. */
export async function loadMyBooking(memberId: string, eventId: string): Promise<MyBooking | null> {
  if (!eventId) return null;
  const db = createAdminSupabaseClient();
  const { data } = await db
    .from("bookings")
    .select("id, amount_pence, booked_at, event:events(slug, start_time, changed_at)")
    .eq("member_id", memberId)
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const event = (Array.isArray(data.event) ? data.event[0] : data.event) as { slug: string; start_time: string; changed_at: string | null } | null;
  if (!event) return null;
  const terms = cancelTerms({ booked_at: data.booked_at }, event);
  const calendar = await calendarForMember(memberId, { id: eventId });
  return {
    bookingId: data.id,
    amountPence: data.amount_pence,
    bookedAt: data.booked_at,
    address: await getEventAddressForMember(memberId, eventId),
    freeUntil: terms.freeUntil.toISOString(),
    freeNow: terms.free,
    moved: terms.why === "changed",
    calendarUrl: eventCalendarHref(event.slug),
    googleUrl: calendar?.googleUrl ?? null,
  };
}
