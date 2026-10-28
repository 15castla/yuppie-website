// Fix round, fixer 1 (backend and money): one regression check per finding. QA3-01 legacy amounts (and the
// release backfill), QA3-02 a card saved in the portal pays the failed invoice, QA3-03 Stripe's truth over
// late events, QA1-01 cancelling in the grace days, QA3-05 delete and Cancel now racing Stripe, QA3-07 the
// refunds job, QA1-03 the price the member saw, QA1-08 one PaymentIntent per attempt, QA3-08 matching by
// subscription, QA3-09 paid but unbookable refunded, QA3-10 database errors make Stripe retry, QA3-11 Keep
// clears cancel_at, QA3-12 no anonymous inserts into applications, QA3-13 the card in the payment-failed email,
// and release/reconcile-members.mjs. Test people are f1.t-...@example.com; the admin is the seeded f1. admin.
process.env.PHASE_A_TAG = 'f1.';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  BASE, WEBHOOK, ANON, REST, action, adminSession, cron, done, eq, exec, fakeInvoiceFailed, fakePay, fakeRefundMode, fakeState,
  fakesMark, fakesSince, fd, insertBooking, makeBooking, makeEvent, makeMember, memberSession, messages, ok, page,
  postWebhook, q, sleep, sql, sql1, stripe, stripeEvent, svc, waitFor,
} from './lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const admin = await adminSession('f1.');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const london = (iso) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(iso)).map((p) => [p.type, Number(p.value)]));
const dayMonth = (iso) => { const w = london(iso); return `${w.day} ${MONTHS[w.month - 1]}`; };
const dayDate = (iso) => { const w = london(iso); return `${WEEKDAYS[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()]} ${w.day} ${MONTHS[w.month - 1]}`; };
const memberRow = (id) => sql1(`select membership_status, cancel_at, cancel_requested_at, payment_failed_at, grace_until, ended_at, ended_reason, deleted_at from members where id = ${q(id)}`);
const bookingRow = (id) => sql1(`select status, amount_pence, cancel_reason, refund_status, refund_pence, stripe_refund_id, refund_attempts, refund_error from bookings where id = ${q(id)}`);
const refundPosts = (mark, pi) => fakesSince(mark, 'stripe').filter((c) => c.path === '/v1/refunds' && c.method === 'POST' && c.body.payment_intent === pi);
const stripeWrites = (mark, frag) => fakesSince(mark, 'stripe').filter((c) => c.method !== 'GET' && c.path.includes(frag));
const mailTo = async (to) => (await fakeState()).emails.filter((e) => [].concat(e.to).includes(to));
const piOf = (clientSecret) => clientSecret.split('_secret')[0];
const backdate = (bookingId) => exec(`update bookings set refund_attempted_at = now() - interval '10 minutes' where id = ${q(bookingId)}`);

/** A paid booking as the code before the migration left it: confirmed, a real payment, amount_pence 0. */
async function legacyPaidBooking(m, ev) {
  const pi = (await stripe('POST', 'payment_intents', { amount: ev.price, currency: 'gbp', customer: m.customer, metadata: { member_id: m.id, event_id: ev.id } })).json.id;
  await fakePay(pi, 'http://127.0.0.1:9/none');
  const { data, error } = await svc.from('bookings').insert({ member_id: m.id, event_id: ev.id, status: 'confirmed', stripe_payment_intent_id: pi, booked_at: new Date(Date.now() - 3 * 86400000).toISOString() }).select('id, amount_pence').single();
  if (error) throw error;
  return { id: data.id, pi, amount: data.amount_pence };
}
const openInvoiceOf = async (sub) => (await stripe('GET', `invoices?subscription=${sub}&status=open`)).json.data[0];
const runRelease = (script, ...args) => spawnSync(process.execPath, [path.join(ROOT, 'release', script), ...args], { cwd: ROOT, encoding: 'utf8', env: process.env, timeout: 120000 });

