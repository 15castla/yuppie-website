// Booking (brief 5.2, 5.3): included and paid paths through the real actions, book_event's checks (full,
// started, cancelled, inactive, already booked), the capacity lock under a race, the paid path from the
// page and from the webhook in both orders, paid twice, over capacity, amount mismatch, the address and
// Add to calendar for a booked member only.
import {
  ALERTS, BASE, action, cookieFor, done, emailsTo, eq, exec, fakePay, fakesMark, fakesSince, fd, makeBooking, makeEvent,
  makeMember, memberSession, messages, ok, q, sql, sql1, stripe, waitFor,
} from './lib.mjs';

const piFrom = (secret) => secret.split('_secret')[0];
const confirmedCount = (eventId) => sql1(`select count(*)::int as n from bookings where event_id = ${q(eventId)} and status = 'confirmed'`).n;

// ---- included path
const m1 = await makeMember('bk1');
const s1 = await memberSession(m1.email);
const free = await makeEvent('bkfree', { price: 0, capacity: 2, address: 'Free Hall, 3 Sample Road, Anytown AB1 2CD' });
let mark = fakesMark();
const r1 = await action('events.rsvpToEvent', [fd({ event_id: free.id })], s1);
ok(r1.result?.success === true && r1.result.bookingId, 'rsvpToEvent books an included event', r1);
const b1 = sql1(`select status, amount_pence, stripe_payment_intent_id, refund_status from bookings where id = ${q(r1.result.bookingId)}`);
eq(b1, { status: 'confirmed', amount_pence: 0, stripe_payment_intent_id: null, refund_status: 'none' }, 'the booking row: confirmed, £0, no payment');
await waitFor(() => messages(`booking_id = ${q(r1.result.bookingId)} and template = 'booking-confirmed-included' and status = 'sent'`).length === 1, 'booking-confirmed-included logged as sent');
await waitFor(() => emailsTo(mark, m1.email).length === 1, 'one email to the member through Resend');
const sent = emailsTo(mark, m1.email)[0];
eq(sent.from, 'Club Yuppie <noreply@clubyuppie.com>', 'sent from Club Yuppie <noreply@clubyuppie.com> (C-D6)');
const again = await action('events.rsvpToEvent', [fd({ event_id: free.id })], s1);
eq(again.result, { success: false, error: 'You’re already booked in for this event.' }, 'a second tap: already booked');

// ---- the capacity lock: two members race for the last spot
const m2 = await makeMember('bk2');
const m3 = await makeMember('bk3');
const [s2, s3] = await Promise.all([memberSession(m2.email), memberSession(m3.email)]);
const [ra, rb] = await Promise.all([
  action('events.rsvpToEvent', [fd({ event_id: free.id })], s2),
  action('events.rsvpToEvent', [fd({ event_id: free.id })], s3),
]);
const wins = [ra, rb].filter((r) => r.result.success).length;
eq(wins, 1, 'two members racing for the last spot: exactly one gets it');
ok([ra, rb].some((r) => r.result.error === 'Sorry, this event is fully booked.'), 'the other is told it is fully booked');
eq(confirmedCount(free.id), 2, 'never over capacity (2 of 2)');

// ---- refusals
const started = await makeEvent('bkstarted', { price: 0, startInHours: -1 });
eq((await action('events.rsvpToEvent', [fd({ event_id: started.id })], s1)).result.error, 'This event has already started, so it can’t be booked.', 'a started event cannot be booked');
const cancelled = await makeEvent('bkcancelled', { price: 0 });
exec(`update events set cancelled_at = now() where id = ${q(cancelled.id)}`);
eq((await action('events.rsvpToEvent', [fd({ event_id: cancelled.id })], s1)).result.error, 'This event has been cancelled, so it can’t be booked.', 'a cancelled event cannot be booked');
const paid = await makeEvent('bkpaid', { price: 2500, capacity: 10, address: 'Paid Courts, 1 Sample Road, Anytown AB1 2CD' });
eq((await action('events.rsvpToEvent', [fd({ event_id: paid.id })], s1)).result.error, 'This event requires payment.', 'a paid event cannot be booked for free');
const paused = await makeMember('bkpaused', 'paused');
const sp = await memberSession(paused.email);
eq((await action('events.rsvpToEvent', [fd({ event_id: paid.id })], sp)).redirect, '/members/membership', 'a paused member is sent to the gate, not booked');
const lapsed = await makeMember('bklapsed', 'lapsed');
const { data: inactive } = await (await import('./lib.mjs')).svc.rpc('book_event', { p_member: lapsed.id, p_event: free.id, p_amount: 0, p_payment_intent: null, p_allow_over_capacity: true });
eq(inactive.status, 'inactive', 'book_event refuses a member whose cancel date has passed (no webhook yet)');
for (const state of ['ending', 'problem']) {
  const m = await makeMember(`bk${state}`, state);
  const s = await memberSession(m.email);
  const ev = await makeEvent(`bk${state}ev`, { price: 0 });
  ok((await action('events.rsvpToEvent', [fd({ event_id: ev.id })], s)).result.success, `a member in the ${state} state can still book`);
}

