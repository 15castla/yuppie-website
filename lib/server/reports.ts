import "server-only";

// Reports (messages spec 3.6 and 3.8, Open Invite spec 3.5, photo spec 3): a member reports a message, a member,
// a photo or a plan; every new report emails the club (decision 4 A, to ADMIN_ALERTS_EMAIL, through the
// dispatcher), and the admin Reports queue acts on it: dismiss, remove the message, remove the plan, remove the
// photo (with the reason the member sees), warn (recorded only: there is no warning email design yet), or
// suspend (pause the membership through the stage 1 path). The reporter is never shown to the member reported.
// Every target is checked on the server: a member can only report what they can see.

import type { PhotoRemovedReason } from "@/lib/emails";
import type { ReportDraft } from "@/lib/members/messages/types";
import { audit } from "./audit";
import { serviceDb } from "./db";
import { firstName } from "./format";
import { pauseMember } from "./membership-actions";
import { notify } from "./notify";
import { adminRemovePhoto, currentPhotoUrls, signedUrl } from "./photos";
import { adminRemovePlan, canSeePlan, isUuid, PLAN_COLUMNS, type PlanRow, type Viewer } from "./plans";
import { reasonId, reasonLabel, type ReportKind } from "./report-reasons";

export type CreateReportResult = { ok: true; reportId: string; duplicate: boolean } | { ok: false; error: string };

const CANT = "We couldn’t find that to report it. Try again.";

type Target = { kind: ReportKind; member_id: string | null; plan_id: string | null; chat_id: string | null; message_id: string | null; photo_id: string | null };

async function inChat(memberId: string, chatId: string): Promise<{ plan_id: string } | null> {
  if (!isUuid(chatId)) return null;
  const db = serviceDb();
  const [{ data: me }, { data: chat }] = await Promise.all([
    db.from("chat_members").select("left_at").eq("chat_id", chatId).eq("member_id", memberId).maybeSingle(),
    db.from("chats").select("plan_id").eq("id", chatId).maybeSingle(),
  ]);
  return me && chat ? (chat as { plan_id: string }) : null;
}

async function currentPhotoId(memberId: string): Promise<string | null> {
  const { data } = await serviceDb().from("members").select("photo_id").eq("id", memberId).maybeSingle();
  return (data?.photo_id as string | null) ?? null;
}

/** Work out and check what is being reported. Null: not something this member can report. */
async function resolveTarget(viewer: Viewer, draft: ReportDraft): Promise<Target | null> {
  const t = draft?.target;
  if (!t || typeof t !== "object") return null;
  const db = serviceDb();
  if (t.kind === "message") {
    if (!isUuid(t.messageId)) return null;
    const chat = await inChat(viewer.id, t.chatId);
    if (!chat) return null;
    const { data: m } = await db.from("messages").select("id, chat_id, kind, sender_id").eq("id", t.messageId).maybeSingle();
    if (!m || m.chat_id !== t.chatId || m.kind !== "text" || !m.sender_id || m.sender_id === viewer.id) return null;
    return { kind: "message", member_id: m.sender_id, plan_id: chat.plan_id, chat_id: t.chatId, message_id: m.id, photo_id: null };
  }
  if (t.kind === "member") {
    if (!isUuid(t.memberId) || t.memberId === viewer.id) return null;
    const chat = await inChat(viewer.id, t.chatId);
    if (!chat) return null;
    const { data: them } = await db.from("chat_members").select("member_id").eq("chat_id", t.chatId).eq("member_id", t.memberId).maybeSingle();
    if (!them) return null;
    return { kind: "member", member_id: t.memberId, plan_id: chat.plan_id, chat_id: t.chatId, message_id: null, photo_id: null };
  }
  if (t.kind === "photo") {
    if (!isUuid(t.memberId) || t.memberId === viewer.id) return null;
    let planId: string | null = null;
    if (t.chatId) {
      const chat = await inChat(viewer.id, t.chatId);
      if (!chat) return null;
      planId = chat.plan_id;
    }
    const photo = await currentPhotoId(t.memberId);
    if (!photo) return null;
    return { kind: "photo", member_id: t.memberId, plan_id: planId, chat_id: t.chatId ?? null, message_id: null, photo_id: photo };
  }
  if (t.kind === "plan") {
    if (!isUuid(t.planId)) return null;
    const { data: plan } = await db.from("plans").select(PLAN_COLUMNS).eq("id", t.planId).maybeSingle<PlanRow>();
    if (!plan || plan.host_id === viewer.id || !(await canSeePlan(viewer.id, plan))) return null;
    return { kind: "plan", member_id: plan.host_id, plan_id: plan.id, chat_id: null, message_id: null, photo_id: null };
  }
  return null;
}