// ================================================================ QA3-01 legacy bookings (amount_pence 0, real payment)
{
  const m = await makeMember('legacy');
  const s = await memberSession(m.email);
  const ev = await makeEvent('f1legacy', { price: 1500 });
  const b = await legacyPaidBooking(m, ev);
  eq(b.amount, 0, 'QA3-01 setup: the legacy booking has amount_pence 0');
  let mark = fakesMark();
  eq((await action('events.cancelBooking', [b.id], s)).result, { ok: true, refund: 'succeeded', refundPence: 1500, late: false }, 'QA3-01 member cancels a legacy paid booking: refunded what Stripe received');
  eq(refundPosts(mark, b.pi).map((c) => [c.idem, c.body.amount]), [[`refund-booking-${b.id}`, '1500']], 'QA3-01 one refund of £15, refund-booking-<id>');
  eq((({ amount_pence, refund_status, refund_pence }) => ({ amount_pence, refund_status, refund_pence }))(bookingRow(b.id)), { amount_pence: 1500, refund_status: 'succeeded', refund_pence: 1500 }, 'QA3-01 the amount is stored on the booking');

  const m2 = await makeMember('legacy2');
  const ev2 = await makeEvent('f1legacy2', { price: 2000 });
  const b2 = await legacyPaidBooking(m2, ev2);
  mark = fakesMark();
  const club = (await action('admin.eventBookings.adminCancelEvent', [ev2.id, { note: 'f1 test' }], admin)).result;
  ok(club.ok && club.refunded === 1, 'QA3-01 the club cancels the event of a legacy booking: refunded', club);
  eq([refundPosts(mark, b2.pi).length, bookingRow(b2.id).refund_pence], [1, 2000], 'QA3-01 £20 refunded');

  const m3 = await makeMember('legacy3');
  const b3 = await legacyPaidBooking(m3, await makeEvent('f1legacy3', { price: 2500 }));
  await action('admin.memberStatus.adminCancelMemberNow', [m3.id, { stripe: true }], admin);
  eq([bookingRow(b3.id).refund_status, bookingRow(b3.id).refund_pence], ['succeeded', 2500], 'QA3-01 admin Cancel now (D8) refunds a legacy booking too');

  // release/backfill-booking-amounts.mjs: dry run, then apply; one booking refunded by hand in Stripe already.
  const m4 = await makeMember('backfill');
  const b4 = await legacyPaidBooking(m4, await makeEvent('f1backfill', { price: 1800 }));
  const b5 = await legacyPaidBooking(m4, await makeEvent('f1backfill2', { price: 900 }));
  const hand = (await stripe('POST', 'refunds', { payment_intent: b5.pi, amount: 900 })).json;
  exec(`update bookings set status = 'cancelled', cancelled_at = now(), cancel_reason = 'admin' where id = ${q(b5.id)}`);
  const dry = runRelease('backfill-booking-amounts.mjs', '--only-email-prefix', m4.email);
  ok(dry.status === 0 && dry.stdout.includes('DRY RUN') && dry.stdout.includes('amount £18') && dry.stdout.includes(`refund already made in Stripe: £9 (${hand.id})`), 'QA3-01 backfill dry run: says what it would do', dry.stdout + dry.stderr);
  eq([bookingRow(b4.id).amount_pence, bookingRow(b5.id).amount_pence], [0, 0], 'QA3-01 backfill dry run changes nothing');
  const applied = runRelease('backfill-booking-amounts.mjs', '--apply', '--only-email-prefix', m4.email);
  ok(applied.status === 0 && applied.stdout.includes('2 changed'), 'QA3-01 backfill --apply: 2 changed', applied.stdout + applied.stderr);
  eq((({ amount_pence, refund_status }) => ({ amount_pence, refund_status }))(bookingRow(b4.id)), { amount_pence: 1800, refund_status: 'none' }, 'QA3-01 backfill: amount from Stripe');
  eq((({ amount_pence, refund_status, refund_pence, stripe_refund_id }) => ({ amount_pence, refund_status, refund_pence, stripe_refund_id }))(bookingRow(b5.id)), { amount_pence: 900, refund_status: 'succeeded', refund_pence: 900, stripe_refund_id: hand.id }, 'QA3-01 backfill: the refund made by hand is recorded');
  const again = runRelease('backfill-booking-amounts.mjs', '--apply', '--only-email-prefix', m4.email);
  ok(again.status === 0 && again.stdout.includes('0 booking(s) looked at'), 'QA3-01 backfill again: nothing left to do', again.stdout);
}

