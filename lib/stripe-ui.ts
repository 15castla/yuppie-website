// Stripe's Payment/Setup Elements render inside an isolated iframe and
// can't be styled with regular classes, so this approximates the site's
// own input/label styling via Stripe's own theming API instead. Shared
// between the membership application form (app/apply/apply-form.tsx) and
// the event payment form (components/members/event-payment-form.tsx) so
// both read as the same on-page checkout experience.
export const STRIPE_APPEARANCE = {
  variables: {
    colorPrimary: "#1b1512",
    colorBackground: "#F5F3E7",
    colorText: "#1b1512",
    colorDanger: "#b91c1c",
    fontFamily: "var(--font-almarai), ui-sans-serif, system-ui, sans-serif",
    borderRadius: "12px",
  },
  rules: {
    ".Input": {
      border: "2px solid rgba(27, 21, 18, 0.2)",
      padding: "14px 16px",
    },
    ".Input:focus": {
      border: "2px solid #1b1512",
      boxShadow: "none",
    },
    ".Label": {
      fontSize: "12px",
      fontWeight: "600",
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
      color: "rgba(27, 21, 18, 0.6)",
    },
  },
};

// Shape shared by a Stripe confirm call's own error (from confirmSetup or
// confirmPayment) and a retrieved Intent's last_setup_error /
// last_payment_error, loosely typed rather than imported from
// @stripe/stripe-js so this works with any of them directly.
export type StripeErrorLike =
  | {
      type?: string;
      code?: string;
      decline_code?: string;
      message?: string;
    }
  | null
  | undefined;

// For lost_card, stolen_card and fraudulent, Stripe's own guidance is to
// show a generic decline message rather than the specific reason: doing
// otherwise either tips off someone using a card that isn't theirs, or
// needlessly alarms a legitimate cardholder caught by a false positive.
const GENERIC_DECLINE_MESSAGE =
  "Your card was declined. Please try a different card or contact your bank.";

const DECLINE_CODE_MESSAGES: Record<string, string> = {
  insufficient_funds:
    "Your card was declined for insufficient funds. Please try a different card.",
  lost_card: GENERIC_DECLINE_MESSAGE,
  stolen_card: GENERIC_DECLINE_MESSAGE,
  expired_card: "Your card has expired. Please try a different card.",
  incorrect_cvc:
    "The security code you entered doesn't match your card. Please check it and try again.",
  incorrect_number:
    "The card number you entered is incorrect. Please check it and try again.",
  card_not_supported:
    "This card doesn't support this type of purchase. Please try a different card.",
  currency_not_supported:
    "This card doesn't support payments in GBP. Please try a different card.",
  do_not_honor:
    "Your card issuer declined this payment. Please try a different card or contact your bank.",
  fraudulent: GENERIC_DECLINE_MESSAGE,
  generic_decline: GENERIC_DECLINE_MESSAGE,
  try_again_later:
    "Your card issuer couldn't process this right now. Please try again in a moment.",
  processing_error:
    "There was an error processing your card. Please try again or use a different card.",
};

// Turns a Stripe error into something the person paying can actually act
// on. Stripe's own message is sometimes too generic to be useful on its
// own, most notably "A processing error occurred" for
// setup_intent_unexpected_state, which is really just a stale
// SetupIntent (e.g. confirming again without reloading the page) and
// gives no hint that a refresh is what fixes it.
export function getStripeErrorMessage(
  error: StripeErrorLike,
  fallback: string,
): string {
  if (!error) return fallback;

  if (error.code === "setup_intent_unexpected_state") {
    return "This form timed out, please refresh the page and try again.";
  }

  if (error.type === "card_error" && error.decline_code) {
    return DECLINE_CODE_MESSAGES[error.decline_code] ?? error.message ?? fallback;
  }

  return error.message ?? fallback;
}
