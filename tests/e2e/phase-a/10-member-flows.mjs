// Member flows (r2a): the real event page, booking (included and paid), the booking card and Add to calendar,
// cancelling (outside 48 hours with a refund, inside 48 hours without one, an included event, a moved event),
// Your plans and the Events list, the paused and ended gates, and every login state against the local Auth
// server. Drives the real pages in Playwright on this branch's server (PHASE_A_BASE, default
// http://localhost:3143) against the local stack.
//
//   tests/e2e/phase-a/server.sh start dev 3143        # or prod, after a build
//   node /home/claude/stack/tools/seed.mjs --prefix m.  # the seeded m. members and events (idempotent)
//   PHASE_A_BASE=http://localhost:3143 node tests/e2e/phase-a/10-member-flows.mjs   (run-all.mjs passes PHASE_A_BASE on)
//
// Test people are m.t-<name>-<random>@example.com. Stripe.js cannot reach the local fake, so a paid booking
// is made the way Stripe would leave it: the PaymentIntent through the real action, paid at the fake, then the
// page's own return from the bank (?payment_intent=…&redirect_status=…), which asks the server.
// "Too many tries" needs Auth's real rate limit, so a second Auth server with a strict verify limit is started
// for that one check (auth-strict.sh) and the browser's verify call is sent there.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { waitForCode } from '/home/claude/stack/tools/login.mjs';
import {
  ANON,
  SUPA,
  action,
  cookieFor,
  done,
  eq,
  exec,
  fakePay,
  fakesMark,
  fakesSince,
  fd,
  memberSession,
  messages,
  ok,
  page as getPage,
  q,
  rand,
  redirectedTo,
  rest,
  sleep,
  sql1,
  stripe,
  svc,
  waitFor,
} from './lib.mjs';

const BASE = process.env.PHASE_A_BASE || 'http://localhost:3141'; // lib.mjs's own default; run with PHASE_A_BASE=http://localhost:3143 here
const DIR = new URL('.', import.meta.url).pathname;
const SEED = JSON.parse(fs.readFileSync('/home/claude/stack/tools/seed-m.json', 'utf8'));
const NATIVE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';

// ---------------------------------------------------------------- m. people and events
const mTag = (name) => `m.t-${name}-${rand()}`;

async function mMember(name, state = 'active') {
  const email = `${mTag(name)}@example.com`;
  const { data, error } = await svc.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  const c = await stripe('POST', 'customers', { email, name });
  const s = await stripe('POST', 'subscriptions', { customer: c.json.id, items: { 0: { price: 'price_membership' } } });
  const row = { id: data.user.id, email, full_name: `${name[0].toUpperCase()}${name.slice(1)} Flows`, membership_status: 'active', stripe_customer_id: c.json.id, stripe_subscription_id: s.json.id };
  if (state === 'paused') Object.assign(row, { membership_status: 'paused', paused_at: new Date().toISOString() });
  const { error: e2 } = await svc.from('members').upsert(row);
  if (e2) throw e2;
  return { id: data.user.id, email, customer: c.json.id };
}

async function mEvent(name, { price = 0, capacity = 20, startInHours = 24 * 10, address = `1 Flow Road, Anytown AB1 2CD`, location = `${name} Rooms`, category = 'entertainment' } = {}) {
  const slug = mTag(name).replace(/\./g, '-');
  const { data, error } = await svc
    .from('events')
    .insert({
      slug, title: `${name[0].toUpperCase()}${name.slice(1)}: Flow Night ${rand()}`, description: 'A member flows test event.', category, location,
      start_time: new Date(Date.now() + startInHours * 3600000).toISOString(), end_time: null, price_pence: price, capacity,
    })
    .select('id, slug, title, start_time, location')
    .single();
  if (error) throw error;
  if (address) await svc.from('event_addresses').upsert({ event_id: data.id, address });
  return { ...data, price, address };
}

/** A confirmed paid booking made as the app makes one: a PaymentIntent through the action, paid at the fake, booked by book_event. */
async function paidBooking(member, event, { bookedAgoHours = 0 } = {}) {
  const pi = await stripe('POST', 'payment_intents', { amount: event.price, currency: 'gbp', customer: member.customer, metadata: { member_id: member.id, event_id: event.id } });
  await fakePay(pi.json.id, 'http://127.0.0.1:9/none');
  const { data, error } = await svc.rpc('book_event', { p_member: member.id, p_event: event.id, p_amount: event.price, p_payment_intent: pi.json.id, p_allow_over_capacity: true });
  if (error || !data.booking_id) throw error ?? new Error(`book_event: ${data?.status}`);
  if (bookedAgoHours) exec(`update bookings set booked_at = now() - interval '${bookedAgoHours} hours' where id = ${q(data.booking_id)}`);
  return { id: data.booking_id, pi: pi.json.id };
}

