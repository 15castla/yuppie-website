"use client";

// The photo gate: a full screen with no tab bar, shown straight after login
// until a photo is saved. Take or choose a photo, move and zoom, "Looking
// good?", save, "Your photo is on". Drawn from the approved design (specs/
// photo.md section 1); one DOM for the web phone, the app and the computer.
//
// REAL: choosing a file (the camera pre-prompt then the camera hint in the
// app, drag and drop on a computer), every check (not a photo, too big, too
// small, can't open it; the server checks again and its answer shows as the
// same error), the circle crop with a JPEG export, the soft face check (the
// browser's FaceDetector where it exists: "This doesn't look like a photo of
// you", Use it anyway), the save into the private bucket (uploadMyPhoto), the
// failed-upload retry that keeps the photo and the crop, the success screen,
// Log out, "We removed your last photo" with the reason the admin picked, and
// the line for existing members (`gate`, from photoGateState on the server).
// DRAWN, NOT WIRED: "The camera is off for Club Yuppie" (a web view cannot
// tell that the camera was refused). `demo` draws it, and every other state,
// in the preview only.

import "@/components/members/you/you.css";
import "./photo.css";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Icon } from "@/components/members/kit";
import { Wordmark } from "@/components/members/shell/wordmark";
import type { ShellMode } from "@/components/members/shell/types";
import type { CropState } from "@/lib/members/photo/crop";
import { hasAskedCamera, markCameraAsked } from "@/lib/members/photo/notice";
import type { PhotoErrorKind, PhotoSource } from "@/lib/members/photo/validate";
import { ROUTES } from "@/lib/members/routes";
import { cn } from "@/lib/utils";
import { GateFrame, NoteBox, PhotoError, PhotoRing, PrivacyNote, SavingBar, SizesCard, Tips } from "./photo-parts";
import { PhotoCropper } from "./photo-cropper";
import { usePhotoFlow, type UploadResult } from "./use-photo-flow";

export type GateScreen = "start" | "camera-ask" | "camera-off" | "crop" | "preview" | "saving" | "failed" | "noface" | "saved";

/** Why the club removed the last photo (the admin's reason; lib/emails PhotoRemovedReason). */
export type PhotoRemovedReason = "not_clear" | "not_member" | "not_suitable";

/** The removed notice's second line, per reason. The design draws "not_clear"; the other two follow its pattern. */
const REMOVED_LINES: Record<PhotoRemovedReason, string> = {
  not_clear: "It wasn’t a clear photo of you. Please add a new one.",
  not_member: "It wasn’t a photo of you. Please add a new one.",
  not_suitable: "It wasn’t suitable for the club. Please add a new one.",
};

/** What the server knows about this member at the gate (photoGateState). */
export type GateInfo = {
  /** The club removed their last photo, for this reason. */
  removed: PhotoRemovedReason | null;
  /** A member from before the photo gate who has never had a photo. */
  existing: boolean;
};

export type GateDemo = {
  screen?: GateScreen;
  error?: PhotoErrorKind;
  /** A photo is being dragged over the drop zone. */
  over?: boolean;
  source?: PhotoSource;
  crop?: CropState;
  previewUrl?: string;
  savedUrl?: string;
  notice?: "removed";
  reason?: PhotoRemovedReason;
  variant?: "existing";
};

function LogOut({ signOut }: { signOut: () => void | Promise<void> }) {
  return (
    <form action={signOut}>
      <Button variant="quiet" type="submit">
        Log out
      </Button>
    </form>
  );
}

