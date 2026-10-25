// Preview screens for Events, Your plans and Concierge. OWNED BY THE EVENTS BUILDER.
// ids: events-*, plans-*, concierge-*. Every state the approved designs draw
// (default, loading, empty, long titles, past, filtered, error).
//
// EXAMPLE DATA: invented people and places, never shown to real members. The
// events below are the approved mockups' own (v3 k2.EVENTS and pages_plans.py).

import EventsLoading from "@/app/members/events/loading";
import PlansLoading from "@/app/members/plans/loading";
import { EventsView, type EventsInviteTeaser } from "@/components/members/events-view";
import type { Event } from "@/components/members/event-types";
import { PlansView } from "@/components/members/plans/plans-view";
import {
  EXAMPLE_CLUB_PLANS_PAST,
  EXAMPLE_CLUB_PLANS_UPCOMING,
  EXAMPLE_PLANS_PAST,
  EXAMPLE_PLANS_UPCOMING,
} from "@/lib/members/mock/plans";
import type { Plan } from "@/lib/members/plans/types";
import type { PreviewScreen } from "./types";

// ---------------------------------------------------------------- events

function event(
  slug: string,
  title: string,
  start: string,
  location: string | null,
  pricePence: number,
  category: Event["category"],
): Event {
  return {
    id: `example-${slug}`,
    slug,
    title,
    description: null,
    category,
    location,
    start_time: start,
    end_time: null,
    price_pence: pricePence,
    capacity: 20,
    image_url: null,
    image_focal_x: 50,
    image_focal_y: 50,
  };
}

// 2026-10-25 is the day clocks go back; every date below is on GMT.
const PADEL = event("padel-and-pints", "Padel & Pints", "2026-10-29T18:30:00Z", "Northgate Courts", 2500, "sport");
const ROOFTOP = event("rooftop-social", "Rooftop Social", "2026-10-30T19:00:00Z", "The Mews Terrace", 0, "entertainment");
const POLO = event("polo-lesson", "Polo Lesson", "2026-11-07T09:00:00Z", "Hartley Polo Grounds", 9500, "sport");
const SUPPER = event("supper-club", "Supper Club: Wine & Charcuterie", "2026-11-12T19:30:00Z", "Marlow Wine Room", 4800, "entertainment");
const RETREAT = event("sunrise-wellness-retreat", "Sunrise Wellness Retreat", "2026-11-15T07:00:00Z", "Calder Park", 0, "personal_progression");

const EVENTS: Event[] = [PADEL, ROOFTOP, POLO, SUPPER, RETREAT];
const BOOKED = [PADEL.id, RETREAT.id];

const LONG_EVENTS: Event[] = [
  ...EVENTS,
  event(
    "long-title",
    "An evening of unnecessarily long titles and the people who write them",
    "2026-12-02T19:00:00Z",
    "The Marlow Wine Room and the Terrace Above It, Northgate",
    14950,
    "entertainment",
  ),
  event("no-place", "Open studio, no place given yet", "2026-12-05T10:00:00Z", null, 0, "personal_progression"),
];

const TEASER: EventsInviteTeaser = {
  id: "example-invite",
  title: "Saturday morning class + brunch",
  when: "Sat 24 Oct, 10:00",
  where: "Psycle, Oxford Circus",
  postedBy: "Jasmin",
};

const EVENTS_STATES = [
  "default",
  "loading",
  "launch",
  "filtered",
  "filter-empty",
  "no-plans",
  "past-plans-only",
  "full",
  "long",
  "empty",
] as const;

