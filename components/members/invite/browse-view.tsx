"use client";

// Open Invite > Browse. Kit counterpart: pages_oi.browse_main() and
// empty_main(). Title, the Browse | Yours switch, the "Got a plan?" row, the
// filter chips, then a cream band of plan cards between two 3px ink rules and
// the closing "Post your own" band. A pure view of OpenInviteFeed: the
// preview harness renders it without a login or a database.
//
// States: the list, "no invites yet" (steps and the trainer), a filter with no
// matches ("Show all invites"), loading (OpenInviteLoading) and an error
// (OpenInviteError). A plan with a cost is dropped from the feed while the
// paid plans flag is off, so the page never shows a price before the money
// side exists (the server sends none in stage 2 either). "I'm in" is a server
// action under the plan's row lock (use-moments.tsx).
//
// Browse shows only plans the member can still join (Albert, 8 Nov 2026: "once
// an event is full it won't show on the browse screen and only in peoples
// yours ... once you book onto something you see it in the your section but
// not the browse section", and the member's own plans too). Full plans, plans
// they are in and plans they posted live in Yours; a full plan comes back here
// when a place opens. The plan behind an open sheet stays until it closes, so
// "You're in." still shows what was joined.

import "./invite.css";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Chip, ChipRow, KitLink, Main } from "@/components/members/kit";
import {
  INVITE_FILTERS,
  matchesFilter,
  planState,
  type InviteFilter,
} from "@/lib/members/invite/format";
import type { OpenInviteFeed } from "@/lib/members/invite/types";
import { ROUTES } from "@/lib/members/routes";
import { CloseBand, EmptyBand, PostLink } from "./bands";
import { InviteCard } from "./invite-card";
import { InviteTitle, InviteTop } from "./top-block";
import { useMoments, type Moment } from "./use-moments";

