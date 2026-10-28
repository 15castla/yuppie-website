"use client";

// The event card's form (r2b 17), for a new event and for editing one. Fields as today plus the exact Address
// (only people who have booked see it, B-D20) and the link shown read only. Plain checks before saving: the
// required fields, and a capacity never below the number booked. Moving a booked event (date, time or place)
// asks whether to email the people booked (C-D11: they may then cancel for a full refund, whatever the date).

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ChangeEvent, type FormEvent, type ReactNode } from "react";

import { adminEmailEventChange } from "@/app/admin/event-booking-actions";
import { createEvent, removeEventImage, updateEventDetails, updateEventImage, type EventField } from "@/app/admin/events-actions";
import { Banner, BusyButton } from "@/components/admin/bits";
import { Dialog, SwitchRow } from "@/components/admin/dialog";
import { dateParts, time24 } from "@/components/admin/format";
import { Icon } from "@/components/admin/icons";
import { DateCol, ErrorLine, Pill, SavedLine, Section } from "@/components/admin/ui";
import type { EventCategory } from "@/components/members/event-types";
import { CENTRE_FOCAL_POINT, type FocalPoint } from "@/components/members/ui";
import { dateTimeLocalToISO } from "@/lib/utils";
import { FocalPointOverlay } from "./FocalPointOverlay";

const TZ = "Europe/London";
const CATEGORIES: [EventCategory, string][] = [
  ["sport", "Sport"],
  ["entertainment", "Entertainment"],
  ["personal_progression", "Personal progression"],
];

export type EventFormValues = {
  title: string;
  category: EventCategory | "";
  location: string;
  address: string;
  start: string;
  end: string;
  price: string;
  capacity: string;
  description: string;
};

type Errors = Partial<Record<EventField | "form", string>>;
type Saved = { moved: string | null; booked: number; emailing: boolean; emailed?: number };

function check(values: EventFormValues, booked: number): Errors {
  const e: Errors = {};
  if (!values.title.trim()) e.title = "Add a title.";
  if (!values.category) e.category = "Choose a category.";
  if (!values.start) e.start_time = "Choose when it starts.";
  if (values.start && values.end && values.end <= values.start) e.end_time = "It has to end after it starts.";
  const price = values.price.trim() === "" ? 0 : Number(values.price);
  if (!Number.isFinite(price) || price < 0) e.price_pounds = "The price must be a number, 0 or more.";
  if (!values.capacity.trim()) e.capacity = "Add how many people can come.";
  else if (!Number.isInteger(Number(values.capacity)) || Number(values.capacity) < 0) e.capacity = "The capacity must be a whole number.";
  else if (Number(values.capacity) < booked) e.capacity = `Capacity can’t be lower than the ${booked} already booked.`;
  return e;
}

function movedWhat(base: EventFormValues, now: EventFormValues): "time" | "place" | "both" | null {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const time = base.start !== now.start;
  const place = norm(base.location) !== norm(now.location) || norm(base.address) !== norm(now.address);
  return time && place ? "both" : time ? "time" : place ? "place" : null;
}

const MOVE_WORDS = { time: "time", place: "place", both: "time and place" } as const;

