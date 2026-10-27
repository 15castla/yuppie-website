// Texts (Twilio, sender name "ClubYuppie"). Phase A sends one: the welcome
// (C-D4 A, the short one). Reminders by text are Phase B (v3 notifications).

import { siteUrl } from "./config";
import type { TextData, TextName } from "./types";

/** The site without https:// (a phone still turns it into a link, and the text stays short). */
function bareSite(site: string): string {
  return site.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

type TextBuild<N extends TextName> = (data: TextData[N], site: string) => string;

export const TEXT_BUILDERS: { [N in TextName]: TextBuild<N> } = {
  // r2c Texts: "Club Yuppie: You’re in. Log in: clubyuppie.com/member-login" (59 of 70, Unicode, one text).
  welcome: (_data, site) => `Club Yuppie: You’re in. Log in: ${bareSite(site)}/member-login`,
};

export const TEXT_NAMES = Object.keys(TEXT_BUILDERS) as TextName[];

export function renderTextWith<N extends TextName>(name: N, data: TextData[N], options: { site?: string } = {}): string {
  const build = TEXT_BUILDERS[name] as TextBuild<N>;
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
  const n = chars.length;
  return { characters: n, encoding: "Unicode", parts: n <= 70 ? 1 : Math.ceil(n / 67), limit: 70 };
}
