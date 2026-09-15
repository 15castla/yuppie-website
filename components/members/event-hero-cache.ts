import { useSyncExternalStore } from "react";

import type { Event } from "./event-types";

// The events list already has everything the detail page's hero (thumbnail,
// category badge, title) needs to render — no need to wait on the detail
// page's own Supabase fetch just to paint the same three fields again. The
// list populates this as it renders; the detail page's hero reads it via
// useEventHero() below, decoupled from its own data fetch, so the shared
// view-transition element exists immediately instead of only once the
// fetch resolves.
//
// Reactive (not just a plain Map) because a direct/deep link to a detail
// page has nothing cached from a list visit — EventDetailBody backfills
// this cache once ITS OWN fetch resolves (see its effect), and the hero
// needs to pick that up after the fact, not just on its first render.
export type EventHero = Pick<Event, "slug" | "title" | "category" | "start_time">;

const cache = new Map<string, EventHero>();
const listeners = new Map<string, Set<() => void>>();

export function cacheEventHero(event: EventHero) {
  cache.set(event.slug, event);
  listeners.get(event.slug)?.forEach((listener) => listener());
}

export function getCachedEventHero(slug: string): EventHero | undefined {
  return cache.get(slug);
}

function subscribe(slug: string, onStoreChange: () => void) {
  if (!listeners.has(slug)) listeners.set(slug, new Set());
  const slugListeners = listeners.get(slug)!;
  slugListeners.add(onStoreChange);
  return () => {
    slugListeners.delete(onStoreChange);
  };
}

export function useEventHero(slug: string): EventHero | undefined {
  return useSyncExternalStore(
    (onStoreChange) => subscribe(slug, onStoreChange),
    () => getCachedEventHero(slug),
    () => getCachedEventHero(slug),
  );
}
