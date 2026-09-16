"use client";

import { useEffect, useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createPerk } from "@/app/admin/discounts-actions";
import { PERK_CATEGORIES, PerkPreview, inputClasses, labelClasses } from "@/app/admin/perk-shared";
import type { PartnerPerk } from "@/components/members/mock-perks";

type FormState = {
  name: string;
  area: string;
  category: PartnerPerk["category"] | "";
  badge: string;
  headline: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  area: "",
  category: "",
  badge: "",
  headline: "",
};

// Same pattern as app/admin/(protected)/events/NewEventForm.tsx: controlled
// fields drive a live preview (the exact PerkPreview card members see on
// /members/discounts), and the logo is submitted in the same request as
// the rest of the perk via createPerk's optional logo field.
export function NewPerkForm() {
  const router = useRouter();
  const [fields, setFields] = useState<FormState>(EMPTY_FORM);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    };
  }, [logoPreviewUrl]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setLogo(file);
    setLogoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function resetForm() {
    setFields(EMPTY_FORM);
    setLogo(null);
    setLogoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const formData = new FormData();
    formData.set("name", fields.name);
    formData.set("area", fields.area);
    formData.set("category", fields.category);
    formData.set("type", "discount");
    formData.set("badge", fields.badge);
    formData.set("headline", fields.headline);
    if (logo) formData.set("logo", logo);

    startSaving(async () => {
      const result = await createPerk(formData);
      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (result.warning) setNotice(result.warning);
      resetForm();
      router.refresh();
    });
  }

  const previewPerk: PartnerPerk = {
    id: "preview",
    name: fields.name,
    category: (fields.category || "Food & Drink") as PartnerPerk["category"],
    area: fields.area,
    type: "discount",
    access_kind: null,
    headline: fields.headline,
    badge: fields.badge.trim() || null,
    logo_url: logoPreviewUrl,
  };

  return (
    <section className="rounded-2xl border border-foreground/10 bg-cream p-6">
      <h2 className="text-base font-semibold text-foreground">Add a new discount</h2>
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

          <div className="flex flex-col gap-1.5">
            <label className={labelClasses}>Category</label>
            <select
              required
              value={fields.category}
              onChange={(event) => updateField("category", event.target.value as PartnerPerk["category"])}
              className={inputClasses}
            >
              <option value="" disabled>
                Choose a category
              </option>
              {PERK_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClasses}>Badge (optional)</label>
            <input
              type="text"
              placeholder="e.g. 20%"
              value={fields.badge}
              onChange={(event) => updateField("badge", event.target.value)}
              className={inputClasses}
            />
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

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className={labelClasses}>Logo (optional)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleLogoChange}
              className="text-xs text-foreground/70 file:mr-2 file:rounded-full file:border-0 file:bg-foreground file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-background"
            />
            <p className="text-xs text-foreground/50">
              Leave this blank to start with the venue&apos;s initial shown in
              the preview — a logo can always be added or replaced later.
            </p>
          </div>

          {error && <p className="text-sm font-medium text-red-700 sm:col-span-2">{error}</p>}
          {notice && <p className="text-sm font-medium text-amber-700 sm:col-span-2">{notice}</p>}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-full bg-foreground px-6 py-2.5 text-sm font-bold text-background disabled:opacity-60"
            >
              {isSaving ? "Adding…" : "Add discount"}
            </button>
          </div>
        </form>

        <div className="flex w-full max-w-[280px] shrink-0 flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/40">
            Live preview
          </span>
          <PerkPreview perk={previewPerk} />
          <p className="text-xs text-foreground/50">
            Exactly what this will look like on the members&apos; Discounts
            page once added.
          </p>
        </div>
      </div>
    </section>
  );
}
