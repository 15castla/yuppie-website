import "server-only";

// The dispatcher's time-based half, run by the reminders job every 15 minutes (lib/server/cron/reminders.ts):
//   - club-event reminders 24 hours and 2 hours before (email, as in stage 1, now by the member's switches; and
//     text by the member's switches);
//   - Open Invite plan reminders 24 hours and 2 hours before, to everyone going (the host too when going): an
//     Update, an email and a text, each by the member's switches;
//   - chat emails: unread after 15 minutes, at most one per chat an hour, none for a muted chat;
//   - Updates older than 30 days are deleted.
//
// Windows (as stage 1): the 24-hour reminder when the start is 24 hours or less away but more than 2 hours, to
// people in before the 24-hour mark; the 2-hour one when it is 2 hours or less away, to people in before the
// 2-hour mark. Someone who joins inside a window gets no reminder for it (notifications spec 3.6). A moved plan
// starts its reminders again (the dedupe keys carry the start time).
//
// Quiet hours for texts (decision 2 B): a text due between 22:00 and 07:00 London is held (not claimed; a
// "skipped" row says so in message_log). At 07:00 or later it goes if the start is still more than an hour away
// (with "today" or "tomorrow" in its words, since it is no longer exactly 24 or 2 hours before), otherwise it
// is skipped for good. Email is not held.
//
// Each reminder is claimed by a conditional update of its *_sent_at / *_text_at column before it goes, so two
// overlapping runs never both send; a failed send gives the claim back. Every `now` is a parameter: the cron
// route passes a fake clock under MEMBERS_TEST_HOOKS=on.

import { eventHref, messageThreadHref, openInviteHref } from "@/lib/members/routes";
import { CHAT_NUDGE, QUIET_HOURS, REMINDER_HOURS, REMINDER_LATE_MINUTES, UPDATES_KEEP_DAYS } from "../config";
import { BOOKING_ROW_COLUMNS, EVENT_ROW_COLUMNS, one, serviceDb, type BookingRow, type EventRow } from "../db";
import { dayDate, firstName, time24 } from "../format";
import { isGated, membershipState, type MemberStateFields } from "../membership";
import { logSkipped, sendEmail, sendText } from "../messages";
import { topicOn } from "../notification-prefs";
import { canHear, channelsFor, people, writeUpdates, type Person } from "./index";
import { isQuietHours, relativeDay } from "./quiet";

const HOUR = 3600000;
const MINUTE = 60000;
type Window = "24h" | "2h";
const windowMs = (w: Window) => (w === "24h" ? REMINDER_HOURS.long : REMINDER_HOURS.short) * HOUR;

/** The reminder that is due now for one person, or null. */
export function dueWindow(startMs: number, joinedMs: number, nowMs: number, done24: boolean, done2: boolean): Window | null {
  const left = startMs - nowMs;
  if (left <= 0) return null;
  if (left <= windowMs("2h")) return !done2 && joinedMs <= startMs - windowMs("2h") ? "2h" : null;
  if (left <= windowMs("24h")) return !done24 && joinedMs <= startMs - windowMs("24h") ? "24h" : null;
  return null;
}

export type TextPlan = { send: Window; day?: "today" | "tomorrow" } | { hold: Window } | { skip: Window } | null;

/** What to do about a reminder text now: send it (on time, or late with its day), hold it (quiet hours), or skip it. */
export function textPlan(startMs: number, joinedMs: number, now: Date, done24: boolean, done2: boolean): TextPlan {
  const w = dueWindow(startMs, joinedMs, now.getTime(), done24, done2);
  if (!w) return null;
  if (isQuietHours(now)) return { hold: w };
  const due = startMs - windowMs(w);
  const late = now.getTime() - due > REMINDER_LATE_MINUTES * MINUTE;
  if (!late) return { send: w };
  if (startMs - now.getTime() <= QUIET_HOURS.minLeadMinutes * MINUTE) return { skip: w };
  return { send: w, day: relativeDay(new Date(startMs).toISOString(), now) ?? undefined };
}

type Claimable = "bookings" | "plan_members";

