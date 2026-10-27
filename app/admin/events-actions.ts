"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireAdmin } from "./require-admin";
import { createAdminSupabaseClient } from "./admin-client";
import { uploadMemberMedia } from "@/lib/media-storage";
import { audit } from "@/lib/server/audit";
import { emailEventMove, getEventAddress, recordEventMove, setEventAddress, type EventMove } from "@/lib/server/events";
import { later } from "@/lib/server/later";
import { dateTimeLocalToISO } from "@/lib/utils";
import type { EventCategory } from "@/components/members/event-types";

// Same zone components/members/ui.tsx formats event times in: the
// datetime-local inputs on /admin/events are edited (and displayed) as
// London wall-clock time regardless of what timezone the server or the
// admin's OS is actually set to. See lib/utils.ts's dateTimeLocalToISO.
const EVENT_TIME_ZONE = "Europe/London";
const CATEGORIES: EventCategory[] = ["sport", "entertainment", "personal_progression"];

type ParsedEventFields = {
  title: string;
  description: string | null;
  category: EventCategory;
  location: string | null;
  start_time: string;
  end_time: string | null;
  price_pence: number;
  capacity: number;
  image_focal_x?: number;
  image_focal_y?: number;
};

// The photo focal point, as 0-100 percentages. Both forms send it, but
// it's optional so a submission without it leaves the stored value alone
// (and a new event falls back to the column default, 50/50).
function parseFocalPoint(
  formData: FormData,
): { error: string } | { image_focal_x?: number; image_focal_y?: number } {
  const xInput = formData.get("image_focal_x");
  const yInput = formData.get("image_focal_y");
  if (xInput === null && yInput === null) return {};

  const x = Number(xInput);
  const y = Number(yInput);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
    return { error: "The photo focal point is invalid. Please click the photo again." };
  }
  // numeric(5, 2) in the database.
  return { image_focal_x: Math.round(x * 100) / 100, image_focal_y: Math.round(y * 100) / 100 };
}

// Shared by createEvent and updateEventDetails so the two forms can't drift
// into accepting different things as valid.
function parseEventFields(formData: FormData): { error: string } | { fields: ParsedEventFields } {
  const title = formData.get("title");
  const description = formData.get("description");
  const category = formData.get("category");
  const location = formData.get("location");
  const startLocal = formData.get("start_time");
  const endLocal = formData.get("end_time");
  const priceInput = formData.get("price_pounds");
  const capacityInput = formData.get("capacity");

  if (typeof title !== "string" || !title.trim()) {
    return { error: "Title is required." };
  }
  if (typeof category !== "string" || !CATEGORIES.includes(category as EventCategory)) {
    return { error: "Please choose a valid category." };
  }
  if (typeof startLocal !== "string" || !startLocal) {
    return { error: "Start time is required." };
  }

  const priceStr = typeof priceInput === "string" ? priceInput.trim() : "";
  const pricePounds = priceStr ? Number(priceStr) : 0;
  if (Number.isNaN(pricePounds) || pricePounds < 0) {
    return { error: "Price must be a positive number (or 0 for included)." };
  }

  const capacityStr = typeof capacityInput === "string" ? capacityInput.trim() : "";
  const capacity = Number(capacityStr);
  if (!Number.isInteger(capacity) || capacity < 0) {
    return { error: "Capacity must be a whole number." };
  }

  let startTime: string;
  let endTime: string | null;
  try {
    startTime = dateTimeLocalToISO(startLocal, EVENT_TIME_ZONE);
    endTime =
      typeof endLocal === "string" && endLocal
        ? dateTimeLocalToISO(endLocal, EVENT_TIME_ZONE)
        : null;
  } catch (err) {
    console.error("parseEventFields: invalid date:", err);
    return { error: "Please check the start/end times." };
  }

  const focalPoint = parseFocalPoint(formData);
  if ("error" in focalPoint) return focalPoint;

  return {
    fields: {
      ...focalPoint,
      title: title.trim(),
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      category: category as EventCategory,
      location: typeof location === "string" && location.trim() ? location.trim() : null,
      start_time: startTime,
      end_time: endTime,
      price_pence: Math.round(pricePounds * 100),
      capacity,
    },
  };
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "event";
}

