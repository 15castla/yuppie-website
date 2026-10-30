// Booking confirmed (r2a section 4) and cancelling a booking (r2a section 5, rule A-D1 B, the moved-event
// exception C-D11), as pure views. Kit counterparts: pages_r2a confirmed_body() and cancel_body().

import { Button, Icon } from "@/components/members/kit";
import { BACK_5_10, MoneyList, PayActions, PayHead, PayMark } from "@/components/members/payments/pay-parts";
import { ROUTES } from "@/lib/members/routes";
import { EvIcon } from "./ev-icons";
import { AddressTile, EventSummary } from "./sheet-parts";
import { gbp, mailtoClub, type EventPageBooking, type EventPageEvent } from "./model";

type SheetEvent = Pick<EventPageEvent, "title" | "startTime" | "location" | "pricePence">;

// ---------------------------------------------------------------------------- booking confirmed

export function ConfirmedSheetBody({
  id,
  event,
  booking,
  memberEmail,
  cancelLine,
  showGoogle,
  onDone,
}: {
  id: string;
  event: SheetEvent;
  booking: Pick<EventPageBooking, "amountPence" | "address" | "icsUrl" | "googleUrl">;
  memberEmail: string;
  /** "Cancel until Tue 27 Oct, 18:30 and you get it all back." (or its included, moved or late form). */
  cancelLine: string;
  /** The web adds a Google Calendar link under Add to calendar; the app opens the same .ics. */
  showGoogle: boolean;
  onDone: () => void;
}) {
  const paid = booking.amountPence > 0;
  return (
    <>
      <PayMark icon="check" />
      <PayHead id={id} title="You’re booked." />
      <EventSummary
        event={event}
        line={paid ? { label: "Paid", pence: booking.amountPence } : { label: "Included in your membership", pence: 0 }}
      />
      <AddressTile className="bk-addr" place={event.location} address={booking.address} />
      <MoneyList
        items={[
          {
            icon: "mail",
            text: booking.address
              ? `We’ve emailed your booking and this address to ${memberEmail}.`
              : `We’ve emailed your booking to ${memberEmail}.`,
          },
          { icon: "clock", text: "We’ll remind you 24 hours and 2 hours before." },
          { icon: "undo", text: cancelLine },
        ]}
      />
      <PayActions>
        <a className="mk-btn mk-block" href={booking.icsUrl} download>
          <EvIcon name="calendar-plus" size={20} />
          Add to calendar
        </a>
        {showGoogle && booking.googleUrl ? (
          <a className="ea-gcal bk-gcal" href={booking.googleUrl} target="_blank" rel="noopener noreferrer">
            Or add it to Google Calendar
          </a>
        ) : null}
        <Button block variant="outline" onClick={onDone}>
          Done
        </Button>
      </PayActions>
    </>
  );
}

// ---------------------------------------------------------------------------- cancelling

export const CANCEL_STATES = ["ask", "cancelling", "late", "done", "error"] as const;
export type CancelState = (typeof CANCEL_STATES)[number];

/** How it ended, for the done state. */
export type CancelOutcome = {
  /** What went back to the card (0: included, or cancelled without a refund). */
  refundPence: number;
  /** The refund was refused by Stripe: the booking is cancelled and the club is sorting it out. */
  refundFailed?: boolean;
  /** What was paid for the booking (the page's booking is gone by the time this shows). */
  paidPence?: number;
};

export const cancelDismissable = (state: CancelState) => state !== "cancelling";

