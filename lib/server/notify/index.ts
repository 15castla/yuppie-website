import "server-only";

// THE NOTIFICATION DISPATCHER (the brief, section 4). The only place that sends plan, chat, photo and report
// emails and texts, and the only place that writes Updates. For every event it decides who hears what by which
// channel, from the trigger table (lib/members/messages/types.ts NOTIFICATION_TRIGGERS) and each recipient's
// switches (lib/server/notification-prefs.ts):
//   - a channel is used when the trigger allows it AND the topic is on AND the channel is on;
//   - "always" emails (the photo-removed account email) ignore the switches; club alerts go to ADMIN_ALERTS_EMAIL;
//   - a muted chat sends no chat email (and would send no push);
//   - a recipient who blocked the member an event is about hears nothing about them, but always hears the facts
//     of a plan they are going to (a change, a cancel: blocks hide messages and plans in the feed, never those;
//     QB1-02), as an Update without the blocked member's name and by their own email switch;
//   - paused, ended and deleted members hear nothing;
//   - texts are reminders only (plus the check text), and quiet hours hold them (./reminders.ts);
//   - phone notifications (Albert, 11 Nov 2026: "move everything to app notifications"): for a member push is
//     live for (MEMBERS_PUSH_LIVE on, or MEMBERS_PUSH_TESTERS before it), every notification is a push instead of
//     an email; only the "always" emails (account, booking) still go. A push names the person and shows a chat
//     message's words, as a group chat app does (Albert, 11 Nov 2026; lib/server/push/words.ts), never naming
//     someone the recipient blocked; in quiet hours it is delivered silently;
//   - every Update has a dedupe key (an event never writes twice), every email and text has one too and is
//     written to message_log by lib/server/messages (a key that went out is never sent again).
// Updates are written before the action answers (the next page shows them); emails and pushes go after the
// response (later()), so the member is not kept waiting.

import type { PhotoRemovedReason } from "@/lib/emails";
import { NOTIFICATION_TRIGGERS, type NotificationTrigger } from "@/lib/members/messages/types";
import { messageThreadHref, openInviteHref, ROUTES } from "@/lib/members/routes";
import { adminAlertsEmail, pushLiveFor } from "../config";
import { serviceDb } from "../db";
import { dayDate, firstName, time24 } from "../format";
import { later } from "../later";
import { isGated, membershipState } from "../membership";
import { sendEmail, sendPush, sendText, type MessageRefs, type PushInput, type SendResult } from "../messages";
import { channelOn, prefsRows, textNumber, topicOn, type PrefsRow } from "../notification-prefs";
import { preview, pushWords, type PushText } from "../push/words";
import { reasonLabel, type ReportKind } from "../report-reasons";
import { isQuietHours } from "./quiet";

// ---------------------------------------------------------------------------- events

export type NotifyEvent =
  | { type: "plan.joined"; planId: string; memberId: string; full: boolean }
  | { type: "plan.left"; planId: string; memberId: string; wasFull: boolean }
  | { type: "plan.changed"; planId: string; byId: string; previousStartsAt: string; previousPlace: string; timeChanged: boolean; placeChanged: boolean }
  | { type: "plan.cancelled"; planId: string; byClub: boolean }
  | { type: "chat.message"; chatId: string; messageId: string; senderId: string }
  | { type: "photo.removed"; memberId: string; photoId: string; reason: PhotoRemovedReason }
  | { type: "report.created"; reportId: string };

/** What the dispatcher decided (returned for tests and logs; the sends themselves are in message_log). */
export type NotifyOutcome = { updates: number; emails: number; texts: number; pushes: number };

// ---------------------------------------------------------------------------- people and channels

export type Person = {
  id: string;
  email: string;
  phone: string | null;
  full_name: string | null;
  membership_status: string;
  cancel_at: string | null;
  payment_failed_at: string | null;
  grace_until: string | null;
  paused_at: string | null;
  ended_at: string | null;
  deleted_at: string | null;
  prefs: PrefsRow;
};
const PERSON_COLUMNS = "id, email, phone, full_name, membership_status, cancel_at, payment_failed_at, grace_until, paused_at, ended_at, deleted_at";

