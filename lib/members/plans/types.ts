// What the Your plans page shows. One row type for everything the member is in
// for: club events they have booked and Open Invites they have joined or
// posted (both real: lib/members/plans/club-events.ts and lib/server/plans.ts
// openInvitePlanRows). The preview harness draws them from the example
// fixtures in lib/members/mock/plans.ts.
//
// A row is a date, a title, a place, and one pill. The page groups rows by
// month, newest month last for Upcoming and first for Past.

/** Upcoming or Past: the Segmented control on the page, ?when=past in the address. */
export type PlansWhen = "upcoming" | "past";

type PlanBase = {
  /** Booking id (club event) or Open Invite id. Unique within the list. */
  id: string;
  /** Where the row goes: the event page or the plan page. */
  href: string;
  /** ISO timestamp, club time is worked out on display (Europe/London). */
  startsAt: string;
  title: string;
  /** "Northgate Courts". Null when the event has no place yet. */
  place: string | null;
};

/** A club event the member has a confirmed booking for. Real data. */
export type ClubEventPlan = PlanBase & {
  kind: "club-event";
  /**
   * Upcoming: booked (a paid event, the member paid for their place) or
   * included (a free event, part of the membership), as the design draws
   * them. Past: went (a confirmed booking for an event that has started; the
   * product has no check-in, so "went" means "had a place and it has
   * passed").
   */
  pill: "booked" | "included" | "went";
};

/**
 * An Open Invite the member is in, or posted (lib/server/plans.ts
 * openInvitePlanRows fills it; lib/members/invite/types.ts is the area's own,
 * this is only the part Your plans needs).
 */
export type OpenInvitePlan = PlanBase & {
  kind: "open-invite";
  /** guest: they said they are in. host: they posted it ("Yours"). */
  role: "guest" | "host";
  /**
   * youre-in: upcoming, guest. yours: upcoming, host.
   * went: past, guest. finished: past, host.
   */
  pill: "youre-in" | "yours" | "went" | "finished";
  /**
   * A paid plan's money line, shown under the place: "You paid £22" for a
   * guest, "£40 each" for the host. Null for a free plan. Only present when
   * paid plans exist (flags.paidPlans).
   */
  note: string | null;
};

export type Plan = ClubEventPlan | OpenInvitePlan;

/** The page's filter chips: shown only when Open Invite is on. */
export type PlansFilter = "all" | "club-event" | "open-invite";
