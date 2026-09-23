"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { setFeaturedInviteOnlyEvent } from "@/app/admin/events-actions";
import { cn } from "@/lib/utils";

const inputClasses =
  "w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/40";

type EventOption = {
  id: string;
  title: string;
  is_invite_only_feature: boolean;
  invite_only_label: string | null;
};

// Was a plain <form action={setFeaturedInviteOnlyEvent}> wrapped in a
// server-action shim that discarded the { success, error } result — any
// failure (e.g. the partial unique index on is_invite_only_feature
// rejecting the second update) was completely invisible. Client component
// now so a failed save actually shows something, same pattern as
// EventPhotoForm.tsx/PerkLogoForm.tsx.
export function FeaturedEventForm({
  events,
  featuredEventId,
  featuredEventLabel,
}: {
  events: EventOption[];
  featuredEventId: string;
  featuredEventLabel: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(featuredEventId);
  const [label, setLabel] = useState(featuredEventLabel);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  // The label field always reflects whichever event is currently selected
  // in the dropdown — switching events shows that event's own saved label
  // (or blank) rather than leaving behind whatever was typed for the
  // previously-selected one.
  function handleSelectChange(eventId: string) {
    setSelected(eventId);
    setLabel(events.find((event) => event.id === eventId)?.invite_only_label ?? "");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("event_id", selected);
    formData.set("invite_only_label", label);

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
          onChange={(event) => handleSelectChange(event.target.value)}
          className={inputClasses}
        >
          <option value="">None — hide the card</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          disabled={!selected}
          placeholder="INVITE ONLY"
          className={cn(inputClasses, "disabled:cursor-not-allowed disabled:opacity-60")}
        />
        <button
          type="submit"
          disabled={isSaving}
          className="shrink-0 rounded-full bg-foreground px-5 py-2 text-sm font-bold text-background disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="text-xs text-foreground/50">
        Card label (optional) — leave blank to show the default &quot;INVITE ONLY&quot; text.
      </p>
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
    </form>
  );
}