export async function people(ids: (string | null | undefined)[]): Promise<Map<string, Person>> {
  const list = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const out = new Map<string, Person>();
  if (!list.length) return out;
  const [{ data, error }, prefs] = await Promise.all([serviceDb().from("members").select(PERSON_COLUMNS).in("id", list), prefsRows(list)]);
  if (error) throw error;
  for (const row of (data ?? []) as Omit<Person, "prefs">[]) out.set(row.id, { ...row, prefs: prefs.get(row.id)! });
  return out;
}

export const canHear = (p: Person, now: Date) => !p.deleted_at && !isGated(membershipState(p, now).state);

const TRIGGERS = new Map(NOTIFICATION_TRIGGERS.map((t) => [t.id, t]));
export type TriggerId = (typeof NOTIFICATION_TRIGGERS)[number]["id"];

export type Channels = { update: boolean; email: boolean; text: string | null; push: boolean };

/** Which channels one trigger reaches one person by. */
export function channelsFor(triggerId: string, p: Person, now: Date, options: { muted?: boolean } = {}): Channels {
  const t: NotificationTrigger | undefined = TRIGGERS.get(triggerId);
  if (!t || !canHear(p, now)) return { update: false, email: false, text: null, push: false };
  const topic = t.topic ? topicOn(p.prefs, t.topic) : true;
  // Push live for this member: notifications are pushes, and only the "always" emails still go.
  const live = pushLiveFor(p.email);
  const email =
    t.email === "always" ||
    (!live && (t.email === "yes" || (t.email === "chat_nudge" && !options.muted)) && topic && channelOn(p.prefs, "email"));
  return {
    // The Updates list is a record in the app, not a notification: written whatever the switches say.
    update: t.updates,
    email,
    text: t.text && topic ? textNumber(p.prefs, p.phone) : null,
    push: live && t.push && topic && !options.muted && channelOn(p.prefs, "push"),
  };
}

// ---------------------------------------------------------------------------- writing Updates

export type UpdateInsert = {
  member_id: string;
  kind: "joined" | "left" | "full" | "place_opened" | "changed" | "cancelled" | "reminder";
  plan_id: string;
  actor_id?: string | null;
  role: "host" | "going";
  reminder_hours?: 24 | 2 | null;
  previous_starts_at?: string | null;
  refund_pence?: number | null;
  going_count?: number | null;
  dedupe_key: string;
  created_at?: string;
};

/** Write Updates; a dedupe key seen before is a no-op. Returns how many were new. */
export async function writeUpdates(rows: UpdateInsert[]): Promise<number> {
  if (!rows.length) return 0;
  const { data, error } = await serviceDb().from("updates").upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
  if (error) {
    console.error("notify: writing updates failed:", error);
    return 0;
  }
  return data?.length ?? 0;
}

/**
 * Updates about the people on a plan (joined, full, left, a place opened): written only while the plan is still
 * on, under the plan's row lock (write_plan_updates), so none lands after a cancel (QB3-14). Returns how many were new.
 */
export async function writePlanUpdates(planId: string, rows: UpdateInsert[]): Promise<number> {
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({
    member_id: r.member_id,
    kind: r.kind,
    actor_id: r.actor_id ?? null,
    role: r.role,
    reminder_hours: r.reminder_hours ?? null,
    previous_starts_at: r.previous_starts_at ?? null,
    refund_pence: r.refund_pence ?? null,
    going_count: r.going_count ?? null,
    dedupe_key: r.dedupe_key,
  }));
  const { data, error } = await serviceDb().rpc("write_plan_updates", { p_plan: planId, p_rows: payload });
  if (error) {
    console.error(`notify: writing updates for plan ${planId} failed:`, error);
    return 0;
  }
  return Number(data ?? 0);
}

// ---------------------------------------------------------------------------- plans

type PlanFacts = { id: string; host_id: string; title: string; starts_at: string; place: string; places: number; status: string; changed_at: string | null; cancelled_at: string | null };

