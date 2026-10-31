import "server-only";

// The Reports queue for the admin list and card, read with the service role after requireAdmin(). The queue and
// the detail are the foundation's (lib/server/reports: adminReportQueue, adminReportDetail); this adds what the
// approved card shows beside them (msg-admin-moderation-1280): the chat ("Plan chat, Sunday walk and coffee
// (Sun 25 Oct, 11:00), 4 members"), the member ("member since Sep 2026 · no earlier reports · blocked by 0
// members") and whether they can be suspended, the reported plan and the reported photo's state.

import { cache } from "react";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { requireAdmin } from "@/app/admin/require-admin";
import { firstNameOf, hoursStat, queueAgo } from "@/components/admin/format";
import type { QueueStat } from "@/components/admin/queue";
import { MEMBER_ROW_COLUMNS, type MemberRow } from "@/lib/server/db";
import { membershipState } from "@/lib/server/membership";
import { adminReportDetail, adminReportQueue, type AdminReportDetail, type AdminReportItem } from "@/lib/server/reports";
import { STATUS_PILL, type ReportListRow, type ReportTab } from "./report-tabs";

export { STATUS_PILL };

/** The promise on the page (messages decision 4 A): every report looked at within 24 hours. */
export const REVIEW_WITHIN_HOURS = 24;

const FORMER = "Former member";

function row(item: AdminReportItem, now: Date): ReportListRow {
  const name = item.about?.firstName ?? FORMER;
  const plan = item.plan?.title ? item.plan.title : null;
  const base = { id: item.id, status: item.status, name, reason: item.reasonLabel, reporter: firstNameOf(item.reporter.name) || "A member", ago: queueAgo(item.createdAt, now), photoUrl: item.about?.photoUrl ?? null };
  switch (item.kind) {
    case "message":
      return { ...base, context: plan ? `in ${plan}` : "", line: item.messageText ?? "Message removed", lineIsKind: item.messageText === null };
    case "photo":
      return { ...base, context: "photo", line: "Profile photo", lineIsKind: true };
    case "plan":
      return { ...base, context: "plan", line: plan ?? "A plan", lineIsKind: !plan };
    default:
      return { ...base, context: "member", line: plan ? `In ${plan}` : "Member", lineIsKind: true };
  }
}

export type ReportQueues = { open: ReportListRow[]; done: ReportListRow[]; stats: QueueStat[]; counts: Record<ReportTab, number> };

export const reportQueues = cache(async function reportQueues(): Promise<ReportQueues> {
  await requireAdmin();
  const now = new Date();
  const [open, done] = await Promise.all([adminReportQueue("open", now), adminReportQueue("done", now)]);
  const s = open.stats;
  return {
    open: open.items.map((i) => row(i, now)),
    done: done.items.map((i) => row(i, now)),
    counts: { open: s.open, done: s.done },
    stats: [
      { label: "Open reports", value: String(s.open) },
      { label: "Oldest open", value: hoursStat(s.oldestOpenHours), late: s.oldestOpenHours !== null && s.oldestOpenHours >= REVIEW_WITHIN_HOURS },
      { label: "Review within", value: `${REVIEW_WITHIN_HOURS} h` },
      { label: "Removed this month", value: String(s.removedThisMonth) },
    ],
  };
});

// ---------------------------------------------------------------------------- the card

export type ReportCardData = {
  report: AdminReportDetail;
  reporterFirst: string;
  /** Who it is about, as the card needs them; null when the account was deleted. */
  member: {
    id: string;
    first: string;
    since: string;
    earlierReports: number;
    blockedBy: number;
    state: "active" | "paused" | "cancelled";
    deleted: boolean;
    hasSubscription: boolean;
  } | null;
  chat: { kind: "plan" | "question"; planTitle: string; startsAt: string; members: number } | null;
  plan: {
    id: string;
    title: string;
    startsAt: string;
    place: string;
    note: string | null;
    places: number;
    /** Everyone going (the host too while they go): "3 going of 6 places". */
    going: number;
    /** The people going other than the host: who hears about a removal. */
    guests: number;
    status: "scheduled" | "cancelled";
    removedAt: string | null;
    started: boolean;
  } | null;
  /** The reported photo (a photo report, or a member report about their photo). */
  photo: { id: string; status: "pending" | "approved" | "removed" | "replaced"; addedAt: string; removedAt: string | null } | null;
};

