"use client";

// Events: what's on, run by the club, at cost. A pure component of props
// (the page does the auth and the data), so the preview harness renders it
// in the real shell. Built from the kit; measurements and copy are the
// approved design's (v3 pages_events.py).
//
//   phones      title, "Your plans" (the next booked events), What's on
//               (filter chips, month sections), then the Open Invite band
//   computers   the same, with "Your plans" as a card in the right rail
//
// The Open Invite band, and every link to Open Invite, is drawn only when
// `openInvite` is on (flags.openInvite: the route is hidden until it is). The
// page reads well without it: it simply ends after the last month.

import { useMemo, useState } from "react";

import {
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  Main,
  Pill,
  SectionHead,
  SectionTitle,
  TitleBlock,
  TrainerDrawing,
} from "@/components/members/kit";
import { countLabel, groupByMonth } from "@/lib/members/event-dates";
import { openInviteHref, ROUTES } from "@/lib/members/routes";
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

/**
 * The Open Invite shown on the band's card: the next one, or a good one. It
 * comes from the Open Invite backend, which does not exist yet, so the page
 * passes none today and the band is drawn without the card. Example data
 * exists only in the preview harness.
 */
export type EventsInviteTeaser = {
  id: string;
  title: string;
  /** "Sat 24 Oct, 10:00" */
  when: string;
  /** "Psycle, Oxford Circus" */
  where: string;
  /** First name of the host. */
  postedBy: string;
};

export type EventsViewProps = {
  /** Upcoming events, soonest first (getCachedEvents: past events are already hidden). */
  events: Event[];
  /** Every event the member has a confirmed booking for (upcoming or past). */
  bookedEventIds: string[];
  /** Upcoming events with no spots left. */
  fullEventIds?: string[];
  /** flags.openInvite. Off: no band, no link to Open Invite. */
  openInvite?: boolean;
  /** The Open Invite on the band's card. None: the band has no card. */
  inviteTeaser?: EventsInviteTeaser | null;
  /** Preview harness only: start with a filter on. */
  initialFilter?: EventsFilter;
};

function Where({ text }: { text: string }) {
  const parts = text.split(", ");
  return (
    <>
      {parts.map((part, index) => (
        <span key={part} className="mk-nb">
          {index < parts.length - 1 ? `${part},` : part}{" "}
        </span>
      ))}
    </>
  );
}

function InviteBand({ teaser }: { teaser: EventsInviteTeaser | null }) {
  return (
    <section className="mk-band ev-band" aria-label="Open Invite">
      <div className="mk-wrap">
        <div className="mk-inner mk-band-grid">
          <div className="mk-band-words">
            <h2 className="mk-display-serif">Open Invite</h2>
            <p className="mk-lead">
              Fancy company for something that isn’t on the list? Post your own plan and see who’s in.
            </p>
            <div className="mk-band-actions">
              <Button href={ROUTES.openInvite} blockPhone>
                See Open Invites
              </Button>
            </div>
          </div>
          {teaser ? (
            <div className="mk-band-card">
              <div className="mk-invite-wrap">
                <TrainerDrawing />
                <figure className="mk-invite" aria-label={`Open Invite: ${teaser.title}`}>
                  <Pill kind="ink">Open Invite</Pill>
                  <h3>{teaser.title}</h3>
                  <dl>
                    <dt>When</dt>
                    <dd>{teaser.when}</dd>
                    <dt>Where</dt>
                    <dd>
                      <Where text={teaser.where} />
                    </dd>
                    <dt>Posted by</dt>
                    <dd>{teaser.postedBy}</dd>
                  </dl>
                  <Button href={openInviteHref(teaser.id)} size="sm">
                    I’m in
                  </Button>
                </figure>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function EventsView({
  events,
  bookedEventIds,
  fullEventIds = [],
  openInvite = false,
  inviteTeaser = null,
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
      {openInvite ? <InviteBand teaser={inviteTeaser} /> : null}
    </Main>
  );
}
