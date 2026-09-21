"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { uploadPerkLogo, removePerkLogo } from "@/app/admin/discounts-actions";

// Same pattern as app/admin/(protected)/events/EventPhotoForm.tsx: was a
// plain <form action={uploadPerkLogo}> with a required file input, so
// submitting with nothing chosen just got blocked by the browser. Now a
// client component so submit can branch: a chosen file still uploads via
// uploadPerkLogo same as before, but no file chosen (on a perk that
// already has a logo) offers to clear it back to the initial-letter
// default via removePerkLogo instead, reusing this same button.
export function PerkLogoForm({
  perkId,
  hasLogo,
}: {
  perkId: string;
  hasLogo: boolean;
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
      formData.set("id", perkId);
      formData.set("logo", file);

      startTransition(async () => {
        const result = await uploadPerkLogo(formData);
        if (!result.success) {
          setError(result.error ?? "Something went wrong.");
          return;
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
        router.refresh();
      });
      return;
    }

    // No file chosen and nothing to remove either — same no-op the
    // browser's own required-field block used to produce.
    if (!hasLogo) return;

    const confirmed = window.confirm(
      "Remove the current logo and revert to the initial?",
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await removePerkLogo(perkId);
      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-1 w-full">
      <input
        ref={fileInputRef}
        type="file"
        name="logo"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="w-full text-[10px] text-foreground/70 file:mr-1 file:rounded-full file:border-0 file:bg-foreground file:px-2 file:py-1 file:text-[10px] file:font-bold file:text-background"
      />
      <button
        type="submit"
        disabled={isPending}
        className="mt-1.5 w-full rounded-full bg-foreground px-3 py-1.5 text-[11px] font-bold text-background disabled:cursor-not-allowed disabled:opacity-60"
      >
        {hasLogo ? "Replace logo" : "Upload logo"}
      </button>
      {error && <p className="mt-1 text-[10px] text-red-700">{error}</p>}
    </form>
  );
}
