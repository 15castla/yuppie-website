// The event page's blocks as pure views (r2a sections 1, 2 and 4): the hero (pills, title, a note, the facts,
// the drawing on the rule), the computer's booking card on the right, the cream band, the phone's booking card
// and the fixed price and booking bar. Kit counterparts: pages_r2a ev_hero(), ev_card(), ev_band(),
// booking_card(), ev_bar(). The page view (event-page-view.tsx) decides which state each one is in.

import type { ReactNode, Ref } from "react";

import { Button, Icon, Pill, type IconName } from "@/components/members/kit";
import { ROUTES } from "@/lib/members/routes";
import { cn } from "@/lib/utils";
import { EvIcon } from "./ev-icons";
import { EventArt, artFor } from "./event-art";
import { AddressTile } from "./sheet-parts";
import {
  CATEGORY_WORDS,
  endsLine,
  gbp,
  mapsUrl,
  splitMessage,
  splitTitle,
  whenLine,
  whatsIncluded,
  type EventPageBooking,
  type EventPageEvent,
} from "./model";

/** What the bar and the computer card show. */
export type BarState = "open" | "booking" | "processing" | "booked" | "full" | "past" | "cancelled";

// ---------------------------------------------------------------------------- the title

export function EventTitle({ title }: { title: string }) {
  const { normal, accent, block } = splitTitle(title);
  return (
    <h1 className="ea-h1">
      {normal}
      {normal ? " " : null}
      <span className={cn("mk-serif", block && "ea-block")}>{accent}</span>
    </h1>
  );
}

// ---------------------------------------------------------------------------- a note in the hero

