// Admin console (brief 2.6, r2b Part 3) through the real pages: logs in at /admin/login (password, then the
// TOTP code, aal2) and drives every admin action the way Albert would, then checks the database, the fake
// Stripe calls (fakes.jsonl), the emails and texts sent (message_log, fakes.jsonl) and an admin_audit row for
// each action.
//   Approve (the dialog shows the approval email and the welcome text) · Decline with and without the email
//   (card detached) · Members search and Show more · Pause, Resume and Cancel now with and without Stripe ·
//   create an event with an address (and the checks before it) · Attendees and the .csv · move a booked event
//   and email the people booked (in the save, and later) · Cancel event (refund, emails) · Discounts: add,
//   search, Move up, Move down, Delete with its confirm.
// Run against a build of this branch: PHASE_A_BASE=http://localhost:3145 node tests/e2e/phase-a/12-admin.mjs
// Test people and events are prefixed a. (emails a.t-…@example.com, event slugs a-t-…, titles "a.…").
import fs from 'node:fs';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { adminCreds, loginAdmin } from '/home/claude/stack/tools/login-admin.mjs';
import { action, done, eq, exec, fakePay, fakesMark, fakesSince, memberSession, messages, ok, q, rand, sql, sql1, stripe, svc, waitFor, BASE } from './lib.mjs';

const since = new Date().toISOString();
const RUN = rand();
const ADMIN = JSON.parse(fs.readFileSync('/home/claude/stack/tools/admin-a.json', 'utf8'));
const audits = (act, target) => sql(`select action, admin_id, details from admin_audit where action = ${q(act)} and target_id = ${q(target)} and created_at >= ${q(since)} order by created_at, id`);
const expectAudit = [];
function audited(act, target, label) {
  const rows = audits(act, target);
  ok(rows.length >= 1 && rows.every((r) => r.admin_id === ADMIN.userId), `audit: ${act}${label ? ` (${label})` : ''}`, rows);
  expectAudit.push([act, target]);
  return rows;
}

