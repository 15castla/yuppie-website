// Dates and numbers on the Outreach Desk, in UK time (17 Nov 2026).

import { UK_TIME_ZONE } from "@/lib/server/outreach/rules";

const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TIME_ZONE, weekday: "short", day: "numeric", month: "short" });
const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TIME_ZONE, day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const longFmt = new Intl.DateTimeFormat("en-GB", { timeZone: UK_TIME_ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** "Thu 12 Nov" for a moment. */
export function dayWords(iso: string): string {
  return dayFmt.format(new Date(iso)).replace(",", "");
}

/** "Thu 12 Nov" for a YYYY-MM-DD date. */
export function dateWords(ymd: string): string {
  return dayFmt.format(new Date(`${ymd}T12:00:00Z`)).replace(",", "");
}

/** "12 Nov" for a moment. */
export function shortDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

/** "09:40" for a moment. */
export function timeWords(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/** "12 Nov 09:40", or "12 Nov" for a date-only entry (a letter's posting, or history with no time recorded): those are
 *  kept as 12:00:00.000 UTC exactly. */
export function stampWords(iso: string): string {
  const d = new Date(iso);
  const dateOnly = d.getUTCHours() === 12 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  return dateOnly ? shortDate(iso) : `${shortDate(iso)} ${timeWords(iso)}`;
}

/** "Tuesday 17 November 2026" for a moment. */
export function longDay(iso: string | Date): string {
  return longFmt.format(typeof iso === "string" ? new Date(iso) : iso).replace(",", "");
}
