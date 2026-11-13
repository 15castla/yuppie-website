// Spending Club Yuppie credit on Club events (12 Nov 2026): it comes off at payment automatically; a price it covers
// books with no card; a refundable cancel puts the card part back on the card and the credit part back on their
// credit; a late cancel keeps both; the club cancelling an event gives both back; credit spent elsewhere meanwhile
// is caught. On the Phase B server built with NEXT_PUBLIC_MEMBERS_NOMINATIONS=on, migration 20261112090000 applied.
//
//   PHASE_B_BASE=http://localhost:3241 node tests/e2e/phase-b/21-credit.mjs
import {
  action, adminSession, done, eq, fakePay, fakesMark, fakesSince, fd, makeEvent, makeMemberWithPhoto, messages, ok, q, sql, sql1, stripe, waitFor,
} from './lib.mjs';

const admin = await adminSession('bf.');
const NONE = 'http://127.0.0.1:9/none';
const balance = (id) => sql1(`select coalesce(sum(amount_pence), 0)::int as p from credit_ledger where member_id = ${q(id)}`).p;
const give = async (m, pence, why = 'Test credit') => eq((await action('admin.credit.adminAdjustCredit', [m.id, pence, why], admin)).result.ok, true, `Admin gives ${pence}p of credit`);
const bookingOf = (m, ev) => sql1(`select id, status, amount_pence, credit_pence, stripe_payment_intent_id, refund_status, refund_pence from bookings where member_id = ${q(m.id)} and event_id = ${q(ev.id)} order by booked_at desc limit 1`);
const piOf = (secret) => secret.split('_secret')[0];

// ---------------------------------------------------------------- part credit, part card
const m = await makeMemberWithPhoto('cr');
await give(m, 1000);
const ev = await makeEvent('crpaid', { price: 2500 });
const r = (await action('events.createEventPaymentIntent', [fd({ event_id: ev.id, price_pence: '2500', attempt_id: 'attempt-cr-0001' })], m.session)).result;
eq([r.success, r.payPence, r.creditPence], [true, 1500, 1000], 'a £25 event with £10 of credit: the card pays £15');
const pi = piOf(r.clientSecret);
const made = (await stripe('GET', `payment_intents/${pi}`)).json;
eq([made.amount, made.metadata?.credit_pence], [1500, '1000'], 'the PaymentIntent is for £15 and says £10 of credit');
eq(balance(m.id), 1000, 'nothing is taken from the credit before the card pays');
await fakePay(pi, NONE);
eq((await action('events.confirmEventPayment', [pi, ev.id], m.session)).result, { booked: true }, 'paid: booked');
let b = bookingOf(m, ev);
eq([b.status, b.amount_pence, b.credit_pence, b.stripe_payment_intent_id], ['confirmed', 1500, 1000, pi], 'the booking: £15 by card, £10 of credit');
eq(balance(m.id), 0, 'the £10 of credit is taken');
eq((await action('events.confirmEventPayment', [pi, ev.id], m.session)).result, { booked: true }, 'the page asks again (or the webhook): still booked');
eq(sql(`select id from credit_ledger where dedupe_key = ${q(`pi:${pi}`)}`).length, 1, 'the credit is taken once');
await waitFor(() => messages(`booking_id = ${q(b.id)} and template = 'booking-confirmed' and status = 'sent'`).length === 1, 'the booking email is sent');

// Cancel in time: £15 to the card, £10 back on the credit.
const mark = fakesMark();
const cancel = (await action('events.cancelBooking', [b.id], m.session)).result;
eq([cancel.ok, cancel.refund, cancel.refundPence, cancel.creditPence], [true, 'succeeded', 1500, 1000], 'cancelled in time: £15 refunded to the card, £10 back on the credit');
eq(balance(m.id), 1000, 'the credit is £10 again');
const refunds = fakesSince(mark, 'stripe').filter((l) => l.method === 'POST' && l.path === '/v1/refunds');
eq(refunds.map((l) => l.body.amount), ['1500'], 'Stripe refunds £15 only');
await waitFor(() => messages(`booking_id = ${q(b.id)} and template = 'booking-cancelled' and status = 'sent'`).length === 1, 'the cancel email is sent');
eq((await action('events.cancelBooking', [b.id], m.session)).result.ok, false, 'cancelling again: refused');
eq(balance(m.id), 1000, 'and no second credit back');

