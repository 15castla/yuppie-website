"use client";

// The real pay sheet: Stripe's Payment Element inside the approved sheet (pay-sheet-body.tsx draws every state).
// The money flow is today's, unchanged in substance:
//   1. createEventPaymentIntent (the page, before this opens) makes the PaymentIntent for the event's price.
//   2. Pay: stripe.confirmPayment in place (redirect only if the method needs it).
//   3. confirmEventPayment asks Stripe on the server and books only on "succeeded" (the webhook books it too;
//      book_event makes the second call a no-op). "processing" books nothing yet.
// What is new (r2a section 3): close is off while paying, a declined card says nothing was taken, a payment that
// went through but did not book shows "Paid, but not booked yet." with no pay button (so it cannot be paid twice),
// "Your payment is processing." has its own sheet, and Stripe.js not loading shows "We couldn't open payment."
// Stripe.js is loaded only when this sheet opens, not on every event page.
//
// needs_device_check: Apple Pay, the Payment Element's own fields and keyboard, Stripe's 3-D Secure window over
// the sheet, a redirect to the bank and back (the page reopens the sheet in "Checking your payment").

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { PaymentIntent, Stripe, StripeError } from "@stripe/stripe-js";
// The pure entry: Stripe.js is fetched only when loadStripe() is called (the plain entry fetches it on import,
// on every page that so much as imports this file).
import { loadStripe } from "@stripe/stripe-js/pure";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

import { STRIPE_APPEARANCE, getStripeErrorMessage } from "@/lib/stripe-ui";
import type { ConfirmEventPaymentResult } from "@/app/members/events/actions";
import { PaySheetBody, payDismissable, payStatus, type PayState } from "./pay-sheet-body";
import { EventSheet } from "./sheet-parts";
import { gbp, type EventPageEvent } from "./model";

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "", {
      developerTools: { assistant: { enabled: false } },
    }).catch((err: unknown) => {
      stripePromise = null;
      throw err;
    });
  }
  return stripePromise;
}

/** How long Stripe's fields may take to appear before the sheet says it couldn't open payment. */
const LOAD_TIMEOUT_MS = 20000;

const WITH_FIELDS: PayState[] = ["ready", "paying", "declined", "bank"];

export type PayOutcome = "booked" | "pending" | "paid-not-booked";

