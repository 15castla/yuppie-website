"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Calendar, ChevronLeft, MapPin, Users, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Event } from "./event-types";
import {
  CARD_CLASS,
  CATEGORY_LABEL,
  EventThumbnail,
  formatDayNumber,
  formatEventFullDateTime,
  formatEventPrice,
  formatMonthAbbrev,
} from "./ui";
import { rsvpToEvent, createEventPaymentIntent } from "@/app/members/events/actions";
import { EventPaymentForm } from "./event-payment-form";

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Keyed by title rather than id (the real events table's ids are opaque
// UUIDs). Falls back to a generic line for any event not in this list.
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
// courts, a heath) rather than just a neighbourhood: those get the exact
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
  initialClientSecret,
}: {
  event: Event;
  bookedCount: number;
  initialClientSecret?: string | null;
}) {
  const reduce = useReducedMotion();
  const fade = (delay: number) => ({
    initial: reduce ? false : { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: 0.35, delay, ease: EASE_OUT_EXPO },
  });

  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(initialClientSecret ?? null);

  const spotsLeft = Math.max(event.capacity - bookedCount, 0);
  const { normal, accent } = splitTitleForAccent(event.title);
  const whatsIncluded =
    WHATS_INCLUDED[event.title] ??
    "The full experience, organised and hosted by Yuppie from start to finish.";
  const isFree = !event.price_pence;

  useEffect(() => {
    if (!clientSecret) return;

    function handleKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape") setClientSecret(null);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [clientSecret]);

  useEffect(() => {
    if (!clientSecret) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [clientSecret]);

  function handleRsvp(formData: FormData) {
    startTransition(async () => {
      setMessage(null);
      const result = await rsvpToEvent(formData);

      if (result.success) {
        setBooked(true);
        return;
      }

      setMessage(result.error ?? "Something went wrong. Please try again.");
    });
  }

  function handleOpenPayment() {
    startTransition(async () => {
      setMessage(null);
      const formData = new FormData();
      formData.set("event_id", event.id);
      const result = await createEventPaymentIntent(formData);

      if (!result.success) {
        setMessage(result.error);
        return;
      }

      setClientSecret(result.clientSecret);
    });
  }

  // Shared between the mobile fixed bar and the desktop static card below,
  // with the same content either way, just two different wrappers (see the
  // fixed-position restructuring note further down).
  const bookButtonClasses =
    "rounded-full bg-foreground px-8 py-3.5 text-sm font-bold text-background transition-all duration-200 ease-out hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 disabled:transition-none";

  const rsvpBarContent = (
    <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 md:max-w-none">
      <div>
        {isFree ? (
          <p className="text-sm font-bold text-foreground">
            Included in your membership
          </p>
        ) : (
          <>
            <p className="text-lg font-extrabold text-foreground">
              {formatEventPrice(event.price_pence ?? 0)}
            </p>
            <p className="text-xs text-foreground-muted">Charged on booking</p>
          </>
        )}
      </div>

      {isFree ? (
        <form action={handleRsvp}>
          <input type="hidden" name="event_id" value={event.id} />
          <button type="submit" disabled={isPending || booked} className={bookButtonClasses}>
            {booked ? "You're in" : isPending ? "Booking…" : "RSVP"}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={handleOpenPayment}
          disabled={isPending || booked}
          className={bookButtonClasses}
        >
          {booked ? "You're in" : isPending ? "Loading…" : "Book my spot"}
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* flex-1 (not md:flex-none) is deliberate on mobile: it doesn't
          affect the mobile fixed bottom bar's position (that's purely
          position: fixed, independent of this element's box height), but
          it does on desktop, where the price/booking bar is a normal-flow
          element within <main> itself (see the gap-6 column further down).
          Without md:flex-none there, <main> stretched to fill the flex-1
          chain from app/members/layout.tsx (min-h-dvh down through
          <section>), pushing that bar down to wherever the stretched
          <main> happened to end instead of right after the content above
          it. The page background itself doesn't depend on this
          stretching: it comes from html/body's own explicit background
          (globals.css) and the min-h-dvh wrapper in app/members/layout.tsx,
          both unaffected by this element's height either way. */}
      <main className="relative z-10 flex flex-1 flex-col px-4 pt-8 pb-[150px] sm:px-6 md:flex-none md:pt-28 md:pb-16">
        <motion.div
          {...fade(0.1)}
          className="relative w-full overflow-hidden rounded-2xl border border-foreground/10 md:mx-auto md:max-w-3xl md:mt-6"
        >
          <EventThumbnail
            category={event.category}
            imageUrl={event.image_url}
            className="h-[220px] w-full md:h-[320px]"
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

          {/* Desktop: normal-flow, part of the same gap-6 rhythm as every
              other section above (category pill, title, details, "What's
              included"), rather than pinned to the viewport bottom. A
              fixed/sticky-to-viewport version was tried and reverted: it
              read as disconnected from the content it belongs to, and left
              leftover space on a tall screen above the bar instead of below
              it. Hidden below md (the mobile fixed bar further down covers
              that). */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="hidden md:block md:rounded-2xl md:border md:border-foreground/10 md:bg-background-muted md:p-2"
          >
            {rsvpBarContent}
          </motion.div>
        </div>
      </main>

      {/* Mobile: fade scrim + fixed price/RSVP bar, as one single fixed
          element instead of two stacked ones, same rationale and pattern
          as members-nav.tsx's tab bar. Two independently-fixed layers near
          the bottom is what caused a visible Safari toolbar seam.
          bg-background directly on this wrapper (not a separate invisible
          strip, see members-nav.tsx's MembersBottomBar for why) is what
          gives Safari's toolbar-tinting a genuinely qualifying element to
          read, near-identical visually since the gradient below is
          already 100% opaque var(--background) for its bottom third. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-36 bg-background md:hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_top,var(--background)_0%,var(--background)_35%,color-mix(in_oklab,var(--background)_65%,transparent)_55%,color-mix(in_oklab,var(--background)_30%,transparent)_75%,transparent_100%)]"
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="pointer-events-auto absolute left-3.5 right-3.5 bottom-[max(0.875rem,env(safe-area-inset-bottom))] rounded-[26px] bg-cream p-2 shadow-[0_10px_20px_-12px_rgba(27,21,18,0.18)]"
        >
          {rsvpBarContent}
        </motion.div>
      </div>

      <AnimatePresence>
        {clientSecret && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setClientSecret(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              onClick={(event) => event.stopPropagation()}
              className={cn(CARD_CLASS, "relative w-full max-w-sm max-h-[85vh] overflow-y-auto p-6")}
            >
              <button
                type="button"
                onClick={() => setClientSecret(null)}
                aria-label="Close"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-foreground/50 outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/40"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex flex-col gap-1 pr-8">
                <p className="text-base font-bold text-foreground">{event.title}</p>
                <p className="text-sm text-foreground-muted">
                  {formatEventPrice(event.price_pence ?? 0)}, charged now.
                </p>
              </div>

              <div className="mt-5">
                <EventPaymentForm
                  clientSecret={clientSecret}
                  onSuccess={() => {
                    setClientSecret(null);
                    setBooked(true);
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
