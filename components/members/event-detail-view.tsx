"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Calendar, ChevronLeft, MapPin, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Event } from "./event-types";
import { cacheEventHero, useEventHero } from "./event-hero-cache";
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

// Image + category badge + title — the part of the page that morphs from
// the events list card via matching view-transition-name values (see
// events-view.tsx). Reads the shared hero cache synchronously instead of
// waiting on this page's own Supabase fetch (EventDetailBody/EventRsvpBar
// below), so it's present the instant the route mounts rather than ~1s
// later once data resolves — that's what makes the morph play instead of
// cutting to blank. Falls back to a plain spinner, matching the previous
// full-page loading state, for direct/deep-link visits that never went
// through the list page and so have nothing cached.
export function EventHero({ slug }: { slug: string }) {
  const reduce = useReducedMotion();
  const fade = (delay: number) => ({
    initial: reduce ? false : { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: 0.8, delay, ease: EASE_OUT_EXPO },
  });

  const hero = useEventHero(slug);

  if (!hero) {
    return (
      <div className="flex h-[220px] w-full items-center justify-center md:h-[320px]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
      </div>
    );
  }

  const { normal, accent } = splitTitleForAccent(hero.title);

  return (
    <>
      <motion.div
        {...fade(0.1)}
        className="relative w-full overflow-hidden rounded-2xl border border-foreground/10 md:mx-auto md:max-w-3xl md:mt-6"
      >
        <EventThumbnail
          category={hero.category}
          className="h-[220px] w-full md:h-[320px]"
          iconClassName="h-24 w-24 md:h-32 md:w-32"
          showCategoryBadge={false}
          thumbnailViewTransitionName={`event-thumb-${slug}`}
        />

        <Link
          href="/members/events"
          className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-cream text-foreground shadow-[0_8px_20px_-8px_rgba(27,21,18,0.5)] transition-transform hover:scale-105"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>

        <div className="absolute right-4 top-4 flex h-[52px] w-[52px] flex-col items-center justify-center rounded-2xl bg-cream shadow-[0_8px_20px_-8px_rgba(27,21,18,0.5)]">
          <span className="text-[9px] font-bold uppercase tracking-wider text-foreground-muted">
            {formatMonthAbbrev(hero.start_time)}
          </span>
          <span className="text-lg font-extrabold leading-none text-foreground">
            {formatDayNumber(hero.start_time)}
          </span>
        </div>
      </motion.div>

      <div className="relative mx-auto -mt-4 flex w-full max-w-2xl flex-col gap-6 pb-6 md:max-w-3xl">
        <motion.span
          {...fade(0.15)}
          className="w-fit rounded-full bg-cream px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-foreground shadow-[0_8px_20px_-8px_rgba(27,21,18,0.35)]"
          style={{ viewTransitionName: `event-category-${slug}` }}
        >
          {CATEGORY_LABEL[hero.category]}
        </motion.span>

        <motion.h1
          {...fade(0.2)}
          className="text-[23px] font-extrabold leading-[1.1] text-foreground optical-trim"
          style={{ viewTransitionName: `event-title-${slug}` }}
        >
          {normal}
          <em className="italic [font-family:var(--font-instrument-serif)] font-normal">
            {accent}
          </em>
        </motion.h1>
      </div>
    </>
  );
}

// Meta rows, description and "what's included" — everything below the
// hero that still needs the full fetched event (spots left needs
// bookedCount, which isn't in the hero cache). Unchanged from before the
// hero/body split other than no longer owning the booking error message,
// which moved into EventRsvpBar so that component's state stays
// self-contained rather than needing to be shared across two components
// rendered in different DOM positions (the RSVP bar has to stay a sibling
// of <main>, not nested in it — see the comment in page.tsx).
export function EventDetailBody({
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

  const spotsLeft = Math.max(event.capacity - bookedCount, 0);
  const whatsIncluded =
    WHATS_INCLUDED[event.title] ??
    "The full experience, organised and hosted by Yuppie from start to finish.";

  // Backfills the hero cache from this page's own fetch for direct/deep
  // links that never went through the events list (so never populated it
  // themselves) — EventHero is subscribed via useEventHero() and picks
  // this up reactively once it lands, instead of being stuck showing its
  // spinner fallback forever.
  useEffect(() => {
    cacheEventHero({
      slug: event.slug,
      title: event.title,
      category: event.category,
      start_time: event.start_time,
    });
  }, [event.slug, event.title, event.category, event.start_time]);

  return (
    <div className="relative mx-auto flex w-full max-w-2xl flex-col gap-6 md:max-w-3xl">
      <motion.div {...fade(0.1)} className="flex flex-col gap-4">
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
        <motion.p {...fade(0.2)} className="text-sm leading-relaxed text-foreground-muted">
          {event.description}
        </motion.p>
      )}

      <motion.div {...fade(0.3)} className={cn(CARD_CLASS, "p-5")}>
        <h2 className="text-sm font-bold text-foreground">What&apos;s included</h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          {whatsIncluded}
        </p>
      </motion.div>
    </div>
  );
}

// Mobile fixed bar + desktop static card. Needs the full fetched event
// (price, id) so it can't render any earlier than EventDetailBody, but
// it's a separate component/Suspense boundary so it can stay a sibling of
// <main> in page.tsx — nesting it inside <main> previously caused a real
// stacking-context bug (commit cbf1efe) where MembersBottomBar/MembersNav,
// both z-20 outside <main>, always painted above anything inside <main>'s
// own z-10 context regardless of the RSVP bar's own z-index.
export function EventRsvpBar({ event }: { event: Event }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);

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

  // Shared between the mobile fixed bar and the desktop static card below
  // — same content either way, just two different wrappers.
  const rsvpBarContent = (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 md:max-w-none">
      <div className="flex items-center justify-between gap-4">
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

      {message && (
        <p className="text-xs font-medium text-foreground/70">{message}</p>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile: fade scrim + fixed price/RSVP bar, as one single fixed
          element instead of two stacked ones — same rationale and pattern
          as members-nav.tsx's tab bar. Two independently-fixed layers near
          the bottom is what caused a visible Safari toolbar seam. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-36 md:hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_top,var(--background)_0%,var(--background)_35%,color-mix(in_oklab,var(--background)_65%,transparent)_55%,color-mix(in_oklab,var(--background)_30%,transparent)_75%,transparent_100%)]"
        />
        {/* Safari 26 tints its bottom toolbar by reading the
            background-color of a fixed/sticky element near the viewport
            edge — a background-image gradient doesn't qualify. See the
            matching strip/comment in members-nav.tsx's MembersBottomBar. */}
        <div aria-hidden className="fixed inset-x-0 bottom-0 h-4 bg-background" />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="pointer-events-auto absolute left-3.5 right-3.5 bottom-[max(0.875rem,env(safe-area-inset-bottom))] rounded-[26px] bg-cream p-2 shadow-[0_10px_20px_-12px_rgba(27,21,18,0.18)]"
        >
          {rsvpBarContent}
        </motion.div>
      </div>

      {/* Desktop: static card below What's included, matching its width/
          rounding/border/background — no fixed or gradient behavior here
          at all, this is a completely separate rendering from the mobile
          bar above (hidden below md via the wrapper's own classes). */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="hidden md:mx-auto md:mt-3 md:block md:max-w-3xl md:w-full md:rounded-2xl md:border md:border-foreground/10 md:bg-background-muted md:p-2"
      >
        {rsvpBarContent}
      </motion.div>
    </>
  );
}
