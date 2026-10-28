// Fixer 2: the member screens this fix round changed, at 320, 390, 768 and 1280 on the web and 320 and 390 in the
// app, for looking at next to the r2a shots. Writes /home/claude/build-a/shots/fix2/<state>-<web|app>-<width>[-n].png.
//   PHASE_A_BASE=http://localhost:3152 node tests/e2e/phase-a/shoot-fix2.mjs [state ...]
// States: past-booked, inc-late, paid-late-done, pnb-reload, price-changed, not-matched, refunded, login-error.
import fs from 'node:fs';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
process.env.PHASE_A_TAG = 'f2.';
const { action, cookieFor, exec, fakePay, fd, insertBooking, makeBooking, makeEvent, makeMember, memberSession, messages, q, rand, stripe, waitFor, BASE, SUPA } = await import('./lib.mjs');

const OUT = '/home/claude/build-a/shots/fix2';
fs.mkdirSync(OUT, { recursive: true });
const NATIVE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';
const host = new URL(BASE).hostname;
const VIEWS = [['web', 320], ['web', 390], ['web', 768], ['web', 1280], ['app', 320], ['app', 390]];
const only = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function open(email, kind, width) {
  const ctx = await browser.newContext({ viewport: { width, height: width >= 768 ? 900 : 844 }, deviceScaleFactor: 1, ...(kind === 'app' ? { userAgent: NATIVE_UA } : {}) });
  if (email) {
    const session = await memberSession(email);
    await ctx.addCookies(cookieFor(session).split('; ').map((p) => ({ name: p.slice(0, p.indexOf('=')), value: p.slice(p.indexOf('=') + 1), domain: host, path: '/' })));
  }
  await ctx.route('https://js.stripe.com/**', () => undefined);
  return { ctx, page: await ctx.newPage() };
}
async function shot(page, name, kind, width, n = '') {
  await page.waitForTimeout(400);
  const file = `${OUT}/${name}-${kind}-${width}${n ? `-${n}` : ''}.png`;
  await page.screenshot({ path: file });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`${file}${over > 0 ? `  OVERFLOW ${over}px` : ''}`);
}
const dialog = (page) => page.getByRole('dialog');
const visible = (page, role, name) => page.getByRole(role, { name }).filter({ visible: true }).first();
async function toCard(page) {
  await page.locator('#your-booking').filter({ visible: true }).first().scrollIntoViewIfNeeded().catch(() => null);
}

