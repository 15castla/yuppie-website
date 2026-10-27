import "server-only";

// The members backend's fixed rules and addresses, in one place.

/** A club-event booking can be cancelled with an automatic refund until this many hours before the start (decision A-D1). */
export const FREE_CANCEL_HOURS = 48;

/** A failed membership payment ends the membership at the end of the day this many days later, Europe/London (decision C-D12). */
export const PAYMENT_GRACE_DAYS = 3;

/** Reminder emails before a club event (round 3): 24 hours and 2 hours. */
export const REMINDER_HOURS = { long: 24, short: 2 } as const;

/** Every email the server sends comes from here, with replies to the club inbox (decision C-D6). */
export const EMAIL_FROM = "Club Yuppie <noreply@clubyuppie.com>";
export const EMAIL_REPLY_TO = "hello@clubyuppie.com";

/** Where admin alerts go (new application, booking needs review, refund failed). Decision C-D7. */
export function adminAlertsEmail(): string {
  return process.env.ADMIN_ALERTS_EMAIL?.trim() || "hello@clubyuppie.com";
}

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