const booking = (id) => sql1(`select status, cancel_reason, refund_status, refund_pence, amount_pence, stripe_payment_intent_id from bookings where id = ${q(id)}`);
const bookingFor = (memberId, eventId) => sql1(`select id, status, amount_pence, stripe_payment_intent_id from bookings where member_id = ${q(memberId)} and event_id = ${q(eventId)} order by booked_at desc limit 1`);
const refundsFor = (mark, pi) => fakesSince(mark, 'stripe').filter((l) => l.path === '/v1/refunds' && l.method === 'POST' && l.body.payment_intent === pi);

// ---------------------------------------------------------------- browser
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const host = new URL(BASE).hostname;

async function open({ email = null, app = false, width = 390, stripeJs = 'hang' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, ...(app ? { userAgent: NATIVE_UA } : {}), acceptDownloads: true });
  if (email) {
    const session = await memberSession(email);
    await ctx.addCookies(
      cookieFor(session)
        .split('; ')
        .map((part) => ({ name: part.slice(0, part.indexOf('=')), value: part.slice(part.indexOf('=') + 1), domain: host, path: '/' })),
    );
  }
  // Stripe.js cannot load here (no network): left hanging by default, so a sheet that needs Stripe's fields
  // stays in its state; a test that wants "We couldn't open payment" aborts it instead.
  await ctx.route('https://js.stripe.com/**', (route) => (stripeJs === 'abort' ? route.abort() : undefined));
  const page = await ctx.newPage();
  return { ctx, page };
}
const visible = (page, role, name) => page.getByRole(role, { name }).filter({ visible: true }).first();
// A message the forms render twice (a live region and the visible copy): the first one on screen.
const seen = (page, words) => page.getByText(words).filter({ visible: true }).first();
const dialog = (page) => page.getByRole('dialog');
async function text(page) {
  return page.evaluate(() => document.body.innerText);
}

