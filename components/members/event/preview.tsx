"use client";

// PREVIEW HARNESS ONLY (app/dev-preview/registry/member-flows.tsx): the event page with stand-in actions, so its
// buttons can be pressed with no login and no database. EXAMPLE DATA: the answers are made up from the example
// booking the registry passes in. Never used by a live page.

import type { CancelBookingResult } from "@/app/members/events/actions";
import { EventPageView, type EventActions, type EventPageStart } from "./event-page-view";
import type { EventPageBooking, EventPageData } from "./model";

const wait = (ms = 900) => new Promise((resolve) => setTimeout(resolve, ms));

export function EventPagePreview({
  data,
  start,
  fail,
  bookAs,
}: {
  data: EventPageData;
  start?: EventPageStart;
  /** Make a stand-in action answer with a failure. */
  fail?: "rsvp" | "cancel";
  /** What "Book my spot" books (the confirmed sheet's data). */
  bookAs: EventPageBooking;
}) {
  const event = data.event;
  const actions: EventActions = {
    rsvp: async () => {
      await wait();
      return fail === "rsvp" ? { success: false, error: "That was the last spot. Someone booked just before you." } : { success: true, bookingId: bookAs.bookingId };
    },
    createPaymentIntent: async () => {
      await wait();
      return { success: true, clientSecret: "example_secret" };
    },
    confirmPayment: async () => {
      await wait();
      return { booked: true };
    },
    cancel: async (): Promise<CancelBookingResult> => {
      await wait(1200);
      return fail === "cancel"
        ? { ok: false, reason: "error", error: "" }
        : { ok: true, refund: event.pricePence ? "succeeded" : "none", refundPence: event.pricePence, late: false };
    },
    getBooking: async () => {
      await wait(200);
      return { ...bookAs, calendarUrl: bookAs.icsUrl };
    },
  };
  return <EventPageView data={data} start={start} demo actions={actions} />;
}
