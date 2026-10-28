import "server-only";

// The refunds job (QA3-07): refunds Stripe never answered (a crash, a
// timeout, a Stripe error) are tried again with the same idempotency key;
// cancelled bookings whose refund never started are refunded; refunds Stripe
// holds as pending are asked about again. After the last failed try the club
// is alerted (admin-booking-review, refund_failed). The work is in
// lib/server/bookings.ts runRefunds, next to refundBooking.

export { runRefunds, type RefundsSummary } from "../bookings";