// ================================================================= 1. an included event: book, see the address, calendar, cancel
{
  const m = await mMember('inc');
  const ev = await mEvent('included', { price: 0, address: '7 Included Mews, Anytown AB1 2CD' });
  const s = await memberSession(m.email);

  // No address for a member without a booking (A-D3): not in the page, not in the calendar file, not from the action.
  const before = await getPage(`/members/events/${ev.slug}`, s);
  eq(before.status, 200, 'the event page opens');
  ok(!before.text.includes('7 Included Mews'), 'no booking: the exact address is nowhere in the page');
  ok(before.text.includes('Exact address sent after booking'), 'no booking: "Exact address sent after booking"');
  eq((await getPage(`/members/events/${ev.slug}/calendar.ics`, s)).status, 404, 'no booking: the calendar file is a 404');
  eq((await action('events.getMyEventAddress', [ev.id], s)).result, null, 'no booking: getMyEventAddress gives nothing');

  const { ctx, page } = await open({ email: m.email });
  await page.goto(`${BASE}/members/events/${ev.slug}`, { waitUntil: 'networkidle' });
  ok((await text(page)).includes('Change of plan? Cancel any time until'), 'bookable, included: the money line says when it can be cancelled');
  await visible(page, 'button', 'Book my spot').click();
  await dialog(page).getByRole('heading', { name: 'You’re booked.' }).waitFor({ timeout: 20000 });
  const sheet = await dialog(page).innerText();
  ok(sheet.includes('7 Included Mews, Anytown AB1 2CD'), 'the free path goes straight to the confirmed sheet, with the exact address');
  ok(sheet.includes(`We’ve emailed your booking and this address to ${m.email}.`), 'it says where the booking was emailed');
  ok(sheet.includes('Included in your membership'), 'included: "Included in your membership £0"');
  const row = bookingFor(m.id, ev.id);
  eq([row?.status, row?.amount_pence], ['confirmed', 0], 'a confirmed booking row, nothing paid');
  await waitFor(() => messages(`booking_id = ${q(row.id)} and template = 'booking-confirmed-included' and status = 'sent'`).length === 1, 'the included booking email is sent');

  // Add to calendar: the .ics download and the Google link.
  const gcal = await dialog(page).getByRole('link', { name: 'Or add it to Google Calendar' }).getAttribute('href');
  ok(gcal?.startsWith('https://calendar.google.com/calendar/render?') && gcal.includes(encodeURIComponent(ev.title).replace(/%20/g, '+')), 'web: a Google Calendar link with the title');
  const [download] = await Promise.all([page.waitForEvent('download'), dialog(page).getByRole('link', { name: 'Add to calendar' }).click()]);
  const ics = fs.readFileSync(await download.path(), 'utf8');
  ok(download.suggestedFilename().endsWith('.ics'), `Add to calendar downloads ${download.suggestedFilename()}`);
  ok(ics.startsWith('BEGIN:VCALENDAR') && ics.includes('SUMMARY:') && ics.includes('7 Included Mews') && !ics.includes('VALARM'), 'the .ics holds the event and the exact address, and no alarm');
  const icsHttp = await getPage(`/members/events/${ev.slug}/calendar.ics`, s);
  ok(icsHttp.status === 200 && icsHttp.headers.get('content-type')?.startsWith('text/calendar') && /attachment; filename=".+\.ics"/.test(icsHttp.headers.get('content-disposition') ?? ''), 'the calendar route: text/calendar, as an attachment');

  // After Done: the booking card with the address, and the bar says booked.
  await dialog(page).getByRole('button', { name: 'Done' }).click();
  await page.getByRole('heading', { name: 'You’re booked.' }).waitFor();
  const card = await page.locator('#your-booking').innerText();
  ok(card.includes('7 Included Mews') && card.includes('Add to calendar') && card.includes('Cancel booking'), 'the booking card: address, Add to calendar, Cancel booking');
  ok((await page.locator('.ea-bar').innerText()).includes('You’re booked'), 'the bar says "You’re booked" with "See booking"');

  // Your plans and the Events list read the real booking.
  const plans = await getPage('/members/plans', s);
  ok(plans.text.includes(`/members/events/${ev.slug}`), 'Your plans lists the booking');

  // Cancel an included booking (more than 48 hours before).
  await page.locator('#your-booking').getByRole('button', { name: 'Cancel booking' }).click();
  await dialog(page).getByRole('heading', { name: 'Cancel your booking?' }).waitFor();
  ok((await dialog(page).innerText()).includes('Your spot goes back to the club, so someone else can take it.'), 'included: no money line, the spot goes back');
  await dialog(page).getByRole('button', { name: 'Cancel my booking' }).click();
  await dialog(page).getByRole('heading', { name: 'Booking cancelled.' }).waitFor({ timeout: 20000 });
  const cancelled = booking(row.id);
  eq([cancelled.status, cancelled.cancel_reason, cancelled.refund_status], ['cancelled', 'member', 'none'], 'cancelled by the member, nothing to refund');
  await waitFor(() => messages(`booking_id = ${q(row.id)} and template = 'booking-cancelled' and status = 'sent'`).length === 1, 'the cancel email is sent');
  await dialog(page).getByRole('button', { name: 'Done' }).click();
  await visible(page, 'button', 'Book my spot').waitFor();
  ok(true, 'after Done the page is bookable again (a member can book again after cancelling)');
  await ctx.close();
}

