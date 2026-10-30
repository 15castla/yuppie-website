"use server";

// The admin Photos queue (photo spec 3, r2b section 19): To check (reported photos first, then new and changed
// ones, oldest waiting first) and Done, with the four numbers; "Keep photo" and "Remove and ask for a new one"
// with one of the three reasons (the member sees it, and gets the photo-removed email). Each action checks the
// admin and writes an admin_audit row.

import { revalidatePath } from "next/cache";

import type { PhotoRemovedReason } from "@/lib/emails";
import {
  adminKeepPhoto as keep,
  adminPhotoQueue,
  adminRemovePhoto as remove,
  PHOTO_REMOVAL_LABELS,
  type AdminPhotoQueue,
  type AdminPhotoResult,
} from "@/lib/server/photos";
import { requireAdmin } from "./require-admin";

const fresh = () => {
  revalidatePath("/admin/photos");
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
};

export async function adminGetPhotos(tab: "check" | "done" = "check"): Promise<AdminPhotoQueue> {
  await requireAdmin();
  return adminPhotoQueue(tab === "done" ? "done" : "check");
}

/** The count beside Photos in the admin nav. */
export async function adminPhotosToCheck(): Promise<number> {
  await requireAdmin();
  return (await adminPhotoQueue("check")).stats.toCheck;
}

/** The Remove dialog's three reasons, as it lists them. */
export async function adminPhotoRemovalReasons(): Promise<{ id: PhotoRemovedReason; label: string }[]> {
  await requireAdmin();
  return (Object.entries(PHOTO_REMOVAL_LABELS) as [PhotoRemovedReason, string][]).map(([id, label]) => ({ id, label }));
}

async function act(run: (adminId: string) => Promise<AdminPhotoResult>): Promise<AdminPhotoResult> {
  const admin = await requireAdmin();
  try {
    const result = await run(admin.id);
    if (result.ok) fresh();
    return result;
  } catch (err) {
    console.error("admin photo action failed:", err);
    return { ok: false, error: "We couldn’t save that. Try again in a moment." };
  }
}

export async function adminKeepPhoto(photoId: string): Promise<AdminPhotoResult> {
  return act((id) => keep(id, photoId));
}

export async function adminRemovePhoto(photoId: string, reason: PhotoRemovedReason): Promise<AdminPhotoResult> {
  return act((id) => remove(id, photoId, reason));
}
