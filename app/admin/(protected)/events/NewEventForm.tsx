"use client";

import { useEffect, useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createEvent } from "@/app/admin/events-actions";
import { CARD_CLASS, EventThumbnail, PricePill, formatEventDayTime } from "@/components/members/ui";
import type { EventCategory } from "@/components/members/event-types";
import { cn, dateTimeLocalToISO } from "@/lib/utils";

// Same zone the rest of /admin/events and components/members/ui.tsx use —
// see the comment in app/admin/events-actions.ts.
const EVENT_TIME_ZONE = "Europe/London";

const CATEGORY_LABEL: Record<EventCategory, string> = {
  sport: "Sport",
  entertainment: "Entertainment",
  personal_progression: "Personal Progression",
};

const inputClasses =
  "w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/40";
const labelClasses = "text-xs font-semibold uppercase tracking-wider text-foreground/50";

type FormState = {
  title: string;
  category: EventCategory | "";
  location: string;
  start_time: string;
  end_time: string;
  price_pounds: string;
  capacity: string;
  description: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  category: "",
  location: "",
  start_time: "",
  end_time: "",
  price_pounds: "0",
  capacity: "",
  description: "",
};

// This section used to be a plain server-bound <form action={createEvent}>
// with no way to preview the result or attach a photo up front (photos had
// to be added afterwards, per-event, further down the page). It's a client
// component now — controlled fields drive a live preview card (the exact
// component members see, same as the per-event previews below) and the
// chosen photo is submitted in the same request via createEvent's optional
// photo field, following the same useTransition + manual FormData pattern
// used for the profile photo upload on the member side.
export function NewEventForm() {
  const router = useRouter();
  const [fields, setFields] = useState<FormState>(EMPTY_FORM);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Revoke the object URL whenever it changes or the component unmounts —
  // otherwise each new photo choice leaks the previous blob URL.
  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setPhoto(file);
    setPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function resetForm() {
    setFields(EMPTY_FORM);
    setPhoto(null);
    setPhotoPreviewUrl((prev) => {
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
    formData.set("title", fields.title);
    formData.set("category", fields.category);
    formData.set("location", fields.location);
    formData.set("start_time", fields.start_time);
    formData.set("end_time", fields.end_time);
    formData.set("price_pounds", fields.price_pounds);
    formData.set("capacity", fields.capacity);
    formData.set("description", fields.description);
    if (photo) formData.set("photo", photo);

    startSaving(async () => {
      const result = await createEvent(formData);
      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (result.warning) setNotice(result.warning);
      resetForm();
      router.refresh();
    });
  }

  const previewCategory: EventCategory = fields.category || "sport";
  const previewPricePence = Math.round((Number(fields.price_pounds) || 0) * 100);

  let previewDateTime: string | null = null;
  if (fields.start_time) {
    try {
      previewDateTime = formatEventDayTime(dateTimeLocalToISO(fields.start_time, EVENT_TIME_ZONE));
    } catch {
      previewDateTime = null;
    }
  }

  return (
    <section className="rounded-2xl border border-foreground/10 bg-cream p-6">
      <h2 className="text-base font-semibold text-foreground">Add a new event</h2>
      <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start">
        <form onSubmit={handleSubmit} className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className={labelClasses}>Title</label>
            <input
              type="text"
              required
              value={fields.title}
              onChange={(event) => updateField("title", event.target.value)}
              className={inputClasses}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClasses}>Category</label>
            <select
              required
              value={fields.category}
              onChange={(event) => updateField("category", event.target.value as EventCategory)}
              className={inputClasses}
            >
              <option value="" disabled>
                Choose a category
              </option>
              {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClasses}>Location</label>
            <input
              type="text"
              value={fields.location}
              onChange={(event) => updateField("location", event.target.value)}
              className={inputClasses}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClasses}>Start time (UK)</label>
            <input
              type="datetime-local"
              required
              value={fields.start_time}
              onChange={(event) => updateField("start_time", event.target.value)}
              className={inputClasses}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClasses}>End time (UK, optional)</label>
            <input
              type="datetime-local"
              value={fields.end_time}
              onChange={(event) => updateField("end_time", event.target.value)}
              className={inputClasses}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClasses}>Price per person (£, 0 = included)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={fields.price_pounds}
              onChange={(event) => updateField("price_pounds", event.target.value)}
              className={inputClasses}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClasses}>Capacity</label>
            <input
              type="number"
              min="0"
              step="1"
              required
              value={fields.capacity}
              onChange={(event) => updateField("capacity", event.target.value)}
              className={inputClasses}
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className={labelClasses}>Description</label>
            <textarea
              rows={3}
              value={fields.description}
              onChange={(event) => updateField("description", event.target.value)}
              className={inputClasses}
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className={labelClasses}>Photo (optional)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handlePhotoChange}
              className="text-xs text-foreground/70 file:mr-2 file:rounded-full file:border-0 file:bg-foreground file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-background"
            />
            <p className="text-xs text-foreground/50">
              Leave this blank to start with the branded placeholder shown in
              the preview — a photo can always be added or replaced later.
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
              {isSaving ? "Adding…" : "Add event"}
            </button>
          </div>
        </form>

        <div className="flex w-full max-w-[280px] shrink-0 flex-col gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/40">
            Live preview
          </span>
          <div className={cn(CARD_CLASS, "overflow-hidden")}>
            <EventThumbnail
              category={previewCategory}
              imageUrl={photoPreviewUrl}
              className="h-32 w-full"
            />
            <div className="flex flex-col gap-1 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-bold text-foreground">
                  {fields.title || "Event title"}
                </p>
                <PricePill pricePence={previewPricePence} />
              </div>
              <p className="text-xs text-foreground-muted">
                {previewDateTime ?? "Pick a start time"}
                {fields.location ? ` · ${fields.location}` : ""}
              </p>
            </div>
          </div>
          <p className="text-xs text-foreground/50">
            Exactly what this event will look like in the members&apos; events
            list once added.
          </p>
        </div>
      </div>
    </section>
  );
}
