// Stripe webhooks (brief 2.8, 5.2), each type sent through the fake (/__fake/stripe/emit, signed with the
// test secret) to this build: payment_intent.succeeded and .payment_failed, invoice.payment_failed and
// invoice.paid (C-D12 grace, one email per invoice), customer.subscription.updated (cancel date, pause),
// customer.subscription.deleted (the end, with A-D8 refunds, one email), charge.refunded; the same event
// twice (stripe_events), signatures.
import {
  WEBHOOK, action, done, emit, eq, exec, fakesMark, fakesSince, fd, makeBooking, makeEvent, makeMember, memberSession,
  messages, ok, page, postWebhook, redirectedTo, q, sql1, stripe, stripeEvent, waitFor,
} from './lib.mjs';

const member = (id) => sql1(`select membership_status, cancel_at, cancel_requested_at, payment_failed_at, grace_until, paused_at, ended_at, ended_reason from members where id = ${q(id)}`);
const invoice = (m, id, extra = {}) => ({ id, object: 'invoice', customer: m.customer, amount_due: 1000, total: 1000, parent: { type: 'subscription_details', subscription_details: { subscription: m.subscription } }, ...extra });

// ---- signatures
const bad = await fetch(WEBHOOK, { method: 'POST', headers: { 'stripe-signature': 't=1,v1=00' }, body: '{}' });
eq(bad.status, 400, 'a bad signature: 400');
const none = await fetch(WEBHOOK, { method: 'POST', body: '{}' });
eq(none.status, 400, 'no signature: 400');
const wrongSecret = await postWebhook(stripeEvent('invoice.paid', {}), 'whsec_wrong');
eq(wrongSecret.status, 400, 'signed with another secret: 400');

// ---- payment_intent.*
const m = await makeMember('wh1');
const s = await memberSession(m.email);
const ev = await makeEvent('whpaid', { price: 2500 });
const pi = (await action('events.createEventPaymentIntent', [fd({ event_id: ev.id })], s)).result.clientSecret.split('_secret')[0];
const failed = await fetch(`https://api.stripe.com/__fake/stripe/fail/${pi}?webhook=${encodeURIComponent(WEBHOOK)}`, { method: 'POST' }).then((r) => r.json());
eq(failed.webhook, 200, 'payment_intent.payment_failed: 200');
eq(sql1(`select count(*)::int as n from bookings where stripe_payment_intent_id = ${q(pi)}`).n, 0, 'and nothing is booked');
const notOurs = await emit('payment_intent.succeeded', { id: `pi_sub_${Date.now()}`, object: 'payment_intent', amount: 1000, currency: 'gbp', status: 'succeeded', metadata: {} });
eq(notOurs.webhook, 200, 'payment_intent.succeeded without booking metadata (a membership invoice): 200, ignored');
const okPay = await fetch(`https://api.stripe.com/__fake/stripe/pay/${pi}?webhook=${encodeURIComponent(WEBHOOK)}`, { method: 'POST' }).then((r) => r.json());
eq(okPay.webhook, 200, 'payment_intent.succeeded: 200');
eq(sql1(`select status, amount_pence from bookings where stripe_payment_intent_id = ${q(pi)}`), { status: 'confirmed', amount_pence: 2500 }, 'and the booking is recorded');

