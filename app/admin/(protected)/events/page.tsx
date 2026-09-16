import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { EVENT_COLUMNS, type Event } from "@/components/members/event-types";
import { updateEventImage, updateEventDetails } from "@/app/admin/events-actions";
import {
  CARD_CLASS,
  EventThumbnail,
  PricePill,
  formatEventDayTime,
} from "@/components/members/ui";
import { cn, isoToDateTimeLocal } from "@/lib/utils";
import { NewEventForm } from "./NewEventForm";

const CATEGORY_LABEL: Record<Event["category"], string> = {
  sport: "Sport",
  entertainment: "Entertainment",
  personal_progression: "Personal Progression",
};

const EVENT_TIME_ZONE = "Europe/London";

const inputClasses =
  "w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-foreground/40";
const labelClasses = "text-xs font-semibold uppercase tracking-wider text-foreground/50";

export default async function AdminEventsPage() {
  const adminClient = createAdminSupabaseClient();
  const { data } = await adminClient
    .from("events")
    .select(EVENT_COLUMNS)
    .order("start_time", { ascending: true });

  const events = (data ?? []) as Event[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Events</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Add new events, edit existing ones, and upload photos — the card
          next to each event is exactly what members see, so you can check
          it looks right before it goes live. Start/end times are entered as
          UK local time. Renaming an existing event&apos;s URL slug still
          needs Supabase directly, to avoid breaking a link someone&apos;s
          already been sent.
        </p>
      </div>

      <NewEventForm />

      {events.length === 0 ? (
        <p className="rounded-2xl border border-foreground/10 bg-cream p-8 text-center text-foreground/60">
          No events yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-6">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-col gap-6 rounded-2xl border border-foreground/10 bg-cream p-6 sm:flex-row sm:items-start"
            >
              <div className="flex w-full max-w-[280px] shrink-0 flex-col gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/40">
                  Live preview
                </span>
                <div className={cn(CARD_CLASS, "overflow-hidden")}>
                  <EventThumbnail
                    category={event.category}
                    imageUrl={event.image_url}
                    className="h-32 w-full"
                    iconClassName="h-14 w-14"
                  />
                  <div className="flex flex-col gap-1 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold text-foreground">{event.title}</p>
                      <PricePill pricePence={event.price_pence} />
                    </div>
                    <p className="text-xs text-foreground-muted">
                      {formatEventDayTime(event.start_time)}
                      {event.location ? ` · ${event.location}` : ""}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-foreground/50">
                  Same photo shows larger (no card) on the event&apos;s own page.
                </p>

                <form action={updateEventImage} className="mt-2 flex flex-col gap-2">
                  <input type="hidden" name="event_id" value={event.id} />
                  <input
                    type="file"
                    name="photo"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    required
                    className="text-[10px] text-foreground/70 file:mr-2 file:rounded-full file:border-0 file:bg-foreground file:px-3 file:py-1.5 file:text-[10px] file:font-bold file:text-background"
                  />
                  <button
                    type="submit"
                    className="rounded-full bg-foreground px-4 py-2 text-xs font-bold text-background"
                  >
                    {event.image_url ? "Replace photo" : "Upload photo"}
                  </button>
                </form>
              </div>

              <form
                action={updateEventDetails}
                className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2"
              >
                <input type="hidden" name="event_id" value={event.id} />

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className={labelClasses}>Title</label>
                  <input
                    name="title"
                    type="text"
                    required
                    defaultValue={event.title}
                    className={inputClasses}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelClasses}>Category</label>
                  <select
                    name="category"
                    required
                    defaultValue={event.category}
                    className={inputClasses}
                  >
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
                    name="location"
                    type="text"
                    defaultValue={event.location ?? ""}
                    className={inputClasses}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelClasses}>Start time (UK)</label>
                  <input
                    name="start_time"
                    type="datetime-local"
                    required
                    defaultValue={isoToDateTimeLocal(event.start_time, EVENT_TIME_ZONE)}
                    className={inputClasses}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelClasses}>End time (UK, optional)</label>
                  <input
                    name="end_time"
                    type="datetime-local"
                    defaultValue={
                      event.end_time ? isoToDateTimeLocal(event.end_time, EVENT_TIME_ZONE) : ""
                    }
                    className={inputClasses}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelClasses}>Price per person (£, 0 = included)</label>
                  <input
                    name="price_pounds"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={(event.price_pence / 100).toFixed(2)}
                    className={inputClasses}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelClasses}>Capacity</label>
                  <input
                    name="capacity"
                    type="number"
                    min="0"
                    step="1"
                    required
                    defaultValue={event.capacity}
                    className={inputClasses}
                  />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className={labelClasses}>Description</label>
                  <textarea
                    name="description"
                    rows={3}
                    defaultValue={event.description ?? ""}
                    className={inputClasses}
                  />
                </div>

                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    className="rounded-full bg-foreground px-5 py-2 text-sm font-bold text-background"
                  >
                    Save changes
                  </button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