/** Claim a reminder column (null to now) for one row; true when this run got it. */
async function claim(table: Claimable, match: Record<string, string>, column: string, now: Date): Promise<boolean> {
  let q = serviceDb().from(table).update({ [column]: now.toISOString() }).is(column, null);
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { data } = await q.select(Object.keys(match)[0]);
  return Boolean(data?.length);
}
async function release(table: Claimable, match: Record<string, string>, column: string): Promise<void> {
  let q = serviceDb().from(table).update({ [column]: null });
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  await q;
}

export type TextCounts = { texts: number; textsHeld: number; textsSkipped: number; textsFailed: number };
const textCounts = (): TextCounts => ({ texts: 0, textsHeld: 0, textsSkipped: 0, textsFailed: 0 });

/** One reminder text, by the plan above. Claims, sends or logs, and counts. */
async function reminderText(input: {
  table: Claimable;
  match: Record<string, string>;
  columns: Record<Window, string>;
  done: { "24h": boolean; "2h": boolean };
  startIso: string;
  joinedIso: string;
  person: Person;
  to: string;
  template: "event-reminder" | "plan-reminder";
  title: string;
  place: string;
  dedupe: (w: Window) => string;
  refs: Parameters<typeof sendText>[0]["refs"];
  now: Date;
  counts: TextCounts;
}): Promise<void> {
  const plan = textPlan(new Date(input.startIso).getTime(), new Date(input.joinedIso).getTime(), input.now, input.done["24h"], input.done["2h"]);
  if (!plan) return;
  if ("hold" in plan) {
    input.counts.textsHeld += 1;
    await logSkipped({ channel: "sms", template: input.template, to: input.to, dedupeKey: input.dedupe(plan.hold), reason: "quiet hours: held until 07:00", refs: input.refs });
    return;
  }
  if ("skip" in plan) {
    if (await claim(input.table, input.match, input.columns[plan.skip], input.now)) {
      input.counts.textsSkipped += 1;
      await logSkipped({ channel: "sms", template: input.template, to: input.to, dedupeKey: input.dedupe(plan.skip), reason: "quiet hours: under an hour to go at 07:00, so skipped", refs: input.refs });
    }
    return;
  }
  const column = input.columns[plan.send];
  if (!(await claim(input.table, input.match, column, input.now))) return;
  const result = await sendText({
    template: input.template,
    to: input.to,
    data: { window: plan.send, title: input.title, time: time24(input.startIso), place: input.place, ...(plan.day ? { day: plan.day } : {}) },
    dedupeKey: input.dedupe(plan.send),
    refs: input.refs,
  });
  if (result.status === "failed") {
    input.counts.textsFailed += 1;
    await release(input.table, input.match, column);
  } else if (result.status === "sent") input.counts.texts += 1;
}

// ---------------------------------------------------------------------------- club events

export type EventRemindersSummary = { checked: number; sent24h: number; sent2h: number; failed: number; skipped: number } & TextCounts;

type BookingWithEvent = BookingRow & {
  reminder_24h_text_at: string | null;
  reminder_2h_text_at: string | null;
  event: (EventRow & { address: { address: string } | { address: string }[] | null }) | (EventRow & { address: { address: string } | { address: string }[] | null })[] | null;
};

