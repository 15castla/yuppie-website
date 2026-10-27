// Cancelling a booking (A-D1, C-D11) and refunds: free until 48 hours before with an automatic Stripe
// refund (idempotency key refund-booking-<id>), "late" inside 48 hours unless without a refund, the
// moved-event exception, included events, a refund Stripe refuses (left failed, club alerted, member
// emailed once it is refunded by hand), the same cancel twice at once (one refund), booking again after
// cancelling.
import {
  action, done, emailsTo, emit, eq, exec, fakeState, fakesMark, fakesSince, fd, makeBooking, makeEvent, makeMember,
  memberSession, messages, ok, q, sql, sql1, svc, waitFor,
} from './lib.mjs';

const row = (id) => sql1(`select status, cancelled_by, cancel_reason, refund_status, refund_pence, stripe_refund_id, refund_error from bookings where id = ${q(id)}`);
const refundsFor = (mark, pi) => fakesSince(mark, 'stripe').filter((l) => l.path === '/v1/refunds' && l.method === 'POST' && l.body.payment_intent === pi);

const m = await makeMember('cx1');
const s = await memberSession(m.email);

// ---- free window, paid: refunded automatically
const paid = await makeEvent('cxpaid', { price: 2500, startInHours: 24 * 10 });
const b1 = await makeBooking(m, paid);
let mark = fakesMark();
const c1 = await action('events.cancelBooking', [b1.id], s);
eq(c1.result, { ok: true, refund: 'succeeded', refundPence: 2500, late: false }, 'more than 48 hours before: cancelled and refunded £25');
const r1 = row(b1.id);
eq([r1.status, r1.cancelled_by, r1.cancel_reason, r1.refund_status, r1.refund_pence], ['cancelled', 'member', 'member', 'succeeded', 2500], 'the booking row records it');
ok(r1.stripe_refund_id?.startsWith('re_'), 'with the Stripe refund id');
const calls = refundsFor(mark, b1.pi);
eq(calls.length, 1, 'one refund call to Stripe');
eq([calls[0].idem, calls[0].body.amount], [`refund-booking-${b1.id}`, '2500'], 'idempotency key refund-booking-<id>, full amount');
await waitFor(() => messages(`booking_id = ${q(b1.id)} and template = 'booking-cancelled' and status = 'sent'`).length === 1, 'booking-cancelled email sent');
await waitFor(() => emailsTo(mark, m.email).length === 1, 'to the member');
eq((await action('events.cancelBooking', [b1.id], s)).result.reason, 'already_cancelled', 'cancelling again: already cancelled');
eq(refundsFor(mark, b1.pi).length, 1, 'and no second refund');
eq(((await fakeState()).refunds ? Object.values((await fakeState()).refunds).filter((r) => r.payment_intent === b1.pi) : []).length, 1, 'Stripe holds exactly one refund for the payment');

// ---- book again after cancelling (one confirmed booking per member and event, not one row)
const inc = await makeEvent('cxinc', { price: 0 });
const r2 = await action('events.rsvpToEvent', [fd({ event_id: inc.id })], s);
eq((await action('events.cancelBooking', [r2.result.bookingId], s)).result, { ok: true, refund: 'none', refundPence: 0, late: false }, 'an included booking cancels with nothing to refund');
await waitFor(() => messages(`booking_id = ${q(r2.result.bookingId)} and template = 'booking-cancelled'`).length === 1, 'and its booking-cancelled email');
const r3 = await action('events.rsvpToEvent', [fd({ event_id: inc.id })], s);
ok(r3.result.success, 'the member can book the same event again after cancelling', r3);
eq(sql(`select status from bookings where member_id = ${q(m.id)} and event_id = ${q(inc.id)} order by booked_at`).map((x) => x.status), ['cancelled', 'confirmed'], 'two rows: the cancelled one and the new one');

// ---- inside 48 hours: late
const soon = await makeEvent('cxsoon', { price: 1800, startInHours: 30 });
const b2 = await makeBooking(m, soon, { bookedAgoHours: 100 });
mark = fakesMark();
const late = await action('events.cancelBooking', [b2.id], s);
eq([late.result.ok, late.result.reason], [false, 'late'], 'inside 48 hours: refused as late');
ok(new Date(late.result.freeUntil).getTime() < Date.now(), 'with the free-cancel deadline (already passed)');
eq(row(b2.id).status, 'confirmed', 'the booking still stands');
const late2 = await action('events.cancelBooking', [b2.id, { withoutRefund: true }], s);
eq(late2.result, { ok: true, refund: 'none', refundPence: 0, late: true }, 'Cancel without a refund: cancelled, nothing refunded');
eq([row(b2.id).cancel_reason, row(b2.id).refund_status], ['member_late', 'none'], 'recorded as a late cancel, refund none');
eq(refundsFor(mark, b2.pi).length, 0, 'no refund call');
await waitFor(() => messages(`booking_id = ${q(b2.id)} and template = 'booking-cancelled' and status = 'sent'`).length === 1, 'the member is emailed (no refund)');

