"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import type { Event, EventCategory } from "./event-types";
import { EventRowList } from "./event-row";
import {
  CARD_CLASS,
  CATEGORY_LABEL,
  eventMonthGroup,
  EYEBROW_CLASS,
  MEMBERS_MAIN_CLASS,
  fadeIn,
} from "./ui";
import { cn } from "@/lib/utils";

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
  const fade = (delay: number) => fadeIn(reduce, delay);

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

                <EventRowList
                  events={group.events}
                  bookedEventIds={bookedEvents}
                  showThumbnails
                />
              </section>
            ))
          )}
        </motion.div>
      </div>
    </main>
  );
}