export async function createReport(viewer: Viewer, draft: ReportDraft): Promise<CreateReportResult> {
  const target = await resolveTarget(viewer, draft);
  if (!target) return { ok: false, error: CANT };
  const reason = reasonId(target.kind, draft.reason);
  if (!reason) return { ok: false, error: "Pick a reason." };
  if (target.kind === "member" && reason === "photo_not_them_or_unsuitable" && target.member_id) target.photo_id = await currentPhotoId(target.member_id);

  const db = serviceDb();
  // The same thing reported again by the same member while it is still open: the one report, one email.
  let same = db.from("reports").select("id").eq("reporter_id", viewer.id).eq("kind", target.kind).eq("status", "open");
  same = target.message_id ? same.eq("message_id", target.message_id) : target.kind === "plan" ? same.eq("plan_id", target.plan_id!) : same.eq("member_id", target.member_id!);
  const { data: existing } = await same.limit(1);
  if (existing?.length) return { ok: true, reportId: existing[0].id, duplicate: true };

  const { data, error } = await db.from("reports").insert({ reporter_id: viewer.id, reason, ...target }).select("id").single();
  if (error) {
    console.error(`reports: saving a report by ${viewer.id} failed:`, error);
    return { ok: false, error: "Your report didn’t send. Try again." };
  }
  await notify({ type: "report.created", reportId: data.id });
  return { ok: true, reportId: data.id, duplicate: false };
}

// ---------------------------------------------------------------------------- admin

export type ReportStatus = "open" | "dismissed" | "message_removed" | "plan_removed" | "photo_removed" | "warned" | "suspended";

export type AdminReportItem = {
  id: string;
  kind: ReportKind;
  reason: string;
  reasonLabel: string;
  status: ReportStatus;
  createdAt: string;
  reporter: { id: string | null; name: string };
  about: { id: string; name: string; firstName: string; photoUrl: string | null } | null;
  plan: { id: string; title: string } | null;
  chatId: string | null;
  messageId: string | null;
  /** The reported message's words (the queue's quote), or null. Removed messages show their words to the admin. */
  messageText: string | null;
  /** A photo report: the photo as it was reported (480px, signed). */
  photoUrl: string | null;
  actedAt: string | null;
  actionNote: string | null;
};

export type AdminReportQueue = {
  tab: "open" | "done";
  items: AdminReportItem[];
  stats: { open: number; oldestOpenHours: number | null; removedThisMonth: number; done: number };
};

type ReportRow = {
  id: string;
  kind: ReportKind;
  reason: string;
  status: ReportStatus;
  reporter_id: string | null;
  member_id: string | null;
  plan_id: string | null;
  chat_id: string | null;
  message_id: string | null;
  photo_id: string | null;
  acted_at: string | null;
  action_note: string | null;
  created_at: string;
};
const REPORT_COLUMNS = "id, kind, reason, status, reporter_id, member_id, plan_id, chat_id, message_id, photo_id, acted_at, action_note, created_at";

