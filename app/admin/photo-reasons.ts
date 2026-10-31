import "server-only";

// The Remove photo dialog's three reasons (photo spec 3) and what the member is told for each: the dialog's
// "Chloe will see" line is the approved one ("We removed your photo because it wasn’t a clear photo of you.
// Please add a new one."), built from the same clause the photo-removed email uses (lib/emails).

import type { PhotoReason } from "@/components/admin/remove-photo-dialog";
import { PHOTO_REMOVED_REASONS } from "@/lib/emails";
import { PHOTO_REMOVAL_LABELS, PHOTO_REMOVAL_REASONS } from "@/lib/server/photos";

export function photoReasons(): PhotoReason[] {
  return PHOTO_REMOVAL_REASONS.map((id) => ({
    id,
    label: PHOTO_REMOVAL_LABELS[id],
    willSee: `We removed your photo because ${PHOTO_REMOVED_REASONS[id]}. Please add a new one.`,
  }));
}