// ================================================================= 2. a paid event: PaymentIntent through the action, the fake pays, the page books on the way back
{
  const m = await mMember('paid');
  const ev = await mEvent('paid', { price: 2500, address: '9 Paid Street, Anytown AB1 2CD', category: 'sport' });
  const s = await memberSession(m.email);
  const r = await action('events.createEventPaymentIntent', [fd({ event_id: ev.id })], s);
  ok(r.result.success && r.result.clientSecret, 'createEventPaymentIntent gives a client secret');
  const secret = r.result.clientSecret;
  const pi = secret.split('_secret')[0];
  const markPay = fakesMark();
  await fakePay(pi, 'http://127.0.0.1:9/none'); // paid at Stripe; the webhook is lost, so only the page can book it

  const { ctx, page } = await open({ email: m.email });
  await page.goto(`${BASE}/members/events/${ev.slug}?payment_intent=${pi}&payment_intent_client_secret=${secret}&redirect_status=succeeded`, { waitUntil: 'commit' });
  await dialog(page).getByRole('heading', { name: 'You’re booked.' }).waitFor({ timeout: 30000 });
  ok(!page.url().includes('payment_intent'), 'back from the bank: the address bar loses Stripe’s parameters');
  const sheet = await dialog(page).innerText();
  ok(sheet.includes('Paid') && sheet.includes('£25') && sheet.includes('9 Paid Street'), 'the confirmed sheet: "Paid £25" and the exact address');
  const row = bookingFor(m.id, ev.id);
  eq([row?.status, row?.amount_pence, row?.stripe_payment_intent_id], ['confirmed', 2500, pi], 'booked for the PaymentIntent, £25');
  ok(fakesSince(markPay, 'stripe').some((l) => l.method === 'GET' && l.path === `/v1/payment_intents/${pi}`), 'the server asked Stripe for the payment itself');
  await waitFor(() => messages(`booking_id = ${q(row.id)} and template = 'booking-confirmed' and status = 'sent'`).length === 1, 'the paid booking email is sent');
  await dialog(page).getByRole('button', { name: 'Done' }).click();
  ok((await page.locator('#your-booking').innerText()).includes(`£25 paid. Sent to ${m.email}`), 'the booking card has the receipt line');
  ok((await page.locator('.ea-bar').innerText()).includes('£25 paid'), 'the bar: "You’re booked, £25 paid"');

  // Cancel outside 48 hours: refunded in full.
  const mark = fakesMark();
  await page.locator('#your-booking').getByRole('button', { name: 'Cancel booking' }).click();
  await dialog(page).getByRole('heading', { name: 'Cancel your booking?' }).waitFor();
  ok((await dialog(page).innerText()).includes('It’s more than 48 hours until the event, so this is automatic.'), 'in time: the automatic-refund line');
  await dialog(page).getByRole('button', { name: 'Cancel and get £25 back' }).click();
  await dialog(page).getByRole('heading', { name: 'Booking cancelled.' }).waitFor({ timeout: 20000 });
  ok((await dialog(page).innerText()).includes('Your £25 is refunded in full.'), 'done: "Your £25 is refunded in full."');
  const after = booking(row.id);
  eq([after.status, after.cancel_reason, after.refund_status, after.refund_pence], ['cancelled', 'member', 'succeeded', 2500], 'cancelled and refunded £25');
  const refunds = refundsFor(mark, pi);
  eq(refunds.map((l) => [l.idem, l.body.amount]), [[`refund-booking-${row.id}`, '2500']], 'one Stripe refund, idempotency key refund-booking-<id>, in fakes.jsonl');
  await waitFor(() => messages(`booking_id = ${q(row.id)} and template = 'booking-cancelled' and status = 'sent' and to_address = ${q(m.email)}`).length === 1, 'the cancel email is in message_log');
  await ctx.close();
}