// ---- invoice.payment_failed: first failure sets the dates (end of the London day 3 days later), one email per invoice
let mark = fakesMark();
const r1 = await emit('invoice.payment_failed', invoice(m, `in_${Date.now()}a`));
eq(r1.webhook, 200, 'invoice.payment_failed: 200');
const p1 = member(m.id);
ok(p1.payment_failed_at && p1.grace_until, 'payment_failed_at and grace_until set', p1);
const expected = sql1(`select to_char(((now() at time zone 'Europe/London')::date + 3)::timestamp + interval '23:59:59.999', 'YYYY-MM-DD HH24:MI:SS.MS') as d`).d;
eq(sql1(`select to_char(grace_until at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI:SS.MS') as d from members where id = ${q(m.id)}`).d, expected, 'grace_until is the end of the London day three days after the failure (C-D12)');
await waitFor(() => messages(`member_id = ${q(m.id)} and template = 'payment-failed' and status = 'sent'`).length === 1, 'payment-failed email sent');
const inv1 = sql1(`select dedupe_key from message_log where member_id = ${q(m.id)} and template = 'payment-failed'`).dedupe_key;
await emit('invoice.payment_failed', invoice(m, inv1.split(':')[1]));
await new Promise((r) => setTimeout(r, 500));
eq(messages(`member_id = ${q(m.id)} and template = 'payment-failed'`).length, 1, 'Stripe retrying the same invoice: no second email');
eq(member(m.id).payment_failed_at, p1.payment_failed_at, 'and the first failure date stays');
const legacy = await emit('invoice.payment_failed', { id: `in_${Date.now()}b`, object: 'invoice', customer: m.customer, subscription: m.subscription, amount_due: 1000 });
eq(legacy.webhook, 200, 'an older invoice shape (subscription at the top) is understood');
await waitFor(() => messages(`member_id = ${q(m.id)} and template = 'payment-failed'`).length === 2, 'a new invoice failing: its own email');
eq([member(m.id).payment_failed_at, member(m.id).grace_until], [p1.payment_failed_at, p1.grace_until], 'but the dates are still the first failure’s (the email and You agree)');
eq((await page('/members/events', s)).status, 200, 'a member in the payment problem state can still use the members area');
ok(emailsTo(mark, m.email), 'emails went to the member');

// ---- invoice.paid clears it
eq((await emit('invoice.paid', invoice(m, `in_${Date.now()}c`, { status: 'paid' }))).webhook, 200, 'invoice.paid: 200');
eq([member(m.id).payment_failed_at, member(m.id).grace_until], [null, null], 'invoice.paid clears the payment problem');

// ---- customer.subscription.updated: the cancel date follows Stripe; pause
const sub = (await stripe('POST', `subscriptions/${m.subscription}`, { cancel_at_period_end: 'true' })).json;
eq((await emit('customer.subscription.updated', sub)).webhook, 200, 'customer.subscription.updated (cancel at period end): 200');
eq(new Date(member(m.id).cancel_at).getTime(), sub.cancel_at * 1000, 'cancel_at synced from Stripe');
ok(member(m.id).cancel_requested_at, 'cancel_requested_at set');
const kept = (await stripe('POST', `subscriptions/${m.subscription}`, { cancel_at_period_end: 'false' })).json;
await emit('customer.subscription.updated', kept);
eq([member(m.id).cancel_at, member(m.id).cancel_requested_at], [null, null], 'undone in Stripe: cancel date cleared');
const pausedSub = (await stripe('POST', `subscriptions/${m.subscription}`, { pause_collection: { behavior: 'void' } })).json;
await emit('customer.subscription.updated', pausedSub);
eq(member(m.id).membership_status, 'paused', 'paused in Stripe: the member is paused');
eq(await redirectedTo('/members/events', s), '/members/membership', 'and gated');
const unpaused = (await stripe('POST', `subscriptions/${m.subscription}`, { pause_collection: '' })).json;
await emit('customer.subscription.updated', unpaused);
eq(member(m.id).membership_status, 'paused', 'an update that does not say the pause changed leaves a paused member paused');
const resume = await postWebhook(stripeEvent('customer.subscription.updated', unpaused, { previous_attributes: { pause_collection: { behavior: 'void' } } }));
eq([resume.status, member(m.id).membership_status], [200, 'active'], 'an update whose previous_attributes show the pause ending: active again');

// ---- the same event twice
const evt = stripeEvent('invoice.paid', invoice(m, `in_${Date.now()}d`));
const once = await postWebhook(evt);
const twice = await postWebhook(evt);
eq([once.status, once.json.status], [200, 'processed'], 'first delivery: processed');
eq([twice.status, twice.json.status], [200, 'duplicate'], 'the same event id again: skipped as a duplicate');
const se = sql1(`select type, processed_at is not null as done, error from stripe_events where id = ${q(evt.id)}`);
eq(se, { type: 'invoice.paid', done: true, error: null }, 'stripe_events has it, processed');
const unknown = await postWebhook(stripeEvent('customer.created', { id: 'cus_x' }));
eq([unknown.status, unknown.json.status], [200, 'ignored'], 'a type we do not handle: 200, ignored');