async function planFacts(planId: string): Promise<{ plan: PlanFacts; going: { member_id: string; joined_at: string; left_at: string | null }[] } | null> {
  const db = serviceDb();
  const [{ data: plan }, { data: going }] = await Promise.all([
    db.from("plans").select("id, host_id, title, starts_at, place, places, status, changed_at, cancelled_at").eq("id", planId).maybeSingle<PlanFacts>(),
    db.from("plan_members").select("member_id, joined_at, left_at, status").eq("plan_id", planId).eq("status", "going"),
  ]);
  if (!plan) return null;
  return { plan, going: (going ?? []) as { member_id: string; joined_at: string; left_at: string | null }[] };
}

async function blockedBy(recipientIds: string[], aboutId: string | null): Promise<Set<string>> {
  if (!aboutId || !recipientIds.length) return new Set();
  const { data } = await serviceDb().from("blocks").select("blocker_id").eq("blocked_id", aboutId).in("blocker_id", recipientIds);
  return new Set((data ?? []).map((r) => r.blocker_id as string));
}

const ms = (value: string | null | undefined) => (value ? new Date(value).getTime() : 0);
const start = (value: string) => ({ date: dayDate(value), time: time24(value) });

type Email = Parameters<typeof sendEmail>[0];
type Text = Parameters<typeof sendText>[0];

/** Send after the response; never throws (the message service logs every result). */
function sendLater(label: string, emails: Email[], texts: Text[] = [], pushes: PushInput[] = []): void {
  if (!emails.length && !texts.length && !pushes.length) return;
  later(label, async () => {
    for (const e of emails) await sendEmail(e);
    for (const t of texts) await sendText(t);
    for (const p of pushes) await sendPush(p);
  });
}

/** A plan's push: grouped by the plan, opening it, silent in quiet hours. */
function planPush(plan: { id: string }, memberId: string, template: string, text: PushText, dedupeKey: string, now: Date): PushInput {
  return { template, memberId, ...text, path: openInviteHref(plan.id), thread: `plan:${plan.id}`, quiet: isQuietHours(now), dedupeKey, refs: { planId: plan.id } };
}

/** A member's first name for a notification ("Someone" when there is none). */
const nameOf = (p: Person | undefined) => firstName(p?.full_name) || "Someone";

async function planJoined(e: Extract<NotifyEvent, { type: "plan.joined" }>, now: Date): Promise<NotifyOutcome> {
  const facts = await planFacts(e.planId);
  if (!facts) return none();
  const { plan, going } = facts;
  const joinedAt = going.find((g) => g.member_id === e.memberId)?.joined_at ?? now.toISOString();
  const others = going.map((g) => g.member_id).filter((id) => id !== e.memberId && id !== plan.host_id);
  const everyone = await people([plan.host_id, e.memberId, ...others]);
  const blockers = await blockedBy([plan.host_id, ...others], e.memberId);
  const rows: UpdateInsert[] = [];
  const pushes: PushInput[] = [];
  const host = everyone.get(plan.host_id);
  if (host && !blockers.has(host.id) && channelsFor("host.joined", host, now).update) {
    rows.push({ member_id: host.id, kind: "joined", plan_id: plan.id, actor_id: e.memberId, role: "host", dedupe_key: `upd:joined:${plan.id}:${e.memberId}:${ms(joinedAt)}` });
  }
  // The host hears who joined (and whether that filled it); the others going see "full" in Updates only (a push
  // about a plan they are already in would be noise).
  if (host && !blockers.has(host.id) && channelsFor(e.full ? "host.full" : "host.joined", host, now).push) {
    const words = pushWords.joined(plan.title, nameOf(everyone.get(e.memberId)), e.full);
    pushes.push(planPush(plan, host.id, e.full ? "push-plan-full" : "push-plan-joined", words, `push:joined:${plan.id}:${e.memberId}:${ms(joinedAt)}`, now));
  }
  if (e.full) {
    if (host && channelsFor("host.full", host, now).update) {
      rows.push({ member_id: host.id, kind: "full", plan_id: plan.id, role: "host", going_count: going.length, dedupe_key: `upd:full:${plan.id}:${host.id}:${ms(joinedAt)}` });
    }
    for (const id of others) {
      const p = everyone.get(id);
      if (p && channelsFor("in.full", p, now).update) {
        rows.push({ member_id: id, kind: "full", plan_id: plan.id, role: "going", going_count: going.length, dedupe_key: `upd:full:${plan.id}:${id}:${ms(joinedAt)}` });
      }
    }
  }
  const updates = await writePlanUpdates(plan.id, rows);
  sendLater(`plan joined ${plan.id}`, [], [], pushes);
  return { ...none(), updates, pushes: pushes.length };
}

