// EXAMPLE DATA: invented people and places, never shown to real members (the
// dev preview 404s in production; the checks in tests/e2e/phase-a/emails use
// them). The first fixture of each email is the design's own example
// content (r2c.md, "Today is Sun 25 Oct 2026"), so rendering it must give
// the send-ready file exactly. The others are the states the spec lists.

import type { EmailData, EmailName, TextData, TextName } from "./types";

export type EmailFixture<N extends EmailName> = { id: string; label: string; data: EmailData[N] };

const PADEL = { title: "Padel & Pints", start: { date: "Thu 29 Oct", time: "18:30" } };
const ROOFTOP = { title: "Rooftop Social", start: { date: "Fri 30 Oct", time: "19:00" } };
const NORTHGATE = { venue: "Northgate Courts", address: "1 Sample Road, Anytown AB1 2CD" };
const MEWS = { venue: "The Mews Terrace", address: "4 Sample Mews, Anytown AB1 2CD" };
const VISA = "Visa ending 4242";
const SENT = { date: "Sun 25 Oct", time: "09:41" };
const padelLinks = { bookingUrl: "/members/events/padel-and-pints" };
// Open Invite (stage 2). The designs draw /members/invite/<slug>: the route is /members/open-invite/<id>.
const WALK = { title: "Sunday walk and coffee", start: { date: "Sun 25 Oct", time: "11:00" } };
const CLASS = { title: "Saturday morning class + brunch", start: { date: "Sat 24 Oct", time: "10:00" } };
const CLIMB = { title: "Climbing and a pint", start: { date: "Thu 29 Oct", time: "19:00" } };
const classUrl = "/members/open-invite/saturday-morning-class";

