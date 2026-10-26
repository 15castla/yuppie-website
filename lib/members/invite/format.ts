// Pure helpers for Open Invite and paid plans: times, money, places, and the
// state a plan page or card is in. No React, no I/O, so the server, the
// client and the preview harness all use the same words.

import type { OpenInvite } from "./types";

const LONDON = "Europe/London";

// Three letters, always: Intl's en-GB short month spells September "Sept".
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// A month on its own, so the day stays unpadded ("Mon 5 Jan"): en-GB pads the
// day to two digits whenever the month is numeric in the same pattern.
const monthOnly = new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, month: "numeric" });

function londonParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    weekday: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: pick("weekday"),
    day: pick("day"),
    month: MONTHS_SHORT[Number(monthOnly.format(new Date(iso))) - 1] ?? "",
    hour: pick("hour"),
    minute: pick("minute"),
  };
}

/** "Sat 24 Oct" */
export function formatDay(iso: string): string {
  const p = londonParts(iso);
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "10:00" (24-hour, leading zero) */
export function formatTime(iso: string): string {
  const p = londonParts(iso);
  return `${p.hour}:${p.minute}`;
}

/** "Sat 24 Oct, 10:00" */
export function formatWhen(iso: string): string {
  return `${formatDay(iso)}, ${formatTime(iso)}`;
}

/** { weekday: "Sat", day: 24 } for a date column. */
export function dateColumn(iso: string): { weekday: string; day: number } {
  const p = londonParts(iso);
  return { weekday: p.weekday, day: Number.parseInt(p.day, 10) };
}

/** £22, £22.50, £149.50, £1,208: pence only when there are some. */
export function gbp(pence: number): string {
  const pounds = pence / 100;
  const grouped = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(Math.trunc(pounds));
  if (pence % 100 === 0) return `£${grouped}`;
  return `£${grouped}.${String(Math.abs(pence) % 100).padStart(2, "0")}`;
}

/** "£22 each" */
export function priceEach(pence: number): string {
  return `${gbp(pence)} each`;
}

export function placesLeft(invite: Pick<OpenInvite, "places" | "going">): number {
  return Math.max(invite.places - invite.going.length, 0);
}

/** "3 places left", "1 place left", "No places left". */
export function placesLeftText(invite: Pick<OpenInvite, "places" | "going">): string {
  const left = placesLeft(invite);
  if (left === 0) return "No places left";
  return left === 1 ? "1 place left" : `${left} places left`;
}

/** "3 of 4 going" */
export function goingText(invite: Pick<OpenInvite, "places" | "going">): string {
  return `${invite.going.length} of ${invite.places} going`;
}

export type PlanState = "open" | "in" | "full" | "own" | "cancelled" | "past";

/** The state a plan is in for this viewer. (Pending is a moment on the client, not stored.) */
export function planState(invite: OpenInvite): PlanState {
  if (invite.status === "cancelled") return "cancelled";
  if (invite.status === "finished") return "past";
  if (invite.you.role === "host") return "own";
  if (invite.you.role === "going") return "in";
  return placesLeft(invite) === 0 ? "full" : "open";
}

export function isPaid(invite: Pick<OpenInvite, "cost">): boolean {
  return invite.cost !== null;
}

const HOUR = 3_600_000;

/** The last moment a leaver gets a full automatic refund: 24 hours before the start. */
export function fullRefundUntil(startsAt: string): string {
  return new Date(new Date(startsAt).getTime() - 24 * HOUR).toISOString();
}

/** Leaving a paid plan: "full" (more than 24 hours before, automatic) or "late" (ask the host). */
export function leaveWindow(startsAt: string, nowIso: string): "full" | "late" {
  return new Date(nowIso).getTime() < new Date(fullRefundUntil(startsAt)).getTime() ? "full" : "late";
}

/** "Thu 29 Oct, 20:00": the refund line on a receipt. */
export function formatRefundUntil(startsAt: string): string {
  return formatWhen(fullRefundUntil(startsAt));
}

/** The filter chips on browse. */
export const INVITE_FILTERS = ["Any day", "This week", "Weekend", "Sport", "Food and drink", "Wellness", "Culture"] as const;
export type InviteFilter = (typeof INVITE_FILTERS)[number];

/** Which plans a filter keeps. The feed only holds plans that have not finished, so "This week" is everything starting before 7 days from `nowIso`; "Weekend" is Saturday and Sunday (London). */
export function matchesFilter(invite: OpenInvite, filter: InviteFilter, nowIso: string): boolean {
  switch (filter) {
    case "Any day":
      return true;
    case "This week": {
      return new Date(invite.startsAt).getTime() < new Date(nowIso).getTime() + 7 * 24 * HOUR;
    }
    case "Weekend": {
      const { weekday } = londonParts(invite.startsAt);
      return weekday === "Sat" || weekday === "Sun";
    }
    default:
      return invite.type === filter;
  }
}

/** The accessible name of a card. */
export function cardLabel(invite: OpenInvite, state: PlanState): string {
  const base: Record<PlanState, string> = {
    open: "Open Invite",
    in: "Open Invite, you are in",
    full: "Open Invite, full",
    own: "Your Open Invite",
    cancelled: "Cancelled Open Invite",
    past: "Past Open Invite",
  };
  return invite.cost ? `${base[state]}, ${priceEach(invite.cost.pricePence)}` : base[state];
}

// ---------------------------------------------------------------- the post form's dates

/** "Wed 4 Nov" from a form date (YYYY-MM-DD). Empty when the date is not a date. */
export function formatDateInput(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return "";
  const at = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (Number.isNaN(at.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).formatToParts(at);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("weekday")} ${pick("day")} ${pick("month")}`;
}

/** London's offset from UTC, in minutes (0 in winter, 60 in summer), at an instant. */
function londonOffsetMinutes(ms: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wall = Date.UTC(pick("year"), pick("month") - 1, pick("day"), pick("hour"), pick("minute"));
  return Math.round((wall - Math.floor(ms / 60_000) * 60_000) / 60_000);
}

/** A London wall-clock date (YYYY-MM-DD) and time (HH:MM) as an ISO instant, or null when either is missing or not real. */
export function londonLocalToIso(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const asUtc = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  if (Number.isNaN(asUtc)) return null;
  let ms = asUtc - londonOffsetMinutes(asUtc) * 60_000;
  ms = asUtc - londonOffsetMinutes(ms) * 60_000;
  return new Date(ms).toISOString();
}