// ---- paid: the app makes the PaymentIntent, the fake pays it, the webhook books it, then the page confirms
mark = fakesMark();
const pi1 = await action('events.createEventPaymentIntent', [fd({ event_id: paid.id })], s1);
ok(pi1.result.success && pi1.result.clientSecret, 'createEventPaymentIntent gives a client secret', pi1);
const piId = piFrom(pi1.result.clientSecret);
const piCall = fakesSince(mark, 'stripe').find((l) => l.path === '/v1/payment_intents' && l.method === 'POST');
eq([piCall.body.amount, piCall.body.currency, piCall.body.metadata.member_id, piCall.body.metadata.event_id], ['2500', 'gbp', m1.id, paid.id], 'the PaymentIntent is for the event price, in GBP, with member and event');
ok(/^event-pi-/.test(piCall.idem ?? ''), 'with an idempotency key');
const pay = await fakePay(piId);
eq(pay.webhook, 200, 'payment_intent.succeeded reaches the webhook (200)');
const paidRow = sql1(`select id, status, amount_pence, stripe_payment_intent_id from bookings where stripe_payment_intent_id = ${q(piId)}`);
eq([paidRow?.status, paidRow?.amount_pence], ['confirmed', 2500], 'the webhook recorded the booking with the amount paid');
const conf = await action('events.confirmEventPayment', [piId, paid.id], s1);
eq(conf.result, { booked: true }, 'the page then confirms the same payment: booked');
eq(sql1(`select count(*)::int as n from bookings where event_id = ${q(paid.id)} and member_id = ${q(m1.id)}`).n, 1, 'still one booking for that payment');
await waitFor(() => messages(`booking_id = ${q(paidRow.id)} and template = 'booking-confirmed' and status = 'sent'`).length === 1, 'booking-confirmed (paid) sent once');

// ---- paid, the other order: the page confirms first, the webhook arrives after
const m4 = await makeMember('bk4');
const s4 = await memberSession(m4.email);
const pi2 = piFrom((await action('events.createEventPaymentIntent', [fd({ event_id: paid.id })], s4)).result.clientSecret);
await fakePay(pi2, 'http://127.0.0.1:9/none');
eq((await action('events.confirmEventPayment', [pi2, paid.id], s4)).result, { booked: true }, 'page first: booked');
await stripe('GET', `payment_intents/${pi2}`);
const replay = await (await import('./lib.mjs')).emit('payment_intent.succeeded', (await stripe('GET', `payment_intents/${pi2}`)).json);
eq(replay.webhook, 200, 'the webhook for the same payment afterwards: 200');
eq(sql1(`select count(*)::int as n from bookings where stripe_payment_intent_id = ${q(pi2)}`).n, 1, 'and no second booking');
const pi2Booking = sql1(`select id from bookings where stripe_payment_intent_id = ${q(pi2)}`).id;
await waitFor(() => messages(`booking_id = ${q(pi2Booking)} and template = 'booking-confirmed'`).length === 1, 'one confirmation, not two');

// ---- processing and failure answers from the page
const m5 = await makeMember('bk5');
const s5 = await memberSession(m5.email);
const pi3 = piFrom((await action('events.createEventPaymentIntent', [fd({ event_id: paid.id })], s5)).result.clientSecret);
eq((await action('events.confirmEventPayment', [pi3, paid.id], s5)).result, { booked: false, error: 'Your payment didn’t go through. Please try again.' }, 'an unpaid PaymentIntent is not booked');
eq((await action('events.confirmEventPayment', [pi3, paid.id], s1)).result.error, 'That payment doesn’t match this booking.', "another member's payment cannot be confirmed");

// ---- paid twice: a second payment for someone already booked
mark = fakesMark();
const dup = await stripe('POST', 'payment_intents', { amount: 2500, currency: 'gbp', customer: m1.customer, metadata: { member_id: m1.id, event_id: paid.id } });
await fakePay(dup.json.id);
eq(sql1(`select count(*)::int as n from bookings where member_id = ${q(m1.id)} and event_id = ${q(paid.id)} and status = 'confirmed'`).n, 1, 'paid twice: still one booking');
await waitFor(() => messages(`template = 'admin-booking-review' and dedupe_key = ${q(`admin-booking-review:${dup.json.id}:paid_twice`)} and status = 'sent'`).length === 1, 'paid twice: the club gets admin-booking-review');
ok(emailsTo(mark, ALERTS).length >= 1, `to ADMIN_ALERTS_EMAIL (${ALERTS})`);

