"use client";

// Change photo: the gate's flow as a sheet over You (a centred modal on a
// computer). Choose a photo, move and zoom, "Use this photo". There is no
// preview step and no Remove: a member always has a photo. Saving uses the
// existing updateAvatar action; when it is saved the sheet closes, the new
// photo shows at once, and You says "Photo changed" (a note handed over in
// sessionStorage, see lib/members/photo/notice.ts).
//
// The page at /members/you/photo renders You with this open, so the address
// works on its own and the back button closes it. needs_device_check: the
// sheet and scrim on a real phone, the camera hint in the app.

import "@/components/members/you/you.css";
import "./photo.css";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Icon } from "@/components/members/kit";
import { Dialog } from "@/components/members/you/dialog";
import type { ShellMode } from "@/components/members/shell/types";
import type { CropState } from "@/lib/members/photo/crop";
import { markPhotoChanged } from "@/lib/members/photo/notice";
import type { PhotoErrorKind, PhotoSource } from "@/lib/members/photo/validate";
import { ROUTES } from "@/lib/members/routes";
import { cn } from "@/lib/utils";
import { PhotoCropper } from "./photo-cropper";
import { PhotoError, PhotoRing } from "./photo-parts";
import { usePhotoFlow, type UploadResult } from "./use-photo-flow";

export type SheetDemo = {
  step?: "start" | "crop" | "saving" | "failed";
  error?: PhotoErrorKind;
  source?: PhotoSource;
  crop?: CropState;
  over?: boolean;
};

export function ChangePhotoSheet({
  mode,
  upload,
  firstName,
  demo,
}: {
  mode: ShellMode;
  /** updateAvatar. */
  upload: (formData: FormData) => Promise<UploadResult>;
  firstName?: string | null;
  /** The preview harness only: draw a state on the first render, and close in place instead of going back to You. */
  demo?: SheetDemo;
}) {
  const router = useRouter();
  const isApp = mode === "app";
  const [open, setOpen] = useState(true);
  const [over, setOver] = useState(Boolean(demo?.over));

  function close() {
    setOpen(false);
    if (!demo) router.replace(ROUTES.you);
  }

  const flow = usePhotoFlow({
    upload,
    review: false,
    initial: {
      step: demo?.step,
      source: demo?.source,
      crop: demo?.crop,
      error: demo?.error ?? (demo?.step === "failed" ? "upload" : null),
    },
    onSaved: () => {
      setOpen(false);
      if (demo) return;
      markPhotoChanged();
      router.replace(ROUTES.you);
    },
  });

  const inputs = (
    <>
      <input {...flow.inputProps("library")} />
      {isApp ? <input {...flow.inputProps("camera")} /> : null}
    </>
  );
  const error = flow.error && flow.step !== "failed" ? <PhotoError kind={flow.error} /> : null;
  const cancel = (
    <Button variant="outline" onClick={close}>
      Cancel
    </Button>
  );

  const cropping = flow.step === "crop" || flow.step === "saving" || flow.step === "failed";

  return (
    <Dialog open={open} onClose={close} labelledBy="ph-sheet-title" wide>
      {inputs}
      {cropping && flow.source ? (
        <>
          <h2 className="mk-h2" id="ph-sheet-title">
            Move and zoom
          </h2>
          <p className="yu-p">Fit your face in the circle.</p>
          <PhotoCropper source={flow.source} crop={flow.crop} onChange={flow.setCrop} hint={false} />
          {flow.step === "failed" ? <PhotoError kind="upload" /> : null}
          <div className="yu-acts ph-sheet-acts">
            {flow.step === "saving" ? (
              <>
                <Button pending>Saving…</Button>
                {/* The upload is one server action that cannot be called back, so Cancel would only look like it worked. */}
                <Button variant="outline" disabled>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button pending={flow.busy} onClick={() => void flow.confirmCrop()}>
                  {flow.step === "failed" ? "Try again" : "Use this photo"}
                </Button>
                {cancel}
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <h2 className="mk-h2" id="ph-sheet-title">
            Change photo
          </h2>
          <p className="yu-p">Your new photo shows straight away.</p>
          {error}
          {isApp ? (
            <div className="ph-opts">
              <button type="button" className="ph-opt" onClick={() => flow.pick("camera")}>
                <Icon name="camera" size={22} />
                <span>Take a photo</span>
                <Icon name="chevron-right" size={20} />
              </button>
              <button type="button" className="ph-opt" onClick={() => flow.pick("library")}>
                <Icon name="image" size={22} />
                <span>Choose from library</span>
                <Icon name="chevron-right" size={20} />
              </button>
            </div>
          ) : (
            <>
              <div className="ph-opts-web mk-show-phone">
                <Button block icon={<Icon name="upload" size={20} />} onClick={() => flow.pick("library")}>
                  Choose a photo
                </Button>
              </div>
              <div
                className={cn("ph-drop ph-drop-sm mk-show-desk", over && "is-over")}
                data-needs-device-check="true"
                onDragEnter={(event) => {
                  event.preventDefault();
                  setOver(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOver(true);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setOver(false);
                  const file = event.dataTransfer.files?.[0];
                  if (file) void flow.choose(file);
                }}
              >
                <PhotoRing size={120} letter={firstName} over={over} />
                <h3 className="mk-h3">Drag a photo here</h3>
                <p className="mk-meta-line">JPG, PNG or HEIC, up to 10 MB</p>
                <Button size="sm" icon={<Icon name="upload" size={20} />} onClick={() => flow.pick("library")}>
                  Choose a photo
                </Button>
              </div>
            </>
          )}
          <div className="yu-acts" style={{ marginTop: 12 }}>
            {cancel}
          </div>
        </>
      )}
    </Dialog>
  );
}