// ================================================================ QA3-02 a card saved in the portal pays the failed invoice
{
  const m = await makeMember('portalfix', 'problem');
  const inv = await openInvoiceOf(m.subscription);
  ok(inv?.status === 'open', 'QA3-02 setup: the problem member has an open invoice in Stripe');
  const pm = 'pm_card_mastercard_4444';
  const customer = (await stripe('POST', `customers/${m.customer}`, { invoice_settings: { default_payment_method: pm } })).json;
  const mark = fakesMark();
  const r = await postWebhook(stripeEvent('customer.updated', customer, { previous_attributes: { invoice_settings: { default_payment_method: null } } }));
  eq([r.status, r.json.detail?.status], [200, 'paid'], 'QA3-02 customer.updated with a new default card: the open invoice is paid');
  const subPost = stripeWrites(mark, `/v1/subscriptions/${m.subscription}`)[0];
  eq([subPost?.body.default_payment_method, subPost?.idem], [pm, `sub-default-pm-${m.subscription}-${pm}`], 'QA3-02 the new card becomes the subscription’s default (idempotency key)');
  const pay = stripeWrites(mark, `/v1/invoices/${inv.id}/pay`)[0];
  eq([pay?.body.payment_method, pay?.idem, pay?.code], [pm, `invoice-pay-${inv.id}-${pm}`, 200], 'QA3-02 invoices.pay with that card (idempotency key)');
  eq([memberRow(m.id).payment_failed_at, (await stripe('GET', `invoices/${inv.id}`)).json.status], [null, 'paid'], 'QA3-02 the problem is cleared; Stripe’s invoice is paid');
  const twice = await postWebhook(stripeEvent('payment_method.attached', { id: pm, object: 'payment_method', customer: m.customer }));
  eq(twice.json.status, 'ignored', 'QA3-02 the portal’s payment_method.attached after it: nothing more to do');

  const d = await makeMember('portaldecl', 'problem');
  const declined = await postWebhook(stripeEvent('customer.updated', (await stripe('POST', `customers/${d.customer}`, { invoice_settings: { default_payment_method: 'pm_fail_declined' } })).json, { previous_attributes: { invoice_settings: { default_payment_method: null } } }));
  eq([declined.status, declined.json.detail?.status], [200, 'declined'], 'QA3-02 a declined new card: 200, declined');
  ok(memberRow(d.id).payment_failed_at, 'QA3-02 and the member is still in the payment problem state');

  const a = await makeMember('portalattach', 'problem');
  const att = await postWebhook(stripeEvent('payment_method.attached', { id: 'pm_card_visa_1111', object: 'payment_method', customer: a.customer }));
  eq([att.json.detail?.status, memberRow(a.id).payment_failed_at], ['paid', null], 'QA3-02 payment_method.attached for a problem member also pays it');

  const ok1 = await makeMember('portalactive');
  const markA = fakesMark();
  const ign = await postWebhook(stripeEvent('payment_method.attached', { id: 'pm_card_visa_2222', object: 'payment_method', customer: ok1.customer }));
  eq([ign.json.status, stripeWrites(markA, ok1.subscription).length], ['ignored', 0], 'QA3-02 an active member adding a card: nothing charged');
  const noCard = await postWebhook(stripeEvent('customer.updated', { id: a.customer, object: 'customer' }, { previous_attributes: { email: 'old@example.com' } }));
  eq(noCard.json.status, 'ignored', 'QA3-02 a customer.updated that is not the default card: ignored');

  // grace over, but the invoice was paid (invoice.paid missed): cleared, not cancelled
  const g = await makeMember('gracepaid', 'graceover');
  await stripe('POST', `invoices/${(await openInvoiceOf(g.subscription)).id}/pay`, { payment_method: 'pm_card_visa_4242' });
  const g2 = await makeMember('graceopen', 'graceover');
  const markG = fakesMark();
  const job = (await cron('memberships')).json.result;
  ok(job.graceCleared.includes(g.id) && !job.graceEnded.includes(g.id), 'QA3-02 grace over but paid in Stripe: the job clears the problem', job);
  eq([memberRow(g.id).membership_status, memberRow(g.id).payment_failed_at, stripeWrites(markG, g.subscription).length], ['active', null, 0], 'QA3-02 still a member, Stripe untouched');
  ok(job.graceEnded.includes(g2.id) && stripeWrites(markG, g2.subscription).some((c) => c.method === 'DELETE'), 'QA3-02 grace over and still unpaid: cancelled and ended as before');

  // approve: the card goes on the customer, not the subscription
  const email = `f1.t-approve-${Date.now()}@example.com`;
  const pmApply = `pm_card_visa_${String(Date.now()).slice(-4)}`;
  const applied = await action('apply.submitApplication', [fd({ full_name: 'Approve Tester', email, phone: '+447700900123', employer: 'X', role_title: 'Y', linkedin_url: 'https://linkedin.com/in/x', instagram_username: 'x', stripe_payment_method_id: pmApply })]);
  eq(applied.result, { success: true }, 'QA3-02 setup: an application');
  const app = sql1(`select id, stripe_customer_id from applications where email = ${q(email)}`);
  const markP = fakesMark();
  await action('admin.applications.approveApplication', [fd({ id: app.id })], admin);
  const custPost = fakesSince(markP, 'stripe').find((c) => c.method === 'POST' && c.path === `/v1/customers/${app.stripe_customer_id}`);
  const subCreate = fakesSince(markP, 'stripe').find((c) => c.method === 'POST' && c.path === '/v1/subscriptions');
  eq(custPost?.body.invoice_settings?.default_payment_method, pmApply, 'QA3-02 approve: the saved card is the customer’s invoice default');
  ok(subCreate && !('default_payment_method' in subCreate.body), 'QA3-02 approve: the subscription has no card of its own', subCreate?.body);
  ok(sql1(`select membership_status from members where email = ${q(email)}`)?.membership_status === 'active', 'QA3-02 approve still makes the member');
}

// ================================================================ QA3-03 Stripe's truth, not a late event
{
  const m = await makeMember('stale');
  const s = await memberSession(m.email);
  await action('you.requestCancelMembership', ['x'], s);
  const cancelled = (await stripe('GET', `subscriptions/${m.subscription}`)).json;
  await action('you.keepMyMembership', [], s);
  const late = await postWebhook(stripeEvent('customer.subscription.updated', cancelled, { previous_attributes: { cancel_at_period_end: false, cancel_at: null } }));
  eq([late.status, memberRow(m.id).cancel_at], [200, null], 'QA3-03 the late "cancel at period end" after Keep: nothing comes back (Stripe re-read)');

  const c = await makeMember('stalecxl');
  exec(`update members set cancel_at = now() - interval '1 minute', cancel_requested_at = now() - interval '20 days' where id = ${q(c.id)}`);
  const later = await makeMember('cxlater');
  const subLater = (await stripe('POST', `subscriptions/${later.subscription}`, { cancel_at_period_end: 'true' })).json;
  exec(`update members set cancel_at = now() - interval '1 minute', cancel_requested_at = now() where id = ${q(later.id)}`);
  const gone = await makeMember('cxgone', 'lapsed');
  const mark = fakesMark();
  const job = (await cron('memberships')).json.result;
  ok(job.cancelCleared.includes(c.id) && !job.cancelDatePassed.includes(c.id), 'QA3-03 cancel date passed but Stripe is not cancelling: the date is cleared, not ended', job);
  eq([memberRow(c.id).membership_status, memberRow(c.id).cancel_at, stripeWrites(mark, c.subscription).length], ['active', null, 0], 'QA3-03 still active, Stripe untouched');
  ok(job.cancelMoved.includes(later.id), 'QA3-03 Stripe ends it later: that date is used');
  eq(new Date(memberRow(later.id).cancel_at).getTime(), subLater.cancel_at * 1000, 'QA3-03 cancel_at is Stripe’s');
  ok(job.cancelDatePassed.includes(gone.id) && memberRow(gone.id).ended_reason === 'member_cancelled', 'QA3-03 Stripe ended it: ended');
}

