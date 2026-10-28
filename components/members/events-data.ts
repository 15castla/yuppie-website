import { unstable_cache } from "next/cache";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { EVENT_COLUMNS, type Event } from "./event-types";

// The members area also reads whether the club cancelled an event (B-D8) and when it last moved it (C-D11).
// Kept here rather than in event-types.ts, whose EVENT_COLUMNS the admin pages read too.
export type MemberEvent = Event & {
  cancelled_at: string | null;
  cancel_note: string | null;
  changed_at: string | null;
};
const MEMBER_EVENT_COLUMNS = `${EVENT_COLUMNS}, cancelled_at, cancel_note, changed_at`;

// Events are shared catalog content, identical for every member, and only
// changed by editing the events table directly in Supabase (no in-app admin
// UI for it exists), not something that needs to be fresh on every single
// request. Cached for 60s rather than hitting Supabase fresh on every page
// load/prefetch, which was most of this route's ~1s loading gap. There's
// no on-demand revalidateTag() call anywhere since there's no in-app write
// path to trigger one from; 60s is just a reasonable staleness bound. If an
// in-app way to edit events is ever added, that action should call
// revalidateTag("events") so edits show up immediately instead of waiting
// out the window. bookedCount ("spots left") is NOT cached here, since that
// genuinely changes as members book, so it's still fetched fresh by
// whichever page needs it.
//
// unstable_cache has no effect in `next dev` (Next always renders on-demand
// there), only visible via `next build && next start` or in production.
const getCachedAllEvents = unstable_cache(
  async () => {
    const adminClient = createAdminSupabaseClient();
    const { data, error } = await adminClient
      .from("events")
      .select(MEMBER_EVENT_COLUMNS)
      .order("start_time", { ascending: true });

    if (error) {
      console.error("Failed to load events:", error);
    }

    return (data ?? []) as MemberEvent[];
  },
  // v2: the rows now carry cancelled_at (a cached v1 entry would not).
  ["events-list-v2"],
  { tags: ["events"], revalidate: 60 },
);

export function hasEventStarted(event: Pick<Event, "start_time">, now = Date.now()) {
  // start_time is a timestamptz, returned as an ISO string with an offset,
  // so this is a real instant-to-instant comparison, not a display-time
  // one (display formatting uses EVENT_TIME_ZONE in ui.tsx).
  return new Date(event.start_time).getTime() <= now;
}

// What members see: only events that haven't started yet, and not the ones
// the club cancelled (booking them is refused; the event page itself still
// opens from an old link and says it is cancelled). Filtered here,
// after the cache, rather than inside the cached query, so the cut-off is
// the current moment rather than whenever the cache was last filled (up
// to 60s earlier). Admin pages query the events table directly and still
// see past events. getCachedEventBySlug below deliberately doesn't filter:
// an old link to a past event still opens it, with booking disabled.
export async function getCachedEvents() {
  const now = Date.now();
  return (await getCachedAllEvents()).filter((event) => !hasEventStarted(event, now) && !event.cancelled_at);
}

// Which upcoming events have no spots left, for the "Fully booked" pill on the
// Events list. A head count of confirmed bookings per event (an aggregate
// across all members, so the service-role client, same as bookedCount on the
// event page), compared with the event's capacity. Cached for the same 60s as
// the list: the pill is a hint, and the event page and the booking itself
// re-check capacity live (see booking-capacity.ts). One count per upcoming
// event, inside the cache, so it costs a handful of light queries a minute,
// not per page view. Never throws: if it fails, no pill is drawn and the
// list is unchanged.
const getCachedFullEventIds = unstable_cache(
  async () => {
    try {
      const adminClient = createAdminSupabaseClient();
      const { data: upcoming } = await adminClient
        .from("events")
        .select("id, capacity")
        .gte("start_time", new Date().toISOString())
        .is("cancelled_at", null);
      const checked = await Promise.all(
        (upcoming ?? []).map(async (event) => {
          if (!event.capacity || event.capacity <= 0) return null;
          const { count, error } = await adminClient
            .from("bookings")
            .select("*", { count: "exact", head: true })
            .eq("event_id", event.id)
            .eq("status", "confirmed");
          if (error) return null;
          return (count ?? 0) >= event.capacity ? (event.id as string) : null;
        }),
      );
      return checked.filter((id): id is string => id !== null);
    } catch (error) {
      console.error("Failed to work out which events are full:", error);
      return [] as string[];
    }
  },
  ["events-full-ids"],
  { tags: ["events"], revalidate: 60 },
);

export function getFullEventIds() {
  return getCachedFullEventIds();
}

export const getCachedEventBySlug = unstable_cache(
  async (slug: string) => {
    const adminClient = createAdminSupabaseClient();
    const { data } = await adminClient
      .from("events")
      .select(MEMBER_EVENT_COLUMNS)
      .eq("slug", slug)
      .maybeSingle();

    return (data as MemberEvent | null) ?? null;
  },
  // v2: the row now carries cancelled_at, cancel_note and changed_at.
  ["event-by-slug-v2"],
  { tags: ["events"], revalidate: 60 },
);