export const EMAIL_FIXTURES: { [N in EmailName]: EmailFixture<N>[] } = {
  "application-received": [{ id: "design", label: "As drawn", data: { fullName: "Hannah Reed", sent: SENT } }],
  approval: [
    {
      id: "design",
      label: "As drawn",
      data: { firstName: "Hannah", loginEmail: "hannah@example.com", paid: "£10", renewsOn: "Wed 25 Nov" },
    },
    { id: "no-name", label: "No first name, no Stripe details", data: { firstName: null, loginEmail: "hannah@example.com" } },
  ],
  decline: [
    { id: "design", label: "As drawn (card not released)", data: { cardReleased: false } },
    { id: "card-released", label: "Card released (C-D8)", data: { cardReleased: true } },
  ],
  "email-changed": [
    {
      id: "design",
      label: "As drawn",
      data: { oldEmail: "sam@example.com", newEmail: "sam.new@example.com", changed: SENT },
    },
  ],
  "account-deleted": [
    { id: "design", label: "As drawn (hosted plans)", data: { hostedPlans: true } },
    { id: "no-plans", label: "No hosted plans (Phase A)", data: {} },
    { id: "by-club", label: "Deleted by the club (admin Delete member)", data: { byClub: true } },
  ],
  "cancel-requested": [
    {
      id: "design",
      label: "As drawn (booked and hosting after the end)",
      data: { endsOn: "Thu 12 Nov", bookingsAfterEnd: true, hostedPlansAfterEnd: true },
    },
    { id: "bookings", label: "Events booked after the end", data: { endsOn: "Thu 12 Nov", bookingsAfterEnd: true } },
    { id: "nothing-after", label: "Nothing after the end", data: { endsOn: "Thu 12 Nov", bookingsAfterEnd: false } },
  ],
  "membership-ended": [
    { id: "design", label: "As drawn (you cancelled)", data: { endedOn: "Thu 12 Nov", reason: "member_cancelled" } },
    { id: "payment-failed", label: "After a failed payment", data: { endedOn: "Sun 15 Nov", reason: "payment_failed", amount: "£10" } },
    { id: "admin", label: "Cancelled by the club", data: { endedOn: "Thu 12 Nov", reason: "admin_cancelled" } },
  ],
  "payment-failed": [
    {
      id: "design",
      label: "As drawn",
      data: { amount: "£10", card: VISA, triedOn: "Thu 12 Nov", until: "Sun 15 Nov" },
    },
    { id: "no-card", label: "Card unknown", data: { amount: "£10", card: null, triedOn: "Thu 12 Nov", until: "Sun 15 Nov" } },
  ],
  "booking-confirmed": [
    {
      id: "design",
      label: "As drawn",
      data: {
        event: PADEL,
        place: NORTHGATE,
        paid: "£25",
        card: VISA,
        cancelUntil: { date: "Tue 27 Oct", time: "18:30" },
        ...padelLinks,
        calendarUrl: "/members/events/padel-and-pints/calendar.ics",
      },
    },
    {
      id: "no-address",
      label: "No exact address saved yet",
      data: {
        event: PADEL,
        place: { venue: "Northgate Courts" },
        paid: "£25",
        card: VISA,
        cancelUntil: { date: "Tue 27 Oct", time: "18:30" },
        ...padelLinks,
        calendarUrl: "/members/events/padel-and-pints/calendar.ics",
      },
    },
    {
      id: "late",
      label: "Booked inside 48 hours, card unknown",
      data: {
        event: PADEL,
        place: NORTHGATE,
        paid: "£25",
        card: null,
        cancelUntil: null,
        ...padelLinks,
        calendarUrl: "/members/events/padel-and-pints/calendar.ics",
      },
    },
    {
      id: "long",
      label: "Long title and address",
      data: {
        event: { title: "Summer garden party with live jazz, oysters and a very long title", start: { date: "Sat 14 Nov", time: "14:00" } },
        place: {
          venue: "The Old Botanical Glasshouse and Orangery",
          address: "Unit 14, The Courtyard Buildings\nLongname-Upon-Somewhere Road\nAnytown AB12 3CD",
        },
        paid: "£125.50",
        card: "American Express ending 0005",
        cancelUntil: { date: "Thu 12 Nov", time: "14:00" },
        bookingUrl: "/members/events/summer-garden-party",
        calendarUrl: "/members/events/summer-garden-party/calendar.ics",
      },
    },
  ],
  "booking-confirmed-included": [
    {
      id: "design",
      label: "As drawn",
      data: {
        event: ROOFTOP,
        place: MEWS,
        bookingUrl: "/members/events/rooftop-social",
        calendarUrl: "/members/events/rooftop-social/calendar.ics",
      },
    },
    {
      id: "inside-48",
      label: "Booked inside 48 hours (no cancel deadline)",
      data: {
        event: ROOFTOP,
        place: MEWS,
        bookingUrl: "/members/events/rooftop-social",
        calendarUrl: "/members/events/rooftop-social/calendar.ics",
        cancelUntil: null,
      },
    },
  ],
  "booking-cancelled": [
    {
      id: "design",
      label: "As drawn (paid, cancelled in time)",
      data: {
        reason: "member",
        event: PADEL,
        cancelled: { date: "Mon 26 Oct", time: "09:41" },
        refund: { amount: "£25", card: VISA, arrivesBy: "Mon 9 Nov" },
      },
    },
    {
      id: "free",
      label: "Included event, cancelled in time",
      data: { reason: "member", event: ROOFTOP, cancelled: { date: "Mon 26 Oct", time: "09:41" }, refund: null },
    },
    {
      id: "late",
      label: "Paid, cancelled late without a refund",
      data: { reason: "member_late", event: PADEL, cancelled: { date: "Wed 28 Oct", time: "20:15" }, refund: null, notRefunded: "£25" },
    },
    {
      id: "not-booked",
      label: "Paid just as the event was cancelled: not booked, refunded (QA1-12)",
      data: {
        reason: "not_booked",
        notBookedWhy: "event_cancelled",
        event: PADEL,
        cancelled: { date: "Wed 28 Oct", time: "20:15" },
        refund: { amount: "£25", card: VISA, arrivesBy: "Wed 11 Nov" },
      },
    },
    {
      id: "late-included",
      label: "Included event, cancelled inside 48 hours",
      data: { reason: "member_late", event: ROOFTOP, cancelled: { date: "Wed 28 Oct", time: "20:15" }, refund: null },
    },
    {
      id: "event-changed",
      label: "Paid, cancelled after the club moved it",
      data: {
        reason: "event_changed",
        event: PADEL,
        cancelled: { date: "Wed 28 Oct", time: "20:15" },
        refund: { amount: "£25", card: VISA, arrivesBy: "Wed 11 Nov" },
      },
    },
    {
      id: "membership-ended",
      label: "Paid, cancelled because the membership ended",
      data: {
        reason: "membership_ended",
        event: { title: "Padel & Pints", start: { date: "Thu 19 Nov", time: "18:30" } },
        cancelled: { date: "Thu 12 Nov", time: "00:05" },
        membershipEndedOn: "Thu 12 Nov",
        refund: { amount: "£25", card: VISA, arrivesBy: "Thu 26 Nov" },
      },
    },
    {
      id: "membership-ended-free",
      label: "Included, cancelled because the membership ended",
      data: {
        reason: "membership_ended",
        event: { title: "Rooftop Social", start: { date: "Fri 20 Nov", time: "19:00" } },
        cancelled: { date: "Thu 12 Nov", time: "00:05" },
        membershipEndedOn: "Thu 12 Nov",
        refund: null,
      },
    },
  ],
  "event-cancelled": [
    {
      id: "design",
      label: "As drawn (paid, with a reason)",
      data: { event: PADEL, reason: "the courts are closed that evening", refund: { amount: "£25", card: VISA } },
    },
    {
      id: "free",
      label: "Included event",
      data: { event: ROOFTOP, reason: "the terrace is closed that evening", refund: null },
    },
    { id: "no-reason", label: "Paid, no reason typed", data: { event: PADEL, reason: null, refund: { amount: "£25", card: VISA } } },
  ],
  "event-changed": [
    {
      id: "design",
      label: "As drawn (time moved, paid)",
      data: {
        moved: "time",
        event: { title: "Padel & Pints", start: { date: "Thu 29 Oct", time: "19:30" } },
        wasStart: PADEL.start,
        place: NORTHGATE,
        paid: "£25",
        ...padelLinks,
      },
    },
    {
      id: "place",
      label: "Place moved",
      data: {
        moved: "place",
        event: PADEL,
        wasVenue: "Northgate Courts",
        place: { venue: "Southbank Padel Club", address: "9 Example Street, Anytown AB1 3EF" },
        paid: "£25",
        ...padelLinks,
      },
    },
    {
      id: "both",
      label: "Date, time and place moved",
      data: {
        moved: "both",
        event: { title: "Padel & Pints", start: { date: "Fri 30 Oct", time: "19:00" } },
        wasStart: PADEL.start,
        wasVenue: "Northgate Courts",
        place: { venue: "Southbank Padel Club", address: "9 Example Street, Anytown AB1 3EF" },
        paid: "£25",
        ...padelLinks,
      },
    },
    {
      id: "included",
      label: "Included event, time moved",
      data: {
        moved: "time",
        event: { title: "Rooftop Social", start: { date: "Fri 30 Oct", time: "20:00" } },
        wasStart: ROOFTOP.start,
        place: MEWS,
        paid: null,
        bookingUrl: "/members/events/rooftop-social",
      },
    },
  ],
  "event-reminder": [
    { id: "design", label: "24 hours before (round 3, as drawn)", data: { window: "24h", event: PADEL, place: NORTHGATE, ...padelLinks } },
    { id: "2h", label: "2 hours before", data: { window: "2h", event: PADEL, place: NORTHGATE, ...padelLinks } },
  ],
  "admin-new-application": [
    {
      id: "design",
      label: "As drawn",
      data: { fullName: "Hannah Reed", role: "Associate", employer: "Calder Partners", sent: SENT, waiting: 3 },
    },
    { id: "no-role", label: "No role or employer, first one waiting", data: { fullName: "Kit Barrow", sent: SENT, waiting: 1 } },
  ],
  "admin-booking-review": [
    {
      id: "design",
      label: "As drawn (paid twice)",
      data: {
        reason: "paid_twice",
        memberName: "Sam Taylor",
        event: PADEL,
        amount: "£25",
        paymentIntentId: "pi_3Qx7Ab2eZvKYlo2C0d4f2a9c",
      },
    },
    {
      id: "over-capacity",
      label: "Over capacity",
      data: {
        reason: "over_capacity",
        memberName: "Sam Taylor",
        event: PADEL,
        amount: "£25",
        paymentIntentId: "pi_3Qx7Ab2eZvKYlo2C0d4f2a9c",
        booked: 25,
        capacity: 24,
      },
    },
    {
      id: "refund-failed",
      label: "Refund failed (added for the foundation)",
      data: {
        reason: "refund_failed",
        memberName: "Sam Taylor",
        event: PADEL,
        amount: "£25",
        paymentIntentId: "pi_3Qx7Ab2eZvKYlo2C0d4f2a9c",
        bookingId: "7c1e9b52-3f0a-4d8e-9a61-2b5f0c8d4e17",
        detail: "This charge has already been refunded.",
      },
    },
    {
      id: "paid-not-booked",
      label: "Paid, not booked (added for the foundation)",
      data: {
        reason: "paid_not_booked",
        memberName: "Sam Taylor",
        event: PADEL,
        amount: "£25",
        paymentIntentId: "pi_3Qx7Ab2eZvKYlo2C0d4f2a9c",
        detail: "The event was cancelled before the payment went through.",
      },
    },
    {
      id: "refund-failed-bare",
      label: "Refund failed, no error text or booking id",
      data: {
        reason: "refund_failed",
        memberName: "Sam Taylor",
        event: PADEL,
        amount: "£25",
        paymentIntentId: "pi_3Qx7Ab2eZvKYlo2C0d4f2a9c",
      },
    },
  ],

  // ---------------------------------------------------------------- stage 2
  "plan-changed": [
    {
      id: "design",
      label: "As drawn (time moved)",
      data: {
        moved: "time",
        hostName: "Priya",
        plan: { title: "Sunday walk and coffee", start: { date: "Sun 25 Oct", time: "11:30" } },
        wasStart: WALK.start,
        place: "Calder Park",
        planUrl: "/members/open-invite/sunday-walk",
      },
    },
    {
      id: "place",
      label: "Place moved",
      data: {
        moved: "place",
        hostName: "Priya",
        plan: WALK,
        wasPlace: "Calder Park",
        place: "Riverside Gardens, south gate",
        planUrl: "/members/open-invite/sunday-walk",
      },
    },
    {
      id: "both",
      label: "Date, time and place moved",
      data: {
        moved: "both",
        hostName: "Priya",
        plan: { title: "Sunday walk and coffee", start: { date: "Mon 26 Oct", time: "18:00" } },
        wasStart: WALK.start,
        wasPlace: "Calder Park",
        place: "Riverside Gardens, south gate",
        planUrl: "/members/open-invite/sunday-walk",
      },
    },
    {
      id: "long",
      label: "Longest title (50) and a long place",
      data: {
        moved: "time",
        hostName: "Alexandra-Grace",
        plan: { title: "Sunday long run by the canal, then a big breakfast", start: { date: "Sun 1 Nov", time: "08:30" } },
        wasStart: { date: "Sun 1 Nov", time: "08:00" },
        place: "The bandstand by the north gate of Calder Park, near the cafe",
        planUrl: "/members/open-invite/canal-run",
      },
    },
  ],
  "plan-cancelled": [
    {
      id: "design",
      label: "As drawn (free plan)",
      data: { hostName: "Priya", plan: WALK, place: "Calder Park" },
    },
    {
      id: "long",
      label: "Longest title (50) and a long place",
      data: {
        hostName: "Alexandra-Grace",
        plan: { title: "Sunday long run by the canal, then a big breakfast", start: { date: "Sun 1 Nov", time: "08:00" } },
        place: "The bandstand by the north gate of Calder Park, near the cafe",
      },
    },
  ],
  "plan-reminder": [
    {
      id: "design",
      label: "24 hours before (round 3, as drawn)",
      data: { window: "24h", plan: CLASS, place: "Psycle, Oxford Circus", others: ["Jasmin", "Priya"], planUrl: classUrl },
    },
    {
      id: "2h",
      label: "2 hours before",
      data: { window: "2h", plan: CLASS, place: "Psycle, Oxford Circus", others: ["Jasmin", "Priya"], planUrl: classUrl },
    },
    {
      id: "one-other",
      label: "One other person going",
      data: { window: "24h", plan: CLASS, place: "Psycle, Oxford Circus", others: ["Jasmin"], planUrl: classUrl },
    },
    {
      id: "many",
      label: "Six others going",
      data: {
        window: "24h",
        plan: CLASS,
        place: "Psycle, Oxford Circus",
        others: ["Jasmin", "Priya", "Tom", "Ollie", "Chloe", "Dan"],
        planUrl: classUrl,
      },
    },
    {
      id: "alone",
      label: "Nobody else going yet",
      data: { window: "2h", plan: CLASS, place: "Psycle, Oxford Circus", others: [], planUrl: classUrl },
    },
  ],
  "new-message": [
    {
      id: "design",
      label: "As drawn (plan chat, 2 new)",
      data: { plan: CLASS, place: "Psycle, Oxford Circus", newCount: 2 },
    },
    { id: "one", label: "Plan chat, 1 new", data: { plan: CLASS, place: "Psycle, Oxford Circus", newCount: 1 } },
    {
      id: "question",
      label: "A question to the host",
      data: { kind: "question", plan: CLIMB, place: "The Arch, Bermondsey Wall", newCount: 1 },
    },
    {
      id: "reply",
      label: "The host replied",
      data: { kind: "reply", plan: CLIMB, place: "The Arch, Bermondsey Wall", newCount: 3, chatUrl: "/members/messages/chat-climb-ask" },
    },
  ],
  "photo-removed": [
    { id: "design", label: "As drawn (not a clear photo)", data: { reason: "not_clear" } },
    { id: "not-member", label: "Not a photo of the member", data: { reason: "not_member" } },
    { id: "not-suitable", label: "Not suitable for the club", data: { reason: "not_suitable" } },
  ],
  "admin-new-report": [
    {
      id: "design",
      label: "As drawn (a message)",
      data: {
        kind: "message",
        reason: "Pressure to pay outside the app",
        about: "Ollie",
        by: "Sam",
        planTitle: "Saturday morning class + brunch",
        sent: SENT,
        open: 2,
      },
    },
    {
      id: "member",
      label: "A member",
      data: { kind: "member", reason: "Harassment or unwanted attention", about: "Ollie", by: "Sam", sent: SENT, open: 3 },
    },
    {
      id: "photo",
      label: "A photo",
      data: { kind: "photo", reason: "It isn’t them", about: "Chloe", by: "Aisha", sent: SENT, open: 1 },
    },
    {
      id: "plan",
      label: "A plan (not drawn)",
      data: { kind: "plan", reason: "Not a real plan", about: "Dan", by: "Priya", planTitle: "Comedy night, two spare tickets", sent: SENT, open: 4 },
    },
  ],
};

