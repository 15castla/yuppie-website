"use server";

// You > Notifications: the switches save at once (notifications spec 3.1). Answers the whole preferences object
// as it is now, so the page can redraw from it; a failed save answers the page's own line ("Couldn’t save
// that. ...") and the switch goes back. Text on needs a number on file and sends one check text first.
// Push (11 Nov 2026): the app tells the server what the phone said (recordPushPermission) and hands over its device
// token (registerPushDevice) while the member is signed in; the Push row shows where push is live for the member.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import type { NotificationChannel, NotificationPreferences, NotificationTopic, PushPermission } from "@/lib/members/messages/types";
import { requireFlag } from "@/lib/members/flags";
import { detectShellMode } from "@/lib/members/shell-mode";
import { pushLiveFor } from "@/lib/server/config";
import { serviceDb } from "@/lib/server/db";
import { sendPush } from "@/lib/server/messages";
import { DEVICE_COOKIE, hasSomethingToHear, saveDevice, validToken } from "@/lib/server/push/devices";
import { getNotificationPreferences, setNotificationPreference, setPushPermission, type SavePrefResult } from "@/lib/server/notification-prefs";
import type { SessionEnded } from "@/components/members/session-ended";
import { asMember, type Failed } from "../../action-kit";

const TOPICS: readonly NotificationTopic[] = ["host", "in", "reminder24", "reminder2", "clubChanges"];
const CHANNELS: readonly NotificationChannel[] = ["push", "email", "text"];

// The app's push calls run from every members page (components/members/push/push-bridge.tsx), the photo and
// membership gates included: they never redirect, so a gate is never navigated away from by them.
const ON_ANY_PAGE = { allowMissingPhoto: true, allowGated: true } as const;

export type NotificationSettings = {
  preferences: NotificationPreferences;
  /** Whether the Push row is shown at all: where push is live for the member (MEMBERS_PUSH_LIVE, or a tester). */
  pushChannel: boolean;
};

export async function getNotificationSettings(): Promise<NotificationSettings | SessionEnded | Failed> {
  requireFlag("notifications");
  const mode = await detectShellMode();
  return asMember("getNotificationSettings", async (m) => ({ preferences: await getNotificationPreferences(m, mode), pushChannel: pushLiveFor(m.email) }));
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

/** The app tells the server what the phone said about push: granted, denied, not asked, or no push in this app. */
export async function recordPushPermission(permission: PushPermission): Promise<{ ok: true } | SessionEnded | Failed> {
  requireFlag("notifications");
  if (!["granted", "denied", "not_asked", "unavailable"].includes(permission)) return { ok: false, error: "Couldn’t save that." };
  return asMember(
    "recordPushPermission",
    async (m) => {
      await setPushPermission(m.id, permission);
      return { ok: true as const };
    },
    ON_ANY_PAGE,
  );
}

/**
 * The app hands over this iPhone's APNs device token (it asks for one once notifications are allowed). Saved to the
 * member signed in (a phone signed in as someone else moves to them) and kept in a cookie, so signing out removes
 * this phone (app/members/profile/actions.ts signOutMember).
 */
export async function registerPushDevice(token: string, environment: "sandbox" | "production"): Promise<{ ok: true } | SessionEnded | Failed> {
  requireFlag("notifications");
  const clean = typeof token === "string" ? token.trim().toLowerCase() : "";
  if (!validToken(clean) || (environment !== "sandbox" && environment !== "production")) return { ok: false, error: "Couldn’t save that." };
  const result = await asMember(
    "registerPushDevice",
    async (m) => {
      await saveDevice(m.id, clean, environment);
      await setPushPermission(m.id, "granted");
      return { ok: true as const };
    },
    ON_ANY_PAGE,
  );
  if ("ok" in result && result.ok) {
    (await cookies()).set(DEVICE_COOKIE, clean, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return result;
}

/**
 * Whether the app should offer to turn notifications on now (it has not asked yet): push is live for the member and
 * they have something to hear about (a plan they host or are in, a question, a club event booked).
 */
export async function pushAskDue(): Promise<{ ok: true; ask: boolean } | SessionEnded | Failed> {
  requireFlag("notifications");
  return asMember("pushAskDue", async (m) => ({ ok: true as const, ask: pushLiveFor(m.email) && (await hasSomethingToHear(m.id)) }), ON_ANY_PAGE);
}

/** A test notification to the member's own phones (the Push row's "Send a test"), at most one a minute. */
export async function sendTestPush(): Promise<{ ok: true } | { ok: false; error: string } | SessionEnded> {
  requireFlag("notifications");
  return asMember(
    "sendTestPush",
    async (m) => {
      if (!pushLiveFor(m.email)) return { ok: false as const, error: "Notifications aren’t on for your account yet." };
      const { count } = await serviceDb()
        .from("message_log")
        .select("id", { count: "exact", head: true })
        .eq("member_id", m.id)
        .eq("template", "push-test")
        .eq("status", "sent")
        .gte("created_at", new Date(Date.now() - 60000).toISOString());
      if (count) return { ok: false as const, error: "One went a moment ago. Try again in a minute." };
      const sent = await sendPush({
        template: "push-test",
        memberId: m.id,
        body: "Notifications are on. This is how they’ll look.",
        path: "/members/you/notifications",
        dedupeKey: `push:test:${m.id}:${Date.now()}`,
      });
      if (sent.status === "sent") return { ok: true as const };
      if (sent.error === "no device") return { ok: false as const, error: "This iPhone isn’t saved yet. Close the app, open it again and try once more." };
      return { ok: false as const, error: "That didn’t go through. Try again in a moment." };
    },
    ON_ANY_PAGE,
  );
}