// ================================================================ QA1-01 cancelling while a payment has failed; QA3-11 Keep clears cancel_at
{
  const m = await makeMember('probcxl', 'problem');
  const s = await memberSession(m.email);
  const grace = memberRow(m.id).grace_until;
  const pre = (await action('you.getCancelMembershipPreview', [], s)).result;
  eq(new Date(pre.endsAt).getTime(), new Date(grace).getTime(), 'QA1-01 step 1 shows the grace date');
  const mark = fakesMark();
  const r = (await action('you.requestCancelMembership', ['Too busy'], s)).result;
  eq([r.ok, new Date(r.endsAt).getTime(), r.endsOn], [true, new Date(grace).getTime(), dayDate(grace)], 'QA1-01 the cancel ends on the grace date');
  const st = stripeWrites(mark, `/v1/subscriptions/${m.subscription}`)[0];
  eq([st?.body.cancel_at, st?.body.proration_behavior, st?.body.cancel_at_period_end, /^sub-cancel-at-grace-/.test(st?.idem ?? '')], [String(Math.floor(new Date(grace).getTime() / 1000)), 'none', undefined, true], 'QA1-01 Stripe cancel_at is the grace moment (no attempts after)');
  eq(new Date(memberRow(m.id).cancel_at).getTime(), new Date(grace).getTime(), 'QA1-01 cancel_at stored = grace end');
  const you = await page('/members/you', s);
  ok(you.text.includes(`Ends ${dayMonth(grace)}`) || you.text.includes(`"endsOn":"${dayMonth(grace)}"`), `QA1-01 the card says Ends ${dayMonth(grace)} (ending wins over problem)`);
  await waitFor(async () => (await mailTo(m.email)).some((e) => e.subject === `Your membership ends on ${dayDate(grace)}`), `QA1-01 the cancel-requested email says ${dayDate(grace)}`);
  const sync = await postWebhook(stripeEvent('customer.subscription.updated', (await stripe('GET', `subscriptions/${m.subscription}`)).json, { previous_attributes: { cancel_at: null } }));
  eq([sync.status, new Date(memberRow(m.id).cancel_at).getTime()], [200, new Date(grace).getTime()], 'QA1-01 Stripe’s update (seconds) keeps the same date');
  const markK = fakesMark();
  eq((await action('you.keepMyMembership', [], s)).result, { ok: true }, 'QA3-11 Keep my membership: ok');
  const keep = stripeWrites(markK, `/v1/subscriptions/${m.subscription}`);
  eq(keep.map((c) => JSON.stringify(c.body)), ['{"cancel_at":""}'], 'QA3-11 Keep clears Stripe’s cancel_at (not only cancel_at_period_end)');
  const after = (await stripe('GET', `subscriptions/${m.subscription}`)).json;
  eq([after.cancel_at, after.cancel_at_period_end, memberRow(m.id).cancel_at, Boolean(memberRow(m.id).payment_failed_at)], [null, false, null, true], 'QA3-11 nothing set to cancel; back to the payment problem');
}

// ================================================================ QA3-05 Delete my account and admin Cancel now racing Stripe
for (const delay of [0, 30]) {
  const m = await makeMember(`delrace${delay}`);
  await makeBooking(m, await makeEvent(`f1delrace${delay}a`, { price: 1400 }));
  await makeBooking(m, await makeEvent(`f1delrace${delay}b`, { price: 0 }));
  const s = await memberSession(m.email);
  const sub = (await stripe('GET', `subscriptions/${m.subscription}`)).json;
  const p1 = action('you.deleteMyAccount', ['delete'], s);
  await sleep(delay);
  const p2 = postWebhook(stripeEvent('customer.subscription.deleted', { ...sub, status: 'canceled', ended_at: Math.floor(Date.now() / 1000), cancellation_details: { reason: 'cancellation_requested' } }));
  const [r1, r2] = await Promise.all([p1, p2]);
  eq([r1.redirect, r2.status], ['/', 200], `QA3-05 delay ${delay}ms: deleted, webhook 200`);
  await sleep(2500);
  eq(sql(`select template from message_log where member_id = ${q(m.id)} order by 1`).map((x) => x.template), ['account-deleted'], `QA3-05 delay ${delay}ms: only the account-deleted email`);
  eq(memberRow(m.id).ended_reason, 'account_deleted', `QA3-05 delay ${delay}ms: ended_reason account_deleted`);
  if (delay) eq(sql(`select distinct cancel_reason from bookings where member_id = ${q(m.id)}`).map((x) => x.cancel_reason), ['account_deleted'], 'QA3-05 the bookings say account_deleted');
}
for (const delay of [0, 20]) {
  const m = await makeMember(`acrace${delay}`);
  await makeBooking(m, await makeEvent(`f1acrace${delay}`, { price: 1100 }));
  const sub = (await stripe('GET', `subscriptions/${m.subscription}`)).json;
  const p1 = action('admin.memberStatus.adminCancelMemberNow', [m.id, { stripe: true }], admin);
  await sleep(delay);
  const p2 = postWebhook(stripeEvent('customer.subscription.deleted', { ...sub, status: 'canceled', ended_at: Math.floor(Date.now() / 1000), cancellation_details: { reason: 'cancellation_requested' } }));
  await Promise.all([p1, p2]);
  eq(memberRow(m.id).ended_reason, 'admin_cancelled', `QA3-05 admin Cancel now racing Stripe (${delay}ms): admin_cancelled`);
  await waitFor(async () => (await mailTo(m.email)).some((e) => /ended/i.test(e.subject ?? '')), `QA3-05 (${delay}ms) membership-ended sent`);
  const ended = (await mailTo(m.email)).find((e) => /ended/i.test(e.subject ?? ''));
  ok(!(ended.text ?? '').includes('You cancelled'), `QA3-05 (${delay}ms) its Why line does not say the member cancelled`);
  eq(sql1(`select count(*)::int as n from message_log where member_id = ${q(m.id)} and template = 'membership-ended'`).n, 1, `QA3-05 (${delay}ms) one membership-ended`);
}

