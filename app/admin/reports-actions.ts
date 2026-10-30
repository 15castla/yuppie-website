"use server";

// The admin Reports queue (msg-admin-moderation-1280, r2b section 19): the list (Open | Done) with its four
// numbers, one report's detail (the reported thing, the message in its context, the member's history), and the
// actions. Each action checks the admin (aal2) and writes an admin_audit row; a report someone else already
// dealt with answers a plain sentence and changes nothing.
//   Dismiss                       the report closes, nothing else changes
//   Remove message                "Message removed" for everyone in the chat
//   Remove plan                   it leaves the feed, its chat closes, the people going get an Update
//   Remove photo (reason)         the photo spec's removal: off everywhere, the gate, the photo-removed email
//   Warn                          recorded only (no warning email is designed yet)
//   Suspend ({ stripe })          pause the membership through stage 1's path (the member's gate)

import { revalidatePath } from "next/cache";

import type { PhotoRemovedReason } from "@/lib/emails";
import {
  adminDismissReport as dismiss,
  adminRemoveReportedMessage as removeMessage,
  adminRemoveReportedPhoto as removePhoto,
  adminRemoveReportedPlan as removePlan,
  adminReportDetail,
  adminReportQueue,
  adminSuspendReported as suspend,
  adminWarnReported as warn,
  openReportCount,
  type AdminReportDetail,
  type AdminReportQueue,
  type AdminReportResult,
} from "@/lib/server/reports";
import { requireAdmin } from "./require-admin";

const fresh = () => {
  revalidatePath("/admin/reports");
  revalidatePath("/admin/photos");
  revalidatePath("/admin");
};

async function admin(): Promise<string> {
  return (await requireAdmin()).id;
}

export async function adminGetReports(tab: "open" | "done" = "open"): Promise<AdminReportQueue> {
  await admin();
  return adminReportQueue(tab === "done" ? "done" : "open");
}

export async function adminGetReport(reportId: string): Promise<AdminReportDetail | null> {
  await admin();
  return adminReportDetail(reportId);
}

/** The count beside Reports in the admin nav (r2b section 12). */
export async function adminOpenReportCount(): Promise<number> {
  await admin();
  return openReportCount();
}

async function act(run: (adminId: string) => Promise<AdminReportResult>): Promise<AdminReportResult> {
  const id = await admin();
  try {
    const result = await run(id);
    if (result.ok) fresh();
    return result;
  } catch (err) {
    console.error("admin report action failed:", err);
    return { ok: false, error: "We couldn’t save that. Try again in a moment." };
  }
}

export async function adminDismissReport(reportId: string, note?: string | null): Promise<AdminReportResult> {
  return act((id) => dismiss(id, reportId, note ?? null));
}

export async function adminRemoveReportedMessage(reportId: string): Promise<AdminReportResult> {
  return act((id) => removeMessage(id, reportId));
}

export async function adminRemoveReportedPlan(reportId: string, reason?: string | null): Promise<AdminReportResult> {
  return act((id) => removePlan(id, reportId, reason ?? null));
}

export async function adminRemoveReportedPhoto(reportId: string, reason: PhotoRemovedReason): Promise<AdminReportResult> {
  return act((id) => removePhoto(id, reportId, reason));
}

export async function adminWarnReportedMember(reportId: string, note?: string | null): Promise<AdminReportResult> {
  return act((id) => warn(id, reportId, note ?? null));
}

export async function adminSuspendReportedMember(reportId: string, options: { stripe: boolean }): Promise<AdminReportResult> {
  return act((id) => suspend(id, reportId, { stripe: options?.stripe !== false }));
}
