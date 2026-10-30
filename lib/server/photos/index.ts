import "server-only";

// Member photos (photo spec): every member has one, shown only to signed-in members through signed URLs.
//
// The current photo is members.photo_id: a member_photos row that is "pending" (new or changed: it shows at once
// and waits in the admin Photos queue) or "approved" (kept by an admin, or moved from the old public bucket).
// The photo gate is simply members.photo_id IS NULL (no photo yet, or the club removed it).
// Uploading a new photo marks the old one "replaced". An admin "Keep photo" approves it; "Remove and ask for a
// new one" marks it "removed" with the reason the member sees, clears members.photo_id (the gate meets them at
// their next screen) and emails them (through the dispatcher).

import { randomUUID } from "node:crypto";

import type { PhotoRemovedReason } from "@/lib/emails";
import { audit } from "../audit";
import { PHOTO_MAX_BYTES, PHOTO_MIN_UPLOAD_PX, photoGateSince } from "../config";
import { errorMessage, serviceDb } from "../db";
import { firstName as firstNameOf } from "../format";
import { notify } from "../notify";
import { detectType, dimensions, preparePhoto } from "./image";
import { deletePhotoFiles, forgetSigned, putPhotoFile, signedUrl, signedUrls } from "./storage";

export { signedUrl, signedUrls } from "./storage";

export const PHOTO_ROW_COLUMNS =
  "id, member_id, path, thumb_path, width, height, content_type, bytes, resized, source, face_check, status, previous_photo_id, legacy_url, reviewed_at, reviewed_by, removal_reason, removed_at, replaced_at, created_at";

export type PhotoStatus = "pending" | "approved" | "removed" | "replaced";
export type FaceCheck = "found" | "none" | "skipped";

export type PhotoRow = {
  id: string;
  member_id: string;
  path: string;
  thumb_path: string | null;
  width: number | null;
  height: number | null;
  content_type: string;
  bytes: number | null;
  resized: boolean;
  source: "new" | "changed" | "migrated";
  face_check: FaceCheck;
  status: PhotoStatus;
  previous_photo_id: string | null;
  legacy_url: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  removal_reason: PhotoRemovedReason | null;
  removed_at: string | null;
  replaced_at: string | null;
  created_at: string;
};

export type PhotoSize = "thumb" | "full";

const pathFor = (row: Pick<PhotoRow, "path" | "thumb_path">, size: PhotoSize) => (size === "thumb" ? row.thumb_path ?? row.path : row.path);

// ---------------------------------------------------------------------------- reading

/** The signed URL of each member's current photo (null: none, or it could not be signed). */
export async function currentPhotoUrls(memberIds: (string | null | undefined)[], size: PhotoSize = "thumb"): Promise<Map<string, string | null>> {
  const ids = [...new Set(memberIds.filter((id): id is string => Boolean(id)))];
  const out = new Map<string, string | null>(ids.map((id) => [id, null]));
  if (!ids.length) return out;
  const { data, error } = await serviceDb()
    .from("members")
    .select("id, photo:member_photos!members_photo_id_fkey(path, thumb_path, status)")
    .in("id", ids);
  if (error) {
    console.error("photos: reading current photos failed:", error);
    return out;
  }
  const paths = new Map<string, string>();
  for (const row of (data ?? []) as unknown as { id: string; photo: { path: string; thumb_path: string | null; status: PhotoStatus } | null }[]) {
    const photo = Array.isArray(row.photo) ? row.photo[0] : row.photo;
    if (photo && (photo.status === "pending" || photo.status === "approved")) paths.set(row.id, pathFor(photo, size));
  }
  const signed = await signedUrls([...paths.values()]);
  for (const [id, path] of paths) out.set(id, signed.get(path) ?? null);
  return out;
}

export async function currentPhotoUrl(memberId: string, size: PhotoSize = "thumb"): Promise<string | null> {
  return (await currentPhotoUrls([memberId], size)).get(memberId) ?? null;
}

