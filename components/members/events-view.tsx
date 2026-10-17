"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles, Sun, Trophy, type LucideIcon } from "lucide-react";

import type { Event, EventCategory } from "./event-types";
import {
  CARD_CLASS,
  CATEGORY_LABEL,
  EventThumbnail,
  eventFocalPoint,
  eventMonthGroup,
  EYEBROW_CLASS,
  MEMBERS_MAIN_CLASS,
  PricePill,
  formatDayNumber,
  formatEventTime,
  formatWeekdayShort,
} from "./ui";
import { cn } from "@/lib/utils";

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

type Filter = "All" | "This week" | "Included" | EventCategory;
const CATEGORY_FILTERS: EventCategory[] = ["sport", "entertainment", "personal_progression"];
const FILTERS: Filter[] = ["All", "This week", "Included", ...CATEGORY_FILTERS];

function filterLabel(filter: Filter) {
  if (filter === "All" || filter === "This week" || filter === "Included") return filter;
  return CATEGORY_LABEL[filter];
}

function matchesFilter(event: Event, filter: Filter) {
  switch (filter) {
    case "All":
      return true;
    case "This week": {
      const daysAway =
        (new Date(event.start_time).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return daysAway >= 0 && daysAway <= 7;
    }
    case "Included":
      return !event.price_pence;
    default:
      return event.category === filter;
  }
}

// Shown in place of a photo in a row's thumbnail.
const CATEGORY_ICON: Record<EventCategory, LucideIcon> = {
  sport: Trophy,
  entertainment: Sparkles,
  personal_progression: Sun,
};

// A row's small thumbnail. Still a 16:9 crop (88x50), so the focal point
// set at /admin/events carries over. With no photo, a plain cream tile
// with the category's icon rather than EventThumbnail's yellow gradient
// (which admin and the event page still use).
function EventRowThumbnail({ event }: { event: Event }) {
  const Icon = CATEGORY_ICON[event.category];
  return (
    <div className="h-[50px] w-[88px] shrink-0 overflow-hidden rounded-[10px]">
      {event.image_url ? (
        <EventThumbnail
          category={event.category}
          imageUrl={event.image_url}
          focalPoint={eventFocalPoint(event)}
          showCategoryBadge={false}
          className="h-full w-full"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-cream">
          <Icon aria-hidden className="h-5 w-5 text-foreground/55" strokeWidth={1.8} />
        </div>
      )}
    </div>
  );
}

// Events in date order, grouped by calendar month (London time).
function groupByMonth(events: Event[]) {
  const groups: { key: string; label: string; events: Event[] }[] = [];
  const sorted = [...events].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );
  for (const event of sorted) {
    const { key, label } = eventMonthGroup(event.start_time);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.events.push(event);
    else groups.push({ key, label, events: [event] });
  }
  return groups;
}

export function EventsView({
  events,
  bookedEventIds,
}: {
  events: Event[];
  bookedEventIds: string[];
}) {
  const bookedEvents = useMemo(() => new Set(bookedEventIds), [bookedEventIds]);
  const reduce = useReducedMotion();
  const fade = (delay: number) => ({
    initial: reduce ? false : { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: 0.8, delay, ease: EASE_OUT_EXPO },
  });

  const [filter, setFilter] = useState<Filter>("All");
  const filteredEvents = useMemo(
    () => events.filter((event) => matchesFilter(event, filter)),
    [events, filter],
  );
  const monthGroups = useMemo(() => groupByMonth(filteredEvents), [filteredEvents]);

  return (
    <main className={MEMBERS_MAIN_CLASS}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <motion.div {...fade(0.1)} className="flex flex-col gap-3">
          <span className={EYEBROW_CLASS}>WHAT&apos;S ON</span>
          <h1 className="text-2xl font-extrabold text-foreground sm:text-3xl optical-trim">
            Events.
          </h1>
        </motion.div>

        <motion.div
          {...fade(0.2)}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-colors",
                filter === item
                  ? "bg-foreground text-background"
                  : "border border-foreground/20 bg-transparent text-foreground",
              )}
            >
              {filterLabel(item)}
            </button>
          ))}
        </motion.div>

        <motion.div {...fade(0.3)} className="flex flex-col gap-6">
          {filteredEvents.length === 0 ? (
            <div className={`${CARD_CLASS} p-8 text-center`}>
              <p className="text-sm text-foreground-muted">
                Nothing matches that filter yet.
              </p>
            </div>
          ) : (
            monthGroups.map((group) => (
              <section key={group.key} className="flex flex-col gap-2.5">
                {/* Count at /70 rather than text-foreground-muted: muted
                    grey on the bare yellow page background fails contrast. */}
                <div className="flex items-baseline justify-between px-1">
                  <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground">
                    {group.label}
                  </h2>
                  <span className="text-[11px] font-bold text-foreground/70">
                    {group.events.length === 1 ? "1 event" : `${group.events.length} events`}
                  </span>
                </div>

                <div className={cn(CARD_CLASS, "overflow-hidden")}>
                  {group.events.map((event, index) => (
                    <div key={event.id}>
                      {/* Inset divider, starting after the date column. */}
                      {index > 0 && <div aria-hidden className="ml-[66px] h-px bg-foreground/[0.08]" />}
                      <Link
                        href={`/members/events/${event.slug}`}
                        className="flex items-center gap-3.5 py-3.5 pl-3 pr-3.5 transition-colors hover:bg-foreground/[0.03]"
                      >
                        <div className="flex w-10 shrink-0 flex-col items-center gap-[3px]">
                          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-foreground-muted">
                            {formatWeekdayShort(event.start_time)}
                          </span>
                          <span className="text-[22px] font-extrabold leading-none text-foreground">
                            {formatDayNumber(event.start_time)}
                          </span>
                        </div>

                        <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
                          <p className="text-[15px] font-bold leading-tight text-foreground">
                            {event.title}
                          </p>
                          <p className="truncate text-xs text-foreground-muted">
                            {formatEventTime(event.start_time)}
                            {event.location ? ` · ${event.location}` : ""}
                          </p>
                          <div className="mt-1 self-start">
                            <PricePill
                              pricePence={event.price_pence}
                              booked={bookedEvents.has(event.id)}
                            />
                          </div>
                        </div>

                        <EventRowThumbnail event={event} />
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </motion.div>
      </div>
    </main>
  );
}
