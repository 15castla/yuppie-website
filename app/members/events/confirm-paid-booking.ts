import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import { confirmPaidBooking as recordPaidBooking } from "@/lib/server/bookings";

// The one place a paid booking row is ever made, kept under its old name and
// signature for the page's confirmEventPayment (actions.ts). The work is
// lib/server/bookings.ts confirmPaidBooking (the Stripe webhook calls it
// directly): the PaymentIntent must have succeeded, carry this member and
// event, and be for the event's price in pounds; book_event then records it
// under the event row lock, so the page and the webhook can both call this
// for one payment, in either order or at once, and only one row is made.
// "Paid twice" and "over capacity" still book and alert the club, as before.
//
// Not in actions.ts because every export of a "use server" file becomes a
// callable server action.
export async function confirmPaidBooking(
  paymentIntentId: string,
  memberId: string,
  eventId: string,
  paymentIntent?: Stripe.PaymentIntent,
): Promise<{ booked: boolean; bookingId?: string }> {
  let pi = paymentIntent;
  if (!pi || pi.id !== paymentIntentId) {
    try {
      pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (err) {
      console.error(`confirmPaidBooking: couldn't retrieve payment intent ${paymentIntentId}:`, err);
      return { booked: false };
    }
  }
  if (pi.metadata?.member_id !== memberId || pi.metadata?.event_id !== eventId) {
    console.error(`confirmPaidBooking: payment intent ${paymentIntentId} is not for member ${memberId}, event ${eventId}`);
    return { booked: false };
  }
  const result = await recordPaidBooking(pi);
  return result.booked ? { booked: true, bookingId: result.bookingId } : { booked: false };
}