export const TEXT_FIXTURES: { [N in TextName]: { id: string; label: string; data: TextData[N] }[] } = {
  welcome: [{ id: "design", label: "Welcome (C-D4 A)", data: {} }],
  "reminders-on": [{ id: "design", label: "Reminders switched on (the check text)", data: {} }],
  "event-reminder": [
    { id: "design", label: "Club event, 24 hours before", data: { window: "24h", title: "Padel & Pints", time: "18:30", place: "Northgate Courts" } },
    { id: "2h", label: "Club event, 2 hours before", data: { window: "2h", title: "Padel & Pints", time: "18:30", place: "Northgate Courts" } },
    {
      id: "held-today",
      label: "Club event, held by quiet hours to 07:00 on the day",
      data: { window: "2h", title: "Padel & Pints", time: "08:30", place: "Northgate Courts", day: "today" },
    },
  ],
  "plan-reminder": [
    {
      id: "design",
      label: "Open Invite plan, 24 hours before",
      data: { window: "24h", title: "Saturday morning class + brunch", time: "10:00", place: "Psycle, Oxford Circus" },
    },
    {
      id: "2h",
      label: "Open Invite plan, 2 hours before",
      data: { window: "2h", title: "Saturday morning class + brunch", time: "10:00", place: "Psycle, Oxford Circus" },
    },
    {
      id: "longest",
      label: "Longest title and place (cut at 40 and 30)",
      data: {
        window: "2h",
        title: "Sunday long run along the canal, then a big breakfast",
        time: "08:00",
        place: "The bandstand by the north gate of Calder Park",
      },
    },
    {
      id: "typed-apostrophe",
      label: "A host typed a curly apostrophe (kept Standard)",
      data: { window: "24h", title: "Sam’s birthday drinks – rooftop", time: "19:00", place: "The Mews Terrace" },
    },
    {
      id: "unicode",
      label: "A letter outside the standard alphabet (Unicode)",
      data: { window: "24h", title: "Zoë’s leaving drinks", time: "19:00", place: "The Mews Terrace" },
    },
  ],
};
