"use client";

// The photo flow's state, shared by the gate and the Change photo sheet:
// choose a file, check it, move and zoom, (preview,) save, saved or failed.
// Saving goes through the EXISTING server action (updateAvatar) with the
// cropped JPEG as a File; nothing here talks to storage. The checks and the
// crop run in the browser (lib/members/photo).
//
// The caller passes `upload` (updateAvatar, or a stub in the preview) and
// `review`: true shows the "Looking good?" step between the crop and the
// save (the gate); false saves straight from the crop (the sheet).

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import { START_CROP, exportCrop, type CropState } from "@/lib/members/photo/crop";
import { readPhoto, type PhotoErrorKind, type PhotoSource } from "@/lib/members/photo/validate";

export type FlowStep = "start" | "crop" | "preview" | "saving" | "failed" | "saved";

export type UploadResult = { success: boolean; error?: string; url?: string };

export type FlowInitial = {
  step?: FlowStep;
  source?: PhotoSource | null;
  crop?: CropState;
  error?: PhotoErrorKind | null;
  previewUrl?: string | null;
  savedUrl?: string | null;
};

export type PickKind = "camera" | "library";

export function usePhotoFlow({
  upload,
  review,
  initial,
  onSaved,
}: {
  upload: (formData: FormData) => Promise<UploadResult>;
  review: boolean;
  initial?: FlowInitial;
  /** The photo is saved. The sheet closes itself here; the gate shows its success screen. */
  onSaved?: (url: string | null) => void;
}) {
  const [step, setStep] = useState<FlowStep>(initial?.step ?? "start");
  const [source, setSource] = useState<PhotoSource | null>(initial?.source ?? null);
  const [crop, setCropState] = useState<CropState>(initial?.crop ?? START_CROP);
  const [error, setError] = useState<PhotoErrorKind | null>(initial?.error ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initial?.previewUrl ?? null);
  const [savedUrl, setSavedUrl] = useState<string | null>(initial?.savedUrl ?? null);
  const [busy, setBusy] = useState(false);

  const blob = useRef<Blob | null>(null);
  const urls = useRef(new Set<string>());
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const owned = urls.current;
    return () => {
      alive.current = false;
      owned.forEach((url) => URL.revokeObjectURL(url));
      owned.clear();
    };
  }, []);

  const release = useCallback((url: string | null | undefined) => {
    if (url && urls.current.has(url)) {
      URL.revokeObjectURL(url);
      urls.current.delete(url);
    }
  }, []);

  const choose = useCallback(
    async (file: File) => {
      setError(null);
      const result = await readPhoto(file);
      if (!alive.current) {
        if ("source" in result) URL.revokeObjectURL(result.source.url);
        return;
      }
      if ("error" in result) {
        // The member keeps their place: the screen they were on stays, with the error on it.
        setError(result.error);
        if (step !== "crop" && step !== "preview" && step !== "failed") setStep("start");
        return;
      }
      urls.current.add(result.source.url);
      setSource((previous) => {
        release(previous?.url);
        return result.source;
      });
      setPreviewUrl((previous) => {
        release(previous);
        return null;
      });
      blob.current = null;
      setCropState(START_CROP);
      setStep("crop");
    },
    [release, step],
  );

  const onInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) void choose(file);
    },
    [choose],
  );

  const inputProps = useCallback(
    (kind: PickKind) => ({
      ref: kind === "camera" ? cameraInput : libraryInput,
      type: "file" as const,
      accept: "image/*,.heic,.heif",
      // The camera hint: on a phone this opens the front camera. Without it the phone offers camera or library itself.
      ...(kind === "camera" ? { capture: "user" as const } : {}),
      hidden: true,
      tabIndex: -1,
      "aria-hidden": true as const,
      onChange: onInputChange,
    }),
    [onInputChange],
  );

  const pick = useCallback((kind: PickKind) => {
    (kind === "camera" ? cameraInput : libraryInput).current?.click();
  }, []);

  const setCrop = useCallback((next: CropState) => setCropState(next), []);

  const save = useCallback(
    async (file: Blob) => {
      setBusy(true);
      setStep("saving");
      setError(null);
      const formData = new FormData();
      formData.set("photo", new File([file], "photo.jpg", { type: "image/jpeg" }));
      let result: UploadResult;
      try {
        result = await upload(formData);
      } catch {
        result = { success: false };
      }
      if (!alive.current) return;
      setBusy(false);
      if (!result.success) {
        setError("upload");
        setStep("failed");
        return;
      }
      const url = result.url ?? null;
      setSavedUrl(url);
      setStep("saved");
      onSaved?.(url);
    },
    [onSaved, upload],
  );

  // Crop done: draw the circle's square into a JPEG. The gate shows it
  // ("Looking good?") before saving; the sheet saves it at once.
  const confirmCrop = useCallback(async () => {
    if (!source || busy) return;
    setBusy(true);
    const exported = await exportCrop(source.url, source, crop);
    if (!alive.current) return;
    setBusy(false);
    if (!exported) {
      setError("unreadable");
      setStep("crop");
      return;
    }
    blob.current = exported;
    if (review) {
      const url = URL.createObjectURL(exported);
      urls.current.add(url);
      setPreviewUrl((previous) => {
        release(previous);
        return url;
      });
      setStep("preview");
    } else {
      await save(exported);
    }
  }, [busy, crop, release, review, save, source]);

  const saveNow = useCallback(async () => {
    if (blob.current) await save(blob.current);
  }, [save]);

  const backToCrop = useCallback(() => {
    setError(null);
    setStep("crop");
  }, []);

  const startOver = useCallback(() => {
    setSource((previous) => {
      release(previous?.url);
      return null;
    });
    setPreviewUrl((previous) => {
      release(previous);
      return null;
    });
    blob.current = null;
    setCropState(START_CROP);
    setError(null);
    setStep("start");
  }, [release]);

  return {
    step,
    setStep,
    source,
    crop,
    setCrop,
    error,
    previewUrl,
    savedUrl,
    busy,
    inputProps,
    pick,
    choose,
    confirmCrop,
    saveNow,
    backToCrop,
    startOver,
  };
}
