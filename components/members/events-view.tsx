"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import type { Event, EventCategory } from "./event-types";
import {
  CARD_CLASS,
  CATEGORY_LABEL,
  EventThumbnail,
  EYEBROW_CLASS,
  PricePill,
  formatEventDayTime,
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

export function EventsView({ events }: { events: Event[] }) {
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

  return (
    <main className="relative z-10 flex flex-1 flex-col px-4 pt-28 pb-[130px] sm:px-6 sm:pt-32 md:pb-20">
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

        <motion.div {...fade(0.3)} className="flex flex-col gap-4">
          {filteredEvents.length === 0 ? (
            <div className={`${CARD_CLASS} p-8 text-center`}>
              <p className="text-sm text-foreground-muted">
                Nothing matches that filter yet.
              </p>
            </div>
          ) : (
            filteredEvents.map((event) => (
              <Link
                key={event.id}
                href={`/members/events/${event.id}`}
                className={cn(
                  CARD_CLASS,
                  "overflow-hidden transition-colors hover:border-foreground/25",
                )}
              >
                <EventThumbnail
                  category={event.category}
                  className="h-32 w-full"
                  iconClassName="h-14 w-14"
                />
                <div className="flex flex-col gap-1 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold text-foreground">{event.title}</p>
                    <PricePill pricePence={event.price_pence} />
                  </div>
                  <p className="text-xs text-foreground-muted">
                    {formatEventDayTime(event.start_time)}
                    {event.location ? ` · ${event.location}` : ""}
                  </p>
                </div>
              </Link>
            ))
          )}
        </motion.div>
      </div>
    </main>
  );
}
