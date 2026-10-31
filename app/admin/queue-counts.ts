import "server-only";

// The four numbers the console shows on every page (r2b 12: "one count query per queue") and the dashboard's
// "Needs you today" (r2b 14): applications waiting, reports open, photos to check, with the oldest of each.
// Light count queries, not the queues themselves: the bar is drawn on every admin page.
//
// Photos to check is the Photos page's own number (lib/server/photos adminPhotoQueue stats.toCheck): every
// pending photo (new or changed, shown at once and waiting for a look), plus every approved photo with an open
// report about it (a photo report, or a member report for "Photo isn’t them or isn’t suitable").

import { cache } from "react";

import { createAdminSupabaseClient } from "./admin-client";
import { requireAdmin } from "./require-admin";

export type QueueCounts = {
  applications: number;
  reports: number;
  photos: number;
  /** When the oldest open report came in (ISO), or null. */
  oldestReportAt: string | null;
  /** When the oldest photo waiting was added (ISO), or null. */
  oldestPhotoAt: string | null;
};

const PHOTO_REPORTS = "kind.eq.photo,and(kind.eq.member,reason.eq.photo_not_them_or_unsuitable)";

// cache(): the bar and the dashboard both ask; one request reads once.
export const queueCounts = cache(async function queueCounts(): Promise<QueueCounts> {
  await requireAdmin();
  const db = createAdminSupabaseClient();
  const [apps, reports, oldestReport, pending, oldestPhoto, photoReports] = await Promise.all([
    db.from("applications").select("*", { count: "exact", head: true }).eq("status", "pending"),
    db.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("reports").select("created_at").eq("status", "open").order("created_at", { ascending: true }).limit(1),
    db.from("member_photos").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("member_photos").select("created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(1),
    db.from("reports").select("photo_id").eq("status", "open").or(PHOTO_REPORTS).not("photo_id", "is", null),
  ]);
  const reportedIds = [...new Set(((photoReports.data ?? []) as { photo_id: string }[]).map((r) => r.photo_id))];
  let reportedApproved = 0;
  if (reportedIds.length) {
    const { count } = await db.from("member_photos").select("id", { count: "exact", head: true }).in("id", reportedIds).eq("status", "approved");
    reportedApproved = count ?? 0;
  }
  return {
    applications: apps.count ?? 0,
    reports: reports.count ?? 0,
    photos: (pending.count ?? 0) + reportedApproved,
    oldestReportAt: (oldestReport.data?.[0]?.created_at as string | undefined) ?? null,
    oldestPhotoAt: (oldestPhoto.data?.[0]?.created_at as string | undefined) ?? null,
  };
});