const STATES = {
  async 'past-booked'(kind, width) {
    const m = await makeMember(`shpast${width}`);
    const ev = await makeEvent(`shpast${width}`, { price: 1500, startInHours: -1, address: '5 Started Lane, Anytown AB1 2CD' });
    await insertBooking(m, ev);
    const { ctx, page } = await open(m.email, kind, width);
    await page.goto(`${BASE}/members/events/${ev.slug}`, { waitUntil: 'networkidle' });
    await shot(page, 'past-booked', kind, width);
    if (width < 768) {
      await toCard(page);
      await shot(page, 'past-booked', kind, width, 'card');
    }
    await ctx.close();
  },
  async 'inc-late'(kind, width) {
    const m = await makeMember(`shinc${width}`);
    const ev = await makeEvent(`shinc${width}`, { price: 0, startInHours: 20 });
    await makeBooking(m, ev);
    const { ctx, page } = await open(m.email, kind, width);
    await page.goto(`${BASE}/members/events/${ev.slug}`, { waitUntil: 'networkidle' });
    if (width < 768) {
      await toCard(page);
      await shot(page, 'inc-late', kind, width, 'card');
    } else await shot(page, 'inc-late', kind, width, 'card');
    await visible(page, 'button', 'Cancel booking').click();
    await dialog(page).getByRole('heading', { name: 'Cancel your booking?' }).waitFor();
    await shot(page, 'inc-late', kind, width, 'sheet');
    await dialog(page).getByRole('button', { name: 'Cancel my booking' }).click();
    await dialog(page).getByRole('heading', { name: 'Booking cancelled.' }).waitFor({ timeout: 20000 });
    await shot(page, 'inc-late', kind, width, 'done');
    await ctx.close();
  },
  async 'paid-late-done'(kind, width) {
    const m = await makeMember(`shlate${width}`);
    const ev = await makeEvent(`shlate${width}`, { price: 2000, startInHours: 20 });
    await makeBooking(m, ev);
    const { ctx, page } = await open(m.email, kind, width);
    await page.goto(`${BASE}/members/events/${ev.slug}`, { waitUntil: 'networkidle' });
    await visible(page, 'button', 'Cancel booking').click();
    await dialog(page).getByRole('heading', { name: 'Too late to cancel here.' }).waitFor();
    await dialog(page).getByRole('button', { name: 'Cancel without a refund' }).click();
    await dialog(page).getByRole('heading', { name: 'Booking cancelled.' }).waitFor({ timeout: 20000 });
    await shot(page, 'paid-late-done', kind, width);
    await ctx.close();
  },
  async 'pnb-reload'(kind, width) {
    const m = await makeMember(`shpnb${width}`);
    const ev = await makeEvent(`shpnb${width}`, { price: 1800 });
    const s = await memberSession(m.email);
    const r = await action('events.createEventPaymentIntent', [fd({ event_id: ev.id, price_pence: '1800', attempt_id: `shoot-${rand()}-x` })], s);
    const pi = r.result.clientSecret.split('_secret')[0];
    exec(`update events set price_pence = 2000 where id = ${q(ev.id)}`);
    await fakePay(pi);
    await waitFor(() => messages(`dedupe_key = ${q(`admin-alert:paid-not-booked:${pi}`)}`).length === 1, 'alerted');
    const { ctx, page } = await open(m.email, kind, width);
    await page.goto(`${BASE}/members/events/${ev.slug}`, { waitUntil: 'networkidle' });
    await shot(page, 'pnb-reload', kind, width);
    await ctx.close();
  },
  async 'price-changed'(kind, width) {
    const m = await makeMember(`shprice${width}`);
    const ev = await makeEvent(`shprice${width}`, { price: 1800 });
    const { ctx, page } = await open(m.email, kind, width);
    await page.goto(`${BASE}/members/events/${ev.slug}`, { waitUntil: 'networkidle' });
    exec(`update events set price_pence = 2000 where id = ${q(ev.id)}`);
    await visible(page, 'button', 'Book my spot').click();
    await page.locator('[role="alert"]').filter({ hasText: 'The price has changed' }).filter({ visible: true }).first().waitFor({ timeout: 20000 });
    await page.waitForFunction(() => document.body.innerText.includes('£20pp'), null, { timeout: 20000 });
    await shot(page, 'price-changed', kind, width);
    await ctx.close();
  },
  async 'not-matched'(kind, width) {
    const a = await makeMember(`shreta${width}`);
    const o = await makeMember(`shreto${width}`);
    const ev = await makeEvent(`shret${width}`, { price: 1200 });
    const pi = (await stripe('POST', 'payment_intents', { amount: 1200, currency: 'gbp', customer: o.customer, metadata: { member_id: o.id, event_id: ev.id } })).json;
    await fakePay(pi.id, 'http://127.0.0.1:9/none');
    const { ctx, page } = await open(a.email, kind, width);
    await page.goto(`${BASE}/members/events/${ev.slug}?payment_intent=${pi.id}&payment_intent_client_secret=${pi.client_secret}&redirect_status=succeeded`, { waitUntil: 'networkidle' });
    await page.locator('[role="alert"]').filter({ hasText: 'We couldn’t match that payment' }).filter({ visible: true }).first().waitFor({ timeout: 20000 });
    await shot(page, 'not-matched', kind, width);
    await ctx.close();
  },
  async refunded(kind, width) {
    const m = await makeMember(`shref${width}`);
    const ev = await makeEvent(`shref${width}`, { price: 1600 });
    const s = await memberSession(m.email);
    const r = await action('events.createEventPaymentIntent', [fd({ event_id: ev.id, price_pence: '1600', attempt_id: `shoot-${rand()}-y` })], s);
    const pi = r.result.clientSecret.split('_secret')[0];
    exec(`update events set cancelled_at = now() where id = ${q(ev.id)}`);
    await fakePay(pi, 'http://127.0.0.1:9/none');
    const { ctx, page } = await open(m.email, kind, width);
    await page.goto(`${BASE}/members/events/${ev.slug}?payment_intent=${pi}&payment_intent_client_secret=${r.result.clientSecret}&redirect_status=succeeded`, { waitUntil: 'networkidle' });
    await dialog(page).getByRole('heading', { name: 'We couldn’t book you in.' }).waitFor({ timeout: 20000 });
    await shot(page, 'refunded', kind, width);
    await ctx.close();
  },
  async 'login-error'(kind, width) {
    const { ctx, page } = await open(null, kind, width);
    await page.route(`${SUPA}/auth/v1/otp**`, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"code":500,"error_code":"unexpected_failure","msg":"boom"}' }));
    await page.goto(`${BASE}/member-login`, { waitUntil: 'networkidle' });
    await page.getByLabel(/email/i).first().fill('f2.nobody@example.com');
    await page.getByRole('button', { name: /send login code/i }).first().click();
    await page.getByText('We couldn’t reach Club Yuppie.').filter({ visible: true }).first().waitFor({ timeout: 15000 });
    await shot(page, 'login-error', kind, width);
    await ctx.close();
  },
};

try {
  for (const [name, run] of Object.entries(STATES)) {
    if (only.length && !only.includes(name)) continue;
    for (const [kind, width] of VIEWS) {
      if (kind === 'app' && width >= 768) continue;
      await run(kind, width).catch((err) => console.log(`FAILED ${name} ${kind} ${width}: ${err.message.split('\n')[0]}`));
    }
  }
} finally {
  await browser.close();
}