function declineWords(error: StripeError | null | undefined): string | null {
  if (!error) return null;
  // A plain decline: the design's own words ("Your card was declined. Nothing was taken. Try another card or Apple Pay.").
  if (error.type === "card_error" && error.code === "card_declined" && (!error.decline_code || error.decline_code === "generic_decline")) {
    return null;
  }
  const words = getStripeErrorMessage(error, "");
  return words ? words.replace(/'/g, "\u2019") : null;
}

export function StripePaySheet({
  clientSecret,
  initialState = "ready",
  event,
  memberEmail,
  cancelLine,
  confirm,
  onOutcome,
  onRetry,
  onClose,
}: {
  /** Null when the PaymentIntent could not be made (then the sheet opens on "We couldn't open payment"). */
  clientSecret: string | null;
  initialState?: PayState;
  event: EventPageEvent;
  memberEmail: string;
  cancelLine: string;
  confirm: (paymentIntentId: string, eventId: string) => Promise<ConfirmEventPaymentResult>;
  /** The payment ended in a booking, a pending payment, or money taken with no booking. */
  onOutcome: (outcome: PayOutcome) => void;
  /** Try again from "We couldn't open payment": the page makes (or reuses) the PaymentIntent again. */
  onRetry: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const [state, setState] = useState<PayState>(clientSecret ? initialState : "load-error");
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [declined, setDeclined] = useState<string | null>(null);
  const needsStripe = Boolean(clientSecret) && WITH_FIELDS.includes(state);

  useEffect(() => {
    if (!needsStripe || stripe) return;
    let live = true;
    const timer = setTimeout(() => {
      if (live) setState("load-error");
    }, LOAD_TIMEOUT_MS);
    getStripe()
      .then((instance) => {
        if (!live) return;
        clearTimeout(timer);
        if (instance) setStripe(instance);
        else setState("load-error");
      })
      .catch((err: unknown) => {
        console.error("Stripe.js did not load:", err);
        if (live) {
          clearTimeout(timer);
          setState("load-error");
        }
      });
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [needsStripe, stripe]);

  const body = (fields: ReactNode, ready: boolean, onPay?: () => void, onCancelBank?: () => void) => (
    <EventSheet labelledBy={id} onClose={onClose} dismissable={payDismissable(state)} status={payStatus(state, gbp(event.pricePence))}>
      <PaySheetBody
        id={id}
        state={state}
        event={event}
        memberEmail={memberEmail}
        cancelLine={cancelLine}
        fields={fields}
        fieldsReady={ready}
        declinedMessage={declined}
        onPay={onPay}
        onCancelBank={onCancelBank}
        onRetry={onRetry}
        onClose={onClose}
      />
    </EventSheet>
  );

  if (stripe && clientSecret && WITH_FIELDS.includes(state)) {
    return (
      <Elements stripe={stripe} options={{ clientSecret, appearance: STRIPE_APPEARANCE }}>
        <PayFlow
          clientSecret={clientSecret}
          eventId={event.id}
          state={state}
          setState={setState}
          setDeclined={setDeclined}
          confirm={confirm}
          onOutcome={onOutcome}
          render={body}
        />
      </Elements>
    );
  }
  return body(<div className="bk-stripe" aria-hidden="true" />, false);
}

function PayFlow({
  clientSecret,
  eventId,
  state,
  setState,
  setDeclined,
  confirm,
  onOutcome,
  render,
}: {
  clientSecret: string;
  eventId: string;
  state: PayState;
  setState: (state: PayState) => void;
  setDeclined: (words: string | null) => void;
  confirm: (paymentIntentId: string, eventId: string) => Promise<ConfirmEventPaymentResult>;
  onOutcome: (outcome: PayOutcome) => void;
  render: (fields: ReactNode, ready: boolean, onPay?: () => void, onCancelBank?: () => void) => ReactNode;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const busy = useRef(false);

  // Stripe's fields never drew: the same sheet as Stripe.js not loading.
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setState("load-error"), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [ready, setState]);

  async function afterStripe(paymentIntent: PaymentIntent | undefined) {
    if (!stripe || !paymentIntent) {
      setDeclined(null);
      setState("declined");
      return;
    }
    if (paymentIntent.status === "requires_action") {
      // Our side of the bank's check; Stripe draws the bank's own screen over it.
      setState("bank");
      const next = await stripe.handleNextAction({ clientSecret });
      if (next.error) {
        setDeclined(declineWords(next.error));
        setState("declined");
        return;
      }
      return afterStripe(next.paymentIntent);
    }
    if (paymentIntent.status !== "succeeded" && paymentIntent.status !== "processing") {
      setDeclined(null);
      setState("declined");
      return;
    }
    let result: ConfirmEventPaymentResult;
    try {
      result = await confirm(paymentIntent.id, eventId);
    } catch (err) {
      // Stripe took it but the page could not reach us: the webhook books it; never offer Pay again.
      console.error("confirmEventPayment did not answer:", err);
      setState("processing");
      onOutcome("pending");
      return;
    }
    if (result.booked) {
      onOutcome("booked");
      return;
    }
    if (result.pending) {
      setState("processing");
      onOutcome("pending");
      return;
    }
    if (result.reason === "not_paid") {
      setDeclined(null);
      setState("declined");
      return;
    }
    if (result.reason === "check_failed") {
      setState("processing");
      onOutcome("pending");
      return;
    }
    setState("confirm-failed");
    onOutcome("paid-not-booked");
  }

  async function pay() {
    if (!stripe || !elements || busy.current) return;
    busy.current = true;
    setDeclined(null);
    setState("paying");
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}${window.location.pathname}`,
          payment_method_data: { billing_details: { address: { country: "GB" } } },
        },
        redirect: "if_required",
      });
      if (error) {
        if (error.type === "validation_error") {
          setState("ready");
          return;
        }
        console.error("Stripe confirmPayment failed:", error);
        setDeclined(declineWords(error));
        setState("declined");
        return;
      }
      await afterStripe(paymentIntent);
    } catch (err) {
      console.error("Paying failed:", err);
      setDeclined(null);
      setState("declined");
    } finally {
      busy.current = false;
    }
  }

  const fields = (
    <div className="bk-stripe">
      <PaymentElement
        onReady={() => setReady(true)}
        onLoadError={(event) => {
          console.error("The Payment Element did not load:", event.error);
          setState("load-error");
        }}
        options={{
          layout: { type: "accordion", defaultCollapsed: false },
          wallets: { applePay: "auto", googlePay: "auto" },
          fields: { billingDetails: { address: { country: "never", postalCode: "auto" } } },
          readOnly: state === "paying",
        }}
      />
    </div>
  );
  return render(fields, ready, pay, () => setState("ready"));
}
