// Fixer 2 (member pages) regression checks for the QA1 findings of the Phase A fix round (FIX_BRIEF.md, 28 Oct 2026).
//   QA1-02  the session ends while a page is open: Book, Pay, Cancel booking and the You actions (Cancel membership,
//           Keep my membership, Delete my account) land on Log in with "Your session ended."; nothing changes; the
//           proxy never redirects a server action; every member action answers sessionEnded without a session
//   QA1-04  "Paid, but not booked yet." survives a reload (the amount taken, no Book button, no second
//           PaymentIntent); once the club refunds it in Stripe the event is bookable again
//   QA1-05  an included event inside 48 hours: no refund words, "Your spot goes back to the club, so someone else
//           can take it.", the member can give the spot back
//   QA1-06  emails: a paid booking cancelled late says the money is not refunded; a booking made inside 48 hours
//           (paid or included) has no cancel deadline; the club deleting an account does not say "you asked us"
//   QA1-07  back from the bank with someone else's payment: a neutral message, no "We took your £12", no booking
//   QA1-09  a booked member on an event that has started: Past event, the booking card keeps the address, no Add to
//           calendar, no Cancel
//   QA1-10  members "Not on the list." answers HTTP 404 (no page, a flag that is off, an event that does not exist)
//   QA1-11  no "Something went wrong" in member-facing words: the login page with Auth failing, and the source
//   Also: the price-changed message from fixer 1 in the message strip (then the page shows the new price), and a
//   payment the server refunded because it could never be booked has its own sheet ("We couldn’t book you in.").
// Run against a production build of this branch: PHASE_A_BASE=http://localhost:3152 node tests/e2e/phase-a/13-fixes-2.mjs
// Test people are prefixed f2. (f2.t-…@example.com); the admin is the seeded f2. admin.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
process.env.PHASE_A_TAG = 'f2.';
const {
  action, adminSession, cookieFor, done, eq, exec, fakePay, fakeState, fakesMark, fakesSince, fd, insertBooking, makeBooking, makeEvent, makeMember,
  memberSession, messages, ok, page: getPage, q, rand, sleep, sql1, stripe, svc, waitFor, BASE, SUPA,
} = await import('./lib.mjs');

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
execFileSync(process.execPath, ['/home/claude/stack/tools/seed.mjs', '--prefix', 'f2.', '--quiet'], { stdio: 'ignore', timeout: 300000 });
const NATIVE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';
const host = new URL(BASE).hostname;
const SESSION_ENDED = '/member-login?state=session-ended';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function open({ email = null, app = false, width = 390 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, ...(app ? { userAgent: NATIVE_UA } : {}) });
  if (email) {
    const session = await memberSession(email);
    await ctx.addCookies(cookieFor(session).split('; ').map((p) => ({ name: p.slice(0, p.indexOf('=')), value: p.slice(p.indexOf('=') + 1), domain: host, path: '/' })));
  }
  // Stripe.js cannot load here: left hanging, so a sheet that needs its fields stays in its state.
  await ctx.route('https://js.stripe.com/**', () => undefined);
  const page = await ctx.newPage();
  return { ctx, page };
}
/** The session dies while the page is open: the auth cookie becomes a session that can no longer be refreshed. */
async function killSession(ctx, memberId) {
  const dead = `base64-${Buffer.from(JSON.stringify({ access_token: 'x.y.z', refresh_token: 'dead', expires_at: 1, expires_in: 0, token_type: 'bearer', user: { id: memberId } })).toString('base64url')}`;
  const cookies = (await ctx.cookies()).filter((c) => c.name.startsWith('sb-'));
  await ctx.clearCookies();
  await ctx.addCookies([{ name: cookies[0].name.replace(/\.\d+$/, ''), value: dead, domain: host, path: '/' }]);
}
const visible = (page, role, name) => page.getByRole(role, { name }).filter({ visible: true }).first();
const dialog = (page) => page.getByRole('dialog');
const bodyText = (page) => page.evaluate(() => document.body.innerText);
const pisFor = async (memberId) => Object.values((await fakeState()).payment_intents).filter((pi) => pi.metadata?.member_id === memberId);
/** The emails the Resend fake holds for an address (with their text). */
async function mailTo(address) {
  return (await fakeState()).emails.filter((e) => (Array.isArray(e.to) ? e.to : [e.to]).some((t) => String(t).toLowerCase() === address.toLowerCase()));
}
async function waitForMail(address, subjectPart, label) {
  let hit = null;
  await waitFor(async () => {
    hit = (await mailTo(address)).filter((e) => e.subject.includes(subjectPart)).at(-1) ?? null;
    return Boolean(hit);
  }, label);
  return hit;
}
async function landsOnSessionEnded(page, label) {
  await page.waitForURL((url) => `${url.pathname}${url.search}` === SESSION_ENDED, { timeout: 20000 }).catch(() => null);
  const url = new URL(page.url());
  const text = await bodyText(page);
  ok(`${url.pathname}${url.search}` === SESSION_ENDED && text.includes('Your session ended.'), `${label}: Log in with "Your session ended."`, page.url());
}

