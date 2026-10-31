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

// ---------------------------------------------------------------------------- stage 2 (Phase B)

/** Chat messages: 500 characters (types.ts MESSAGE_MAX_LENGTH), and at most this many a minute from one member (messages spec 8). */
export const MESSAGE_RATE_LIMIT = { count: 20, perSeconds: 60 } as const;

/** A thread shows the latest this many items (older ones are not sent to the page). */
export const THREAD_ITEM_LIMIT = 200;

/** The chat email (msg-email-new-message): unread after 15 minutes, at most one per chat an hour (messages spec 3.7). */
export const CHAT_NUDGE = { afterMinutes: 15, everyMinutes: 60 } as const;

/** The Updates tab keeps 30 days (messages spec 8); older rows are deleted by the reminders job. */
export const UPDATES_KEEP_DAYS = 30;

/**
 * Quiet hours (notifications decision 2 B): no push or text from 22:00 to 07:00, Europe/London. A reminder text
 * due then goes at 07:00 if the plan or event is still more than an hour away, otherwise it is skipped. Email is
 * not held.
 */
export const QUIET_HOURS = { from: 22, until: 7, minLeadMinutes: 60 } as const;

/** A reminder text sent this long after it fell due was held (quiet hours) or late (the job was down). */
export const REMINDER_LATE_MINUTES = 20;

/** Member photos: the private bucket, the sizes the server makes, and how long a signed URL lasts. */
export const PHOTO_BUCKET = "member-photos";
export const PHOTO_SIZES = { full: 480, thumb: 160 } as const;
/** The browser checks the chosen photo is 400px or more (photo decision 2 A); the cropped square it uploads can be smaller after a zoom, so the server's floor is the thumb size. */
export const PHOTO_MIN_UPLOAD_PX = 160;
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
/** Signed photo URLs last 10 minutes (a removed photo stops loading soon after); a cached one is handed out again while it has 5 minutes or more left, and every page load asks again. */
export const PHOTO_URL_TTL_SECONDS = 10 * 60;
export const PHOTO_URL_MIN_LEFT_SECONDS = 5 * 60;

/**
 * Members who joined before this date (or MEMBERS_PHOTO_GATE_SINCE) are "existing" at the photo gate: they see
 * "Every member has one now, so people know who they're meeting." (photo spec 1).
 */
export function photoGateSince(): Date {
  const raw = process.env.MEMBERS_PHOTO_GATE_SINCE?.trim();
  const date = raw ? new Date(raw) : new Date("2026-11-01T00:00:00Z");
  return Number.isNaN(date.getTime()) ? new Date("2026-11-01T00:00:00Z") : date;
}

/**
 * Push is not in stage 2 (it needs the native release's keys): the preference is stored, nothing is sent, and the
 * Push channel stays hidden until this server-only switch is "on".
 */
export function pushLive(): boolean {
  return process.env.MEMBERS_PUSH_LIVE === "on";
}

/**
 * Member photos are fully private only once the old public copies in member-media/avatars/ are deleted
 * (release/delete-public-avatars.mjs --apply). Until this server-only switch is "on", no page may say a photo
 * is never public.
 */
export function photosPrivateDone(): boolean {
  return process.env.MEMBERS_PHOTOS_PRIVATE_DONE === "on";
}

/**
 * Paid plans are stage 3 (Stripe Connect). Until this server-only switch is "on" (never in stage 2), nothing may
 * take or pretend to take money: the post form offers free plans only, no plan with a price is shown, and no
 * server path makes a PaymentIntent or a hold.
 */
export function paidPlansLive(): boolean {
  return process.env.MEMBERS_PAID_PLANS_LIVE === "on";
}

// ---------------------------------------------------------------------------- stage 2 fixes (31 Oct 2026)

/**
 * Texts cost money and land on a phone (QB2-02, QB3-12). The check text ("reminders by text are on"): at most one
 * per number in any 24 hours (switching Text off and on again for the same number sends no new one), a new number
 * gets its own, and at most checksPerDay check texts per member in any 24 hours whatever the numbers. All texts:
 * at most perMemberPerDay per member in any 24 hours (one over the cap is skipped and logged). Two reminders each
 * for two events and a plan in one day is six.
 */
export const TEXT_LIMITS = { checkEveryHours: 24, checksPerDay: 3, perMemberPerDay: 8 } as const;

/**
 * Admin actions on a report or a photo claim it first (QB3-01): a claim older than this is stale (the server
 * stopped mid-action) and can be taken again.
 */
export const ADMIN_CLAIM_STALE_SECONDS = 120;

/**
 * A photo just kept or removed stays claimed this long, so a second admin's Keep or Remove sent at the same moment
 * changes nothing and is told so (QB3-01).
 */
export const PHOTO_REVIEW_HOLD_SECONDS = 15;
