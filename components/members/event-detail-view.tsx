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
  EVENT_PHOTO_CLASS,
  EventThumbnail,
  eventFocalPoint,
  formatDayNumber,
  formatEventFullDateTime,
  formatEventPrice,
  formatMonthAbbrev,
  fadeIn,
} from "./ui";
import { rsvpToEvent, createEventPaymentIntent } from "@/app/members/events/actions";
import { EventPaymentForm } from "./event-payment-form";

const BACK_BUTTON_CLASS =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cream text-foreground shadow-[0_8px_20px_-8px_rgba(27,21,18,0.5)] transition-transform hover:scale-105";

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

// Every label the book button can show. All of them are rendered in the
// same grid cell with only the current one visible, so the pill is always
// as wide as the longest and doesn't resize as the text changes.
const BOOK_LABELS = ["Book my spot", "Booking…", "Booked", "Fully booked", "Past event"] as const;

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
  initialBooked = false,
  hasStarted = false,
  initialClientSecret,
}: {
  event: Event;
  bookedCount: number;
  initialBooked?: boolean;
  // Worked out on the server (the page), not here, so the server render and
  // the browser can't disagree about the current time.
  hasStarted?: boolean;
  initialClientSecret?: string | null;
}) {
  const reduce = useReducedMotion();
  const fade = (delay: number) => fadeIn(reduce, delay);

  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [booked, setBooked] = useState(initialBooked);
  // A payment Stripe is still processing: not booked yet (the webhook
  // books it once it clears), but the button stays off so it can't be
  // paid for a second time in the meantime.
  const [paymentPending, setPaymentPending] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(initialClientSecret ?? null);

  const spotsLeft = Math.max(event.capacity - bookedCount, 0);
  const { normal, accent } = splitTitleForAccent(event.title);
  const whatsIncluded =
    WHATS_INCLUDED[event.title] ??
    "The full experience, organised and hosted by Yuppie from start to finish.";
  const isFree = !event.price_pence;
  const hasPhoto = Boolean(event.image_url);

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
  // shrink-0 + whitespace-nowrap: the button never squeezes or wraps; the
  // text on the left of the bar wraps instead (it has min-w-0).
  const bookButtonClasses =
    "shrink-0 whitespace-nowrap rounded-full bg-foreground px-8 py-3.5 text-sm font-bold text-background transition-all duration-200 ease-out hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 disabled:transition-none";

  // Disabled up front when there's no space, rather than letting a click
  // through to the server's own capacity check. A member who's already
  // booked still sees "Booked", even though their booking fills a spot.
  const isFull = spotsLeft <= 0 && !booked;
  // Reached through an old link or bookmark: the events list no longer
  // shows it, and the booking actions refuse it, but the button is off
  // up front too. A member who booked it still sees "Booked".
  const isPast = hasStarted && !booked;

  // Same label for free and paid events; only what a click does differs.
  const bookLabel: (typeof BOOK_LABELS)[number] = booked
    ? "Booked"
    : isPast
      ? "Past event"
      : isFull
        ? "Fully booked"
        : isPending
          ? "Booking…"
          : "Book my spot";
  const bookButtonLabel = (
    <span className="grid">
      {BOOK_LABELS.map((label) => (
        <span key={label} className={cn("[grid-area:1/1]", label !== bookLabel && "invisible")}>
          {label}
        </span>
      ))}
    </span>
  );

  const rsvpBarContent = (
    <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 md:max-w-none">
      <div className="min-w-0">
        {isFree ? (
          <p className="text-sm font-bold leading-tight text-foreground">
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
          <button type="submit" disabled={isPending || booked || isFull || isPast || paymentPending} className={bookButtonClasses}>
            {bookButtonLabel}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={handleOpenPayment}
          disabled={isPending || booked || isFull || isPast || paymentPending}
          className={bookButtonClasses}
        >
          {bookButtonLabel}
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
      <main className="relative z-10 flex flex-1 flex-col px-4 pt-[calc(2rem+var(--safe-top))] pb-[150px] sm:px-6 md:flex-none md:pt-28 md:pb-16">
        {/* Below md: edge to edge from the very top of the screen (under
            the status bar), cancelling <main>'s side and top padding, with
            the content sliding up over it as a sheet (below). From md: the
            inset, rounded hero as before, since a full-width 16:9 photo
            would be ~720px tall on a desktop screen. With no photo,
            EventThumbnail's brand gradient fills the same hero. */}
        <motion.div
          {...fadeIn(reduce, 0.1, { slide: false })}
          className="relative -mx-4 -mt-[calc(2rem+var(--safe-top))] overflow-hidden sm:-mx-6 md:mx-auto md:mt-6 md:w-full md:max-w-3xl md:rounded-2xl md:border md:border-foreground/10"
        >
          <EventThumbnail
            category={event.category}
            imageUrl={event.image_url}
            focalPoint={eventFocalPoint(event)}
            className={EVENT_PHOTO_CLASS}
            showCategoryBadge={false}
            // Edge to edge on phones; the inset hero is at most 768px wide
            // from md: up.
            sizes="(min-width: 768px) 768px, 100vw"
          />
          {/* So the back button reads on a bright photo. Not on the
              gradient, where it would only muddy the yellow. */}
          {hasPhoto && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--foreground)_35%,transparent),transparent)] md:hidden"
            />
          )}
          <Link
            href="/members/events"
            aria-label="Back to events"
            className={cn(BACK_BUTTON_CLASS, "absolute left-4 top-[calc(var(--safe-top)+0.75rem)] md:top-4")}
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </motion.div>

        {/* The sheet sliding up over the hero, below md only. Its own
            wrapper (rather than classes on the column) so it can run edge
            to edge while the column inside keeps its max width. */}
        <div className="relative z-10 -mx-4 -mt-7 rounded-t-[28px] bg-background px-4 pt-6 sm:-mx-6 sm:px-6 md:mx-0 md:mt-6 md:rounded-none md:bg-transparent md:px-0 md:pt-0">
          <div className="relative mx-auto flex w-full max-w-2xl flex-col gap-6 md:max-w-3xl">
            <motion.div {...fade(0.15)} className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-3">
                <span className="w-fit rounded-full bg-cream px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-foreground shadow-[0_8px_20px_-8px_rgba(27,21,18,0.35)]">
                  {CATEGORY_LABEL[event.category]}
                </span>
                <h1 className="text-[30px] font-extrabold leading-[1.05] text-foreground optical-trim">
                  {normal}
                  {/* A touch larger so the serif optically matches the sans. */}
                  <em className="text-[34px] italic [font-family:var(--font-instrument-serif)] font-normal">
                    {accent}
                  </em>
                </h1>
              </div>
              <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl bg-foreground text-background">
                <span className="text-[9px] font-bold uppercase tracking-[0.14em]">
                  {formatMonthAbbrev(event.start_time)}
                </span>
                <span className="text-xl font-extrabold leading-none">
                  {formatDayNumber(event.start_time)}
                </span>
              </div>
            </motion.div>

            <motion.div {...fade(0.3)} className={cn(CARD_CLASS, "overflow-hidden")}>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <Calendar aria-hidden className="h-5 w-5 shrink-0 text-foreground/75" />
                <p className="text-sm text-foreground">
                  {formatEventFullDateTime(event.start_time, event.end_time)}
                </p>
              </div>
              {/* Dividers inset to start after the icon (16px + 20px + 12px). */}
              <div aria-hidden className="ml-12 h-px bg-foreground/[0.08]" />
              <div className="flex items-center gap-3 px-4 py-3.5">
                <MapPin aria-hidden className="h-5 w-5 shrink-0 text-foreground/75" />
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
              <div aria-hidden className="ml-12 h-px bg-foreground/[0.08]" />
              <div className="flex items-center gap-3 px-4 py-3.5">
                <Users aria-hidden className="h-5 w-5 shrink-0 text-foreground/75" />
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
        </div>
      </main>

      {/* Mobile: fade scrim + fixed price/RSVP bar, as one single fixed
          element instead of two stacked ones, same rationale and pattern
          as members-nav.tsx's tab bar. Two independently-fixed layers near
          the bottom is what caused a visible Safari toolbar seam. */}
      {/* [transform:translateZ(0)] + will-change-transform force this onto
          its own GPU compositor layer, the standard fix for plain
          position: fixed elements otherwise visibly lagging behind/janking
          during scroll on iOS Safari. See the matching comment in
          members-nav.tsx's MembersBottomBar. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-36 [transform:translateZ(0)] will-change-transform md:hidden"
      >
        {/* Every stop here has a distinct opacity, deliberately: see the
            matching comment in members-nav.tsx's MembersBottomBar for why
            a repeated-stop (flat, no-fade) zone at the bottom caused a
            sharp cut through content instead of a smooth dissolve. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_top,var(--background)_0%,color-mix(in_oklab,var(--background)_90%,transparent)_20%,color-mix(in_oklab,var(--background)_70%,transparent)_40%,color-mix(in_oklab,var(--background)_45%,transparent)_60%,color-mix(in_oklab,var(--background)_20%,transparent)_80%,transparent_100%)]"
        />
        {/* Safari 26 tints its bottom toolbar by reading the
            background-color of a fixed/sticky element near the viewport
            edge. A background-image gradient doesn't qualify. Height
            covers the real safe area (not a flat 16px) so nothing is
            left for Safari's own, less reliable color-extension into
            that zone to fill in. See the matching strip/comment in
            members-nav.tsx's MembersBottomBar. */}
        <div
          aria-hidden
          className="fixed inset-x-0 bottom-0 h-[max(1rem,env(safe-area-inset-bottom))] bg-background"
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
                  eventId={event.id}
                  onSuccess={() => {
                    setClientSecret(null);
                    setBooked(true);
                  }}
                  onPending={() => {
                    setClientSecret(null);
                    setPaymentPending(true);
                    setMessage(
                      "Payment processing… We'll confirm your booking as soon as it clears.",
                    );
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
