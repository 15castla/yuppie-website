"use client";

// The event page (/members/events/[slug], r2a sections 1 to 5): the hero, the cream band, the fixed price and
// booking bar on a phone (it replaces the tab bar on this page only) or the card on the right from 768px, and
// the sheets: pay and book, booking confirmed, cancel. A pure view of its props: the page hands in everything
// the server decided (app/members/events/[slug]/page.tsx); the preview harness hands in example data, a starting
// state and stand-in actions.
//
// The rules that keep money safe live on the server (lib/server/bookings.ts, app/members/events/actions.ts);
// this view only never offers a second payment once one has gone through or is still processing.

import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { BackRow, Main, Pill } from "@/components/members/kit";
import { useShell } from "@/components/members/shell/shell-context";
import { ROUTES } from "@/lib/members/routes";
import * as liveActions from "@/app/members/events/actions";
import type {
  CancelBookingResult,
  ConfirmEventPaymentResult,
  CreateEventPaymentIntentResult,
  MyBooking,
} from "@/app/members/events/actions";
import { CancelSheetBody, ConfirmedSheetBody, cancelDismissable, cancelStatus, type CancelOutcome, type CancelState } from "./booking-sheets";
import { BookingCard, DesktopCard, EventBand, EventBar, EventHero, HeroNote, type BarState } from "./event-parts";
import { PaySheetBody, payDismissable, payStatus, type PayState } from "./pay-sheet-body";
import { DemoPayFields, EventSheet } from "./sheet-parts";
import { StripePaySheet, type PayOutcome } from "./stripe-pay";
import {
  eventPhase,
  freeUntilLine,
  gbp,
  isPaid,
  reasonClause,
  spotsLeft,
  whenLine,
  toPageBooking,
  type EventPageBooking,
  type EventPageData,
} from "./model";

import "./event.css";

export type EventActions = {
  rsvp: (formData: FormData) => Promise<{ success: boolean; error?: string; bookingId?: string }>;
  createPaymentIntent: (formData: FormData) => Promise<CreateEventPaymentIntentResult>;
  confirmPayment: (paymentIntentId: string, eventId: string) => Promise<ConfirmEventPaymentResult>;
  cancel: (bookingId: string, options?: { withoutRefund?: boolean }) => Promise<CancelBookingResult>;
  getBooking: (eventId: string) => Promise<MyBooking | null>;
};

const LIVE_ACTIONS: EventActions = {
  rsvp: liveActions.rsvpToEvent,
  createPaymentIntent: liveActions.createEventPaymentIntent,
  confirmPayment: liveActions.confirmEventPayment,
  cancel: liveActions.cancelBooking,
  getBooking: liveActions.getMyBooking,
};

const BOOKING_FAILED = "We couldn’t book your spot. Nothing was taken. Please try again.";
const PAID_NOT_BOOKED = "Paid, but not booked yet. Please don’t pay again: we’ll sort it out by email.";

export type EventSheetState =
  | { kind: "pay"; state: PayState; clientSecret: string | null; attempt: number }
  | { kind: "confirmed"; booking: EventPageBooking }
  | { kind: "cancel"; state: CancelState; late: boolean; outcome?: CancelOutcome | null };

/** The preview harness only: where the page starts (the live page always starts at rest). */
export type EventPageStart = {
  busy?: "booking" | null;
  /** A payment that is still processing (or paid but not booked): the bar says Processing. */
  pending?: boolean;
  message?: string | null;
  sheet?: EventSheetState | null;
};