async function planLeft(e: Extract<NotifyEvent, { type: "plan.left" }>, now: Date): Promise<NotifyOutcome> {
  const facts = await planFacts(e.planId);
  if (!facts) return none();
  const { plan, going } = facts;
  const { data: left } = await serviceDb().from("plan_members").select("left_at").eq("plan_id", plan.id).eq("member_id", e.memberId).maybeSingle();
  const leftAt = ms(left?.left_at) || now.getTime();
  const others = going.map((g) => g.member_id).filter((id) => id !== plan.host_id);
  const everyone = await people([plan.host_id, e.memberId, ...others]);
  const blockers = await blockedBy([plan.host_id, ...others], e.memberId);
  const rows: UpdateInsert[] = [];
  const pushes: PushInput[] = [];
  const host = everyone.get(plan.host_id);
  if (host && channelsFor("host.left", host, now).push && (!blockers.has(host.id) || e.wasFull)) {
    // A host who blocked the member hears only that the full plan has a place again, without their name (QB1-02).
    const words = pushWords.left(plan.title, blockers.has(host.id) ? null : nameOf(everyone.get(e.memberId)));
    pushes.push(planPush(plan, host.id, "push-plan-left", words, `push:left:${plan.id}:${e.memberId}:${leftAt}`, now));
  }
  if (host && !blockers.has(host.id) && channelsFor("host.left", host, now).update) {
    rows.push({ member_id: host.id, kind: "left", plan_id: plan.id, actor_id: e.memberId, role: "host", dedupe_key: `upd:left:${plan.id}:${e.memberId}:${leftAt}` });
  } else if (host && blockers.has(host.id) && e.wasFull && channelsFor("host.left", host, now).update) {
    // The host blocked the member who withdrew: not their name, but the fact that matters about the host's own
    // plan, that the full plan has a place again (QB1-02).
    rows.push({ member_id: host.id, kind: "place_opened", plan_id: plan.id, role: "host", going_count: going.length, dedupe_key: `upd:place_opened:${plan.id}:${host.id}:${leftAt}` });
  }
  if (e.wasFull) {
    for (const id of others) {
      const p = everyone.get(id);
      if (p && channelsFor("in.place_opened", p, now).update) {
        rows.push({ member_id: id, kind: "place_opened", plan_id: plan.id, role: "going", going_count: going.length, dedupe_key: `upd:place_opened:${plan.id}:${id}:${leftAt}` });
      }
    }
  }
  const updates = await writePlanUpdates(plan.id, rows);
  sendLater(`plan left ${plan.id}`, [], [], pushes);
  return { ...none(), updates, pushes: pushes.length };
}

async function planChanged(e: Extract<NotifyEvent, { type: "plan.changed" }>, now: Date): Promise<NotifyOutcome> {
  const facts = await planFacts(e.planId);
  if (!facts) return none();
  const { plan, going } = facts;
  const ids = going.map((g) => g.member_id).filter((id) => id !== plan.host_id);
  const everyone = await people([plan.host_id, ...ids]);
  const blockers = await blockedBy(ids, plan.host_id);
  const hostName = firstName(everyone.get(plan.host_id)?.full_name) || "The host";
  const changedAt = ms(plan.changed_at) || now.getTime();
  const moved = e.timeChanged && e.placeChanged ? "both" : e.timeChanged ? "time" : "place";
  const rows: UpdateInsert[] = [];
  const emails: Email[] = [];
  const pushes: PushInput[] = [];
  for (const id of ids) {
    const p = everyone.get(id);
    if (!p) continue;
    const c = channelsFor("in.changed", p, now);
    if (c.push) {
      const words = pushWords.planMoved(plan.title, blockers.has(id) ? null : hostName, moved, plan.starts_at, plan.place, now);
      pushes.push(planPush(plan, id, "push-plan-changed", words, `push:changed:${plan.id}:${id}:${changedAt}`, now));
    }
    // A member who blocked the host still hears that a plan they are going to moved (QB1-02); the Update leaves
    // the host out (no name, no photo), the email is the plan's own facts.
    if (c.update) {
      rows.push({ member_id: id, kind: "changed", plan_id: plan.id, actor_id: blockers.has(id) ? null : plan.host_id, role: "going", previous_starts_at: e.timeChanged ? e.previousStartsAt : null, dedupe_key: `upd:changed:${plan.id}:${id}:${changedAt}` });
    }
    if (c.email) {
      emails.push({
        template: "plan-changed",
        to: p.email,
        data: {
          moved,
          hostName,
          plan: { title: plan.title, start: start(plan.starts_at) },
          ...(e.timeChanged ? { wasStart: start(e.previousStartsAt) } : {}),
          ...(e.placeChanged ? { wasPlace: e.previousPlace } : {}),
          place: plan.place,
          planUrl: openInviteHref(plan.id),
        },
        dedupeKey: `plan-changed:${plan.id}:${id}:${changedAt}`,
        refs: { memberId: id, planId: plan.id },
      });
    }
  }
  const updates = await writeUpdates(rows);
  sendLater(`plan changed ${plan.id}`, emails, [], pushes);
  return { ...none(), updates, emails: emails.length, pushes: pushes.length };
}

