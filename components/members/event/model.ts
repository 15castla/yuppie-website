// The event page's data and the rules that decide what it shows (r2a sections 1 to 5). Pure: no React, no
// fetching, so the page (app/members/events/[slug]/page.tsx), the view and the preview harness all agree.
//
// What the page decides on the server and hands in (never the browser's clock): whether the event has started,
// how many are booked, the member's own booking (with the exact address, A-D3: only a confirmed booking ever
// carries it) and whether cancelling now is free (48 hours, A-D1 B; or the club moved it, C-D11).

import type { MyBooking } from "@/app/members/events/my-booking";
import { dayDate, dayDateTime, pounds, time24 } from "@/lib/server/format";

export type EventCategory = "entertainment" | "sport" | "personal_progression";

export type EventPageEvent = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: EventCategory;
  /** The place name ("Northgate Courts"). The exact address is never here. */
  location: string | null;
  startTime: string;
  endTime: string | null;
  pricePence: number;
  capacity: number;
  imageUrl: string | null;
  focalX: number;
  focalY: number;
  /** The club cancelled it (B-D8). */
  cancelledAt: string | null;
  /** The club's reason, as written in the admin ("the venue is closed that evening"). */
  cancelNote: string | null;
};

/** The member's confirmed booking, as the booking card and the confirmed sheet show it. */
export type EventPageBooking = {
  bookingId: string;
  amountPence: number;
  bookedAt: string;
  /** The exact address (A-D3). Null until the club saves one. */
  address: string | null;
  /** Start minus 48 hours, ISO. */
  freeUntil: string;
  /** Cancelling now gives it all back automatically (more than 48 hours to go, or the club moved it). */
  freeNow: boolean;
  /** The club moved the event after this booking was made (C-D11: free whatever the date). */
  moved: boolean;
  /** The .ics download (Apple Calendar, Outlook, the app). */
  icsUrl: string;
  /** Google Calendar, filled in. */
  googleUrl: string | null;
};

/** The member's booking that the club cancelled with the event, so the page can say what happened to it. */
export type ClubCancelledBooking = { amountPence: number; refunded: boolean };

/** Back from the bank (a redirect-based 3-D Secure check or wallet): Stripe adds these to the page address. */
export type PaymentReturn = { paymentIntentId: string; clientSecret: string; redirectStatus: string };

export type EventPageData = {
  event: EventPageEvent;
  /** Confirmed bookings, everyone's (an aggregate read on the server). */
  bookedCount: number;
  booking: EventPageBooking | null;
  /** Decided on the server for this request. */
  started: boolean;
  /** The free-cancel deadline for this event (start minus FREE_CANCEL_HOURS, lib/server/config.ts), ISO. */
  freeUntil: string;
  /** The rule's hours, for the words ("It’s more than 48 hours until the event"). */
  freeCancelHours: number;
  /** Booking now could still be cancelled for free (now is before freeUntil). Decided on the server. */
  freeWindowOpen: boolean;
  /** The member's email: the confirmed sheet says where the booking went. */
  memberEmail: string;
  clubCancelled?: ClubCancelledBooking | null;
  paymentReturn?: PaymentReturn | null;
  /**
   * A payment of this member's for this event went through but never became a booking, and is not refunded
   * (app/members/events/paid-not-booked.ts): the page opens in "Paid, but not booked yet." with no Book button.
   */
  paidNotBooked?: { amountPence: number } | null;
};

/** What the page is, before anything the member does on it. */
export type EventPhase = "open" | "booked" | "full" | "past" | "cancelled";

/** Started wins over booked: a booked member on an event that has started sees the past event (no calendar, no cancel; the booking card keeps the address). */
export function eventPhase(data: Pick<EventPageData, "event" | "booking" | "started" | "bookedCount">): EventPhase {
  if (data.event.cancelledAt) return "cancelled";
  if (data.started) return "past";
  if (data.booking) return "booked";
  if (spotsLeft(data) <= 0) return "full";
  return "open";
}

export function spotsLeft(data: Pick<EventPageData, "event" | "bookedCount">): number {
  return Math.max((data.event.capacity ?? 0) - data.bookedCount, 0);
}

export const isPaid = (event: Pick<EventPageEvent, "pricePence">) => event.pricePence > 0;

// ---------------------------------------------------------------------------- words

export const CATEGORY_WORDS: Record<EventCategory, string> = {
  sport: "Sport",
  entertainment: "Entertainment",
  personal_progression: "Personal progression",
};

