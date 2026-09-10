"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Calendar, ChevronLeft, MapPin, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Event } from "./event-types";
import {
  CARD_CLASS,
  CATEGORY_LABEL,
  EventThumbnail,
  formatDayNumber,
  formatEventFullDateTime,
  formatMonthAbbrev,
} from "./ui";
import { rsvpToEvent, bookPaidEventStub } from "@/app/members/events/actions";

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Keyed by title rather than id (the real events table's ids are opaque
// UUIDs) — falls back to a generic line for any event not in this list.
const WHATS_INCLUDED: Record<string, string> = {
  "Padel & Pints":
    "Court time, rackets and balls provided, plus your first drink on us afterwards. Just turn up in trainers.",
  "Supper Club: Wine & Charcuterie":
    "The full tasting menu, five wines poured throughout the evening, and a seat at a table full of people worth meeting.",
  "Sunrise Wellness Retreat":
    "A guided yoga session, use of the cold plunge, and coffee and pastries afterwards. Mats provided.",
  "Rooftop Social: End of Summer":
    "Entry, a welcome drink, and the DJ set all night. Dress well, the rooftop's got a dress code.",
};

// Locations that read as a full public venue name (a park, a set of
// courts, a heath) rather than just a neighbourhood — those get the exact
// address up front. Anything else is treated as a private venue whose
// address is only shared once you're booked in.
const PUBLIC_VENUE_KEYWORDS = [
  "park",
  "heath",
  "court",
  "studio",
  "club",
  "hall",
  "garden",
  "square",
  "bridge",
  "museum",
  "gallery",
  "stadium",
  "arena",
  "centre",
  "center",
];

function isPublicVenueName(location: string) {
  const lower = location.toLowerCase();
  return PUBLIC_VENUE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function splitTitleForAccent(title: string) {
  if (title.includes(":")) {
    const [main, ...rest] = title.split(":");
    return { normal: `${main.trim()}:`, accent: rest.join(":").trim() };
  }
  const words = title.trim().split(" ");
  const accent = words.pop() ?? "";
  return { normal: `${words.join(" ")} `, accent };
}

export function EventDetailView({
  event,
  bookedCount,
}: {
  event: Event;
  bookedCount: number;
}) {
  const reduce = useReducedMotion();
  const fade = (delay: number) => ({
    initial: reduce ? false : { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: 0.8, delay, ease: EASE_OUT_EXPO },
  });

  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);

  const spotsLeft = Math.max(event.capacity - bookedCount, 0);
  const { normal, accent } = splitTitleForAccent(event.title);
  const whatsIncluded =
    WHATS_INCLUDED[event.title] ??
    "The full experience, organised and hosted by Yuppie from start to finish.";
  const isFree = !event.price_pence;

  function handleAction(formData: FormData) {
    startTransition(async () => {
      setMessage(null);
      const action = isFree ? rsvpToEvent : bookPaidEventStub;
      const result = await action(formData);

      if ("success" in result && result.success) {
        setBooked(true);
        return;
      }

      setMessage(
        "error" in result && result.error
          ? result.error
          : "message" in result
            ? result.message
            : "Something went wrong. Please try again.",
      );
    });
  }

  return (
    <>
      <main className="relative z-10 flex flex-1 flex-col px-4 pt-8 pb-[150px] sm:px-6 md:pt-28 md:pb-16">
        <motion.div
          {...fade(0.1)}
          className="relative w-full overflow-hidden rounded-2xl border border-foreground/10 md:mx-auto md:max-w-3xl md:mt-6"
        >
          <EventThumbnail
            category={event.category}
            className="h-[220px] w-full md:h-[320px]"
            iconClassName="h-24 w-24 md:h-32 md:w-32"
            showCategoryBadge={false}
          />

          <Link
            href="/members/events"
            className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-cream text-foreground shadow-[0_8px_20px_-8px_rgba(27,21,18,0.5)] transition-transform hover:scale-105"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>

          <div className="absolute right-4 top-4 flex h-[52px] w-[52px] flex-col items-center justify-center rounded-2xl bg-cream shadow-[0_8px_20px_-8px_rgba(27,21,18,0.5)]">
            <span className="text-[9px] font-bold uppercase tracking-wider text-foreground-muted">
              {formatMonthAbbrev(event.start_time)}
            </span>
            <span className="text-lg font-extrabold leading-none text-foreground">
              {formatDayNumber(event.start_time)}
            </span>
          </div>
        </motion.div>

        <div className="relative mx-auto -mt-4 flex w-full max-w-2xl flex-col gap-6 md:max-w-3xl">
          <motion.span
            {...fade(0.15)}
            className="w-fit rounded-full bg-cream px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-foreground shadow-[0_8px_20px_-8px_rgba(27,21,18,0.35)]"
          >
            {CATEGORY_LABEL[event.category]}
          </motion.span>

          <motion.h1
            {...fade(0.2)}
            className="text-[23px] font-extrabold leading-[1.1] text-foreground optical-trim"
          >
            {normal}
            <em className="italic [font-family:var(--font-instrument-serif)] font-normal">
              {accent}
            </em>
          </motion.h1>

          <motion.div {...fade(0.3)} className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-foreground/70" />
              <p className="text-sm text-foreground">
                {formatEventFullDateTime(event.start_time, event.end_time ?? event.start_time)}
              </p>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-foreground/70" />
              <div>
                <p className="text-sm text-foreground">
                  {event.location || "Location TBC"}
                </p>
                {event.location && !isPublicVenueName(event.location) && (
                  <p className="text-xs text-foreground-muted">
                    Exact address sent after booking
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Users className="mt-0.5 h-5 w-5 shrink-0 text-foreground/70" />
              <p className="text-sm text-foreground">
                {spotsLeft} of {event.capacity} spots left
              </p>
            </div>
          </motion.div>

          {event.description && (
            <motion.p {...fade(0.4)} className="text-sm leading-relaxed text-foreground-muted">
              {event.description}
            </motion.p>
          )}

          <motion.div {...fade(0.5)} className={cn(CARD_CLASS, "p-5")}>
            <h2 className="text-sm font-bold text-foreground">What&apos;s included</h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
              {whatsIncluded}
            </p>
          </motion.div>

          {message && (
            <p className="text-sm font-medium text-foreground/70">{message}</p>
          )}
        </div>
      </main>

      <motion.div
        {...fade(0.1)}
        className="fixed left-3.5 right-3.5 bottom-3.5 z-20 rounded-[26px] bg-cream p-2 shadow-[0_10px_20px_-12px_rgba(27,21,18,0.18)] md:static md:z-auto md:mx-auto md:mt-3 md:max-w-3xl md:w-full md:rounded-2xl md:border md:border-foreground/10 md:bg-background-muted md:shadow-none"
      >
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 md:max-w-none">
          <div>
            {isFree ? (
              <p className="text-sm font-bold text-foreground">
                Included in your membership
              </p>
            ) : (
              <>
                <p className="text-lg font-extrabold text-foreground">
                  £{((event.price_pence ?? 0) / 100).toFixed(0)}pp
                </p>
                <p className="text-xs text-foreground-muted">Charged on booking</p>
              </>
            )}
          </div>

          <form action={handleAction}>
            <input type="hidden" name="event_id" value={event.id} />
            <button
              type="submit"
              disabled={isPending || booked}
              className="rounded-full bg-foreground px-8 py-3.5 text-sm font-bold text-background transition-all duration-200 ease-out hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
            >
              {booked ? "You're in" : isPending ? "Booking…" : isFree ? "RSVP" : "Book my spot"}
            </button>
          </form>
        </div>
      </motion.div>
    </>
  );
}