export function PhotoGateView({
  mode,
  firstName,
  hasPhoto,
  continueHref,
  upload,
  signOut,
  gate,
  demo,
}: {
  mode: ShellMode;
  firstName: string;
  /** The member already has a photo: they should not be here. */
  hasPhoto: boolean;
  /** Where Continue goes: Open Invite, or Events while Open Invite is off. */
  continueHref: string;
  /** uploadMyPhoto (the private bucket, with the face check). */
  upload: (formData: FormData) => Promise<UploadResult>;
  signOut: () => void | Promise<void>;
  /** The removed notice and the existing-member line (the server's photoGateState). */
  gate?: GateInfo;
  demo?: GateDemo;
}) {
  const router = useRouter();
  const isApp = mode === "app";

  const flowStep = (["start", "crop", "preview", "noface", "saving", "failed", "saved"] as const).find((step) => step === demo?.screen);
  const flow = usePhotoFlow({
    upload,
    review: true,
    // The preview draws the warning as a state; it never looks for a face itself.
    ...(demo ? { faceCheck: null } : {}),
    initial: {
      step: flowStep,
      source: demo?.source,
      crop: demo?.crop,
      error: demo?.error ?? (demo?.screen === "failed" ? "upload" : null),
      previewUrl: demo?.previewUrl,
      savedUrl: demo?.savedUrl,
    },
  });
  // Screens the flow does not own: the camera pre-prompt (real, app only) and
  // the drawn-only "camera is off".
  const [aside, setAside] = useState<"camera-ask" | "camera-off" | null>(
    demo?.screen === "camera-ask" || demo?.screen === "camera-off" ? demo.screen : null,
  );
  const [over, setOver] = useState(Boolean(demo?.over));

  // Someone who already has a photo has nothing to do here. Decided once, on
  // arrival: saving a photo here revalidates this page, and the success screen
  // must not be redirected away from.
  const [startedWithPhoto] = useState(hasPhoto);
  useEffect(() => {
    if (startedWithPhoto) router.replace(continueHref);
  }, [startedWithPhoto, router, continueHref]);

  if (startedWithPhoto) {
    return <main className="mk-main" aria-busy="true" />;
  }

  const screen: GateScreen = aside ?? flow.step;
  const inputs = (
    <>
      <input {...flow.inputProps("library")} />
      {isApp ? <input {...flow.inputProps("camera")} /> : null}
    </>
  );

  const bar = (
    <div className="yu-gate-bar">
      <div className="mk-wrap">
        <div className="yu-in">
          <Wordmark href={ROUTES.photo} />
          <LogOut signOut={signOut} />
        </div>
      </div>
    </div>
  );
  const topLink = isApp ? (
    <div className="ph-toplink">
      <LogOut signOut={signOut} />
    </div>
  ) : null;
  const chrome = { bar, topLink };

  function takePhoto() {
    if (isApp && !hasAskedCamera()) {
      setAside("camera-ask");
      return;
    }
    flow.pick(isApp ? "camera" : "library");
  }

  const chooseAnother = (
    <Button variant="outline" block onClick={() => flow.pick("library")}>
      Choose another
    </Button>
  );

  // ------------------------------------------------------------ the camera
  if (screen === "camera-ask") {
    return (
      <>
        {inputs}
        <GateFrame
          {...chrome}
          topLink={null}
          h1="We need the camera to take your photo."
          small
          subSerif={false}
          sub="Your phone will ask you to allow it. We only use the camera when you take your photo."
          stage={
            <div className="ph-ringwrap">
              <PhotoRing glyph="camera" cam={false} />
            </div>
          }
          acts={
            <>
              <Button
                block
                onClick={() => {
                  markCameraAsked();
                  setAside(null);
                  flow.pick("camera");
                }}
              >
                Continue
              </Button>
              <Button
                variant="outline"
                block
                onClick={() => {
                  setAside(null);
                  flow.pick("library");
                }}
              >
                Choose from library instead
              </Button>
            </>
          }
        />
      </>
    );
  }

  // Drawn only: a web view cannot tell that the camera was refused.
  if (screen === "camera-off") {
    return (
      <>
        {inputs}
        <GateFrame
          {...chrome}
          topLink={null}
          h1="The camera is off for Club Yuppie."
          small
          subSerif={false}
          sub="Turn it on in Settings to take a photo, or choose one from your library."
          stage={
            <div className="ph-ringwrap">
              <PhotoRing glyph="camera-off" cam={false} />
            </div>
          }
          acts={
            <>
              <Button block icon={<Icon name="external" size={18} />}>
                Open Settings
              </Button>
              <Button variant="outline" block onClick={() => flow.pick("library")}>
                Choose from library
              </Button>
            </>
          }
        />
      </>
    );
  }

  // ------------------------------------------------------------ crop
  if (screen === "crop" && flow.source) {
    return (
      <>
        {inputs}
        <GateFrame
          {...chrome}
          topLink={null}
          h1={
            <>
              Move and<br className="ph-br" /> zoom.
            </>
          }
          small
          sub="Fit your face in the circle."
          stage={<PhotoCropper source={flow.source} crop={flow.crop} onChange={flow.setCrop} />}
          req={false}
          pair
          acts={
            <>
              <Button block pending={flow.busy} onClick={() => void flow.confirmCrop()}>
                Next
              </Button>
              {chooseAnother}
            </>
          }
        />
      </>
    );
  }

  // ------------------------------------------------------------ preview, saving, failed, no face
  if (screen === "preview" || screen === "saving" || screen === "failed" || screen === "noface") {
    const heading = (
      <>
        Looking<br className="ph-br" /> good?
      </>
    );
    const sizes = <SizesCard photoUrl={flow.previewUrl} name={firstName} />;

    if (screen === "noface") {
      // The browser found no face in the crop. It warns and never blocks: Use it anyway saves it for the admin queue.
      return (
        <>
          {inputs}
          <GateFrame
            {...chrome}
            topLink={null}
            h1={heading}
            small
            sub="This is how members see you."
            stage={sizes}
            wordsExtra={
              <div className="ph-below">
                <NoteBox title="This doesn’t look like a photo of you." text="We can’t see a face in it. Other members need to recognise you." />
              </div>
            }
            req={false}
            pair
            acts={
              <>
                <Button block onClick={() => flow.pick("library")}>
                  Choose another
                </Button>
                <Button variant="outline" block onClick={() => void flow.saveAnyway()}>
                  Use it anyway
                </Button>
              </>
            }
          />
        </>
      );
    }

    if (screen === "saving") {
      return (
        <>
          {inputs}
          <GateFrame
            {...chrome}
            topLink={null}
            h1={heading}
            small
            sub="This is how members see you."
            stage={
              <>
                {sizes}
                <SavingBar />
              </>
            }
            req={false}
            pair
            acts={
              <>
                <Button block pending>
                  Saving…
                </Button>
                {/* The upload is one server action that cannot be called back, so Cancel would only look like it worked. */}
                <Button variant="outline" block disabled>
                  Cancel
                </Button>
              </>
            }
          />
        </>
      );
    }

    if (screen === "failed") {
      // A failed upload keeps the photo and the crop (Try again). A photo the server turned down for a rule
      // (type, size, width) cannot be tried again: Choose another is the way on.
      const kind = flow.error ?? "upload";
      return (
        <>
          {inputs}
          <GateFrame
            {...chrome}
            topLink={null}
            h1={heading}
            small
            sub="This is how members see you."
            stage={
              <>
                {sizes}
                <PhotoError kind={kind} />
              </>
            }
            req={false}
            pair={kind === "upload"}
            acts={
              kind === "upload" ? (
                <>
                  <Button block onClick={() => void flow.saveNow()}>
                    Try again
                  </Button>
                  {chooseAnother}
                </>
              ) : (
                <Button block onClick={() => flow.pick("library")}>
                  Choose another
                </Button>
              )
            }
          />
        </>
      );
    }

    return (
      <>
        {inputs}
        <GateFrame
          {...chrome}
          topLink={null}
          h1={heading}
          small
          sub="This is how members see you."
          stage={sizes}
          req={false}
          pair
          acts={
            <>
              <Button block onClick={() => void flow.saveNow()}>
                Save photo
              </Button>
              <Button variant="outline" block onClick={flow.backToCrop}>
                Back
              </Button>
            </>
          }
        />
      </>
    );
  }

  // ------------------------------------------------------------ saved
  if (screen === "saved") {
    return (
      <>
        {inputs}
        <GateFrame
          {...chrome}
          topLink={null}
          h1={
            <>
              Looking<br className="ph-br" /> good{firstName ? `, ${firstName}` : ""}.
            </>
          }
          small
          sub="Your photo is on."
          stage={
            <div className="ph-ringwrap">
              <span className="ph-done">
                <PhotoRing solid cam={false} photoUrl={flow.savedUrl ?? flow.previewUrl} letter={firstName} />
                <span className="ph-tick" aria-hidden="true">
                  <Icon name="check" size={26} />
                </span>
              </span>
            </div>
          }
          wordsExtra={<p className="ph-after">You can change it any time from You.</p>}
          req={false}
          acts={
            <Button block href={continueHref}>
              Continue
            </Button>
          }
        />
      </>
    );
  }

  // ------------------------------------------------------------ start
  const removedReason: PhotoRemovedReason | null = demo ? (demo.notice === "removed" ? (demo.reason ?? "not_clear") : null) : (gate?.removed ?? null);
  const removed = removedReason !== null;
  const existing = demo ? demo.variant === "existing" : Boolean(gate?.existing);
  const error = flow.error ? <PhotoError kind={flow.error} /> : null;
  const below = (
    <div className="ph-below">
      {error || removed ? null : <Tips />}
      <PrivacyNote />
    </div>
  );
  const ring = (
    <button
      type="button"
      className="ph-ring-btn"
      aria-label={isApp ? "Take a photo" : "Choose a photo"}
      onClick={takePhoto}
    >
      <PhotoRing letter={firstName} />
    </button>
  );
  const dropZone = (
    <div
      className={cn("ph-drop", over && "is-over")}
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
      <PhotoRing letter={firstName} over={over} />
      {over ? (
        <>
          <h2 className="mk-h2">Drop it here</h2>
          <p className="mk-meta-line">Let go to add your photo.</p>
        </>
      ) : (
        <>
          <h2 className="mk-h2">Drag a photo here</h2>
          <p className="mk-meta-line">JPG, PNG or HEIC, up to 10 MB</p>
          <span className="ph-or">or</span>
          <Button icon={<Icon name="upload" size={20} />} onClick={() => flow.pick("library")}>
            Choose a photo
          </Button>
        </>
      )}
      {error}
    </div>
  );

  const stage = isApp ? (
    <>
      <div className="ph-ringwrap">{ring}</div>
      {error}
    </>
  ) : (
    <>
      <div className="ph-ringwrap mk-show-phone">{ring}</div>
      <div className="mk-show-phone">{error}</div>
      <div className="mk-show-desk">{dropZone}</div>
    </>
  );

  const acts = isApp ? (
    <>
      <Button block icon={<Icon name="camera" size={20} />} onClick={takePhoto}>
        Take a photo
      </Button>
      <Button variant="outline" block icon={<Icon name="image" size={20} />} onClick={() => flow.pick("library")}>
        Choose from library
      </Button>
    </>
  ) : (
    <Button block icon={<Icon name="upload" size={20} />} onClick={() => flow.pick("library")}>
      Choose a photo
    </Button>
  );

  return (
    <>
      {inputs}
      <GateFrame
        {...chrome}
        h1={
          <>
            Add your<br className="ph-br" /> photo.
          </>
        }
        sub={existing ? "Every member has one now, so people know who they’re meeting." : "So people know who they’re meeting."}
        wordsExtra={
          <>
            {removedReason ? <NoteBox top title="We removed your last photo." text={REMOVED_LINES[removedReason]} /> : null}
            {below}
          </>
        }
        stage={stage}
        acts={acts}
        // On a computer the web gate's drop zone is the button; the app on an iPad has no zone, so its buttons sit under the words.
        actsDesk={isApp ? acts : null}
        removed={removed}
      />
    </>
  );
}
