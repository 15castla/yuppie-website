import Link from "next/link";

import { cn } from "@/lib/utils";
import type { Event } from "./event-types";
import {
  CARD_CLASS,
  EventThumbnail,
  eventFocalPoint,
  PricePill,
  formatDayNumber,
  formatEventTime,
  formatWeekdayShort,
} from "./ui";

// The compact event row shared by the events list (/members/events, one
// card per month, with thumbnails) and the members home screen ("Your
// upcoming plans" and "Picked for you", without). Each row links to the
// event's page.

// A row's small thumbnail. Still a 16:9 crop (88x50), so the focal point
// set at /admin/events carries over. With no photo, EventThumbnail's brand
// gradient. The faint ring keeps the gradient's pale corner from
// dissolving into the card; it's an overlay rather than an inset
// box-shadow on the wrapper, which would paint under the photo/gradient
// and never be seen.
function EventRowThumbnail({ event }: { event: Event }) {
  return (
    <div className="relative h-[50px] w-[88px] shrink-0 overflow-hidden rounded-[10px]">
      <EventThumbnail
        category={event.category}
        imageUrl={event.image_url}
        focalPoint={eventFocalPoint(event)}
        showCategoryBadge={false}
        sizes="88px"
        className="h-full w-full"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[10px] shadow-[inset_0_0_0_1px_rgba(27,21,18,0.06)]"
      />
    </div>
  );
}

function EventRow({
  event,
  booked,
  showThumbnail,
}: {
  event: Event;
  booked: boolean;
  showThumbnail: boolean;
}) {
  const pill = <PricePill pricePence={event.price_pence} booked={booked} />;

  return (
    <Link
      href={`/members/events/${event.slug}`}
      className="flex items-center gap-3.5 py-3.5 pl-3 pr-3.5 transition-colors hover:bg-foreground/[0.03]"
    >
      <div className="flex w-10 shrink-0 flex-col items-center gap-[3px]">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-foreground-muted">
          {formatWeekdayShort(event.start_time)}
        </span>
        <span className="text-[22px] font-extrabold leading-none text-foreground">
          {formatDayNumber(event.start_time)}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <p className="text-[15px] font-bold leading-tight text-foreground">{event.title}</p>
        <p className="truncate text-xs text-foreground-muted">
          {formatEventTime(event.start_time)}
          {event.location ? ` · ${event.location}` : ""}
        </p>
        {/* With thumbnails the pill sits under the meta line; without, it
            moves to the right of the row (below). */}
        {showThumbnail && <div className="mt-1 self-start">{pill}</div>}
      </div>

      {showThumbnail ? <EventRowThumbnail event={event} /> : pill}
    </Link>
  );
}

// One card of rows, with dividers inset to start after the date column
// (like an iOS inset list) and none above the first row.
export function EventRowList({
  events,
  bookedEventIds,
  showThumbnails,
}: {
  events: Event[];
  bookedEventIds: ReadonlySet<string>;
  showThumbnails: boolean;
}) {
  return (
    <div className={cn(CARD_CLASS, "overflow-hidden")}>
      {events.map((event, index) => (
        <div key={event.id}>
          {index > 0 && <div aria-hidden className="ml-[66px] h-px bg-foreground/[0.08]" />}
          <EventRow
            event={event}
            booked={bookedEventIds.has(event.id)}
            showThumbnail={showThumbnails}
          />
        </div>
      ))}
    </div>
  );
}