// ---------------------------------------------------------------- credit covers it: no card
const ev2 = await makeEvent('crfull', { price: 800 });
const r2 = (await action('events.createEventPaymentIntent', [fd({ event_id: ev2.id, price_pence: '800', attempt_id: 'attempt-cr-0002' })], m.session)).result;
eq(r2, { success: true, coveredByCredit: true, creditPence: 800, balancePence: 1000 }, 'an £8 event with £10 of credit: covered, no PaymentIntent');
const stripeMark = fakesMark();
eq((await action('events.bookWithCredit', [fd({ event_id: ev2.id, price_pence: '800', attempt_id: 'attempt-cr-0002' })], m.session)).result, { booked: true }, 'Book with credit: booked');
eq(fakesSince(stripeMark, 'stripe').filter((l) => l.method === 'POST').length, 0, 'nothing went to Stripe');
b = bookingOf(m, ev2);
eq([b.status, b.amount_pence, b.credit_pence, b.stripe_payment_intent_id], ['confirmed', 0, 800, null], 'the booking: £8 of credit, no card');
eq(balance(m.id), 200, '£2 of credit left');
const again = (await action('events.bookWithCredit', [fd({ event_id: ev2.id, price_pence: '800', attempt_id: 'attempt-cr-0002' })], m.session)).result;
eq([again.booked, again.reason], [false, 'already_booked'], 'a double tap: already booked');
eq(balance(m.id), 200, 'and the credit is not taken twice or given back');
await waitFor(() => messages(`booking_id = ${q(b.id)} and template = 'booking-confirmed' and status = 'sent'`).length === 1, 'the booking email is sent');
const c2 = (await action('events.cancelBooking', [b.id], m.session)).result;
eq([c2.ok, c2.refund, c2.refundPence, c2.creditPence], [true, 'none', 0, 800], 'cancelled in time: £8 back on the credit, nothing to a card');
eq(balance(m.id), 1000, 'the credit is £10 again');

// Not enough credit, a full event, a changed price: nothing taken.
const ev3 = await makeEvent('crdear', { price: 5000 });
eq((await action('events.bookWithCredit', [fd({ event_id: ev3.id, price_pence: '5000', attempt_id: 'attempt-cr-0003' })], m.session)).result.reason, 'not_enough_credit', 'not enough credit: refused');
eq(balance(m.id), 1000, 'nothing taken');
const ev4 = await makeEvent('crfullup', { price: 500, capacity: 1 });
const other = await makeMemberWithPhoto('cro');
await svc_book(other, ev4);
eq((await action('events.bookWithCredit', [fd({ event_id: ev4.id, price_pence: '500', attempt_id: 'attempt-cr-0004' })], m.session)).result.reason, 'full', 'a full event: refused');
eq(balance(m.id), 1000, 'the credit is put back');
eq((await action('events.bookWithCredit', [fd({ event_id: ev2.id, price_pence: '700', attempt_id: 'attempt-cr-0005' })], m.session)).result.reason, 'price_changed', 'the price changed: refused');
eq(balance(m.id), 1000, 'nothing taken');

// ---------------------------------------------------------------- late cancel keeps it; the club cancelling gives it back
const soon = await makeEvent('crsoon', { price: 600, startInHours: 24 });
eq((await action('events.bookWithCredit', [fd({ event_id: soon.id, price_pence: '600', attempt_id: 'attempt-cr-0006' })], m.session)).result, { booked: true }, 'a credit booking inside 48 hours');
b = bookingOf(m, soon);
eq((await action('events.cancelBooking', [b.id], m.session)).result.reason, 'late', 'cancelling late: asks first');
const late = (await action('events.cancelBooking', [b.id, { withoutRefund: true }], m.session)).result;
eq([late.ok, late.creditPence], [true, 0], 'cancelled without a refund: no credit back');
eq(balance(m.id), 400, 'the £6 stays spent');

