// Texts (Twilio, sender name "ClubYuppie"). The welcome (C-D4 A, the short
// one), and from stage 2 the check text when texts are switched on and the
// reminders, 24 hours and 2 hours before a club event or an Open Invite plan
// (r2c "Texts", approved in round 3: v3 notif-board-text, notifications 3.7).
//
// The words are the table's. Every text is written in the standard (GSM)
// alphabet so it fits in one text of 160 characters: one curly apostrophe or
// an ellipsis would make the whole text Unicode, 70 characters a text. So:
// - the fixed words have no apostrophes (as drawn);
// - values a person typed (titles, places) have their typographic
//   punctuation written as the plain twin (’ to ', – to -, … to ...);
// - a plan title is cut at 40 characters and a plan place at 30, with no
//   ellipsis (notifications 3.7: the longest plan text is then 144, one text).
// smsCount() counts as the networks do, for message_log.

import { NOTIFICATIONS_PATH, siteUrl } from "./config";
import type { ReminderTextData, TextData, TextName } from "./types";

/** The site without https:// (a phone still turns it into a link, and the text stays short). */
function bareSite(site: string): string {
  return site.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

// Typographic characters with a twin in the standard alphabet.
const FOLD: Record<string, string> = {
  "‘": "'", // ‘
  "’": "'", // ’
  "‚": "'",
  "‛": "'",
  "′": "'",
  "“": '"', // “
  "”": '"', // ”
  "„": '"',
  "″": '"',
  "‐": "-",
  "‑": "-",
  "‒": "-",
  "–": "-", // –
  "—": "-", // —
  "−": "-",
  "…": "...", // …
  " ": " ",
  " ": " ",
  " ": " ",
  " ": " ",
  "​": "",
  "‌": "",
  "‍": "",
  "⁠": "",
  "﻿": "",
};

/** A typed value for a text: one line, single spaces, typographic punctuation as its standard twin. */
export function textValue(value: string): string {
  return Array.from(value)
    .map((c) => FOLD[c] ?? c)
    .join("")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** Cut a typed value to `max` characters with no ellipsis (notifications 3.7), without a dangling space or comma. */
export function cutValue(value: string, max: number): string {
  const v = textValue(value);
  const chars = Array.from(v);
  if (chars.length <= max) return v.replace(/[\s,;:.!?-]+$/, "") || v;
  return chars.slice(0, max).join("").replace(/[\s,;:.!?-]+$/, "");
}

/** Plan titles and places are typed by members: cut at 40 and 30 (notifications 3.7). */
export const PLAN_TITLE_MAX = 40;
export const PLAN_PLACE_MAX = 30;

function reminder(d: ReminderTextData, site: string, plan: boolean): string {
  const title = plan ? cutValue(d.title, PLAN_TITLE_MAX) : textValue(d.title).replace(/[\s,;:.!?-]+$/, "");
  const place = plan ? cutValue(d.place, PLAN_PLACE_MAX) : textValue(d.place).replace(/[\s,;:.!?-]+$/, "");
  const time = textValue(d.time);
  const link = `${plan ? "See the plan" : "See your booking"}: ${bareSite(site)}/members`;
  const day = d.day ?? (d.window === "24h" ? "tomorrow" : null);
  // As drawn: "is tomorrow at 18:30, Northgate Courts." and "starts in 2 hours, 18:30, Northgate Courts.".
  // Held by quiet hours to the day itself: "is today at 08:30, …" (NEW COPY, the 24-hour words with today).
  const when = day ? `is ${day} at ${time}` : `starts in 2 hours, ${time}`;
  return `Club Yuppie: ${title} ${when}, ${place}. ${link}`;
}

type TextBuild<N extends TextName> = (data: TextData[N], site: string) => string;

export const TEXT_BUILDERS: { [N in TextName]: TextBuild<N> } = {
  // r2c Texts: "Club Yuppie: You’re in. Log in: clubyuppie.com/member-login" (59 of 70, Unicode, one text).
  welcome: (_data, site) => `Club Yuppie: You’re in. Log in: ${bareSite(site)}/member-login`,
  // r2c Texts, "Reminders switched on" (101 of 160 as drawn). The design's link is /members/notifications; the
  // page is ROUTES.youNotifications, so the link is that (105 of 160, still one text).
  "reminders-on": (_data, site) => `Club Yuppie: reminders by text are on. Turn them off any time at ${bareSite(site)}${NOTIFICATIONS_PATH}`,
  // "Club event, 24 hours before" (107 of 160) and "2 hours before" (111 of 160).
  "event-reminder": (data, site) => reminder(data, site, false),
  // "Open Invite plan, 24 hours before" (126 of 160) and "2 hours before" (130 of 160).
  "plan-reminder": (data, site) => reminder(data, site, true),
};

export const TEXT_NAMES = Object.keys(TEXT_BUILDERS) as TextName[];

export function renderTextWith<N extends TextName>(name: N, data: TextData[N], options: { site?: string } = {}): string {
  const build = TEXT_BUILDERS[name] as TextBuild<N>;
  if (!build) throw new Error(`lib/emails: no text called ${String(name)}`);
  return build(data, options.site ?? siteUrl());
}

// The approved counter from round 3 (pages_notif.py sms_count): GSM 7-bit is
// 160 characters in one text and 153 per part after that; anything outside
// it (a curly apostrophe) makes the whole text Unicode, 70 and 67.
const GSM = new Set(
  Array.from(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
  ),
);
const GSM_EXT = new Set(Array.from("^{}\\[~]|€"));

export type SmsCount = { characters: number; encoding: "Standard" | "Unicode"; parts: number; limit: number };

export function smsCount(text: string): SmsCount {
  const chars = Array.from(text);
  if (chars.every((c) => GSM.has(c) || GSM_EXT.has(c))) {
    const n = chars.reduce((sum, c) => sum + (GSM_EXT.has(c) ? 2 : 1), 0);
    return { characters: n, encoding: "Standard", parts: n <= 160 ? 1 : Math.ceil(n / 153), limit: 160 };
  }
  // Unicode counts UTF-16 code units, as the networks do (an emoji is two).
  const n = text.length;
  return { characters: n, encoding: "Unicode", parts: n <= 70 ? 1 : Math.ceil(n / 67), limit: 70 };
}
