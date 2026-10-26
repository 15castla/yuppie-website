// The Events list's row, on the kit: the 44px date column, the title, one
// muted line (24-hour time and place), and the pill at the end. A whole-row
// link to the event's page. Used by the "What's on" months and by the "Your
// plans" block on the Events page.
//
// The pill is the real booking state, in this order:
//   Booked        the member has a confirmed booking (ink, wins over everything)
//   Fully booked  no spots left and the member is not in (muted outline)
//   £25pp         a paid event (outline)
//   Included      a free event, part of the membership (outline)
// Kit counterpart: k2.ev_row and k2.ev_pill.

import { Pill, Row, Rows } from "@/components/members/kit";
import { rowDate, timeAndPlace } from "@/lib/members/event-dates";
import { eventHref } from "@/lib/members/routes";
import type { Event } from "./event-types";
import { formatEventPrice } from "./ui";

export function EventPill({
  event,
  booked,
  full = false,
}: {
  event: Pick<Event, "price_pence">;
  booked: boolean;
  full?: boolean;
}) {
  if (booked) return <Pill kind="ink">Booked</Pill>;
  if (full) return <Pill kind="muted">Fully booked</Pill>;
  if (event.price_pence) return <Pill>{formatEventPrice(event.price_pence)}</Pill>;
  return <Pill>Included</Pill>;
}

export function EventRow({
  event,
  booked,
  full = false,
}: {
  event: Event;
  booked: boolean;
  full?: boolean;
}) {
  return (
    <Row
      href={eventHref(event.slug)}
      date={rowDate(event.start_time)}
      title={event.title}
      meta={timeAndPlace(event.start_time, event.location)}
      end={<EventPill event={event} booked={booked} full={full} />}
    />
  );
}

// A ruled list of rows. `bookedEventIds` and `fullEventIds` are the member's
// own confirmed bookings and the events with no spots left.
export function EventRowList({
  events,
  bookedEventIds,
  fullEventIds,
}: {
  events: Event[];
  bookedEventIds: ReadonlySet<string>;
  fullEventIds?: ReadonlySet<string>;
}) {
  return (
    <Rows>
      {events.map((event) => (
        <EventRow
          key={event.id}
          event={event}
          booked={bookedEventIds.has(event.id)}
          full={fullEventIds?.has(event.id) ?? false}
        />
      ))}
    </Rows>
  );
}