async function items(rows: ReportRow[]): Promise<AdminReportItem[]> {
  if (!rows.length) return [];
  const db = serviceDb();
  const memberIds = rows.flatMap((r) => [r.reporter_id, r.member_id]).filter((id): id is string => Boolean(id));
  const planIds = [...new Set(rows.map((r) => r.plan_id).filter((id): id is string => Boolean(id)))];
  const messageIds = rows.map((r) => r.message_id).filter((id): id is string => Boolean(id));
  const photoIds = rows.map((r) => r.photo_id).filter((id): id is string => Boolean(id));
  const [names, plans, msgs, photos, photoUrls] = await Promise.all([
    db.from("members").select("id, full_name").in("id", [...new Set(memberIds)]),
    planIds.length ? db.from("plans").select("id, title").in("id", planIds) : Promise.resolve({ data: [] }),
    messageIds.length ? db.from("messages").select("id, body").in("id", messageIds) : Promise.resolve({ data: [] }),
    photoIds.length ? db.from("member_photos").select("id, path").in("id", photoIds) : Promise.resolve({ data: [] }),
    currentPhotoUrls(memberIds, "thumb"),
  ]);
  const name = new Map((names.data ?? []).map((n: { id: string; full_name: string | null }) => [n.id, n.full_name?.trim() || "Member"]));
  const plan = new Map((plans.data ?? []).map((p: { id: string; title: string }) => [p.id, p.title]));
  const body = new Map((msgs.data ?? []).map((m: { id: string; body: string | null }) => [m.id, m.body]));
  const photoPath = new Map((photos.data ?? []).map((p: { id: string; path: string }) => [p.id, p.path]));
  const signed = new Map<string, string | null>();
  for (const [id, path] of photoPath) signed.set(id, await signedUrl(path));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    reason: r.reason,
    reasonLabel: reasonLabel(r.kind, r.reason),
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
    reporter: { id: r.reporter_id, name: (r.reporter_id && name.get(r.reporter_id)) || "A member" },
    about: r.member_id ? { id: r.member_id, name: name.get(r.member_id) ?? "Member", firstName: firstName(name.get(r.member_id)) || "Member", photoUrl: photoUrls.get(r.member_id) ?? null } : null,
    plan: r.plan_id ? { id: r.plan_id, title: plan.get(r.plan_id) ?? "" } : null,
    chatId: r.chat_id,
    messageId: r.message_id,
    messageText: r.message_id ? body.get(r.message_id) ?? null : null,
    photoUrl: r.photo_id ? signed.get(r.photo_id) ?? null : null,
    actedAt: r.acted_at ? new Date(r.acted_at).toISOString() : null,
    actionNote: r.action_note,
  }));
}

export async function adminReportQueue(tab: "open" | "done", now: Date = new Date()): Promise<AdminReportQueue> {
  const db = serviceDb();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const [list, open, oldest, removed, done] = await Promise.all([
    tab === "open"
      ? db.from("reports").select(REPORT_COLUMNS).eq("status", "open").order("created_at", { ascending: false }).limit(200)
      : db.from("reports").select(REPORT_COLUMNS).neq("status", "open").order("acted_at", { ascending: false }).limit(100),
    db.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("reports").select("created_at").eq("status", "open").order("created_at", { ascending: true }).limit(1),
    db.from("reports").select("id", { count: "exact", head: true }).in("status", ["message_removed", "plan_removed", "photo_removed"]).gte("acted_at", monthStart),
    db.from("reports").select("id", { count: "exact", head: true }).neq("status", "open"),
  ]);
  if (list.error) throw list.error;
  const oldestAt = oldest.data?.[0]?.created_at;
  return {
    tab,
    items: await items((list.data ?? []) as ReportRow[]),
    stats: {
      open: open.count ?? 0,
      oldestOpenHours: oldestAt ? Math.max(0, Math.floor((now.getTime() - new Date(oldestAt).getTime()) / 3600000)) : null,
      removedThisMonth: removed.count ?? 0,
      done: done.count ?? 0,
    },
  };
}

export type AdminReportDetail = AdminReportItem & {
  /** A message report: the reported message with up to two messages either side (the reported one marked). */
  context: { id: string; senderName: string; text: string; at: string; removed: boolean; reported: boolean }[] | null;
  /** Who it is about: other reports about them, and since when they are a member. */
  history: { otherReports: number; memberSince: string | null; status: string | null } | null;
};

