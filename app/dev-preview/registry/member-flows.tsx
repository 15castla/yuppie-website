// Preview screens for the member flows (r2a): the event page in every state, the booking and payment sheet,
// booking confirmed, cancelling, and the paused gate. OWNED BY THE MEMBER FLOWS BUILDER. ids: flow-*.
// The login page is the public site's own page, not a members screen: shoot it at /member-login.
//
// EXAMPLE DATA: invented people, places and prices, never shown to real members; addresses are the design's
// placeholders. The events are the design's own (pages_r2a.py EVENTS_R2). The stand-in actions answer from these
// examples after a short wait, so the buttons can be pressed here with no login and no database.

import type { EventPageStart } from "@/components/members/event/event-page-view";
import { EventPagePreview } from "@/components/members/event/preview";
import type { EventPageBooking, EventPageData, EventPageEvent } from "@/components/members/event/model";
import { MembershipPausedView } from "@/components/members/gates/paused-view";
import { Button } from "@/components/members/kit";
import { legalLines } from "@/lib/members/you/format";
import { previewSignOut } from "@/lib/members/mock/you-actions";
import type { PreviewScreen } from "./types";

// 2026-10-25 is the day clocks go back; every date below is on GMT, so 18:30Z reads 18:30.
function ev(over: Partial<EventPageEvent> & Pick<EventPageEvent, "slug" | "title" | "startTime">): EventPageEvent {
  return {
    id: `example-${over.slug}`,
    description: null,
    category: "sport",
    location: "Northgate Courts",
    endTime: null,
    pricePence: 0,
    capacity: 20,
    imageUrl: null,
    focalX: 50,
    focalY: 0,
    cancelledAt: null,
    cancelNote: null,
    ...over,
  };
}

const PADEL = ev({
  slug: "padel-and-pints",
  title: "Padel & Pints",
  startTime: "2026-10-29T18:30:00Z",
  endTime: "2026-10-29T20:30:00Z",
  pricePence: 2500,
  description: "Four courts, rotating doubles, and pizza after. Come alone or bring a friend, all levels welcome.",
});
const ROOFTOP = ev({
  slug: "rooftop-social",
  title: "Rooftop Social: End of Summer",
  category: "entertainment",
  startTime: "2026-10-30T19:00:00Z",
  location: "The Mews Terrace",
  capacity: 60,
  description: "One last warm night. A DJ, a welcome drink and the whole terrace to ourselves.",
});
const SUPPER = ev({
  slug: "supper-club",
  title: "Supper Club: Wine & Charcuterie",
  category: "entertainment",
  startTime: "2026-11-12T19:30:00Z",
  endTime: "2026-11-12T22:30:00Z",
  location: "Marlow Wine Room",
  pricePence: 4800,
  capacity: 24,
  description: "A long table, five wines and a board of cured meats and cheeses.",
});
const PAST = ev({
  slug: "summer-social",
  title: "Summer Social: Last Night of Summer",
  category: "entertainment",
  startTime: "2026-10-22T19:00:00Z",
  location: "The Mews Terrace",
  capacity: 60,
  description: "One last warm night on the terrace.",
});
const QUIZ = ev({
  slug: "quiz-night",
  title: "Quiz Night",
  category: "entertainment",
  startTime: "2026-11-17T19:00:00Z",
  location: "The Old Bell",
  pricePence: 1000,
  capacity: 40,
  description: "Six rounds, teams of four, and a very small trophy.",
  cancelledAt: "2026-10-27T10:00:00Z",
  cancelNote: "the venue is closed that evening",
});
const LONG = ev({
  slug: "long-supper",
  title: "Supper Club: Wine, Charcuterie and a Long Evening at the Old Marlow Cellar Rooms",
  category: "entertainment",
  startTime: "2026-11-12T19:30:00Z",
  endTime: "2026-11-12T22:30:00Z",
  location: "The Old Marlow Wine Room and Cellars",
  pricePence: 4800,
  capacity: 24,
  description:
    "A long table in the cellar, five wines poured through the evening, and a board of cured meats, cheeses and warm bread that keeps coming back. Our host talks you through each wine, and nobody minds if you ask the same question twice. Come on your own and you will leave with a table of new people, or bring a friend and we will sit you somewhere with a view of the barrels. Please tell us about allergies when you book, because the kitchen is small.",
});
// The public group drawing, standing in for an uploaded event photo (as the design does).
const PHOTO = { ...PADEL, imageUrl: "/yuppie-group.svg", focalX: 50, focalY: 0 };

