"use client";

// "Remove Chloe’s photo?" (photo-admin-remove-1280): three reasons, and exactly what the member will see for the
// one picked (the photo-removed email and the photo gate use the same sentence). Used by the Photos queue and
// by a photo report in Reports. The reasons and the sentences come from the server (lib/server/photos and
// lib/emails), so this file holds no copy of them.

import { useState } from "react";

import { BusyButton } from "./bits";
import { Dialog } from "./dialog";

export type PhotoReason = { id: "not_clear" | "not_member" | "not_suitable"; label: string; willSee: string };

export function RemovePhotoDialog({
  open,
  first,
  reasons,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  first: string;
  reasons: PhotoReason[];
  busy: boolean;
  onConfirm: (reason: PhotoReason["id"]) => void;
  onClose: () => void;
}) {
  const [pick, setPick] = useState<PhotoReason["id"]>(reasons[0]?.id ?? "not_clear");
  const chosen = reasons.find((r) => r.id === pick) ?? reasons[0];
  return (
    <Dialog
      open={open}
      title={`Remove ${first}’s photo?`}
      onClose={onClose}
      busy={busy}
      testId="dialog-remove-photo"
      actions={
        <>
          <BusyButton type="button" busy={busy} busyLabel="Removing…" onClick={() => onConfirm(pick)}>
            Remove and ask for a new one
          </BusyButton>
          <button type="button" className="ad-btn secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <p className="ad-p">
        {first} is asked for a new one at once. Pick what we tell {first}.
      </p>
      <fieldset className="ad-rads">
        <legend>What we tell {first}</legend>
        {reasons.map((r) => (
          <label className="ad-rad" key={r.id}>
            <input type="radio" name="photo-reason" value={r.id} checked={pick === r.id} disabled={busy} onChange={() => setPick(r.id)} data-autofocus={pick === r.id ? "" : undefined} />
            <span className="rd" aria-hidden="true" />
            <span>{r.label}</span>
          </label>
        ))}
      </fieldset>
      {chosen && (
        <div className="ad-willsee" aria-live="polite">
          <b>{first} will see</b>
          <p>{chosen.willSee}</p>
        </div>
      )}
    </Dialog>
  );
}
