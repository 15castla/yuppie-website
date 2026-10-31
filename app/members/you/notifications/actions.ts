"use server";

// You > Notifications: the switches save at once (notifications spec 3.1). Answers the whole preferences object
// as it is now, so the page can redraw from it; a failed save answers the page's own line ("Couldn’t save
// that. ...") and the switch goes back. Text on needs a number on file and sends one check text first.
// Push is stored and never sent in stage 2 (the Push row stays hidden until MEMBERS_PUSH_LIVE=on).

import { revalidatePath } from "next/cache";

import type { NotificationChannel, NotificationPreferences, NotificationTopic, PushPermission } from "@/lib/members/messages/types";
import { requireFlag } from "@/lib/members/flags";
import { detectShellMode } from "@/lib/members/shell-mode";
import { pushLive } from "@/lib/server/config";
import { getNotificationPreferences, setNotificationPreference, setPushPermission, type SavePrefResult } from "@/lib/server/notification-prefs";
import type { SessionEnded } from "@/components/members/session-ended";
import { asMember, type Failed } from "../../action-kit";

const TOPICS: readonly NotificationTopic[] = ["host", "in", "reminder24", "reminder2", "clubChanges"];
const CHANNELS: readonly NotificationChannel[] = ["push", "email", "text"];

export type NotificationSettings = {
  preferences: NotificationPreferences;
  /** Whether the Push row is shown at all: false until push exists (MEMBERS_PUSH_LIVE). */
  pushChannel: boolean;
};

export async function getNotificationSettings(): Promise<NotificationSettings | SessionEnded | Failed> {
  requireFlag("notifications");
  const mode = await detectShellMode();
  return asMember("getNotificationSettings", async (m) => ({ preferences: await getNotificationPreferences(m, mode), pushChannel: pushLive() }));
}

export async function setNotificationTopic(topic: NotificationTopic, on: boolean): Promise<SavePrefResult | SessionEnded | Failed> {
  requireFlag("notifications");
  if (!TOPICS.includes(topic)) return { ok: false, error: "Couldn’t save that. Check your connection and try again." };
  const mode = await detectShellMode();
  const result = await asMember("setNotificationTopic", (m) => setNotificationPreference(m, { topic }, Boolean(on), mode));
  if ("ok" in result && result.ok) revalidatePath("/members/you", "layout");
  return result;
}

/** Push, Email or Text. Text on: the check text goes first ("We sent a text to check it’s you."). */
export async function setNotificationChannel(channel: NotificationChannel, on: boolean): Promise<SavePrefResult | SessionEnded | Failed> {
  requireFlag("notifications");
  if (!CHANNELS.includes(channel)) return { ok: false, error: "Couldn’t save that. Check your connection and try again." };
  const mode = await detectShellMode();
  const result = await asMember("setNotificationChannel", (m) => setNotificationPreference(m, { channel }, Boolean(on), mode));
  if ("ok" in result && result.ok) revalidatePath("/members/you", "layout");
  return result;
}

/** The app tells the server what the phone said about push (stored only in stage 2). */
export async function recordPushPermission(permission: PushPermission): Promise<{ ok: true } | SessionEnded | Failed> {
  requireFlag("notifications");
  if (!["granted", "denied", "not_asked", "unavailable"].includes(permission)) return { ok: false, error: "Couldn’t save that." };
  return asMember("recordPushPermission", async (m) => {
    await setPushPermission(m.id, permission);
    return { ok: true as const };
  });
}
