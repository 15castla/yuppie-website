// The Outreach Desk's calendar rules (Albert, 15 and 16 Nov 2026; plan docs/plans/outreach-desk.md, section 0):
//
//   one follow-up email 7 working days after the first email actually went out, or 10 working days after a letter
//   was posted; then nothing until the January round, a third email to everyone without a reply, spread across the
//   week of Mon 11 Jan 2027, a few each morning.
//
// Working days are Monday to Friday, skipping England and Wales bank holidays and 21 December to 1 January every
// year (so nothing falls due over Christmas). Dates are UK dates (Europe/London), written YYYY-MM-DD.
//
// Pure functions only (no database), so the tests and the server share them.

export const UK_TIME_ZONE = "Europe/London";

/** England and Wales bank holidays (gov.uk). Add the next year's before December. */
export const BANK_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2026
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28",
  // 2027
  "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28",
]);

/** Days of follow-up after the first email, and after a posted letter. */
export const FOLLOW_UP_AFTER_EMAIL = 7;
export const FOLLOW_UP_AFTER_LETTER = 10;
/** The January email is never closer than this to the follow-up before it. */
export const JANUARY_MIN_GAP = 7;
/** The January round (Albert, 16 Nov 2026): the week of Mon 11 Jan 2027, a few each morning. */
export const JANUARY_ROUND: readonly string[] = ["2027-01-11", "2027-01-12", "2027-01-13", "2027-01-14", "2027-01-15"];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The UK date (YYYY-MM-DD) of a moment. */
export function ukDate(value: Date | string | number = new Date()): string {
  const d = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: UK_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toUtcNoon(date: string): Date {
  if (!ISO.test(date)) throw new Error(`Not a date: ${date}`);
  return new Date(`${date}T12:00:00Z`);
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Adds calendar days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const d = toUtcNoon(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Christmas quiet: 21 December to 1 January, every year. */
export function isChristmasQuiet(date: string): boolean {
  const md = date.slice(5);
  return md >= "12-21" || md <= "01-01";
}

export function isWorkingDay(date: string): boolean {
  const day = toUtcNoon(date).getUTCDay();
  if (day === 0 || day === 6) return false;
  if (BANK_HOLIDAYS.has(date)) return false;
  return !isChristmasQuiet(date);
}

/** The date `n` working days after `date` (the start date itself never counts). */
export function addWorkingDays(date: string, n: number): string {
  let d = date;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (isWorkingDay(d)) left -= 1;
  }
  return d;
}

/** Working days from `from` to `to` (after `from`, up to and including `to`); 0 when `to` is not later. */
export function workingDaysBetween(from: string, to: string): number {
  if (to <= from) return 0;
  let n = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isWorkingDay(d)) n += 1;
  return n;
}

/** When the one follow-up is due: 7 working days after a first email went out, 10 after a letter was posted. */
export function followUpDue(channel: string, sentOn: string): string {
  return addWorkingDays(sentOn, channel === "letter" ? FOLLOW_UP_AFTER_LETTER : FOLLOW_UP_AFTER_EMAIL);
}

/**
 * The January email's day, given when the follow-up before it went out and how many January emails each day of the
 * round already holds: the least busy day at least 7 working days after the follow-up (the earliest when tied), or
 * null when no day of the round is far enough away (the round has passed for this one).
 */
export function januaryDay(previousSentOn: string, load: Record<string, number> = {}): string | null {
  const earliest = addWorkingDays(previousSentOn, JANUARY_MIN_GAP);
  const days = JANUARY_ROUND.filter((d) => d >= earliest);
  if (days.length === 0) return null;
  return days.reduce((best, d) => ((load[d] ?? 0) < (load[best] ?? 0) ? d : best), days[0]);
}

/** The effective due date of a follow-up: the later of its due date and any snooze. */
export function effectiveDue(dueOn: string, snoozedUntil: string | null | undefined): string {
  return snoozedUntil && snoozedUntil > dueOn ? snoozedUntil : dueOn;
}

/** The UK clock's offset from UTC in minutes at a moment (0 in winter, 60 in summer). */
function ukOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** A form's UK date and time ("2026-11-12T09:40" or "2026-11-12 09:40") as an ISO moment; null if it isn't one. */
export function ukLocalToIso(value: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value ?? "");
  if (!m) return null;
  const guess = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  if (Number.isNaN(guess.getTime())) return null;
  const offset = ukOffsetMinutes(new Date(guess.getTime() - ukOffsetMinutes(guess) * 60000));
  return new Date(guess.getTime() - offset * 60000).toISOString();
}

/** A moment as the UK clock shows it, for a datetime-local field ("2026-11-12T09:40"). */
export function isoToUkLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** A plain YYYY-MM-DD date, or null. */
export function isoDate(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!ISO.test(v)) return null;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || fromUtc(d) !== v ? null : v;
}
