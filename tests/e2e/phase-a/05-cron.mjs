// The scheduled jobs (brief 2.9): GET /api/cron/reminders and /api/cron/memberships with the bearer
// secret. Reminders: 24 hours and 2 hours before, once each, not for late bookings, cancelled events or
// gated members. Memberships: grace ran out (Stripe subscription cancelled now, ended payment_failed,
// D8), cancel date passed with no webhook (ended member_cancelled), leftover future bookings of ended
// members swept. Both safe to run again.
import {
  cron, done, eq, exec, fakesMark, fakesSince, insertBooking, makeBooking, makeEvent, makeMember, messages, ok, q, sql1, svc, waitFor,
} from './lib.mjs';

eq((await cron('reminders', null)).status, 401, 'no secret: 401');
eq((await cron('reminders', 'wrong')).status, 401, 'wrong secret: 401');
eq((await cron('nope')).status, 404, 'unknown job: 404');
eq((await cron('constructor')).status, 404, 'a prototype name is not a job');

// ---- reminders
const a = await makeMember('cr1');
const paused = await makeMember('cr2', 'paused');
const in20 = await makeEvent('cr20h', { price: 0, startInHours: 20, address: 'Twenty Hall, 2 Sample Road, Anytown AB1 2CD' });
const in90m = await makeEvent('cr90m', { price: 0, startInHours: 1.5 });
const in30 = await makeEvent('cr30h', { price: 0, startInHours: 30 });
const cancelledEv = await makeEvent('crcancel', { price: 0, startInHours: 20 });
const b20 = await makeBooking(a, in20, { bookedAgoHours: 48 });
const b90 = await makeBooking(a, in90m, { bookedAgoHours: 48 });
const b30 = await makeBooking(a, in30, { bookedAgoHours: 48 });
const bc = await makeBooking(a, cancelledEv, { bookedAgoHours: 48 });
exec(`update events set cancelled_at = now() where id = ${q(cancelledEv.id)}`);
const late = await makeEvent('crlate', { price: 0, startInHours: 20 });
const bLate = await makeBooking(a, late, { bookedAgoHours: 1 });
// Booked before the pause (book_event refuses a paused member now).
const { data: bPaused } = await svc.from('bookings').insert({ member_id: paused.id, event_id: in20.id, status: 'confirmed', booked_at: new Date(Date.now() - 48 * 3600000).toISOString() }).select('id').single();

const r1 = await cron('reminders');
eq([r1.status, r1.json.ok], [200, true], 'reminders: 200 with a JSON summary');
ok(typeof r1.json.result.sent24h === 'number' && typeof r1.json.result.sent2h === 'number', 'the summary says what it sent', r1.json);
const sentFor = (id, w) => messages(`booking_id = ${q(id)} and template = 'event-reminder' and dedupe_key = ${q(`event-reminder-${w}:${id}`)} and status = 'sent'`).length;
eq(sentFor(b20.id, '24h'), 1, 'the event 20 hours away: the 24-hour reminder');
eq(sentFor(b90.id, '2h'), 1, 'the event 90 minutes away: the 2-hour reminder');
eq(sentFor(b90.id, '24h'), 0, 'and not a late 24-hour one');
eq(sentFor(b30.id, '24h') + sentFor(b30.id, '2h'), 0, 'the event 30 hours away: nothing yet');
eq(sentFor(bc.id, '24h'), 0, 'a cancelled event: nothing');
eq(sentFor(bLate.id, '24h'), 0, 'a booking made inside the last 24 hours: no 24-hour reminder');
eq(sentFor(bPaused.id, '24h'), 0, 'a paused member: nothing');
ok(sql1(`select reminder_24h_sent_at is not null as s from bookings where id = ${q(b20.id)}`).s, 'reminder_24h_sent_at recorded');
const r2 = await cron('reminders');
eq(r2.status, 200, 'run again');
eq([sentFor(b20.id, '24h'), sentFor(b90.id, '2h')], [1, 1], 'no reminder sent twice');
const [p1, p2] = await Promise.all([cron('reminders'), cron('reminders')]);
eq([p1.status, p2.status], [200, 200], 'two runs at once');
eq(messages(`booking_id in (${q(b20.id)}, ${q(b90.id)}) and template = 'event-reminder'`).length, 2, 'still one email each');
exec(`update events set start_time = now() + interval '100 minutes' where id = ${q(in20.id)}`);
await cron('reminders');
eq(sentFor(b20.id, '2h'), 1, 'the same booking two hours before: the 2-hour reminder too');

