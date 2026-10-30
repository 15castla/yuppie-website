"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { audit } from "@/lib/server/audit";
import { cancelBookingsForEvent } from "@/lib/server/bookings";
import { serviceDb } from "@/lib/server/db";
import {
  attendeesCsv,
  attendeesCsvFilename,
  emailEventMove,
  getEventAddress,
  listAttendees,
  type AttendeeList,
  type EventMove,
  type EventPlaceTime,
} from "@/lib/server/events";
import { requireAdmin } from "./require-admin";

// Admin event actions for r2b Events: Cancel event (B-D8), the email to
// booked members after a move (C-D11), the Attendees tab and its CSV (B-D7),
// and reading the exact address for the edit form. Every write is audited.

export type CancelEventResult =
  | { ok: true; cancelled: number; refunded: number; refundFailed: number }
  | { ok: false; error: string };

/**
 * Cancel event: marks it cancelled, cancels every confirmed booking, refunds
 * the paid ones in full and emails each member (with the optional reason,
 * the words after "because"). Safe to press again: what is done is skipped.
 * A refund Stripe refuses is left "failed" and the club inbox is told.
 */
export async function adminCancelEvent(eventId: string, options: { note?: string | null } = {}): Promise<CancelEventResult> {
  const admin = await requireAdmin();
  if (!eventId) return { ok: false, error: "That event couldn’t be found." };
  // QA2-05: an event that has started is read only. Nothing is cancelled or refunded (the card hides the button).
  const { data: event } = await serviceDb().from("events").select("start_time, cancelled_at").eq("id", eventId).maybeSingle();
  if (!event) return { ok: false, error: "That event couldn’t be found." };
  if (!event.cancelled_at && new Date(event.start_time as string).getTime() <= Date.now()) {
    await audit(admin.id, "event.cancel_refused", { type: "event", id: eventId }, { reason: "started" });
    return { ok: false, error: "This event has started, so it can’t be cancelled. Nothing was refunded." };
  }
  const summary = await cancelBookingsForEvent(eventId, admin.id, { note: options.note ?? null });
  await audit(admin.id, "event.cancel", { type: "event", id: eventId }, { note: options.note ?? null, ...summary });
  if (!summary.ok) return { ok: false, error: summary.error === "not_found" ? "That event couldn’t be found." : "We couldn’t cancel that event. Try again in a moment." };
  revalidateTag("events", "minutes");
  revalidatePath("/admin/events");
  revalidatePath("/members", "layout");
  return { ok: true, cancelled: summary.cancelled, refunded: summary.refunded, refundFailed: summary.refundFailed };
}

/**
 * Email the booked members about the last date, time or place change saved
 * for this event (updateEventDetails records it). Each member is emailed
 * once per change, however often this is pressed.
 */
export async function adminEmailEventChange(eventId: string): Promise<{ ok: true; emailed: number; failed: number } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  if (!eventId) return { ok: false, error: "That event couldn’t be found." };
  const { data: event } = await serviceDb().from("events").select("start_time, cancelled_at, changed_at").eq("id", eventId).maybeSingle();
  if (!event) return { ok: false, error: "That event couldn’t be found." };
  if (event.cancelled_at) return { ok: false, error: "This event is cancelled, so there’s no change to tell anyone about." };
  if (new Date(event.start_time as string).getTime() <= Date.now()) return { ok: false, error: "This event has started, so there’s no change to tell anyone about." };
  const { data: last } = await serviceDb()
    .from("admin_audit")
    .select("details")
    .eq("action", "event.update")
    .eq("target_type", "event")
    .eq("target_id", eventId)
    .not("details->>moved", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const details = last?.details as { moved?: EventMove | null; before?: EventPlaceTime; changed_at?: string | null } | undefined;
  if (!details?.moved || !details.before) return { ok: false, error: "There’s no date, time or place change to tell members about." };
  const result = await emailEventMove(eventId, { moved: details.moved, before: details.before, changedAt: details.changed_at ?? null });
  // QA2-06: told. The card stops offering "Email them now" until the next change (or offers it again if any failed).
  if (result.failed === 0) await serviceDb().from("events").update({ change_emailed_at: new Date().toISOString() }).eq("id", eventId);
  await audit(admin.id, "event.email_change", { type: "event", id: eventId }, { moved: details.moved, ...result });
  revalidatePath("/admin/events");
  return { ok: true, ...result };
}

/** The Attendees tab: confirmed first, then cancelled, with counts. */
export async function adminGetAttendees(eventId: string): Promise<AttendeeList> {
  await requireAdmin();
  return listAttendees(eventId);
}

/** Export list (.csv). The same file is served by GET /api/admin/events/<id>/attendees. */
export async function adminExportAttendees(eventId: string): Promise<{ filename: string; csv: string }> {
  const admin = await requireAdmin();
  const list = await listAttendees(eventId);
  await audit(admin.id, "event.export_attendees", { type: "event", id: eventId }, { rows: list.attendees.length });
  return { filename: attendeesCsvFilename(list.event), csv: attendeesCsv(list) };
}

/** The exact address, for the edit form's Address field. */
export async function adminGetEventAddress(eventId: string): Promise<string | null> {
  await requireAdmin();
  return getEventAddress(eventId);
}
