// Dates, times and money in the admin's words: Europe/London, 24-hour "18:30", "Tue 27 Oct", "12 Sep 2026",
// "£25". Built on lib/server/format.ts (pure, no server-only), so the server pages and the client lists agree.

import { dayDate, dayDateTime, dayMonth, londonWall, pounds, time24 } from "@/lib/server/format";

export { dayDate, dayDateTime, dayMonth, pounds, time24 };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Sep 2026" (Member since). */
export function dayMonthYear(value: Date | string | number): string {
  const w = londonWall(value);
  return `${w.day} ${MONTHS[w.month - 1]} ${w.year}`;
}

/** "Sat 12 Sep 2026". */
export function dayDateYear(value: Date | string | number): string {
  return `${dayDate(value)} ${londonWall(value).year}`;
}

/** The weekday and the day of the month for a date column: { weekday: "Thu", day: "29" }. */
export function dateParts(value: Date | string | number): { weekday: string; day: string } {
  const [weekday, day] = dayDate(value).split(" ");
  return { weekday, day };
}

/** How long ago, for a waiting list: "today", "yesterday", "4 days ago". */
export function agoWords(value: Date | string | number, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** How long something has waited: "under a day", "1 day", "4 days". */
export function waitedWords(value: Date | string | number, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return "under a day";
  return days === 1 ? "1 day" : `${days} days`;
}

/** London calendar days between two moments (0 = the same day, 1 = yesterday). */
function daysBetween(earlier: Date | string | number, later: Date | string | number): number {
  const a = londonWall(earlier);
  const b = londonWall(later);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400000);
}

/** When a report or photo came in, for a queue row (msg-admin-moderation): "Just now", "12 min ago", "2 h ago", "Yesterday", "Tue 27 Oct". */
export function queueAgo(value: Date | string | number, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const days = daysBetween(value, now);
  if (days === 0 || minutes < 12 * 60) return `${Math.floor(minutes / 60)} h ago`;
  if (days === 1) return "Yesterday";
  return dayDate(value);
}

/** A moment in a card (photo-admin-queue "Added"): "Today, 10:42", "Yesterday, 18:20", "Tue 27 Oct, 10:42". */
export function whenWords(value: Date | string | number, now: Date = new Date()): string {
  const days = daysBetween(value, now);
  if (days === 0) return `Today, ${time24(value)}`;
  if (days === 1) return `Yesterday, ${time24(value)}`;
  return dayDateTime(value);
}

/** A queue's age in whole hours, as its stat shows it: "20 h", "Under 1 h", or "None" when nothing waits. */
export function hoursStat(hours: number | null): string {
  if (hours === null) return "None";
  return hours < 1 ? "Under 1 h" : `${hours} h`;
}

/** "Sep 2026" (member since). */
export function monthYear(value: Date | string | number): string {
  const w = londonWall(value);
  return `${MONTHS[w.month - 1]} ${w.year}`;
}

/** "no earlier reports", "1 earlier report", "3 earlier reports". */
export function countWords(n: number, one: string, many: string, none?: string): string {
  if (n === 0 && none) return none;
  return `${n} ${n === 1 ? one : many}`;
}

/** First word of a name, or the email's local part. */
export function firstNameOf(fullName: string | null | undefined, email?: string | null): string {
  const first = fullName?.trim().split(/\s+/)[0];
  if (first) return first;
  return email?.split("@")[0] ?? "they";
}

/** A possessive: "Sam’s", "Marcus’s" (the design writes Marcus’s). */
export function possessive(name: string): string {
  return `${name}’s`;
}

/** "Kit Barrow and Rosa Almeida", "A, B and 2 more". */
export function namesList(names: string[], max = 2): string {
  if (names.length <= max) return names.length === 2 ? `${names[0]} and ${names[1]}` : names.join(", ");
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

/** A phone number as the You page writes it ("07700 900123" for a UK number). */
export { displayPhone as phoneWords } from "@/lib/members/you/format";

/** Stripe's dashboard links (test ids open in test mode). */
export function stripeCustomerUrl(id: string): string {
  return `https://dashboard.stripe.com/${/_test_/.test(id) ? "test/" : ""}customers/${encodeURIComponent(id)}`;
}
export function stripePaymentUrl(id: string): string {
  return `https://dashboard.stripe.com/payments/${encodeURIComponent(id)}`;
}
export function stripeSubscriptionUrl(id: string): string {
  return `https://dashboard.stripe.com/subscriptions/${encodeURIComponent(id)}`;
}
