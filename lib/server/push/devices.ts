import "server-only";

// The iPhones a member's phone notifications go to (push_devices, server only). The app hands its APNs device token
// to the page, which saves it here while the member is signed in (app/members/you/notifications/actions.ts). One
// token is one phone: signed in as someone else, it moves to them; signing out removes it.

import { serviceDb } from "../db";

export const DEVICE_COOKIE = "yuppie-push-device";

export type DeviceEnvironment = "sandbox" | "production";

export function validToken(token: unknown): token is string {
  return typeof token === "string" && /^[0-9a-f]{32,200}$/.test(token);
}

/** Save (or move) a device to this member. */
export async function saveDevice(memberId: string, token: string, environment: DeviceEnvironment): Promise<void> {
  const { error } = await serviceDb()
    .from("push_devices")
    .upsert({ token, member_id: memberId, environment, platform: "ios", last_seen_at: new Date().toISOString() }, { onConflict: "token" });
  if (error) throw error;
}

/** Remove a device (signing out, or the phone turned notifications off). Only this member's. */
export async function forgetDevice(memberId: string, token: string): Promise<void> {
  const { error } = await serviceDb().from("push_devices").delete().eq("token", token).eq("member_id", memberId);
  if (error) console.error("push: forgetting a device failed:", error);
}

/**
 * Whether the app should offer to turn notifications on now: the member has something to be told about (a plan
 * they host or are in, a question they asked, a club event booked). Notifications spec: the app asks "the first time
 * a member says I'm in or posts a plan".
 */
export async function hasSomethingToHear(memberId: string): Promise<boolean> {
  const db = serviceDb();
  const [plans, chats, bookings] = await Promise.all([
    db.from("plan_members").select("plan_id", { count: "exact", head: true }).eq("member_id", memberId),
    db.from("chat_members").select("chat_id", { count: "exact", head: true }).eq("member_id", memberId),
    db.from("bookings").select("id", { count: "exact", head: true }).eq("member_id", memberId).eq("status", "confirmed"),
  ]);
  return (plans.count ?? 0) + (chats.count ?? 0) + (bookings.count ?? 0) > 0;
}
