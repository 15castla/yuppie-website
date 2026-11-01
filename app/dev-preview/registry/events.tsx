// Preview screens for Events, Your plans and Concierge. OWNED BY THE EVENTS BUILDER.
// ids: events-*, plans-*, concierge-*. Every state the approved designs draw
// (default, loading, empty, long titles, past, filtered, error).
//
// EXAMPLE DATA: invented people and places, never shown to real members. The
// events below are the approved mockups' own (v3 k2.EVENTS and pages_plans.py).

import ConciergeLoading from "@/app/members/concierge/loading";
import EventsLoading from "@/app/members/events/loading";
import PlansLoading from "@/app/members/plans/loading";
import { ConciergeView } from "@/components/members/concierge/concierge-view";
import { EventsView } from "@/components/members/events-view";
import type { Event } from "@/components/members/event-types";
import { PlansView } from "@/components/members/plans/plans-view";
import {
  EXAMPLE_CLUB_PLANS_PAST,
  EXAMPLE_CLUB_PLANS_UPCOMING,
  EXAMPLE_PLANS_PAST,
  EXAMPLE_PLANS_UPCOMING,
} from "@/lib/members/mock/plans";
import type { ConciergeMessage, ConciergeSnapshot } from "@/lib/members/concierge/types";
import {
  CALDER,
  CELLAR,
  EXAMPLE_CONVERSATION,
  EXAMPLE_FIRST_QUESTION,
  EXAMPLE_LONG_QUESTION,
  EXAMPLE_LONG_REPLY,
  EXAMPLE_MEMORY,
  EXAMPLE_SUGGESTIONS,
  getConciergeScript,
} from "@/lib/members/mock/concierge";
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
      const base = { events: EVENTS, bookedEventIds: BOOKED, openInvite: flags.openInvite };
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

// ---------------------------------------------------------------- Concierge (app only)

// The Concierge has no web page (it is a 404 there), so these screens draw in the app shell:
// shoot them with ?shell=app (the harness's web shell shows a note instead). Both default to
// openInvite + concierge on, so the tab bar is the approved five-tab one.

const NO_MEMORY: ConciergeSnapshot["memory"] = [];

function snapshot(messages: ConciergeMessage[], memory = EXAMPLE_MEMORY): ConciergeSnapshot {
  return { messages, memory, suggestions: EXAMPLE_SUGGESTIONS };
}

const FOLLOW_UP = (text: string, status: "sent" | "pending" | "failed"): ConciergeMessage => ({
  role: "member",
  id: "example-m2",
  at: "09:43",
  text,
  status,
});

const QUIET = { id: "example-mem-quiet", text: "Likes quiet places" };

const LONG_PLACE = {
  id: "example-long-place",
  name: "The Marlow Wine Room and the Terrace Above It, Northgate",
  why: "A long, candlelit room with round tables, a terrace for when it is warm, and staff who will move a table if you ask nicely.",
  facts: ["Good for a group of eight or more", "Quiet upstairs on weekday evenings"],
  address: "The Old Brewery Courtyard, 2 Brewery Lane, Northgate",
  mapsUrl: "https://maps.apple.com/?q=The+Marlow+Wine+Room",
};

const CHAT_STATES = [
  "conversation",
  "waiting",
  "error",
  "long",
  "memory",
  "forget",
  "memory-empty",
  "typing",
  "forgotten",
  "long-text",
] as const;

function webNote() {
  return (
    <main className="mk-main mk-main-pad">
      <div className="mk-wrap" style={{ paddingTop: 40 }}>
        <p>
          Preview note, not product UI: the Concierge is app only, and on the web this page is a 404. Add
          ?shell=app to see it.
        </p>
      </div>
    </main>
  );
}

