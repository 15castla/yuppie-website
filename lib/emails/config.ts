// The settings every email shares. Edit them here, once.

/**
 * Dark mode (decision C-D1). "designed" is option B, Albert's choice: Apple
 * Mail and iOS Mail show the designed dark version (ink page, cream and
 * yellow type, yellow header and drawing bands). "light" is option A, today's
 * forced light everywhere. If the designed version looks wrong on a real
 * phone (needs_device_check: Apple Mail, Gmail, Outlook), set this to
 * "light": it is the one switch, for every email and the Supabase templates
 * (rebuild those with tests/e2e/phase-a/emails/build-supabase-templates.mjs).
 */
export const EMAIL_COLOR_SCHEME: EmailColorScheme = "designed";

export type EmailColorScheme = "designed" | "light";

/** Decision C-D6: the sender, and where replies go. */
export const EMAIL_FROM = "Club Yuppie <noreply@clubyuppie.com>";
export const EMAIL_REPLY_TO = "hello@clubyuppie.com";

/** The address in every footer ("Questions? Email …"). */
export const SUPPORT_EMAIL = "hello@clubyuppie.com";

/** Decision C-D7: Albert's alerts go to one address, ADMIN_ALERTS_EMAIL when set. */
export function adminAlertsEmail(): string {
  return process.env.ADMIN_ALERTS_EMAIL?.trim() || SUPPORT_EMAIL;
}

// ===== COMPANY LINE: the last line of every member email. Edit it here only. =====
export const COMPANY_LINE =
  "Club Yuppie Ltd. Registered in England and Wales, company number 17530492. Registered office: Parsonage Barn, Compton Street, Winchester, SO21 2AS.";
// ===== END COMPANY LINE =====

/** The plan price the shell's words use ("If you’re in, it’s £10 a month."). */
export const MEMBERSHIP_PRICE = "£10";

export const DEFAULT_SITE_URL = "https://clubyuppie.com";

/** The site the links and images point at: NEXT_PUBLIC_SITE_URL, else https://clubyuppie.com. No trailing slash. */
export function siteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return normaliseSite(fromEnv || DEFAULT_SITE_URL);
}

export function normaliseSite(url: string): string {
  return url.replace(/\/+$/, "");
}

/** An absolute link: absolute URLs (https:, http:, mailto:) pass through; a path is put on the site. */
export function absoluteUrl(link: string, site: string = siteUrl()): string {
  const value = link.trim();
  if (/^(https?:|mailto:)/i.test(value)) return value;
  return `${normaliseSite(site)}${value.startsWith("/") ? "" : "/"}${value}`;
}

/**
 * The footer link "Choose what we email you" goes to the Notifications page,
 * which is Phase B and 404s while its flag is off, so the link is drawn only
 * when NEXT_PUBLIC_MEMBERS_NOTIFICATIONS is on (the same test as
 * lib/members/flags.ts, written out so this module stays free of Next imports).
 * The path is ROUTES.youNotifications.
 */
export const NOTIFICATIONS_PATH = "/members/you/notifications";
export function notificationsLinkOn(): boolean {
  return process.env.NEXT_PUBLIC_MEMBERS_NOTIFICATIONS === "on";
}

/**
 * Members pages the stage 2 emails link to by default, written out as in lib/members/routes.ts (ROUTES.openInvite,
 * ROUTES.messages) so this module stays free of app imports. The designs draw /members/invite: the route is
 * /members/open-invite.
 */
export const OPEN_INVITE_PATH = "/members/open-invite";
export const MESSAGES_PATH = "/members/messages";

/** The pictures, hosted from public/email/ (absolute URLs: mail apps cannot read relative ones). */
export const EMAIL_IMAGES = {
  logo: { file: "yuppie-logo@2x.png", width: 150, height: 50 },
  coupes: { file: "email-coupes@2x.png", width: 150, height: 129 },
  group: { file: "email-group@2x.png", width: 240, height: 315 },
  rope: { file: "email-rope@2x.png", width: 148, height: 109 },
} as const;

export type EmailArt = "coupes" | "group" | "rope";

export function imageUrl(file: string, site: string = siteUrl()): string {
  return `${normaliseSite(site)}/email/${file}`;
}

const MAPS = "https://www.google.com/maps/search/?api=1&query=";

/** A Google Maps search link for an address or a venue ("Northgate+Courts%2C+1+Sample+Road"). */
export function mapsUrl(query: string): string {
  return MAPS + encodeURIComponent(query).replace(/%20/g, "+");
}

/** "Thu 12 Nov" to "12 Nov" (the design's short form inside a sentence). */
export function shortDate(date: string): string {
  return date.replace(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+/, "").trim();
}

/** The first word of a full name ("Hannah Reed" to "Hannah"). */
export function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}
