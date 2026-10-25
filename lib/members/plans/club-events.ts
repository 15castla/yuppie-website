// The club events a member has booked, for Your plans. Real data: the member's
// own confirmed bookings, read through the member-scoped client (the same
// join the removed Home page used for "Your upcoming plans", and the same
// rules as the Events list): only confirmed bookings, "upcoming" is an event
// that has not started (start_time after now), "past" is one that has.
//
// Server only (it takes the request's Supabase client). The page calls it
// and passes plain rows to the view.

import type { SupabaseClient } from "@supabase/supabase-js";

import { EVENT_COLUMNS, type Event } from "@/components/members/event-types";
import { eventHref } from "@/lib/members/routes";
import type { ClubEventPlan, PlansWhen } from "./types";

// More than any member has in a year; keeps a pathological account from
// pulling thousands of rows.
const LIMIT = 200;

type BookingRow = { id: string; event: Event | Event[] | null };

export async function listClubEventPlans(
  supabase: SupabaseClient,
  memberId: string,
  when: PlansWhen,
  now: Date = new Date(),
): Promise<ClubEventPlan[]> {
  const nowIso = now.toISOString();
  const query = supabase
    .from("bookings")
    // Only confirmed bookings: anything else isn't "Booked".
    .select(`id, event:events!inner(${EVENT_COLUMNS})`)
    .eq("member_id", memberId)
    .eq("status", "confirmed");

  const { data, error } = await (
    when === "upcoming"
      ? query.gt("event.start_time", nowIso)
      : query.lte("event.start_time", nowIso)
  )
    .order("start_time", { referencedTable: "events", ascending: when === "upcoming" })
    .limit(LIMIT);

  if (error) {
    console.error(`Failed to load ${when} plans for member ${memberId}:`, error);
  }

  const plans: ClubEventPlan[] = [];
  for (const row of (data ?? []) as unknown as BookingRow[]) {
    const event = Array.isArray(row.event) ? row.event[0] : row.event;
    if (!event) continue;
    plans.push({
      kind: "club-event",
      id: row.id,
      href: eventHref(event.slug),
      startsAt: event.start_time,
      title: event.title,
      place: event.location,
      pill: when === "past" ? "went" : event.price_pence ? "booked" : "included",
    });
  }

  // The query orders them; sorting again keeps the page right whatever the
  // database does with ties.
  plans.sort((a, b) =>
    when === "upcoming"
      ? new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
      : new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
  );
  return plans;
}