// ---- the 48-hour line itself
const edgeOut = await makeEvent('cxedge1', { price: 1000, startInHours: 48 + 0.2 });
const edgeIn = await makeEvent('cxedge2', { price: 1000, startInHours: 48 - 0.2 });
const be1 = await makeBooking(m, edgeOut, { bookedAgoHours: 50 });
const be2 = await makeBooking(m, edgeIn, { bookedAgoHours: 50 });
eq((await action('events.cancelBooking', [be1.id], s)).result.refund, 'succeeded', '48 hours and 12 minutes before: free');
eq((await action('events.cancelBooking', [be2.id], s)).result.reason, 'late', '47 hours and 48 minutes before: late');

// ---- C-D11: the club moved the event after the booking: free whatever the date
const moved = await makeEvent('cxmoved', { price: 2200, startInHours: 20 });
const b3 = await makeBooking(m, moved, { bookedAgoHours: 72 });
exec(`update events set changed_at = now() where id = ${q(moved.id)}`);
const mine = await action('events.getMyBooking', [moved.id], s);
eq([mine.result.freeNow, mine.result.moved], [true, true], 'getMyBooking says the move makes it free to cancel');
const c3 = await action('events.cancelBooking', [b3.id], s);
eq(c3.result, { ok: true, refund: 'succeeded', refundPence: 2200, late: false }, 'moved event, 20 hours before: full refund');
eq(row(b3.id).cancel_reason, 'event_changed', 'recorded as event_changed');
const after = await makeEvent('cxmoved2', { price: 2200, startInHours: 20 });
exec(`update events set changed_at = now() - interval '2 hours' where id = ${q(after.id)}`);
const b4 = await makeBooking(m, after);
eq((await action('events.cancelBooking', [b4.id], s)).result.reason, 'late', 'a booking made after the move gets no exception');

// ---- a refund Stripe refuses: failed, the club alerted, the member emailed once it is done by hand
const bad = await makeEvent('cxbad', { price: 3000 });
const { data: badBook } = await svc.rpc('book_event', { p_member: m.id, p_event: bad.id, p_amount: 3000, p_payment_intent: `pi_missing_${Date.now()}`, p_allow_over_capacity: true });
mark = fakesMark();
const c5 = await action('events.cancelBooking', [badBook.booking_id], s);
eq([c5.result.ok, c5.result.refund], [true, 'failed'], 'refund refused by Stripe: the booking is cancelled, the refund failed');
const r5 = row(badBook.booking_id);
eq([r5.status, r5.refund_status], ['cancelled', 'failed'], 'refund_status failed');
ok(/No such payment_intent/.test(r5.refund_error ?? ''), 'with Stripe’s reason saved', r5);
await waitFor(() => messages(`template = 'admin-alert' and dedupe_key = ${q(`admin-alert:refund-failed:${badBook.booking_id}`)} and status = 'sent'`).length === 1, 'the club is alerted');
await new Promise((r) => setTimeout(r, 1500));
eq(messages(`booking_id = ${q(badBook.booking_id)} and template = 'booking-cancelled'`).length, 0, 'the member is not told "on its way" while it failed');
const piId = sql1(`select stripe_payment_intent_id as p from bookings where id = ${q(badBook.booking_id)}`).p;
const hand = await emit('charge.refunded', { id: `ch_${Date.now()}`, object: 'charge', payment_intent: piId, amount: 3000, amount_refunded: 3000, refunded: true });
eq(hand.webhook, 200, 'charge.refunded (refunded by hand in Stripe) reaches the webhook');
eq([row(badBook.booking_id).refund_status, row(badBook.booking_id).refund_pence], ['succeeded', 3000], 'the booking now shows the refund');
await waitFor(() => messages(`booking_id = ${q(badBook.booking_id)} and template = 'booking-cancelled' and status = 'sent'`).length === 1, 'and the member gets the cancellation email then');

// ---- the same cancel twice at once: one refund
const race = await makeEvent('cxrace', { price: 1200 });
const b6 = await makeBooking(m, race);
mark = fakesMark();
const [x, y] = await Promise.all([action('events.cancelBooking', [b6.id], s), action('events.cancelBooking', [b6.id], s)]);
eq([x.result.ok, y.result.ok].filter(Boolean).length, 1, 'two cancels at once: one succeeds');
eq(refundsFor(mark, b6.pi).length, 1, 'one refund call');

// ---- refusals
const gone = await makeEvent('cxgone', { price: 0, startInHours: 1 });
const b7 = await makeBooking(m, gone);
exec(`update events set start_time = now() - interval '5 minutes' where id = ${q(gone.id)}`);
eq((await action('events.cancelBooking', [b7.id], s)).result.reason, 'started', 'a started event cannot be cancelled');
const other = await makeMember('cx2');
const so = await memberSession(other.email);
const b8 = await makeBooking(m, await makeEvent('cxother', { price: 0 }));
eq((await action('events.cancelBooking', [b8.id], so)).result.reason, 'not_found', "another member's booking: not found");
eq(row(b8.id).status, 'confirmed', 'and it stands');
done();