async function photoRow(id: string): Promise<PhotoRow | null> {
  const { data } = await serviceDb().from("member_photos").select(PHOTO_ROW_COLUMNS).eq("id", id).maybeSingle<PhotoRow>();
  return data ?? null;
}

export type PhotoGateState = {
  /** The member has a current photo (approved or pending): the gate lets them through. */
  hasPhoto: boolean;
  /** The club removed their last photo: the gate's notice, with the reason the admin picked. */
  removed: { reason: PhotoRemovedReason; at: string } | null;
  /** A member from before the photo gate who has never had a photo: the gate's "Every member has one now" line. */
  existing: boolean;
};

/** What the photo gate shows (photo spec 1). The gate rule itself is `photo_id IS NULL` (require-member.ts). */
export async function photoGateState(member: { id: string; photo_id: string | null; created_at: string }): Promise<PhotoGateState> {
  if (member.photo_id) return { hasPhoto: true, removed: null, existing: false };
  const { data } = await serviceDb()
    .from("member_photos")
    .select("status, removal_reason, removed_at, created_at")
    .eq("member_id", member.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const last = data?.[0] as { status: PhotoStatus; removal_reason: PhotoRemovedReason | null; removed_at: string | null } | undefined;
  if (last?.status === "removed" && last.removal_reason) {
    return { hasPhoto: false, removed: { reason: last.removal_reason, at: last.removed_at ?? "" }, existing: false };
  }
  return { hasPhoto: false, removed: null, existing: !last && new Date(member.created_at).getTime() < photoGateSince().getTime() };
}

// ---------------------------------------------------------------------------- uploading

export type UploadPhotoReason = "type" | "large" | "small" | "upload";

export type UploadPhotoResult =
  | { success: true; url: string | null; photoId: string; resized: boolean }
  | { success: false; error: string; reason: UploadPhotoReason };

// The photo spec's own error lines (lib/members/photo/validate.ts PHOTO_ERRORS), in one sentence each.
const UPLOAD_ERRORS: Record<UploadPhotoReason, string> = {
  type: "That file isn’t a photo. Choose a JPG, PNG or HEIC.",
  large: "That file is too big. Choose one under 10 MB.",
  small: "Too small. Choose a photo at least 400 pixels wide.",
  upload: "Your photo didn’t upload. Check your connection and try again.",
};
const fail = (reason: UploadPhotoReason): UploadPhotoResult => ({ success: false, error: UPLOAD_ERRORS[reason], reason });

/**
 * Save a member's new photo: check it (type from its bytes, under 10 MB, big enough), make the 480px and 160px
 * squares (sharp) or keep it as sent, put the files in the private bucket, record it as pending (the admin
 * queue: "New" for a first photo, "Changed" for a later one, with the face check the browser ran), make it the
 * current photo and mark the old one replaced. The old file stays in the bucket (history: Before and Now).
 */
export async function uploadMemberPhoto(
  memberId: string,
  file: Blob | null | undefined,
  options: { faceCheck?: FaceCheck } = {},
): Promise<UploadPhotoResult> {
  if (!file || typeof (file as Blob).arrayBuffer !== "function" || file.size === 0) return fail("type");
  if (file.size > PHOTO_MAX_BYTES) return fail("large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectType(bytes);
  if (!type) return fail("type");
  const size = dimensions(bytes, type);
  if (!size) return fail("type");
  if (Math.min(size.width, size.height) < PHOTO_MIN_UPLOAD_PX) return fail("small");

  const db = serviceDb();
  const { data: member } = await db.from("members").select("id, photo_id").eq("id", memberId).maybeSingle<{ id: string; photo_id: string | null }>();
  if (!member) return fail("upload");
  const { count: earlier } = await db.from("member_photos").select("id", { count: "exact", head: true }).eq("member_id", memberId).neq("source", "migrated");
  const { count: migrated } = await db.from("member_photos").select("id", { count: "exact", head: true }).eq("member_id", memberId).eq("source", "migrated");

  const prepared = await preparePhoto(bytes, type, size);
  const id = randomUUID();
  const ext = prepared.full.contentType === "image/png" ? "png" : prepared.full.contentType === "image/webp" ? "webp" : "jpg";
  const path = `${memberId}/${id}-full.${ext}`;
  const thumbPath = prepared.thumb ? `${memberId}/${id}-thumb.jpg` : null;

  const put = await putPhotoFile(path, prepared.full.bytes, prepared.full.contentType);
  if (!put.ok) {
    console.error(`photos: upload for ${memberId} failed:`, put.error);
    return fail("upload");
  }
  if (prepared.thumb && thumbPath) {
    const putThumb = await putPhotoFile(thumbPath, prepared.thumb.bytes, prepared.thumb.contentType);
    if (!putThumb.ok) {
      console.error(`photos: thumb upload for ${memberId} failed:`, putThumb.error);
      await deletePhotoFiles([path]);
      return fail("upload");
    }
  }

  const source = (earlier ?? 0) + (migrated ?? 0) > 0 ? "changed" : "new";
  const { error: insertError } = await db.from("member_photos").insert({
    id,
    member_id: memberId,
    path,
    thumb_path: thumbPath,
    width: prepared.full.width,
    height: prepared.full.height,
    content_type: prepared.full.contentType,
    bytes: prepared.full.bytes.length,
    resized: prepared.resized,
    source,
    face_check: options.faceCheck ?? "skipped",
    status: "pending",
    previous_photo_id: member.photo_id,
  });
  if (insertError) {
    console.error(`photos: recording the photo for ${memberId} failed:`, insertError);
    await deletePhotoFiles([path, thumbPath]);
    return fail("upload");
  }
  const { error: memberError } = await db.from("members").update({ photo_id: id }).eq("id", memberId);
  if (memberError) {
    console.error(`photos: setting the current photo for ${memberId} failed:`, memberError);
    await db.from("member_photos").delete().eq("id", id);
    await deletePhotoFiles([path, thumbPath]);
    return fail("upload");
  }
  if (member.photo_id) {
    await db
      .from("member_photos")
      .update({ status: "replaced", replaced_at: new Date().toISOString() })
      .eq("id", member.photo_id)
      .in("status", ["pending", "approved"]);
  }
  return { success: true, url: await signedUrl(path), photoId: id, resized: prepared.resized };
}

// ---------------------------------------------------------------------------- the admin Photos queue

export const PHOTO_REMOVAL_REASONS: readonly PhotoRemovedReason[] = ["not_clear", "not_member", "not_suitable"];

/** The reasons as the Remove dialog lists them (photo spec 3). */
export const PHOTO_REMOVAL_LABELS: Record<PhotoRemovedReason, string> = {
  not_clear: "Not a clear photo of you",
  not_member: "Not a photo of the member",
  not_suitable: "Not suitable for the club",
};

export type AdminPhotoItem = {
  photoId: string;
  member: { id: string; name: string; firstName: string; email: string };
  /** 480px, signed. */
  photoUrl: string | null;
  /** A changed photo's Before (the photo it replaced), signed; null for a new one. */
  previousPhotoUrl: string | null;
  pill: "reported" | "new" | "changed";
  faceCheck: FaceCheck;
  uploadedAt: string;
  /** The open report that put it here (the newest), if any. */
  report: { id: string; reason: string; by: string; at: string } | null;
  status: PhotoStatus;
  removalReason: PhotoRemovedReason | null;
  reviewedAt: string | null;
};

export type AdminPhotoQueue = {
  tab: "check" | "done";
  items: AdminPhotoItem[];
  stats: { toCheck: number; reported: number; oldestWaitingHours: number | null; removedThisMonth: number };
};

type QueueRow = PhotoRow & {
  member: { id: string; full_name: string | null; email: string } | null;
  previous: { path: string } | null;
};

const PHOTO_REPORT_FILTER = "kind.eq.photo,and(kind.eq.member,reason.eq.photo_not_them_or_unsuitable)";

async function openPhotoReports(): Promise<Map<string, { id: string; reason: string; by: string; at: string; memberId: string }>> {
  const { data } = await serviceDb()
    .from("reports")
    .select("id, reason, created_at, member_id, photo_id, reporter:members!reports_reporter_id_fkey(full_name)")
    .eq("status", "open")
    .or(PHOTO_REPORT_FILTER)
    .order("created_at", { ascending: false });
  const byPhoto = new Map<string, { id: string; reason: string; by: string; at: string; memberId: string }>();
  for (const r of (data ?? []) as unknown as { id: string; reason: string; created_at: string; member_id: string; photo_id: string | null; reporter: { full_name: string | null } | null }[]) {
    if (!r.photo_id || byPhoto.has(r.photo_id)) continue;
    byPhoto.set(r.photo_id, { id: r.id, reason: r.reason, by: firstNameOf(r.reporter?.full_name) || "A member", at: r.created_at, memberId: r.member_id });
  }
  return byPhoto;
}

export async function adminPhotoQueue(tab: "check" | "done", now: Date = new Date()): Promise<AdminPhotoQueue> {
  const db = serviceDb();
  const select = `${PHOTO_ROW_COLUMNS}, member:members!member_photos_member_id_fkey(id, full_name, email), previous:member_photos!member_photos_previous_photo_id_fkey(path)`;
  const reports = await openPhotoReports();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const { data: pendingRows } = await db.from("member_photos").select(select).eq("status", "pending").order("created_at", { ascending: true }).limit(200);
  const pending = (pendingRows ?? []) as unknown as QueueRow[];
  const reportedIds = [...reports.keys()].filter((id) => !pending.some((p) => p.id === id));
  const { data: reportedRows } = reportedIds.length
    ? await db.from("member_photos").select(select).in("id", reportedIds).in("status", ["pending", "approved"])
    : { data: [] };
  const reported = (reportedRows ?? []) as unknown as QueueRow[];
  const { count: removedThisMonth } = await db.from("member_photos").select("id", { count: "exact", head: true }).eq("status", "removed").gte("removed_at", monthStart);

  let rows: QueueRow[];
  if (tab === "check") {
    const withReport = [...reported, ...pending.filter((p) => reports.has(p.id))].sort((a, b) => (reports.get(b.id)!.at > reports.get(a.id)!.at ? 1 : -1));
    rows = [...withReport, ...pending.filter((p) => !reports.has(p.id))];
  } else {
    const { data } = await db
      .from("member_photos")
      .select(select)
      .not("reviewed_at", "is", null)
      .gte("reviewed_at", new Date(now.getTime() - 30 * 86400000).toISOString())
      .order("reviewed_at", { ascending: false })
      .limit(50);
    rows = (data ?? []) as unknown as QueueRow[];
  }

  const urls = await signedUrls(rows.flatMap((r) => [r.path, r.previous?.path ?? null]));
  const items: AdminPhotoItem[] = rows.map((r) => {
    const report = reports.get(r.id) ?? null;
    return {
      photoId: r.id,
      member: { id: r.member_id, name: r.member?.full_name?.trim() || "Member", firstName: firstNameOf(r.member?.full_name) || "Member", email: r.member?.email ?? "" },
      photoUrl: urls.get(r.path) ?? null,
      previousPhotoUrl: r.source === "changed" && r.previous ? urls.get(r.previous.path) ?? null : null,
      pill: report && tab === "check" ? "reported" : r.source === "changed" ? "changed" : "new",
      faceCheck: r.face_check,
      uploadedAt: r.created_at,
      report: report ? { id: report.id, reason: report.reason, by: report.by, at: report.at } : null,
      status: r.status,
      removalReason: r.removal_reason,
      reviewedAt: r.reviewed_at,
    };
  });
  const oldest = pending[0]?.created_at;
  return {
    tab,
    items,
    stats: {
      toCheck: pending.length + reported.length,
      reported: reports.size,
      oldestWaitingHours: oldest ? Math.max(0, Math.floor((now.getTime() - new Date(oldest).getTime()) / 3600000)) : null,
      removedThisMonth: removedThisMonth ?? 0,
    },
  };
}

export type AdminPhotoResult = { ok: true } | { ok: false; error: string };

/** Close the open reports about a photo (photo reports, and member reports about their photo). Two plain updates: PostgREST takes no `or` on an update. */
async function closePhotoReports(photoId: string, fields: Record<string, string>): Promise<void> {
  const db = serviceDb();
  await db.from("reports").update(fields).eq("photo_id", photoId).eq("status", "open").eq("kind", "photo");
  await db.from("reports").update(fields).eq("photo_id", photoId).eq("status", "open").eq("kind", "member").eq("reason", "photo_not_them_or_unsuitable");
}

/** "Keep photo": approve it (a pending one), and close any open reports about it as dismissed. Changes nothing the member sees. */
export async function adminKeepPhoto(adminId: string, photoId: string): Promise<AdminPhotoResult> {
  const db = serviceDb();
  const row = await photoRow(photoId);
  if (!row) return { ok: false, error: "That photo couldn’t be found." };
  if (row.status === "removed" || row.status === "replaced") return { ok: false, error: row.status === "removed" ? "That photo was removed already." : "The member has changed that photo since. Check the new one." };
  const at = new Date().toISOString();
  const { error } = await db.from("member_photos").update({ status: "approved", reviewed_at: at, reviewed_by: adminId }).eq("id", photoId).in("status", ["pending", "approved"]);
  if (error) return { ok: false, error: "We couldn’t save that. Try again in a moment." };
  await closePhotoReports(photoId, { status: "dismissed", acted_at: at, acted_by: adminId, action_note: "photo kept" });
  await audit(adminId, "photo.keep", { type: "member_photo", id: photoId }, { memberId: row.member_id });
  return { ok: true };
}

/**
 * "Remove and ask for a new one": the photo comes off everywhere at once (members.photo_id cleared: the gate
 * meets the member at their next screen; no new page gets its URL), open reports about it are closed as
 * photo_removed, and the member gets the photo-removed email with the reason.
 */
export async function adminRemovePhoto(adminId: string, photoId: string, reason: PhotoRemovedReason): Promise<AdminPhotoResult> {
  if (!PHOTO_REMOVAL_REASONS.includes(reason)) return { ok: false, error: "Pick a reason the member will see." };
  const db = serviceDb();
  const row = await photoRow(photoId);
  if (!row) return { ok: false, error: "That photo couldn’t be found." };
  if (row.status === "removed") return { ok: false, error: "That photo was removed already." };
  const at = new Date().toISOString();
  const { data: updated, error } = await db
    .from("member_photos")
    .update({ status: "removed", removal_reason: reason, removed_at: at, reviewed_at: at, reviewed_by: adminId })
    .eq("id", photoId)
    .neq("status", "removed")
    .select("id");
  if (error || !updated?.length) return { ok: false, error: "We couldn’t save that. Try again in a moment." };
  await db.from("members").update({ photo_id: null }).eq("id", row.member_id).eq("photo_id", photoId);
  forgetSigned([row.path, row.thumb_path]);
  await closePhotoReports(photoId, { status: "photo_removed", acted_at: at, acted_by: adminId });
  await audit(adminId, "photo.remove", { type: "member_photo", id: photoId }, { memberId: row.member_id, reason });
  await notify({ type: "photo.removed", memberId: row.member_id, photoId, reason });
  return { ok: true };
}

/** Account deletion (Delete my account): every file and record of the member's photos goes. Never throws. */
export async function deleteMemberPhotos(memberId: string): Promise<void> {
  try {
    const db = serviceDb();
    const { data } = await db.from("member_photos").select("path, thumb_path").eq("member_id", memberId);
    await db.from("members").update({ photo_id: null }).eq("id", memberId);
    await deletePhotoFiles((data ?? []).flatMap((r: { path: string; thumb_path: string | null }) => [r.path, r.thumb_path]));
    await db.from("member_photos").delete().eq("member_id", memberId);
  } catch (err) {
    console.error(`photos: deleting the photos of ${memberId} failed:`, errorMessage(err));
  }
}