// ---------------------------------------------------------------- a. test people, applications, events
async function findUser(email) {
  for (let page = 1; ; page += 1) {
    const { data } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (!data.nextPage) return null;
  }
}
async function member(name, fields = {}) {
  const email = `a.t-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${rand()}@example.com`;
  const { data, error } = await svc.auth.admin.createUser({ email, email_confirm: true });
  const user = error ? await findUser(email) : data.user;
  const c = await stripe('POST', 'customers', { email, name });
  const s = await stripe('POST', 'subscriptions', { customer: c.json.id, items: { 0: { price: 'price_membership' } } });
  const row = { id: user.id, email, full_name: name, phone: '+447700900123', membership_status: 'active', stripe_customer_id: c.json.id, stripe_subscription_id: s.json.id, ...fields };
  const up = await svc.from('members').upsert(row);
  if (up.error) throw up.error;
  return { id: user.id, email, name, customer: c.json.id, subscription: s.json.id };
}
async function application(name, { phone = '+447700900888', pm = `pm_a_${rand()}` } = {}) {
  const email = `a.t-app-${rand()}@example.com`;
  const c = await stripe('POST', 'customers', { email, name });
  const { data, error } = await svc.from('applications').insert({
    full_name: name, email, phone, employer: 'Example Ltd', role_title: 'Analyst', linkedin_url: 'https://www.linkedin.com/in/example', instagram_username: 'example',
    stripe_customer_id: c.json.id, stripe_payment_method_id: pm,
  }).select('id').single();
  if (error) throw error;
  return { id: data.id, email, pm, phone, first: name.split(' ')[0] };
}
async function paidBooking(m, eventId, price) {
  const r = await stripe('POST', 'payment_intents', { amount: price, currency: 'gbp', customer: m.customer, metadata: { member_id: m.id, event_id: eventId } });
  await fakePay(r.json.id, 'http://127.0.0.1:9/none');
  const { data, error } = await svc.rpc('book_event', { p_member: m.id, p_event: eventId, p_amount: price, p_payment_intent: r.json.id, p_allow_over_capacity: true });
  if (error || !data.booking_id) throw error ?? new Error(`book_event: ${data.status}`);
  return { id: data.booking_id, pi: r.json.id };
}
async function futureEvent(name, price) {
  const { data, error } = await svc.from('events').insert({
    slug: `a-t-${name}-${rand()}`, title: `a.${name} ${RUN}`, description: 'Admin test event', category: 'sport', location: `${name} Hall`,
    start_time: new Date(Date.now() + 12 * 86400000).toISOString(), price_pence: price, capacity: 20,
  }).select('id').single();
  if (error) throw error;
  return data.id;
}
const localIn = (days, hh, mm) => {
  const d = new Date(Date.now() + days * 86400000);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return `${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

// ---------------------------------------------------------------- browser
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London', acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(30000);
async function open(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  // Wait for hydration: a button with React props attached.
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => Object.keys(b).some((k) => k.startsWith('__react'))), null, { timeout: 30000 });
}
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });

try {
  // ---- 0. the door: an anonymous visitor is sent to Log in; the real Log in reaches aal2
  const anon = await fetch(`${BASE}/admin/members`, { redirect: 'manual' });
  ok([303, 307, 308].includes(anon.status) && /\/admin\/login/.test(anon.headers.get('location') ?? ''), `an anonymous visitor to /admin/members is sent to /admin/login (${anon.status})`);
  const login = await loginAdmin(page, BASE, adminCreds('a.'));
  eq(login.aal, 'aal2', '/admin/login: password, then the authenticator code, reaches aal2 (MFA unchanged)');
  await open('/admin');
  eq((await page.locator('h1').first().innerText()).trim(), 'Dashboard', 'the dashboard opens');
  const navLinks = await page.locator('nav[aria-label="Admin"]').first().locator('a').allInnerTexts();
  ok(navLinks.some((t) => t.startsWith('Applications')) && !navLinks.some((t) => /Reports|Photos|Payments/.test(t)), 'the nav has the six Phase A pages and no Reports, Photos or Payments (B-D22)', navLinks);

  // ---- 1. Approve: the dialog shows the approval email and the welcome text, then the member is made
  const app = await application(`Hana Approve${RUN}`);
  let mark = fakesMark();
  await open(`/admin/applications/${app.id}`);
  await button('Approve').click();
  const dlgA = page.getByTestId('dialog-approve');
  await dlgA.waitFor();
  const dlgAText = await dlgA.innerText();
  ok(dlgAText.includes('You’re in - welcome to Club Yuppie') && dlgAText.includes('Your account is ready. Log in with this email address.'), 'Approve dialog: the approval email’s subject and first line (lib/emails)');
  ok(/Club Yuppie: You’re in\. Log in: .*\/member-login/.test(dlgAText), 'Approve dialog: the welcome text word for word');
  ok(dlgAText.includes('£10 a month') && dlgAText.includes('It can’t be undone here.'), 'Approve dialog: says it takes the first payment and can’t be undone');
  await button('Read the email', dlgA).click();
  ok(await dlgA.locator('iframe.ad-mailframe').count() === 1, 'Read the email opens the email itself');
  await button(`Approve ${app.first}`, dlgA).click();
  await page.waitForURL(/done=approved/, { timeout: 60000 });
  await page.getByText(`${app.first} is in.`).waitFor();
  ok(true, 'the card shows “… is in.” after approving');
  const approved = sql1(`select a.status, m.id as member_id, m.membership_status from applications a left join members m on m.email = a.email where a.id = ${q(app.id)}`);
  eq([approved.status, approved.membership_status], ['approved', 'active'], 'approve: the application is approved and the member is made, active');
  ok(fakesSince(mark, 'stripe').some((l) => l.path === '/v1/subscriptions' && l.method === 'POST' && /^approve-sub-/.test(l.idem ?? '')), 'Stripe: the subscription is made (first payment), with an idempotency key');
  await waitFor(() => messages(`application_id = ${q(app.id)} and template = 'approval' and status = 'sent'`).length === 1, 'message_log: the approval email sent');
  await waitFor(() => messages(`application_id = ${q(app.id)} and template = 'welcome' and status = 'sent'`).length === 1, 'message_log: the welcome text sent');
  await waitFor(() => fakesSince(mark, 'sms').some((x) => x.to === app.phone && /^Club Yuppie: You’re in\. Log in: .*\/member-login$/.test(x.body)), 'fakes.jsonl: the text reached Twilio, word for word');
  audited('application.approve', app.id);

  // ---- 2. Decline with the email (the switch is on by default), card released
  const d1 = await application(`Dee Decline${RUN}`);
  mark = fakesMark();
  await open(`/admin/applications/${d1.id}`);
  await button('Decline').click();
  const dlgD = page.getByTestId('dialog-decline');
  await dlgD.waitFor();
  eq(await dlgD.getByRole('switch').getAttribute('aria-checked'), 'true', 'Decline dialog: the email switch is on by default (B-D3)');
  ok((await dlgD.innerText()).includes('Subject: Your Club Yuppie application.'), 'Decline dialog: names the email it sends');
  await button('Decline application', dlgD).click();
  await page.waitForURL(/done=declined/, { timeout: 30000 });
  await page.getByText('A decline email was sent.').waitFor();
  ok(true, 'the card says “A decline email was sent.”');
  eq(sql1(`select status, card_released_at is not null as released from applications where id = ${q(d1.id)}`), { status: 'rejected', released: true }, 'Decline: status rejected (B-D9), card released (C-D8)');
  ok(fakesSince(mark, 'stripe').some((l) => l.path === `/v1/payment_methods/${d1.pm}/detach` && l.idem === `detach-${d1.pm}`), 'fakes.jsonl: the saved card is detached in Stripe, with an idempotency key');
  await waitFor(() => messages(`application_id = ${q(d1.id)} and template = 'decline' and status = 'sent'`).length === 1, 'message_log: the decline email sent');
  ok(!fakesSince(mark, 'sms').some((x) => x.to === d1.phone), 'never a text for a decline (C-D2)');
  eq(audited('application.decline', d1.id)[0].details.send_email, true, 'and it records the email was asked for');

  // ---- 3. Decline with the switch off
  const d2 = await application(`Dan Quiet${RUN}`);
  mark = fakesMark();
  await open(`/admin/applications/${d2.id}`);
  await button('Decline').click();
  const dlgD2 = page.getByTestId('dialog-decline');
  await dlgD2.getByRole('switch').click();
  ok((await dlgD2.innerText()).includes('won’t hear from us'), 'switch off: “… won’t hear from us. Nothing is sent.”');
  await button('Decline application', dlgD2).click();
  await page.getByText('No email was sent.').waitFor();
  ok(true, 'the card says “No email was sent.”');
  eq(sql1(`select status, card_released_at is not null as released from applications where id = ${q(d2.id)}`), { status: 'rejected', released: true }, 'Decline, no email: rejected, card still released');
  ok(fakesSince(mark, 'stripe').some((l) => l.path === `/v1/payment_methods/${d2.pm}/detach`), 'fakes.jsonl: the card detached');
  eq(messages(`application_id = ${q(d2.id)}`).length, 0, 'message_log: nothing sent');
  eq(audited('application.decline', d2.id)[0].details.send_email, false, 'and it records no email');

  // ---- 3b. payment problems: plain banners, Stripe's words behind Details, the one safe thing to do
  const pc = await application(`Kit Card${RUN}`);
  exec(`update applications set payment_error = 'Your card was declined.' where id = ${q(pc.id)}`);
  const pa = await application(`Rosa Account${RUN}`);
  exec(`update applications set payment_error = 'Payment succeeded (Stripe subscription sub_x) but the member account could not be finished: boom. It''s safe to click Approve again: this will retry account creation without charging again.', stripe_subscription_id = 'sub_a_${RUN}' where id = ${q(pa.id)}`);
  const pu = await application(`Uma Unsaved${RUN}`);
  exec(`update applications set payment_error = 'Charged (Stripe subscription sub_y) but failed to save that. Do not approve again without checking Stripe and the database first. Error: timeout' where id = ${q(pu.id)}`);
  await open('/admin');
  ok((await page.locator('.ad-card').first().innerText()).includes('Payment problems'), 'the dashboard lists Payment problems');
  await open(`/admin/applications/${pc.id}`);
  ok(await page.getByText('The card was declined.').isVisible() && await button('Try again').isVisible(), 'card declined: a plain banner and Try again (r2b 16)');
  ok(!(await page.locator('.ad-card').innerText()).includes('Your card was declined.'), 'Stripe’s own words are hidden');
  await button('Details').click();
  ok(await page.getByText('Your card was declined.').isVisible(), 'and shown behind Details');
  await open(`/admin/applications/${pa.id}`);
  ok(await page.getByText('The payment went through, but the account isn’t finished.').isVisible() && await button('Decline').isDisabled() && await button('Finish the account').isVisible(), 'paid, account not made: Finish the account, Decline switched off');
  await open(`/admin/applications/${pu.id}`);
  ok(await page.getByText('Charged, but we couldn’t save it.').isVisible() && await button('Approve').isDisabled() && await button('Decline').isDisabled(), 'charged, not saved: Approve and Decline both switched off');
  exec(`update applications set status = 'rejected', reviewed_at = now() where id in (${[pc.id, pa.id, pu.id].map(q).join(',')})`);

  // ---- 4. Members: search by name, nine rows, then Show more
  const token = `Srch${RUN}`;
  const crowd = [];
  for (let i = 1; i <= 11; i += 1) crowd.push(await member(`${token} Person${String(i).padStart(2, '0')}`));
  await open('/admin/members');
  await page.getByRole('searchbox').fill(token.toLowerCase());
  await page.waitForFunction((n) => document.querySelectorAll('.ad-list-col .ad-item').length === n, 9);
  ok(true, 'search as you type: nine rows of eleven matches');
  ok((await page.locator('.ad-list-col .ad-more').innerText()).includes('Showing 9 of 11'), '“Showing 9 of 11”');
  ok(new URL(page.url()).searchParams.get('q') === token.toLowerCase(), 'the search is kept in the address');
  await button('Show more').click();
  await page.waitForFunction((n) => document.querySelectorAll('.ad-list-col .ad-item').length === n, 11);
  ok(/11 of \d+ match/.test(await page.locator('.ad-list-col .ad-more').innerText()), 'Show more: all eleven, “11 of … match”');
  await page.getByRole('searchbox').fill(crowd[3].email);
  await page.waitForFunction(() => document.querySelectorAll('.ad-list-col .ad-item').length === 1);
  ok(true, 'search by email finds the one member');
  await page.getByRole('searchbox').fill(`zzz${RUN}`);
  await page.getByText(`No one matches “zzz${RUN}”.`).waitFor();
  ok(true, 'no match: “No one matches …”');

  // ---- 5. Pause, Resume and Cancel now, each asking about Stripe with the box ticked (B-D2, B-D23)
  const pm1 = crowd[0];
  async function changeTo(choice) {
    await button('Change membership').click();
    await page.getByRole('radio', { name: new RegExp(`^${choice}`) }).check();
    await button('Save change').click();
  }
  await open(`/admin/members/${pm1.id}`);
  mark = fakesMark();
  await changeTo('Paused');
  const dlgP = page.getByTestId('dialog-pause');
  ok(await dlgP.getByRole('checkbox').isChecked(), 'Pause dialog: “Also pause … payments in Stripe” is ticked');
  await button('Pause membership', dlgP).click();
  await page.getByText(`${pm1.name.split(' ')[0]}’s membership is paused.`).waitFor();
  eq(sql1(`select membership_status from members where id = ${q(pm1.id)}`).membership_status, 'paused', 'Pause: the member is paused');
  const pauseCall = fakesSince(mark, 'stripe').find((l) => l.path === `/v1/subscriptions/${pm1.subscription}` && l.method === 'POST');
  eq([pauseCall?.body?.pause_collection, /^sub-pause-/.test(pauseCall?.idem ?? '')], [{ behavior: 'void' }, true], 'fakes.jsonl: Stripe pause_collection void, with an idempotency key');
  eq(audited('member.pause', pm1.id).at(-1).details.stripe_requested, true, 'with Stripe');

  mark = fakesMark();
  await button('Resume membership').click();
  const dlgR = page.getByTestId('dialog-resume');
  ok(await dlgR.getByRole('checkbox').isChecked(), 'Resume dialog: “Also restart … payments in Stripe” is ticked');
  await button('Resume membership', dlgR).click();
  await page.getByText(`${pm1.name.split(' ')[0]}’s membership is active again.`).waitFor();
  eq(sql1(`select membership_status from members where id = ${q(pm1.id)}`).membership_status, 'active', 'Resume: active again');
  eq(fakesSince(mark, 'stripe').find((l) => l.path === `/v1/subscriptions/${pm1.subscription}` && l.method === 'POST')?.body?.pause_collection, '', 'fakes.jsonl: Stripe pause_collection cleared');
  audited('member.resume', pm1.id);

  mark = fakesMark();
  await changeTo('Paused');
  await page.getByTestId('dialog-pause').getByRole('checkbox').uncheck();
  await button('Pause membership', page.getByTestId('dialog-pause')).click();
  await page.getByText('Payments in Stripe were left as they were.').first().waitFor();
  eq([sql1(`select membership_status from members where id = ${q(pm1.id)}`).membership_status, fakesSince(mark, 'stripe').filter((l) => l.method !== 'GET').length], ['paused', 0], 'Pause with the box unticked: paused here, Stripe untouched');
  eq(audits('member.pause', pm1.id).at(-1).details.stripe_requested, false, 'audit: member.pause without Stripe');
  mark = fakesMark();
  await button('Resume membership').click();
  await page.getByTestId('dialog-resume').getByRole('checkbox').uncheck();
  await button('Resume membership', page.getByTestId('dialog-resume')).click();
  await page.getByText(`${pm1.name.split(' ')[0]}’s membership is active again.`).waitFor();
  eq([sql1(`select membership_status from members where id = ${q(pm1.id)}`).membership_status, fakesSince(mark, 'stripe').filter((l) => l.method !== 'GET').length], ['active', 0], 'Resume with the box unticked: active here, Stripe untouched');
  eq(audits('member.resume', pm1.id).at(-1).details.stripe_requested, false, 'audit: member.resume without Stripe');

  const cm = crowd[1];
  const cmEvent = await futureEvent('cancelnow', 1700);
  const cmBooking = await paidBooking(cm, cmEvent, 1700);
  await open(`/admin/members/${cm.id}`);
  mark = fakesMark();
  await changeTo('Cancelled');
  const dlgC = page.getByTestId('dialog-cancel');
  const dlgCText = await dlgC.innerText();
  ok(await dlgC.getByRole('checkbox').isChecked() && dlgCText.includes('subscription in Stripe now') && dlgCText.includes('one future booking is cancelled'), 'Cancel dialog: Stripe box ticked, and it warns about the future booking (A-D8)');
  await button('Cancel membership', dlgC).click();
  await page.getByText(`${cm.name.split(' ')[0]}’s membership is cancelled.`).waitFor();
  eq(sql1(`select membership_status, ended_reason from members where id = ${q(cm.id)}`), { membership_status: 'cancelled', ended_reason: 'admin_cancelled' }, 'Cancel now: ended at once (B-D23), admin_cancelled');
  eq(fakesSince(mark, 'stripe').find((l) => l.method === 'DELETE' && l.path === `/v1/subscriptions/${cm.subscription}`)?.idem, `sub-cancel-now-${cm.subscription}`, 'fakes.jsonl: the subscription cancelled now in Stripe');
  eq(sql1(`select status, refund_status from bookings where id = ${q(cmBooking.id)}`), { status: 'cancelled', refund_status: 'succeeded' }, 'the future paid booking is cancelled and refunded');
  ok(fakesSince(mark, 'stripe').some((l) => l.path === '/v1/refunds' && l.idem === `refund-booking-${cmBooking.id}`), 'fakes.jsonl: the refund, with its idempotency key');
  await waitFor(() => messages(`member_id = ${q(cm.id)} and template = 'membership-ended' and status = 'sent'`).length === 1, 'message_log: membership-ended sent');
  eq(audited('member.cancel_now', cm.id).at(-1).details.stripe_requested, true, 'with Stripe');
  ok((await page.locator('.ad-card').innerText()).includes('Cancelled is final.'), 'the card now says “Cancelled is final.” and offers no change');

  const cq = crowd[2];
  await open(`/admin/members/${cq.id}`);
  mark = fakesMark();
  await changeTo('Cancelled');
  await page.getByTestId('dialog-cancel').getByRole('checkbox').uncheck();
  await button('Cancel membership', page.getByTestId('dialog-cancel')).click();
  await page.getByText(`${cq.name.split(' ')[0]}’s membership is cancelled.`).waitFor();
  eq([sql1(`select membership_status from members where id = ${q(cq.id)}`).membership_status, fakesSince(mark, 'stripe').filter((l) => l.method === 'DELETE').length], ['cancelled', 0], 'Cancel now with the box unticked: ended here, Stripe untouched');
  eq(audits('member.cancel_now', cq.id).at(-1).details.stripe_requested, false, 'audit: member.cancel_now without Stripe');

  // ---- 6. Events: the checks before creating, then create one with an address (live had a bug: events.tier)
  await open('/admin/events/new');
  await button('Create event').click();
  await page.getByText('Some details are missing.').waitFor();
  ok(await page.getByText('Add a title.').isVisible() && await page.getByText('Choose when it starts.').isVisible() && await page.getByText('Add how many people can come.').isVisible(), 'empty: “Some details are missing.” and each field says what to do');
  const title = `a.Admin create ${RUN}`;
  const address = 'Northgate Courts, 1 Sample Road, Anytown AB1 2CD';
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Category').selectOption('sport');
  await page.getByLabel('Location').fill('Northgate Courts');
  await page.getByLabel('Address').fill(address);
  await page.getByLabel('Starts').fill(localIn(10, 18, 30));
  await page.getByLabel('Price per person (£)').fill('25');
  await page.getByLabel('Capacity').fill('16');
  await page.getByLabel('Description').fill('Two hours on court, then pints.');
  await button('Create event').click();
  await page.waitForURL(/\/admin\/events\/[0-9a-f-]{36}\?created=1/, { timeout: 30000 });
  await page.getByText('Event created. Members see it in the Events list now.').waitFor();
  const ev = sql1(`select e.id, e.slug, e.price_pence, e.capacity, a.address from events e left join event_addresses a on a.event_id = e.id where e.title = ${q(title)}`);
  eq([ev.price_pence, ev.capacity, ev.address], [2500, 16, address], 'Create event through the page: saved (no events.tier needed), the address in event_addresses (B-D20)');
  ok(page.url().includes(ev.id), 'and the new event’s card opens');
  audited('event.create', ev.id);

  // ---- 7. Attendees and Export list (.csv)
  const att1 = crowd[4];
  const att2 = crowd[5];
  const b1 = await paidBooking(att1, ev.id, 2500);
  const b2 = await paidBooking(att2, ev.id, 2500);
  await action('events.cancelBooking', [b2.id], await memberSession(att2.email));
  await open(`/admin/events/${ev.id}?tab=attendees`);
  const chips = await page.locator('.ad-card .ad-chips button').allInnerTexts();
  ok(chips.some((t) => /Confirmed\s*1/.test(t)) && chips.some((t) => /Cancelled\s*1/.test(t)), 'Attendees: Confirmed 1, Cancelled 1 (B-D7)', chips);
  ok((await page.locator('.ad-card .ad-att').first().innerText()).includes(att1.name) && (await page.locator('.ad-card .ad-att').first().innerText()).includes('£25 paid'), 'the confirmed person with what they paid');
  await page.locator('.ad-card .ad-chips button', { hasText: 'Cancelled' }).click();
  ok((await page.locator('.ad-card .ad-att').first().innerText()).includes('£25 refunded'), 'Cancelled people, with what was refunded');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: /Export list \(\.csv\)/ }).click()]);
  const csvPath = await download.path();
  const csvLines = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '').trim().split('\r\n');
  eq([download.suggestedFilename(), csvLines[0], csvLines.length], [`${ev.slug}-attendees.csv`, 'Name,Email,Phone,Status,Booked,Paid,Cancelled,Why,Refund,Refunded', 3], 'Export list: <slug>-attendees.csv, the header and one row per person');
  audited('event.export_attendees', ev.id);

  // ---- 8. Move the time of a booked event and email the people booked (C-D11)
  await open(`/admin/events/${ev.id}`);
  mark = fakesMark();
  await page.getByLabel('Starts').fill(localIn(10, 19, 30));
  await button('Save changes').click();
  const dlgM = page.getByTestId('dialog-move');
  await dlgM.waitFor();
  ok((await dlgM.innerText()).includes('can cancel for a full refund') && (await dlgM.getByRole('switch').getAttribute('aria-checked')) === 'true', 'moving a booked event asks, with “Email the person booked” on');
  await button('Save changes', dlgM).click();
  await page.getByText('Saved. Members see the new details now.').waitFor();
  ok(sql1(`select changed_at is not null as c from events where id = ${q(ev.id)}`).c, 'changed_at set (they may now cancel for a full refund)');
  await waitFor(() => messages(`event_id = ${q(ev.id)} and booking_id = ${q(b1.id)} and template = 'event-changed' and status = 'sent'`).length === 1, 'message_log: event-changed to the person booked');
  await waitFor(() => fakesSince(mark, 'email').some((e) => [].concat(e.to).includes(att1.email)), 'fakes.jsonl: the email reached Resend');
  const upd = audited('event.update', ev.id).at(-1).details;
  eq([upd.moved, upd.notify], ['time', true], 'audit: event.update says the time moved and they were told');

  // the place, without the email in the save, then "Email them now"
  await page.getByLabel('Location').fill('Riverside Club');
  await page.getByLabel('Address').fill('Riverside Club, 9 Sample Walk, Anytown AB1 2CD');
  await button('Save changes').click();
  await page.getByTestId('dialog-move').getByRole('switch').click();
  await button('Save changes', page.getByTestId('dialog-move')).click();
  await page.getByText('booked hasn’t been told about the change yet.').waitFor();
  eq(messages(`event_id = ${q(ev.id)} and template = 'event-changed'`).length, 1, 'switch off: nobody emailed yet');
  await button('Email them now').click();
  await page.getByText('Emailed 1 person about the change.').waitFor();
  eq(messages(`event_id = ${q(ev.id)} and template = 'event-changed' and status = 'sent'`).length, 2, 'Email them now: the person booked emailed about the new place');
  audited('event.email_change', ev.id);

  // the capacity rule
  await page.getByLabel('Capacity').fill('0');
  await button('Save changes').click();
  await page.getByText('The capacity is lower than the number booked.').waitFor();
  eq(sql1(`select capacity from events where id = ${q(ev.id)}`).capacity, 16, 'capacity below the number booked: refused, nothing saved');
  await page.getByLabel('Capacity').fill('16');

  // ---- 9. Cancel event: says how many and how much, then refunds and emails (B-D8)
  mark = fakesMark();
  await button('Cancel event').click();
  const dlgE = page.getByTestId('dialog-cancel-event');
  const dlgEText = await dlgE.innerText();
  ok(dlgEText.includes('1 person is booked') && dlgEText.includes('£25') && dlgEText.includes('is cancelled'), 'Cancel event dialog: how many, how much, and the email they get');
  await dlgE.getByLabel('Reason (optional)').fill('the courts are closed that evening');
  await button('Cancel event and refund 1', dlgE).click();
  await page.getByText('This event is cancelled.').waitFor();
  eq(sql1(`select cancelled_at is not null as c, cancel_note from events where id = ${q(ev.id)}`), { c: true, cancel_note: 'the courts are closed that evening' }, 'the event is cancelled, with the reason');
  eq(sql1(`select status, cancel_reason, refund_status from bookings where id = ${q(b1.id)}`), { status: 'cancelled', cancel_reason: 'event_cancelled', refund_status: 'succeeded' }, 'the booking cancelled by the club and refunded');
  ok(fakesSince(mark, 'stripe').some((l) => l.path === '/v1/refunds' && l.idem === `refund-booking-${b1.id}`), 'fakes.jsonl: the refund');
  await waitFor(() => messages(`event_id = ${q(ev.id)} and booking_id = ${q(b1.id)} and template = 'event-cancelled' and status = 'sent'`).length === 1, 'message_log: event-cancelled sent');
  audited('event.cancel', ev.id);

  // ---- 10. Discounts: add two, search, Move up and Move down, Delete with its confirm
  const discIds = [];
  for (const nm of [`a.Disc One ${RUN}`, `a.Disc Two ${RUN}`]) {
    await open('/admin/discounts/new');
    await page.getByLabel('Name').fill(nm);
    await page.getByLabel('Area').fill('Northgate');
    await page.getByLabel('Category').selectOption({ index: 1 });
    await page.getByLabel('Headline').fill('10% off for members');
    await page.getByLabel('Badge').fill('10%');
    await button('Add discount').click();
    await page.waitForURL(/\/admin\/discounts\/[0-9a-f-]{36}\?created=1/);
    const id = new URL(page.url()).pathname.split('/').pop();
    discIds.push(id);
    audited('perk.create', id);
  }
  const orderOf = (id) => sql1(`select count(*)::int as n from partner_perks p, partner_perks me where me.id = ${q(id)} and p.type = 'discount' and (p.display_order, p.id) <= (me.display_order, me.id)`).n;
  const total = sql1(`select count(*)::int as n from partner_perks where type = 'discount'`).n;
  eq([orderOf(discIds[0]), orderOf(discIds[1])], [total - 1, total], 'new discounts go to the bottom of the list');
  ok((await page.locator('.ad-card').innerText()).includes(`Position ${total} of ${total}`), `the card says “Position ${total} of ${total}”`);
  ok(await button('Move down').isDisabled(), 'Move down is switched off at the bottom');
  await page.getByRole('searchbox').fill(`disc two ${RUN}`);
  await page.waitForFunction(() => document.querySelectorAll('.ad-list-col .ad-prow').length === 1);
  ok(true, 'Discounts search finds the one row');
  await button('Move up').click();
  await page.locator('.ad-card', { hasText: `Position ${total - 1} of ${total}` }).waitFor();
  eq(orderOf(discIds[1]), total - 1, 'Move up: one place up in partner_perks (B-D19)');
  audited('perk.move_up', discIds[1]);
  await button('Move down').click();
  await page.locator('.ad-card', { hasText: `Position ${total} of ${total}` }).waitFor();
  eq(orderOf(discIds[1]), total, 'Move down: back to the bottom');
  audited('perk.move_down', discIds[1]);
  await button('Delete discount').click();
  const dlgX = page.getByTestId('dialog-delete-perk');
  ok((await dlgX.innerText()).includes('Members stop seeing this discount straight away. It can’t be undone.'), 'Delete asks first (B-D17)');
  await button('Keep it', dlgX).click();
  ok(sql1(`select count(*)::int as n from partner_perks where id = ${q(discIds[1])}`).n === 1, 'Keep it: nothing deleted');
  await button('Delete discount').click();
  await button('Delete discount', page.getByTestId('dialog-delete-perk')).click();
  await page.waitForURL((u) => u.pathname === '/admin/discounts');
  eq(sql1(`select count(*)::int as n from partner_perks where id = ${q(discIds[1])}`).n, 0, 'Delete discount: gone');
  audited('perk.delete', discIds[1]);
  exec(`delete from partner_perks where id = ${q(discIds[0])}`);

  // ---- the Menu below 1100px, then Account, Log out
  await page.setViewportSize({ width: 768, height: 900 });
  await open('/admin');
  await button('Menu').click();
  await page.locator('#ad-menu').getByRole('link', { name: /^Events/ }).click();
  await page.waitForURL((u) => u.pathname === '/admin/events');
  ok(await page.locator('#ad-menu').count() === 0, 'below 1100px: Menu opens the panel, a row goes there and the panel closes (B-D5)');
  await page.setViewportSize({ width: 1280, height: 900 });
  await button('Account').click();
  ok((await page.locator('.ad-pop').innerText()).includes(ADMIN.email), 'Account shows who is logged in');
  await page.locator('.ad-pop').getByRole('menuitem', { name: 'Log out' }).click();
  await page.waitForURL((u) => u.pathname === '/admin/login');
  ok(true, 'Log out lands on the admin Log in');

  // ---- every action above left an admin_audit row naming the admin
  ok(expectAudit.length >= 16, `${expectAudit.length} admin actions, each with its admin_audit row`);
  ok(sql(`select distinct admin_id from admin_audit where created_at >= ${q(since)} and target_id in (${expectAudit.map(([, t]) => q(t)).join(',')})`).every((r) => r.admin_id === ADMIN.userId), 'every audit row names the admin who did it');
} catch (err) {
  await page.screenshot({ path: '/tmp/12-admin-failure.png', fullPage: true }).catch(() => {});
  console.error(`FAIL 12-admin.mjs: ${err.message}\n  (screenshot /tmp/12-admin-failure.png, page ${page.url()})`);
  process.exit(1);
} finally {
  await browser.close();
}
done();