// ================================================================ QA3-07 the refunds job
{
  const m = await makeMember('refjob');
  const s = await memberSession(m.email);
  // a) claimed, never answered (crash after the claim)
  const ba = await makeBooking(m, await makeEvent('f1refa', { price: 1600 }));
  exec(`update bookings set status = 'cancelled', cancelled_at = now() - interval '10 minutes', cancelled_by = 'member', cancel_reason = 'member', refund_status = 'pending', refund_attempts = 1, refund_attempted_at = now() - interval '10 minutes' where id = ${q(ba.id)}`);
  // b) cancelled, refund never started
  const bb = await makeBooking(m, await makeEvent('f1refb', { price: 1700 }));
  exec(`update bookings set status = 'cancelled', cancelled_at = now() - interval '10 minutes', cancelled_by = 'member', cancel_reason = 'member' where id = ${q(bb.id)}`);
  // e) Stripe refunded it, then the save was lost
  const be = await makeBooking(m, await makeEvent('f1refe', { price: 1900 }));
  const madeE = (await stripe('POST', 'refunds', { payment_intent: be.pi, amount: 1900, metadata: { booking_id: be.id } })).json;
  exec(`update bookings set status = 'cancelled', cancelled_at = now() - interval '10 minutes', cancelled_by = 'club', cancel_reason = 'event_cancelled', refund_status = 'pending', refund_attempts = 1, refund_attempted_at = now() - interval '10 minutes' where id = ${q(be.id)}`);
  // f) pending at Stripe
  const bf = await makeBooking(m, await makeEvent('f1reff', { price: 1000 }));
  const madeF = (await stripe('POST', 'refunds', { payment_intent: bf.pi, amount: 1000, metadata: { booking_id: bf.id } })).json;
  exec(`update bookings set status = 'cancelled', cancelled_at = now(), cancel_reason = 'member', refund_status = 'pending', refund_pence = 1000, stripe_refund_id = ${q(madeF.id)} where id = ${q(bf.id)}`);
  const mark = fakesMark();
  const job = await cron('refunds');
  eq(job.status, 200, 'QA3-07 GET /api/cron/refunds: 200');
  const R = job.json.result;
  ok(R.retried.some((x) => x.bookingId === ba.id && x.status === 'succeeded'), 'QA3-07 a refund stuck in pending is retried and succeeds', R);
  eq(refundPosts(mark, ba.pi).map((c) => c.idem), [`refund-booking-${ba.id}`], 'QA3-07 with the same idempotency key');
  ok(R.started.some((x) => x.bookingId === bb.id && x.status === 'succeeded'), 'QA3-07 a cancel whose refund never started is refunded');
  eq([bookingRow(ba.id).refund_status, bookingRow(bb.id).refund_status], ['succeeded', 'succeeded'], 'QA3-07 both rows succeeded');
  await waitFor(() => messages(`booking_id in (${q(ba.id)}, ${q(bb.id)}) and template = 'booking-cancelled' and status = 'sent'`).length === 2, 'QA3-07 and the members get their cancellation emails then');
  eq([refundPosts(mark, be.pi).length, bookingRow(be.id).stripe_refund_id, bookingRow(be.id).refund_status], [0, madeE.id, 'succeeded'], 'QA3-07 a refund Stripe already made is found and recorded, not made twice');
  ok(R.refreshed.some((x) => x.bookingId === bf.id && x.status === 'succeeded'), 'QA3-07 a pending refund is asked about again');

  // c) Stripe fails three times: pending, pending, failed + the club alerted; the member is not told "on its way"
  const bc = await makeBooking(m, await makeEvent('f1refc', { price: 2100 }));
  await fakeRefundMode(bc.pi, 'error500');
  const c1 = (await action('events.cancelBooking', [bc.id], s)).result;
  eq([c1.ok, c1.refund], [true, 'pending'], 'QA3-07 Stripe down: the booking is cancelled, the refund pending');
  const rc = bookingRow(bc.id);
  ok(rc.refund_status === 'pending' && rc.refund_attempts === 1 && rc.refund_error, 'QA3-07 the attempt and error are saved', rc);
  backdate(bc.id); await cron('refunds');
  eq([bookingRow(bc.id).refund_status, bookingRow(bc.id).refund_attempts], ['pending', 2], 'QA3-07 second try fails: still pending');
  backdate(bc.id); await cron('refunds');
  eq([bookingRow(bc.id).refund_status, bookingRow(bc.id).refund_attempts], ['failed', 3], 'QA3-07 third try fails: failed');
  await waitFor(() => messages(`dedupe_key = ${q(`admin-alert:refund-failed:${bc.id}`)} and status = 'sent'`).length === 1, 'QA3-07 the club is alerted after the last try');
  eq(messages(`booking_id = ${q(bc.id)} and template = 'booking-cancelled'`).length, 0, 'QA3-07 the member was not told the money is on its way');
  // d) fails once, then Stripe answers
  const bd = await makeBooking(m, await makeEvent('f1refd', { price: 2200 }));
  await fakeRefundMode(bd.pi, 'error500');
  await action('events.cancelBooking', [bd.id], s);
  await fakeRefundMode(bd.pi, 'ok');
  backdate(bd.id); await cron('refunds');
  eq([bookingRow(bd.id).refund_status, bookingRow(bd.id).refund_attempts], ['succeeded', 2], 'QA3-07 Stripe back: the retry succeeds');
  await waitFor(() => messages(`booking_id = ${q(bd.id)} and template = 'booking-cancelled' and status = 'sent'`).length === 1, 'QA3-07 and the member is emailed then');
}