const clubEv = await makeEvent('crclub', { price: 300 });
eq((await action('events.bookWithCredit', [fd({ event_id: clubEv.id, price_pence: '300', attempt_id: 'attempt-cr-0007' })], m.session)).result, { booked: true }, 'a credit booking');
eq(balance(m.id), 100, '£1 left');
eq((await action('admin.eventBookings.adminCancelEvent', [clubEv.id, {}], admin)).result.ok ?? true, true, 'the club cancels the event');
await waitFor(() => balance(m.id) === 400, 'the club cancelling gives the £3 back');
await waitFor(() => messages(`booking_id = ${q(bookingOf(m, clubEv).id)} and template = 'event-cancelled' and status = 'sent'`).length === 1, 'the event-cancelled email is sent');

// ---------------------------------------------------------------- credit spent elsewhere while paying
const evA = await makeEvent('crrace', { price: 1000 });
const rA = (await action('events.createEventPaymentIntent', [fd({ event_id: evA.id, price_pence: '1000', attempt_id: 'attempt-cr-0008' })], m.session)).result;
eq([rA.payPence, rA.creditPence], [600, 400], 'a £10 event with £4 of credit: £6 by card');
await action('admin.credit.adminAdjustCredit', [m.id, -400, 'Spent elsewhere (test)'], admin);
eq(balance(m.id), 0, 'meanwhile the credit goes');
const piA = piOf(rA.clientSecret);
await fakePay(piA, NONE);
eq((await action('events.confirmEventPayment', [piA, evA.id], m.session)).result, { booked: true }, 'the card part paid: still booked');
eq(bookingOf(m, evA).credit_pence, 0, 'no credit was there to take');
eq(balance(m.id), 0, 'and the credit does not go below £0');
await waitFor(() => messages(`template = 'admin-alert' and dedupe_key = ${q(`credit-short:${piA}`)} and status = 'sent'`).length === 1, 'the club is told the credit was short');

// ---------------------------------------------------------------- booked by the webhook alone
await give(m, 500);
const evW = await makeEvent('crhook', { price: 2000 });
const rW = (await action('events.createEventPaymentIntent', [fd({ event_id: evW.id, price_pence: '2000', attempt_id: 'attempt-cr-0009' })], m.session)).result;
eq([rW.payPence, rW.creditPence], [1500, 500], '£20 with £5 of credit');
await fakePay(piOf(rW.clientSecret));
await waitFor(() => bookingOf(m, evW)?.status === 'confirmed', 'the webhook books it');
eq([bookingOf(m, evW).amount_pence, bookingOf(m, evW).credit_pence, balance(m.id)], [1500, 500, 0], 'the webhook takes the credit too');

// ---------------------------------------------------------------- the member's history
const hist = sql(`select amount_pence, kind from credit_ledger where member_id = ${q(m.id)} order by created_at`).map((r) => `${r.kind}:${r.amount_pence}`);
ok(hist.includes('booking:-1000') && hist.includes('refund:1000') && hist.includes('booking:-800') && hist.includes('refund:800'), 'the ledger has each spend and each refund', hist);

done();

/** A booking for someone else, straight through book_event (to fill an event). */
async function svc_book(member, event) {
  const { svc } = await import('./lib.mjs');
  const { data, error } = await svc.rpc('book_event', { p_member: member.id, p_event: event.id, p_amount: 0, p_payment_intent: null, p_allow_over_capacity: false });
  if (error || data?.status !== 'booked') throw new Error(`svc_book: ${error?.message ?? data?.status}`);
}
