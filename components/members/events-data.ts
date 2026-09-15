import { unstable_cache } from "next/cache";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { EVENT_COLUMNS, type Event } from "./event-types";

// Events are shared catalog content — identical for every member, and only
// changed by editing the events table directly in Supabase (no in-app admin
// UI for it exists), not something that needs to be fresh on every single
// request. Cached for 60s rather than hitting Supabase fresh on every page
// load/prefetch, which was most of this route's ~1s loading gap — there's
// no on-demand revalidateTag() call anywhere since there's no in-app write
// path to trigger one from; 60s is just a reasonable staleness bound. If an
// in-app way to edit events is ever added, that action should call
// revalidateTag("events") so edits show up immediately instead of waiting
// out the window. bookedCount ("spots left") is NOT cached here — that
// genuinely changes as members book, so it's still fetched fresh by
// whichever page needs it.
//
// unstable_cache has no effect in `next dev` (Next always renders on-demand
// there) — only visible via `next build && next start` or in production.
export const getCachedEvents = unstable_cache(
  async () => {
    const adminClient = createAdminSupabaseClient();
    const { data, error } = await adminClient
      .from("events")
      .select(EVENT_COLUMNS)
      .order("start_time", { ascending: true });

    if (error) {
      console.error("Failed to load events:", error);
    }

    return (data ?? []) as Event[];
  },
  ["events-list"],
  { tags: ["events"], revalidate: 60 },
);

export const getCachedEventBySlug = unstable_cache(
  async (slug: string) => {
    const adminClient = createAdminSupabaseClient();
    const { data } = await adminClient
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("slug", slug)
      .maybeSingle();

    return (data as Event | null) ?? null;
  },
  ["event-by-slug"],
  { tags: ["events"], revalidate: 60 },
);