export const reportCard = cache(async function reportCard(reportId: string): Promise<ReportCardData | null> {
  await requireAdmin();
  const report = await adminReportDetail(reportId);
  if (!report) return null;
  const db = createAdminSupabaseClient();
  const aboutId = report.about?.id ?? null;
  const [{ data: photoRef }, memberRes, earlierRes, blockedRes, chatRes, chatCount, planRes, goingRes, guestsRes] = await Promise.all([
    db.from("reports").select("photo_id").eq("id", report.id).maybeSingle(),
    aboutId ? db.from("members").select(MEMBER_ROW_COLUMNS).eq("id", aboutId).maybeSingle<MemberRow>() : Promise.resolve({ data: null }),
    aboutId ? db.from("reports").select("id", { count: "exact", head: true }).eq("member_id", aboutId).lt("created_at", report.createdAt) : Promise.resolve({ count: 0 }),
    aboutId ? db.from("blocks").select("blocker_id", { count: "exact", head: true }).eq("blocked_id", aboutId) : Promise.resolve({ count: 0 }),
    report.chatId ? db.from("chats").select("kind, plan:plans(title, starts_at)").eq("id", report.chatId).maybeSingle() : Promise.resolve({ data: null }),
    report.chatId ? db.from("chat_members").select("member_id", { count: "exact", head: true }).eq("chat_id", report.chatId).is("left_at", null) : Promise.resolve({ count: 0 }),
    report.plan ? db.from("plans").select("id, title, starts_at, place, note, places, status, removed_at").eq("id", report.plan.id).maybeSingle() : Promise.resolve({ data: null }),
    report.plan ? db.from("plan_members").select("member_id", { count: "exact", head: true }).eq("plan_id", report.plan.id).eq("status", "going") : Promise.resolve({ count: 0 }),
    report.plan ? db.from("plan_members").select("member_id", { count: "exact", head: true }).eq("plan_id", report.plan.id).eq("status", "going").eq("role", "guest") : Promise.resolve({ count: 0 }),
  ]);
  const photoId = (photoRef?.photo_id as string | null) ?? null;
  const { data: photoRow } = photoId
    ? await db.from("member_photos").select("id, status, created_at, removed_at").eq("id", photoId).maybeSingle()
    : { data: null };

  const m = memberRes.data as MemberRow | null;
  let member: ReportCardData["member"] = null;
  if (m) {
    const state = m.deleted_at ? "cancelled" : membershipState(m).state;
    member = {
      id: m.id,
      first: m.deleted_at ? FORMER : firstNameOf(m.full_name, m.email),
      since: m.created_at,
      earlierReports: earlierRes.count ?? 0,
      blockedBy: blockedRes.count ?? 0,
      state: state === "paused" ? "paused" : state === "cancelled" ? "cancelled" : "active",
      deleted: Boolean(m.deleted_at),
      hasSubscription: Boolean(m.stripe_subscription_id) && state !== "cancelled",
    };
  }
  const chatRow = chatRes.data as { kind: "plan" | "question"; plan: { title: string; starts_at: string } | { title: string; starts_at: string }[] | null } | null;
  const chatPlan = chatRow ? (Array.isArray(chatRow.plan) ? chatRow.plan[0] : chatRow.plan) : null;
  const p = planRes.data as { id: string; title: string; starts_at: string; place: string; note: string | null; places: number; status: "scheduled" | "cancelled"; removed_at: string | null } | null;
  return {
    report,
    reporterFirst: firstNameOf(report.reporter.name) || "A member",
    member,
    chat: chatRow && chatPlan ? { kind: chatRow.kind, planTitle: chatPlan.title, startsAt: chatPlan.starts_at, members: chatCount.count ?? 0 } : null,
    plan: p
      ? { id: p.id, title: p.title, startsAt: p.starts_at, place: p.place, note: p.note, places: p.places, going: goingRes.count ?? 0, guests: guestsRes.count ?? 0, status: p.status, removedAt: p.removed_at, started: new Date(p.starts_at) <= new Date() }
      : null,
    photo: photoRow ? { id: photoRow.id as string, status: photoRow.status as NonNullable<ReportCardData["photo"]>["status"], addedAt: photoRow.created_at as string, removedAt: (photoRow.removed_at as string | null) ?? null } : null,
  };
});