export function CancelSheetBody({
  id,
  state,
  event,
  booking,
  memberEmail,
  hours,
  outcome,
  /** What the last try was: the in-time cancel, or the late one without a refund. Cancelling… keeps the same red button. */
  late = false,
  onKeep,
  onCancel,
  onCancelLate,
  onRetry,
  onClose,
}: {
  id: string;
  state: CancelState;
  event: SheetEvent;
  booking: Pick<EventPageBooking, "amountPence" | "moved">;
  memberEmail: string;
  hours: number;
  outcome?: CancelOutcome | null;
  late?: boolean;
  onKeep: () => void;
  onCancel: () => void;
  onCancelLate: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const paid = booking.amountPence > 0;
  const price = gbp(booking.amountPence);
  const summary = <EventSummary event={event} line={paid ? { label: "You paid", pence: booking.amountPence } : null} />;
  const automatic = booking.moved
    ? "We moved this event, so this is automatic, whatever the date."
    : `It’s more than ${hours} hours until the event, so this is automatic.`;

  if (state === "ask") {
    return (
      <>
        <PayHead id={id} title="Cancel your booking?" onClose={onClose} />
        <p className="pay-p">
          {paid ? `You’ll get your ${price} back in full.` : "Your spot goes back to the club."} You can book again if there’s room.
        </p>
        {summary}
        <MoneyList
          items={
            paid
              ? [
                  { icon: "undo", text: `${price} goes back to your card. It usually lands in ${BACK_5_10}.` },
                  { icon: "clock", text: automatic },
                ]
              : [
                  { icon: "users", text: "Your spot goes back to the club, so someone else can take it." },
                  { icon: "clock", text: automatic },
                ]
          }
        />
        <PayActions>
          <Button block onClick={onKeep}>
            Keep my booking
          </Button>
          <Button block variant="outline" className="pay-danger" onClick={onCancel}>
            {paid ? `Cancel and get ${price} back` : "Cancel my booking"}
          </Button>
        </PayActions>
      </>
    );
  }

  if (state === "cancelling") {
    return (
      <>
        <PayHead id={id} title={late && paid ? "Too late to cancel here." : "Cancel your booking?"} onClose={onClose} closeOff />
        <p className="pay-p">Cancelling now. Please stay on this screen.</p>
        {summary}
        <PayActions>
          <Button block className="bk-dim" aria-disabled="true">
            Keep my booking
          </Button>
          <Button block variant="outline" className="pay-danger" pending>
            Cancelling…
          </Button>
        </PayActions>
      </>
    );
  }

  // An included event inside the 48 hours: there is no money to refund, so no refund words. The member can still
  // give the spot back (QA1-05); the server takes it as a cancel without a refund (onCancelLate).
  if (state === "late" && !paid) {
    return (
      <>
        <PayHead id={id} title="Cancel your booking?" onClose={onClose} />
        <p className="pay-p">Your spot goes back to the club. You can book again if there’s room.</p>
        {summary}
        <MoneyList items={[{ icon: "users", text: "Your spot goes back to the club, so someone else can take it." }]} />
        <PayActions>
          <Button block onClick={onKeep}>
            Keep my booking
          </Button>
          <Button block variant="outline" className="pay-danger" onClick={onCancelLate}>
            Cancel my booking
          </Button>
        </PayActions>
      </>
    );
  }

  if (state === "late") {
    return (
      <>
        <PayHead id={id} title="Too late to cancel here." onClose={onClose} />
        <p className="pay-p">
          It’s less than {hours} hours until {event.title}, so we can’t refund you automatically. Email us and we’ll see what we can do.
        </p>
        {summary}
        <MoneyList items={[{ icon: "banknote", text: `If you cancel without asking, your ${price} isn’t refunded.` }]} />
        <PayActions>
          <Button block href={mailtoClub(`Cancelling: ${event.title}`)} icon={<Icon name="mail" size={20} />}>
            Email us
          </Button>
          <Button block variant="outline" onClick={onKeep}>
            Keep my booking
          </Button>
          <Button variant="quiet" danger onClick={onCancelLate}>
            Cancel without a refund
          </Button>
        </PayActions>
      </>
    );
  }

  if (state === "done") {
    const refunded = (outcome?.refundPence ?? 0) > 0;
    const failed = Boolean(outcome?.refundFailed);
    const back = gbp(outcome?.refundPence ?? 0);
    // What was paid, from the outcome (the booking itself is gone from the page once it refreshes).
    const paidPence = outcome?.paidPence ?? booking.amountPence;
    return (
      <>
        <PayMark icon="check" />
        <PayHead id={id} title="Booking cancelled." />
        <p className="pay-p">Your spot is back with the club.{refunded ? ` Your ${back} is refunded in full.` : ""}</p>
        <MoneyList
          items={
            refunded
              ? [
                  { icon: "undo", text: `Your ${back} is on its way back to your card. It usually lands in ${BACK_5_10}.` },
                  { icon: "mail", text: `A receipt is on its way to ${memberEmail}.` },
                ]
              : failed
                ? [
                    { icon: "undo", text: `Your ${gbp(outcome?.paidPence ?? booking.amountPence)} refund didn’t go through straight away. We’ve told the club, and we’ll email you when it’s done.` },
                    { icon: "mail", text: `We’ve emailed ${memberEmail} to confirm.` },
                  ]
                : late && paidPence > 0
                  ? [
                      // Cancelled inside the 48 hours without a refund: say plainly that the money stays taken (QA1-06).
                      { icon: "banknote", text: `Your ${gbp(paidPence)} isn’t refunded, because it was less than ${hours} hours before.` },
                      { icon: "mail", text: "We’ve emailed you to confirm." },
                    ]
                  : [{ icon: "mail", text: "We’ve emailed you to confirm." }]
          }
        />
        <PayActions>
          <Button block href={ROUTES.events}>
            See other events
          </Button>
          <Button block variant="outline" onClick={onClose}>
            Done
          </Button>
        </PayActions>
      </>
    );
  }

  // error
  return (
    <>
      <PayMark icon="circle-alert" tone="bad" />
      <PayHead id={id} title="We couldn’t cancel." />
      <p className="pay-p">
        <b>Your booking is still on.</b> Check your connection and try again.{paid ? " Nothing was refunded yet." : ""}
      </p>
      <PayActions>
        <Button block onClick={onRetry}>
          Try again
        </Button>
        <Button block variant="outline" onClick={onClose}>
          Close
        </Button>
      </PayActions>
    </>
  );
}

export function cancelStatus(state: CancelState, paid = true): string {
  switch (state) {
    case "cancelling":
      return "Cancelling now. Please stay on this screen.";
    case "done":
      return "Booking cancelled.";
    case "error":
      return "We couldn’t cancel. Your booking is still on.";
    case "late":
      return paid ? "Too late to cancel here." : "";
    default:
      return "";
  }
}