function Field({
  id,
  label,
  hint,
  error,
  span2,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  span2?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`ad-field${span2 ? " span2" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p className="emsg" id={`${id}-msg`} role="alert">
          <Icon name="circle-alert" size={16} />
          <span>{error}</span>
        </p>
      ) : (
        hint && (
          <p className="hint" id={`${id}-msg`}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function EventForm({
  mode,
  eventId,
  initial,
  slug,
  booked = 0,
  imageUrl = null,
  focal = CENTRE_FOCAL_POINT,
  linkHost,
  extraActions,
  created = false,
}: {
  mode: "new" | "edit";
  eventId?: string;
  initial: EventFormValues;
  slug?: string;
  booked?: number;
  imageUrl?: string | null;
  focal?: FocalPoint;
  linkHost: string;
  extraActions?: ReactNode;
  created?: boolean;
}) {
  const router = useRouter();
  const isNew = mode === "new";
  const [values, setValues] = useState<EventFormValues>(initial);
  const [baseline, setBaseline] = useState<EventFormValues>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [capacityBanner, setCapacityBanner] = useState(false);
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [createdNote, setCreatedNote] = useState(created);
  const [moveDialog, setMoveDialog] = useState<"time" | "place" | "both" | null>(null);
  const [notify, setNotify] = useState(true);
  const [emailing, startEmailing] = useTransition();
  const [point, setPoint] = useState<FocalPoint>(focal);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, startPhoto] = useTransition();
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const set = (key: keyof EventFormValues) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setSaved(null);
    setCreatedNote(false);
  };
  const fid = (name: string) => `${eventId ?? "new"}-${name}`;
  const inputProps = (name: EventField | "location" | "address" | "description") => ({
    id: fid(name),
    "aria-invalid": errors[name as EventField] ? true : undefined,
    "aria-describedby": `${fid(name)}-msg`,
    className: `ad-input${errors[name as EventField] ? " is-error" : ""}`,
  });

  function formData(withNotify: boolean) {
    const fd = new FormData();
    if (eventId) fd.set("event_id", eventId);
    fd.set("title", values.title);
    fd.set("category", values.category);
    fd.set("location", values.location);
    fd.set("address", values.address);
    fd.set("start_time", values.start);
    fd.set("end_time", values.end);
    fd.set("price_pounds", values.price.trim() || "0");
    fd.set("capacity", values.capacity);
    fd.set("description", values.description);
    if (isNew && photo) {
      fd.set("photo", photo);
      fd.set("image_focal_x", String(point.x));
      fd.set("image_focal_y", String(point.y));
    }
    if (!isNew && imageUrl) {
      fd.set("image_focal_x", String(point.x));
      fd.set("image_focal_y", String(point.y));
    }
    if (withNotify) fd.set("notify_booked", "on");
    return fd;
  }

  function save(withNotify: boolean) {
    startSaving(async () => {
      if (isNew) {
        const result = await createEvent(formData(false)).catch(() => ({ success: false as const, error: "", field: undefined, id: undefined, warning: undefined }));
        if (!result.success || !result.id) {
          setErrors(result.field ? { [result.field]: result.error } : { form: result.error || "We couldn’t create the event. Try again in a moment." });
          return;
        }
        router.push(`/admin/events/${result.id}?created=1${result.warning ? `&warning=${encodeURIComponent(result.warning)}` : ""}`, { scroll: false });
        router.refresh();
        return;
      }
      const result = await updateEventDetails(formData(withNotify)).catch(() => ({ success: false as const, error: "", field: undefined, code: undefined }));
      setMoveDialog(null);
      if (!result.success) {
        setCapacityBanner(result.code === "capacity");
        setErrors(result.field ? { [result.field]: result.error } : { form: result.error || "We couldn’t save that. Try again in a moment." });
        return;
      }
      setBaseline(values);
      setSaved({ moved: result.moved ?? null, booked: result.bookedCount ?? 0, emailing: Boolean(result.emailing) });
      router.refresh();
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found = check(values, booked);
    setErrors(found);
    setCapacityBanner(Boolean(found.capacity && Number(values.capacity) < booked));
    setSaved(null);
    setCreatedNote(false);
    if (Object.keys(found).length) {
      const firstBad = Object.keys(found)[0];
      document.getElementById(fid(firstBad))?.focus();
      return;
    }
    const moved = !isNew && booked > 0 ? movedWhat(baseline, values) : null;
    if (moved) {
      setNotify(true);
      setMoveDialog(moved);
      return;
    }
    save(false);
  }

  function emailThem() {
    if (!eventId) return;
    startEmailing(async () => {
      const result = await adminEmailEventChange(eventId).catch(() => ({ ok: false as const, error: "" }));
      setSaved((s) => (s ? { ...s, emailing: false, emailed: result.ok ? result.emailed : -1 } : s));
    });
  }

  function choosePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhotoError(null);
    if (isNew) {
      setPhoto(file);
      setPoint(CENTRE_FOCAL_POINT);
      setPhotoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return file ? URL.createObjectURL(file) : null;
      });
      return;
    }
    if (!file || !eventId) return;
    const fd = new FormData();
    fd.set("event_id", eventId);
    fd.set("photo", file);
    startPhoto(async () => {
      const result = await updateEventImage(fd).catch(() => ({ success: false, error: "We couldn’t upload the picture. Try again in a moment." }));
      if (fileRef.current) fileRef.current.value = "";
      if (!result.success) {
        setPhotoError(result.error ?? "We couldn’t upload the picture. Try again in a moment.");
        return;
      }
      setPoint(CENTRE_FOCAL_POINT);
      router.refresh();
    });
  }

  function removePhoto() {
    setPhotoError(null);
    if (isNew) {
      setPhoto(null);
      setPhotoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (!eventId) return;
    startPhoto(async () => {
      const result = await removeEventImage(eventId).catch(() => ({ success: false, error: "We couldn’t remove the picture. Try again in a moment." }));
      if (!result.success) setPhotoError(result.error ?? "We couldn’t remove the picture. Try again in a moment.");
      else router.refresh();
    });
  }

  const shownPhoto = isNew ? photoUrl : imageUrl;
  const previewIso = (() => {
    try {
      return values.start ? dateTimeLocalToISO(values.start, TZ) : null;
    } catch {
      return null;
    }
  })();
  const capacityNum = Number(values.capacity);
  const full = values.capacity.trim() !== "" && Number.isFinite(capacityNum) && booked >= capacityNum;
  const missing = isNew && Object.keys(errors).some((k) => k !== "form");

  return (
    <form onSubmit={onSubmit} noValidate aria-label={isNew ? "New event" : "Event details"}>
      {createdNote && <SavedLine>Event created. Members see it in the Events list now.</SavedLine>}
      {missing && <Banner title="Some details are missing.">Fix the fields marked below, then create the event.</Banner>}
      {capacityBanner && <Banner title="The capacity is lower than the number booked.">Nothing was saved. Raise the capacity, or cancel some bookings first.</Banner>}
      {errors.form && <Banner title="We couldn’t save that.">{errors.form}</Banner>}

      <div className="ad-form c2">
        <Field id={fid("title")} label="Title" error={errors.title} span2>
          <input {...inputProps("title")} name="title" value={values.title} onChange={set("title")} placeholder={isNew ? "Padel & Pints" : undefined} autoComplete="off" />
        </Field>
        <Field id={fid("category")} label="Category" error={errors.category}>
          <span className="ad-select">
            <select {...inputProps("category")} name="category" value={values.category} onChange={set("category")}>
              <option value="" disabled>
                Choose a category
              </option>
              {CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Icon name="chevron-down" size={20} />
          </span>
        </Field>
        <Field id={fid("location")} label="Location">
          <input {...inputProps("location")} name="location" value={values.location} onChange={set("location")} placeholder={isNew ? "Northgate Courts" : undefined} autoComplete="off" />
        </Field>
        <Field id={fid("address")} label="Address" hint="Only people who have booked see this." span2>
          <input {...inputProps("address")} name="address" value={values.address} onChange={set("address")} placeholder="Street and postcode" autoComplete="off" />
        </Field>
        <Field id={fid("start_time")} label="Starts" hint="UK time" error={errors.start_time}>
          <input {...inputProps("start_time")} type="datetime-local" name="start_time" value={values.start} onChange={set("start")} />
        </Field>
        <Field id={fid("end_time")} label="Ends" hint="UK time" error={errors.end_time}>
          <input {...inputProps("end_time")} type="datetime-local" name="end_time" value={values.end} onChange={set("end")} />
        </Field>
        <Field id={fid("price_pounds")} label="Price per person (£)" hint="0 means included in the membership." error={errors.price_pounds}>
          <input {...inputProps("price_pounds")} name="price_pounds" inputMode="decimal" value={values.price} onChange={set("price")} placeholder="0" />
        </Field>
        <Field id={fid("capacity")} label="Capacity" hint={isNew ? "People can’t book once it’s full." : `${booked} booked so far.`} error={errors.capacity}>
          <input {...inputProps("capacity")} name="capacity" inputMode="numeric" value={values.capacity} onChange={set("capacity")} placeholder={isNew ? "24" : undefined} />
        </Field>
        <Field id={fid("description")} label="Description" span2>
          <textarea {...inputProps("description")} name="description" rows={3} value={values.description} onChange={set("description")} placeholder="What members should know" />
        </Field>
        {!isNew && slug && (
          <Field id={fid("link")} label="Link" hint="Set when the event is made. It doesn’t change." span2>
            <span className="ad-input ro" id={fid("link")}>
              {linkHost}/members/events/{slug}
            </span>
          </Field>
        )}
      </div>

      <Section title="Picture">
        <div className="ad-two" style={{ marginTop: 14 }}>
          {shownPhoto ? (
            <div className="ad-photo">
              <FocalPointOverlay category={(values.category || "sport") as EventCategory} imageUrl={shownPhoto} value={point} onChange={setPoint} />
            </div>
          ) : (
            <div className="ad-photo-ph">
              <Icon name="upload" size={20} />
              No picture yet
            </div>
          )}
          <div>
            <p className="ad-hint" style={{ marginTop: 0 }}>
              {shownPhoto
                ? `Use the arrows on the picture to choose what shows in the card${isNew ? "" : ", then save the changes"}.`
                : "A wide picture works best. You can choose what shows in the card once it is added."}
            </p>
            <input ref={fileRef} className="ad-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={choosePhoto} id={fid("photo")} tabIndex={-1} aria-label="Choose a picture" />
            <div className="ad-acts" style={{ marginTop: 12 }}>
              <BusyButton type="button" className="sm secondary" busy={photoBusy} busyLabel="Uploading…" onClick={() => fileRef.current?.click()}>
                {shownPhoto ? "Replace picture" : "Add picture"}
              </BusyButton>
              {shownPhoto && (
                <button type="button" className="ad-btn sm secondary" disabled={photoBusy} onClick={removePhoto}>
                  Remove picture
                </button>
              )}
            </div>
            {photoError && <ErrorLine>{photoError}</ErrorLine>}
          </div>
        </div>
      </Section>

      <Section title="How members see it" hint="The row in the Events list.">
        <div className="ad-well">
          <div className="ad-erow">
            {previewIso ? <DateCol {...dateParts(previewIso)} /> : <DateCol weekday="Day" day="–" />}
            <span className="body">
              <span className="title">{values.title.trim() || "Event title"}</span>
              <span className="meta">
                {previewIso ? time24(previewIso) : "Time"}
                {values.location.trim() ? ` · ${values.location.trim()}` : ""}
              </span>
            </span>
            <span className="end">{full ? <Pill>Full</Pill> : values.capacity.trim() ? `${booked} of ${values.capacity.trim()} booked` : ""}</span>
          </div>
        </div>
      </Section>

      {saved && (
        <div style={{ marginTop: 22 }}>
          <SavedLine>Saved. Members see the new details now.</SavedLine>
          {saved.moved && saved.booked > 0 && (
            <>
              <p className="ad-hint" style={{ marginTop: 0 }} role="status">
                {saved.emailed === undefined
                  ? saved.emailing
                    ? `The ${saved.booked === 1 ? "person" : `${saved.booked} people`} booked ${saved.booked === 1 ? "is" : "are"} being emailed about the change. They can cancel for a full refund, whatever the date.`
                    : `The ${saved.booked === 1 ? "person" : `${saved.booked} people`} booked ${saved.booked === 1 ? "hasn’t" : "haven’t"} been told about the change yet.`
                  : saved.emailed >= 0
                    ? `Emailed ${saved.emailed === 1 ? "1 person" : `${saved.emailed} people`} about the change.`
                    : "The emails didn’t go. Try again in a moment."}
              </p>
              {!saved.emailing && (saved.emailed === undefined || saved.emailed < 0) && (
                <div className="ad-acts" style={{ marginTop: 10 }}>
                  <BusyButton type="button" className="sm secondary" busy={emailing} busyLabel="Emailing…" onClick={emailThem}>
                    Email them now
                  </BusyButton>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="ad-acts" style={{ marginTop: 26 }}>
        <BusyButton type="submit" className="sm" busy={saving} busyLabel={isNew ? "Creating…" : "Saving…"}>
          {isNew ? "Create event" : "Save changes"}
        </BusyButton>
        {isNew ? (
          <a className="ad-btn sm secondary" href="/admin/events">
            Cancel
          </a>
        ) : (
          extraActions
        )}
      </div>
      {!isNew && <p className="ad-hint">Cancelling emails everyone who booked and refunds what they paid. You’ll be asked to confirm.</p>}

      <Dialog
        open={moveDialog !== null}
        title={`Save the new ${moveDialog ? MOVE_WORDS[moveDialog] : "details"}?`}
        onClose={() => setMoveDialog(null)}
        busy={saving}
        testId="dialog-move"
        actions={
          <>
            <BusyButton type="button" busy={saving} busyLabel="Saving…" onClick={() => save(notify)}>
              Save changes
            </BusyButton>
            <button type="button" className="ad-btn secondary" disabled={saving} onClick={() => setMoveDialog(null)}>
              Keep editing
            </button>
          </>
        }
      >
        <p className="ad-p">
          {booked === 1 ? "1 person is" : `${booked} people are`} booked on {values.title.trim() || "this event"}. Because the{" "}
          {moveDialog ? MOVE_WORDS[moveDialog] : "details"} changed, they can cancel for a full refund, whatever the date.
        </p>
        <SwitchRow
          on={notify}
          onChange={setNotify}
          disabled={saving}
          label={`Email the ${booked === 1 ? "person" : `${booked} people`} booked`}
          hint={notify ? "They get an email with the new details." : "Nobody is emailed now. You can email them later from here."}
        />
      </Dialog>
    </form>
  );
}