const ADDRESS = "1 Sample Road, Anytown AB1 2CD";
const EMAIL = "sam@example.com";
const FREE_HOURS = 48;
const minus48 = (iso: string) => new Date(new Date(iso).getTime() - FREE_HOURS * 3600000).toISOString();

function bookingFor(event: EventPageEvent, over: Partial<EventPageBooking> = {}): EventPageBooking {
  return {
    bookingId: `example-booking-${event.slug}`,
    amountPence: event.pricePence,
    bookedAt: "2026-10-20T09:00:00Z",
    address: event.slug === "rooftop-social" ? "2 Sample Lane, Anytown AB1 2CE" : ADDRESS,
    freeUntil: minus48(event.startTime),
    freeNow: true,
    moved: false,
    icsUrl: `/members/events/${event.slug}/calendar.ics`,
    googleUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE",
    ...over,
  };
}

function data(event: EventPageEvent, over: Partial<EventPageData> = {}): EventPageData {
  return {
    event,
    bookedCount: event.slug === "supper-club" ? 24 : event.slug === "summer-social" ? 52 : event.slug === "rooftop-social" ? 38 : 14,
    booking: null,
    started: event.slug === "summer-social",
    freeUntil: minus48(event.startTime),
    freeCancelHours: FREE_HOURS,
    freeWindowOpen: true,
    memberEmail: EMAIL,
    clubCancelled: null,
    paymentReturn: null,
    ...over,
  };
}

type StateSpec = { data: EventPageData; start?: EventPageStart; fail?: "rsvp" | "cancel" };

const PAY = (state: "ready" | "paying" | "declined" | "bank" | "returning" | "processing" | "confirm-failed" | "load-error"): StateSpec => ({
  data: data(PADEL),
  start: { sheet: { kind: "pay", state, clientSecret: "example_secret", attempt: 1 }, pending: state === "processing" || state === "confirm-failed" },
});

