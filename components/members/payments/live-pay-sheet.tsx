"use client";

// Pay and join, for real (15 Nov 2026): the approved pay sheet (./pay-sheet.tsx PayBody draws every state) with
// Stripe's Payment Element where the drawn card fields were. The money flow (lib/server/plan-payments.ts):
//   1. Opening: startPlanPaymentAction holds a place for 10 minutes and makes a PaymentIntent that only holds the
//      card (nothing is taken).
//   2. Pay: elements.submit() first (Apple Pay keeps the tap), then stripe.confirmPayment in place; the bank's check
//      (3-D Secure) is Stripe's own window over the sheet, or a page the browser leaves for and comes back from.
//   3. confirmPlanPaymentAction: the server takes the place under the plan's lock, then the money. A plan that
//      filled first, or a price that changed, lets the card go: "That was the last place" or "The price changed".
// Closing the sheet without paying gives the place back at once (releasePlanHoldAction). A member who leaves for
// the bank's page comes back to the plan with ?payment_intent=... and the page opens this sheet on "Checking your
// payment" (resume).
//
// needs_device_check: Apple Pay in the app and on the web, the Payment Element's fields and keyboard in the sheet,
// Stripe's 3-D Secure window over the sheet, a redirect to the bank and back.

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { PaymentIntent, Stripe, StripeError } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

import { Sheet } from "@/components/members/invite/sheet";
import { getStripe } from "@/components/members/event/stripe-pay";
import { goToSessionEnded, isSessionEnded, type SessionEnded } from "@/components/members/session-ended";
import { STRIPE_APPEARANCE, getStripeErrorMessage } from "@/lib/stripe-ui";
import type { OpenInvite } from "@/lib/members/invite/types";
import {
  confirmPlanPaymentAction,
  releasePlanHoldAction,
  startPlanPaymentAction,
  type ConfirmPayAnswer,
} from "@/app/members/open-invite/pay-actions";
import { PayBody, payLiveLine, type PayState } from "./pay-sheet";

const HOLD_MS = 10 * 60_000;
const LOAD_TIMEOUT_MS = 20_000;
const WITH_FIELDS: PayState[] = ["ready", "paying", "declined", "bank"];

type Failed = { ok: false; error: string };