const conciergeScreens: PreviewScreen[] = [
  {
    id: "concierge-first",
    title: "Concierge: first open (app only)",
    states: ["default", "typing", "loading"],
    tab: "concierge",
    defaultFlags: ["openInvite", "concierge"],
    render: ({ state, shell }) => {
      if (shell === "web") return webNote();
      if (state === "loading") return <ConciergeLoading />;
      return (
        <ConciergeView
          snapshot={snapshot([], NO_MEMORY)}
          script={getConciergeScript()}
          initialDraft={state === "typing" ? "Somewhere with a garden" : ""}
          autoFocusComposer={state === "typing"}
        />
      );
    },
  },
  {
    id: "concierge-chat",
    title: "Concierge: a conversation, waiting, not sent, long reply, memory (app only)",
    states: CHAT_STATES,
    tab: "concierge",
    defaultFlags: ["openInvite", "concierge"],
    render: ({ state, shell }) => {
      if (shell === "web") return webNote();
      const script = getConciergeScript();
      switch (state) {
        case "waiting":
          return <ConciergeView snapshot={snapshot([...EXAMPLE_CONVERSATION, FOLLOW_UP("Anything a bit livelier?", "pending")])} script={script} />;
        case "error":
          return <ConciergeView snapshot={snapshot([...EXAMPLE_CONVERSATION, FOLLOW_UP("What about somewhere with a garden?", "failed")])} script={script} />;
        case "long":
          return (
            <ConciergeView
              snapshot={snapshot(
                [{ role: "member", id: "example-m-long", at: "09:52", text: EXAMPLE_LONG_QUESTION, status: "sent" }, EXAMPLE_LONG_REPLY],
                [...EXAMPLE_MEMORY, { id: "example-mem-eight", text: "Books for eight on Saturdays" }],
              )}
              script={script}
            />
          );
        case "memory":
          return <ConciergeView snapshot={snapshot(EXAMPLE_CONVERSATION)} script={script} initialSheet />;
        case "forget":
          return <ConciergeView snapshot={snapshot(EXAMPLE_CONVERSATION)} script={script} initialConfirm />;
        case "memory-empty":
          return <ConciergeView snapshot={snapshot(EXAMPLE_CONVERSATION, NO_MEMORY)} script={script} initialSheet />;
        case "typing":
          return (
            <ConciergeView
              snapshot={snapshot(
                [
                  { role: "member", id: "example-m1", at: "09:41", text: EXAMPLE_FIRST_QUESTION, status: "sent" },
                  { role: "concierge", id: "example-r-chip", at: "09:41", text: "One stands out for quiet.", recommendations: [CELLAR], remembered: QUIET },
                ],
                [QUIET],
              )}
              script={script}
              initialDraft="Somewhere with a garden"
              autoFocusComposer
            />
          );
        case "forgotten":
          // the chip after its item has been removed: no Undo, says so
          return (
            <ConciergeView
              snapshot={snapshot(
                [
                  { role: "member", id: "example-m1", at: "09:41", text: EXAMPLE_FIRST_QUESTION, status: "sent" },
                  { role: "concierge", id: "example-r-chip", at: "09:41", text: "One stands out for quiet.", recommendations: [CELLAR], remembered: QUIET },
                ],
                NO_MEMORY,
              )}
              script={script}
            />
          );
        case "long-text":
          return (
            <ConciergeView
              snapshot={snapshot([
                {
                  role: "member",
                  id: "example-m-long-text",
                  at: "09:44",
                  text: "Somewhere for the whole of the Thursday running club afterwards, about eighteen of us, somewhere that can cope with trainers and wet coats and a lot of noise.",
                  status: "sent",
                },
                {
                  role: "concierge",
                  id: "example-r-long-text",
                  at: "09:44",
                  text: "One place has the room for a group that size, and it forgives wet coats.",
                  recommendations: [LONG_PLACE, CALDER],
                },
              ])}
              script={script}
            />
          );
        default:
          return <ConciergeView snapshot={snapshot(EXAMPLE_CONVERSATION)} script={script} />;
      }
    },
  },
];

// index.ts gathers one array per registry file: this file's holds all three areas.
export const eventsScreens: PreviewScreen[] = [...eventsListScreens, ...plansListScreens, ...conciergeScreens];