async function planCancelled(e: Extract<NotifyEvent, { type: "plan.cancelled" }>, now: Date): Promise<NotifyOutcome> {
  const facts = await planFacts(e.planId);
  if (!facts) return none();
  const { plan, going } = facts;
  const ids = going.map((g) => g.member_id).filter((id) => id !== plan.host_id);
  const everyone = await people([plan.host_id, ...ids]);
  const blockers = e.byClub ? new Set<string>() : await blockedBy(ids, plan.host_id);
  const hostName = firstName(everyone.get(plan.host_id)?.full_name) || "The host";
  const rows: UpdateInsert[] = [];
  const emails: Email[] = [];
  const pushes: PushInput[] = [];
  const cancelData = { hostName, plan: { title: plan.title, start: start(plan.starts_at) }, place: plan.place, openInviteUrl: ROUTES.openInvite };
  for (const id of ids) {
    const p = everyone.get(id);
    if (!p) continue;
    const c = channelsFor("in.cancelled", p, now);
    if (c.push) {
      const words = pushWords.planCancelled(plan.title, blockers.has(id) ? null : hostName, e.byClub);
      pushes.push(planPush(plan, id, "push-plan-cancelled", words, `push:cancelled:${plan.id}:${id}`, now));
    }
    if (c.update) {
      rows.push({ member_id: id, kind: "cancelled", plan_id: plan.id, actor_id: e.byClub || blockers.has(id) ? null : plan.host_id, role: "going", dedupe_key: `upd:cancelled:${plan.id}:${id}` });
    }
    // Everyone going hears it by their email switch, a member who blocked the host too (QB1-02: a fact about a
    // plan they are going to). The club's cancel has the club's words (the host did not cancel it).
    if (c.email) {
      emails.push({
        template: "plan-cancelled",
        to: p.email,
        data: e.byClub ? { ...cancelData, by: "club", to: "going" } : cancelData,
        dedupeKey: `plan-cancelled:${plan.id}:${id}`,
        refs: { memberId: id, planId: plan.id },
      });
    }
  }
  // The club removed or cancelled the host's plan: the host is told too (QB3-07), an Update and an account email
  // (it is the club acting on what they posted, like the photo-removed email: sent whatever the switches say).
  // A host who was paused or ended hears nothing (canHear).
  const host = everyone.get(plan.host_id);
  if (e.byClub && host && canHear(host, now)) {
    rows.push({ member_id: host.id, kind: "cancelled", plan_id: plan.id, actor_id: null, role: "host", dedupe_key: `upd:cancelled:${plan.id}:${host.id}` });
    emails.push({
      template: "plan-cancelled",
      to: host.email,
      data: { ...cancelData, by: "club", to: "host" },
      dedupeKey: `plan-cancelled:${plan.id}:${host.id}`,
      refs: { memberId: host.id, planId: plan.id },
    });
    // And a push where push is live for them (an account notice like the email: not by their switches).
    if (pushLiveFor(host.email)) pushes.push(planPush(plan, host.id, "push-plan-removed", pushWords.hostPlanRemoved(plan.title), `push:cancelled:${plan.id}:${host.id}`, now));
  }
  const updates = await writeUpdates(rows);
  sendLater(`plan cancelled ${plan.id}`, emails, [], pushes);
  return { ...none(), updates, emails: emails.length, pushes: pushes.length };
}

