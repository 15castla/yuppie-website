// Add to calendar (r2a section 4): an .ics file (Apple Calendar, Outlook, the
// app) and a Google Calendar link. Written by hand (no dependency): RFC 5545,
// CRLF lines, escaped text, long lines folded at 75 octets. The event holds
// title, start and end (two hours if none), place name and exact address, and
// a link back to the booking. No alarm: the reminders are ours.

export type CalendarEvent = {
  uid: string;
  title: string;
  start: string | Date;
  end?: string | Date | null;
  /** "Northgate Courts, 1 Sample Road, Anytown AB1 2CD". */
  location?: string | null;
  description?: string | null;
  url?: string | null;
};

const TWO_HOURS = 2 * 60 * 60 * 1000;

function utcStamp(value: string | Date): string {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Fold at 75 octets (UTF-8), continuation lines start with one space.
function fold(line: string): string {
  const bytes = (s: string) => Buffer.byteLength(s, "utf8");
  if (bytes(line) <= 75) return line;
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74;
    if (bytes(current + ch) > limit) {
      out.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.join("\r\n ");
}

export function endOf(event: Pick<CalendarEvent, "start" | "end">): Date {
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : null;
  return end && end.getTime() > start.getTime() ? end : new Date(start.getTime() + TWO_HOURS);
}

export function buildIcs(event: CalendarEvent, now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Club Yuppie//Members//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(event.start)}`,
    `DTEND:${utcStamp(endOf(event))}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${utcStamp(event.start)}/${utcStamp(endOf(event))}`,
    ...(event.location ? { location: event.location } : {}),
    ...(event.description || event.url ? { details: [event.description, event.url].filter(Boolean).join("\n\n") } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** A filename for the download: "padel-and-pints.ics". */
export function icsFilename(slug: string): string {
  return `${slug.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "event"}.ics`;
}
