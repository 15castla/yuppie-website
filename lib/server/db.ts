import "server-only";

// The service-role client for server code (bypasses RLS: every caller checks
// who is asking first), and the row shapes the members backend reads.

import { createAdminSupabaseClient } from "@/app/admin/admin-client";

export const serviceDb = createAdminSupabaseClient;
export type ServiceDb = ReturnType<typeof createAdminSupabaseClient>;

export type MembershipStatus = "active" | "paused" | "cancelled";
export type EndedReason = "member_cancelled" | "payment_failed" | "admin_cancelled" | "account_deleted";

/** The members columns the backend reads. */
export const MEMBER_ROW_COLUMNS =
  "id, email, full_name, phone, employer, role_title, bio, avatar_url, photo_id, membership_status, stripe_customer_id, stripe_subscription_id, created_at, cancel_at, cancel_requested_at, cancel_reason, payment_failed_at, grace_until, paused_at, ended_at, ended_reason, deleted_at, updated_at";

export type MemberRow = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  employer: string | null;
  role_title: string | null;
  bio: string | null;
  avatar_url: string | null;
  photo_id: string | null;
  membership_status: MembershipStatus | string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  cancel_at: string | null;
  cancel_requested_at: string | null;
  cancel_reason: string | null;
  payment_failed_at: string | null;
  grace_until: string | null;
  paused_at: string | null;
  ended_at: string | null;
  ended_reason: EndedReason | null;
  deleted_at: string | null;
  updated_at: string | null;
};

export type BookingStatus = "confirmed" | "cancelled";
export type BookingCancelledBy = "member" | "club" | "system";
export type BookingCancelReason =
  | "member"
  | "member_late"
  | "event_cancelled"
  | "event_changed"
  | "membership_ended"
  | "account_deleted"
  | "admin";
export type RefundStatus = "none" | "pending" | "succeeded" | "failed";

export const BOOKING_ROW_COLUMNS =
  "id, member_id, event_id, status, stripe_payment_intent_id, booked_at, amount_pence, cancelled_at, cancelled_by, cancel_reason, refund_status, refund_pence, stripe_refund_id, refund_error, reminder_24h_sent_at, reminder_2h_sent_at";

export type BookingRow = {
  id: string;
  member_id: string;
  event_id: string;
  status: BookingStatus;
  stripe_payment_intent_id: string | null;
  booked_at: string;
  amount_pence: number;
  cancelled_at: string | null;
  cancelled_by: BookingCancelledBy | null;
  cancel_reason: BookingCancelReason | null;
  refund_status: RefundStatus;
  refund_pence: number | null;
  stripe_refund_id: string | null;
  refund_error: string | null;
  reminder_24h_sent_at: string | null;
  reminder_2h_sent_at: string | null;
};

export const EVENT_ROW_COLUMNS =
  "id, slug, title, location, start_time, end_time, price_pence, capacity, cancelled_at, cancel_note, changed_at";

export type EventRow = {
  id: string;
  slug: string;
  title: string;
  location: string | null;
  start_time: string;
  end_time: string | null;
  price_pence: number;
  capacity: number | null;
  cancelled_at: string | null;
  cancel_note: string | null;
  changed_at: string | null;
};

/** A supabase-js embedded row comes back as an object or a one-element array, depending on the relation. */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** The Stripe error code, when there is one. */
export function stripeErrorCode(err: unknown): string | undefined {
  return err && typeof err === "object" && "code" in err && typeof err.code === "string" ? err.code : undefined;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") return err.message;
  return String(err);
}