// Auto-generates the slug from the title rather than exposing a raw slug
// field. That keeps it URL-safe and avoids someone hand-typing something that
// collides or contains stray characters. Retries with a numeric suffix on
// a unique-constraint collision (Postgres code 23505); see
// events_slug_unique in supabase/migrations/20260909190148_add_slug_to_events.sql.
//
// A "photo" file field is optional here: when present, it's uploaded and
// attached to the new row in the same submission (rather than requiring a
// second trip through updateEventImage afterwards). If the insert succeeds
// but the photo upload fails, the event still exists (not rolled back).
// That's surfaced back as a non-fatal `warning` rather than `error`, since
// treating the whole submission as failed would make the admin re-submit
// and risk a duplicate event.
// The exact address (A-D3): an optional "address" field on both forms. Kept
// in event_addresses, which only admins and the server can read; members see
// it only with a confirmed booking. Absent from the form: left as it is.
function readAddress(formData: FormData): string | null | undefined {
  if (!formData.has("address")) return undefined;
  const value = formData.get("address");
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function createEvent(
  formData: FormData,
): Promise<{ success: boolean; error?: string; warning?: string }> {
  const admin = await requireAdmin();

  const parsed = parseEventFields(formData);
  if ("error" in parsed) return { success: false, error: parsed.error };

  const photo = formData.get("photo");
  const hasPhoto = photo instanceof File && photo.size > 0;

  const adminClient = createAdminSupabaseClient();
  const baseSlug = slugify(parsed.fields.title);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const slug = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
    const { data, error } = await adminClient
      .from("events")
      .insert({ ...parsed.fields, slug })
      .select("id")
      .single();

    if (!error) {
      let warning: string | undefined;

      const address = readAddress(formData);
      if (address) {
        const saved = await setEventAddress(data.id, address);
        if (!saved.ok) warning = "Event created, but saving the address failed. Add it again from the event.";
      }
      await audit(admin.id, "event.create", { type: "event", id: data.id }, { title: parsed.fields.title, slug });

      if (hasPhoto) {
        const uploaded = await uploadMemberMedia("events", data.id, photo as File);
        if (uploaded.error) {
          warning = `Event created, but the photo failed to upload: ${uploaded.error}`;
        } else {
          const { error: imageError } = await adminClient
            .from("events")
            .update({ image_url: uploaded.url })
            .eq("id", data.id);
          if (imageError) {
            console.error(`createEvent: saving image_url failed for ${data.id}:`, imageError);
            warning = "Event created, but saving the photo to it failed.";
          }
        }
      }

      revalidateTag("events", "minutes");
      revalidatePath("/admin/events");
      return { success: true, warning };
    }

    if (error.code !== "23505") {
      console.error("createEvent failed:", error);
      return { success: false, error: "Something went wrong creating that event." };
    }
    // else: slug collision, loop and try the next suffix.
  }

  return { success: false, error: "Couldn't find a free URL slug for that title. Try renaming it slightly." };
}

