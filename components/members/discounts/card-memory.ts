"use client";

// The members card offline (Albert, 14 Nov 2026: "it can't show your members card offline - is this correct?").
// The card checks the membership afresh every time it opens, so a screenshot can't stand in for it. With no signal
// it shows the last check instead, at most a week old, and says so ("Offline · last checked Fri 13 Nov, 21:42"),
// so staff can see how old it is. Kept on this phone only (localStorage), and wiped by the Log in page
// (lib/members/offline-pages.ts).

import type { RedemptionStatus } from "@/app/members/redemption-actions";

export const CARD_MEMORY_KEY = "cy-card";
/** The oldest check the card shows offline. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** How often the app checks again in the background, so the card is ready for a basement bar. */
export const CARD_REFRESH_MS = 30 * 60 * 1000;

export type CardMemory = { name: string | null; status: string; photoUrl: string | null; checkedAt: string };

export function rememberCard(status: RedemptionStatus): void {
  try {
    const memory: CardMemory = { name: status.full_name, status: status.membership_status, photoUrl: status.photo_url, checkedAt: status.checked_at };
    localStorage.setItem(CARD_MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // no storage here (a private window): the card just needs a signal
  }
  // The photo through the members worker, so it's on the phone too (kept by the photo, whatever the signed link).
  if (status.photo_url && typeof Image !== "undefined") {
    const img = new Image();
    img.src = status.photo_url;
  }
}

/** The last check, if there is one from the last week. */
export function lastCard(now = Date.now()): CardMemory | null {
  try {
    const raw = localStorage.getItem(CARD_MEMORY_KEY);
    if (!raw) return null;
    const memory = JSON.parse(raw) as CardMemory;
    const at = new Date(memory.checkedAt).getTime();
    if (!memory.status || Number.isNaN(at) || now - at > MAX_AGE_MS) return null;
    return memory;
  } catch {
    return null;
  }
}

/** When the last check was, if any (for the background refresh). */
export function lastCardAt(): number {
  try {
    const raw = localStorage.getItem(CARD_MEMORY_KEY);
    return raw ? new Date((JSON.parse(raw) as CardMemory).checkedAt).getTime() || 0 : 0;
  } catch {
    return 0;
  }
}
