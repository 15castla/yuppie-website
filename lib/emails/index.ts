// lib/emails: every email and text Club Yuppie sends, rendered from typed data.
// The contract is ./types.ts. Sending (Resend, Twilio, message_log) is
// lib/server/messages (the foundation): it calls renderEmail or renderText
// and sends the result from EMAIL_FROM with reply-to EMAIL_REPLY_TO.
//
//   const { subject, preheader, html, text } = renderEmail("booking-confirmed", data);
//   const body = renderText("welcome", {});
//
// Pure functions, no secrets, no Next imports: safe on the server, in tests
// and in the dev preview (/dev-preview/emails).

import { BUILDERS, EMAIL_NAMES } from "./messages";
import { renderSpec, resolveOptions, type RenderOptions } from "./shell";
import { renderTextWith, smsCount, type SmsCount } from "./texts";
import type { EmailData, EmailName, RenderedEmail, TextData, TextName } from "./types";

export type * from "./types";
export {
  EMAIL_COLOR_SCHEME,
  EMAIL_FROM,
  EMAIL_REPLY_TO,
  SUPPORT_EMAIL,
  COMPANY_LINE,
  adminAlertsEmail,
  absoluteUrl,
  siteUrl,
  mapsUrl,
  MESSAGES_PATH,
  NOTIFICATIONS_PATH,
  OPEN_INVITE_PATH,
  type EmailColorScheme,
} from "./config";
export { smsCount, TEXT_NAMES, PLAN_TITLE_MAX, PLAN_PLACE_MAX, type SmsCount } from "./texts";
export { PHOTO_REMOVED_REASONS } from "./messages";
export { EMAIL_NAMES };
export type { RenderOptions };

/** Who each email goes to: the member or applicant's own address, or ADMIN_ALERTS_EMAIL (adminAlertsEmail()). */
export const EMAIL_AUDIENCE: Record<EmailName, "member" | "applicant" | "admin"> = {
  "application-received": "applicant",
  approval: "applicant",
  decline: "applicant",
  "email-changed": "member",
  "account-deleted": "member",
  "cancel-requested": "member",
  "membership-ended": "member",
  "payment-failed": "member",
  "booking-confirmed": "member",
  "booking-confirmed-included": "member",
  "booking-cancelled": "member",
  "event-cancelled": "member",
  "event-changed": "member",
  "event-reminder": "member",
  "admin-new-application": "admin",
  "admin-booking-review": "admin",
  // stage 2
  "plan-changed": "member",
  "plan-cancelled": "member",
  "plan-reminder": "member",
  "new-message": "member",
  "photo-removed": "member",
  "admin-new-report": "admin",
};

/** One email: subject, preheader, html and the plain-text part. Every value in `data` is escaped. */
export function renderEmail<N extends EmailName>(name: N, data: EmailData[N]): RenderedEmail {
  return renderEmailWith(name, data);
}

/** renderEmail with the site, dark-mode scheme or footer switch set explicitly (the dev preview and the checks use it). */
export function renderEmailWith<N extends EmailName>(name: N, data: EmailData[N], options: RenderOptions = {}): RenderedEmail {
  const build = BUILDERS[name];
  if (!build) throw new Error(`lib/emails: no email called ${String(name)}`);
  const opts = resolveOptions(options);
  return renderSpec(build(data, opts), opts);
}

/** One text message body. */
export function renderText<N extends TextName>(name: N, data: TextData[N]): string {
  return renderTextWith(name, data);
}

/** One text message body with its count (characters, Standard or Unicode, parts), for message_log. */
export function renderTextCounted<N extends TextName>(name: N, data: TextData[N]): { body: string; count: SmsCount } {
  const body = renderTextWith(name, data);
  return { body, count: smsCount(body) };
}