// ================================================================ QA1-03 the price the member saw; QA1-08 one PaymentIntent per attempt
{
  const m = await makeMember('price');
  const s = await memberSession(m.email);
  const startLocal = (() => { const d = new Date(Date.now() + 9 * 86400000); return `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)}T18:30`; })();
  const title = `F1 price ${Date.now()}`;
  const base = { title, category: 'sport', location: 'Price Hall', start_time: startLocal, price_pounds: '12', capacity: '20' };
  eq((await action('admin.events.createEvent', [fd(base)], admin)).result.success, true, 'QA1-03 setup: a £12 event');
  const ev = sql1(`select id, slug from events where title = ${q(title)}`);
  ok((await page(`/members/events/${ev.slug}`, s)).text.includes('£12'), 'QA1-03 the page shows £12');
  eq((await action('admin.events.updateEventDetails', [fd({ ...base, event_id: ev.id, price_pounds: '20' })], admin)).result.success, true, 'QA1-03 the admin changes it to £20');
  const pageNow = (await page(`/members/events/${ev.slug}`, s)).text;
  ok(pageNow.includes('£20') && !pageNow.includes('£12'), 'QA1-03 the page shows £20 straight away (the edit expires the event cache)');
  let mark = fakesMark();
  const stale = (await action('events.createEventPaymentIntent', [fd({ event_id: ev.id, price_pence: '1200', attempt_id: 'f1-attempt-0001' })], s)).result;
  eq(stale, { success: false, error: 'The price has changed to £20. Check it and try again.', reason: 'price_changed', pricePence: 2000 }, 'QA1-03 paying at the old price: refused with the new price');
  eq(fakesSince(mark, 'stripe').filter((c) => c.path === '/v1/payment_intents' && c.method === 'POST').length, 0, 'QA1-03 and no PaymentIntent was made');
  // changed behind the cache (in the database): the member is told, and the refused attempt expires the cache
  await page(`/members/events/${ev.slug}`, s); // the refusal expired the cache: fill it again at £20
  exec(`update events set price_pence = 2500 where id = ${q(ev.id)}`);
  ok((await page(`/members/events/${ev.slug}`, s)).text.includes('£20'), 'QA1-03 setup: a change made outside the admin is still cached (£20)');
  eq((await action('events.createEventPaymentIntent', [fd({ event_id: ev.id, price_pence: '2000' })], s)).result.reason, 'price_changed', 'QA1-03 the member is refused at £20');
  ok((await page(`/members/events/${ev.slug}`, s)).text.includes('£25'), 'QA1-03 and the page then shows £25');

  // QA1-08
  mark = fakesMark();
  const a1 = (await action('events.createEventPaymentIntent', [fd({ event_id: ev.id, price_pence: '2500', attempt_id: 'f1-attempt-aaaa' })], s)).result;
  const a2 = (await action('events.createEventPaymentIntent', [fd({ event_id: ev.id, price_pence: '2500', attempt_id: 'f1-attempt-aaaa' })], s)).result;
  const a3 = (await action('events.createEventPaymentIntent', [fd({ event_id: ev.id, price_pence: '2500', attempt_id: 'f1-attempt-bbbb' })], s)).result;
  const idems = fakesSince(mark, 'stripe').filter((c) => c.path === '/v1/payment_intents' && c.method === 'POST').map((c) => c.idem);
  eq([idems[0] === idems[1], idems[1] === idems[2], idems[2].endsWith('-f1-attempt-bbbb')], [true, false, true], 'QA1-08 the idempotency key is per attempt (a double tap is one), not per minute');
  ok(a1.success && a3.success, 'QA1-08 both attempts open payment');
  const pi1 = piOf(a1.clientSecret);
  await fakePay(pi1, 'http://127.0.0.1:9/none');
  eq((await action('events.confirmEventPayment', [pi1, ev.id], s)).result, { booked: true }, 'QA1-08 setup: paid and booked');
  const bk = sql1(`select id from bookings where stripe_payment_intent_id = ${q(pi1)}`);
  eq((await action('events.cancelBooking', [bk.id], s)).result.refund, 'succeeded', 'QA1-08 cancelled and refunded');
  const again = (await action('events.createEventPaymentIntent', [fd({ event_id: ev.id, price_pence: '2500', attempt_id: 'f1-attempt-cccc' })], s)).result;
  const piAgain = (await stripe('GET', `payment_intents/${piOf(again.clientSecret)}`)).json;
  eq([piAgain.id !== pi1, piAgain.status], [true, 'requires_payment_method'], 'QA1-08 booking again within the minute: a new PaymentIntent, ready to pay');
}

// ================================================================ QA3-08 matching by subscription
{
  const m = await makeMember('othersub');
  const other = (await stripe('POST', 'subscriptions', { customer: m.customer, items: { 0: { price: 'price_membership' } } })).json;
  const r = await postWebhook(stripeEvent('customer.subscription.deleted', { ...other, status: 'incomplete_expired', ended_at: Math.floor(Date.now() / 1000) }));
  eq([r.json.status, memberRow(m.id).membership_status], ['ignored', 'active'], 'QA3-08 another subscription of the same customer ends: the membership stays');
  const upd = await postWebhook(stripeEvent('customer.subscription.updated', { ...other, cancel_at_period_end: true }));
  eq([upd.json.status, memberRow(m.id).cancel_at], ['ignored', null], 'QA3-08 and its updates are not ours');
  const oneoff = await postWebhook(stripeEvent('invoice.payment_failed', { id: `in_f1_oneoff_${Date.now()}`, object: 'invoice', customer: m.customer, amount_due: 4500, parent: null }));
  eq([oneoff.json.status, memberRow(m.id).payment_failed_at], ['ignored', null], 'QA3-08 a one-off invoice failing: not a membership payment');
  const otherInv = await postWebhook(stripeEvent('invoice.payment_failed', { id: `in_f1_other_${Date.now()}`, object: 'invoice', customer: m.customer, amount_due: 1000, parent: { subscription_details: { subscription: other.id } } }));
  eq([otherInv.json.status, memberRow(m.id).payment_failed_at], ['ignored', null], 'QA3-08 an invoice of the other subscription: ignored');
}