export async function runEventReminders(now: Date): Promise<EventRemindersSummary> {
  const db = serviceDb();
  const summary: EventRemindersSummary = { checked: 0, sent24h: 0, sent2h: 0, failed: 0, skipped: 0, ...textCounts() };
  const { data, error } = await db
    .from("bookings")
    .select(`${BOOKING_ROW_COLUMNS}, reminder_24h_text_at, reminder_2h_text_at, event:events!inner(${EVENT_ROW_COLUMNS}, address:event_addresses(address))`)
    .eq("status", "confirmed")
    .is("event.cancelled_at", null)
    .gt("event.start_time", now.toISOString())
    .lte("event.start_time", new Date(now.getTime() + REMINDER_HOURS.long * HOUR).toISOString())
    .or("reminder_24h_sent_at.is.null,reminder_2h_sent_at.is.null,reminder_24h_text_at.is.null,reminder_2h_text_at.is.null");
  if (error) throw error;
  const rows = (data ?? []) as unknown as BookingWithEvent[];
  const everyone = await people(rows.map((r) => r.member_id));

  for (const row of rows) {
    summary.checked += 1;
    const event = one(row.event);
    const member = everyone.get(row.member_id);
    if (!event || !member) continue;
    if (!canHear(member, now)) {
      summary.skipped += 1;
      continue;
    }
    const startMs = new Date(event.start_time).getTime();
    const window = dueWindow(startMs, new Date(row.booked_at).getTime(), now.getTime(), Boolean(row.reminder_24h_sent_at), Boolean(row.reminder_2h_sent_at));
    if (window) {
      const column = window === "24h" ? "reminder_24h_sent_at" : "reminder_2h_sent_at";
      const wants = channelsFor(`reminder.${window}`, member, now);
      if (await claim("bookings", { id: row.id }, column, now)) {
        if (!wants.email) {
          summary.skipped += 1;
        } else {
          const address = one(event.address)?.address?.trim() || null;
          const result = await sendEmail({
            template: "event-reminder",
            to: member.email,
            data: {
              window,
              event: { title: event.title, start: { date: dayDate(event.start_time), time: time24(event.start_time) } },
              place: { venue: event.location?.trim() || event.title, address },
              bookingUrl: eventHref(event.slug),
            },
            // Stage 1's key, unchanged, so a reminder already sent before the release is never sent again; once the
            // event has moved, the key carries the start, so the reminder goes again for the new time (QB2-05: the
            // move clears the claims, lib/server/events.ts recordEventMove).
            dedupeKey: event.changed_at ? `event-reminder-${window}:${row.id}:${startMs}` : `event-reminder-${window}:${row.id}`,
            refs: { memberId: member.id, bookingId: row.id, eventId: event.id },
          });
          if (result.status === "failed") {
            summary.failed += 1;
            await release("bookings", { id: row.id }, column);
          } else if (result.status === "sent") {
            if (window === "24h") summary.sent24h += 1;
            else summary.sent2h += 1;
          } else summary.skipped += 1;
        }
      }
    }
    const textWindow = dueWindow(startMs, new Date(row.booked_at).getTime(), now.getTime(), Boolean(row.reminder_24h_text_at), Boolean(row.reminder_2h_text_at));
    const to = textWindow ? channelsFor(`reminder.${textWindow}`, member, now).text : null;
    if (to) {
      await reminderText({
        table: "bookings",
        match: { id: row.id },
        columns: { "24h": "reminder_24h_text_at", "2h": "reminder_2h_text_at" },
        done: { "24h": Boolean(row.reminder_24h_text_at), "2h": Boolean(row.reminder_2h_text_at) },
        startIso: event.start_time,
        joinedIso: row.booked_at,
        person: member,
        to,
        template: "event-reminder",
        title: event.title,
        place: event.location?.trim() || event.title,
        dedupe: (w) => `event-reminder-text-${w}:${row.id}:${startMs}`,
        refs: { memberId: member.id, bookingId: row.id, eventId: event.id },
        now,
        counts: summary,
      });
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------- Open Invite plans

export type PlanRemindersSummary = { checked: number; updates: number; emails24h: number; emails2h: number; failed: number; skipped: number } & TextCounts;

type PlaceRow = {
  plan_id: string;
  member_id: string;
  joined_at: string;
  reminder_24h_sent_at: string | null;
  reminder_2h_sent_at: string | null;
  reminder_24h_text_at: string | null;
  reminder_2h_text_at: string | null;
  plan: { id: string; host_id: string; title: string; starts_at: string; place: string; status: string; removed_at: string | null } | { id: string; host_id: string; title: string; starts_at: string; place: string; status: string; removed_at: string | null }[] | null;
};

export async function runPlanReminders(now: Date): Promise<PlanRemindersSummary> {
  const db = serviceDb();
  const summary: PlanRemindersSummary = { checked: 0, updates: 0, emails24h: 0, emails2h: 0, failed: 0, skipped: 0, ...textCounts() };
  const { data, error } = await db
    .from("plan_members")
    .select("plan_id, member_id, joined_at, reminder_24h_sent_at, reminder_2h_sent_at, reminder_24h_text_at, reminder_2h_text_at, plan:plans!inner(id, host_id, title, starts_at, place, status, removed_at)")
    .eq("status", "going")
    .eq("plan.status", "scheduled")
    .is("plan.removed_at", null)
    .is("plan.price_pence", null)
    .gt("plan.starts_at", now.toISOString())
    .lte("plan.starts_at", new Date(now.getTime() + REMINDER_HOURS.long * HOUR).toISOString())
    .or("reminder_24h_sent_at.is.null,reminder_2h_sent_at.is.null,reminder_24h_text_at.is.null,reminder_2h_text_at.is.null");
  if (error) throw error;
  const rows = (data ?? []) as unknown as PlaceRow[];
  const everyone = await people(rows.map((r) => r.member_id));
  // Who else is going, for the email's "Jasmin and Priya are going too.", in the order they said yes.
  const planIds = [...new Set(rows.map((r) => r.plan_id))];
  const { data: goingRows } = planIds.length
    ? await db
        .from("plan_members")
        .select("plan_id, member_id, joined_at, member:members(full_name, membership_status, cancel_at, payment_failed_at, grace_until, paused_at, ended_at, deleted_at)")
        .in("plan_id", planIds)
        .eq("status", "going")
        .order("joined_at", { ascending: true })
    : { data: [] };
  const goingBy = new Map<string, { id: string; name: string }[]>();
  for (const g of (goingRows ?? []) as unknown as { plan_id: string; member_id: string; member: (MemberStateFields & { full_name: string | null }) | null }[]) {
    // The email's "Going" list is the people who will be there: not a paused or ended member (QB2-09).
    const m = one(g.member);
    if (!m || m.deleted_at || isGated(membershipState(m, now).state)) continue;
    goingBy.set(g.plan_id, [...(goingBy.get(g.plan_id) ?? []), { id: g.member_id, name: firstName(m.full_name) || "Member" }]);
  }

  for (const row of rows) {
    summary.checked += 1;
    const plan = one(row.plan);
    const member = everyone.get(row.member_id);
    if (!plan || !member) continue;
    if (!canHear(member, now)) {
      summary.skipped += 1;
      continue;
    }
    const startMs = new Date(plan.starts_at).getTime();
    const match = { plan_id: row.plan_id, member_id: row.member_id };
    const role = plan.host_id === member.id ? "host" : "going";
    const window = dueWindow(startMs, new Date(row.joined_at).getTime(), now.getTime(), Boolean(row.reminder_24h_sent_at), Boolean(row.reminder_2h_sent_at));
    if (window) {
      const column = window === "24h" ? "reminder_24h_sent_at" : "reminder_2h_sent_at";
      if (await claim("plan_members", match, column, now)) {
        const wants = channelsFor(`reminder.${window}`, member, now);
        // The reminder Update follows the reminder's own switch (QB2-09): with "24 hours before" off, no 24-hour
        // Update either.
        if (wants.update && topicOn(member.prefs, window === "24h" ? "reminder24" : "reminder2")) {
          summary.updates += await writeUpdates([
            { member_id: member.id, kind: "reminder", plan_id: plan.id, role, reminder_hours: window === "24h" ? 24 : 2, dedupe_key: `upd:reminder:${plan.id}:${member.id}:${window}:${startMs}`, created_at: now.toISOString() },
          ]);
        }
        if (wants.email) {
          const others = (goingBy.get(plan.id) ?? []).filter((g) => g.id !== member.id).map((g) => g.name);
          const result = await sendEmail({
            template: "plan-reminder",
            to: member.email,
            data: { window, plan: { title: plan.title, start: { date: dayDate(plan.starts_at), time: time24(plan.starts_at) } }, place: plan.place, others, planUrl: openInviteHref(plan.id) },
            dedupeKey: `plan-reminder-${window}:${plan.id}:${member.id}:${startMs}`,
            refs: { memberId: member.id, planId: plan.id },
          });
          if (result.status === "failed") {
            summary.failed += 1;
            await release("plan_members", match, column);
          } else if (result.status === "sent") {
            if (window === "24h") summary.emails24h += 1;
            else summary.emails2h += 1;
          } else summary.skipped += 1;
        }
      }
    }
    const textWindow = dueWindow(startMs, new Date(row.joined_at).getTime(), now.getTime(), Boolean(row.reminder_24h_text_at), Boolean(row.reminder_2h_text_at));
    const to = textWindow ? channelsFor(`reminder.${textWindow}`, member, now).text : null;
    if (to) {
      await reminderText({
        table: "plan_members",
        match,
        columns: { "24h": "reminder_24h_text_at", "2h": "reminder_2h_text_at" },
        done: { "24h": Boolean(row.reminder_24h_text_at), "2h": Boolean(row.reminder_2h_text_at) },
        startIso: plan.starts_at,
        joinedIso: row.joined_at,
        person: member,
        to,
        template: "plan-reminder",
        title: plan.title,
        place: plan.place,
        dedupe: (w) => `plan-reminder-text-${w}:${plan.id}:${member.id}:${startMs}`,
        refs: { memberId: member.id, planId: plan.id },
        now,
        counts: summary,
      });
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------- chat emails

export type NudgesSummary = { due: number; sent: number; skipped: number; failed: number };

export async function runChatNudges(now: Date): Promise<NudgesSummary> {
  const db = serviceDb();
  const summary: NudgesSummary = { due: 0, sent: 0, skipped: 0, failed: 0 };
  const { data, error } = await db.rpc("chat_nudges_due", { p_now: now.toISOString(), p_after_minutes: CHAT_NUDGE.afterMinutes, p_every_minutes: CHAT_NUDGE.everyMinutes });
  if (error) throw error;
  const due = (data ?? []) as { chat_id: string; member_id: string; role: "host" | "member"; unread: number; first_unread_id: string }[];
  if (!due.length) return summary;
  const { data: chats } = await db.from("chats").select("id, kind, asker_id, plan:plans(id, title, starts_at, place)").in("id", [...new Set(due.map((d) => d.chat_id))]);
  const chatBy = new Map(((chats ?? []) as unknown as { id: string; kind: "plan" | "question"; plan: { id: string; title: string; starts_at: string; place: string } | null }[]).map((c) => [c.id, c]));
  const everyone = await people(due.map((d) => d.member_id));
  for (const d of due) {
    summary.due += 1;
    const chat = chatBy.get(d.chat_id);
    const plan = chat ? one(chat.plan) : null;
    const member = everyone.get(d.member_id);
    if (!chat || !plan || !member) continue;
    const trigger = chat.kind === "plan" ? (d.role === "host" ? "host.message" : "in.message") : d.role === "host" ? "host.question" : "in.reply";
    if (!channelsFor(trigger, member, now).email) {
      summary.skipped += 1;
      continue;
    }
    // Claim (never emailed, or emailed an hour or more ago), in two plain conditional updates: PostgREST does not
    // take an `or` filter on an update.
    const cutoff = new Date(now.getTime() - CHAT_NUDGE.everyMinutes * MINUTE).toISOString();
    const claimOnce = (q: ReturnType<typeof claimBase>) => q.select("chat_id");
    const claimBase = () => db.from("chat_members").update({ nudged_at: now.toISOString() }).eq("chat_id", d.chat_id).eq("member_id", d.member_id);
    let { data: claimed } = await claimOnce(claimBase().is("nudged_at", null));
    if (!claimed?.length) ({ data: claimed } = await claimOnce(claimBase().lte("nudged_at", cutoff)));
    if (!claimed?.length) continue;
    const result = await sendEmail({
      template: "new-message",
      to: member.email,
      data: {
        kind: chat.kind === "plan" ? "plan" : d.role === "host" ? "question" : "reply",
        plan: { title: plan.title, start: { date: dayDate(plan.starts_at), time: time24(plan.starts_at) } },
        place: plan.place,
        newCount: d.unread,
        chatUrl: messageThreadHref(d.chat_id),
      },
      dedupeKey: `chat-nudge:${d.chat_id}:${d.member_id}:${d.first_unread_id}`,
      refs: { memberId: member.id, chatId: d.chat_id, planId: plan.id },
    });
    if (result.status === "failed") {
      summary.failed += 1;
      await db.from("chat_members").update({ nudged_at: null }).eq("chat_id", d.chat_id).eq("member_id", d.member_id);
    } else if (result.status === "sent") summary.sent += 1;
    else summary.skipped += 1;
  }
  return summary;
}

// ---------------------------------------------------------------------------- tidy

export async function deleteOldUpdates(now: Date): Promise<number> {
  const { data, error } = await serviceDb().from("updates").delete().lt("created_at", new Date(now.getTime() - UPDATES_KEEP_DAYS * 24 * HOUR).toISOString()).select("id");
  if (error) {
    console.error("reminders: deleting old updates failed:", error);
    return 0;
  }
  return data?.length ?? 0;
}