// ================================================================= 3. the pay sheet's server states on the real page
{
  const m = await mMember('paystates');
  const s = await memberSession(m.email);

  // Still processing: the payment has not cleared, nothing is booked, the bar says Processing.
  const ev1 = await mEvent('processing', { price: 1500 });
  const r1 = await action('events.createEventPaymentIntent', [fd({ event_id: ev1.id })], s);
  const pi1 = r1.result.clientSecret.split('_secret')[0];
  await stripe('POST', `payment_intents/${pi1}`, { status: 'processing' });
  let { ctx, page } = await open({ email: m.email });
  await page.goto(`${BASE}/members/events/${ev1.slug}?payment_intent=${pi1}&payment_intent_client_secret=${r1.result.clientSecret}&redirect_status=processing`, { waitUntil: 'commit' });
  await dialog(page).getByRole('heading', { name: 'Your payment is processing.' }).waitFor({ timeout: 30000 });
  ok((await dialog(page).innerText()).includes('Please don’t pay again.'), 'still processing: "Please don’t pay again."');
  eq(bookingFor(m.id, ev1.id), null, 'still processing: no booking yet');
  await dialog(page).getByRole('button', { name: 'Done' }).click();
  ok((await page.locator('.ea-bar').innerText()).includes('Processing'), 'the bar says Processing, with no Book button');
  ok(await seen(page, 'Payment processing.').isVisible(), 'the hero note says payment processing');
  await ctx.close();

  // Card declined on the way back: the card box again, nothing taken.
  const ev2 = await mEvent('declined', { price: 1500 });
  const r2 = await action('events.createEventPaymentIntent', [fd({ event_id: ev2.id })], s);
  const pi2 = r2.result.clientSecret.split('_secret')[0];
  await fetch(`https://api.stripe.com/__fake/stripe/fail/${pi2}?webhook=${encodeURIComponent('http://127.0.0.1:9/none')}`, { method: 'POST' });
  ({ ctx, page } = await open({ email: m.email }));
  await page.goto(`${BASE}/members/events/${ev2.slug}?payment_intent=${pi2}&payment_intent_client_secret=${r2.result.clientSecret}&redirect_status=failed`, { waitUntil: 'commit' });
  await dialog(page).getByText('Your card was declined.', { exact: true }).waitFor({ timeout: 30000 });
  ok((await dialog(page).innerText()).includes('Nothing was taken.'), 'declined: "Nothing was taken."');
  eq(bookingFor(m.id, ev2.id), null, 'declined: no booking');
  await ctx.close();

  // Paid, but not booked: the price changed after the payment started (the server's amount check refuses it).
  const ev3 = await mEvent('notbooked', { price: 1500 });
  const r3 = await action('events.createEventPaymentIntent', [fd({ event_id: ev3.id })], s);
  const pi3 = r3.result.clientSecret.split('_secret')[0];
  await fakePay(pi3, 'http://127.0.0.1:9/none');
  exec(`update events set price_pence = 2000 where id = ${q(ev3.id)}`);
  ({ ctx, page } = await open({ email: m.email }));
  await page.goto(`${BASE}/members/events/${ev3.slug}?payment_intent=${pi3}&payment_intent_client_secret=${r3.result.clientSecret}&redirect_status=succeeded`, { waitUntil: 'commit' });
  await dialog(page).getByRole('heading', { name: 'Paid, but not booked yet.' }).waitFor({ timeout: 30000 });
  const nb = await dialog(page).innerText();
  ok(nb.includes('Please don’t pay again.') && !/Pay £/.test(nb), 'paid but not booked: no pay button, "Please don’t pay again."');
  ok((await dialog(page).getByRole('link', { name: 'Email us' }).getAttribute('href'))?.startsWith('mailto:hello@clubyuppie.com'), 'and Email us');
  await waitFor(() => messages(`template like 'admin-%' and dedupe_key like ${q(`%${pi3}%`)}`).length >= 1, 'the club is alerted (message_log)');
  await dialog(page).getByRole('button', { name: 'Close' }).click();
  ok((await page.locator('.ea-bar').innerText()).includes('Processing'), 'after Close the bar offers no second payment');
  await ctx.close();

  // Payment didn't open: Stripe.js does not load.
  const ev4 = await mEvent('noopen', { price: 1500 });
  ({ ctx, page } = await open({ email: m.email, stripeJs: 'abort' }));
  await page.goto(`${BASE}/members/events/${ev4.slug}`, { waitUntil: 'networkidle' });
  await visible(page, 'button', 'Book my spot').click();
  await dialog(page).getByRole('heading', { name: 'We couldn’t open payment.' }).waitFor({ timeout: 30000 });
  ok((await dialog(page).innerText()).includes('Nothing was taken.'), 'payment didn’t open: "Nothing was taken." with Try again');
  await ctx.close();
}