// ---- customer.subscription.deleted: the end, D8, one email
const e1 = await makeMember('wh2');
const futurePaid = await makeEvent('whfuture', { price: 2000 });
const futureFree = await makeEvent('whfuturefree', { price: 0 });
const pastEv = await makeEvent('whpast', { price: 0, startInHours: 2 });
const bp = await makeBooking(e1, futurePaid);
const bf = await makeBooking(e1, futureFree);
const bpast = await makeBooking(e1, pastEv);
exec(`update events set start_time = now() - interval '1 hour' where id = ${q(pastEv.id)}`);
mark = fakesMark();
const deleted = (await stripe('DELETE', `subscriptions/${e1.subscription}`)).json;
eq((await emit('customer.subscription.deleted', deleted)).webhook, 200, 'customer.subscription.deleted: 200');
const ended = member(e1.id);
eq([ended.membership_status, ended.ended_reason], ['cancelled', 'admin_cancelled'], 'the membership ended (no cancel request on file: cancelled by the club)');
ok(ended.ended_at, 'ended_at set');
const bpRow = sql1(`select status, cancel_reason, refund_status, refund_pence from bookings where id = ${q(bp.id)}`);
eq(bpRow, { status: 'cancelled', cancel_reason: 'membership_ended', refund_status: 'succeeded', refund_pence: 2000 }, 'D8: the future paid booking is cancelled and refunded in full');
eq(sql1(`select status, cancel_reason from bookings where id = ${q(bf.id)}`), { status: 'cancelled', cancel_reason: 'membership_ended' }, 'D8: the future included booking is cancelled');
eq(sql1(`select status from bookings where id = ${q(bpast.id)}`).status, 'confirmed', 'a past booking is left alone');
eq(fakesSince(mark, 'stripe').filter((l) => l.path === '/v1/refunds').map((l) => l.idem), [`refund-booking-${bp.id}`], 'one refund, with its idempotency key');
await waitFor(() => messages(`member_id = ${q(e1.id)} and template = 'membership-ended' and status = 'sent'`).length === 1, 'membership-ended sent');
await waitFor(() => messages(`member_id = ${q(e1.id)} and template = 'booking-cancelled' and status = 'sent'`).length === 2, 'and one booking-cancelled per future booking');
const again = await emit('customer.subscription.deleted', deleted);
eq(again.webhook, 200, 'the end arriving again (a new event id): 200');
await new Promise((r) => setTimeout(r, 500));
eq(messages(`member_id = ${q(e1.id)} and template = 'membership-ended'`).length, 1, 'no second membership-ended email');
eq(fakesSince(mark, 'stripe').filter((l) => l.path === '/v1/refunds').length, 1, 'no second refund');
eq(await redirectedTo('/members/events', await memberSession(e1.email)), '/members/membership', 'the ended member is gated');

// ---- reasons: a member who asked to cancel; a failed payment
const e2 = await makeMember('wh3', 'ending');
await emit('customer.subscription.deleted', (await stripe('DELETE', `subscriptions/${e2.subscription}`)).json);
eq(member(e2.id).ended_reason, 'member_cancelled', 'with a cancel request on file: member_cancelled');
const e3 = await makeMember('wh4', 'problem');
await emit('customer.subscription.updated', { ...(await stripe('DELETE', `subscriptions/${e3.subscription}`)).json, status: 'canceled' });
eq([member(e3.id).membership_status, member(e3.id).ended_reason], ['cancelled', 'payment_failed'], 'an update to status canceled also ends it; after a failed payment: payment_failed');
done();

function emailsTo(markAt, to) {
  return fakesSince(markAt, 'email').some((e) => [].concat(e.to).includes(to));
}
