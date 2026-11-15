// Paid Open Invite (Albert, 15 Nov 2026: "Ok shall we build the ability to add costs to open invite"), on the money
// rules approved on 25 Oct: lib/server/plan-payments.ts, supabase/migrations/20261115090000_paid_plans.sql. Since 16
// Nov 2026 the Vinted way (20261116090000_host_money_credit.sql): no Get paid to add a price; once the plan is over the
// money is the host's, to add to Club Yuppie credit or withdraw (Get paid then); credit pays for places. Against the
// local stack's fake Stripe (accounts, account links, manual capture, refunds, transfers) on the Phase B server.
//
//   PHASE_B_BASE=http://localhost:3241 node tests/e2e/phase-b/23-paid-plans.mjs
import { execFileSync } from 'node:child_process';

import {
  BASE,
  action,
  adminSession,
  cookieFor,
  cronAt,
  done,
  emailsTo,
  emit,
  eq,
  exec,
  fakeState,
  fakesMark,
  makeMemberWithPhoto,
  ok,
  page,
  planInput,
  postPlan,
  q,
  setPlanStart,
  sql,
  sql1,
} from './lib.mjs';

// The migration again first: it is re-runnable, and 00-migration.mjs applies the stage 2 file again (which puts the
// Updates kinds back to stage 2's list), so the suite's order would otherwise matter.
// (Rows from an earlier run in the 16 Nov statuses and credit kinds would trip the older files' checks: test rows only.)
exec(`delete from credit_ledger where kind in ('earnings', 'plan'); update plan_payments set status = 'paid_out' where status in ('ready', 'credited', 'withdrawing')`);
for (const file of ['20261115090000_paid_plans.sql', '20261115120000_booking_fee.sql', '20261116090000_host_money_credit.sql']) {
  execFileSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-f', new URL(`../../../supabase/migrations/${file}`, import.meta.url).pathname], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
}
ok(true, 'the paid plans migrations apply again on top of themselves');