// ---- over capacity: a paid booking that lands on a full event still books and alerts (A-D7)
const tiny = await makeEvent('bktiny', { price: 1500, capacity: 1 });
await makeBooking(m2, tiny);
const over = await stripe('POST', 'payment_intents', { amount: 1500, currency: 'gbp', customer: m3.customer, metadata: { member_id: m3.id, event_id: tiny.id } });
await fakePay(over.json.id);
eq(confirmedCount(tiny.id), 2, 'over capacity: the paid member is booked anyway (2 of 1)');
await waitFor(() => messages(`dedupe_key = ${q(`admin-booking-review:${over.json.id}:over_capacity`)} and status = 'sent'`).length === 1, 'over capacity: admin-booking-review sent');
const fullPi = await action('events.createEventPaymentIntent', [fd({ event_id: tiny.id })], s5);
eq(fullPi.result, { success: false, error: 'Sorry, this event is fully booked.' }, 'and no new payment starts for a full event');

// ---- the amount must match the event price
const wrong = await stripe('POST', 'payment_intents', { amount: 100, currency: 'gbp', customer: m5.customer, metadata: { member_id: m5.id, event_id: paid.id } });
await fakePay(wrong.json.id);
eq(sql1(`select count(*)::int as n from bookings where stripe_payment_intent_id = ${q(wrong.json.id)}`).n, 0, 'a payment for the wrong amount is not booked');
await waitFor(() => messages(`template = 'admin-alert' and dedupe_key = ${q(`admin-alert:paid-not-booked:${wrong.json.id}`)} and status = 'sent'`).length === 1, 'and the club is alerted (paid but not booked)');

// ---- paid while the club cancelled the event
const doomed = await makeEvent('bkdoomed', { price: 2000 });
const m6 = await makeMember('bk6');
const s6 = await memberSession(m6.email);
const pi6 = piFrom((await action('events.createEventPaymentIntent', [fd({ event_id: doomed.id })], s6)).result.clientSecret);
exec(`update events set cancelled_at = now() where id = ${q(doomed.id)}`);
await fakePay(pi6, 'http://127.0.0.1:9/none');
eq((await action('events.confirmEventPayment', [pi6, doomed.id], s6)).result.booked, false, 'paid after the club cancelled: not booked (the page shows Paid, but not booked yet)');
await waitFor(() => messages(`dedupe_key = ${q(`admin-alert:paid-not-booked:${pi6}`)}`).length === 1, 'and the club is alerted');
eq((await action('events.createEventPaymentIntent', [fd({ event_id: doomed.id })], s5)).result.error, 'This event has been cancelled, so it can’t be booked.', 'no payment starts for a cancelled event');

// ---- address and Add to calendar: booked members only (A-D3)
const mine = await action('events.getMyBooking', [paid.id], s1);
eq([mine.result.address, mine.result.amountPence, mine.result.freeNow], ['Paid Courts, 1 Sample Road, Anytown AB1 2CD', 2500, true], 'getMyBooking: the address, the amount, free to cancel');
eq((await action('events.getMyEventAddress', [paid.id], s5)).result, null, 'a member without a booking gets no address');
eq((await action('events.getMyBooking', [paid.id], s5)).result, null, 'nor a booking card');
const ics = await fetch(`${BASE}/members/events/${paid.slug}/calendar.ics`, { headers: { cookie: cookieFor(s1) }, redirect: 'manual' });
const icsText = await ics.text();
eq([ics.status, ics.headers.get('content-type')], [200, 'text/calendar; charset=utf-8'], 'calendar.ics: 200 text/calendar for the booked member');
ok(/BEGIN:VCALENDAR\r\n/.test(icsText) && /\r\nSUMMARY:Bkpaid night\r\n/.test(icsText) && /LOCATION:.*Paid Courts\\, 1 Sample Road/.test(icsText) && /DTSTART:\d{8}T\d{6}Z/.test(icsText) && /DTEND:/.test(icsText), 'the file has the title, start, end and the exact address', icsText);
ok(!/BEGIN:VALARM/.test(icsText), 'and no alarm (the reminders are ours)');
ok(/attachment; filename="f-t-bkpaid-[0-9a-f]+\.ics"/.test(ics.headers.get('content-disposition') ?? ''), 'downloaded as <slug>.ics');
const notBooked = await fetch(`${BASE}/members/events/${paid.slug}/calendar.ics`, { headers: { cookie: cookieFor(s5) }, redirect: 'manual' });
eq(notBooked.status, 404, 'calendar.ics: 404 for a member without a booking');
const links = await action('events.getCalendarLinks', [paid.id], s1);
ok(links.result.googleUrl.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE') && links.result.icsUrl === `/members/events/${paid.slug}/calendar.ics`, 'getCalendarLinks: Google link and the .ics path', links.result);
const signedOut = await fetch(`${BASE}/members/events/${paid.slug}/calendar.ics`, { redirect: 'manual' });
eq(signedOut.status, 307, 'calendar.ics signed out: to the login page');
void sql;
done();
