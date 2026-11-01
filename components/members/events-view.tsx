"use client";

// Events: what's on, run by the club, at cost. A pure component of props
// (the page does the auth and the data), so the preview harness renders it
// in the real shell. Built from the kit; measurements and copy are the
// approved design's (v3 pages_events.py).
//
//   phones      title, "Your plans" (the next booked events), What's on
//               (filter chips, month sections)
//   computers   the same, with "Your plans" as a card in the right rail
//
// The page ends after the last month. The Open Invite band that used to close
// it was taken off on 1 Nov 2026 (Albert: "Pls remove Open Invite from the
// bottom of events"); Open Invite stays one tap away in the tab bar. The empty
// state's "See Open Invites" link is drawn only when `openInvite` is on.

import { useMemo, useState } from "react";

import {
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Main,
  SectionHead,
  SectionTitle,
  TitleBlock,
} from "@/components/members/kit";
import { countLabel, groupByMonth } from "@/lib/members/event-dates";
import { ROUTES } from "@/lib/members/routes";
import { EventRowList } from "./event-row";
import type { Event, EventCategory } from "./event-types";
import "./events-view.css";

export type EventsFilter = "all" | "week" | "included" | EventCategory;

const FILTERS: { key: EventsFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "week", label: "This week" },
  { key: "included", label: "Included" },
  { key: "sport", label: "Sport" },
  { key: "entertainment", label: "Entertainment" },
  { key: "personal_progression", label: "Personal progression" },
];

// How many booked events the "Your plans" block shows. The full list is one
// tap away ("All plans").
const PLANS_SHOWN = 2;

function matchesFilter(event: Event, filter: EventsFilter) {
  switch (filter) {
    case "all":
      return true;
    case "week": {
      const daysAway = (new Date(event.start_time).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return daysAway >= 0 && daysAway <= 7;
    }
    case "included":
      return !event.price_pence;
    default:
      return event.category === filter;
  }
}

export type EventsViewProps = {
  /** Upcoming events, soonest first (getCachedEvents: past events are already hidden). */
  events: Event[];
  /** Every event the member has a confirmed booking for (upcoming or past). */
  bookedEventIds: string[];
  /** Upcoming events with no spots left. */
  fullEventIds?: string[];
  /** flags.openInvite (and, in the app, its own switch). Off: no link to Open Invite. */
  openInvite?: boolean;
  /** Preview harness only: start with a filter on. */
  initialFilter?: EventsFilter;
};


export function EventsView({
  events,
  bookedEventIds,
  fullEventIds = [],
  openInvite = false,
  initialFilter = "all",
}: EventsViewProps) {
  const booked = useMemo(() => new Set(bookedEventIds), [bookedEventIds]);
  const full = useMemo(() => new Set(fullEventIds), [fullEventIds]);
  const [filter, setFilter] = useState<EventsFilter>(initialFilter);

  const sorted = useMemo(
    () =>
      [...events].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      ),
    [events],
  );
  const shown = useMemo(() => sorted.filter((event) => matchesFilter(event, filter)), [sorted, filter]);
  const months = useMemo(() => groupByMonth(shown, (event) => event.start_time), [shown]);

  // "Your plans": the member's next booked events. The block is there when
  // they have any booking at all (so "All plans" and the past are always one
  // tap away); with none coming up it says so in one line.
  const nextPlans = useMemo(
    () => sorted.filter((event) => booked.has(event.id)).slice(0, PLANS_SHOWN),
    [sorted, booked],
  );
  const hasPlans = bookedEventIds.length > 0;

  const plansBlock = (
    <>
      <SectionTitle title="Your plans" linkLabel="All plans" linkHref={ROUTES.plans} />
      {nextPlans.length > 0 ? (
        <EventRowList events={nextPlans} bookedEventIds={booked} />
      ) : (
        <p className="ev-quiet">Nothing coming up.</p>
      )}
    </>
  );

  const filterLabel = FILTERS.find((item) => item.key === filter)?.label ?? "";

  // Nothing on at all: the kit's empty state, down to the tab bar.
  if (events.length === 0) {
    return (
      <Main fill pad={false}>
        <TitleBlock title="Events." sub="Run by us, at cost." />
        <div style={{ height: 28 }} aria-hidden="true" />
        <EmptyState
          label="No events yet"
          title="Nothing on"
          accent="yet."
          lead="We’re lining up the next events. They’ll show up here."
          drawing="coupes"
          action={
            openInvite ? (
              <Button href={ROUTES.openInvite} blockPhone>
                See Open Invites
              </Button>
            ) : undefined
          }
          secondary={
            hasPlans ? (
              <Button variant="quiet" href={ROUTES.plans}>
                See your plans
              </Button>
            ) : undefined
          }
        />
      </Main>
    );
  }

  return (
    <Main className="ev-page">
      <TitleBlock title="Events." sub="Run by us, at cost." />
      <div className="mk-wrap">
        <div className="mk-cols">
          <div>
            {hasPlans ? (
              <section className="mk-section mk-first mk-show-phone" aria-label="Your plans">
                {plansBlock}
              </section>
            ) : null}
            <section className={hasPlans ? "mk-section" : "mk-section mk-first"}>
              <SectionTitle title="What’s on" />
              <div className="ev-chips">
                <ChipRow label="Filter events">
                  {FILTERS.map((item) => (
                    <Chip
                      key={item.key}
                      active={filter === item.key}
                      onClick={() => setFilter(item.key)}
                    >
                      {item.label}
                    </Chip>
                  ))}
                </ChipRow>
              </div>
              <p className="mk-sr" role="status">
                {filter === "all" ? "" : `${filterLabel}: ${countLabel(shown.length, "event", "events")}`}
              </p>
              {shown.length === 0 ? (
                <div className="ev-miss">
                  <p>Nothing matches that filter yet.</p>
                  <Button variant="quiet" onClick={() => setFilter("all")}>
                    Show all events
                  </Button>
                </div>
              ) : (
                months.map((month, index) => (
                  <section key={month.key} className={index === 0 ? undefined : "mk-mt-section"}>
                    <SectionHead
                      title={month.label}
                      meta={countLabel(month.items.length, "event", "events")}
                    />
                    <EventRowList
                      events={month.items}
                      bookedEventIds={booked}
                      fullEventIds={full}
                    />
                  </section>
                ))
              )}
            </section>
          </div>
          {hasPlans ? (
            <aside className="mk-rail mk-show-desk" aria-label="Your plans">
              <Card className="mk-plans-card">{plansBlock}</Card>
            </aside>
          ) : null}
        </div>
      </div>
    </Main>
  );
}