function declineWords(error: StripeError | null | undefined): string | null {
  if (!error) return null;
  if (error.type === "card_error" && error.code === "card_declined" && (!error.decline_code || error.decline_code === "generic_decline")) return null;
  const words = getStripeErrorMessage(error, "");
  return words ? words.replace(/'/g, "’").replace(/[.!]+\s*$/, ".") : null;
}

export function LivePaySheet({
  invite,
  seeOtherHref,
  resume = null,
  onClose,
  onPaid,
  onFresh,
  onRefused,
}: {
  invite: OpenInvite;
  seeOtherHref: string;
  /** Back from the bank's own page: the PaymentIntent to check. */
  resume?: string | null;
  onClose: () => void;
  /** The place is the member's: the plan as it is now (the page flips to "You're in"). */
  onPaid: (fresh: OpenInvite) => void;
  /** The server's plan, after an answer that changed it (full, a new price). */
  onFresh: (fresh: OpenInvite | null) => void;
  /** The server said no in its own words (the plan was cancelled, started, a block): the refused sheet. */
  onRefused: (message: string) => void;
}) {
  const id = useId();
  const listed = invite.cost?.pricePence ?? 0;
  const [state, setState] = useState<PayState>(resume ? "checking" : "opening");
  const [secret, setSecret] = useState<string | null>(null);
  const [paying, setPaying] = useState(listed);
  const [newPrice, setNewPrice] = useState(listed);
  const [declined, setDeclined] = useState<string | null>(null);
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const done = useRef(false);
  const heldAt = useRef(0);

  const answer = useCallback(
    (result: ConfirmPayAnswer | SessionEnded | Failed) => {
      if (isSessionEnded(result)) return goToSessionEnded();
      if (result.ok) {
        done.current = true;
        if (result.pence) setPaying(result.pence);
        onPaid(result.invite);
        setState("success");
        return;
      }
      if (!("kind" in result)) {
        // The server could not answer after Stripe held the card: the sweep settles it (in, or nothing taken).
        done.current = true;
        setState("pending");
        return;
      }
      onFresh(result.invite);
      if (result.kind === "full") {
        done.current = true;
        setState("full");
      } else if (result.kind === "price-changed") {
        setNewPrice(result.newPricePence ?? listed);
        setState("price");
      } else if (result.kind === "declined") {
        setDeclined(null);
        setState("declined");
      } else if (result.kind === "pending") {
        done.current = true;
        setState("pending");
      } else {
        done.current = true;
        onRefused(result.error);
      }
    },
    [listed, onFresh, onPaid, onRefused],
  );

  const check = useCallback(
    async (paymentIntentId: string) => {
      setState("checking");
      try {
        answer(await confirmPlanPaymentAction(paymentIntentId, invite.id));
      } catch {
        done.current = true;
        setState("pending");
      }
    },
    [answer, invite.id],
  );

  const open = useCallback(async () => {
    setState("opening");
    setSecret(null);
    setDeclined(null);
    try {
      const result = await startPlanPaymentAction(invite.id);
      if (isSessionEnded(result)) return goToSessionEnded();
      if (result.ok) {
        heldAt.current = Date.now();
        setSecret(result.clientSecret);
        setPaying(result.amountPence);
        setState("ready");
        return;
      }
      if ("kind" in result) {
        onFresh(result.invite);
        if (result.kind === "full") {
          done.current = true;
          setState("full");
          return;
        }
        if (result.kind === "already-in") {
          done.current = true;
          setState("success");
          return;
        }
        done.current = true;
        onRefused(result.error);
        return;
      }
      setState("load-error");
    } catch {
      setState("load-error");
    }
  }, [invite.id, onFresh, onRefused]);

  // Once: open payment, or check the one the bank sent the member back with (after the first paint; a second
  // mount in development cancels the first one's timer, so it still happens once).
  useEffect(() => {
    const timer = setTimeout(() => void (resume ? check(resume) : open()), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the sheet opens
  }, []);

  // Stripe.js, once there is a payment to draw fields for.
  const needsStripe = Boolean(secret) && WITH_FIELDS.includes(state);
  useEffect(() => {
    if (!needsStripe || stripe) return;
    let live = true;
    const timer = setTimeout(() => live && setState("load-error"), LOAD_TIMEOUT_MS);
    getStripe()
      .then((instance) => {
        if (!live) return;
        clearTimeout(timer);
        if (instance) setStripe(instance);
        else setState("load-error");
      })
      .catch(() => {
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

  // The 10 minutes: once they are up (and nothing is being paid), the place is no longer held.
  useEffect(() => {
    if (state !== "ready" && state !== "declined") return;
    const left = heldAt.current + HOLD_MS - Date.now();
    const timer = setTimeout(() => setState((now) => (now === "ready" || now === "declined" ? "hold-expired" : now)), Math.max(0, left));
    return () => clearTimeout(timer);
  }, [state]);

  const close = useCallback(() => {
    // Not paid: the place goes back to the plan now (the hold would run out in 10 minutes anyway).
    if (!done.current) void releasePlanHoldAction(invite.id).catch(() => {});
    onClose();
  }, [invite.id, onClose]);

  const dismissable = state !== "paying" && state !== "checking" && state !== "bank";
  const render = (fields: ReactNode | undefined, ready: boolean, onPay: () => void, onCancelBank: () => void) => (
    <Sheet labelledBy={id} onClose={close} dismissable={dismissable} variant="pay">
      <PayBody
        id={id}
        state={state}
        invite={invite}
        listed={listed}
        paying={paying}
        newPricePence={newPrice}
        seeOtherHref={seeOtherHref}
        fields={fields}
        fieldsReady={ready}
        declinedMessage={declined}
        onClose={close}
        onPay={onPay}
        onPayNewPrice={() => void open()}
        onRetry={() => void open()}
        onCancelBank={onCancelBank}
      />
      <span className="mk-sr" role="status" aria-live="polite">
        {payLiveLine(state)}
      </span>
    </Sheet>
  );

  if (stripe && secret && WITH_FIELDS.includes(state)) {
    return (
      <Elements stripe={stripe} options={{ clientSecret: secret, appearance: STRIPE_APPEARANCE }}>
        <PayFlow secret={secret} state={state} setState={setState} setDeclined={setDeclined} check={check} render={render} />
      </Elements>
    );
  }
  const waiting = WITH_FIELDS.includes(state) ? <div className="pay-loading" aria-hidden="true" /> : undefined;
  return render(waiting, false, () => {}, () => setState("ready"));
}

function PayFlow({
  secret,
  state,
  setState,
  setDeclined,
  check,
  render,
}: {
  secret: string;
  state: PayState;
  setState: (state: PayState) => void;
  setDeclined: (words: string | null) => void;
  check: (paymentIntentId: string) => Promise<void>;
  render: (fields: ReactNode, ready: boolean, onPay: () => void, onCancelBank: () => void) => ReactNode;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setState("load-error"), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [ready, setState]);

  async function after(paymentIntent: PaymentIntent | undefined): Promise<void> {
    if (!stripe || !paymentIntent) {
      setDeclined(null);
      setState("declined");
      return;
    }
    if (paymentIntent.status === "requires_action") {
      setState("bank");
      const next = await stripe.handleNextAction({ clientSecret: secret });
      if (next.error) {
        setDeclined(declineWords(next.error));
        setState("declined");
        return;
      }
      return after(next.paymentIntent);
    }
    if (paymentIntent.status === "requires_capture" || paymentIntent.status === "succeeded" || paymentIntent.status === "processing") {
      await check(paymentIntent.id);
      return;
    }
    setDeclined(null);
    setState("declined");
  }

  async function pay() {
    if (!stripe || !elements || state === "paying") return;
    setDeclined(null);
    setState("paying");
    try {
      // First, while the tap still counts (Apple Pay needs it).
      const { error: invalid } = await elements.submit();
      if (invalid) {
        setState("ready");
        return;
      }
      // (Elements was made with the client secret, so confirmPayment takes it from there, as /apply and the event
      // pay sheet do.)
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
        setDeclined(declineWords(error));
        setState("declined");
        return;
      }
      await after(paymentIntent);
    } catch {
      setDeclined(null);
      setState("declined");
    }
  }

  const fields = (
    <div className="pay-stripe">
      <PaymentElement
        onReady={() => setReady(true)}
        onLoadError={() => setState("load-error")}
        options={{
          business: { name: "Club Yuppie" },
          layout: { type: "accordion", defaultCollapsed: false },
          wallets: { applePay: "auto", googlePay: "auto" },
          fields: { billingDetails: { address: { country: "never", postalCode: "auto" } } },
          readOnly: state === "paying",
        }}
      />
    </div>
  );
  return render(state === "bank" ? <div className="pay-bank-fields">{fields}</div> : fields, ready, () => void pay(), () => setState("ready"));
}
