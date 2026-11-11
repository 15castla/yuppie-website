import "server-only";

// What each phone notification says. Albert, 11 Nov 2026: "it should say the name of the person joining or sending
// messages etc. on the notification. And group chats" (this replaces the spec's "never a message or a sender's
// name"). The plan or event is the title and the person is named. A chat message is laid out as WhatsApp does
// (Albert, 11 Nov, later: "Don't say question from ... just say the event / group name", "like WhatsApp with the
// photo and then a small yuppie icon"): the person, then the plan, then the words, in a plan chat and a question
// alike; the app adds the person's photo (mobile/ios/App/NotificationService). A member someone blocked is never
// named to them. Club Yuppie style: British English, no exclamation marks, no em dashes.

import { dayDate, time24 } from "../format";
import { relativeDay } from "../notify/quiet";

export type PushText = { title: string; subtitle?: string; body: string };

/** "today at 18:30", "tomorrow at 18:30", "Sat 14 Nov at 18:30". */
const when = (iso: string, now: Date) => {
  const day = relativeDay(iso, now);
  return `${day === "today" ? "today" : day === "tomorrow" ? "tomorrow" : dayDate(iso)} at ${time24(iso)}`;
};
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A chat message's words for a notification: one paragraph, at most 180 characters. */
export function preview(text: string | null | undefined): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > 180 ? `${flat.slice(0, 179).trimEnd()}…` : flat;
}

const moved = (how: "time" | "place" | "both", startsAt: string, place: string, now: Date) =>
  how === "place" ? `to ${place}` : how === "time" ? `to ${when(startsAt, now)}` : `to ${when(startsAt, now)}, at ${place}`;

export const pushWords = {
  /** The host: someone is in (and whether that filled it). */
  joined: (plan: string, name: string, full: boolean): PushText => ({ title: plan, body: full ? `${name} is in. Your plan is now full.` : `${name} is in.` }),
  /** The host: someone can no longer make it; or, if the host blocked them, only that a place opened. */
  left: (plan: string, name: string | null): PushText => ({ title: plan, body: name ? `${name} can no longer make it.` : "A place has opened up." }),
  /** A chat message, in a plan chat or a question to the host: who, the plan, the words ("Kira" / "Padel" / "Test"). */
  message: (plan: string, name: string, text: string): PushText => ({ title: name, subtitle: plan, body: text }),
  /** A plan you're in moved; the host is named unless you blocked them. */
  planMoved: (plan: string, host: string | null, how: "time" | "place" | "both", startsAt: string, place: string, now: Date): PushText => ({
    title: plan,
    body: host ? `${host} moved the plan ${moved(how, startsAt, place, now)}.` : `The plan has moved ${moved(how, startsAt, place, now)}.`,
  }),
  /** A plan you're in was cancelled: by the host (named unless you blocked them) or by the club. */
  planCancelled: (plan: string, host: string | null, byClub: boolean): PushText => ({
    title: plan,
    body: byClub ? "Club Yuppie cancelled this plan." : host ? `${host} cancelled the plan.` : "The plan has been cancelled.",
  }),
  /** The host's own plan, removed by the club. */
  hostPlanRemoved: (plan: string): PushText => ({ title: plan, body: "Club Yuppie cancelled your plan." }),
  /** 24 hours or 2 hours before a plan or a club event. */
  reminder: (window: "24h" | "2h", title: string, startsAt: string, place: string, now: Date): PushText => ({
    title,
    body: window === "2h" ? `Starts at ${time24(startsAt)}, at ${place}.` : `${capital(when(startsAt, now))}, at ${place}.`,
  }),
  eventMoved: (event: string, how: "time" | "place" | "both", startsAt: string, venue: string, now: Date): PushText => ({
    title: event,
    body: `Moved ${moved(how, startsAt, venue, now)}.`,
  }),
  eventCancelled: (event: string, refunded: boolean): PushText => ({
    title: event,
    body: refunded ? "This event has been cancelled. We’ve emailed you about your refund." : "This event has been cancelled.",
  }),
};
