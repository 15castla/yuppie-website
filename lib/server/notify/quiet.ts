// Quiet hours (notifications decision 2 B), Europe/London: no push or text from 22:00 to 07:00. Pure.

import { QUIET_HOURS } from "../config";
import { londonWall } from "../format";

export function isQuietHours(now: Date): boolean {
  const { hour } = londonWall(now);
  return hour >= QUIET_HOURS.from || hour < QUIET_HOURS.until;
}

/** "today" or "tomorrow": the day a start falls on, seen from `now`, in London. Null for any other day. */
export function relativeDay(startIso: string, now: Date): "today" | "tomorrow" | null {
  const a = londonWall(now);
  const b = londonWall(startIso);
  const day = (w: { year: number; month: number; day: number }) => Date.UTC(w.year, w.month - 1, w.day) / 86400000;
  const diff = day(b) - day(a);
  return diff === 0 ? "today" : diff === 1 ? "tomorrow" : null;
}
