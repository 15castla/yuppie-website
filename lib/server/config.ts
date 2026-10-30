import "server-only";

// The members backend's fixed rules and addresses, in one place.

/** A club-event booking can be cancelled with an automatic refund until this many hours before the start (decision A-D1). */
export const FREE_CANCEL_HOURS = 48;

/** A failed membership payment ends the membership at the end of the day this many days later, Europe/London (decision C-D12). */
export const PAYMENT_GRACE_DAYS = 3;

/**
 * A refund Stripe did not answer (a timeout, a crash, a Stripe error) is tried again by the refunds job, with
 * the same idempotency key, this many times in all; after the last failure the club is alerted (QA3-07).
 */
export const MAX_REFUND_ATTEMPTS = 3;

/** The refunds job leaves a refund alone for this long after an attempt (or the cancel), so it never races one in flight. */
export const REFUND_RETRY_AFTER_MINUTES = 5;

/** Reminder emails before a club event (round 3): 24 hours and 2 hours. */
export const REMINDER_HOURS = { long: 24, short: 2 } as const;

/**
 * The sender (decision C-D6: from "Club Yuppie <noreply@clubyuppie.com>", reply-to hello@clubyuppie.com)
 * and where admin alerts go (C-D7: ADMIN_ALERTS_EMAIL, else hello@clubyuppie.com) are lib/emails' one copy.
 */
export { EMAIL_FROM, EMAIL_REPLY_TO, adminAlertsEmail } from "@/lib/emails";

/** The site's own address for links in emails and Stripe return URLs. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://clubyuppie.com").replace(/\/+$/, "");
}

export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** The address a deleted member's row and auth user are moved to, so the real address is free to apply again. */
export function tombstoneEmail(id: string): string {
  return `deleted+${id}@invalid.clubyuppie.com`;
}
