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

import "./invite.css";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, Chip, ChipRow, Main, Shape } from "@/components/members/kit";
import {
  INVITE_FILTERS,
  matchesFilter,
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
  const { plans, pendingId, join, sheet } = useMoments({
    plans: upcoming,
    me: feed.me,
    nowIso: feed.now,
    seeOtherHref: ROUTES.openInvite,
    initialMoment,
    initialPendingId,
  });
  const visible = plans.filter((invite) => matchesFilter(invite, filter, feed.now));
  const none = plans.length === 0;
  const noMatch = !none && visible.length === 0;
  const summary = none
    ? "No Open Invites yet"
    : noMatch
      ? `No Open Invites for ${filter}`
      : `${visible.length} Open ${visible.length === 1 ? "Invite" : "Invites"}`;

  return (
    <Main pad={false} fill={none || noMatch}>
      <InviteTop
        view="browse"
        yoursCount={none ? 0 : feed.yoursCount}
        me={feed.me}
        chips={none ? undefined : <FilterChips active={filter} onPick={setFilter} />}
      />
      <p className="mk-sr" role="status" aria-live="polite">
        {summary}
      </p>

      {none ? (
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

/** The loading page: the real title and switch, pale shapes where the cards will be. No spinner. */
export function OpenInviteLoading() {
  return (
    <Main busy pad={false}>
      <span className="mk-sr">Loading</span>
      <div className="mk-wrap">
        <div className="oi-top">
          <InviteTitle />
          <div className="oi-seg-wrap">
            <Shape width={264} height={48} kind="pill" />
          </div>
          <div className="oi-compose-wrap">
            <Shape height={52} kind="pill" />
          </div>
          <div className="oi-chips-wrap oi-sk-chips" aria-hidden="true">
            {[72, 112, 96, 88].map((width) => (
              <Shape key={width} width={width} height={44} kind="pill" style={{ flex: "none" }} />
            ))}
          </div>
        </div>
      </div>
      <section className="mk-band oi-band" aria-hidden="true">
        <div className="mk-wrap">
          <div className="oi-feed">
            {[0, 1].map((index) => (
              <Shape key={index} height={264} kind="tile" className="oi-sk-card" />
            ))}
          </div>
        </div>
      </section>
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
