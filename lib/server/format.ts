// Dates, times and money as the club writes them: Europe/London, 24-hour
// "18:30", dates "Tue 27 Oct", the You card's "12 Nov", "£25". Fixed month and
// weekday names, because Intl spells September "Sept" in en-GB. Pure, no
// React, no next/*: used by the server modules and the emails' data.

export const CLUB_TIME_ZONE = "Europe/London";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Wall = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

const wallFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLUB_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

/** The London wall clock at an instant. */
export function londonWall(value: Date | string | number): Wall {
  const parts = Object.fromEntries(wallFormat.formatToParts(toDate(value)).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** The instant at which London's clock reads the given wall time. */
export function londonWallToDate(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, ms = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const offsetAt = (instant: number) => {
    const w = londonWall(instant);
    return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(instant / 1000) * 1000;
  };
  let result = guess - offsetAt(guess);
  // Across a clock change the offset at the answer can differ from the guess's.
  result = guess - offsetAt(result);
  return new Date(result);
}

/** The last millisecond of the London day `plusDays` after the day of `value` (23:59:59.999). */
export function londonEndOfDay(value: Date | string | number, plusDays = 0): Date {
  const w = londonWall(value);
  const shifted = new Date(Date.UTC(w.year, w.month - 1, w.day + plusDays));
  return londonWallToDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), 23, 59, 59, 999);
}

function weekdayOf(w: Wall): string {
  return WEEKDAYS[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()];
}

/** "Tue 27 Oct". */
export function dayDate(value: Date | string | number): string {
  const w = londonWall(value);
  return `${weekdayOf(w)} ${w.day} ${MONTHS[w.month - 1]}`;
}

/** "18:30". */
export function time24(value: Date | string | number): string {
  const w = londonWall(value);
  return `${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
}

/** "Tue 27 Oct, 18:30". */
export function dayDateTime(value: Date | string | number): string {
  return `${dayDate(value)}, ${time24(value)}`;
}

/** "12 Nov" (the You card's style, lib/members/you/format.ts shortDate). */
export function dayMonth(value: Date | string | number): string {
  const w = londonWall(value);
  return `${w.day} ${MONTHS[w.month - 1]}`;
}

/** "£25", "£25.50", "£0". */
export function pounds(pence: number): string {
  const whole = Math.round(pence);
  const sign = whole < 0 ? "-" : "";
  const abs = Math.abs(whole);
  const p = abs % 100;
  return `${sign}£${Math.floor(abs / 100)}${p ? `.${String(p).padStart(2, "0")}` : ""}`;
}

/** A Google Maps search link for an address. */
export function mapUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address).replace(/%20/g, "+")}`;
}

/** First word of a full name, "" when there is none. */
export function firstName(fullName: string | null | undefined): string {
  return fullName?.trim().split(/\s+/)[0] ?? "";
}