// ---- memberships
const grace = await makeMember('cr3', 'graceover');
const lapsed = await makeMember('cr4', 'lapsed');
const ended = await makeMember('cr5', 'ended');
const future = await makeEvent('crfuture', { price: 1600, startInHours: 24 * 9 });
const bGrace = await insertBooking(grace, future);
const bLapsed = await insertBooking(lapsed, await makeEvent('crfuture2', { price: 0, startInHours: 24 * 9 }));
// An ended member still holding a future booking (as if an earlier run stopped half way).
const { data: leftover } = await svc.from('bookings').insert({ member_id: ended.id, event_id: future.id, status: 'confirmed' }).select('id').single();
let mark = fakesMark();
const m1 = await cron('memberships');
eq(m1.status, 200, 'memberships: 200');
ok(m1.json.result.graceEnded.includes(grace.id) && m1.json.result.cancelDatePassed.includes(lapsed.id), 'the summary names who it ended', m1.json.result);
const cancelCall = fakesSince(mark, 'stripe').find((l) => l.method === 'DELETE' && l.path === `/v1/subscriptions/${grace.subscription}`);
eq(cancelCall?.idem, `sub-cancel-now-${grace.subscription}`, 'grace over: the Stripe subscription is cancelled now (with an idempotency key)');
const g = sql1(`select membership_status, ended_reason, ended_at = grace_until as on_grace_day from members where id = ${q(grace.id)}`);
eq(g, { membership_status: 'cancelled', ended_reason: 'payment_failed', on_grace_day: true }, 'ended payment_failed, on the grace date (the email and You say the same day)');
eq(sql1(`select status, cancel_reason, refund_status from bookings where id = ${q(bGrace.id)}`), { status: 'cancelled', cancel_reason: 'membership_ended', refund_status: 'succeeded' }, 'D8: its future paid booking refunded');
const l = sql1(`select membership_status, ended_reason, ended_at = cancel_at as on_cancel_day from members where id = ${q(lapsed.id)}`);
eq(l, { membership_status: 'cancelled', ended_reason: 'member_cancelled', on_cancel_day: true }, 'cancel date passed: ended member_cancelled, on that date');
eq(sql1(`select status from bookings where id = ${q(bLapsed.id)}`).status, 'cancelled', 'and its future booking cancelled');
eq(sql1(`select status, cancel_reason from bookings where id = ${q(leftover.id)}`), { status: 'cancelled', cancel_reason: 'membership_ended' }, 'a leftover booking of an ended member is swept');
await waitFor(() => messages(`member_id = ${q(grace.id)} and template = 'membership-ended' and status = 'sent'`).length === 1, 'membership-ended to the grace member');
await waitFor(() => messages(`member_id = ${q(lapsed.id)} and template = 'membership-ended' and status = 'sent'`).length === 1, 'and to the lapsed member');
mark = fakesMark();
const m2 = await cron('memberships');
ok(!m2.json.result.graceEnded.includes(grace.id) && !m2.json.result.cancelDatePassed.includes(lapsed.id), 'run again: nobody ended twice');
eq(fakesSince(mark, 'stripe').filter((x) => x.path === '/v1/refunds').length, 0, 'no refund twice');
eq(messages(`member_id in (${q(grace.id)}, ${q(lapsed.id)}) and template = 'membership-ended'`).length, 2, 'no email twice');
done();