function FilterChips({ active, onPick }: { active: InviteFilter; onPick: (filter: InviteFilter) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // Bring the active chip into view inside its own row (scrollIntoView would also scroll the page).
  useEffect(() => {
    const row = ref.current?.querySelector<HTMLElement>(".mk-chips");
    const chip = row?.querySelector<HTMLElement>(".mk-is-active");
    if (!row || !chip || row.scrollWidth <= row.clientWidth + 2) return;
    const padding = Number.parseFloat(getComputedStyle(row).paddingLeft) || 0;
    row.scrollLeft += chip.getBoundingClientRect().left - row.getBoundingClientRect().left - padding - 56;
  }, [active]);
  return (
    <div ref={ref}>
      <ChipRow label="Filter by day or kind">
        {INVITE_FILTERS.map((filter) => (
          <Chip key={filter} active={filter === active} onClick={() => onPick(filter)}>
            {filter}
          </Chip>
        ))}
      </ChipRow>
    </div>
  );
}

export function OpenInviteView({
  feed,
  paidPlans,
  initialFilter = "Any day",
  initialMoment = null,
  initialPendingId = null,
}: {
  feed: OpenInviteFeed;
  /** flags.paidPlans: plans with a cost are left out while it is off. */
  paidPlans: boolean;
  /** The harness opens the page with a filter already chosen. */
  initialFilter?: InviteFilter;
  initialMoment?: Moment | null;
  initialPendingId?: string | null;
}) {
  const [filter, setFilter] = useState<InviteFilter>(initialFilter);
  const feedHeading = useId();
  const upcoming = useMemo(
    () => feed.invites.filter((invite) => paidPlans || invite.cost === null),
    [feed.invites, paidPlans],
  );
  const { plans: held, pendingId, join, sheet, moment } = useMoments({
    plans: upcoming,
    me: feed.me,
    nowIso: feed.now,
    seeOtherHref: ROUTES.openInvite,
    initialMoment,
    initialPendingId,
  });
  // Only what can still be joined: not full, not one you are in, not your own (the one behind an open sheet stays).
  const plans = held.filter(
    (invite) => planState(invite) === "open" || invite.id === pendingId || invite.id === moment?.id,
  );
  const visible = plans.filter((invite) => matchesFilter(invite, filter, feed.now));
  const none = plans.length === 0;
  // Plans exist, but none to join: they are full, or yours, or ones you are in (all in Yours).
  const allTaken = none && held.length > 0;
  const noMatch = !none && visible.length === 0;
  const summary = allTaken
    ? "No Open Invites to join right now"
    : none
    ? "No Open Invites yet"
    : noMatch
      ? `No Open Invites for ${filter}`
      : `${visible.length} Open ${visible.length === 1 ? "Invite" : "Invites"}`;

  return (
    <Main pad={false} fill={none || noMatch}>
      <InviteTop
        view="browse"
        yoursCount={none && !allTaken ? 0 : feed.yoursCount}
        me={feed.me}
        chips={none ? undefined : <FilterChips active={filter} onPick={setFilter} />}
      />
      <p className="mk-sr" role="status" aria-live="polite">
        {summary}
      </p>

      {allTaken ? (
        <EmptyBand
          title="Nothing new"
          accent="to join."
          lead="Plans you’re in or hosting are in Yours. A full one comes back here if a place opens."
          primary={
            <Button href={ROUTES.openInviteNew} blockPhone>
              Post an Open Invite
            </Button>
          }
          secondary={<YoursLink />}
          drawing={{ name: "coupes", w: 124, line: 2 }}
        />
      ) : none ? (
        <EmptyBand
          title="No Open Invites"
          accent="yet."
          lead="Be the first. Post a plan and see who’s in."
          primary={
            <Button href={ROUTES.openInviteNew} blockPhone>
              Post an Open Invite
            </Button>
          }
          drawing={{ name: "trainer", w: 232, line: 2.2 }}
          steps
        />
      ) : noMatch ? (
        <EmptyBand
          title="Nothing here"
          accent="yet."
          lead={`No Open Invites for ${filter}. Try another filter, or post one yourself.`}
          primary={
            <Button blockPhone onClick={() => setFilter("Any day")}>
              Show all invites
            </Button>
          }
          secondary={<PostLink />}
          drawing={{ name: "coupes", w: 124, line: 2 }}
        />
      ) : (
        <>
          <section className="mk-band oi-band" aria-labelledby={feedHeading}>
            <div className="mk-wrap">
              {/* The cards' titles are h3: this h2 is the list's own heading, so the page reads h1, h2, h3 (no visual change). */}
              <h2 className="mk-sr" id={feedHeading}>
                Open Invites
              </h2>
              <div className="oi-feed">
                {visible.map((invite) => (
                  <InviteCard
                    key={invite.id}
                    invite={invite}
                    me={feed.me}
                    pending={pendingId === invite.id}
                    onJoin={join}
                  />
                ))}
              </div>
            </div>
          </section>
          <CloseBand />
        </>
      )}
      {sheet}
    </Main>
  );
}

/** The way to Yours from the empty Browse band, in the band's link style. */
function YoursLink() {
  return (
    <KitLink className="mk-link" href={ROUTES.openInviteYours}>
      See Yours
    </KitLink>
  );
}

/** The loading page: the real title only; the rest arrives in one go (components/members/kit/main.tsx). No spinner. */
export function OpenInviteLoading() {
  return (
    <Main busy pad={false}>
      <span className="mk-sr">Loading</span>
      <div className="mk-wrap">
        <div className="oi-top">
          <InviteTitle />
        </div>
      </div>
    </Main>
  );
}

/** The page could not be drawn: nothing is lost, try again. (The designs draw no error page: this is the empty band's grammar with the members area's own words.) */
export function OpenInviteError({ onRetry }: { onRetry?: () => void }) {
  const router = useRouter();
  return (
    <Main pad={false} fill>
      <div className="mk-wrap">
        <div className="oi-top">
          <InviteTitle />
          <div className="oi-chips-wrap oi-yours-gap" />
        </div>
      </div>
      <EmptyBand
        title="Something went"
        accent="wrong."
        lead="Check your connection and try again."
        primary={
          <Button blockPhone onClick={onRetry ?? (() => router.refresh())}>
            Try again
          </Button>
        }
        drawing={{ name: "coupes", w: 124, line: 2 }}
        label="Could not load Open Invites"
      />
    </Main>
  );
}
