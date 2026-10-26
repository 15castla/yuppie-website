// EXAMPLE DATA: invented people and places. A 404 on the live site unless MEMBERS_SHOW_EXAMPLES=on is set there (guard.ts), and then every screen that uses it says it is an example (kit/example-note.tsx).
//
// Times are UTC; the club's clock is Europe/London, which is one hour ahead until 25 Oct 2026 (BST ends).
//
// Example rows for the Your plans screen, for the preview harness only. The
// live page reads real club events (lib/members/plans/club-events.ts) and has
// no Open Invite rows until the Open Invite backend exists; these rows show
// what the page looks like then. They are the approved design's own
// (v3 pages_plans.py): the two paid plans are "Comedy night, two spare
// tickets" (the guest paid £22) and "Polo match, two spare tickets" (the host
// asks £40 each).

import type { Plan } from "@/lib/members/plans/types";

export const EXAMPLE_PLANS_UPCOMING: Plan[] = [
  {
    kind: "open-invite",
    id: "example-oi-class",
    href: "/members/open-invite/example-oi-class",
    startsAt: "2026-10-24T09:00:00Z",
    title: "Saturday morning class + brunch",
    place: "Psycle, Oxford Circus",
    role: "guest",
    pill: "youre-in",
    note: null,
  },
  {
    kind: "club-event",
    id: "example-booking-padel",
    href: "/members/events/padel-and-pints",
    startsAt: "2026-10-29T18:30:00Z",
    title: "Padel & Pints",
    place: "Northgate Courts",
    pill: "booked",
  },
  {
    kind: "open-invite",
    id: "example-oi-comedy",
    href: "/members/open-invite/example-oi-comedy",
    startsAt: "2026-10-30T20:00:00Z",
    title: "Comedy night, two spare tickets",
    place: "The Bell Room",
    role: "guest",
    pill: "youre-in",
    note: "You paid £22",
  },
  {
    kind: "open-invite",
    id: "example-oi-climbing",
    href: "/members/open-invite/example-oi-climbing",
    startsAt: "2026-11-04T18:30:00Z",
    title: "Climbing and a pint",
    place: "The Boulder Yard",
    role: "host",
    pill: "yours",
    note: null,
  },
  {
    kind: "open-invite",
    id: "example-oi-polo",
    href: "/members/open-invite/example-oi-polo",
    startsAt: "2026-11-14T14:00:00Z",
    title: "Polo match, two spare tickets",
    place: "Hartley Polo Grounds",
    role: "host",
    pill: "yours",
    note: "£40 each",
  },
  {
    kind: "club-event",
    id: "example-booking-retreat",
    href: "/members/events/sunrise-wellness-retreat",
    startsAt: "2026-11-15T07:00:00Z",
    title: "Sunrise Wellness Retreat",
    place: "Calder Park",
    pill: "included",
  },
];

export const EXAMPLE_PLANS_PAST: Plan[] = [
  {
    kind: "open-invite",
    id: "example-oi-spin",
    href: "/members/open-invite/example-oi-spin",
    startsAt: "2026-10-17T08:30:00Z",
    title: "Saturday spin",
    place: "Spoke Studio",
    role: "host",
    pill: "finished",
    note: null,
  },
  {
    kind: "club-event",
    id: "example-booking-padel-past",
    href: "/members/events/padel-and-pints-past",
    startsAt: "2026-10-15T17:30:00Z",
    title: "Padel & Pints",
    place: "Northgate Courts",
    pill: "went",
  },
  {
    kind: "club-event",
    id: "example-booking-rooftop-past",
    href: "/members/events/rooftop-social-past",
    startsAt: "2026-10-09T18:00:00Z",
    title: "Rooftop Social",
    place: "The Mews Terrace",
    pill: "went",
  },
];

// The same plans as they are at launch: club events only.
export const EXAMPLE_CLUB_PLANS_UPCOMING = EXAMPLE_PLANS_UPCOMING.filter((plan) => plan.kind === "club-event");
export const EXAMPLE_CLUB_PLANS_PAST = EXAMPLE_PLANS_PAST.filter((plan) => plan.kind === "club-event");