// ================================================================ QA3-09 paid, but it can never be booked: refunded
{
  const m = await makeMember('unbook');
  const s = await memberSession(m.email);
  const cases = [
    ['cancelled', async (ev) => action('admin.eventBookings.adminCancelEvent', [ev.id, {}], admin)],
    ['started', async (ev) => exec(`update events set start_time = now() - interval '1 minute' where id = ${q(ev.id)}`)],
  ];
  const unbookedPis = [];
  for (const [label, change] of cases) {
    const ev = await makeEvent(`f1unbook${label}`, { price: 2100 });
    const r = (await action('events.createEventPaymentIntent', [fd({ event_id: ev.id })], s)).result;
    const pi = piOf(r.clientSecret);
    unbookedPis.push(pi);
    await change(ev);
    const mark = fakesMark();
    await fakePay(pi);
    const pageResult = (await action('events.confirmEventPayment', [pi, ev.id], s)).result;
    eq([pageResult.booked, pageResult.reason, pageResult.refunded], [false, 'paid_not_booked', true], `QA3-09 event ${label} while paying: not booked, refunded`);
    ok(refundPosts(mark, pi).every((c) => c.idem === `refund-unbooked-${pi}`) && refundPosts(mark, pi).length >= 1, `QA3-09 (${label}) refund-unbooked-<pi>`);
    eq(Object.values((await fakeState()).refunds).filter((x) => x.payment_intent === pi).map((x) => x.amount), [2100], `QA3-09 (${label}) one refund of £21 (page and webhook)`);
    await waitFor(() => messages(`dedupe_key = ${q(`admin-alert:paid-not-booked:${pi}`)} and status = 'sent'`).length === 1, `QA3-09 (${label}) the club is alerted`);
    eq(sql1(`select count(*)::int as n from bookings where stripe_payment_intent_id = ${q(pi)}`).n, 0, `QA3-09 (${label}) no booking`);
  }
  const alert = (await fakeState()).emails.find((e) => /paid, not booked/i.test(e.subject ?? '') && (e.text ?? '').includes(unbookedPis[0]));
  ok(alert && (alert.text ?? '').includes('refunded automatically'), 'QA3-09 the alert says it was refunded automatically');
  // the membership ended while paying
  const e = await makeMember('unbookended');
  const se = await memberSession(e.email);
  const ev3 = await makeEvent('f1unbookended', { price: 1300 });
  const pi3 = piOf((await action('events.createEventPaymentIntent', [fd({ event_id: ev3.id })], se)).result.clientSecret);
  exec(`update members set membership_status = 'cancelled', ended_at = now(), ended_reason = 'admin_cancelled' where id = ${q(e.id)}`);
  const mark3 = fakesMark();
  await fakePay(pi3);
  await waitFor(() => refundPosts(mark3, pi3).length === 1, 'QA3-09 membership ended while paying: refunded');
  // a full event still books (A-D7)
  const full = await makeEvent('f1unbookfull', { price: 1200, capacity: 1 });
  const f = await makeMember('unbookfull');
  const sf = await memberSession(f.email);
  const pi4 = piOf((await action('events.createEventPaymentIntent', [fd({ event_id: full.id })], sf)).result.clientSecret);
  await insertBooking(await makeMember('unbookfiller'), full);
  await fakePay(pi4);
  await waitFor(() => sql1(`select status from bookings where stripe_payment_intent_id = ${q(pi4)}`)?.status === 'confirmed', 'QA3-09 a paid booking on a full event still books (A-D7)');
}

// ================================================================ QA3-10 a database error makes Stripe send the event again
{
  const m = await makeMember('dberr');
  exec(`create or replace function public.f1_test_fail_member() returns trigger language plpgsql as $$ begin if new.id = ${q(m.id)} then raise exception 'f1 test: database down'; end if; return new; end $$`);
  exec(`drop trigger if exists f1_test_fail_member on public.members; create trigger f1_test_fail_member before update on public.members for each row execute function public.f1_test_fail_member()`);
  const evt = stripeEvent('invoice.payment_failed', { id: `in_f1_dberr_${Date.now()}`, object: 'invoice', customer: m.customer, amount_due: 1000, parent: { subscription_details: { subscription: m.subscription } } });
  let first;
  try {
    first = await postWebhook(evt);
  } finally {
    exec('drop trigger if exists f1_test_fail_member on public.members; drop function if exists public.f1_test_fail_member()');
  }
  eq(first.status, 500, 'QA3-10 a database error in a handler: 500 (Stripe retries)');
  const se = sql1(`select processed_at, error from stripe_events where id = ${q(evt.id)}`);
  ok(!se.processed_at && /database down/.test(se.error ?? ''), 'QA3-10 the event is not marked processed; the error is kept', se);
  const retry = await postWebhook(evt);
  eq([retry.status, retry.json.status, Boolean(memberRow(m.id).payment_failed_at)], [200, 'processed', true], 'QA3-10 Stripe’s retry is processed');

  const s = await memberSession(m.email);
  const ev = await makeEvent('f1dberr', { price: 1500 });
  const pi = piOf((await action('events.createEventPaymentIntent', [fd({ event_id: ev.id })], s)).result.clientSecret);
  exec(`create or replace function public.f1_test_fail_booking() returns trigger language plpgsql as $$ begin if new.stripe_payment_intent_id = ${q(pi)} then raise exception 'f1 test: database down'; end if; return new; end $$`);
  exec(`drop trigger if exists f1_test_fail_booking on public.bookings; create trigger f1_test_fail_booking before insert on public.bookings for each row execute function public.f1_test_fail_booking()`);
  let paid;
  let pageResult;
  try {
    paid = await fakePay(pi);
    pageResult = (await action('events.confirmEventPayment', [pi, ev.id], s)).result;
  } finally {
    exec('drop trigger if exists f1_test_fail_booking on public.bookings; drop function if exists public.f1_test_fail_booking()');
  }
  eq(paid.webhook, 500, 'QA3-10 booking cannot be saved: the payment webhook answers 500');
  eq(pageResult, { booked: false, pending: true }, 'QA3-10 the page says still processing (not "paid, not booked")');
  eq(messages(`dedupe_key = ${q(`admin-alert:paid-not-booked:${pi}`)}`).length, 0, 'QA3-10 no false alert to the club');
  const piObj = (await stripe('GET', `payment_intents/${pi}`)).json;
  const re = await postWebhook(stripeEvent('payment_intent.succeeded', piObj));
  eq([re.status, sql1(`select status from bookings where stripe_payment_intent_id = ${q(pi)}`)?.status], [200, 'confirmed'], 'QA3-10 Stripe’s retry books it');
}

