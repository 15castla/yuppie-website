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

/**
 * The card a membership payment was tried on (QA3-13): the invoice's own, else the subscription's default,
 * else the customer's invoice default (subscription invoices usually carry none of their own). Best effort.
 */
export async function cardLabelForMembership(
  invoicePaymentMethodId: string | null | undefined,
  subscriptionId: string | null | undefined,
  customerId: string | null | undefined,
): Promise<string | null> {
  const asId = (v: unknown): string | null => (typeof v === "string" ? v : v && typeof v === "object" && "id" in v && typeof v.id === "string" ? v.id : null);
  let pm = invoicePaymentMethodId ?? null;
  try {
    if (!pm && subscriptionId) pm = asId((await stripe.subscriptions.retrieve(subscriptionId)).default_payment_method);
    if (!pm && customerId) {
      const customer = await stripe.customers.retrieve(customerId);
      if (!("deleted" in customer && customer.deleted)) pm = asId((customer as Stripe.Customer).invoice_settings?.default_payment_method);
    }
  } catch {
    return null;
  }
  return cardLabelForPaymentMethod(pm);
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
