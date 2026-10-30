"use client";

// The photo card's two buttons (photo-admin-queue-1280): "Keep photo" (clears it from the list, changes nothing
// the member sees) and "Remove and ask for a new one" (the dialog with the reason the member sees, then the
// photo-removed email and the photo gate). A kept photo in Done can still be removed.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { adminKeepPhoto, adminRemovePhoto } from "@/app/admin/photos-actions";
import { BusyButton } from "@/components/admin/bits";
import { RemovePhotoDialog, type PhotoReason } from "@/components/admin/remove-photo-dialog";
import { ErrorLine } from "@/components/admin/ui";

type Result = { ok: true } | { ok: false; error: string };

export function PhotoActions({ photoId, first, canKeep, reasons, note }: { photoId: string; first: string; canKeep: boolean; reasons: PhotoReason[]; note: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busy, setBusy] = useState<null | "keep" | "remove">(null);
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(which: "keep" | "remove", call: () => Promise<Result>) {
    setError(null);
    setBusy(which);
    startTransition(async () => {
      let result: Result;
      try {
        result = await call();
      } catch {
        result = { ok: false, error: "We couldn’t save that. Try again in a moment." };
      }
      setBusy(null);
      setDialog(false);
      if (!result.ok) {
        setError(result.error);
        router.refresh();
        return;
      }
      const next = new URLSearchParams();
      const tab = params.get("tab");
      if (tab) next.set("tab", tab);
      next.set("done", which === "keep" ? "kept" : "removed");
      const target = `/admin/photos/${photoId}?${next.toString()}`;
      if (pathname === `/admin/photos/${photoId}`) router.replace(target, { scroll: false });
      else router.push(target, { scroll: false });
      router.refresh();
    });
  }

  return (
    <>
      <div className="ad-acts q">
        {canKeep && (
          <BusyButton type="button" busy={busy === "keep"} busyLabel="Keeping…" disabled={busy !== null} onClick={() => run("keep", () => adminKeepPhoto(photoId))}>
            Keep photo
          </BusyButton>
        )}
        <button type="button" className={canKeep ? "ad-btn secondary" : "ad-btn"} disabled={busy !== null} onClick={() => setDialog(true)}>
          Remove and ask for a new one
        </button>
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
      <p className="ad-qnote">{note}</p>
      <RemovePhotoDialog open={dialog} first={first} reasons={reasons} busy={busy === "remove"} onClose={() => setDialog(false)} onConfirm={(reason) => run("remove", () => adminRemovePhoto(photoId, reason))} />
    </>
  );
}