export async function adminReportDetail(reportId: string): Promise<AdminReportDetail | null> {
  if (!isUuid(reportId)) return null;
  const db = serviceDb();
  const { data: row } = await db.from("reports").select(REPORT_COLUMNS).eq("id", reportId).maybeSingle<ReportRow>();
  if (!row) return null;
  const [item] = await items([row]);
  let context: AdminReportDetail["context"] = null;
  if (row.message_id && row.chat_id) {
    const { data: m } = await db.from("messages").select("created_at").eq("id", row.message_id).maybeSingle();
    if (m) {
      const [before, after] = await Promise.all([
        db.from("messages").select("id, sender_id, body, created_at, removed_at").eq("chat_id", row.chat_id).eq("kind", "text").lt("created_at", m.created_at).order("created_at", { ascending: false }).limit(2),
        db.from("messages").select("id, sender_id, body, created_at, removed_at").eq("chat_id", row.chat_id).eq("kind", "text").gte("created_at", m.created_at).order("created_at", { ascending: true }).limit(3),
      ]);
      const list = [...(before.data ?? []).reverse(), ...(after.data ?? [])] as { id: string; sender_id: string | null; body: string | null; created_at: string; removed_at: string | null }[];
      const { data: senders } = await db.from("members").select("id, full_name").in("id", [...new Set(list.map((x) => x.sender_id).filter(Boolean) as string[])]);
      const nameOf = new Map((senders ?? []).map((s: { id: string; full_name: string | null }) => [s.id, firstName(s.full_name) || "Member"]));
      context = list.map((x) => ({ id: x.id, senderName: (x.sender_id && nameOf.get(x.sender_id)) || "Member", text: x.body ?? "", at: new Date(x.created_at).toISOString(), removed: Boolean(x.removed_at), reported: x.id === row.message_id }));
    }
  }
  let history: AdminReportDetail["history"] = null;
  if (row.member_id) {
    const [{ count }, { data: member }] = await Promise.all([
      db.from("reports").select("id", { count: "exact", head: true }).eq("member_id", row.member_id).neq("id", row.id),
      db.from("members").select("created_at, membership_status").eq("id", row.member_id).maybeSingle(),
    ]);
    history = { otherReports: count ?? 0, memberSince: member?.created_at ? new Date(member.created_at).toISOString() : null, status: (member?.membership_status as string) ?? null };
  }
  return { ...item, context, history };
}

export type AdminReportResult = { ok: true } | { ok: false; error: string };

async function openReport(reportId: string): Promise<ReportRow | { error: string }> {
  if (!isUuid(reportId)) return { error: "That report couldn’t be found." };
  const { data } = await serviceDb().from("reports").select(REPORT_COLUMNS).eq("id", reportId).maybeSingle<ReportRow>();
  if (!data) return { error: "That report couldn’t be found." };
  if (data.status !== "open") return { error: "Someone dealt with this report already. Nothing changed." };
  return data;
}

async function close(adminId: string, reportId: string, status: ReportStatus, note: string | null): Promise<AdminReportResult> {
  const { data, error } = await serviceDb()
    .from("reports")
    .update({ status, acted_at: new Date().toISOString(), acted_by: adminId, action_note: note })
    .eq("id", reportId)
    .eq("status", "open")
    .select("id");
  if (error) return { ok: false, error: "We couldn’t save that. Try again in a moment." };
  if (!data?.length) return { ok: false, error: "Someone dealt with this report already. Nothing changed." };
  await audit(adminId, `report.${status}`, { type: "report", id: reportId }, { note });
  return { ok: true };
}

export async function adminDismissReport(adminId: string, reportId: string, note: string | null = null): Promise<AdminReportResult> {
  const row = await openReport(reportId);
  if ("error" in row) return { ok: false, error: row.error };
  return close(adminId, reportId, "dismissed", note);
}

