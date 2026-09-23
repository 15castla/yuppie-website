"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { setFeaturedInviteOnlyEvent } from "@/app/admin/events-actions";

const inputClasses =
  "w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/40";

type EventOption = { id: string; title: string; is_invite_only_feature: boolean };

// Was a plain <form action={setFeaturedInviteOnlyEvent}> wrapped in a
// server-action shim that discarded the { success, error } result — any
// failure (e.g. the partial unique index on is_invite_only_feature
// rejecting the second update) was completely invisible. Client component
// now so a failed save actually shows something, same pattern as
// EventPhotoForm.tsx/PerkLogoForm.tsx.
export function FeaturedEventForm({
  events,
  featuredEventId,
}: {
  events: EventOption[];
  featuredEventId: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(featuredEventId);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("event_id", selected);

    startSaving(async () => {
      const result = await setFeaturedInviteOnlyEvent(formData);
      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className={inputClasses}
        >
          <option value="">None — hide the card</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isSaving}
          className="shrink-0 rounded-full bg-foreground px-5 py-2 text-sm font-bold text-background disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
    </form>
  );
}
