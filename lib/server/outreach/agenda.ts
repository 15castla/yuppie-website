import "server-only";

// Albert's day on the desk (Phase 3, 17 Nov 2026): what the 06:30 email from Alex says and what Alex's desk_today
// tool reads. Built from the same rows as the Today page: follow-ups going out today (and whether their drafts are in
// Outlook), calls and meetings, action points due or late, replies waiting for his answer, what the Outlook connection
// found for him to check, and whether the Mac has synced.

import type { ServiceDb } from "@/lib/server/db";
import { dueItems, type DeskData } from "./compute";
import { loadDesk } from "./desk";
import { stepWords } from "./model";
import { addWorkingDays, ukDate } from "./rules";

export type WaitingReply = {
  outcomeId: string;
  targetId: string;
  partner: string;
  from: string;
  receivedAt: string;
  subject: string | null;
  words: "none" | "written" | "drafted";
  draftLink: string | null;
};

/** Has Albert emailed in that thread (or sequence) since this reply came in? */
export function answeredReply(touches: DeskData["touches"], o: DeskData["outcomes"][number]): boolean {
  const thread = o.conversation_id ?? null;
  return touches.some(
    (t) =>
      t.target_id === o.target_id &&
      t.channel === "email" &&
      (t.status === "sent" || t.status === "unconfirmed") &&
      !!t.sent_at &&
      t.sent_at > o.received_at &&
      ((!!thread && t.conversation_id === thread) || (!!o.sequence_id && t.sequence_id === o.sequence_id)),
  );
}

/**
 * Replies from partners that Albert hasn't answered yet: the newest confirmed reply in its thread, in the last three
 * weeks, with no email from Albert in that thread (or sequence) after it.
 */
export function waitingReplies(data: DeskData, now: Date = new Date()): WaitingReply[] {
  const since = new Date(now.getTime() - 21 * 86400_000).toISOString();
  const names = new Map(data.targets.map((t) => [t.id, t]));
  const out: WaitingReply[] = [];
  const replies = data.outcomes.filter((o) => o.kind === "reply" && o.confirmed && o.received_at >= since).sort((a, b) => b.received_at.localeCompare(a.received_at));
  const seen = new Set<string>();
  for (const o of replies) {
    const thread = o.conversation_id ?? null;
    const key = thread ?? o.sequence_id ?? o.id;
    if (seen.has(key)) continue; // only the newest reply in each thread
    seen.add(key);
    const target = names.get(o.target_id);
    if (!target || target.stage === "declined" || target.opted_out) continue;
    if (answeredReply(data.touches, o)) continue;
    const text = (data.texts ?? []).find((x) => x.outcome_id === o.id && x.status !== "discarded");
    out.push({
      outcomeId: o.id,
      targetId: o.target_id,
      partner: target.name,
      from: o.from_name ?? o.from_address ?? "them",
      receivedAt: o.received_at,
      subject: o.subject,
      words: text ? (text.status === "drafted" ? "drafted" : "written") : "none",
      draftLink: text?.draft_link ?? null,
    });
  }
  return out;
}

export type Agenda = Awaited<ReturnType<typeof buildAgenda>>;

/** The day, in words and numbers, for the email and for Alex. */
export async function buildAgenda(db: ServiceDb, now: Date = new Date()) {
  const data = await loadDesk(db);
  const today = ukDate(now);
  const due = dueItems(data, now);
  const week = dueItems(data, now, addWorkingDays(today, 5)).filter((i) => (i.kind === "call" ? ukDate(i.at) > today : i.due > today));
  const [{ data: lastRun }, toCheck] = await Promise.all([
    db.from("outreach_sync_runs").select("finished_at, ok").not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(1).maybeSingle(),
    Promise.resolve(data.touches.filter((t) => t.status === "unconfirmed").length + data.outcomes.filter((o) => !o.confirmed).length),
  ]);
  const followups = due
    .filter((i) => i.kind === "followup")
    .map((i) => (i.kind === "followup" ? { id: i.id, targetId: i.targetId, partner: i.name, what: `${stepWords(i.step)} email`, due: i.due, late: i.late, words: i.text, draftLink: i.draftLink, draftError: i.draftError, needsEmail: i.needsEmail, to: i.to } : null))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const actions = due
    .filter((i) => i.kind === "action")
    .map((i) => (i.kind === "action" ? { id: i.id, targetId: i.targetId, partner: i.name, title: i.title, kind: i.actionKind, due: i.due, late: i.late, startsAt: i.startsAt } : null))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const calls = due
    .filter((i) => i.kind === "call")
    .map((i) => (i.kind === "call" ? { targetId: i.targetId, partner: i.name, at: i.at } : null))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const replies = waitingReplies(data, now);
  const toRate = data.outcomes.filter((o) => o.kind === "reply" && o.confirmed && !o.sentiment).length;
  return {
    date: today,
    followups,
    actions,
    calls,
    replies,
    toCheck,
    toRate,
    comingUp: week.length,
    outlook: lastRun ? { lastSync: lastRun.finished_at as string, ok: !!lastRun.ok, stale: now.getTime() - new Date(lastRun.finished_at as string).getTime() > 2 * 3600_000 } : null,
  };
}