try {
  // ================================================================ QA1-02 the session ends while a page is open
  {
    // The proxy lets a server action through (no 307 to Log in), so the action itself can answer.
    const r = await fetch(`${BASE}/members/events/anything`, { method: 'POST', redirect: 'manual', headers: { 'Next-Action': '00ab', 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component' }, body: '[]' });
    ok(r.status !== 307 && !(r.headers.get('location') ?? '').includes('/member-login'), `a server action POST with no session is not redirected by the proxy (${r.status})`);
    const nav = await fetch(`${BASE}/members/events`, { redirect: 'manual' });
    ok(nav.status === 307 && nav.headers.get('location')?.includes('/member-login'), 'a page load with no session still goes to Log in (307)');

    // Every member action answers sessionEnded with no session (the page then goes to Log in).
    for (const [name, args] of [
      ['events.rsvpToEvent', [fd({ event_id: '00000000-0000-0000-0000-000000000000' })]],
      ['events.createEventPaymentIntent', [fd({ event_id: '00000000-0000-0000-0000-000000000000' })]],
      ['events.confirmEventPayment', ['pi_x', '00000000-0000-0000-0000-000000000000']],
      ['events.cancelBooking', ['00000000-0000-0000-0000-000000000000']],
      ['events.getMyBooking', ['00000000-0000-0000-0000-000000000000']],
      ['you.getCancelMembershipPreview', []],
      ['you.requestCancelMembership', [null]],
      ['you.keepMyMembership', []],
      ['you.getBillingPortalUrl', []],
      ['you.deleteMyAccount', ['delete']],
    ]) {
      eq((await action(name, args, null)).result, { sessionEnded: true }, `${name} with no session: { sessionEnded: true }`);
    }

    const m = await makeMember('expire');
    const included = await makeEvent('expinc', { price: 0 });
    const paid = await makeEvent('exppaid', { price: 1500 });
    const booked = await makeEvent('expbooked', { price: 0 });
    const b = await makeBooking(m, booked);

    // Book (included).
    let { ctx, page } = await open({ email: m.email });
    await page.goto(`${BASE}/members/events/${included.slug}`, { waitUntil: 'networkidle' });
    await killSession(ctx, m.id);
    await visible(page, 'button', 'Book my spot').click();
    await landsOnSessionEnded(page, 'QA1-02 Book');
    eq(sql1(`select count(*)::int as n from bookings where member_id = ${q(m.id)} and event_id = ${q(included.id)}`).n, 0, '  and nothing was booked');
    await ctx.close();

    // Pay (a paid event: the PaymentIntent is never made).
    ({ ctx, page } = await open({ email: m.email }));
    await page.goto(`${BASE}/members/events/${paid.slug}`, { waitUntil: 'networkidle' });
    await killSession(ctx, m.id);
    await visible(page, 'button', 'Book my spot').click();
    await landsOnSessionEnded(page, 'QA1-02 Pay');
    eq((await pisFor(m.id)).filter((pi) => pi.metadata?.event_id === paid.id).length, 0, '  and no PaymentIntent was made');
    await ctx.close();

    // Cancel booking (the sheet is open when the session dies).
    ({ ctx, page } = await open({ email: m.email }));
    await page.goto(`${BASE}/members/events/${booked.slug}`, { waitUntil: 'networkidle' });
    await visible(page, 'button', 'Cancel booking').click();
    await dialog(page).getByRole('heading', { name: 'Cancel your booking?' }).waitFor();
    await killSession(ctx, m.id);
    await dialog(page).getByRole('button', { name: 'Cancel my booking' }).click();
    await landsOnSessionEnded(page, 'QA1-02 Cancel booking');
    eq(sql1(`select status::text from bookings where id = ${q(b.id)}`).status, 'confirmed', '  and the booking is still on');
    await ctx.close();

    // You: Cancel membership (step 1 asks the server), Keep my membership (an ending member), Delete my account.
    ({ ctx, page } = await open({ email: m.email }));
    await page.goto(`${BASE}/members/you`, { waitUntil: 'networkidle' });
    await killSession(ctx, m.id);
    await visible(page, 'button', 'Cancel membership').click();
    await landsOnSessionEnded(page, 'QA1-02 You, Cancel membership');
    eq(sql1(`select cancel_at from members where id = ${q(m.id)}`).cancel_at, null, '  and nothing was cancelled');
    await ctx.close();

    ({ ctx, page } = await open({ email: m.email }));
    await page.goto(`${BASE}/members/you`, { waitUntil: 'networkidle' });
    await visible(page, 'button', 'Cancel membership').click();
    await dialog(page).getByRole('button', { name: 'Continue' }).click();
    await killSession(ctx, m.id);
    await dialog(page).getByRole('button', { name: 'Cancel membership' }).click();
    await landsOnSessionEnded(page, 'QA1-02 You, Cancel membership step 2');
    eq(sql1(`select cancel_at from members where id = ${q(m.id)}`).cancel_at, null, '  and nothing was cancelled');
    await ctx.close();

    const ending = await makeMember('expending', 'ending');
    const endsAt = sql1(`select cancel_at from members where id = ${q(ending.id)}`).cancel_at;
    ({ ctx, page } = await open({ email: ending.email }));
    await page.goto(`${BASE}/members/you`, { waitUntil: 'networkidle' });
    await killSession(ctx, ending.id);
    await visible(page, 'button', 'Keep my membership').click();
    await landsOnSessionEnded(page, 'QA1-02 You, Keep my membership');
    eq(sql1(`select cancel_at from members where id = ${q(ending.id)}`).cancel_at, endsAt, '  and the cancel stands');
    await ctx.close();

    ({ ctx, page } = await open({ email: m.email }));
    await page.goto(`${BASE}/members/you`, { waitUntil: 'networkidle' });
    await visible(page, 'button', 'Delete my account').click();
    await dialog(page).getByLabel('Type delete to confirm').fill('delete');
    await killSession(ctx, m.id);
    await dialog(page).getByRole('button', { name: 'Delete my account' }).click();
    await landsOnSessionEnded(page, 'QA1-02 You, Delete my account');
    eq(sql1(`select deleted_at from members where id = ${q(m.id)}`).deleted_at, null, '  and the account is not deleted');
    await ctx.close();
  }

  // ================================================================ QA1-04 paid, but not booked yet, after a reload
  {
    const m = await makeMember('pnb');
    const ev = await makeEvent('pnb', { price: 1800 });
    const s = await memberSession(m.email);
    const r = await action('events.createEventPaymentIntent', [fd({ event_id: ev.id, price_pence: '1800', attempt_id: `f2-${rand()}-a` })], s);
    ok(r.result.success, 'a PaymentIntent for £18');
    const pi = r.result.clientSecret.split('_secret')[0];
    exec(`update events set price_pence = 2000 where id = ${q(ev.id)}`); // the club changes the price while the member pays
    await fakePay(pi); // the webhook (this server) cannot book it: the amount is not the price now
    await waitFor(() => messages(`dedupe_key = ${q(`admin-alert:paid-not-booked:${pi}`)}`).length === 1, 'the club is alerted: paid, not booked');
    eq(sql1(`select count(*)::int as n from bookings where member_id = ${q(m.id)} and event_id = ${q(ev.id)}`).n, 0, 'no booking was made');

    const { ctx, page } = await open({ email: m.email });
    await page.goto(`${BASE}/members/events/${ev.slug}`, { waitUntil: 'networkidle' });
    const hero = await page.locator('.ea-hero').innerText();
    ok(hero.includes('Paid, but not booked yet.') && hero.includes('We took your £18'), 'QA1-04 after a reload: "Paid, but not booked yet.", with the £18 actually taken', hero.slice(0, 300));
    ok((await page.locator('.ea-bar').innerText()).includes('Processing'), '  the bar says Processing');
    eq(await page.getByRole('button', { name: 'Book my spot' }).count(), 0, '  and there is no Book button');
    ok((await page.locator('.ea-msg[role="alert"]').first().innerText()).includes('Please don’t pay again'), '  the strip says not to pay again');
    const again = await action('events.createEventPaymentIntent', [fd({ event_id: ev.id, price_pence: '2000', attempt_id: `f2-${rand()}-b` })], s);
    eq([again.result.success, again.result.reason], [false, 'paid_not_booked'], '  another tab asking for payment is refused');
    eq((await pisFor(m.id)).length, 1, '  and no second PaymentIntent exists');

    // The club refunds it by hand in Stripe: the member may book again.
    await stripe('POST', 'refunds', { payment_intent: pi });
    await page.reload({ waitUntil: 'networkidle' });
    ok(await visible(page, 'button', 'Book my spot').isVisible(), '  once the club has refunded it in Stripe, the event is bookable again');
    await ctx.close();
  }

  // ================================================================ QA1-05 an included event inside 48 hours
  {
    const m = await makeMember('inclate');
    const ev = await makeEvent('inclate', { price: 0, startInHours: 20 });
    const b = await makeBooking(m, ev);
    const { ctx, page } = await open({ email: m.email });
    await page.goto(`${BASE}/members/events/${ev.slug}`, { waitUntil: 'networkidle' });
    const card = await page.locator('#your-booking').innerText();
    ok(card.includes('If you can’t come, cancel so someone else can take your spot.') && !/refund|tell us/i.test(card), 'QA1-05 the booking card: no refund words, cancel so someone else can go', card);
    await visible(page, 'button', 'Cancel booking').click();
    await dialog(page).getByRole('heading', { name: 'Cancel your booking?' }).waitFor();
    const sheet = await dialog(page).innerText();
    ok(sheet.includes('Your spot goes back to the club, so someone else can take it.') && !/refund|too late/i.test(sheet), 'QA1-05 the sheet: the spot goes back, no refund wording', sheet);
    await dialog(page).getByRole('button', { name: 'Cancel my booking' }).click();
    await dialog(page).getByRole('heading', { name: 'Booking cancelled.' }).waitFor({ timeout: 20000 });
    ok(!/refund/i.test(await dialog(page).innerText()), '  done: no refund words');
    eq(Object.values(sql1(`select status::text, refund_status from bookings where id = ${q(b.id)}`)), ['cancelled', 'none'], '  the spot is given back, nothing to refund');
    const mail = await waitForMail(m.email, 'Cancelled:', '  the cancel email is sent');
    ok(!/refund/i.test(mail.text) && mail.text.includes('Your place has gone back to the other members.'), '  the email has no refund words', mail.text.slice(0, 400));
    await ctx.close();
  }

  // ================================================================ QA1-06 the emails
  {
    // A paid booking cancelled late, without a refund.
    const m = await makeMember('late');
    const ev = await makeEvent('late', { price: 2000, startInHours: 20 });
    const b = await makeBooking(m, ev);
    const s = await memberSession(m.email);
    const res = await action('events.cancelBooking', [b.id, { withoutRefund: true }], s);
    eq([res.result.ok, res.result.refund, res.result.late], [true, 'none', true], 'a paid booking cancelled late without a refund');
    const mail = await waitForMail(m.email, 'Cancelled:', '  its cancel email is sent');
    ok(mail.text.includes('your £20 isn’t refunded') && /Refunded:?\s*£0/.test(mail.text) && !mail.text.includes('on its way back'), 'QA1-06 it says the £20 is not refunded', mail.text.slice(0, 600));

    // Bookings made inside 48 hours: no cancel deadline (included and paid); outside it, the included line stays.
    const inc = await makeEvent('inc48', { price: 0, startInHours: 20 });
    await action('events.rsvpToEvent', [fd({ event_id: inc.id })], s);
    const incMail = await waitForMail(m.email, `Booked: ${inc.title}`, '  the included confirmation inside 48 hours is sent');
    ok(!incMail.text.includes('Cancel up to 48 hours before') && incMail.text.includes('We’ll remind you 24 hours and 2 hours before.'), 'QA1-06 included, booked inside 48 hours: no "Cancel up to 48 hours before"', incMail.text.slice(0, 600));
    const far = await makeEvent('incfar', { price: 0 });
    await action('events.rsvpToEvent', [fd({ event_id: far.id })], s);
    const farMail = await waitForMail(m.email, `Booked: ${far.title}`, '  the included confirmation outside 48 hours is sent');
    ok(farMail.text.includes('Cancel up to 48 hours before'), '  outside 48 hours the line stays');
    const paid48 = await makeEvent('paid48', { price: 1200, startInHours: 20 });
    const pr = await action('events.createEventPaymentIntent', [fd({ event_id: paid48.id, price_pence: '1200', attempt_id: `f2-${rand()}-c` })], s);
    await fakePay(pr.result.clientSecret.split('_secret')[0]);
    const paidMail = await waitForMail(m.email, `Booked: ${paid48.title}`, '  the paid confirmation inside 48 hours is sent');
    ok(!paidMail.text.includes('You can cancel until'), 'QA1-06 paid, booked inside 48 hours: no cancel deadline', paidMail.text.slice(0, 600));

    // The club deletes an account (admin Delete member) versus the member deleting it.
    const admin = await adminSession('f2.');
    const byClub = await makeMember('delclub');
    const del = await action('admin.members.deleteMember', [byClub.id], admin);
    eq(del.result.success, true, 'the admin deletes a member');
    const clubMail = await waitForMail(byClub.email, 'account is deleted', '  the account-deleted email goes to their address');
    ok(clubMail.text.includes('Club Yuppie deleted your account') && !clubMail.text.includes('asked us to delete'), 'account deleted by the club: it does not say they asked', clubMail.text.slice(0, 600));
    const bySelf = await makeMember('delself');
    const selfDel = await action('you.deleteMyAccount', ['delete'], await memberSession(bySelf.email));
    eq(selfDel.redirect, '/', 'the member deletes their own account');
    const selfMail = await waitForMail(bySelf.email, 'account is deleted', '  their account-deleted email is sent');
    ok(selfMail.text.includes('you asked us to delete your Club Yuppie account'), '  the member’s own delete still says they asked');
  }

  // ================================================================ QA1-07 back from the bank with someone else's payment
  {
    const a = await makeMember('reta');
    const other = await makeMember('reto');
    const ev = await makeEvent('ret', { price: 1200 });
    const pi = (await stripe('POST', 'payment_intents', { amount: 1200, currency: 'gbp', customer: other.customer, metadata: { member_id: other.id, event_id: ev.id } })).json;
    await fakePay(pi.id, 'http://127.0.0.1:9/none');
    const { ctx, page } = await open({ email: a.email });
    await page.goto(`${BASE}/members/events/${ev.slug}?payment_intent=${pi.id}&payment_intent_client_secret=${pi.client_secret}&redirect_status=succeeded`, { waitUntil: 'networkidle' });
    await page.locator('.ea-msg[role="alert"]').first().waitFor({ timeout: 20000 });
    const text = await bodyText(page);
    ok(text.includes('We couldn’t match that payment to your booking. Nothing was booked.') && !text.includes('We took your'), 'QA1-07 someone else’s payment: a neutral message, no "We took your £12"', text.slice(0, 500));
    eq(await dialog(page).count(), 0, '  no sheet');
    ok(await visible(page, 'button', 'Book my spot').isVisible(), '  the page is still bookable');
    eq(sql1(`select count(*)::int as n from bookings where event_id = ${q(ev.id)}`).n, 0, '  and no booking was made for anyone');
    await ctx.close();
  }

  // ================================================================ QA1-09 a booked member on an event that has started
  {
    const m = await makeMember('started');
    const ev = await makeEvent('started', { price: 1500, startInHours: -1, address: '5 Started Lane, Anytown AB1 2CD' });
    await insertBooking(m, ev);
    for (const [label, opts] of [['web 390', { width: 390 }], ['app 390', { width: 390, app: true }], ['web 1280', { width: 1280 }]]) {
      const { ctx, page } = await open({ email: m.email, ...opts });
      await page.goto(`${BASE}/members/events/${ev.slug}`, { waitUntil: 'networkidle' });
      const main = await page.locator('main').last().innerText();
      ok(main.includes('Past event') && main.includes('5 Started Lane, Anytown AB1 2CD'), `QA1-09 ${label}: Past event, and the booking keeps the address`, main.slice(0, 400));
      eq(await page.getByRole('link', { name: /Add to calendar|Google Calendar/ }).filter({ visible: true }).count(), 0, `  ${label}: no Add to calendar`);
      eq(await page.getByRole('button', { name: 'Cancel booking' }).filter({ visible: true }).count(), 0, `  ${label}: no Cancel booking`);
      if (opts.width < 768) ok((await page.locator('.ea-bar').innerText()).includes('Past event'), `  ${label}: the bar says Past event`);
      await ctx.close();
    }
  }

  // ================================================================ QA1-10 members 404 with a real 404
  {
    const m = await makeMember('nf');
    const s = await memberSession(m.email);
    const ev = await makeEvent('nf', { price: 0 });
    eq((await getPage('/members/no-such-page', s)).status, 404, 'QA1-10 a members address with no page: HTTP 404');
    eq((await getPage('/members/events/no-such-event-f2', s)).status, 404, 'QA1-10 an event that does not exist: HTTP 404');
    eq((await getPage('/members/messages', s)).status, 404, 'QA1-10 a page behind a flag that is off (Messages): HTTP 404');
    const nf = { text: await (await fetch(`${BASE}/members/no-such-page`, { headers: { cookie: cookieFor(s) } })).text() };
    ok(nf.text.includes('Not on the') && nf.text.includes('We can’t find that page. It may have moved.'), '  with "Not on the list." in the members shell');
    eq((await getPage(`/members/events/${ev.slug}`, s)).status, 200, '  a real event: 200');
    eq((await getPage('/members/events', s)).status, 200, '  Events: 200');
    eq((await getPage('/members/you', s)).status, 200, '  You: 200');
    eq((await getPage('/no-such-page')).status, 404, '  the public 404 too');
    eq((await getPage('/test-error')).status, 500, '  the public error page answers 500');
  }

  // ================================================================ QA1-11 no "Something went wrong"
  {
    const offenders = [];
    const scan = (dir) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(rel);
        else if (/\.(tsx?|mjs)$/.test(entry.name) && /Something went wrong/i.test(fs.readFileSync(path.join(ROOT, rel), 'utf8'))) offenders.push(rel);
      }
    };
    for (const dir of ['app/members', 'components/members', 'app/member-login', 'lib/members', 'lib/emails']) scan(dir);
    eq(offenders, [], 'QA1-11 no "Something went wrong" in the members area, Log in or the emails (source)');

    // Auth answers 500 on Log in: the designed network words.
    for (const app of [false, true]) {
      const { ctx, page } = await open({ app });
      await page.route(`${SUPA}/auth/v1/otp**`, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":500,"error_code":"unexpected_failure","msg":"boom"}' }));
      await page.goto(`${BASE}/member-login`, { waitUntil: 'networkidle' });
      await page.getByLabel(/email/i).first().fill('f2.nobody@example.com');
      await page.getByRole('button', { name: /send login code/i }).first().click();
      await page.getByText('We couldn’t reach Club Yuppie. Check your connection and try again.').filter({ visible: true }).first().waitFor({ timeout: 15000 });
      ok(!/Something went wrong/i.test(await bodyText(page)), `QA1-11 Log in (${app ? 'app' : 'web'}) with Auth failing: "We couldn’t reach Club Yuppie."`);
      await ctx.close();
    }
  }

  // ================================================================ the price changed (fixer 1) in the message strip
  {
    const m = await makeMember('price');
    const ev = await makeEvent('price', { price: 1800 });
    const { ctx, page } = await open({ email: m.email });
    await page.goto(`${BASE}/members/events/${ev.slug}`, { waitUntil: 'networkidle' });
    exec(`update events set price_pence = 2000 where id = ${q(ev.id)}`);
    await visible(page, 'button', 'Book my spot').click();
    const strip = page.locator('.ea-msg[role="alert"]').first();
    await strip.waitFor({ timeout: 20000 });
    eq((await strip.innerText()).trim(), 'The price has changed to £20. Check it and try again.', 'the price changed: the message strip says so');
    eq(await strip.locator('b').innerText(), 'The price has changed to £20.', '  with the lead-in in bold');
    await waitFor(async () => (await page.locator('.ea-bar').innerText()).includes('£20pp'), '  and the page shows the new price');
    eq((await pisFor(m.id)).length, 0, '  nothing was charged or opened');
    await ctx.close();
  }

  // ================================================================ a payment that could never be booked, refunded at once
  {
    const m = await makeMember('refunded');
    const ev = await makeEvent('refunded', { price: 1600 });
    const s = await memberSession(m.email);
    const r = await action('events.createEventPaymentIntent', [fd({ event_id: ev.id, price_pence: '1600', attempt_id: `f2-${rand()}-d` })], s);
    const pi = r.result.clientSecret.split('_secret')[0];
    exec(`update events set cancelled_at = now() where id = ${q(ev.id)}`); // the club cancels it while the member is at the bank
    await fakePay(pi, 'http://127.0.0.1:9/none');
    const mark = fakesMark();
    const { ctx, page } = await open({ email: m.email });
    await page.goto(`${BASE}/members/events/${ev.slug}?payment_intent=${pi}&payment_intent_client_secret=${r.result.clientSecret}&redirect_status=succeeded`, { waitUntil: 'networkidle' });
    await dialog(page).getByRole('heading', { name: 'We couldn’t book you in.' }).waitFor({ timeout: 20000 });
    const sheet = await dialog(page).innerText();
    ok(sheet.includes('We’ve refunded your £16 in full.') && !sheet.includes('Paid, but not booked yet'), 'refunded at once: "We couldn’t book you in." and the £16 is refunded', sheet);
    ok(fakesSince(mark, 'stripe').some((l) => l.path === '/v1/refunds' && l.method === 'POST' && l.body.payment_intent === pi), '  the refund was made in Stripe');
    await dialog(page).getByRole('button', { name: 'Close' }).click();
    ok((await page.locator('main').last().innerText()).includes('This event is cancelled'), '  after Close the page shows the event as cancelled');
    await ctx.close();
  }
} finally {
  await browser.close();
}
done();
