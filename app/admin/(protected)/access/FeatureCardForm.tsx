"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { setFeatureCard } from "@/app/admin/feature-card-actions";
import { cn } from "@/lib/utils";

const inputClasses =
  "w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/40";

type Option = { id: string; label: string };

// Was FeaturedEventForm.tsx, event-only. Generalized alongside
// setFeatureCard (app/admin/feature-card-actions.ts) to spotlight any one
// event, discount, or access perk — the <select>'s options are prefixed
// with their content type (event:<id>, discount:<id>, access:<id>) so one
// flat string value can be split back into content_type/content_id on
// submit, grouped into three <optgroup>s so the three kinds of content
// stay visually distinct in one dropdown.
export function FeatureCardForm({
  events,
  discounts,
  access,
  current,
}: {
  events: Option[];
  discounts: Option[];
  access: Option[];
  current: { contentType: "event" | "discount" | "access"; contentId: string; label: string | null } | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(current ? `${current.contentType}:${current.contentId}` : "");
  const [label, setLabel] = useState(current?.label ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const [contentType, contentId] = selected.split(":");

    const formData = new FormData();
    formData.set("content_type", contentType ?? "");
    formData.set("content_id", contentId ?? "");
    formData.set("label", label);

    startSaving(async () => {
      const result = await setFeatureCard(formData);
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
          {events.length > 0 && (
            <optgroup label="Events">
              {events.map((event) => (
                <option key={event.id} value={`event:${event.id}`}>
                  {event.label}
                </option>
              ))}
            </optgroup>
          )}
          {discounts.length > 0 && (
            <optgroup label="Discounts">
              {discounts.map((discount) => (
                <option key={discount.id} value={`discount:${discount.id}`}>
                  {discount.label}
                </option>
              ))}
            </optgroup>
          )}
          {access.length > 0 && (
            <optgroup label="Access">
              {access.map((perk) => (
                <option key={perk.id} value={`access:${perk.id}`}>
                  {perk.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <input
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          disabled={!selected}
          placeholder="FEATURED"
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
        Card label (optional) — leave blank to show the default &quot;FEATURED&quot; text.
      </p>
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
    </form>
  );
}