const PREFIX = process.env.PHASE_A_TAG || 'bf.';
const NOWHERE = `${BASE}/api/nowhere`;
const fake = (path, body = {}) => fetch(`https://api.stripe.com/__fake/stripe/${path}`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
/** The card is held (manual capture); the webhook goes nowhere unless given, so the page's own confirm settles it. */
const holdCard = (pi, webhook = NOWHERE) => fetch(`https://api.stripe.com/__fake/stripe/pay/${pi}?webhook=${encodeURIComponent(webhook)}`, { method: 'POST' }).then((r) => r.json());
const piOf = (secret) => secret.split('_secret_')[0];
const pay = (name, args, who) => action(`pay.${name}`, args, who.session).then((r) => r.result);
const payment = (planId, memberId) => sql1(`select * from plan_payments where plan_id = ${q(planId)} and payer_id = ${q(memberId)} order by paid_at desc limit 1`);
const going = (planId, memberId) => sql1(`select status from plan_members where plan_id = ${q(planId)} and member_id = ${q(memberId)}`)?.status ?? null;
const update = (memberId, kind, planId) => sql1(`select * from updates where member_id = ${q(memberId)} and kind = ${q(kind)} and plan_id = ${q(planId)} order by created_at desc limit 1`);
const paid = (pence = 2200) => ({ cost: { pricePence: pence, faceValueConfirmed: true } });
const money = (name, who) => action(`money.${name}`, [], who.session).then((r) => r.result);
const credit = (memberId) => Number(sql1(`select coalesce(sum(amount_pence), 0)::int n from credit_ledger where member_id = ${q(memberId)}`).n);
const giveCredit = (memberId, pence) => exec(`insert into credit_ledger (member_id, amount_pence, kind, note) values (${q(memberId)}, ${pence}, 'admin', 'test')`);

const host = await makeMemberWithPhoto('payhost');
const ann = await makeMemberWithPhoto('payann');
const ben = await makeMemberWithPhoto('payben');
const cal = await makeMemberWithPhoto('paycal');
const admin = await adminSession(PREFIX);

// ---------------------------------------------------------------- a cost needs nothing set up (16 Nov 2026)
let r;
let p = await page('/members/open-invite/new', host.session);
ok(p.status === 200 && !p.text.includes('Set up Get paid'), 'the post form has no Get paid step', p.status);
eq(sql1(`select count(*)::int n from host_accounts where member_id = ${q(host.id)}`).n, 0, 'the host has no Stripe account');

// ---------------------------------------------------------------- posting with a cost
r = await action('invite.postOpenInvite', [planInput({ title: 'Paid no tick', cost: { pricePence: 2200, faceValueConfirmed: false } })], host.session);
eq(r.result.errors?.faceValue, 'Tick the box to say you’re not charging more.', 'the face-value tick is needed');
r = await action('invite.postOpenInvite', [planInput({ title: 'Paid too much', cost: { pricePence: 25000, faceValueConfirmed: true } })], host.session);
eq(r.result.errors?.price, 'The most you can charge is £200 a person.', 'at most £200');
const planA = await postPlan(host, { title: 'Padel, then pizza', places: 3, ...paid() });
eq(sql1(`select price_pence, face_value_confirmed from plans where id = ${q(planA)}`), { price_pence: 2200, face_value_confirmed: true }, 'a paid plan posts with its price');
const feed = (await action('invite.getOpenInviteFeed', [], ann.session)).result;
eq(feed.invites.find((i) => i.id === planA)?.cost?.pricePence, 2200, 'members see it with its cost');
p = await page(`/members/open-invite/${planA}`, ann.session);
ok(p.status === 200 && p.text.includes('Pay £23 and join'), 'its page: "Pay £23 and join" (the £22 place and the £1 booking fee, shown from the start)', p.status);
ok(/including a (<!-- -->)?£1(<!-- -->)? booking fee/.test(p.text), 'and the Cost line says the booking fee is in it');
eq(feed.invites.find((i) => i.id === planA)?.cost?.bookingFeePence, 100, 'the plan carries the £1 booking fee');
r = await action('invite.joinOpenInvite', [planA], ann.session);
eq([r.result.ok, r.result.reason], [false, 'paid'], 'I’m in is refused on a paid plan (it is Pay and join)');

// ---------------------------------------------------------------- Pay and join (the page settles it)
let start = await pay('startPlanPaymentAction', [planA], ann);
ok(start.ok && start.clientSecret, 'Pay and join opens payment', start);
eq([start.amountPence, start.creditPence], [2300, 0], 'for the place and the booking fee: £23 (no credit)');
const piA = piOf(start.clientSecret);
let pi = (await fakeState()).payment_intents[piA];
eq([pi.capture_method, pi.metadata.kind, pi.metadata.plan_id, pi.metadata.member_id, Number(pi.amount), pi.metadata.fee_pence, pi.metadata.credit_pence], ['manual', 'plan', planA, ann.id, 2300, '100', '0'], 'the card is only held (manual capture), for this place and the fee: the host has nothing set up');
eq(sql1(`select status from plan_holds where payment_intent_id = ${q(piA)}`).status, 'open', 'the place is held while paying');
let confirm = await pay('confirmPlanPaymentAction', [piA, planA], ann);
eq([confirm.ok, confirm.kind], [false, 'declined'], 'nothing held yet: declined, nothing taken');
let mark = fakesMark();
await holdCard(piA);
confirm = await pay('confirmPlanPaymentAction', [piA, planA], ann);
eq([confirm.ok, confirm.kind], [true, 'paid'], 'card held: the place is taken, then the money');
eq(going(planA, ann.id), 'going', 'Ann is in');
let row = payment(planA, ann.id);
eq([row.status, row.amount_pence, row.fee_pence, row.credit_pence, row.method, Boolean(row.charge_id)], ['held', 2200, 100, 0, 'Visa ending 4242', true], 'the payment: £22 for the host held by Club Yuppie, the £1 fee, Visa ending 4242, its charge kept');
eq((await fakeState()).payment_intents[piA].status, 'succeeded', 'captured at Stripe');
eq(confirm.invite.you.payment.status, 'held', 'the plan page: "You’re in, paid £22"');
ok(sql1(`select 1 as x from messages m join chats c on c.id = m.chat_id where c.plan_id = ${q(planA)} and m.system_event = 'paid' and m.about_member_id = ${q(ann.id)}`), 'the plan chat says Ann paid and is in');
const hostPaid = update(host.id, 'paid', planA);
eq([hostPaid?.actor_id, hostPaid?.refund_pence], [ann.id, 2200], 'the host’s Update: Ann paid £22');
await new Promise((res) => setTimeout(res, 1500));
ok(emailsTo(mark, ann.email).some((e) => e.subject === 'Receipt: Padel, then pizza'), 'Ann’s receipt email');
ok(emailsTo(mark, host.email).some((e) => e.subject === 'payann paid for Padel, then pizza' || /paid for Padel, then pizza$/.test(e.subject)), 'the host’s email: someone paid', emailsTo(mark, host.email));
confirm = await pay('confirmPlanPaymentAction', [piA, planA], ann);
eq([confirm.ok, sql1(`select count(*)::int n from plan_payments where payment_intent_id = ${q(piA)}`).n], [true, 1], 'confirming again changes nothing');
p = await page(`/members/open-invite/${planA}/receipt`, ann.session);
ok(p.status === 200 && new RegExp(`Receipt (<!-- -->)?${String(row.receipt_no).padStart(4, '0')}`).test(p.text), 'the receipt page, with its number');
ok(/NEXT_HTTP_ERROR_FALLBACK;404/.test((await page(`/members/open-invite/${planA}/receipt`, ben.session)).text), 'nobody else’s receipt ("Not on the list.")');
mark = fakesMark();
eq((await pay('emailReceiptAction', [planA], ann)).ok, true, 'Email me a copy');
await new Promise((res) => setTimeout(res, 800));
ok(emailsTo(mark, ann.email).some((e) => e.subject === 'Receipt: Padel, then pizza'), 'the copy is sent');

// ---------------------------------------------------------------- the webhook settles it too (the member never came back)
start = await pay('startPlanPaymentAction', [planA], ben);
const piB = piOf(start.clientSecret);
await holdCard(piB, `${BASE}/api/stripe/webhook`);
eq(going(planA, ben.id), 'going', 'payment_intent.amount_capturable_updated: Ben is in');
eq(payment(planA, ben.id)?.status, 'held', 'and his payment held');

// ---------------------------------------------------------------- full: nobody is charged
start = await pay('startPlanPaymentAction', [planA], cal);
eq([start.ok, start.kind], [false, 'full'], 'the plan is full (host, Ann, Ben): no hold, nothing taken');

// a held place counts; the last place goes to one member, and the other's card is let go
const planB = await postPlan(host, { title: 'Comedy, one spare', places: 2, ...paid(1500) });
const calStart = await pay('startPlanPaymentAction', [planB], cal);
r = await pay('startPlanPaymentAction', [planB], ann);
eq([r.ok, r.kind], [false, 'full'], 'a place held by Cal (paying) counts as taken');
const piCal = piOf(calStart.clientSecret);
await holdCard(piCal);
exec(`update plan_holds set held_until = now() - interval '1 minute' where payment_intent_id = ${q(piCal)}`);
const annStart = await pay('startPlanPaymentAction', [planB], ann);
ok(annStart.ok, 'Cal’s 10 minutes ran out: Ann can pay');
const piAnn = piOf(annStart.clientSecret);
await holdCard(piAnn);
eq((await pay('confirmPlanPaymentAction', [piAnn, planB], ann)).kind, 'paid', 'Ann gets the last place');
confirm = await pay('confirmPlanPaymentAction', [piCal, planB], cal);
eq([confirm.ok, confirm.kind], [false, 'full'], 'Cal, a moment later: "That was the last place"');
eq((await fakeState()).payment_intents[piCal].status, 'canceled', 'Cal’s card is let go: nothing taken');
eq(payment(planB, cal.id), null, 'and no payment recorded');

// closing the sheet gives the place back
const planC = await postPlan(host, { title: 'Spin, two spares', places: 3, ...paid(1000) });
const benC = await pay('startPlanPaymentAction', [planC], ben);
eq((await pay('releasePlanHoldAction', [planC], ben)).ok, true, 'closing the pay sheet');
eq(sql1(`select status from plan_holds where payment_intent_id = ${q(piOf(benC.clientSecret))}`).status, 'closed', 'the hold is let go');
eq((await fakeState()).payment_intents[piOf(benC.clientSecret)].status, 'canceled', 'and its PaymentIntent');

// the price changed while paying: nothing taken
const calC = await pay('startPlanPaymentAction', [planC], cal);
r = await action('plan.editOpenInvite', [planC, planInput({ title: 'Spin, two spares', places: 3, ...paid(1200) })], host.session);
eq(r.result.ok, true, 'the host changes the price while nobody has paid');
await holdCard(piOf(calC.clientSecret));
confirm = await pay('confirmPlanPaymentAction', [piOf(calC.clientSecret), planC], cal);
eq([confirm.kind, confirm.newPricePence], ['price-changed', 1200], '"The price changed": £10 to £12');
eq((await fakeState()).payment_intents[piOf(calC.clientSecret)].status, 'canceled', 'nothing taken');
const calC2 = await pay('startPlanPaymentAction', [planC], cal);
eq(calC2.amountPence, 1300, 'Pay £13 and join: a new payment at the new price (and the fee)');
await holdCard(piOf(calC2.clientSecret));
eq((await pay('confirmPlanPaymentAction', [piOf(calC2.clientSecret), planC], cal)).kind, 'paid', 'Cal pays £12');
r = await action('plan.editOpenInvite', [planC, planInput({ title: 'Spin, two spares', places: 3, ...paid(1500) })], host.session);
eq([r.result.ok, r.result.error], [false, 'People have paid already, so the price can’t change.'], 'once someone paid, the price stays');
const free = await postPlan(host, { title: 'Free walk', places: 4 });
await action('invite.joinOpenInvite', [free], ann.session);
r = await action('plan.editOpenInvite', [free, planInput({ title: 'Free walk', places: 4, ...paid(500) })], host.session);
eq([r.result.ok, r.result.error], [false, 'People are in for free already, so a cost can’t be added.'], 'no cost on a plan people joined for free');

// ---------------------------------------------------------------- leaving
mark = fakesMark();
let leave = await pay('leavePaidPlanAction', [planC, 'refund'], cal);
eq([leave.ok, leave.kind], [true, 'refunded'], 'more than 24 hours before: leave, refunded in full');
row = payment(planC, cal.id);
eq([row.status, row.refund_reason, Boolean(row.refund_id), row.refunded_pence], ['refunded', 'left-in-time', true, 1200], 'refunded at Stripe (left in time): the £12 place, the £1 fee kept');
eq(Object.values((await fakeState()).refunds).filter((x) => x.payment_intent === piOf(calC2.clientSecret)).map((x) => x.amount), [1200], 'Stripe refunded £12 of the £13');
eq(going(planC, cal.id), 'left', 'Cal is out');
eq(update(cal.id, 'refunded', planC)?.refund_pence, 1200, 'Cal’s Update: £12 refunded');
await new Promise((res) => setTimeout(res, 1000));
ok(emailsTo(mark, cal.email).some((e) => e.subject === 'Refunded: Spin, two spares'), 'and the refund email');

setPlanStart(planA, 20 * 60);
leave = await pay('leavePaidPlanAction', [planA, 'refund'], ann);
eq([leave.ok, leave.timing], [false, 'late'], 'inside 24 hours: no automatic refund (the sheet shows the late choices)');
mark = fakesMark();
leave = await pay('leavePaidPlanAction', [planA, 'ask'], ann);
eq([leave.ok, leave.kind], [true, 'asked'], 'ask the host');
eq([payment(planA, ann.id).status, going(planA, ann.id)], ['refund_asked', 'going'], 'asked: still held, still in');
eq(update(host.id, 'refund_asked', planA)?.actor_id, ann.id, 'the host’s Update: Ann asked for a refund');
p = await page(`/members/you/payments/${planA}`, host.session);
ok(p.status === 200 && p.text.includes('Keep it'), 'the host’s plan payments: Refund or Keep it');
ok(/NEXT_HTTP_ERROR_FALLBACK;404/.test((await page(`/members/you/payments/${planA}`, ann.session)).text), 'not for anyone else ("Not on the list.")');
let ans = await pay('answerRefundAction', [planA, payment(planA, ann.id).id, 'keep'], host);
eq([ans.ok, payment(planA, ann.id).status, going(planA, ann.id)], [true, 'held', 'going'], 'Keep it: held, Ann still in');
await new Promise((res) => setTimeout(res, 1000));
ok(emailsTo(mark, ann.email).some((e) => e.subject === 'Padel, then pizza: no refund'), 'Ann is told the host kept it');
ans = await pay('answerRefundAction', [planA, payment(planA, ann.id).id, 'keep'], host);
eq([ans.ok, ans.error], [false, 'That was answered already.'], 'an answer counts once');
await pay('leavePaidPlanAction', [planA, 'ask'], ann);
ans = await pay('answerRefundAction', [planA, payment(planA, ann.id).id, 'refund'], host);
row = payment(planA, ann.id);
eq([ans.ok, row.status, row.refund_reason, row.refunded_pence, going(planA, ann.id)], [true, 'refunded', 'host-agreed', 2200, 'left'], 'Refund: £22 back to Ann’s card (the fee kept), her place back to the plan');
leave = await pay('leavePaidPlanAction', [planA, 'no_refund'], ben);
eq([leave.ok, leave.kind, payment(planA, ben.id).status, going(planA, ben.id)], [true, 'left-no-refund', 'held', 'left'], 'leave without a refund: Ben is out, the host keeps it');

// ---------------------------------------------------------------- the host cancels: everyone refunded
const planD = await postPlan(host, { title: 'Supper for four', places: 4, ...paid(3000) });
for (const who of [ann, cal]) {
  const s = await pay('startPlanPaymentAction', [planD], who);
  await holdCard(piOf(s.clientSecret));
  await pay('confirmPlanPaymentAction', [piOf(s.clientSecret), planD], who);
}
mark = fakesMark();
r = await action('plan.cancelOpenInvite', [planD], host.session);
eq(r.result.ok, true, 'the host cancels');
eq(sql(`select status, refund_reason from plan_payments where plan_id = ${q(planD)}`), [{ status: 'refunded', refund_reason: 'host-cancelled' }, { status: 'refunded', refund_reason: 'host-cancelled' }], 'every payer refunded in full');
eq(update(ann.id, 'cancelled', planD)?.refund_pence, 3100, 'Ann’s Update: cancelled, £31 refunded (the booking fee too)');
eq(sql(`select refunded_pence from plan_payments where plan_id = ${q(planD)}`).map((x) => x.refunded_pence), [3100, 3100], 'the host cancelled: the place and the fee back to each');
await new Promise((res) => setTimeout(res, 1000));
const cancelMail = emailsTo(mark, cal.email).find((e) => e.subject === 'Cancelled: Supper for four');
ok(cancelMail, 'the cancel email (paid wording)');
eq(emailsTo(mark, cal.email).filter((e) => e.subject.startsWith('Refunded:')).length, 0, 'and no second refund email');

// ---------------------------------------------------------------- 24 hours after the plan: the money is the host's
setPlanStart(planC, -25 * 60); // Cal left planC; nothing held there
const planE = await postPlan(host, { title: 'Tennis doubles', places: 3, ...paid(2000) });
for (const who of [ann, ben]) {
  const s = await pay('startPlanPaymentAction', [planE], who);
  await holdCard(piOf(s.clientSecret));
  await pay('confirmPlanPaymentAction', [piOf(s.clientSecret), planE], who);
}
setPlanStart(planE, -23 * 60);
let job = await cronAt('plan-money', new Date());
eq(sql(`select status from plan_payments where plan_id = ${q(planE)}`).map((x) => x.status), ['held', 'held'], '23 hours after the start: still held');
setPlanStart(planE, -25 * 60);
mark = fakesMark();
job = await cronAt('plan-money', new Date());
ok(job.json.result?.madeReady >= 2, 'the sweep makes it the host’s', job.json);
const readyRows = sql(`select status, ready_at, transfer_id from plan_payments where plan_id = ${q(planE)}`);
ok(readyRows.every((o) => o.status === 'ready' && o.ready_at && !o.transfer_id), 'both payments ready: the host’s, nothing sent anywhere', readyRows);
eq(Object.values((await fakeState()).transfers).filter((t) => t.metadata?.plan_id === planE).length, 0, 'no transfer by itself');
eq(update(host.id, 'payout', planE)?.refund_pence, 4000, 'the host’s Update: £40 is yours');
await new Promise((res) => setTimeout(res, 1000));
ok(emailsTo(mark, host.email).some((e) => e.subject === '£40 is yours'), 'and the email: "£40 is yours"', emailsTo(mark, host.email).map((e) => e.subject));
await cronAt('plan-money', new Date());
eq(sql(`select status from plan_payments where plan_id = ${q(planE)}`).map((x) => x.status), ['ready', 'ready'], 'the sweep again changes nothing');
// Ben left planA without a refund: the host keeps it, and it is theirs once planA is over
setPlanStart(planA, -25 * 60);
await cronAt('plan-money', new Date());
eq(payment(planA, ben.id).status, 'ready', 'a place kept by the host is theirs too');
p = await page('/members/you/payments', host.session);
ok(p.status === 200 && p.text.includes('Your money') && p.text.includes('Add to my credit') && p.text.includes('Withdraw to my bank'), 'You > Payments: "Your money", Add to my credit, Withdraw to my bank', p.status);
ok(/£62(<!-- -->)? is yours/.test(p.text), 'with all of it: £62 (£40 and £22)');
p = await page('/members/you', host.session);
ok(p.text.includes('£62 ready for you'), 'You: the Payments row says £62 is ready');

// ---------------------------------------------------------------- withdraw: Get paid first (Stripe Connect)
r = await money('withdrawMoneyAction', host);
eq([r.ok, r.kind, r.status], [false, 'get-paid', 'not-set-up'], 'Withdraw without Get paid: set it up first');
eq(sql(`select status from plan_payments where plan_id = ${q(planE)}`).map((x) => x.status), ['ready', 'ready'], 'nothing moves');
p = await page('/members/you/payments/stripe', host.session);
eq(p.status, 303, 'Continue to Stripe: a redirect');
ok(p.location?.startsWith('https://connect.stripe.com/setup/'), 'to Stripe’s hosted onboarding', p.location);
const acct = sql1(`select * from host_accounts where member_id = ${q(host.id)}`);
ok(acct?.stripe_account_id?.startsWith('acct_'), 'the host’s connected account is made', acct);
eq(acct.status, 'not-set-up', 'not set up until Stripe has the details');
const made = (await fakeState()).accounts[acct.stripe_account_id];
eq([made.type, made.country, made.capabilities_requested?.transfers?.requested], ['express', 'GB', 'true'], 'Express, UK, transfers (the host only receives)');
eq(made.metadata?.member_id, host.id, 'with the member on it');
p = await page('/members/you/payments/stripe', host.session);
eq(sql1(`select count(*)::int n from host_accounts where member_id = ${q(host.id)}`).n, 1, 'a second visit reuses the account');

await fake(`account/${acct.stripe_account_id}`, { details_submitted: true, payouts_enabled: false, capabilities: { transfers: 'pending' }, requirements: { currently_due: [], past_due: [], pending_verification: ['individual.verification.document'] } });
exec(`update host_accounts set checked_at = now() - interval '5 minutes' where member_id = ${q(host.id)}`);
p = await page('/members/you/payments?getpaid=back', host.session);
eq(p.status, 200, 'back from Stripe: You > Payments opens (and asks Stripe at once)');
ok(p.text.includes('checking your details'), 'details in, Stripe checking: "We’re checking your details."');
eq(sql1(`select status from host_accounts where member_id = ${q(host.id)}`).status, 'in-review', 'in review');

await fake(`account/${acct.stripe_account_id}`, { payouts_enabled: true, capabilities: { transfers: 'active' }, requirements: { currently_due: [], past_due: [] }, bank_last4: '6789' });
exec(`update host_accounts set checked_at = now() - interval '5 minutes' where member_id = ${q(host.id)}`);
p = await page('/members/you/payments', host.session);
ok(p.text.includes('Get paid is ready'), 'ready: "Get paid is ready"');
eq(sql1(`select status, account_ending from host_accounts where member_id = ${q(host.id)}`), { status: 'ready', account_ending: '6789' }, 'ready, paid into the account ending 6789');
p = await page('/members/you/payments/stripe?manage=1', host.session);
ok(p.location?.startsWith('https://connect.stripe.com/express/'), 'Manage on Stripe: the host’s Stripe dashboard', p.location);
p = await page('/members/you', host.session);
ok(p.text.includes('Get paid: ready'), 'You: the Payments row says Get paid is ready');


mark = fakesMark();
r = await money('withdrawMoneyAction', host);
eq([r.ok, r.pence, r.failedPence], [true, 6200, 0], 'Withdraw: £62 to the host’s bank');
const outs = sql(`select status, transfer_id, payout_on from plan_payments where host_id = ${q(host.id)} and transfer_id is not null`);
ok(outs.length === 3 && outs.every((o) => o.status === 'paid_out' && o.transfer_id && o.payout_on), 'each payment sent to the host’s Stripe account', outs);
const transfers = Object.values((await fakeState()).transfers).filter((t) => t.metadata?.plan_id === planE);
eq(transfers.map((t) => [Number(t.amount), t.destination, Boolean(t.source_transaction)]), [[2000, acct.stripe_account_id, true], [2000, acct.stripe_account_id, true]], 'from each card payment (source_transaction), £20 each');
r = await money('withdrawMoneyAction', host);
eq([r.ok, r.kind], [false, 'nothing'], 'a second tap: nothing waiting');
eq(Object.values((await fakeState()).transfers).filter((t) => t.metadata?.plan_id === planE).length, 2, 'never sent twice');
p = await page('/members/you/payments', host.session);
ok(p.text.includes('Withdrawn') || p.text.includes('On its way'), 'Payments: the plans show as withdrawn');

// ---------------------------------------------------------------- or add it to Club Yuppie credit
const planF = await postPlan(host, { title: 'Jazz night', places: 3, ...paid(1800) });
const sF = await pay('startPlanPaymentAction', [planF], ann);
await holdCard(piOf(sF.clientSecret));
await pay('confirmPlanPaymentAction', [piOf(sF.clientSecret), planF], ann);
setPlanStart(planF, -25 * 60);
await cronAt('plan-money', new Date());
eq(payment(planF, ann.id).status, 'ready', 'Jazz night’s £18 is the host’s');
const before = credit(host.id);
r = await money('addMoneyToCreditAction', host);
eq([r.ok, r.pence, r.payments.creditBalancePence], [true, 1800, before + 1800], 'Add to my credit: £18 on the host’s credit at once');
const earned = sql1(`select amount_pence, kind, note from credit_ledger where dedupe_key = ${q(`earnings:${payment(planF, ann.id).id}`)}`);
eq(earned, { amount_pence: 1800, kind: 'earnings', note: 'Jazz night' }, 'one credit row, from Jazz night');
eq(payment(planF, ann.id).status, 'credited', 'the payment: credited');
r = await money('addMoneyToCreditAction', host);
eq([r.ok, r.kind], [false, 'nothing'], 'a second tap adds nothing');
r = await money('withdrawMoneyAction', host);
eq([r.ok, r.kind], [false, 'nothing'], 'credit can’t be withdrawn');
eq(credit(host.id), before + 1800, 'the credit stays');

// ---------------------------------------------------------------- credit pays for a place (all of it)
const bensPlan = await postPlan(ben, { title: 'Board games', places: 4, ...paid(1000) });
const hostBefore = credit(host.id);
start = await pay('startPlanPaymentAction', [bensPlan], host);
eq([start.ok, start.credit, start.creditPence, start.creditLeftPence], [true, true, 1100, hostBefore - 1100], 'the host’s credit covers Ben’s £11 place: no card');
confirm = await pay('payPlanWithCreditAction', [bensPlan], host);
eq([confirm.ok, confirm.kind], [true, 'paid'], 'Pay with credit: in');
row = payment(bensPlan, host.id);
eq([row.status, row.amount_pence, row.fee_pence, row.credit_pence, row.method, row.payment_intent_id.startsWith('credit:')], ['held', 1000, 100, 1100, 'Club Yuppie credit', true], 'the payment: £10 place, £1 fee, all credit, no card');
eq(credit(host.id), hostBefore - 1100, '£11 off the credit');
eq(sql1(`select kind, note from credit_ledger where member_id = ${q(host.id)} and amount_pence = -1100 order by created_at desc limit 1`), { kind: 'plan', note: 'Board games' }, 'its credit row: Board games');
eq(going(bensPlan, host.id), 'going', 'in the plan');
leave = await pay('leavePaidPlanAction', [bensPlan, 'refund'], host);
row = payment(bensPlan, host.id);
eq([leave.ok, row.status, row.refunded_pence], [true, 'refunded', 1000], 'leaving in time: £10 back (the fee kept)');
eq(credit(host.id), hostBefore - 100, 'back on the credit, not a card');
eq(sql1(`select note from credit_ledger where dedupe_key = ${q(`plan-refund:${row.id}`)}`)?.note, 'Board games, refunded', 'its credit row: Board games, refunded');

// ---------------------------------------------------------------- credit pays part, the card the rest
const calCredit = credit(cal.id);
giveCredit(cal.id, 500);
start = await pay('startPlanPaymentAction', [bensPlan], cal);
eq([start.ok, start.amountPence, start.creditPence], [true, calCredit + 500 >= 1100 ? 0 : 1100 - (calCredit + 500), calCredit + 500], 'Cal’s credit comes off first: the card pays the rest');
const piPart = piOf(start.clientSecret);
eq([Number((await fakeState()).payment_intents[piPart].amount), (await fakeState()).payment_intents[piPart].metadata.credit_pence], [1100 - (calCredit + 500), String(calCredit + 500)], 'the PaymentIntent is only the card’s part');
await holdCard(piPart);
confirm = await pay('confirmPlanPaymentAction', [piPart, bensPlan], cal);
eq([confirm.ok, confirm.kind], [true, 'paid'], 'in');
row = payment(bensPlan, cal.id);
eq([row.credit_pence, credit(cal.id)], [calCredit + 500, 0], 'the credit is spent');
leave = await pay('leavePaidPlanAction', [bensPlan, 'refund'], cal);
row = payment(bensPlan, cal.id);
const cardPart = 1100 - (calCredit + 500);
eq([leave.ok, row.refunded_pence], [true, 1000], 'leaving in time: £10 back');
eq(Object.values((await fakeState()).refunds).filter((x) => x.payment_intent === piPart).map((x) => Number(x.amount)), [Math.min(1000, cardPart)], 'the card gets back what it paid');
eq(credit(cal.id), 1000 - Math.min(1000, cardPart), 'and the rest goes back on the credit');

// credit spent elsewhere while paying: nothing taken
giveCredit(cal.id, 500);
start = await pay('startPlanPaymentAction', [bensPlan], cal);
const piGone = piOf(start.clientSecret);
giveCredit(cal.id, -credit(cal.id));
await holdCard(piGone);
confirm = await pay('confirmPlanPaymentAction', [piGone, bensPlan], cal);
eq([confirm.ok, confirm.kind], [false, 'credit-changed'], 'the credit went meanwhile: "Your credit changed"');
eq([(await fakeState()).payment_intents[piGone].status, going(bensPlan, cal.id)], ['canceled', 'left'], 'the card is let go, not in');

// ---------------------------------------------------------------- reminders and a withdrawal left half done
const planR = await postPlan(host, { title: 'Quiz night', places: 3, ...paid(1200) });
const sR = await pay('startPlanPaymentAction', [planR], ben);
await holdCard(piOf(sR.clientSecret));
await pay('confirmPlanPaymentAction', [piOf(sR.clientSecret), planR], ben);
setPlanStart(planR, -25 * 60);
await cronAt('plan-money', new Date());
exec(`update plan_payments set ready_at = now() - interval '8 days' where plan_id = ${q(planR)}`);
mark = fakesMark();
job = await cronAt('plan-money', new Date());
eq([job.json.result?.reminded, payment(planR, ben.id).ready_reminders], [1, 1], 'a week on: the host is reminded once');
await new Promise((res) => setTimeout(res, 1000));
ok(emailsTo(mark, host.email).some((e) => e.subject === '£12 is waiting for you'), 'the reminder email: "£12 is waiting for you"');
job = await cronAt('plan-money', new Date());
eq(job.json.result?.reminded, 0, 'not twice');
// (the updated_at trigger would stamp it now: off for this one statement)
exec(`set session_replication_role = replica; update plan_payments set status = 'withdrawing', updated_at = now() - interval '20 minutes' where plan_id = ${q(planR)}; set session_replication_role = origin;`);
job = await cronAt('plan-money', new Date());
eq([job.json.result?.withdrawalsFinished, payment(planR, ben.id).status], [1, 'paid_out'], 'a withdrawal the server left half done is finished');

// Get paid that stopped working: Withdraw says so
const planW = await postPlan(host, { title: 'Wild swim', places: 3, ...paid(900) });
const sW = await pay('startPlanPaymentAction', [planW], ann);
await holdCard(piOf(sW.clientSecret));
await pay('confirmPlanPaymentAction', [piOf(sW.clientSecret), planW], ann);
setPlanStart(planW, -25 * 60);
await cronAt('plan-money', new Date());
await fake(`account/${acct.stripe_account_id}`, { payouts_enabled: false, requirements: { currently_due: ['individual.id_number'], past_due: [] } });
exec(`update host_accounts set status = 'needs-info' where member_id = ${q(host.id)}`);
r = await money('withdrawMoneyAction', host);
eq([r.ok, r.kind, r.status, payment(planW, ann.id).status], [false, 'get-paid', 'needs-info', 'ready'], 'Get paid needs more info: Withdraw sends them to Stripe, the money stays theirs');
exec(`update host_accounts set checked_at = now() - interval '5 minutes' where member_id = ${q(host.id)}`);
p = await page('/members/you/payments', host.session);
ok(p.text.includes('One more thing') && p.text.includes('Your money'), 'Payments: "One more thing." beside the money', p.status);
await fake(`account/${acct.stripe_account_id}`, { payouts_enabled: true, requirements: { currently_due: [], past_due: [] } });

// ---------------------------------------------------------------- the sweep settles a held card nobody came back for
const planG = await postPlan(host, { title: 'Pilates and juice', places: 4, ...paid(900) });
const sG = await pay('startPlanPaymentAction', [planG], cal);
await holdCard(piOf(sG.clientSecret));
exec(`update plan_holds set created_at = now() - interval '10 minutes' where payment_intent_id = ${q(piOf(sG.clientSecret))}`);
await cronAt('plan-money', new Date());
eq([going(planG, cal.id), payment(planG, cal.id)?.status], ['going', 'held'], 'a card held but never confirmed: the sweep takes the place and the money');

// ---------------------------------------------------------------- Admin
p = await page('/admin/payments', admin);
ok(p.status === 200 && p.text.includes('Pilates and juice'), 'Admin > Payments lists them', p.status);
r = await action('admin.payments.adminRefundPlanPayment', [payment(planG, cal.id).id], admin);
eq(r.result.ok, true, 'Admin refunds one');
eq([payment(planG, cal.id).status, payment(planG, cal.id).refund_reason, payment(planG, cal.id).refunded_pence, going(planG, cal.id)], ['refunded', 'club', 1000, 'left'], 'refunded by the club, the fee too (£10), Cal off the plan');
r = await action('admin.payments.adminRefundPlanPayment', [payment(planE, ann.id).id], admin);
eq(r.result.ok, false, 'withdrawn by the host already: refunded in Stripe instead');
r = await action('admin.payments.adminRefundPlanPayment', [payment(planF, ann.id).id], admin);
eq(r.result.ok, false, 'added to the host’s credit: sorted out by hand');
r = await action('admin.payments.adminRefundPlanPayment', [payment(planW, ann.id).id], admin);
eq([r.result.ok, payment(planW, ann.id).status], [true, 'refunded'], 'the host’s but not yet chosen: Admin can still refund it');

// a refund made by hand in Stripe's dashboard is recorded
const planH = await postPlan(host, { title: 'Wine tasting', places: 4, ...paid(2500) });
const sH = await pay('startPlanPaymentAction', [planH], ben);
await holdCard(piOf(sH.clientSecret));
await pay('confirmPlanPaymentAction', [piOf(sH.clientSecret), planH], ben);
await emit('charge.refunded', { id: 'ch_hand', object: 'charge', payment_intent: piOf(sH.clientSecret), amount: 2600, amount_refunded: 2600 });
eq(payment(planH, ben.id).status, 'refunded', 'charge.refunded (by hand in Stripe): recorded as refunded');

// ---------------------------------------------------------------- switched off
eq((await page('/members/you/payments', host.session, { cookie: cookieFor(host.session) })).status, 200, 'You > Payments is on by default');
done();
