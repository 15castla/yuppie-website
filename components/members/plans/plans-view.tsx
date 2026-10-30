"use client";

// Your plans: everything the member is in for, in one list. A sub page of
// Events ("All plans"): a back row, the title, Upcoming | Past, filter chips,
// month sections with rows, and on a computer a card on the right. A pure
// component of props (the page does the auth and the data).
//
// Club events and Open Invites (both real data: the bookings, and the plans the
// member hosts or is going to) share one row type. Open Invite rows, the
// "Open Invites" chip and the card that posts one appear only when
// `openInvite` is on (Open Invite on in this shell: in the app it also needs
// its own switch); until then the page is club events only, with no chips
// (one kind needs no filter).
//
// Built from the kit; measurements and copy are the approved design's
// (v3 pages_plans.py).

import { useMemo, useState } from "react";

import {
  BackLink,
  BackRow,
  Button,
  Card,
  Chip,
  ChipRow,
  Main,
  PerkDrawing,
  Pill,
  Row,
  Rows,
  SectionHead,
  Segmented,
  TitleBlock,
} from "@/components/members/kit";
import { countLabel, groupByMonth, rowDate, timeAndPlace } from "@/lib/members/event-dates";
import type { Plan, PlansFilter, PlansWhen } from "@/lib/members/plans/types";
import { ROUTES } from "@/lib/members/routes";
import "./plans.css";

export type PlansViewProps = {
  /** Already in order: soonest first for Upcoming, newest first for Past. */
  plans: Plan[];
  when: PlansWhen;
  /** flags.openInvite. Off: club events only, no chips, no card, no link to Open Invite. */
  openInvite?: boolean;
  /** Preview harness only: start with a chip on. */
  initialFilter?: PlansFilter;
};

const FILTERS: { key: PlansFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "club-event", label: "Club events" },
  { key: "open-invite", label: "Open Invites" },
];

function PlanPill({ plan }: { plan: Plan }) {
  switch (plan.pill) {
    case "booked":
      return <Pill kind="ink">Booked</Pill>;
    case "included":
      return <Pill>Included</Pill>;
    case "youre-in":
      return <Pill>You’re in</Pill>;
    case "yours":
      return <Pill kind="ink">Yours</Pill>;
    case "went":
      return <Pill kind="muted">Went</Pill>;
    case "finished":
      return <Pill kind="muted">Finished</Pill>;
  }
}

function PlanRow({ plan, past }: { plan: Plan; past: boolean }) {
  const meta = timeAndPlace(plan.startsAt, plan.place);
  const note = plan.kind === "open-invite" ? plan.note : null;
  return (
    <Row
      href={plan.href}
      date={rowDate(plan.startsAt)}
      title={plan.title}
      meta={
        note ? (
          <>
            {meta}
            <br />
            {note}
          </>
        ) : (
          meta
        )
      }
      end={<PlanPill plan={plan} />}
      className={past ? "pl-past" : undefined}
    />
  );
}

export function PlansView({ plans, when, openInvite = false, initialFilter = "all" }: PlansViewProps) {
  const [filter, setFilter] = useState<PlansFilter>(initialFilter);
  const past = when === "past";

  // Until Open Invite is on, the page is club events only.
  const available = useMemo(
    () => (openInvite ? plans : plans.filter((plan) => plan.kind === "club-event")),
    [plans, openInvite],
  );
  const shown = useMemo(
    () =>
      openInvite && filter !== "all" ? available.filter((plan) => plan.kind === filter) : available,
    [available, filter, openInvite],
  );
  const months = useMemo(() => groupByMonth(shown, (plan) => plan.startsAt), [shown]);

  const tools = (
    <div className="pl-tools">
      <Segmented
        label="Plans"
        items={[
          { label: "Upcoming", href: ROUTES.plans, current: !past },
          { label: "Past", href: `${ROUTES.plans}?when=past`, current: past },
        ]}
      />
      {openInvite ? (
        <ChipRow label="Filter plans">
          {FILTERS.map((item) => (
            <Chip key={item.key} active={filter === item.key} onClick={() => setFilter(item.key)}>
              {item.label}
            </Chip>
          ))}
        </ChipRow>
      ) : null}
    </div>
  );

  let content;
  if (available.length === 0) {
    // Nothing at all: the coupes standing on a 3px rule, then the way forward.
    content = (
      <>
        <div className="pl-stand-wrap">
          <div className="pl-stand">
            <div className="pl-stand-txt">
              <h2 className="mk-h2">{past ? "No past plans yet." : "Nothing planned yet."}</h2>
              <p>
                {past
                  ? "Plans you’ve been to will show up here."
                  : openInvite
                    ? "Book an event, or say you’re in on an Open Invite."
                    : "Book an event and it will show up here."}
              </p>
            </div>
            <span className="mk-art">
              <PerkDrawing name="coupes" />
            </span>
          </div>
        </div>
        <div className="pl-stand-acts">
          <Button href={ROUTES.events} blockPhone>
            See events
          </Button>
          {openInvite ? (
            <Button variant="quiet" href={ROUTES.openInvite}>
              See Open Invites
            </Button>
          ) : null}
        </div>
      </>
    );
  } else if (shown.length === 0) {
    content = (
      <div className="pl-list">
        <div className="pl-miss" role="status">
          <p>Nothing matches that filter.</p>
          <Button variant="quiet" onClick={() => setFilter("all")}>
            Show all plans
          </Button>
        </div>
      </div>
    );
  } else {
    content = (
      <div className="pl-list">
        {months.map((month, index) => (
          <section key={month.key} className={index === 0 ? undefined : "mk-mt-section"}>
            <SectionHead title={month.label} meta={countLabel(month.items.length, "plan", "plans")} />
            <Rows>
              {month.items.map((plan) => (
                <PlanRow key={`${plan.kind}-${plan.id}`} plan={plan} past={past} />
              ))}
            </Rows>
          </section>
        ))}
      </div>
    );
  }

  return (
    <Main className="pl-page">
      <BackRow href={ROUTES.events} label="Events" />
      <div className="mk-wrap pl-crumb">
        <div>
          <BackLink href={ROUTES.events} label="Events" />
        </div>
      </div>
      <TitleBlock title="Your plans." sub="What you’re in for." actions={null} />
      <div className="mk-wrap">
        <div className="mk-cols">
          <div>
            {tools}
            {content}
          </div>
          {openInvite ? (
            <aside className="mk-rail mk-show-desk pl-rail" aria-label="Open Invite">
              <Card>
                <div className="pl-postcard">
                  <span className="mk-term">Open Invite</span>
                  <h2>Want company for something?</h2>
                  <p>Post a plan and see who’s in.</p>
                  <Button href={ROUTES.openInviteNew} size="sm">
                    Post an Open Invite
                  </Button>
                </div>
              </Card>
            </aside>
          ) : null}
        </div>
      </div>
    </Main>
  );
}