// ---------------------------------------------------------------------------- chats

/** In a burst of messages, only the first plays a sound: the next are silent until the member reads the chat, or this long. */
const CHAT_SOUND_AGAIN_MINUTES = 2;

/**
 * A new message. Where push is live, each other member of the chat gets a phone notification at once, as a group
 * chat app does (Albert, 11 Nov 2026): a plan chat is titled with the plan, "Ana: See you at 7"; a question to the
 * host, or the host's reply, is titled with the person. Grouped by chat on the phone. In a burst only the first
 * plays a sound (until the member reads the chat, or 2 minutes). None when muted, none from someone they blocked.
 * Where push is not live, the chat email is the 15-minute nudge (./reminders.ts runChatNudges), so a member reading
 * the chat in time gets none.
 */
async function chatMessage(e: Extract<NotifyEvent, { type: "chat.message" }>, now: Date): Promise<NotifyOutcome> {
  const db = serviceDb();
  const { data } = await db
    .from("chat_members")
    .select("member_id, muted, role, last_read_at, pushed_at")
    .eq("chat_id", e.chatId)
    .is("left_at", null)
    .neq("member_id", e.senderId);
  const members = (data ?? []) as { member_id: string; muted: boolean; role: "host" | "member"; last_read_at: string | null; pushed_at: string | null }[];
  if (!members.length) return none();
  const everyone = await people([e.senderId, ...members.map((r) => r.member_id)]);
  if (!members.some((r) => pushLiveFor(everyone.get(r.member_id)?.email))) return none();
  const [{ data: chat }, { data: message }] = await Promise.all([
    db.from("chats").select("id, kind, plan:plans(id, title, host_id)").eq("id", e.chatId).maybeSingle(),
    db.from("messages").select("body").eq("id", e.messageId).maybeSingle(),
  ]);
  const plan = chat ? ((Array.isArray(chat.plan) ? chat.plan[0] : chat.plan) as { id: string; title: string; host_id: string } | null) : null;
  if (!chat || !plan) return none();
  const words = preview(message?.body);
  if (!words) return none();
  const sender = nameOf(everyone.get(e.senderId));
  const blockers = await blockedBy(members.map((r) => r.member_id), e.senderId);
  const pushes: PushInput[] = [];
  for (const r of members) {
    const p = everyone.get(r.member_id);
    if (!p || blockers.has(p.id)) continue;
    const kind = chat.kind === "plan" ? "plan" : r.role === "host" ? "question" : "reply";
    const trigger = kind === "plan" ? (r.role === "host" ? "host.message" : "in.message") : kind === "question" ? "host.question" : "in.reply";
    if (!channelsFor(trigger, p, now, { muted: r.muted }).push) continue;
    // A sound for the first message of a burst; the next ones arrive quietly until they read the chat.
    const readSince = r.pushed_at && r.last_read_at && ms(r.last_read_at) >= ms(r.pushed_at);
    const longAgo = r.pushed_at && now.getTime() - ms(r.pushed_at) >= CHAT_SOUND_AGAIN_MINUTES * 60000;
    const silent = Boolean(r.pushed_at && !readSince && !longAgo);
    if (!silent) await db.from("chat_members").update({ pushed_at: now.toISOString() }).eq("chat_id", e.chatId).eq("member_id", p.id);
    const text = kind === "plan" ? pushWords.groupMessage(plan.title, sender, words) : pushWords.directMessage(plan.title, sender, words, e.senderId === plan.host_id);
    pushes.push({
      template: "push-message",
      memberId: p.id,
      ...text,
      path: messageThreadHref(e.chatId),
      thread: `chat:${e.chatId}`,
      quiet: isQuietHours(now),
      silent,
      dedupeKey: `push:message:${e.chatId}:${p.id}:${e.messageId}`,
      refs: { chatId: e.chatId, planId: plan.id },
    });
  }
  sendLater(`chat message ${e.messageId}`, [], [], pushes);
  return { ...none(), pushes: pushes.length };
}

