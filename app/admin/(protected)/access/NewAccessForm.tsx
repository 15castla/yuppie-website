"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createPerk } from "@/app/admin/discounts-actions";
import { ACCESS_KIND_LABEL, PerkPreview, inputClasses, labelClasses } from "@/app/admin/perk-shared";
import { Select } from "@/app/admin/form-controls";
import type { PartnerPerk } from "@/components/members/mock-perks";

type FormState = {
  name: string;
  area: string;
  access_kind: NonNullable<PartnerPerk["access_kind"]> | "";
  headline: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  area: "",
  access_kind: "",
  headline: "",
};

// Same live-preview pattern as NewEventForm.tsx / NewPerkForm.tsx. Access
// cards are simpler than Discount cards: no logo, no badge, and (per the
// 20260916090000 migration) no category either, since access-view.tsx
// groups perks by access_kind only and never reads category.
export function NewAccessForm() {
  const router = useRouter();
  const [fields, setFields] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("name", fields.name);
    formData.set("area", fields.area);
    formData.set("type", "access");
    formData.set("access_kind", fields.access_kind);
    formData.set("headline", fields.headline);

    startSaving(async () => {
      const result = await createPerk(formData);
      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setFields(EMPTY_FORM);
      router.refresh();
    });
  }

  const previewPerk: PartnerPerk = {
    id: "preview",
    display_order: 0,
    name: fields.name,
    category: null,
    area: fields.area,
    type: "access",
    access_kind: fields.access_kind || "skip_queue",
    headline: fields.headline,
    badge: null,
    logo_url: null,
  };

  return (
    <section className="rounded-2xl border border-foreground/10 bg-cream p-6">
      <h2 className="text-base font-semibold text-foreground">Add a new access perk</h2>
      <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start">
        <form onSubmit={handleSubmit} className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className={labelClasses}>Name</label>
            <input
              type="text"
              required
              value={fields.name}
              onChange={(event) => updateField("name", event.target.value)}
              className={inputClasses}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClasses}>Area</label>
            <input
              type="text"
              required
              value={fields.area}
              onChange={(event) => updateField("area", event.target.value)}
              className={inputClasses}
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className={labelClasses}>Access kind</label>
            <Select
              required
              value={fields.access_kind}
              onChange={(event) =>
                updateField("access_kind", event.target.value as NonNullable<PartnerPerk["access_kind"]>)
              }
            >
              <option value="" disabled>
                Choose a section
              </option>
              {Object.entries(ACCESS_KIND_LABEL).map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </Select>
            <p className="text-[11px] text-foreground/40">
              Which section of the Access page this appears under.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className={labelClasses}>Headline</label>
            <input
              type="text"
              required
              value={fields.headline}
              onChange={(event) => updateField("headline", event.target.value)}
              className={inputClasses}
            />
          </div>

          {error && <p className="text-sm font-medium text-red-700 sm:col-span-2">{error}</p>}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-full bg-foreground px-6 py-2.5 text-sm font-bold text-background disabled:opacity-60"
            >
              {isSaving ? "Adding…" : "Add access perk"}
            </button>
          </div>
        </form>

        <div className="flex w-full max-w-[280px] shrink-0 flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/40">
            Live preview
          </span>
          <PerkPreview perk={previewPerk} />
          <p className="text-xs text-foreground/50">
            Exactly what this will look like on the members&apos; Access page
            once added.
          </p>
        </div>
      </div>
    </section>
  );
}
