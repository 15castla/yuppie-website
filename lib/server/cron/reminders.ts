import "server-only";

// The reminders job: the event reminder email 24 hours and 2 hours before a
// club event (round 3; texts come in Phase B). Safe to run every 15 minutes
// and to overlap: each booking's reminder is claimed by setting its
// reminder_*_sent_at in one conditional update before the email goes, and a
// failed send gives the claim back for the next run.
//
// Windows: the 24-hour email goes when the event is 24 hours or less away but
// still more than 2 hours away, to bookings made before the 24-hour mark; the
// 2-hour email when it is 2 hours or less away and not started, to bookings
// made before the 2-hour mark. A booking made later than its mark gets no
// reminder for it (the member has just booked). Cancelled events, cancelled
// bookings and paused or ended members get none.

import { eventHref } from "@/lib/members/routes";
import { REMINDER_HOURS } from "../config";
import { BOOKING_ROW_COLUMNS, EVENT_ROW_COLUMNS, MEMBER_ROW_COLUMNS, one, serviceDb, type BookingRow, type EventRow, type MemberRow } from "../db";
import { dayDate, time24 } from "../format";
import { isGated, membershipState } from "../membership";
import { sendEmail } from "../messages";

const HOUR = 60 * 60 * 1000;

export type RemindersSummary = { checked: number; sent24h: number; sent2h: number; failed: number; skipped: number };

type Row = BookingRow & {
  event: (EventRow & { address: { address: string } | { address: string }[] | null }) | (EventRow & { address: { address: string } | { address: string }[] | null })[] | null;
  member: MemberRow | MemberRow[] | null;
};

export async function runReminders(now: Date = new Date()): Promise<RemindersSummary> {
  const db = serviceDb();
  const summary: RemindersSummary = { checked: 0, sent24h: 0, sent2h: 0, failed: 0, skipped: 0 };
  const { data, error } = await db
    .from("bookings")
    .select(`${BOOKING_ROW_COLUMNS}, event:events!inner(${EVENT_ROW_COLUMNS}, address:event_addresses(address)), member:members(${MEMBER_ROW_COLUMNS})`)
    .eq("status", "confirmed")
    .is("event.cancelled_at", null)
    .gt("event.start_time", now.toISOString())
    .lte("event.start_time", new Date(now.getTime() + REMINDER_HOURS.long * HOUR).toISOString())
    .or("reminder_24h_sent_at.is.null,reminder_2h_sent_at.is.null");
  if (error) throw error;

  for (const row of (data ?? []) as unknown as Row[]) {
    summary.checked += 1;
    const event = one(row.event);
    const member = one(row.member);
    if (!event || !member) continue;
    if (isGated(membershipState(member, now).state)) {
      summary.skipped += 1;
      continue;
    }
    const start = new Date(event.start_time).getTime();
    const left = start - now.getTime();
    const booked = new Date(row.booked_at).getTime();

    let window: "24h" | "2h" | null = null;
    if (left <= REMINDER_HOURS.short * HOUR) {
      if (!row.reminder_2h_sent_at && booked <= start - REMINDER_HOURS.short * HOUR) window = "2h";
    } else if (!row.reminder_24h_sent_at && booked <= start - REMINDER_HOURS.long * HOUR) {
      window = "24h";
    }
    if (!window) continue;

    const column = window === "24h" ? "reminder_24h_sent_at" : "reminder_2h_sent_at";
    const { data: claimed } = await db
      .from("bookings")
      .update({ [column]: now.toISOString() })
      .eq("id", row.id)
      .is(column, null)
      .select("id");
    if (!claimed?.length) continue;

    const address = one(event.address)?.address?.trim() || null;
    const result = await sendEmail({
      template: "event-reminder",
      to: member.email,
      data: {
        window,
        event: { title: event.title, start: { date: dayDate(event.start_time), time: time24(event.start_time) } },
        place: { venue: event.location?.trim() || event.title, address },
        bookingUrl: eventHref(event.slug),
      },
      dedupeKey: `event-reminder-${window}:${row.id}`,
      refs: { memberId: member.id, bookingId: row.id, eventId: event.id },
    });
    if (result.status === "failed") {
      summary.failed += 1;
      await db.from("bookings").update({ [column]: null }).eq("id", row.id);
    } else if (result.status === "sent") {
      if (window === "24h") summary.sent24h += 1;
      else summary.sent2h += 1;
    } else {
      summary.skipped += 1;
    }
  }
  return summary;
}
