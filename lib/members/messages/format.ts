// Pure formatting for the Messages screens: Europe/London, 24-hour times with a
// leading zero, "Today" and "Yesterday", the club's house style ("Wed 21 Oct").
// No React, no next/*: the server and the client format identically, so
// nothing differs at hydration. Every function takes `now` explicitly (the
// example clock is Fri 23 Oct 2026, 10:41), so the screens are deterministic.

import type { ChatPlan, MemberRef, UpdateItem } from "./types";

const ZONE = "Europe/London";

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dateParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

type Parts = { weekday: string; day: string; month: string; year: string };

function partsOf(iso: string): Parts {
  const parts: Record<string, string> = {};
  for (const part of dateParts.formatToParts(new Date(iso))) parts[part.type] = part.value;
  return { weekday: parts.weekday, day: parts.day, month: parts.month, year: parts.year };
}

/** A calendar day number in London, for counting days between two instants. */
function dayNumber(iso: string): number {
  const p = partsOf(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return Date.UTC(Number(p.year), months.indexOf(p.month), Number(p.day)) / 86_400_000;
}

/** "09:13". */
export function clock(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/** "Sat 24 Oct". */
export function shortDate(iso: string): string {
  const p = partsOf(iso);
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "Wed 4 Nov": the day under a plan (the Updates detail line). */
export const planDay = shortDate;

/** "Sat 24 Oct, 10:00". */
export function dateAndTime(iso: string): string {
  return `${shortDate(iso)}, ${clock(iso)}`;
}

/** "Wed 18:20": when a message was sent, in a report. */
export function weekdayTime(iso: string): string {
  return `${partsOf(iso).weekday} ${clock(iso)}`;
}

/** The date tile: weekday and day number ("Sat", "24"). */
export function dateTile(iso: string): { weekday: string; day: string } {
  const p = partsOf(iso);
  return { weekday: p.weekday, day: p.day };
}

/** Whole London days from `iso` to `now` (0 today, 1 yesterday). */
export function daysAgo(iso: string, now: string): number {
  return dayNumber(now) - dayNumber(iso);
}

/** The day separator in a thread: "Today", "Yesterday", "Wed 21 Oct". */
export function dayLabel(iso: string, now: string): string {
  const days = daysAgo(iso, now);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return shortDate(iso);
}

/** The group label in Updates: "Today", "Yesterday", "Earlier". */
export function updateGroup(iso: string, now: string): "Today" | "Yesterday" | "Earlier" {
  const days = daysAgo(iso, now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return "Earlier";
}

/** The time on a row: "09:13" today, "Yesterday", then the weekday ("Wed") for the last week, then "21 Oct". */
export function rowTime(iso: string, now: string): string {
  const days = daysAgo(iso, now);
  if (days <= 0) return clock(iso);
  if (days === 1) return "Yesterday";
  if (days < 7) return partsOf(iso).weekday;
  const p = partsOf(iso);
  return `${p.day} ${p.month}`;
}

/** The time on an Updates row: "10:32" for today and yesterday, the weekday after that ("Mon"). */
export function updateTime(iso: string, now: string): string {
  const days = daysAgo(iso, now);
  if (days <= 1) return clock(iso);
  return partsOf(iso).weekday;
}

/** £22 from 2200. Whole pounds print without pence; otherwise two decimals. */
export function pounds(minor: number): string {
  const value = minor / 100;
  return `£${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

/** "3 going, 1 place left", "2 going, no places left". */
export function goingLine(plan: Pick<ChatPlan, "going" | "placesLeft">): string {
  const going = `${plan.going.length} going`;
  if (plan.placesLeft <= 0) return `${going}, no places left`;
  return `${going}, ${plan.placesLeft} ${plan.placesLeft === 1 ? "place" : "places"} left`;
}

export function firstNames(people: readonly MemberRef[]): string {
  return people.map((person) => person.firstName).join(", ");
}

/** "Tomorrow at 10:00" or "today at 10:00", for the reminder update. */
function whenWord(startsAt: string, now: string): string {
  const days = -daysAgo(startsAt, now);
  const time = clock(startsAt);
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  return `${shortDate(startsAt)} at ${time}`;
}

/** The sentence on an Updates row, from the structured update (copy as designed). */
export function updateText(update: UpdateItem, now: string): string {
  const who = update.actor?.firstName ?? "";
  const title = update.plan.title;
  switch (update.kind) {
    case "joined":
      return `${who} joined ${title}`;
    case "left":
      return `${who} left ${title}`;
    case "full":
      return `${title} is full`;
    case "place_opened":
      return `A place opened up in ${title}`;
    case "changed":
      return `${title} moved to ${clock(update.plan.startsAt)}`;
    case "cancelled":
      return update.refundMinor
        ? `${who} cancelled ${title}. ${pounds(update.refundMinor)} refunded`
        : `${who} cancelled ${title}`;
    case "reminder":
      return update.reminderHours === 2
        ? `${title} starts in 2 hours, at ${clock(update.plan.startsAt)}`
        : `${title} is ${whenWord(update.plan.startsAt, now)}`;
  }
}

/** The muted detail line under it ("Your plan · Wed 4 Nov"). */
export function updateDetail(update: UpdateItem): string {
  switch (update.kind) {
    case "joined":
    case "left":
      return `${update.role === "host" ? "Your plan" : "Plan"} · ${planDay(update.plan.startsAt)}`;
    case "full":
      return `${update.goingCount ?? 0} going, no places left`;
    case "place_opened":
      return update.plan.place;
    case "changed":
      return update.previousStartsAt
        ? `${update.plan.place} · it was ${clock(update.previousStartsAt)}`
        : update.plan.place;
    case "cancelled":
      return update.refundMinor ? "Back on your card in 5 to 10 working days" : planDay(update.plan.startsAt);
    case "reminder":
      return update.plan.place;
  }
}

/** The heading of the computer's Update card: the row's sentence with a full stop, and "your plan" where the plan is yours. */
export function updatePaneTitle(update: UpdateItem, now: string): string {
  const who = update.actor?.firstName ?? "";
  if ((update.kind === "joined" || update.kind === "left") && update.role === "host") {
    return `${who} ${update.kind === "joined" ? "joined" : "left"} your plan.`;
  }
  return `${updateText(update, now)}.`;
}

/** The small line above it: "Update · 10:32", "Update · Yesterday, 16:20", "Update · Mon 19 Oct, 19:00". */
export function updateStamp(update: UpdateItem, now: string): string {
  const days = daysAgo(update.at, now);
  if (days <= 0) return `Update · ${clock(update.at)}`;
  if (days === 1) return `Update · Yesterday, ${clock(update.at)}`;
  return `Update · ${dateAndTime(update.at)}`;
}

/** "Going · 4 of 4, full" / "Going · 3 of 4". */
export function goingHeading(plan: Pick<ChatPlan, "going" | "placesLeft">): string {
  const total = plan.going.length + Math.max(0, plan.placesLeft);
  return `Going · ${plan.going.length} of ${total}${plan.placesLeft <= 0 ? ", full" : ""}`;
}