const STATES: Record<string, StateSpec> = {
  "open-paid": { data: data(PADEL) },
  "open-included": { data: data(ROOFTOP) },
  "booked-paid": { data: data(PADEL, { booking: bookingFor(PADEL) }) },
  "booked-included": { data: data(ROOFTOP, { booking: bookingFor(ROOFTOP) }) },
  full: { data: data(SUPPER) },
  past: { data: data(PAST) },
  booking: { data: data(PADEL), start: { busy: "booking" } },
  processing: { data: data(PADEL), start: { pending: true } },
  message: { data: data(PADEL), start: { message: "We couldn’t book your spot. Nothing was taken. Please try again." }, fail: "rsvp" },
  "last-spot": { data: data(ROOFTOP), start: { message: "That was the last spot. Someone booked just before you." }, fail: "rsvp" },
  cancelled: { data: data(QUIZ, { bookedCount: 0, clubCancelled: { amountPence: 1000, refunded: true } }) },
  moved: { data: data(PADEL, { booking: bookingFor(PADEL, { moved: true, freeNow: true }) }) },
  "booked-late": { data: data(PADEL, { booking: bookingFor(PADEL, { freeNow: false }), freeWindowOpen: false }) },
  "open-late": { data: data(PADEL, { freeWindowOpen: false }) },
  photo: { data: data(PHOTO) },
  "photo-booked": { data: data(PHOTO, { booking: bookingFor(PHOTO) }) },
  long: { data: data(LONG, { bookedCount: 17 }) },
  "no-address": { data: data(PADEL, { booking: bookingFor(PADEL, { address: null }) }) },
  "pay-ready": PAY("ready"),
  "pay-paying": PAY("paying"),
  "pay-declined": PAY("declined"),
  "pay-bank": PAY("bank"),
  "pay-returning": PAY("returning"),
  "pay-processing": PAY("processing"),
  "pay-confirm-failed": PAY("confirm-failed"),
  "pay-load-error": PAY("load-error"),
  "confirmed-paid": { data: data(PADEL, { booking: bookingFor(PADEL) }), start: { sheet: { kind: "confirmed", booking: bookingFor(PADEL) } } },
  "confirmed-included": {
    data: data(ROOFTOP, { booking: bookingFor(ROOFTOP) }),
    start: { sheet: { kind: "confirmed", booking: bookingFor(ROOFTOP) } },
  },
  "cancel-ask-paid": { data: data(PADEL, { booking: bookingFor(PADEL) }), start: { sheet: { kind: "cancel", state: "ask", late: false } } },
  "cancel-ask-included": { data: data(ROOFTOP, { booking: bookingFor(ROOFTOP) }), start: { sheet: { kind: "cancel", state: "ask", late: false } } },
  "cancel-ask-moved": {
    data: data(PADEL, { booking: bookingFor(PADEL, { moved: true }) }),
    start: { sheet: { kind: "cancel", state: "ask", late: false } },
  },
  "cancel-cancelling": { data: data(PADEL, { booking: bookingFor(PADEL) }), start: { sheet: { kind: "cancel", state: "cancelling", late: false } } },
  "cancel-late": {
    data: data(PADEL, { booking: bookingFor(PADEL, { freeNow: false }), freeWindowOpen: false }),
    start: { sheet: { kind: "cancel", state: "late", late: true } },
  },
  "cancel-late-included": {
    data: data(ROOFTOP, { booking: bookingFor(ROOFTOP, { freeNow: false }), freeWindowOpen: false }),
    start: { sheet: { kind: "cancel", state: "late", late: true } },
  },
  "cancel-done-paid": {
    data: data(PADEL),
    start: { sheet: { kind: "cancel", state: "done", late: false, outcome: { refundPence: 2500, paidPence: 2500 } } },
  },
  "cancel-done-included": {
    data: data(ROOFTOP),
    start: { sheet: { kind: "cancel", state: "done", late: false, outcome: { refundPence: 0, paidPence: 0 } } },
  },
  "cancel-done-late": {
    data: data(PADEL),
    start: { sheet: { kind: "cancel", state: "done", late: true, outcome: { refundPence: 0, paidPence: 2500 } } },
  },
  "cancel-error": {
    data: data(PADEL, { booking: bookingFor(PADEL) }),
    start: { sheet: { kind: "cancel", state: "error", late: false } },
    fail: "cancel",
  },
};

const eventScreen: PreviewScreen = {
  id: "flow-event",
  title: "Event page: every state, the bar, the pay sheet, booking confirmed, cancelling (r2a 1 to 5)",
  states: Object.keys(STATES),
  tab: "events",
  dock: "own",
  render: ({ state }) => {
    const spec = STATES[state] ?? STATES["open-paid"];
    return <EventPagePreview key={state} data={spec.data} start={spec.start} fail={spec.fail} bookAs={bookingFor(spec.data.event)} />;
  },
};

const gateScreen: PreviewScreen = {
  id: "flow-gate-paused",
  title: "Membership paused gate (r2a 8)",
  states: ["default"],
  chrome: "bare",
  dock: "own",
  render: ({ shell }) => (
    <MembershipPausedView
      mode={shell}
      legal={legalLines(2026)}
      appVersion="1.0 (1)"
      signOut={previewSignOut}
      deleteAccount={
        <Button variant="quiet" danger className="yu-quiet">
          Delete my account
        </Button>
      }
    />
  ),
};

export const memberFlowScreens: PreviewScreen[] = [eventScreen, gateScreen];
