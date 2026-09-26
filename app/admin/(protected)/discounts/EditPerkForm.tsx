"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { updatePerk } from "@/app/admin/discounts-actions";
import { PerkPreview, inputClasses, labelClasses } from "@/app/admin/perk-shared";
import { Select } from "@/app/admin/form-controls";
import type { PartnerPerk } from "@/components/members/mock-perks";
import { PerkLogoForm } from "./PerkLogoForm";

type FormState = {
  name: string;
  area: string;
  category: string;
  badge: string;
  headline: string;
};

const ADD_NEW_CATEGORY_VALUE = "__add_new__";

const linkClasses =
  "text-left text-sm font-medium text-foreground/50 outline-none transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline";

// Same live-preview technique as NewPerkForm.tsx: controlled fields drive
// a previewPerk object fed into PerkPreview, so the card above updates as
// the admin types instead of only reflecting the original server-fetched
// perk until the page reloads after saving. Renders the preview card and
// PerkLogoForm alongside the editable fields (rather than page.tsx
// rendering PerkPreview separately, as it used to) since the preview needs
// this component's live local state, not just the static perk prop.
// logo_url itself still comes straight from that prop, refreshed whenever
// PerkLogoForm's own action succeeds and calls router.refresh().
export function EditPerkForm({ perk, categories }: { perk: PartnerPerk; categories: string[] }) {
  const router = useRouter();
  const [fields, setFields] = useState<FormState>({
    name: perk.name,
    area: perk.area,
    category: perk.category ?? "",
    badge: perk.badge ?? "",
    headline: perk.headline,
  });
  const [addingCategory, setAddingCategory] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleCategorySelectChange(value: string) {
    if (value === ADD_NEW_CATEGORY_VALUE) {
      setAddingCategory(true);
      updateField("category", "");
      return;
    }
    updateField("category", value);
  }

  function handleUseExistingCategories() {
    setAddingCategory(false);
    updateField("category", "");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("id", perk.id);
    formData.set("type", "discount");
    formData.set("name", fields.name);
    formData.set("area", fields.area);
    formData.set("category", fields.category ?? "");
    formData.set("badge", fields.badge);
    formData.set("headline", fields.headline);

    startSaving(async () => {
      const result = await updatePerk(formData);
      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  const previewPerk: PartnerPerk = {
    ...perk,
    name: fields.name,
    area: fields.area,
    category: fields.category || "Food & Drink",
    badge: fields.badge.trim() || null,
    headline: fields.headline,
  };

  return (
    <>
      <div className="flex w-full max-w-[280px] shrink-0 flex-col gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/40">
          Live preview
        </span>
        <PerkPreview perk={previewPerk} />
        <PerkLogoForm perkId={perk.id} hasLogo={Boolean(perk.logo_url)} />
      </div>

      <form onSubmit={handleSubmit} className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label className={labelClasses}>Name</label>
          <input
            type="text"
            required
            value={fields.name}
            onChange={(event) => updateField("name", event.target.value)}
            className={inputClasses}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label className={labelClasses}>Area</label>
          <input
            type="text"
            required
            value={fields.area}
            onChange={(event) => updateField("area", event.target.value)}
            className={inputClasses}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label className={labelClasses}>Category</label>
          {addingCategory ? (
            <>
              <input
                type="text"
                required
                value={fields.category}
                onChange={(event) => updateField("category", event.target.value)}
                placeholder="e.g. Live Music"
                className={inputClasses}
              />
              <button type="button" onClick={handleUseExistingCategories} className={linkClasses}>
                Choose from existing categories instead
              </button>
            </>
          ) : (
            <Select
              required
              value={fields.category}
              onChange={(event) => handleCategorySelectChange(event.target.value)}
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
              <option value={ADD_NEW_CATEGORY_VALUE}>+ Add new category</option>
            </Select>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label className={labelClasses}>Badge</label>
          <input
            type="text"
            value={fields.badge}
            onChange={(event) => updateField("badge", event.target.value)}
            className={inputClasses}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
          <label className={labelClasses}>Headline</label>
          <input
            type="text"
            required
            value={fields.headline}
            onChange={(event) => updateField("headline", event.target.value)}
            className={inputClasses}
          />
        </div>
        <div className="flex items-center gap-4 sm:col-span-2">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-full bg-foreground px-5 py-2 text-sm font-bold text-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? "Saving…" : "Save changes"}
          </button>
          {error && <p className="text-xs text-red-700">{error}</p>}
        </div>
      </form>
    </>
  );
}
