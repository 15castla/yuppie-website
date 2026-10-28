// Pay and book: every state of the booking and payment sheet for a paid event (r2a section 3), as a pure view.
// The real page (stripe-pay.tsx) puts Stripe's own Payment Element in `fields`; the preview harness puts the
// design's drawn Apple Pay and card box there (DemoPayFields). Kit counterpart: pages_r2a book_body().
//
//   ready           Apple Pay first, card under it, "You’ll pay £25", two money lines
//   paying          close is off, the fields are off, "Paying…", "Taking your £25. Please stay on this screen."
//   declined        red alert under the fields: nothing taken, try another card or Apple Pay
//   bank            "Check with your bank." (3-D Secure, our side only; the bank draws its own screen)
//   returning       back from the bank: "Checking your payment."
//   processing      the payment has not cleared: no booking yet, do not pay again, Done
//   confirm-failed  paid, but not booked: no pay button at all, Email us and Close
//   refunded        paid, but it could never be booked (the event was cancelled or started, or the membership
//                   ended, while paying), so the server refunded it at once: no pay button, See other events
//   load-error      we couldn't open payment: nothing taken, Try again and Close
//
// The free and included path never opens this sheet: one tap books and the confirmed sheet opens.

import type { ReactNode } from "react";

import { Button, Icon } from "@/components/members/kit";
import { BACK_5_10, MoneyList, PayActions, PayHead, PayMark } from "@/components/members/payments/pay-parts";
import { ROUTES } from "@/lib/members/routes";
import { EventSummary } from "./sheet-parts";
import { gbp, mailtoClub, type EventPageEvent } from "./model";

export const PAY_STATES = ["ready", "paying", "declined", "bank", "returning", "processing", "confirm-failed", "refunded", "load-error"] as const;
export type PayState = (typeof PAY_STATES)[number];

/** Close allowed (the scrim, Escape, the corner button)? Never while money is being taken or checked. */
export const payDismissable = (state: PayState) => state !== "paying" && state !== "returning";

