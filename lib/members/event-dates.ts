// How the members area writes the date and time of a club event: the club's
// own clock (Europe/London), 24-hour times with a leading zero, a three-letter
// weekday for the date column, and a month heading that carries the year only
// when it is not the current one. Pure functions, no React: the Events list,
// Your plans and the preview harness all use them.
//
// components/members/ui.tsx has older versions of the same helpers (upper-case
// weekday, no leading-zero guarantee on every engine). Those stay for the old
// pages; the rebuilt pages use these.

export const EVENT_TIME_ZONE = "Europe/London";

/** "Thu" and 29, for the 44px date column. The CSS upper-cases the weekday. */
export function rowDate(iso: string): { weekday: string; day: number } {
  const date = new Date(iso);
  return {
    weekday: date.toLocaleDateString("en-GB", { weekday: "short", timeZone: EVENT_TIME_ZONE }),
    day: Number(
      new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: EVENT_TIME_ZONE }).format(date),
    ),
  };
}

/** "18:30" and "07:00". */
export function rowTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: EVENT_TIME_ZONE,
  });
}

/** "18:30 · Northgate Courts", or just the time when there is no place. */
export function timeAndPlace(iso: string, place: string | null | undefined): string {
  const where = place?.trim();
  return where ? `${rowTime(iso)} · ${where}` : rowTime(iso);
}

function yearAndMonth(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", timeZone: EVENT_TIME_ZONE })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return { year: parts.year, month: parts.month };
}

/** A sortable key ("2026-11") and a heading ("November", or "January 2027" outside the current year). */
export function monthGroup(iso: string, now: Date = new Date()): { key: string; label: string } {
  const date = new Date(iso);
  const { year, month } = yearAndMonth(date);
  const name = date.toLocaleDateString("en-GB", { month: "long", timeZone: EVENT_TIME_ZONE });
  return { key: `${year}-${month}`, label: year === yearAndMonth(now).year ? name : `${name} ${year}` };
}

export type MonthGroup<T> = { key: string; label: string; items: T[] };

/**
 * Items grouped by calendar month, in the order given (sort first). The
 * order of the groups follows the order of the items, so a list sorted
 * newest first (Past) gives the newest month first.
 */
export function groupByMonth<T>(
  items: readonly T[],
  startsAt: (item: T) => string,
  now: Date = new Date(),
): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = [];
  for (const item of items) {
    const { key, label } = monthGroup(startsAt(item), now);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label, items: [item] });
  }
  return groups;
}

/** "1 event", "2 events". */
export function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
