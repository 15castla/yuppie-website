"use server";

// The member's photo (photo spec): save a new one (the gate and Change photo), and what the gate shows. A photo
// is private: it goes into the member-photos bucket and shows only through short-lived signed URLs.
//
// uploadMyPhoto takes the FormData the photo flow already sends ("photo": the cropped JPEG) plus, optionally,
// "face": "found" | "none" (the browser's FaceDetector where it exists; leave it out where it does not, and the
// check is recorded as skipped). The face check warns and never blocks (decision 1 A): "Use it anyway" sends
// "none" and the photo goes to the admin Photos queue marked "No face found". The answer keeps the shape the
// flow reads ({ success, error?, url? }) and adds `reason` (type | large | small | upload: the PHOTO_ERRORS key).

import { revalidatePath } from "next/cache";

import { getMember, memberForAction } from "@/app/members/require-member";
import { blockSets, eitherBlocked } from "@/lib/server/blocks";
import { isUuid } from "@/lib/server/plans";
import { personRef } from "@/lib/server/people";
import { photoGateState, uploadMemberPhoto, type PhotoGateState } from "@/lib/server/photos";
import { SESSION_ENDED, type SessionEnded } from "@/components/members/session-ended";
import { TRY_AGAIN } from "../action-kit";

export type UploadMyPhotoResult =
  | { success: true; url?: string; error?: undefined; photoId: string }
  | { success: false; error: string; url?: undefined; reason: "type" | "large" | "small" | "upload" }
  /** The session ended while the page was open: SESSION_ENDED, in the flow's own shape (isSessionEnded() reads it). */
  | ({ success: false; error: string; url?: undefined; reason: "session" } & SessionEnded);

export async function uploadMyPhoto(formData: FormData): Promise<UploadMyPhotoResult> {
  // allowMissingPhoto: this is how a member at the gate gets past it.
  const member = await memberForAction({ allowMissingPhoto: true });
  if (!member) return { ...SESSION_ENDED, success: false, error: "Your session ended. Log in again.", reason: "session" };
  try {
    const photo = formData.get("photo");
    const face = formData.get("face");
    const result = await uploadMemberPhoto(member.id, photo instanceof Blob ? photo : null, {
      faceCheck: face === "found" || face === "none" ? face : "skipped",
    });
    if (!result.success) return { success: false, error: result.error, reason: result.reason };
    revalidatePath("/members", "layout");
    return { success: true, url: result.url ?? undefined, photoId: result.photoId };
  } catch (err) {
    console.error(`uploadMyPhoto failed for member ${member.id}:`, err);
    return { success: false, error: TRY_AGAIN, reason: "upload" };
  }
}

/**
 * What the gate shows: hasPhoto (it lets them through), removed (the club removed the last one: the notice and
 * the reason the admin picked, as the photo-removed email words it), existing (a member from before the gate:
 * "Every member has one now, so people know who they’re meeting.").
 */
export async function getMyPhotoGate(): Promise<PhotoGateState | SessionEnded> {
  const member = await getMember();
  if (!member) return SESSION_ENDED;
  return photoGateState(member);
}

/**
 * A member's photo at full size (480px), for "tap a photo to see it bigger" (Albert, 8 Nov 2026). The pages carry
 * the small one (160px), which looks soft when enlarged. Null when the session ended, the id is not an id, either
 * of them blocked the other, or they have no current photo: the enlarged view then keeps the small one.
 */
export async function largeMemberPhoto(memberId: string): Promise<string | null> {
  const member = await memberForAction();
  if (!member || !isUuid(memberId)) return null;
  try {
    if (memberId !== member.id && eitherBlocked(await blockSets(member.id), memberId)) return null;
    // As the pages give out the small one (peopleRefs): a deleted account has no photo.
    return (await personRef(memberId, "full")).photoUrl;
  } catch (err) {
    console.error(`largeMemberPhoto failed for ${memberId}:`, err);
    return null;
  }
}