// ================================================================ QA3-12 applications: no anonymous inserts; /apply still works
{
  const anon = await fetch(`${REST}/applications`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ full_name: 'x', email: `f1.t-anon-${Date.now()}@example.com`, status: 'approved', stripe_subscription_id: 'sub_fake' }) });
  ok(anon.status === 401 || anon.status === 403, `QA3-12 anon POST /rest/v1/applications refused (${anon.status})`);
  const email = `f1.t-apply-${Date.now()}@example.com`;
  eq((await action('apply.submitApplication', [fd({ full_name: 'Apply Tester', email, phone: '+447700900123', employer: 'X', role_title: 'Y', linkedin_url: 'https://linkedin.com/in/x', instagram_username: 'x', stripe_payment_method_id: `pm_apply_${Date.now()}` })])).result, { success: true }, 'QA3-12 applying through /apply still works');
  eq(sql1(`select status from applications where email = ${q(email)}`)?.status, 'pending', 'QA3-12 the application is saved, pending');
}

// ================================================================ QA3-13 the card in the payment-failed email
{
  const a = await makeMember('pfcardcus');
  await stripe('POST', `customers/${a.customer}`, { invoice_settings: { default_payment_method: 'pm_card_mastercard_4444' } });
  await postWebhook(stripeEvent('invoice.payment_failed', { id: `in_f1_card_${Date.now()}a`, object: 'invoice', customer: a.customer, amount_due: 1000, default_payment_method: null, parent: { subscription_details: { subscription: a.subscription } } }));
  await waitFor(async () => (await mailTo(a.email)).some((e) => (e.text ?? '').includes('Mastercard ending 4444')), 'QA3-13 the customer’s default card is named');
  const b = await makeMember('pfcardsub');
  await stripe('POST', `subscriptions/${b.subscription}`, { default_payment_method: 'pm_card_amex_0005' });
  await postWebhook(stripeEvent('invoice.payment_failed', { id: `in_f1_card_${Date.now()}b`, object: 'invoice', customer: b.customer, amount_due: 1000, default_payment_method: null, parent: { subscription_details: { subscription: b.subscription } } }));
  await waitFor(async () => (await mailTo(b.email)).some((e) => (e.text ?? '').includes('American Express ending 0005')), 'QA3-13 the subscription’s own default card wins');
}

// ================================================================ release/reconcile-members.mjs
{
  const gone = await makeMember('recgone');
  await stripe('DELETE', `subscriptions/${gone.subscription}`);
  const ending = await makeMember('recending');
  const subE = (await stripe('POST', `subscriptions/${ending.subscription}`, { cancel_at_period_end: 'true' })).json;
  const prob = await makeMember('recprob');
  await fakeInvoiceFailed(prob.subscription);
  const fine = await makeMember('recfine');
  const prefix = 'f1.t-rec';
  const dry = runRelease('reconcile-members.mjs', '--only-email-prefix', prefix);
  ok(dry.status === 0 && dry.stdout.includes('DRY RUN') && dry.stdout.includes(gone.email) && dry.stdout.includes('ended:'), 'reconcile dry run: lists the changes', dry.stdout + dry.stderr);
  eq(memberRow(gone.id).membership_status, 'active', 'reconcile dry run changes nothing');
  const applied = runRelease('reconcile-members.mjs', '--apply', '--only-email-prefix', prefix);
  ok(applied.status === 0 && applied.stdout.includes('3 changed'), 'reconcile --apply: 3 changed', applied.stdout + applied.stderr);
  eq([memberRow(gone.id).membership_status, memberRow(gone.id).ended_reason], ['cancelled', 'admin_cancelled'], 'reconcile: Stripe ended it, so it is ended here');
  eq(new Date(memberRow(ending.id).cancel_at).getTime(), subE.cancel_at * 1000, 'reconcile: Stripe is set to cancel: cancel_at');
  ok(memberRow(prob.id).payment_failed_at && memberRow(prob.id).grace_until, 'reconcile: an unpaid invoice: the payment problem with a grace date');
  ok(dry.stdout.includes(`${fine.email} (${fine.id}): matches Stripe`), 'reconcile: a member who matches is left alone');
  const again = runRelease('reconcile-members.mjs', '--apply', '--only-email-prefix', prefix);
  ok(again.status === 0 && again.stdout.includes('0 changed'), 'reconcile again: nothing to change', again.stdout);
}

void BASE; void WEBHOOK;
done();