// ================================================================= 4. inside 48 hours: the late sheet and "Cancel without a refund"; a moved event
{
  const m = await mMember('late');
  const ev = await mEvent('late', { price: 2000, startInHours: 30 });
  const b = await paidBooking(m, ev, { bookedAgoHours: 24 });
  const { ctx, page } = await open({ email: m.email });
  await page.goto(`${BASE}/members/events/${ev.slug}`, { waitUntil: 'networkidle' });
  ok((await page.locator('#your-booking').innerText()).includes('It’s less than 48 hours to go'), 'the booking card says it is inside 48 hours');
  const mark = fakesMark();
  await page.locator('#your-booking').getByRole('button', { name: 'Cancel booking' }).click();
  await dialog(page).getByRole('heading', { name: 'Too late to cancel here.' }).waitFor();
  const late = await dialog(page).innerText();
  ok(late.includes('so we can’t refund you automatically') && late.includes('If you cancel without asking, your £20 isn’t refunded.'), 'the late sheet says so plainly');
  ok((await dialog(page).getByRole('link', { name: 'Email us' }).getAttribute('href'))?.startsWith('mailto:hello@clubyuppie.com'), 'late: Email us');
  ok(await dialog(page).getByRole('button', { name: 'Keep my booking' }).isVisible(), 'late: Keep my booking');
  await dialog(page).getByRole('button', { name: 'Cancel without a refund' }).click();
  await dialog(page).getByRole('heading', { name: 'Booking cancelled.' }).waitFor({ timeout: 20000 });
  eq([booking(b.id).status, booking(b.id).cancel_reason, booking(b.id).refund_status], ['cancelled', 'member_late', 'none'], 'cancelled late, no refund');
  eq(refundsFor(mark, b.pi).length, 0, 'no refund call to Stripe');
  await waitFor(() => messages(`booking_id = ${q(b.id)} and template = 'booking-cancelled' and status = 'sent'`).length === 1, 'the member is emailed');
  await ctx.close();

  // C-D11: the club moved it after the booking: a full refund whatever the date.
  const m2 = await mMember('moved');
  const ev2 = await mEvent('moved', { price: 2000, startInHours: 30 });
  const b2 = await paidBooking(m2, ev2, { bookedAgoHours: 24 });
  exec(`update events set changed_at = now() where id = ${q(ev2.id)}`);
  const o2 = await open({ email: m2.email });
  await o2.page.goto(`${BASE}/members/events/${ev2.slug}`, { waitUntil: 'networkidle' });
  ok(await seen(o2.page, 'We’ve changed this event.').isVisible(), 'moved: the hero says the club changed it');
  const mark2 = fakesMark();
  await o2.page.locator('#your-booking').getByRole('button', { name: 'Cancel booking' }).click();
  await dialog(o2.page).getByRole('heading', { name: 'Cancel your booking?' }).waitFor();
  ok((await dialog(o2.page).innerText()).includes('We moved this event, so this is automatic, whatever the date.'), 'moved: the in-time sheet, inside 48 hours');
  await dialog(o2.page).getByRole('button', { name: 'Cancel and get £20 back' }).click();
  await dialog(o2.page).getByRole('heading', { name: 'Booking cancelled.' }).waitFor({ timeout: 20000 });
  eq([booking(b2.id).cancel_reason, booking(b2.id).refund_status, booking(b2.id).refund_pence], ['event_changed', 'succeeded', 2000], 'moved: refunded in full');
  eq(refundsFor(mark2, b2.pi).length, 1, 'one refund call');
  await o2.ctx.close();
}

// ================================================================= 5. the seeded events: full, past, cancelled; the list and Your plans
{
  const s = await memberSession(SEED.members.active.email);
  const full = await getPage(`/members/events/${SEED.events.full.slug}`, await memberSession(SEED.members.problem.email));
  ok(full.text.includes('Fully booked') && full.text.includes('See other events'), 'full: "Fully booked" and "See other events"');
  const past = await getPage(`/members/events/${SEED.events.past.slug}`, await memberSession(SEED.members.problem.email));
  ok(past.text.includes('This event has already started,') && past.text.includes('Past event'), 'past: "This event has already started" and "Past event"');
  const cancelled = await getPage(`/members/events/${SEED.events.cancelled.slug}`, s);
  ok(cancelled.text.includes('This event is cancelled') && cancelled.text.includes('the venue is closed that evening') && !cancelled.text.includes('Book my spot'), 'cancelled by the club: said plainly, with the reason, and no booking');
  const titleOk = (html, slug) => html.includes(`/members/events/${slug}"`);
  const list = await getPage('/members/events', s);
  ok(!titleOk(list.text, SEED.events.cancelled.slug), 'the Events list hides the cancelled event');
  ok(titleOk(list.text, SEED.events.included.slug), 'and lists the others');
  const rowHtml = list.text.slice(list.text.indexOf(`/members/events/${SEED.events.paid.slug}"`)).split('</a>')[0];
  ok(rowHtml.includes('Booked'), 'a booked event shows as Booked in the list');
  const plans = await getPage('/members/plans', s);
  ok(titleOk(plans.text, SEED.events.paid.slug) && titleOk(plans.text, SEED.events.included.slug) && !titleOk(plans.text, SEED.events.cancelled.slug), 'Your plans: the real bookings, not the cancelled one');
  // Security: a member's REST token cannot read any event address.
  const addr = await rest('GET', `event_addresses?event_id=eq.${SEED.events.paid.id}`, s);
  ok(addr.status === 200 ? Array.isArray(addr.json) && addr.json.length === 0 : addr.status >= 400, 'a member cannot read event_addresses through the REST API');
}

