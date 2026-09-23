"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { updateEventImage, removeEventImage } from "@/app/admin/events-actions";

// Was a plain <form action={updateEventImage}> with a required file input,
// so submitting with nothing chosen just got blocked by the browser. Now a
// client component so submit can branch: a chosen file still uploads via
// updateEventImage same as before, but no file chosen (on an event that
// already has one) offers to clear it back to the default placeholder via
// removeEventImage instead, reusing this same button rather than adding a
// second one.
export function EventPhotoForm({
  eventId,
  hasImage,
}: {
  eventId: string;
  hasImage: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const file = fileInputRef.current?.files?.[0];

    if (file) {
      const formData = new FormData();
      formData.set("event_id", eventId);
      formData.set("photo", file);

      startTransition(async () => {
        const result = await updateEventImage(formData);
        if (!result.success) {
          setError(result.error ?? "Something went wrong.");
          return;
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
        router.refresh();
      });
      return;
    }

    // No file chosen and nothing to remove either, so this is the same
    // no-op the browser's own required-field block used to produce.
    if (!hasImage) return;

    const confirmed = window.confirm(
      "Remove the current photo and revert to the default placeholder?",
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await removeEventImage(eventId);
      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2">
      <input
        ref={fileInputRef}
        type="file"
        name="photo"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="text-[10px] text-foreground/70 file:mr-2 file:rounded-full file:border-0 file:bg-foreground file:px-3 file:py-1.5 file:text-[10px] file:font-bold file:text-background"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-foreground px-4 py-2 text-xs font-bold text-background disabled:cursor-not-allowed disabled:opacity-60"
      >
        {hasImage ? "Replace photo" : "Upload photo"}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </form>
  );
}