export function PaySheetBody({
  id,
  state,
  event,
  memberEmail,
  cancelLine,
  fields,
  fieldsReady = true,
  declinedMessage,
  onPay,
  onClose,
  onCancelBank,
  onRetry,
}: {
  id: string;
  state: PayState;
  event: Pick<EventPageEvent, "title" | "startTime" | "location" | "pricePence">;
  memberEmail: string;
  /** "Cancel until Tue 27 Oct, 18:30 and you get it all back." (or the inside-48-hours line). */
  cancelLine: string;
  /** Stripe's Payment Element (the page) or the drawn fields (the preview). */
  fields: ReactNode;
  /** The Payment Element has drawn: Pay can be pressed. */
  fieldsReady?: boolean;
  /** The decline's own words when Stripe gives a reason other than a plain decline. */
  declinedMessage?: string | null;
  onPay?: () => void;
  onClose: () => void;
  onCancelBank?: () => void;
  onRetry?: () => void;
}) {
  const price = gbp(event.pricePence);
  const subject = `Booking: ${event.title}`;

  if (state === "ready" || state === "paying" || state === "declined") {
    const busy = state === "paying";
    const bad = state === "declined";
    return (
      <>
        <PayHead
          id={id}
          title="Pay and book."
          sub={busy ? `Taking your ${price}. Please stay on this screen.` : "Your spot is booked as soon as the payment goes through."}
          onClose={onClose}
          closeOff={busy}
        />
        <EventSummary event={event} line={{ label: "You’ll pay", pence: event.pricePence }} />
        <MoneyList
          items={[
            { icon: "banknote", text: `${price} is taken from your card when you tap Pay.` },
            ...(bad ? [] : [{ icon: "undo" as const, text: cancelLine }]),
          ]}
        />
        <div className={`bk-fields${busy ? " is-off" : ""}`} aria-busy={!fieldsReady || undefined}>
          {fields}
        </div>
        {bad ? (
          <div className="pay-alert" role="alert">
            <Icon name="circle-alert" size={18} />
            <span>
              {declinedMessage ? (
                <>
                  <b>That payment didn’t go through.</b> {declinedMessage} Nothing was taken.
                </>
              ) : (
                <>
                  <b>Your card was declined.</b> Nothing was taken. Try another card or Apple Pay.
                </>
              )}
            </span>
          </div>
        ) : null}
        <PayActions tight={bad}>
          <Button
            block
            pending={busy}
            disabled={!busy && !fieldsReady}
            icon={busy ? undefined : <Icon name="lock" size={18} />}
            onClick={busy ? undefined : onPay}
          >
            {busy ? "Paying…" : `Pay ${price}`}
          </Button>
        </PayActions>
      </>
    );
  }

  if (state === "bank") {
    return (
      <>
        <PayMark icon="shield-check" tone="line" />
        <PayHead id={id} title="Check with your bank." />
        <p className="pay-p">Your bank wants to check it’s you. This is normal for card payments.</p>
        <ol className="pay-steps">
          {["Open your banking app, or follow the steps on your bank’s screen.", `Approve the ${price} payment.`, "You’ll come straight back here."].map(
            (step, index) => (
              <li className="pay-step" key={step}>
                <span className="mk-serif">{index + 1}</span>
                <span>{step}</span>
              </li>
            ),
          )}
        </ol>
        <MoneyList items={[{ icon: "banknote", text: `Nothing has been taken yet. Your ${price} only leaves your account when you approve it.` }]} />
        <PayActions>
          <Button block variant="outline" onClick={onCancelBank}>
            Cancel payment
          </Button>
        </PayActions>
      </>
    );
  }

  if (state === "returning") {
    return (
      <>
        <PayMark icon="refresh" tone="line" />
        <PayHead id={id} title="Checking your payment." />
        <p className="pay-p">You’re back from your bank. We’re checking that your {price} went through. Please stay on this screen.</p>
        <EventSummary event={event} />
        <PayActions>
          <Button block pending>
            Checking…
          </Button>
        </PayActions>
      </>
    );
  }

  if (state === "processing") {
    return (
      <>
        <PayMark icon="hourglass" tone="line" />
        <PayHead id={id} title="Your payment is processing." />
        <p className="pay-p">It hasn’t cleared yet, so your booking isn’t confirmed. Please don’t pay again.</p>
        <EventSummary event={event} />
        <MoneyList
          items={[
            { icon: "mail", text: `We’ll email ${memberEmail} as soon as your booking is confirmed.` },
            { icon: "banknote", text: `If it doesn’t clear, your ${price} is never taken.` },
          ]}
        />
        <PayActions>
          <Button block onClick={onClose}>
            Done
          </Button>
        </PayActions>
      </>
    );
  }

  if (state === "confirm-failed") {
    return (
      <>
        <PayMark icon="circle-alert" tone="bad" />
        <PayHead id={id} title="Paid, but not booked yet." />
        <p className="pay-p">
          We took your {price} but couldn’t confirm your booking. <b>Please don’t pay again.</b> Email us and we’ll sort it out. If we can’t book you
          in, we’ll refund you.
        </p>
        <EventSummary event={event} line={{ label: "Taken", pence: event.pricePence }} />
        <PayActions>
          <Button block href={mailtoClub(subject)} icon={<Icon name="mail" size={20} />}>
            Email us
          </Button>
          <Button block variant="outline" onClick={onClose}>
            Close
          </Button>
        </PayActions>
      </>
    );
  }

  if (state === "refunded") {
    return (
      <>
        <PayMark icon="undo" tone="line" />
        <PayHead id={id} title="We couldn’t book you in." />
        <p className="pay-p">
          Your payment went through, but this event can’t be booked any more. <b>We’ve refunded your {price} in full.</b>
        </p>
        <EventSummary event={event} line={{ label: "Refunded", pence: event.pricePence }} />
        <MoneyList items={[{ icon: "undo", text: `Your ${price} is on its way back to your card. It usually lands in ${BACK_5_10}.` }]} />
        <PayActions>
          <Button block href={ROUTES.events}>
            See other events
          </Button>
          <Button block variant="outline" onClick={onClose}>
            Close
          </Button>
        </PayActions>
      </>
    );
  }

  // load-error
  return (
    <>
      <PayMark icon="circle-alert" tone="bad" />
      <PayHead id={id} title="We couldn’t open payment." />
      <p className="pay-p">
        <b>Nothing was taken.</b> Check your connection and try again.
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

/** What a screen reader hears when the sheet changes. */
export function payStatus(state: PayState, price: string): string {
  switch (state) {
    case "paying":
      return `Taking your ${price}. Please stay on this screen.`;
    case "declined":
      return "Your card was declined. Nothing was taken.";
    case "returning":
      return "Checking your payment.";
    case "processing":
      return "Your payment is processing.";
    case "confirm-failed":
      return "Paid, but not booked yet.";
    case "refunded":
      return "We couldn’t book you in. Your payment is refunded.";
    case "load-error":
      return "We couldn’t open payment. Nothing was taken.";
    default:
      return "";
  }
}

export { BACK_5_10 };