// ================================================================= 6. gates: paused and ended members see one gate and nothing else
{
  for (const [key, words] of [['paused', 'Your membership is paused.'], ['ended', 'Your membership has ended.'], ['lapsed', 'Your membership has ended.']]) {
    const email = SEED.members[key].email;
    eq(await redirectedTo('/members/events', await memberSession(email)), '/members/membership', `${key}: /members/events sends them to the gate`);
    eq(await redirectedTo(`/members/events/${SEED.events.included.slug}`, await memberSession(email)), '/members/membership', `${key}: so does an event page`);
    const { ctx, page } = await open({ email });
    await page.goto(`${BASE}/members/events`, { waitUntil: 'networkidle' });
    await page.waitForURL((u) => u.pathname === '/members/membership', { timeout: 20000 });
    const body = (await text(page)).replace(/\s+/g, ' ');
    ok(body.includes('Your membership') && body.includes(words.replace('Your membership ', '')), `${key}: the gate says "${words}"`);
    if (key === 'paused') {
      ok(body.includes('To get going again') && body.includes('Your details, photo and bookings are kept while it’s paused.'), 'paused: the three steps and the reassurance');
      ok((await visible(page, 'link', 'Get in touch').getAttribute('href'))?.startsWith('mailto:hello@clubyuppie.com'), 'paused: Get in touch');
      ok(await visible(page, 'button', 'Log out').isVisible(), 'paused: Log out still works from the gate');
    }
    await ctx.close();
  }
  eq(await redirectedTo('/members/membership', await memberSession(SEED.members.active.email)), '/members/events', 'an active member who opens the gate goes to Events');
}