// Deliberately doesn't accept a new slug, since event URLs may already be
// shared/bookmarked, and changing one out from under a member silently
// would just 404 their link. Renaming a slug is rare enough that it can
// still go through Supabase directly when it's genuinely needed.
//
// Moving a booked event (C-D11): when the date, time or place (venue or exact
// address) changes and the event has confirmed bookings, events.changed_at is
// set, so every member already booked may cancel for a full refund whatever
// the date. With "notify_booked" = "on" they are emailed (event-changed) after
// the response; without it, the result says how many are booked so the
// screen can offer the email (adminEmailEventChange in
// event-booking-actions.ts sends it later).
export async function updateEventDetails(
  formData: FormData,
): Promise<{ success: boolean; error?: string; moved?: EventMove | null; bookedCount?: number; emailing?: boolean }> {
  const admin = await requireAdmin();

  const eventId = formData.get("event_id");
  if (typeof eventId !== "string" || !eventId) {
    return { success: false, error: "Missing event." };
  }

  const parsed = parseEventFields(formData);
  if ("error" in parsed) return { success: false, error: parsed.error };

  const adminClient = createAdminSupabaseClient();
  const [{ data: beforeRow }, beforeAddress] = await Promise.all([
    adminClient.from("events").select("start_time, location").eq("id", eventId).maybeSingle(),
    getEventAddress(eventId),
  ]);
  if (!beforeRow) return { success: false, error: "That event couldn’t be found." };

  const { error } = await adminClient.from("events").update(parsed.fields).eq("id", eventId);

  if (error) {
    console.error(`updateEventDetails failed for event ${eventId}:`, error);
    return { success: false, error: "Something went wrong saving that event." };
  }

  const address = readAddress(formData);
  if (address !== undefined) {
    const saved = await setEventAddress(eventId, address);
    if (!saved.ok) return { success: false, error: "The event saved, but the address didn’t. Try again." };
  }

  const before = { start_time: beforeRow.start_time as string, location: beforeRow.location as string | null, address: beforeAddress };
  const after = { start_time: parsed.fields.start_time, location: parsed.fields.location, address: address === undefined ? beforeAddress : address };
  const move = await recordEventMove(eventId, before, after);
  const notify = formData.get("notify_booked") === "on" && move.moved !== null && move.bookedCount > 0;
  await audit(admin.id, "event.update", { type: "event", id: eventId }, {
    fields: parsed.fields,
    address_changed: address !== undefined && address !== beforeAddress,
    moved: move.moved,
    changed_at: move.changedAt,
    booked: move.bookedCount,
    before,
    notify,
  });
  if (notify && move.moved) {
    const moved = move.moved;
    later(`event-changed emails for ${eventId}`, () => emailEventMove(eventId, { moved, before, changedAt: move.changedAt }));
  }

  revalidateTag("events", "minutes");
  revalidatePath("/admin/events");
  return { success: true, moved: move.moved, bookedCount: move.bookedCount, emailing: notify };
}

export async function updateEventImage(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();

  const eventId = formData.get("event_id");
  const photo = formData.get("photo");

  if (typeof eventId !== "string" || !eventId) {
    return { success: false, error: "Missing event." };
  }

  if (!(photo instanceof File)) {
    return { success: false, error: "Please choose an image to upload." };
  }

  const uploaded = await uploadMemberMedia("events", eventId, photo);
  if (uploaded.error) {
    return { success: false, error: uploaded.error };
  }

  const adminClient = createAdminSupabaseClient();
  // A new photo starts centred: the old focal point was chosen for the old
  // photo and won't mean anything for this one.
  const { error } = await adminClient
    .from("events")
    .update({ image_url: uploaded.url, image_focal_x: 50, image_focal_y: 50 })
    .eq("id", eventId);

  if (error) {
    console.error(`updateEventImage failed for event ${eventId}:`, error);
    return { success: false, error: "Uploaded, but saving it to the event failed." };
  }

  // "events" is the cache tag components/members/events-data.ts's
  // getCachedEvents/getCachedEventBySlug are tagged with. Without this,
  // the new photo wouldn't show on the member-facing pages for up to 60s.
  revalidateTag("events", "minutes");
  revalidatePath("/admin/events");
  return { success: true };
}

// Clears image_url back to null so EventThumbnail falls back to the
// branded placeholder (components/members/ui.tsx). Takes eventId directly
// rather than FormData, since it's called straight from EventPhotoForm.tsx
// once a click resolves to "no file chosen" rather than through a plain
// <form action>. Deliberately doesn't delete the old file from the
// member-media bucket. lib/media-storage.ts has no deletion helper today,
// and an orphaned file only costs storage space, not correctness.
export async function removeEventImage(
  eventId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();

  if (!eventId) {
    return { success: false, error: "Missing event." };
  }

  const adminClient = createAdminSupabaseClient();
  const { error } = await adminClient
    .from("events")
    .update({ image_url: null, image_focal_x: 50, image_focal_y: 50 })
    .eq("id", eventId);

  if (error) {
    console.error(`removeEventImage failed for event ${eventId}:`, error);
    return { success: false, error: "Something went wrong removing that photo." };
  }

  revalidateTag("events", "minutes");
  revalidatePath("/admin/events");
  return { success: true };
}