/** "Remove message": "Message removed" for everyone in the chat, at once. */
export async function adminRemoveReportedMessage(adminId: string, reportId: string): Promise<AdminReportResult> {
  const row = await openReport(reportId);
  if ("error" in row) return { ok: false, error: row.error };
  if (!row.message_id) return { ok: false, error: "This report isn’t about a message." };
  const db = serviceDb();
  const at = new Date().toISOString();
  await db.from("messages").update({ removed_at: at, removed_by: adminId, removed_reason: "report" }).eq("id", row.message_id).is("removed_at", null);
  // Every open report on the same message is answered by the one removal.
  await db.from("reports").update({ status: "message_removed", acted_at: at, acted_by: adminId }).eq("message_id", row.message_id).eq("status", "open").neq("id", row.id);
  return close(adminId, reportId, "message_removed", null);
}

/** "Remove the plan": it leaves the feed, its chat closes, the people going get an Update (no email: no design for a club removal). */
export async function adminRemoveReportedPlan(adminId: string, reportId: string, reason: string | null = null): Promise<AdminReportResult> {
  const row = await openReport(reportId);
  if ("error" in row) return { ok: false, error: row.error };
  if (!row.plan_id) return { ok: false, error: "This report isn’t about a plan." };
  const removed = await adminRemovePlan(adminId, row.plan_id, reason);
  if (!removed.ok && removed.error !== "That plan was removed already.") return removed;
  await serviceDb().from("reports").update({ status: "plan_removed", acted_at: new Date().toISOString(), acted_by: adminId }).eq("plan_id", row.plan_id).eq("kind", "plan").eq("status", "open").neq("id", row.id);
  return close(adminId, reportId, "plan_removed", reason);
}

/** "Remove photo": the photo spec's removal, with the reason the member sees (and the photo-removed email). */
export async function adminRemoveReportedPhoto(adminId: string, reportId: string, reason: PhotoRemovedReason): Promise<AdminReportResult> {
  const row = await openReport(reportId);
  if ("error" in row) return { ok: false, error: row.error };
  const photoId = row.photo_id ?? (row.member_id ? await currentPhotoId(row.member_id) : null);
  if (!photoId) return { ok: false, error: "That member has no photo now. Nothing to remove." };
  const removed = await adminRemovePhoto(adminId, photoId, reason);
  if (!removed.ok && removed.error !== "That photo was removed already.") return removed;
  // adminRemovePhoto closes the open photo reports on that photo; close this one too if it was a member report.
  const { data } = await serviceDb().from("reports").select("status").eq("id", reportId).maybeSingle();
  if (data?.status === "open") return close(adminId, reportId, "photo_removed", reason);
  await audit(adminId, "report.photo_removed", { type: "report", id: reportId }, { reason });
  return { ok: true };
}

/** "Warn": recorded on the report and in the audit trail. No warning email exists yet (no design): nothing is sent. */
export async function adminWarnReported(adminId: string, reportId: string, note: string | null = null): Promise<AdminReportResult> {
  const row = await openReport(reportId);
  if ("error" in row) return { ok: false, error: row.error };
  return close(adminId, reportId, "warned", note);
}

/** "Suspend": pause the member's membership through stage 1's path (the gate; out of every chat and plan until resumed). */
export async function adminSuspendReported(adminId: string, reportId: string, options: { stripe: boolean }): Promise<AdminReportResult> {
  const row = await openReport(reportId);
  if ("error" in row) return { ok: false, error: row.error };
  if (!row.member_id) return { ok: false, error: "This report isn’t about a member." };
  const paused = await pauseMember(row.member_id, { stripe: options?.stripe !== false });
  await audit(adminId, "member.pause", { type: "member", id: row.member_id }, { from: "report", reportId, stripe_requested: options?.stripe !== false, ...paused });
  if (!paused.ok) return { ok: false, error: paused.error };
  return close(adminId, reportId, "suspended", null);
}

/** The count beside "Reports" in the admin nav. */
export async function openReportCount(): Promise<number> {
  const { count } = await serviceDb().from("reports").select("id", { count: "exact", head: true }).eq("status", "open");
  return count ?? 0;
}

