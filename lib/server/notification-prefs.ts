import "server-only";

// Notification preferences (specs/notifications.md 3.1): five topics times three channels, saved at once, with
// the defaults when a member has never touched them (push on, email on, both reminders on, text off).
//
// Push is not in stage 2: the switch is stored, nothing is sent, and pushPermission reads "unavailable" until the
// server-only switch MEMBERS_PUSH_LIVE=on (then the page may show the Push row; see pushLive()).
// Text is opt in: switching it on needs a number on file and sends one check text ("reminders by text are on")
// through the dispatcher; texts then go to that number. If the member's number changes later, texts stop until
// they switch Text on again (textCheck reads "none" for the new number).

import type { ShellMode } from "@/components/members/shell/types";
import type { NotificationChannel, NotificationPreferences, NotificationTopic } from "@/lib/members/messages/types";
import { DEFAULT_CHANNELS, DEFAULT_TOPICS } from "@/lib/members/messages/types";
import { displayPhone } from "@/lib/members/you/format";
import { pushLive } from "./config";
import { serviceDb } from "./db";
import { sendTextCheck } from "./notify";

export type PrefsRow = {
  member_id: string;
  topic_host: boolean;
  topic_in: boolean;
  topic_reminder24: boolean;
  topic_reminder2: boolean;
  topic_club_changes: boolean;
  channel_push: boolean;
  channel_email: boolean;
  channel_text: boolean;
  text_check: "none" | "sent" | "verified";
  text_check_number: string | null;
  text_check_sent_at: string | null;
  push_permission: "granted" | "denied" | "not_asked" | "unavailable";
};

const PREFS_COLUMNS =
  "member_id, topic_host, topic_in, topic_reminder24, topic_reminder2, topic_club_changes, channel_push, channel_email, channel_text, text_check, text_check_number, text_check_sent_at, push_permission";

export function defaultPrefs(memberId: string): PrefsRow {
  return {
    member_id: memberId,
    topic_host: DEFAULT_TOPICS.host,
    topic_in: DEFAULT_TOPICS.in,
    topic_reminder24: DEFAULT_TOPICS.reminder24,
    topic_reminder2: DEFAULT_TOPICS.reminder2,
    topic_club_changes: DEFAULT_TOPICS.clubChanges,
    channel_push: DEFAULT_CHANNELS.push,
    channel_email: DEFAULT_CHANNELS.email,
    channel_text: DEFAULT_CHANNELS.text,
    text_check: "none",
    text_check_number: null,
    text_check_sent_at: null,
    push_permission: "not_asked",
  };
}

const TOPIC_COLUMN: Record<NotificationTopic, keyof PrefsRow> = {
  host: "topic_host",
  in: "topic_in",
  reminder24: "topic_reminder24",
  reminder2: "topic_reminder2",
  clubChanges: "topic_club_changes",
};
const CHANNEL_COLUMN: Record<NotificationChannel, keyof PrefsRow> = { push: "channel_push", email: "channel_email", text: "channel_text" };

export const topicOn = (row: PrefsRow, topic: NotificationTopic) => Boolean(row[TOPIC_COLUMN[topic]]);
export const channelOn = (row: PrefsRow, channel: NotificationChannel) => Boolean(row[CHANNEL_COLUMN[channel]]);

/** Texts go only to the number the check text went to, and only while Text is on. */
export function textNumber(row: PrefsRow, phone: string | null | undefined): string | null {
  const number = phone?.trim() || null;
  if (!row.channel_text || !number) return null;
  if (row.text_check === "none" || row.text_check_number !== number) return null;
  return number;
}

export async function prefsRows(memberIds: string[]): Promise<Map<string, PrefsRow>> {
  const ids = [...new Set(memberIds)];
  const out = new Map<string, PrefsRow>(ids.map((id) => [id, defaultPrefs(id)]));
  if (!ids.length) return out;
  const { data, error } = await serviceDb().from("notification_preferences").select(PREFS_COLUMNS).in("member_id", ids);
  if (error) throw error;
  for (const row of (data ?? []) as PrefsRow[]) out.set(row.member_id, row);
  return out;
}

export async function prefsRow(memberId: string): Promise<PrefsRow> {
  return (await prefsRows([memberId])).get(memberId)!;
}