/**
 * The title's bold part and its Instrument Serif part. After a colon the serif part is its own line (r2a 1); the
 * product used to drop the space after the colon ("Rooftop Social:End of Summer"), so `gap` is the space the
 * markup puts between them, read by screen readers and copied with the text. Else the last word is the accent.
 */
export function splitTitle(title: string): { normal: string; accent: string; block: boolean } {
  const clean = title.trim().replace(/\s+/g, " ");
  const colon = clean.indexOf(":");
  if (colon > 0 && colon < clean.length - 1) {
    return { normal: `${clean.slice(0, colon).trim()}:`, accent: clean.slice(colon + 1).trim(), block: true };
  }
  const words = clean.split(" ");
  if (words.length < 2) return { normal: "", accent: clean, block: false };
  const accent = words.pop() ?? "";
  return { normal: words.join(" "), accent, block: false };
}

// Keyed by title (the events table has no "what's included" column). Today's copy, kept.
const WHATS_INCLUDED: Record<string, string> = {
  "Padel & Pints": "Court time, rackets and balls provided, plus your first drink on us afterwards. Just turn up in trainers.",
  "Supper Club: Wine & Charcuterie":
    "The full tasting menu, five wines poured throughout the evening, and a seat at a table full of people worth meeting.",
  "Sunrise Wellness Retreat": "A guided yoga session, use of the cold plunge, and coffee and pastries afterwards. Mats provided.",
  "Rooftop Social: End of Summer": "Entry, a welcome drink, and the DJ set all night. Dress well, the rooftop’s got a dress code.",
};

/** Never the bare brand (r2a, real product notes). */
export const WHATS_INCLUDED_DEFAULT = "The full experience, organised and hosted by Club Yuppie from start to finish.";

export function whatsIncluded(title: string): string {
  return WHATS_INCLUDED[title.trim()] ?? WHATS_INCLUDED_DEFAULT;
}

export const gbp = pounds;

/** "Thu 29 Oct, 18:30". */
export const whenLine = (iso: string) => dayDateTime(iso);
/** "Ends 20:30", or null with no end time. */
export function endsLine(event: Pick<EventPageEvent, "startTime" | "endTime">): string | null {
  if (!event.endTime) return null;
  if (new Date(event.endTime).getTime() <= new Date(event.startTime).getTime()) return null;
  return dayDate(event.endTime) === dayDate(event.startTime) ? `Ends ${time24(event.endTime)}` : `Ends ${dayDateTime(event.endTime)}`;
}

/** The free-cancel deadline (worked out on the server from FREE_CANCEL_HOURS) as the money lines write it: "Tue 27 Oct, 18:30". */
export const freeUntilLine = (deadlineIso: string) => dayDateTime(deadlineIso);

/** "18:30 · Northgate Courts" for the sheets' summary tile. */
export function timeAndPlaceLine(event: Pick<EventPageEvent, "startTime" | "location">): string {
  const where = event.location?.trim();
  return where ? `${time24(event.startTime)} · ${where}` : time24(event.startTime);
}

/** The reason a club gives, as one clause ("the venue is closed that evening"). Same rule as the email. */
export function reasonClause(note: string | null | undefined): string {
  return (note ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^because\s+/i, "")
    .replace(/[.!\s]+$/, "")
    .trim();
}

export const CLUB_EMAIL = "hello@clubyuppie.com";

/** A message from the server, split for the strip: the first sentence in bold red, the rest in ink (r2a 2). */
export function splitMessage(message: string): { lead: string; rest: string } {
  const m = /^(.+?[.?])(\s+|$)([\s\S]*)$/.exec(message.trim());
  if (!m) return { lead: message.trim(), rest: "" };
  return { lead: m[1], rest: m[3] };
}

/** mailto: with a subject, for Email us. */
export function mailtoClub(subject: string): string {
  return `mailto:${CLUB_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/** Google Maps search for the exact address. */
export function mapsUrl(place: string | null, address: string): string {
  const q = [place, address].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q).replace(/%20/g, "+")}`;
}

/** The server action's booking (getMyBooking) as the page shows it. */
export function toPageBooking(b: MyBooking): EventPageBooking {
  return {
    bookingId: b.bookingId,
    amountPence: b.amountPence,
    bookedAt: b.bookedAt,
    address: b.address,
    freeUntil: b.freeUntil,
    freeNow: b.freeNow,
    moved: b.moved,
    icsUrl: b.calendarUrl,
    googleUrl: b.googleUrl,
  };
}
