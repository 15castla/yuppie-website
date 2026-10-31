import "server-only";

// Event data the members backend owns: the exact address (event_addresses,
// shown only to members with a confirmed booking, A-D3), the Attendees list
// and its CSV (B-D7), Add to calendar, and "the club moved this event"
// (changed_at and the event-changed email, C-D11).

import { parsePhoneNumberFromString } from "libphonenumber-js";

import { eventHref } from "@/lib/members/routes";
import { absoluteUrl } from "./config";
import { EVENT_ROW_COLUMNS, one, serviceDb, type BookingCancelReason, type BookingCancelledBy, type BookingStatus, type EventRow, type RefundStatus } from "./db";
import { buildIcs, googleCalendarUrl, icsFilename } from "./calendar";
import { dayDate, dayDateTime, pounds, time24 } from "./format";
import { sendEmail } from "./messages";
import { channelOn, prefsRows, topicOn } from "./notification-prefs";

// ---------------------------------------------------------------------------
// Address
// ---------------------------------------------------------------------------

/** The exact address, for admin pages. */
export async function getEventAddress(eventId: string): Promise<string | null> {
  const { data } = await serviceDb().from("event_addresses").select("address").eq("event_id", eventId).maybeSingle();
  return data?.address?.trim() || null;
}

/** The exact address, only for a member with a confirmed booking on this event. Null otherwise. */
export async function getEventAddressForMember(memberId: string, eventId: string): Promise<string | null> {
  const db = serviceDb();
  const { data: booking } = await db
    .from("bookings")
    .select("id")
    .eq("member_id", memberId)
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .limit(1)
    .maybeSingle();
  if (!booking) return null;
  return getEventAddress(eventId);
}