type MemberForPrefs = { id: string; email: string; phone: string | null };

export function toPreferences(row: PrefsRow, member: MemberForPrefs, mode: ShellMode): NotificationPreferences {
  const number = member.phone?.trim() || null;
  return {
    topics: { host: row.topic_host, in: row.topic_in, reminder24: row.topic_reminder24, reminder2: row.topic_reminder2, clubChanges: row.topic_club_changes },
    // Text reads on only while texts would really go (textNumber): after a number change it reads off, and switching
    // it on again sends a new check text ("Change number re-verifies", notifications spec 3.1).
    channels: { push: row.channel_push, email: row.channel_email, text: textNumber(row, number) !== null },
    email: member.email,
    mobileNumber: displayPhone(number),
    textCheck: number && row.text_check_number === number ? row.text_check : "none",
    pushPermission: pushLive() && mode === "app" ? row.push_permission : "unavailable",
  };
}

export async function getNotificationPreferences(member: MemberForPrefs, mode: ShellMode): Promise<NotificationPreferences> {
  return toPreferences(await prefsRow(member.id), member, mode);
}

export type PrefKey = { topic: NotificationTopic } | { channel: NotificationChannel };
export type SavePrefResult = { ok: true; preferences: NotificationPreferences } | { ok: false; error: string; reason: "no_number" | "check_failed" | "save_failed" | "bad_key" };

/** The settings page's own failure line (notifications spec 3.1). */
export const SAVE_FAILED = "Couldn’t save that. Check your connection and try again.";

/**
 * Save one switch. Text on: there must be a number, and the check text must go (it is sent now, even at night:
 * it answers the member's own tap, it is not a reminder). Text off: no more texts.
 */
export async function setNotificationPreference(member: MemberForPrefs, key: PrefKey, on: boolean, mode: ShellMode): Promise<SavePrefResult> {
  const column = "topic" in key ? TOPIC_COLUMN[key.topic] : CHANNEL_COLUMN[key.channel];
  if (!column) return { ok: false, error: SAVE_FAILED, reason: "bad_key" };
  const row = await prefsRow(member.id);
  const next: PrefsRow = { ...row, [column]: Boolean(on) };
  if ("channel" in key && key.channel === "text" && on) {
    const number = member.phone?.trim();
    if (!number) return { ok: false, error: "Add a mobile number to get reminders by text.", reason: "no_number" };
    if (!(row.channel_text && row.text_check_number === number && row.text_check !== "none")) {
      const sent = await sendTextCheck(member.id, number);
      if (sent.status === "failed") return { ok: false, error: "We couldn’t send the check text. Try again.", reason: "check_failed" };
      next.text_check = "sent";
      next.text_check_number = number;
      next.text_check_sent_at = new Date().toISOString();
    }
  }
  const { error } = await serviceDb().from("notification_preferences").upsert(next, { onConflict: "member_id" });
  if (error) {
    console.error(`notification preferences: saving ${member.id} failed:`, error);
    return { ok: false, error: SAVE_FAILED, reason: "save_failed" };
  }
  return { ok: true, preferences: toPreferences(next, member, mode) };
}

/** Record what the app learnt about push permission (stored only; nothing is sent in stage 2). */
export async function setPushPermission(memberId: string, permission: PrefsRow["push_permission"]): Promise<void> {
  const row = await prefsRow(memberId);
  await serviceDb().from("notification_preferences").upsert({ ...row, push_permission: permission }, { onConflict: "member_id" });
}

/**
 * The one line on You's Notifications row (the You spec): the channels that are on, "Off. You may miss
 * reminders." when none are. Push counts only where it exists (the app, once push is live).
 */
export function notificationSummary(prefs: NotificationPreferences, mode: ShellMode): { summary: string; warn?: boolean } {
  const on: string[] = [];
  if (prefs.channels.push && mode === "app" && pushLive()) on.push("push");
  if (prefs.channels.email) on.push("email");
  if (prefs.channels.text) on.push("text");
  if (!on.length) return { summary: "Off. You may miss reminders.", warn: true };
  const words = on.join(", ");
  return { summary: words[0].toUpperCase() + words.slice(1) };
}