export function HeroNote({ icon, children }: { icon: IconName | "calendar-x"; children: ReactNode }) {
  return (
    <div className="ea-note">
      {icon === "calendar-x" ? <EvIcon name="calendar-x" size={20} /> : <Icon name={icon} size={20} />}
      <div>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------- the hero

export function EventHero({
  event,
  pill,
  note,
  spots,
  booked,
  card,
}: {
  event: EventPageEvent;
  /** The second pill: the price, Included, Booked, Fully booked, Past event, Cancelled. */
  pill: ReactNode;
  note?: ReactNode;
  /** "6 of 20 left", "None left", "52 booked"; null hides the row (a cancelled event). */
  spots: { text: string; bad?: boolean } | null;
  /** Booked: the exact address is on the booking card, so the place has no "sent after booking" line. */
  booked: boolean;
  /** The computer's card on the right. */
  card: ReactNode;
}) {
  const photo = event.imageUrl;
  const art = artFor(event.category);
  const ends = endsLine(event);
  const photoEl = photo ? (
    <div className="ea-photo">
      {/* eslint-disable-next-line @next/next/no-img-element -- event photos live in Supabase storage, as member photos do */}
      <img src={photo} alt="" style={{ objectPosition: `${event.focalX ?? 50}% ${event.focalY ?? 50}%` }} />
    </div>
  ) : null;
  return (
    <>
      {photoEl ? <div className="ea-photo-phone">{photoEl}</div> : null}
      <section className={cn("ea-hero", photo && "ea-has-photo")} aria-label="Event">
        <div className="mk-wrap ea-hero-in">
          <a className="ea-crumb" href={ROUTES.events}>
            <Icon name="chevron-left" size={22} />
            Events
          </a>
          <div className="ea-hero-grid">
            <div className="ea-hero-main">
              <div className="ea-pills">
                <Pill>{CATEGORY_WORDS[event.category] ?? "Event"}</Pill>
                {pill}
              </div>
              <EventTitle title={event.title} />
              {note}
              <div className="ea-factsrow">
                <dl className="ea-facts">
                  <dt>When</dt>
                  <dd>
                    {whenLine(event.startTime)}
                    {ends ? <span className="ea-sub">{ends}</span> : null}
                  </dd>
                  <dt>Where</dt>
                  <dd>
                    {event.location?.trim() || "To be confirmed"}
                    {booked ? null : <span className="ea-sub">Exact address sent after booking</span>}
                  </dd>
                  {spots ? (
                    <>
                      <dt>Spots</dt>
                      <dd>
                        <span className={spots.bad ? "ea-bad" : undefined}>{spots.text}</span>
                      </dd>
                    </>
                  ) : null}
                </dl>
                {photo ? null : (
                  <div className="ea-art" aria-hidden="true">
                    <EventArt name={art} width={96} line={1.68} />
                  </div>
                )}
              </div>
            </div>
            <div className="ea-hero-side">
              {photoEl}
              <div className="ea-card">
                {photo ? null : (
                  <div className="ea-card-art" aria-hidden="true">
                    <EventArt name={art} width={152} line={2.5} />
                  </div>
                )}
                {card}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------- the message strip

export function ServerMessage({ message, className, silent = false }: { message: string; className: string; silent?: boolean }) {
  const { lead, rest } = splitMessage(message);
  return (
    <div className={className} role={silent ? undefined : "alert"}>
      <Icon name="circle-alert" size={18} />
      <span>
        <b>{lead}</b>
        {rest ? ` ${rest}` : null}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------- the computer's card

export function DesktopCard({
  state,
  event,
  booking,
  message,
  cancelFine,
  startedLine,
  showGoogle,
  onBook,
  onCancel,
  canCancel,
}: {
  state: BarState;
  event: EventPageEvent;
  booking: EventPageBooking | null;
  message: string | null;
  /** The small print under the card ("Cancel until…", "Free until… Your £25 goes back to your card."). */
  cancelFine: string;
  /** "It started Thu 22 Oct, 19:00". */
  startedLine: string;
  showGoogle: boolean;
  onBook: () => void;
  onCancel: () => void;
  canCancel: boolean;
}) {
  const paid = event.pricePence > 0;
  const msg = message ? <ServerMessage message={message} className="ea-msg-desk" /> : null;

  if (state === "open" || state === "booking") {
    return (
      <>
        <div className="ea-big">{paid ? `${gbp(event.pricePence)}pp` : "Included"}</div>
        <div className="ea-sub">{paid ? "Charged on booking" : "In your membership"}</div>
        {msg}
        <div className="ea-act">
          <Button pending={state === "booking"} onClick={state === "booking" ? undefined : onBook}>
            {state === "booking" ? "Booking…" : "Book my spot"}
          </Button>
        </div>
        <p className="ea-fine">{cancelFine}</p>
      </>
    );
  }
  if (state === "processing") {
    return (
      <>
        <div className="ea-big">{gbp(event.pricePence)}pp</div>
        <div className="ea-sub">Payment processing</div>
        {msg}
        <div className="ea-act">
          <Button pending>Processing…</Button>
        </div>
        <p className="ea-fine">We’ll email you when your booking is confirmed.</p>
      </>
    );
  }
  if (state === "booked" && booking) {
    return (
      <>
        <div className="ea-big">You’re booked</div>
        <div className="ea-sub">{whenLine(event.startTime)}</div>
        <AddressTile place={event.location} address={booking.address} />
        <div className="ea-act">
          <a className="mk-btn" href={booking.icsUrl} download>
            <EvIcon name="calendar-plus" size={20} />
            Add to calendar
          </a>
          {booking.address ? (
            <a className="mk-btn mk-secondary" href={mapsUrl(event.location, booking.address)} target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={20} />
              Open in Maps
            </a>
          ) : null}
          {showGoogle && booking.googleUrl ? (
            <a className="ea-gcal" href={booking.googleUrl} target="_blank" rel="noopener noreferrer">
              Or add it to Google Calendar
            </a>
          ) : null}
        </div>
        <hr />
        {canCancel ? (
          <div className="ea-links">
            <button type="button" className="mk-link mk-danger" onClick={onCancel}>
              <EvIcon name="calendar-x" size={18} />
              Cancel booking
            </button>
          </div>
        ) : null}
        <p className="ea-fine">{cancelFine}</p>
      </>
    );
  }
  const ends: Record<string, [string, string]> = {
    full: ["Fully booked", "No spots left"],
    past: ["Past event", startedLine],
    cancelled: ["Cancelled", "Not going ahead"],
  };
  const [big, sub] = ends[state] ?? ends.full;
  return (
    <>
      <div className="ea-big">{big}</div>
      <div className="ea-sub">{sub}</div>
      <div className="ea-act">
        <Button href={ROUTES.events}>See other events</Button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------- the band

export function EventBand({
  event,
  bookingCard,
  moneyLines,
}: {
  event: EventPageEvent;
  /** Booked, phone: the booking card is the first block under the facts. */
  bookingCard?: ReactNode;
  /** Bookable, phone: what happens to your money. */
  moneyLines?: { icon: IconName; text: string }[] | null;
}) {
  return (
    <section className="ea-band" aria-label="Details">
      <div className="mk-wrap">
        <div className="ea-band-grid">
          {bookingCard ? <div className="mk-show-phone">{bookingCard}</div> : null}
          <div className="ea-col-a">{event.description?.trim() ? <p className="ea-p">{event.description.trim()}</p> : null}</div>
          <div className="ea-col-b">
            <div className="mk-tile ea-incl">
              <h2>What’s included</h2>
              <p>{whatsIncluded(event.title)}</p>
            </div>
            {moneyLines?.length ? (
              <ul className="ea-money mk-show-phone">
                {moneyLines.map((line) => (
                  <li key={line.text}>
                    <Icon name={line.icon} size={20} />
                    <span>{line.text}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------- the phone's booking card

export function BookingCard({
  event,
  booking,
  memberEmail,
  started,
  cancelFine,
  canCancel,
  showGoogle,
  onCancel,
  cardRef,
}: {
  event: EventPageEvent;
  booking: EventPageBooking;
  memberEmail: string;
  started: boolean;
  cancelFine: string;
  canCancel: boolean;
  showGoogle: boolean;
  onCancel: () => void;
  cardRef?: Ref<HTMLDivElement>;
}) {
  const paid = booking.amountPence > 0;
  const place = event.location?.trim() || "The venue";
  const row = (icon: ReactNode, title: string, meta: string, end?: ReactNode) => (
    <>
      <span className="mk-icon-tile">{icon}</span>
      <span className="mk-body">
        <span className="mk-title">{title}</span>
        <span className="mk-meta">{meta}</span>
      </span>
      {end ? <span className="mk-end">{end}</span> : null}
    </>
  );
  return (
    <div className="mk-card ea-book" id="your-booking" ref={cardRef} tabIndex={-1} aria-labelledby="ea-book-h">
      <div className="ea-book-top">
        <span className="mk-term">Your booking</span>
        <Pill kind="ink">Booked</Pill>
      </div>
      <h2 className="ea-book-h" id="ea-book-h">
        You’re booked.
      </h2>
      <p className="ea-book-p">
        {whenLine(event.startTime)}.{started ? "" : " We’ll remind you 24 hours and 2 hours before."}
      </p>
      <div className="mk-rows">
        {booking.address ? (
          <a className="mk-row" href={mapsUrl(event.location, booking.address)} target="_blank" rel="noopener noreferrer">
            {row(<Icon name="map-pin" size={22} />, place, booking.address, <Icon name="external" size={20} />)}
          </a>
        ) : (
          <div className="mk-row ea-plain">{row(<Icon name="map-pin" size={22} />, place, "We’ll email you the exact address before the day.")}</div>
        )}
        <a className="mk-row" href={booking.icsUrl} download>
          {row(<EvIcon name="calendar-plus" size={22} />, "Add to calendar", showGoogle ? "Apple or Outlook" : "Opens your calendar", <Icon name="chevron-right" size={22} />)}
        </a>
        {showGoogle && booking.googleUrl ? (
          <a className="mk-row" href={booking.googleUrl} target="_blank" rel="noopener noreferrer">
            {row(<Icon name="calendar" size={22} />, "Google Calendar", "Adds it to your Google account", <Icon name="external" size={20} />)}
          </a>
        ) : null}
        {paid ? <div className="mk-row ea-plain">{row(<Icon name="receipt" size={22} />, "Receipt", `${gbp(booking.amountPence)} paid. Sent to ${memberEmail}`)}</div> : null}
      </div>
      <div className="ea-book-foot">
        {canCancel ? (
          <button type="button" className="mk-link mk-danger" onClick={onCancel}>
            <EvIcon name="calendar-x" size={18} />
            Cancel booking
          </button>
        ) : null}
        <span className="mk-small">{cancelFine}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- the fixed bar (phone)

export function EventBar({
  state,
  event,
  booking,
  message,
  onBook,
  onSeeBooking,
}: {
  state: BarState;
  event: EventPageEvent;
  booking: EventPageBooking | null;
  message: string | null;
  onBook: () => void;
  onSeeBooking: () => void;
}) {
  const paid = event.pricePence > 0;
  let left: [string, string];
  let button: ReactNode;
  switch (state) {
    case "open":
    case "booking":
      left = paid ? [`${gbp(event.pricePence)}pp`, "Charged on booking"] : ["Included", "In your membership"];
      button =
        state === "booking" ? (
          <Button pending>Booking…</Button>
        ) : (
          <Button onClick={onBook}>Book my spot</Button>
        );
      break;
    case "processing":
      left = ["Processing", "We’ll confirm by email"];
      button = <Button pending>Processing…</Button>;
      break;
    case "booked":
      left = ["You’re booked", booking && booking.amountPence > 0 ? `${gbp(booking.amountPence)} paid` : "Included"];
      button = <Button onClick={onSeeBooking}>See booking</Button>;
      break;
    case "full":
      left = ["Fully booked", "No spots left"];
      button = (
        <Button variant="outline" href={ROUTES.events}>
          See other events
        </Button>
      );
      break;
    case "past":
      left = ["Past event", "It has started"];
      button = (
        <Button variant="outline" href={ROUTES.events}>
          See other events
        </Button>
      );
      break;
    case "cancelled":
      left = ["Cancelled", "Not going ahead"];
      button = (
        <Button variant="outline" href={ROUTES.events}>
          See other events
        </Button>
      );
      break;
  }
  const strip = message ? <ServerMessage message={message} className="ea-msg" /> : null;
  return (
    <>
      {/* In flow, invisible: exactly the bar's height (with the strip), so the band never ends under it. */}
      <div className="ea-spacer mk-show-phone" aria-hidden="true">
        {message ? <ServerMessage message={message} className="ea-msg" silent /> : null}
        <div className="ea-bar-h" />
      </div>
      <div className="mk-dock ea-bar-wrap" data-needs-device-check="true">
        {strip}
        <div className="mk-tabbar ea-bar" role="region" aria-label="Booking">
          <div className="ea-pr">
            <b>{left[0]}</b>
            <span>{left[1]}</span>
          </div>
          {button}
        </div>
      </div>
    </>
  );
}
