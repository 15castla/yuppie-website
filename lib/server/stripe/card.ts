import "server-only";

import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";

const BRANDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
};

/** "Visa ending 4242", or null when the card is not known. */
export function cardLabel(pm: Stripe.PaymentMethod | string | null | undefined): string | null {
  if (!pm || typeof pm === "string") return null;
  const card = pm.card;
  if (!card?.last4) return null;
  const brand = BRANDS[card.brand] ?? (card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : "Card");
  return `${brand} ending ${card.last4}`;
}

/** The card a PaymentIntent was paid with. Best effort: null on any failure. */
export async function cardLabelForPaymentIntent(paymentIntentId: string | null | undefined): Promise<string | null> {
  if (!paymentIntentId) return null;
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["payment_method"] });
    return cardLabel(pi.payment_method as Stripe.PaymentMethod | string | null);
  } catch {
    return null;
  }
}

/** A payment method by id. Best effort: null on any failure. */
export async function cardLabelForPaymentMethod(paymentMethodId: string | null | undefined): Promise<string | null> {
  if (!paymentMethodId) return null;
  try {
    return cardLabel(await stripe.paymentMethods.retrieve(paymentMethodId));
  } catch {
    return null;
  }
}