const eventsListScreens: PreviewScreen[] = [
  {
    id: "events-list",
    title: "Events: the list, Your plans and the Open Invite band",
    // default: the approved layout (with Open Invite on). launch: Open Invite off, so no band
    // and no link (shoot it with ?flags= so the tab bar is the launch one too).
    states: EVENTS_STATES,
    tab: "events",
    defaultFlags: ["openInvite"],
    render: ({ state, flags }) => {
      const base = { events: EVENTS, bookedEventIds: BOOKED, openInvite: flags.openInvite, inviteTeaser: TEASER };
      switch (state) {
        case "loading":
          return <EventsLoading />;
        case "launch":
          return <EventsView {...base} openInvite={false} />;
        case "filtered":
          return <EventsView {...base} initialFilter="included" />;
        case "filter-empty":
          return <EventsView {...base} initialFilter="sport" events={[ROOFTOP, SUPPER, RETREAT]} />;
        case "no-plans":
          return <EventsView {...base} bookedEventIds={[]} />;
        case "past-plans-only":
          return <EventsView {...base} bookedEventIds={["example-past-booking"]} />;
        case "full":
          return <EventsView {...base} fullEventIds={[ROOFTOP.id, SUPPER.id]} />;
        case "long":
          return <EventsView {...base} events={LONG_EVENTS} fullEventIds={["example-long-title"]} />;
        case "empty":
          return <EventsView {...base} events={[]} bookedEventIds={["example-past-booking"]} />;
        default:
          return <EventsView {...base} />;
      }
    },
  },
];

// ---------------------------------------------------------------- Your plans

const LONG_PLANS: Plan[] = [
  ...EXAMPLE_PLANS_UPCOMING,
  {
    kind: "club-event",
    id: "example-long-plan",
    href: "/members/events/long-title",
    startsAt: "2026-12-02T19:00:00Z",
    title: "An evening of unnecessarily long titles and the people who write them",
    place: "The Marlow Wine Room and the Terrace Above It, Northgate",
    pill: "booked",
  },
  {
    kind: "open-invite",
    id: "example-long-oi",
    href: "/members/open-invite/example-long-oi",
    startsAt: "2026-12-05T10:00:00Z",
    title: "A Saturday walk, a long lunch and a very long conversation about nothing",
    place: null,
    role: "guest",
    pill: "youre-in",
    note: "You paid £1,250.50",
  },
];

const plansListScreens: PreviewScreen[] = [
  {
    id: "plans-list",
    title: "Your plans: Upcoming and Past, club events and Open Invites",
    // default: the approved layout with Open Invite on (club events and Open Invites, chips, a card on a computer).
    // launch*: Open Invite off, so club events only, no chips, no card (shoot with ?flags= for the launch tab bar).
    states: [
      "default",
      "past",
      "empty",
      "empty-past",
      "filtered",
      "filter-empty",
      "long",
      "loading",
      "launch",
      "launch-past",
      "launch-empty",
    ],
    tab: "events",
    defaultFlags: ["openInvite"],
    render: ({ state, flags }) => {
      switch (state) {
        case "past":
          return <PlansView plans={EXAMPLE_PLANS_PAST} when="past" openInvite={flags.openInvite} />;
        case "empty":
          return <PlansView plans={[]} when="upcoming" openInvite={flags.openInvite} />;
        case "empty-past":
          return <PlansView plans={[]} when="past" openInvite={flags.openInvite} />;
        case "filtered":
          return (
            <PlansView plans={EXAMPLE_PLANS_UPCOMING} when="upcoming" openInvite={flags.openInvite} initialFilter="club-event" />
          );
        case "filter-empty":
          return (
            <PlansView plans={EXAMPLE_CLUB_PLANS_UPCOMING} when="upcoming" openInvite={flags.openInvite} initialFilter="open-invite" />
          );
        case "long":
          return <PlansView plans={LONG_PLANS} when="upcoming" openInvite={flags.openInvite} />;
        case "loading":
          return <PlansLoading />;
        case "launch":
          return <PlansView plans={EXAMPLE_CLUB_PLANS_UPCOMING} when="upcoming" openInvite={false} />;
        case "launch-past":
          return <PlansView plans={EXAMPLE_CLUB_PLANS_PAST} when="past" openInvite={false} />;
        case "launch-empty":
          return <PlansView plans={[]} when="upcoming" openInvite={false} />;
        default:
          return <PlansView plans={EXAMPLE_PLANS_UPCOMING} when="upcoming" openInvite={flags.openInvite} />;
      }
    },
  },
];

// index.ts gathers one array per registry file: this file's holds all three areas.
export const eventsScreens: PreviewScreen[] = [...eventsListScreens, ...plansListScreens];
