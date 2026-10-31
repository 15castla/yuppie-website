import "server-only";

// The Photos queue for the admin list and card (photo spec 3, photo-admin-*), read with the service role after
// requireAdmin(). The lists are the foundation's (lib/server/photos adminPhotoQueue: reported photos first, then
// new and changed ones, oldest waiting first; Done is the last 30 days). The card reads one photo directly, so a
// photo opened from Reports or an old link shows too: the photo (and its Before), the member, when, the automatic
// face check ("Use it anyway" when none was found), the open report about it, and what was done.

import { cache } from "react";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { requireAdmin } from "@/app/admin/require-admin";
import { firstNameOf, hoursStat, queueAgo, whenWords } from "@/components/admin/format";
import type { QueueStat } from "@/components/admin/queue";
import { reasonLabel } from "@/lib/server/report-reasons";
import { adminPhotoQueue, PHOTO_REMOVAL_LABELS, PHOTO_ROW_COLUMNS, signedUrls, type AdminPhotoItem, type FaceCheck, type PhotoRow } from "@/lib/server/photos";
import type { PhotoListRow, PhotoPill, PhotoTab } from "./photo-tabs";

/** The photo spec's promise: aim to clear the list within 24 hours. */
export const CHECK_WITHIN_HOURS = 24;

/** A photo report's reason in words (a photo report, or a member report about their photo). */
export function photoReportReason(id: string): string {
  const asPhoto = reasonLabel("photo", id);
  return asPhoto !== id ? asPhoto : reasonLabel("member", id);
}

export const FACE_WORDS: Record<FaceCheck, string> = { found: "face found", none: "no face found", skipped: "not checked" };

function checkRow(item: AdminPhotoItem, now: Date): PhotoListRow {
  const base = { photoId: item.photoId, name: item.member.firstName, photoUrl: item.photoUrl };
  if (item.pill === "reported" && item.report) {
    return { ...base, pill: { label: "Reported", kind: "ink" }, ago: queueAgo(item.report.at, now), line: `Reported by ${item.report.by}: ${photoReportReason(item.report.reason)}` };
  }
  const changed = item.pill === "changed";
  return { ...base, pill: { label: changed ? "Changed" : "New", kind: "plain" }, ago: queueAgo(item.uploadedAt, now), line: `${changed ? "Changed" : "New"} photo, ${FACE_WORDS[item.faceCheck]}` };
}

function doneRow(item: AdminPhotoItem, now: Date): PhotoListRow {
  const removed = item.status === "removed";
  const pill: PhotoPill = removed ? { label: "Removed", kind: "muted" } : { label: "Kept", kind: "plain" };
  const at = item.reviewedAt ?? item.uploadedAt;
  return {
    photoId: item.photoId,
    name: item.member.firstName,
    photoUrl: item.photoUrl,
    pill,
    ago: queueAgo(at, now),
    line: removed ? `Removed: ${item.removalReason ? PHOTO_REMOVAL_LABELS[item.removalReason] : "by the club"}` : `Kept, ${whenWords(at, now)}`,
  };
}

export type PhotoQueues = { check: PhotoListRow[]; done: PhotoListRow[]; counts: Record<PhotoTab, number>; stats: QueueStat[] };

export const photoQueues = cache(async function photoQueues(): Promise<PhotoQueues> {
  await requireAdmin();
  const now = new Date();
  const [check, done] = await Promise.all([adminPhotoQueue("check", now), adminPhotoQueue("done", now)]);
  const s = check.stats;
  return {
    check: check.items.map((i) => checkRow(i, now)),
    done: done.items.map((i) => doneRow(i, now)),
    counts: { check: s.toCheck, done: done.items.length },
    stats: [
      { label: "To check", value: String(s.toCheck) },
      { label: "Reported", value: String(s.reported) },
      { label: "Oldest waiting", value: hoursStat(s.oldestWaitingHours), late: s.oldestWaitingHours !== null && s.oldestWaitingHours >= CHECK_WITHIN_HOURS },
      { label: "Removed this month", value: String(s.removedThisMonth) },
    ],
  };
});

// ---------------------------------------------------------------------------- the card

export type PhotoCardData = {
  photo: PhotoRow;
  url: string | null;
  /** A changed photo's Before. */
  beforeUrl: string | null;
  member: { id: string; first: string; since: string; current: boolean; deleted: boolean };
  /** The newest open report about this photo. */
  report: { id: string; reason: string; by: string; at: string } | null;
  earlierReports: number;
};

const PHOTO_REPORTS = "kind.eq.photo,and(kind.eq.member,reason.eq.photo_not_them_or_unsuitable)";

export const photoCard = cache(async function photoCard(photoId: string): Promise<PhotoCardData | null> {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(photoId)) return null;
  const db = createAdminSupabaseClient();
  const { data: row } = await db.from("member_photos").select(PHOTO_ROW_COLUMNS).eq("id", photoId).maybeSingle<PhotoRow>();
  if (!row) return null;
  const [{ data: m }, { data: before }, { data: reports }] = await Promise.all([
    db.from("members").select("id, full_name, email, created_at, photo_id, deleted_at").eq("id", row.member_id).maybeSingle(),
    row.previous_photo_id ? db.from("member_photos").select("path").eq("id", row.previous_photo_id).maybeSingle() : Promise.resolve({ data: null }),
    db
      .from("reports")
      .select("id, reason, created_at, reporter:members!reports_reporter_id_fkey(full_name)")
      .eq("photo_id", photoId)
      .eq("status", "open")
      .or(PHOTO_REPORTS)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const open = ((reports ?? []) as unknown as { id: string; reason: string; created_at: string; reporter: { full_name: string | null } | null }[])[0] ?? null;
  const { count: earlier } = await db
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("member_id", row.member_id)
    .lt("created_at", open?.created_at ?? new Date().toISOString())
    .neq("id", open?.id ?? "00000000-0000-0000-0000-000000000000");
  const beforePath = row.source === "changed" ? ((before?.path as string | undefined) ?? null) : null;
  const urls = await signedUrls([row.path, ...(beforePath ? [beforePath] : [])]);
  return {
    photo: row,
    url: urls.get(row.path) ?? null,
    beforeUrl: beforePath ? urls.get(beforePath) ?? null : null,
    member: {
      id: row.member_id,
      first: m?.deleted_at ? "Former member" : firstNameOf(m?.full_name as string | null, m?.email as string | null),
      since: (m?.created_at as string | undefined) ?? row.created_at,
      current: m?.photo_id === row.id,
      deleted: Boolean(m?.deleted_at),
    },
    report: open ? { id: open.id, reason: open.reason, by: firstNameOf(open.reporter?.full_name) || "A member", at: open.created_at } : null,
    earlierReports: earlier ?? 0,
  };
});