/** Save (or with an empty value, remove) the exact address. Admin callers only. */
export async function setEventAddress(eventId: string, address: string | null | undefined): Promise<{ ok: boolean; error?: string }> {
  const db = serviceDb();
  const value = address?.trim() ?? "";
  const { error } = value
    ? await db.from("event_addresses").upsert({ event_id: eventId, address: value }, { onConflict: "event_id" })
    : await db.from("event_addresses").delete().eq("event_id", eventId);
  if (error) {
    console.error(`setEventAddress ${eventId} failed:`, error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Attendees (admin)
// ---------------------------------------------------------------------------

export type AttendeeRow = {
  bookingId: string;
  memberId: string;
  name: string;
  email: string;
  phone: string | null;
  status: BookingStatus;
  bookedAt: string;
  amountPence: number;
  cancelledAt: string | null;
  cancelledBy: BookingCancelledBy | null;
  cancelReason: BookingCancelReason | null;
  refundStatus: RefundStatus;
  refundPence: number | null;
  refundError: string | null;
};

export type AttendeeList = {
  event: Pick<EventRow, "id" | "slug" | "title" | "start_time" | "capacity" | "cancelled_at"> | null;
  confirmedCount: number;
  cancelledCount: number;
  /** Confirmed first (by booking time), then cancelled (latest first). */
  attendees: AttendeeRow[];
};

export async function listAttendees(eventId: string): Promise<AttendeeList> {
  const db = serviceDb();
  const [{ data: event }, { data: rows, error }] = await Promise.all([
    db.from("events").select("id, slug, title, start_time, capacity, cancelled_at").eq("id", eventId).maybeSingle(),
    db
      .from("bookings")
      .select(
        "id, member_id, status, booked_at, amount_pence, cancelled_at, cancelled_by, cancel_reason, refund_status, refund_pence, refund_error, member:members(full_name, email, phone)",
      )
      .eq("event_id", eventId),
  ]);
  if (error) console.error(`listAttendees ${eventId} failed:`, error);
  type Raw = {
    id: string;
    member_id: string;
    status: BookingStatus;
    booked_at: string;
    amount_pence: number;
    cancelled_at: string | null;
    cancelled_by: BookingCancelledBy | null;
    cancel_reason: BookingCancelReason | null;
    refund_status: RefundStatus;
    refund_pence: number | null;
    refund_error: string | null;
    member: { full_name: string | null; email: string; phone: string | null } | { full_name: string | null; email: string; phone: string | null }[] | null;
  };
  const attendees: AttendeeRow[] = ((rows ?? []) as unknown as Raw[]).map((r) => {
    const m = one(r.member);
    return {
      bookingId: r.id,
      memberId: r.member_id,
      name: m?.full_name?.trim() || m?.email || "Member",
      email: m?.email ?? "",
      phone: m?.phone ?? null,
      status: r.status,
      bookedAt: r.booked_at,
      amountPence: r.amount_pence,
      cancelledAt: r.cancelled_at,
      cancelledBy: r.cancelled_by,
      cancelReason: r.cancel_reason,
      refundStatus: r.refund_status,
      refundPence: r.refund_pence,
      refundError: r.refund_error,
    };
  });
  attendees.sort((a, b) => {
    if (a.status !== b.status) return a.status === "confirmed" ? -1 : 1;
    if (a.status === "confirmed") return a.bookedAt.localeCompare(b.bookedAt);
    return (b.cancelledAt ?? "").localeCompare(a.cancelledAt ?? "");
  });
  return {
    event: (event as AttendeeList["event"]) ?? null,
    confirmedCount: attendees.filter((a) => a.status === "confirmed").length,
    cancelledCount: attendees.filter((a) => a.status === "cancelled").length,
    attendees,
  };
}

const CANCEL_REASON_WORDS: Record<BookingCancelReason, string> = {
  member: "Member cancelled",
  member_late: "Member cancelled late, no refund",
  event_cancelled: "Event cancelled",
  event_changed: "Member cancelled after a change",
  membership_ended: "Membership ended",
  account_deleted: "Account deleted",
  admin: "Cancelled by the club",
};

const REFUND_WORDS: Record<RefundStatus, string> = {
  none: "",
  pending: "Refund pending",
  succeeded: "Refunded",
  failed: "Refund failed",
};

function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  // A cell a spreadsheet would run as a formula is written as text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * A phone number as the CSV writes it (QA2-10): a UK number the way You shows it, "07700 900123"; any other
 * country with "00" for "+", "0033 6 12 34 56 78". Neither starts with a formula character, so the cell needs
 * no guard apostrophe and a spreadsheet keeps it as written.
 */
function csvPhone(phone: string | null): string {
  const value = phone?.trim();
  if (!value) return "";
  const parsed = parsePhoneNumberFromString(value, "GB");
  if (!parsed) return value.replace(/^\+/, "00");
  if (parsed.countryCallingCode === "44") return parsed.formatNational();
  return parsed.formatInternational().replace(/^\+/, "00");
}

/** The Attendees list as CSV (Export list, B-D7). UTF-8 with a byte order mark so Excel shows £ right. */
export function attendeesCsv(list: AttendeeList): string {
  const header = ["Name", "Email", "Phone", "Status", "Booked", "Paid", "Cancelled", "Why", "Refund", "Refunded"];
  const rows = list.attendees.map((a) => [
    a.name,
    a.email,
    csvPhone(a.phone),
    a.status === "confirmed" ? "Booked" : "Cancelled",
    dayDateTime(a.bookedAt),
    a.amountPence > 0 ? pounds(a.amountPence) : "Included",
    a.cancelledAt ? dayDateTime(a.cancelledAt) : "",
    a.cancelReason ? CANCEL_REASON_WORDS[a.cancelReason] : "",
    REFUND_WORDS[a.refundStatus],
    a.refundPence ? pounds(a.refundPence) : "",
  ]);
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function attendeesCsvFilename(event: AttendeeList["event"]): string {
  const slug = event?.slug?.replace(/[^a-z0-9-]+/gi, "-") || "event";
  return `${slug}-attendees.csv`;
}

// ---------------------------------------------------------------------------
// Add to calendar
// ---------------------------------------------------------------------------

export type CalendarData = { ics: string; filename: string; googleUrl: string; title: string };

/** The calendar file and Google link for a member's confirmed booking, with the exact address. Null when not booked. */
export async function calendarForMember(memberId: string, eventIdOrSlug: { id?: string; slug?: string }): Promise<CalendarData | null> {
  const db = serviceDb();
  let query = db.from("events").select("id, slug, title, location, start_time, end_time, cancelled_at");
  query = eventIdOrSlug.id ? query.eq("id", eventIdOrSlug.id) : query.eq("slug", eventIdOrSlug.slug ?? "");
  const { data: event } = await query.maybeSingle();
  if (!event || event.cancelled_at) return null;
  const address = await getEventAddressForMember(memberId, event.id);
  const { data: booking } = await db
    .from("bookings")
    .select("id")
    .eq("member_id", memberId)
    .eq("event_id", event.id)
    .eq("status", "confirmed")
    .limit(1)
    .maybeSingle();
  if (!booking) return null;
  const venue = event.location?.trim() || "";
  const location = [venue, address].filter(Boolean).join(", ") || null;
  const url = absoluteUrl(eventHref(event.slug));
  const calendarEvent = {
    uid: `booking-${booking.id}@clubyuppie.com`,
    title: event.title,
    start: event.start_time,
    end: event.end_time,
    location,
    description: `Your Club Yuppie booking: ${url}`,
    url,
  };
  return { ics: buildIcs(calendarEvent), filename: icsFilename(event.slug), googleUrl: googleCalendarUrl(calendarEvent), title: event.title };
}

// ---------------------------------------------------------------------------
// The club moved an event (C-D11)
// ---------------------------------------------------------------------------

export type EventPlaceTime = { start_time: string; location: string | null; address: string | null };
export type EventMove = "time" | "place" | "both";

export function detectEventMove(before: EventPlaceTime, after: EventPlaceTime): EventMove | null {
  const time = new Date(before.start_time).getTime() !== new Date(after.start_time).getTime();
  const norm = (s: string | null) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const place = norm(before.location) !== norm(after.location) || norm(before.address) !== norm(after.address);
  if (time && place) return "both";
  if (time) return "time";
  if (place) return "place";
  return null;
}

/**
 * After an admin saves an event: if the date, time or place changed and the
 * event has confirmed bookings, set changed_at (every booking made before it
 * may now be cancelled for a full refund, whatever the date).
 */
export async function recordEventMove(
  eventId: string,
  before: EventPlaceTime,
  after: EventPlaceTime,
): Promise<{ moved: EventMove | null; bookedCount: number; changedAt: string | null }> {
  const moved = detectEventMove(before, after);
  const db = serviceDb();
  const { count } = await db
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "confirmed");
  const bookedCount = count ?? 0;
  if (!moved || bookedCount === 0) return { moved, bookedCount, changedAt: null };
  const changedAt = new Date().toISOString();
  const { error } = await db.from("events").update({ changed_at: changedAt }).eq("id", eventId);
  if (error) {
    console.error(`recordEventMove ${eventId} failed:`, error);
    return { moved, bookedCount, changedAt: null };
  }
  return { moved, bookedCount, changedAt };
}

/** Email every member with a confirmed booking that the event moved (event-changed). Once per booking per change. */
export async function emailEventMove(
  eventId: string,
  change: { moved: EventMove; before: EventPlaceTime; changedAt: string | null },
): Promise<{ emailed: number; failed: number }> {
  const db = serviceDb();
  const { data: event } = await db.from("events").select(EVENT_ROW_COLUMNS).eq("id", eventId).maybeSingle<EventRow>();
  if (!event) return { emailed: 0, failed: 0 };
  const address = await getEventAddress(eventId);
  const { data: bookings } = await db
    .from("bookings")
    .select("id, member_id, amount_pence, member:members(email)")
    .eq("event_id", eventId)
    .eq("status", "confirmed");
  let emailed = 0;
  let failed = 0;
  const stamp = change.changedAt ?? event.changed_at ?? new Date().toISOString();
  const rows = (bookings ?? []) as unknown as { id: string; member_id: string; amount_pence: number; member: { email: string } | { email: string }[] | null }[];
  // Stage 2: the member's switches decide (Club events > Changes, and Email; notifications spec 3.5 "club.changed").
  // No row means the defaults (both on), so stage 1's behaviour is unchanged for anyone who never touched them.
  const prefs = await prefsRows(rows.map((b) => b.member_id));
  for (const b of rows) {
    const p = prefs.get(b.member_id);
    if (p && !(topicOn(p, "clubChanges") && channelOn(p, "email"))) continue;
    const result = await sendEmail({
      template: "event-changed",
      to: one(b.member)?.email,
      data: {
        moved: change.moved,
        event: { title: event.title, start: { date: dayDate(event.start_time), time: time24(event.start_time) } },
        wasStart: change.moved !== "place" ? { date: dayDate(change.before.start_time), time: time24(change.before.start_time) } : undefined,
        wasVenue: change.moved !== "time" ? change.before.location?.trim() || undefined : undefined,
        place: { venue: event.location?.trim() || event.title, address },
        paid: b.amount_pence > 0 ? pounds(b.amount_pence) : null,
        bookingUrl: eventHref(event.slug),
      },
      dedupeKey: `event-changed:${b.id}:${stamp}`,
      refs: { memberId: b.member_id, bookingId: b.id, eventId },
    });
    if (result.status === "sent") emailed += 1;
    if (result.status === "failed") failed += 1;
  }
  return { emailed, failed };
}