// ================================================================= 7. log in: every state, against the local Auth server
{
  // Not recognised (with the A-D5 line), and an address that is not an email.
  let { ctx, page } = await open();
  await page.goto(`${BASE}/member-login`, { waitUntil: 'networkidle' });
  ok((await text(page)).includes('Let’s see what’s on.'), 'the headline: "Welcome back. Let’s see what’s on."');
  await page.getByLabel('Email address').fill(`${mTag('nobody')}@example.com`);
  await page.getByRole('button', { name: 'Send login code' }).click();
  await seen(page, 'We don’t recognise that email as a Club Yuppie member. Check for typos, or apply to join below.').waitFor();
  ok(await seen(page, 'Applied already? We’ll email you when you’re approved.').isVisible(), 'not recognised (Auth: otp_disabled), with "Applied already?" (A-D5)');
  let otpCalls = 0;
  page.on('request', (r) => { if (r.url().includes('/auth/v1/otp')) otpCalls += 1; });
  await page.getByLabel('Email address').fill('sam@example');
  await page.getByRole('button', { name: 'Send login code' }).click();
  await seen(page, 'That doesn’t look like a valid email address.').waitFor();
  eq(otpCalls, 0, 'not an email: told so, without asking Auth');

  // Too many attempts on the email step: a second code within Auth's minimum interval (over_email_send_rate_limit).
  const member = await mMember('login');
  await fetch(`${SUPA}/auth/v1/otp`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: member.email, create_user: false }) });
  await page.getByLabel('Email address').fill(member.email);
  await page.getByRole('button', { name: 'Send login code' }).click();
  await seen(page, 'Too many attempts. Please wait a few minutes and try again.').waitFor();
  ok(true, 'too many attempts (Auth: 429 over_email_send_rate_limit)');

  // No connection.
  await sleep(1200);
  await page.route('**/auth/v1/otp**', (route) => route.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Send login code' }).click();
  await seen(page, 'We couldn’t reach Club Yuppie. Check your connection and try again.').waitFor();
  ok(true, 'no connection: the network message');
  await page.unroute('**/auth/v1/otp**');

  // The code step: wrong code, then a new code, then logged in.
  await sleep(1200);
  let since = Date.now() - 500;
  await page.getByRole('button', { name: 'Send login code' }).click();
  await page.getByLabel('6-digit code').waitFor();
  const first = await waitForCode(member.email, since);
  await page.getByLabel('6-digit code').fill(first === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: 'Verify code' }).click();
  await seen(page, 'That code isn’t right. Check the email and try again.').waitFor();
  ok(true, 'wrong code (Auth: 403 otp_expired, inside 10 minutes): "That code isn’t right."');
  await sleep(1200);
  since = Date.now() - 200;
  await page.getByRole('button', { name: 'Send a new code' }).click();
  await seen(page, 'New code sent.').waitFor();
  ok(true, 'Send a new code: "New code sent."');
  const second = await waitForCode(member.email, since);
  await page.getByLabel('6-digit code').fill(second);
  await page.getByRole('button', { name: 'Verify code' }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/members/'), { timeout: 30000 });
  ok(true, 'the new code logs in');
  await ctx.close();

  // Expired: the code is older than 10 minutes, in Auth and on the page's clock.
  ({ ctx, page } = await open());
  await page.clock.install();
  await page.goto(`${BASE}/member-login`, { waitUntil: 'networkidle' });
  const expiring = await mMember('expired');
  since = Date.now() - 500;
  await page.getByLabel('Email address').fill(expiring.email);
  await page.getByRole('button', { name: 'Send login code' }).click();
  await page.getByLabel('6-digit code').waitFor();
  const oldCode = await waitForCode(expiring.email, since);
  exec(`update auth.users set recovery_sent_at = now() - interval '11 minutes', confirmation_sent_at = now() - interval '11 minutes' where email = ${q(expiring.email)}`);
  await page.clock.fastForward('11:00');
  await page.getByLabel('6-digit code').fill(oldCode);
  await page.getByRole('button', { name: 'Verify code' }).click();
  await seen(page, 'That code has expired. Send a new code and try again.').waitFor();
  const resendColour = await page.getByRole('button', { name: 'Send a new code' }).evaluate((el) => getComputedStyle(el).color);
  eq(resendColour, 'rgb(27, 21, 18)', 'expired (Auth: otp_expired after 10 minutes): "That code has expired.", Send a new code in ink');
  await ctx.close();

  // Too many tries: Auth's real verify rate limit (a second Auth server with a strict limit, keyed by a header).
  execFileSync(`${DIR}auth-strict.sh`, ['start'], { stdio: 'ignore' });
  try {
    const client = `m-test-${rand()}`;
    for (let i = 0; i < 31; i += 1) {
      await fetch('http://127.0.0.1:9998/verify', { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01', 'X-Test-Client': client }, body: JSON.stringify({ email: 'm.nobody@example.com', token: '000000', type: 'email' }) });
    }
    ({ ctx, page } = await open());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-expose-headers': 'x-supabase-api-version' };
    await page.route('**/auth/v1/verify**', async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const r = await fetch('http://127.0.0.1:9998/verify', { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01', 'X-Test-Client': client }, body: req.postData() });
      await route.fulfill({ status: r.status, body: await r.text(), headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01', ...cors } });
    });
    await page.goto(`${BASE}/member-login`, { waitUntil: 'networkidle' });
    const tries = await mMember('tries');
    since = Date.now() - 500;
    await page.getByLabel('Email address').fill(tries.email);
    await page.getByRole('button', { name: 'Send login code' }).click();
    await page.getByLabel('6-digit code').waitFor();
    await page.getByLabel('6-digit code').fill(await waitForCode(tries.email, since));
    await page.getByRole('button', { name: 'Verify code' }).click();
    await seen(page, 'Too many tries. Wait a few minutes, then send a new code.').waitFor();
    ok(true, 'too many tries (Auth: 429 over_request_rate_limit): "Too many tries."');
    await ctx.close();
  } finally {
    execFileSync(`${DIR}auth-strict.sh`, ['stop'], { stdio: 'ignore' });
  }

  // B-D1: the two notices.
  ({ ctx, page } = await open());
  await page.goto(`${BASE}/member-login?state=logged-out`, { waitUntil: 'networkidle' });
  ok(await seen(page, 'You’re logged out.').isVisible(), '?state=logged-out: "You’re logged out."');
  await page.goto(`${BASE}/member-login?state=session-ended`, { waitUntil: 'networkidle' });
  ok(await seen(page, 'Your session ended.').isVisible(), '?state=session-ended: "Your session ended."');
  await page.goto(`${BASE}/member-login?state=anything-else`, { waitUntil: 'networkidle' });
  ok(!(await text(page)).includes('Your session ended.') && !(await text(page)).includes('You’re logged out.'), 'any other value shows no notice');
  await ctx.close();

  // The app: its own headline and "not recognised" line, no Apply link, the A-D5 line too.
  ({ ctx, page } = await open({ app: true }));
  await page.goto(`${BASE}/member-login?state=session-ended`, { waitUntil: 'networkidle' });
  const appText = await text(page);
  ok(/members app/i.test(appText) && appText.includes('Let’s see what’s on.') && !appText.includes('Apply for membership'), 'app: "Members App", the same headline, no Apply link');
  ok(appText.includes('Your session ended.'), 'app: the session-ended notice');
  await page.getByLabel('Email address').fill(`${mTag('nobody')}@example.com`);
  await page.getByRole('button', { name: 'Send login code' }).click();
  await seen(page, 'We don’t recognise that email as a Club Yuppie member. Check for typos and try again.').waitFor();
  ok(await seen(page, 'Applied already? We’ll email you when you’re approved.').isVisible(), 'app: not recognised, with the A-D5 line');
  await ctx.close();
}

await browser.close();
done();