export function EventPageView({
  data,
  actions = LIVE_ACTIONS,
  start,
  demo = false,
}: {
  data: EventPageData;
  actions?: EventActions;
  start?: EventPageStart;
  /** The preview harness: draw the design's fields in the pay sheet instead of loading Stripe. */
  demo?: boolean;
}) {
  const router = useRouter();
  const { mode } = useShell();
  const showGoogle = mode !== "app";
  const { event } = data;
  const paid = isPaid(event);
  const hours = data.freeCancelHours;

  const [, startRefresh] = useTransition();
  const [busy, setBusy] = useState<"booking" | null>(start?.busy ?? null);
  const [pending, setPending] = useState(start?.pending ?? false);
  const [message, setMessage] = useState<string | null>(start?.message ?? null);
  const [sheet, setSheet] = useState<EventSheetState | null>(start?.sheet ?? null);
  const cardRef = useRef<HTMLDivElement>(null);
  const sheetId = useId();

  // The booking as the server last said, unless this tab has just booked or cancelled and the server's new
  // answer has not arrived yet. A new answer from the server always wins.
  const serverKey = data.booking?.bookingId ?? "none";
  const [local, setLocal] = useState<{ key: string; booking: EventPageBooking | null } | null>(null);
  const booking = local && local.key === serverKey ? local.booking : data.booking;

  const phase = eventPhase({ ...data, booking });
  const left = spotsLeft(data);

  const refresh = () => startRefresh(() => router.refresh());

  // ------------------------------------------------------------------ words that depend on the 48-hour rule
  const until = freeUntilLine(booking?.freeUntil ?? data.freeUntil);
  const windowOpen = booking ? booking.freeNow : data.freeWindowOpen;
  const lateMoney = paid
    ? `It’s less than ${hours} hours to go, so there’s no refund if you cancel.`
    : "Change of plan? Tell us, so someone else can take your spot.";
  const bookableCancelLine = windowOpen
    ? paid
      ? `Cancel until ${until} and you get it all back.`
      : `Change of plan? Cancel any time until ${until}.`
    : lateMoney;
  const cardFine = windowOpen ? (paid ? `Cancel until ${until} and you get it all back.` : `Cancel any time until ${until}.`) : lateMoney;
  const confirmedCancelLine = (b: EventPageBooking) =>
    b.freeNow
      ? b.amountPence > 0
        ? `Cancel until ${freeUntilLine(b.freeUntil)} and you get it all back.`
        : `Cancel until ${freeUntilLine(b.freeUntil)} and your spot goes back to the club.`
      : b.amountPence > 0
        ? `It’s less than ${hours} hours to go, so this booking can’t be refunded.`
        : "If you can’t come, tell us so someone else can take your spot.";

  let bookingFine = "";
  if (booking) {
    const bPaid = booking.amountPence > 0;
    if (data.started) bookingFine = "It has started, so it can’t be cancelled.";
    else if (booking.moved) bookingFine = bPaid ? "We moved this event, so you can cancel for a full refund until it starts." : "We moved this event, so you can cancel any time until it starts.";
    else if (booking.freeNow) bookingFine = bPaid ? `Free until ${until}. Your ${gbp(booking.amountPence)} goes back to your card.` : `Free until ${until}.`;
    else bookingFine = bPaid ? `It’s less than ${hours} hours to go, so there’s no refund if you cancel now.` : `It’s less than ${hours} hours to go. If you can’t come, please tell us.`;
  }
  const canCancel = Boolean(booking) && !data.started && phase === "booked";

  // ------------------------------------------------------------------ the bar's state
  let bar: BarState;
  if (phase === "cancelled") bar = "cancelled";
  else if (phase === "booked") bar = "booked";
  else if (phase === "past") bar = "past";
  else if (pending) bar = "processing";
  else if (phase === "full") bar = "full";
  else if (busy === "booking") bar = "booking";
  else bar = "open";

  // ------------------------------------------------------------------ back from the bank (a redirect)
  const returning = data.paymentReturn ?? null;
  const handledReturn = useRef(false);
  useEffect(() => {
    if (!returning || handledReturn.current || demo) return;
    handledReturn.current = true;
    // The address bar loses Stripe's parameters, so a reload does not check again.
    window.history.replaceState(null, "", window.location.pathname);
    setSheet({ kind: "pay", state: "returning", clientSecret: returning.clientSecret, attempt: 0 });
    actions
      .confirmPayment(returning.paymentIntentId, event.id)
      .then(async (result) => {
        if (result.booked) return showConfirmed();
        if (result.pending || result.reason === "check_failed") {
          setPending(true);
          setSheet({ kind: "pay", state: "processing", clientSecret: null, attempt: 0 });
          return;
        }
        if (result.reason === "not_paid") {
          setSheet({ kind: "pay", state: "declined", clientSecret: returning.clientSecret, attempt: 0 });
          return;
        }
        setPending(true);
        setMessage(PAID_NOT_BOOKED);
        setSheet({ kind: "pay", state: "confirm-failed", clientSecret: null, attempt: 0 });
      })
      .catch(() => {
        setPending(true);
        setSheet({ kind: "pay", state: "processing", clientSecret: null, attempt: 0 });
      });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------ booking
  async function showConfirmed() {
    let fresh: MyBooking | null = null;
    try {
      fresh = await actions.getBooking(event.id);
    } catch {
      fresh = null;
    }
    setPending(false);
    setMessage(null);
    if (fresh) {
      const b = toPageBooking(fresh);
      setLocal({ key: serverKey, booking: b });
      setSheet({ kind: "confirmed", booking: b });
    } else {
      setSheet(null);
    }
    refresh();
  }

  async function startPayment(attempt: number) {
    const formData = new FormData();
    formData.set("event_id", event.id);
    // The price the member was shown (the server refuses if it changed) and a new attempt id each time
    // payment opens (one PaymentIntent per attempt).
    formData.set("price_pence", String(event.pricePence));
    formData.set("attempt_id", typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`);
    let result: CreateEventPaymentIntentResult;
    try {
      result = await actions.createPaymentIntent(formData);
    } catch {
      result = { success: false, error: "Something went wrong starting payment. Please try again.", reason: "error" };
    }
    if (result.success) {
      setSheet({ kind: "pay", state: "ready", clientSecret: result.clientSecret, attempt });
      return;
    }
    if (!result.reason || result.reason === "error") {
      setSheet({ kind: "pay", state: "load-error", clientSecret: null, attempt });
      return;
    }
    setSheet(null);
    setMessage(result.error);
    if (result.reason !== "no_customer") refresh();
  }

  async function book() {
    if (busy || pending) return;
    setMessage(null);
    setBusy("booking");
    try {
      if (paid) {
        await startPayment(1);
        return;
      }
      const formData = new FormData();
      formData.set("event_id", event.id);
      let result: Awaited<ReturnType<EventActions["rsvp"]>>;
      try {
        result = await actions.rsvp(formData);
      } catch {
        result = { success: false, error: BOOKING_FAILED };
      }
      if (!result.success) {
        setMessage(result.error ?? BOOKING_FAILED);
        refresh();
        return;
      }
      await showConfirmed();
    } finally {
      setBusy(null);
    }
  }

  function onPayOutcome(outcome: PayOutcome) {
    if (outcome === "booked") {
      void showConfirmed();
      return;
    }
    setPending(true);
    if (outcome === "paid-not-booked") setMessage(PAID_NOT_BOOKED);
  }

  function seeBooking() {
    const card = cardRef.current;
    if (!card) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    card.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ cancelling
  function openCancel() {
    if (!booking) return;
    setSheet({ kind: "cancel", state: booking.freeNow ? "ask" : "late", late: !booking.freeNow });
  }

  async function doCancel(withoutRefund: boolean) {
    if (!booking) return;
    setSheet({ kind: "cancel", state: "cancelling", late: withoutRefund });
    let result: CancelBookingResult;
    try {
      result = await actions.cancel(booking.bookingId, withoutRefund ? { withoutRefund: true } : {});
    } catch {
      result = { ok: false, reason: "error", error: "" };
    }
    if (result.ok) {
      setLocal({ key: serverKey, booking: null });
      setSheet({
        kind: "cancel",
        state: "done",
        late: withoutRefund,
        outcome: {
          refundPence: result.refund === "succeeded" || result.refund === "pending" ? result.refundPence : 0,
          refundFailed: result.refund === "failed",
          paidPence: booking.amountPence,
        },
      });
      refresh();
      return;
    }
    if (result.reason === "late") {
      setSheet({ kind: "cancel", state: "late", late: true });
      return;
    }
    if (result.reason === "already_cancelled") {
      setLocal({ key: serverKey, booking: null });
      setSheet({ kind: "cancel", state: "done", late: withoutRefund, outcome: { refundPence: 0, paidPence: booking.amountPence } });
      refresh();
      return;
    }
    setSheet({ kind: "cancel", state: "error", late: withoutRefund });
  }

  // ------------------------------------------------------------------ the hero's pill and note
  let pill: ReactNode;
  if (phase === "booked") pill = <Pill kind="ink">Booked</Pill>;
  else if (phase === "past") pill = <Pill kind="muted">Past event</Pill>;
  else if (phase === "full") pill = <Pill kind="muted">Fully booked</Pill>;
  else if (phase === "cancelled") pill = <Pill kind="muted">Cancelled</Pill>;
  else pill = <Pill>{paid ? `${gbp(event.pricePence)}pp` : "Included"}</Pill>;

  let note: ReactNode = null;
  if (phase === "cancelled") {
    const because = reasonClause(event.cancelNote);
    const mine = data.clubCancelled;
    note = (
      <HeroNote icon="info">
        {because ? (
          <>
            <b>This event is cancelled</b> because {because}. It can’t be booked.
          </>
        ) : (
          <>
            <b>This event is cancelled,</b> so it can’t be booked.
          </>
        )}
        {mine
          ? mine.amountPence > 0 && mine.refunded
            ? ` Your booking is cancelled and your ${gbp(mine.amountPence)} is on its way back to your card.`
            : " Your booking is cancelled."
          : null}
      </HeroNote>
    );
  } else if (bar === "processing") {
    note = (
      <HeroNote icon="hourglass">
        <b>Payment processing.</b> We’ll email you as soon as your booking is confirmed. Please don’t pay again.
      </HeroNote>
    );
  } else if (phase === "past") {
    note = (
      <HeroNote icon="info">
        <b>This event has already started,</b> so it can’t be booked.
      </HeroNote>
    );
  } else if (phase === "booked" && booking?.moved && !data.started) {
    note = (
      <HeroNote icon="calendar-x">
        <b>We’ve changed this event.</b> Check the time and place.{" "}
        {booking.amountPence > 0
          ? "If it no longer suits you, you can cancel for a full refund, whatever the date."
          : "If it no longer suits you, you can cancel any time before it starts."}
      </HeroNote>
    );
  }

  const spots =
    phase === "cancelled"
      ? null
      : data.started
        ? { text: `${data.bookedCount} booked` }
        : left <= 0
          ? { text: "None left", bad: true }
          : { text: `${left} of ${event.capacity} left` };

  const moneyLines =
    bar === "open" || bar === "booking" || bar === "processing"
      ? paid
        ? [
            { icon: "banknote" as const, text: `${gbp(event.pricePence)} is taken from your card when you book.` },
            { icon: "undo" as const, text: bookableCancelLine },
          ]
        : [{ icon: "undo" as const, text: bookableCancelLine }]
      : null;

  // ------------------------------------------------------------------ the sheet
  let sheetEl: ReactNode = null;
  if (sheet?.kind === "pay") {
    const close = () => setSheet(null);
    const payLine = bookableCancelLine;
    if (demo) {
      const fieldsMode = sheet.state === "paying" ? "off" : sheet.state === "declined" ? "error" : "empty";
      sheetEl = (
        <EventSheet labelledBy={sheetId} onClose={close} dismissable={payDismissable(sheet.state)} status={payStatus(sheet.state, gbp(event.pricePence))}>
          <PaySheetBody
            id={sheetId}
            state={sheet.state}
            event={event}
            memberEmail={data.memberEmail}
            cancelLine={payLine}
            fields={<DemoPayFields mode={fieldsMode} />}
            onPay={() => setSheet({ ...sheet, state: "paying" })}
            onCancelBank={() => setSheet({ ...sheet, state: "ready" })}
            onRetry={() => setSheet({ ...sheet, state: "ready" })}
            onClose={close}
          />
        </EventSheet>
      );
    } else {
      sheetEl = (
        <StripePaySheet
          key={`${sheet.attempt}-${sheet.clientSecret ?? "none"}-${sheet.state === "returning" ? "r" : ""}`}
          clientSecret={sheet.clientSecret}
          initialState={sheet.state}
          event={event}
          memberEmail={data.memberEmail}
          cancelLine={payLine}
          confirm={actions.confirmPayment}
          onOutcome={onPayOutcome}
          onRetry={() => {
            setSheet(null);
            setBusy("booking");
            void startPayment(sheet.attempt + 1).finally(() => setBusy(null));
          }}
          onClose={close}
        />
      );
    }
  } else if (sheet?.kind === "confirmed") {
    sheetEl = (
      <EventSheet labelledBy={sheetId} onClose={() => setSheet(null)} dismissable status="You’re booked.">
        <ConfirmedSheetBody
          id={sheetId}
          event={event}
          booking={sheet.booking}
          memberEmail={data.memberEmail}
          cancelLine={confirmedCancelLine(sheet.booking)}
          showGoogle={showGoogle}
          onDone={() => setSheet(null)}
        />
      </EventSheet>
    );
  } else if (sheet?.kind === "cancel" && (booking || sheet.state === "done")) {
    const shown = booking ?? data.booking;
    sheetEl = (
      <EventSheet labelledBy={sheetId} onClose={() => setSheet(null)} dismissable={cancelDismissable(sheet.state)} status={cancelStatus(sheet.state)}>
        <CancelSheetBody
          id={sheetId}
          state={sheet.state}
          late={sheet.late}
          event={event}
          booking={shown ?? { amountPence: 0, moved: false }}
          memberEmail={data.memberEmail}
          hours={hours}
          outcome={sheet.outcome}
          onKeep={() => setSheet(null)}
          onCancel={() => void doCancel(false)}
          onCancelLate={() => void doCancel(true)}
          onRetry={() => void doCancel(sheet.late)}
          onClose={() => setSheet(null)}
        />
      </EventSheet>
    );
  }

  const card = (
    <DesktopCard
      state={bar}
      event={event}
      booking={booking}
      message={message}
      cancelFine={phase === "booked" ? bookingFine : cardFine}
      startedLine={`It started ${whenLine(event.startTime)}`}
      showGoogle={showGoogle}
      onBook={() => void book()}
      onCancel={openCancel}
      canCancel={canCancel}
    />
  );

  return (
    <>
      <Main className="ea-main">
        <BackRow href={ROUTES.events} label="Events" />
        <EventHero event={event} pill={pill} note={note} spots={spots} booked={phase === "booked" || phase === "cancelled"} card={card} />
        <EventBand
          event={event}
          moneyLines={moneyLines}
          bookingCard={
            phase === "booked" && booking ? (
              <BookingCard
                event={event}
                booking={booking}
                memberEmail={data.memberEmail}
                started={data.started}
                cancelFine={bookingFine}
                canCancel={canCancel}
                showGoogle={showGoogle}
                onCancel={openCancel}
                cardRef={cardRef}
              />
            ) : null
          }
        />
      </Main>
      <EventBar state={bar} event={event} booking={booking} message={message} onBook={() => void book()} onSeeBooking={seeBooking} />
      {sheetEl}
    </>
  );
}