// ---------------------------------------------------------------------------- photos and reports

async function photoRemoved(e: Extract<NotifyEvent, { type: "photo.removed" }>): Promise<NotifyOutcome> {
  const { data: member } = await serviceDb().from("members").select("email").eq("id", e.memberId).maybeSingle();
  if (!member?.email) return none();
  // An account email: always sent ("We always send account emails"), whatever the switches say.
  sendLater(`photo removed ${e.photoId}`, [
    { template: "photo-removed", to: member.email, data: { reason: e.reason, addPhotoUrl: ROUTES.photo }, dedupeKey: `photo-removed:${e.photoId}`, refs: { memberId: e.memberId, photoId: e.photoId } },
  ]);
  return { ...none(), emails: 1 };
}

async function reportCreated(e: Extract<NotifyEvent, { type: "report.created" }>): Promise<NotifyOutcome> {
  const db = serviceDb();
  const { data: report } = await db.from("reports").select("id, kind, reason, reporter_id, member_id, plan_id, chat_id, created_at").eq("id", e.reportId).maybeSingle();
  if (!report) return none();
  const [{ count: open }, names, plan] = await Promise.all([
    db.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("members").select("id, full_name").in("id", [report.reporter_id, report.member_id].filter(Boolean)),
    report.plan_id
      ? db.from("plans").select("title").eq("id", report.plan_id).maybeSingle()
      : report.chat_id
        ? db.from("chats").select("plan:plans(title)").eq("id", report.chat_id).maybeSingle()
        : Promise.resolve({ data: null }),
  ]);
  const nameOf = (id: string | null) => firstName((names.data ?? []).find((n) => n.id === id)?.full_name) || "A member";
  const planRow = plan.data as { title?: string; plan?: { title: string } | { title: string }[] } | null;
  const planTitle = planRow?.title ?? (Array.isArray(planRow?.plan) ? planRow?.plan[0]?.title : planRow?.plan?.title) ?? null;
  const kind = report.kind as ReportKind;
  const refs: MessageRefs = { reportId: report.id, planId: report.plan_id ?? null, chatId: report.chat_id ?? null };
  sendLater(`report ${report.id}`, [
    {
      template: "admin-new-report",
      to: adminAlertsEmail(),
      data: {
        kind,
        reason: reasonLabel(kind, report.reason),
        about: nameOf(report.member_id),
        by: nameOf(report.reporter_id),
        planTitle: kind === "message" || kind === "plan" ? planTitle : null,
        sent: start(report.created_at),
        open: open ?? 1,
        reportUrl: "/admin/reports",
      },
      dedupeKey: `admin-new-report:${report.id}`,
      refs,
    },
  ]);
  return { ...none(), emails: 1 };
}

// ---------------------------------------------------------------------------- the one door

const none = (): NotifyOutcome => ({ updates: 0, emails: 0, texts: 0, pushes: 0 });

/** Tell the right people about one event, by their channels. Never throws: a failure is logged and nothing more. */
export async function notify(event: NotifyEvent, options: { now?: Date } = {}): Promise<NotifyOutcome> {
  const now = options.now ?? new Date();
  try {
    switch (event.type) {
      case "plan.joined":
        return await planJoined(event, now);
      case "plan.left":
        return await planLeft(event, now);
      case "plan.changed":
        return await planChanged(event, now);
      case "plan.cancelled":
        return await planCancelled(event, now);
      case "chat.message":
        return await chatMessage(event, now);
      case "photo.removed":
        return await photoRemoved(event);
      case "report.created":
        return await reportCreated(event);
    }
  } catch (err) {
    console.error(`notify ${event.type} failed:`, err);
  }
  return none();
}

/** The check text when a member switches Text on (r2c "Reminders switched on"). Sent now, awaited: the page says it went. */
export async function sendTextCheck(memberId: string, to: string): Promise<SendResult> {
  return sendText({
    template: "reminders-on",
    to,
    data: {},
    dedupeKey: `reminders-on:${memberId}:${to}:${Math.floor(Date.now() / 60000)}`,
    refs: { memberId },
  });
}

