// Today's real flows still work on this branch (brief 7.8), in a browser where a screen exists: log in
// through /member-login (the code from the local mailbox), Events and an event page, free booking with the
// page's own button, a paid booking (PaymentIntent made through the app, paid on the fake, the page then
// shows Booked), Your plans, You, profile edit, email change with its notice to the old address, redeem,
// log out, the preview harness, the webhook for event payments (also in 02 and 04).
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { loginMember, waitForCode } from '/home/claude/stack/tools/login.mjs';
import {
  BASE, action, done, eq, fakePay, fd, makeBooking, makeEvent, makeMember, memberSession, messages, ok, page, q, sql1, waitFor,
} from './lib.mjs';

const m = await makeMember('ex1');
const free = await makeEvent('exfree', { price: 0, capacity: 10 });
const paid = await makeEvent('expaid', { price: 2500, capacity: 10 });
const past = await makeEvent('expast', { price: 0, startInHours: 2 });
await makeBooking(m, past);
await (await import('./lib.mjs')).exec(`update events set start_time = now() - interval '1 day' where id = ${q(past.id)}`);

// The page's own <main> (a streamed page also holds its loading <main> until it is swapped).
const mainText = async (pg) => {
  await pg.locator('main:not([aria-busy="true"])').last().waitFor();
  return pg.locator('main:not([aria-busy="true"])').last().innerText();
};

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await context.newPage();
  await loginMember(p, BASE, m.email);
  ok(new URL(p.url()).pathname.startsWith('/members'), `log in through /member-login with the emailed code: ${new URL(p.url()).pathname}`);

  await p.goto(`${BASE}/members/events`);
  ok((await mainText(p)).includes('Exfree night'), 'Events lists the event');

  // Free booking with the page's own button.
  await p.goto(`${BASE}/members/events/${free.slug}`);
  await p.waitForLoadState('networkidle');
  // The redesigned page (r2a): one tap opens "You’re booked." and the bar turns to "See booking".
  await p.getByRole('button', { name: 'Book my spot' }).filter({ visible: true }).first().click();
  await p.getByRole('dialog').getByRole('heading', { name: 'You’re booked.' }).waitFor({ timeout: 20000 });
  await p.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await p.getByRole('button', { name: 'See booking' }).filter({ visible: true }).first().waitFor({ timeout: 20000 });
  ok(true, 'free event: Book my spot books it (You’re booked, then See booking)');
  const fb = sql1(`select id, status, amount_pence from bookings where member_id = ${q(m.id)} and event_id = ${q(free.id)}`);
  eq([fb.status, fb.amount_pence], ['confirmed', 0], 'and the booking row exists');
  await waitFor(() => messages(`booking_id = ${q(fb.id)} and template = 'booking-confirmed-included' and status = 'sent'`).length === 1, 'with its confirmation email');
  await p.reload();
  await p.getByRole('button', { name: 'See booking' }).filter({ visible: true }).first().waitFor({ timeout: 20000 });
  ok(true, 'Booked stays after a reload');

  // Paid: the PaymentIntent is made through the app, paid on the fake (Stripe.js cannot reach it), webhook books.
  const s = await memberSession(m.email);
  const secret = (await action('events.createEventPaymentIntent', [fd({ event_id: paid.id })], s)).result.clientSecret;
  const pay = await fakePay(secret.split('_secret')[0]);
  eq(pay.webhook, 200, 'paid: the fake pays and the webhook answers 200');
  await p.goto(`${BASE}/members/events/${paid.slug}`);
  await p.getByRole('button', { name: 'See booking' }).filter({ visible: true }).first().waitFor({ timeout: 20000 });
  ok(true, 'paid: the event page shows the booking');

  await p.goto(`${BASE}/members/plans`);
  const plans = await mainText(p);
  ok(plans.includes('Exfree night') && plans.includes('Expaid night'), 'Your plans lists both bookings');
  await p.goto(`${BASE}/members/plans?when=past`);
  ok((await mainText(p)).includes('Expast night'), 'and the past one under Past');

  await p.goto(`${BASE}/members/you`);
  ok((await mainText(p)).includes('Ex1 Tester'), 'You shows the member');

  // Profile edit (the action the Edit page calls) and its page.
  eq((await page('/members/profile/edit', s)).status, 200, 'the Edit details page opens');
  eq((await action('profile.updateProfile', [fd({ full_name: 'Ex One', phone: '+447911123456', employer: 'Acme', role_title: 'Lead' })], s)).result, { success: true }, 'updateProfile saves (through the member’s own client and the column grants)');
  eq(sql1(`select full_name, phone, employer, role_title from members where id = ${q(m.id)}`), { full_name: 'Ex One', phone: '+447911123456', employer: 'Acme', role_title: 'Lead' }, 'the row has the new details');

  // Email change: codes to both addresses (secure email change), then the notice to the old one.
  const newEmail = m.email.replace('@', '.new@');
  const since = Date.now() - 1000;
  eq((await action('profile.requestEmailChange', [newEmail], s)).result, { success: true }, 'requestEmailChange: codes sent');
  const codeNew = await waitForCode(newEmail, since);
  const first = await action('profile.verifyEmailChange', ['new', codeNew], s);
  let result = first.result;
  if (result.status === 'needs_other_code') {
    const codeOld = await waitForCode(m.email, since);
    result = (await action('profile.verifyEmailChange', ['current', codeOld], s)).result;
  }
  eq(result, { status: 'done', email: newEmail }, 'verifyEmailChange: done');
  eq(sql1(`select email from members where id = ${q(m.id)}`).email, newEmail, 'members.email follows');
  await waitFor(() => messages(`member_id = ${q(m.id)} and template = 'email-changed' and status = 'sent' and to_address = ${q(m.email)}`).length === 1, 'the rewritten email-changed notice goes to the old address');

  // Redeem card and log out.
  const s2 = await memberSession(newEmail);
  const redeem = (await action('redemption.getRedemptionStatus', [], s2)).result;
  eq([redeem.full_name, redeem.membership_status], ['Ex One', 'active'], 'the redeem card reads the member fresh');
  eq((await action('profile.signOutMember', [], s2)).redirect, '/', 'log out: back to the home page');

  // The preview harness still draws the example screens.
  eq((await page('/dev-preview')).status, 200, 'the preview harness index opens');
  eq((await page('/dev-preview/you-home?shell=web')).status, 200, 'it draws You');
  eq((await page('/dev-preview/you-ended?shell=app')).status, 200, 'and the ended gate in the app shell');
} finally {
  await browser.close();
}
done();
