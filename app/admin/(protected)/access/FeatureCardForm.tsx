"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { setFeatureCard } from "@/app/admin/feature-card-actions";
import { DEFAULT_FEATURE_LABEL, type FeatureCard } from "@/components/members/feature-card-data";
import { cn } from "@/lib/utils";
import { inputClasses, Select } from "@/app/admin/form-controls";

type Option = { id: string; label: string };

// Was FeaturedEventForm.tsx, event-only. Generalized alongside
// setFeatureCard (app/admin/feature-card-actions.ts) to spotlight any one
// event, discount, or access perk. The <select>'s options are prefixed
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
  current: { contentType: FeatureCard["content_type"]; contentId: string; label: string | null } | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(current ? `${current.contentType}:${current.contentId}` : "");
  const [label, setLabel] = useState(current?.label ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const selectedType = selected.split(":")[0] as FeatureCard["content_type"] | "";
  const labelPlaceholder = selectedType ? DEFAULT_FEATURE_LABEL[selectedType] : "";

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
        <Select value={selected} onChange={(event) => setSelected(event.target.value)}>
          <option value="">None (hide the card)</option>
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
        </Select>
        <input
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          disabled={!selected}
          placeholder={labelPlaceholder}
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
        Card label (optional): leave blank to use the default label shown
        above for whichever type is selected.
      </p>
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
    </form>
  );
}
