"use client";

import { useEffect, useState, type FormEvent } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

import { Button } from "@/components/Button";
import { STRIPE_APPEARANCE, getStripeErrorMessage } from "@/lib/stripe-ui";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
  {
    developerTools: {
      assistant: {
        enabled: false,
      },
    },
  },
);

const FALLBACK_ERROR = "Something went wrong confirming your payment. Please try again.";

function PaymentForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handles the return trip when confirmPayment ends up redirecting the
  // browser away (Apple Pay, some 3D Secure checks) instead of resolving
  // in place. Stripe appends these query params on the way back. Unlike
  // apply-form.tsx's equivalent effect, there's no follow-up server
  // action to call here: the booking itself gets created by the Stripe
  // webhook (app/api/stripe/webhook/route.ts) once payment_intent.succeeded
  // arrives, not by anything driven from this page.
  useEffect(() => {
    if (!stripe) return;

    const params = new URLSearchParams(window.location.search);
    const paymentIntentClientSecret = params.get("payment_intent_client_secret");
    const redirectStatus = params.get("redirect_status");

    if (!paymentIntentClientSecret || !redirectStatus) return;

    async function handleRedirectReturn() {
      try {
        setSubmitting(true);

        const { paymentIntent, error: retrieveError } =
          await stripe!.retrievePaymentIntent(paymentIntentClientSecret!);

        if (redirectStatus === "failed") {
          // Retrieved (rather than assumed generic) so the specific
          // reason on the PaymentIntent's own last_payment_error, if
          // there is one, can be shown instead of a one-size-fits-all
          // message regardless of why it actually failed.
          setError(getStripeErrorMessage(paymentIntent?.last_payment_error, FALLBACK_ERROR));
          return;
        }

        if (retrieveError || !paymentIntent) {
          console.error("retrievePaymentIntent failed after redirect:", {
            retrieveError,
            paymentIntent,
          });
          setError(FALLBACK_ERROR);
          return;
        }

        if (paymentIntent.status === "succeeded" || paymentIntent.status === "processing") {
          onSuccess();
          return;
        }

        setError(FALLBACK_ERROR);
      } catch (err) {
        console.error("Unexpected error handling redirect return:", err);
        const detail = err instanceof Error ? err.message : String(err);
        setError(
          `Something went wrong confirming your payment: ${detail}. Please try again or contact us if this keeps happening.`,
        );
      } finally {
        setSubmitting(false);
        window.history.replaceState(null, "", window.location.pathname);
      }
    }

    handleRedirectReturn();
    // Only re-run if the Stripe instance itself changes (e.g. becomes
    // available after initial load). This reads a one-time URL param and
    // clears it, not something that should re-fire on other renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setError(null);
    setSubmitting(true);

    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}${window.location.pathname}`,
          payment_method_data: {
            billing_details: {
              address: {
                country: "GB",
              },
            },
          },
        },
        redirect: "if_required",
      });

      if (stripeError) {
        console.error("Stripe confirmPayment failed:", stripeError);
        setError(getStripeErrorMessage(stripeError, FALLBACK_ERROR));
        return;
      }

      if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
        onSuccess();
        return;
      }

      console.error("Stripe confirmPayment returned unexpected status:", paymentIntent);
      setError(FALLBACK_ERROR);
    } catch (err) {
      console.error("Unexpected error in handleSubmit:", err);
      const detail = err instanceof Error ? err.message : String(err);
      setError(
        `Something went wrong confirming your payment: ${detail}. Please try again or contact us if this keeps happening.`,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <PaymentElement
        options={{
          layout: { type: "accordion", defaultCollapsed: false },
          wallets: { applePay: "auto", googlePay: "auto" },
          fields: {
            billingDetails: {
              address: { country: "never", postalCode: "auto" },
            },
          },
        }}
      />

      {error && <p className="text-sm font-medium text-red-700">{error}</p>}

      <Button type="submit" disabled={submitting} className="w-full disabled:transition-none">
        {submitting ? "Processing…" : "Confirm and pay"}
      </Button>
    </form>
  );
}

export function EventPaymentForm({
  clientSecret,
  onSuccess,
}: {
  clientSecret: string;
  onSuccess: () => void;
}) {
  return (
    <Elements
      stripe={stripePromise}
      options={{ clientSecret, appearance: STRIPE_APPEARANCE }}
    >
      <PaymentForm onSuccess={onSuccess} />
    </Elements>
  );
}
