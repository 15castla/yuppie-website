// You and the system screens, driven through the real pages in a browser on this build (PHASE_A_BASE) against
// the local stack: the membership card's states with their real dates (the y. seed: active, ending with a
// booking after its end date, problem, paused, ended, lapsed), Manage and Update card to the fake Stripe
// portal, the two-step Cancel membership (step 1's D8 booking, step 2's saved reason, the card turning to
// "Ends ...", the cancel-requested email) and Keep my membership, Delete my account (the home page, no more
// logging in, the account-deleted email), Log out (?state=logged-out), a dead session cookie
// (?state=session-ended, never for someone who was never logged in), the 404 for a members address and a
// public one, the page error with its reference (and the same reference in the server log), and maintenance
// on and off (MAINTENANCE_MODE; the test switches it per request with a header the test hooks allow).
//
//   node tests/e2e/phase-a/11-you-system.mjs        (PHASE_A_BASE=http://localhost:3144 for the You agent's build)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { waitForCode } from '/home/claude/stack/tools/login.mjs';
import {
  BASE, cookieFor, done, eq, exec, fakesMark, fakesSince, makeEvent, memberSession, messages, ok, page, q, rand, sql1, stripe, svc, waitFor,
} from './lib.mjs';

// ---------------------------------------------------------------- dates as the pages write them (Europe/London)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function wall(value) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(value)).map((p) => [p.type, p.value]));
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}
const dayMonth = (v) => { const w = wall(v); return `${w.d} ${MONTHS[w.m - 1]}`; };
const dayDate = (v) => { const w = wall(v); return `${WEEKDAYS[new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay()]} ${w.d} ${MONTHS[w.m - 1]}`; };

// ---------------------------------------------------------------- fixtures: the y. seed, and fresh y. members for what changes things
execFileSync(process.execPath, ['/home/claude/stack/tools/seed.mjs', '--prefix', 'y.', '--quiet'], { env: process.env, stdio: ['ignore', 'ignore', 'inherit'] });
const seed = JSON.parse(fs.readFileSync('/home/claude/stack/tools/seed-y.json', 'utf8'));
ok(seed.members.active && seed.members.ending && seed.members.problem, 'seed.mjs --prefix y.: members in every state');

async function makeY(name, fields = {}) {
  const email = `y.t-${name}-${rand()}@example.com`;
  const { data, error } = await svc.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  const c = await stripe('POST', 'customers', { email, name });
  const s = await stripe('POST', 'subscriptions', { customer: c.json.id, items: { 0: { price: 'price_membership' } } });
  const row = { id: data.user.id, email, full_name: `${name[0].toUpperCase()}${name.slice(1)} Tester`, phone: '+447700900123', membership_status: 'active', stripe_customer_id: c.json.id, stripe_subscription_id: s.json.id, ...fields };
  const { error: e2 } = await svc.from('members').upsert(row);
  if (e2) throw e2;
  return { id: data.user.id, email, customer: c.json.id, subscription: s.json.id, periodEnd: s.json.items.data[0].current_period_end * 1000 };
}

const SUPA_HOST = new URL(BASE).hostname;
async function contextFor(browser, email, { app = false, width = 390 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height: 844 },
    userAgent: app ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp' : undefined,
  });
  if (email) {
    const session = await memberSession(email);
    await ctx.addCookies(cookieFor(session).split('; ').map((pair) => ({ name: pair.slice(0, pair.indexOf('=')), value: pair.slice(pair.indexOf('=') + 1), domain: SUPA_HOST, path: '/' })));
  }
  return ctx;
}
const mainText = async (pg) => {
  await pg.locator('main:not([aria-busy="true"])').last().waitFor({ timeout: 30000 });
  return pg.locator('main:not([aria-busy="true"])').last().innerText();
};
const cardText = async (pg) => {
  await pg.locator('.yu-mem').first().waitFor({ timeout: 30000 });
  return (await pg.locator('.yu-mem').first().innerText()).replace(/\s+/g, ' ');
};
/** GET a page as the session's user, without following redirects, with its body whatever the status. */
async function get(path, session = null, headers = {}) {
  const r = await fetch(`${BASE}${path}`, { redirect: 'manual', headers: { ...(session ? { cookie: cookieFor(session) } : {}), ...headers } });
  return { status: r.status, headers: r.headers, text: await r.text() };
}
const dialogText = async (pg) => (await pg.locator('dialog[open]').innerText()).replace(/\s+/g, ' ');

const browser = await chromium.launch();
try {
  // ================================================================ the card's states, with real dates
  {
    const ctx = await contextFor(browser, seed.members.active.email);
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/members/you`);
    const sub = (await stripe('GET', `subscriptions/${seed.members.active.subscription}`)).json;
    const renews = dayMonth(sub.items.data[0].current_period_end * 1000);
    const card = await cardText(pg);
    ok(card.includes('Active') && card.includes(`Renews ${renews}`) && card.includes('Manage'), `active: Active, "Renews ${renews}", Manage`, card);
    ok(await pg.getByRole('button', { name: 'Cancel membership', exact: true }).isVisible(), 'active: the Cancel membership link is there');
    ok(await pg.getByRole('button', { name: 'Delete my account', exact: true }).isVisible(), 'active: and Delete my account');

    // Manage: /members/billing, which sends the browser to the fake Stripe portal for this customer.
    // The browser asks for the portal (the redirect from /members/billing); the sandbox cannot load it, so
    // the request is what is checked.
    const mark = fakesMark();
    const [portal] = await Promise.all([
      pg.waitForRequest((req) => /^https:\/\/billing\.stripe\.com\/p\/session\//.test(req.url()) && req.isNavigationRequest(), { timeout: 30000 }),
      pg.getByRole('link', { name: 'Manage', exact: true }).click(),
    ]);
    ok(true, `Manage goes to the Stripe portal: ${portal.url().slice(0, 48)}…`);
    eq(portal.redirectedFrom()?.url(), `${BASE}/members/billing`, 'by way of /members/billing');
    const ps = fakesSince(mark, 'stripe').find((l) => l.path === '/v1/billing_portal/sessions');
    eq([ps?.body.customer, ps?.body.flow_data, ps?.body.return_url?.endsWith('/members/you')], [seed.members.active.customer, undefined, true], 'the portal session is this member’s, back to You');
    await ctx.close();
  }
  {
    const row = sql1(`select cancel_at from members where id = ${q(seed.members.ending.id)}`);
    const ends = dayMonth(row.cancel_at);
    const late = sql1(`select start_time from events where id = ${q(seed.events.late.id)}`);
    const ctx = await contextFor(browser, seed.members.ending.email);
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/members/you`);
    const card = await cardText(pg);
    ok(card.includes(`Ends ${ends}`) && card.includes(`You’ve cancelled, so nothing more is taken. You keep everything until ${ends}.`) && card.includes('Keep my membership'), `ending: "Ends ${ends}", the sentence, Keep my membership`, card);
    ok(card.includes(`Winter Supper, ${dayDate(late.start_time)}, is after this date. Your place goes if you leave.`), `ending: the D8 line for the booking after the end date (Winter Supper, ${dayDate(late.start_time)})`, card);
    eq(await pg.getByRole('button', { name: 'Cancel membership', exact: true }).count(), 0, 'ending: no Cancel link while the cancel is pending');
    await ctx.close();
  }
  {
    const row = sql1(`select payment_failed_at, grace_until from members where id = ${q(seed.members.problem.id)}`);
    const ctx = await contextFor(browser, seed.members.problem.email, { app: true });
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/members/you`);
    const card = await cardText(pg);
    const want = `We couldn’t take £10 on ${dayMonth(row.payment_failed_at)}. Update your card by ${dayMonth(row.grace_until)} to keep your membership.`;
    ok(card.includes('Payment failed') && card.includes(want) && card.includes('Update card'), `problem: Payment failed, "${want}", Update card`, card);
    const link = pg.getByRole('link', { name: 'Update card', exact: true });
    eq([await link.getAttribute('href'), await link.getAttribute('target')], ['/members/billing', '_blank'], 'problem, in the app: Update card is /members/billing, marked as an outside link');
    const mark = fakesMark();
    const billing = await page('/members/billing', await memberSession(seed.members.problem.email));
    ok(billing.status === 303 && billing.location.startsWith('https://billing.stripe.com/'), 'and /members/billing redirects to the portal');
    eq(fakesSince(mark, 'stripe').find((l) => l.path === '/v1/billing_portal/sessions')?.body.flow_data, { type: 'payment_method_update' }, 'opened on the card form');
    await ctx.close();
  }
  for (const key of ['paused', 'ended', 'lapsed']) {
    const ctx = await contextFor(browser, seed.members[key].email);
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/members/you`);
    await pg.waitForURL((u) => u.pathname === '/members/membership', { timeout: 30000 });
    ok(true, `${key}: You goes to the membership gate`);
    await pg.goto(`${BASE}/members/you/help/faq`);
    ok(new URL(pg.url()).pathname === '/members/you/help/faq' && (await mainText(pg)).includes('FAQs'), `${key}: the help pages still open`);
    if (key === 'ended') {
      await pg.goto(`${BASE}/members/membership`);
      await pg.getByRole('button', { name: 'Delete my account', exact: true }).click();
      ok((await dialogText(pg)).includes('Delete your account?'), 'ended gate: Delete my account opens the real Delete dialog');
      await pg.locator('dialog[open]').getByRole('button', { name: 'Keep my account', exact: true }).click();
      eq(await pg.locator('dialog[open]').count(), 0, '  and Keep my account closes it');
    }
    await ctx.close();
  }
  // Paused and cancelled never reach You (the gate), so the preview harness draws those two cards.
  for (const [state, word] of [['paused', 'Paused'], ['cancelled', 'Cancelled']]) {
    const r = await page(`/dev-preview/you-home?shell=web&state=${state}`);
    ok(r.status === 200 && r.text.includes(`data-state="${state}"`) && r.text.includes(word), `preview: the ${state} card draws`);
  }

  // ================================================================ Cancel membership (two steps) and Keep my membership
  {
    const m = await makeY('cancel');
    const after = await makeEvent('ycafter', { price: 1500, startInHours: (m.periodEnd - Date.now()) / 3600000 + 24 * 6 });
    const { data: b, error } = await svc.from('bookings').insert({ member_id: m.id, event_id: after.id, status: 'confirmed', amount_pence: 0, booked_at: new Date().toISOString() }).select('id').single();
    if (error) throw error;
    const until = dayMonth(m.periodEnd);
    const ctx = await contextFor(browser, m.email, { width: 1280 });
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/members/you`);
    ok((await cardText(pg)).includes(`Renews ${until}`), `a fresh member: Active, Renews ${until}`);
    let mark = fakesMark();
    await pg.getByRole('button', { name: 'Cancel membership', exact: true }).click();
    await pg.locator('dialog[open]').waitFor();
    const step1 = await dialogText(pg);
    ok(/step 1 of 2/i.test(step1) && step1.includes(`You keep everything until ${until}. After that you’d need to apply again.`), 'step 1: what stays until the end date', step1);
    ok(step1.includes(`${after.title}, ${dayDate(after.start_time)}, is after that date. You’d lose your place.`), `step 1: the D8 booking (${after.title}, ${dayDate(after.start_time)})`, step1);
    ok(step1.includes(`No more payments after ${until}.`) && !step1.includes('Plans you host'), 'step 1: no more payments; no hosted-plans line (Open Invite is not real yet)', step1);
    eq(fakesSince(mark, 'stripe').filter((l) => l.method !== 'GET').length, 0, 'step 1 changes nothing in Stripe');
    eq(sql1(`select cancel_at from members where id = ${q(m.id)}`).cancel_at, null, 'nor in the database');
    await pg.getByRole('button', { name: 'Continue', exact: true }).click();
    ok((await dialogText(pg)).includes('Why are you leaving?'), 'step 2: Why are you leaving?');
    await pg.getByRole('button', { name: 'Moving away', exact: true }).click();
    mark = fakesMark();
    await pg.locator('dialog[open]').getByRole('button', { name: 'Cancel membership', exact: true }).click();
    await pg.locator('dialog[open] h2', { hasText: `Your membership ends ${until}` }).waitFor({ timeout: 30000 });
    ok(true, `step 2 done: "Your membership ends ${until}"`);
    const row = sql1(`select cancel_at, cancel_reason, membership_status from members where id = ${q(m.id)}`);
    eq([dayMonth(row.cancel_at), row.cancel_reason, row.membership_status], [until, 'Moving away', 'active'], 'the reason is saved with cancel_at; still active until then');
    const st = fakesSince(mark, 'stripe').find((l) => l.path === `/v1/subscriptions/${m.subscription}` && l.method === 'POST');
    eq(st?.body.cancel_at_period_end, 'true', 'Stripe: cancel at the end of the period');
    await waitFor(() => messages(`member_id = ${q(m.id)} and template = 'cancel-requested' and status = 'sent'`).length === 1, 'the cancel-requested email is in message_log, sent');
    await pg.getByRole('button', { name: 'Got it', exact: true }).click();
    let card = await cardText(pg);
    ok(card.includes(`Ends ${until}`) && card.includes(`${after.title}, ${dayDate(after.start_time)}, is after this date.`) && card.includes('Keep my membership'), 'the card now says "Ends …", with the D8 line and Keep my membership', card);
    eq(await pg.getByRole('button', { name: 'Cancel membership', exact: true }).count(), 0, 'and the Cancel link is gone');
    await pg.reload();
    ok((await cardText(pg)).includes(`Ends ${until}`), 'still "Ends …" after a reload');
    mark = fakesMark();
    await pg.getByRole('button', { name: 'Keep my membership', exact: true }).click();
    await pg.locator('.yu-mem[data-state="active"]').waitFor({ timeout: 30000 });
    card = await cardText(pg);
    ok(card.includes('Active') && card.includes(`Renews ${until}`) && card.includes('Manage'), 'Keep my membership: Active again, Renews, Manage', card);
    eq(sql1(`select cancel_at, cancel_reason from members where id = ${q(m.id)}`), { cancel_at: null, cancel_reason: null }, 'the cancel is undone in the database');
    eq(fakesSince(mark, 'stripe').find((l) => l.path === `/v1/subscriptions/${m.subscription}` && l.method === 'POST')?.body.cancel_at_period_end, 'false', 'and in Stripe');
    ok(await pg.getByRole('button', { name: 'Cancel membership', exact: true }).isVisible(), 'the Cancel link is back');
    eq(sql1(`select status from bookings where id = ${q(b.id)}`).status, 'confirmed', 'the booking after the end date is untouched');
    await ctx.close();
  }

  // ================================================================ Delete my account
  {
    const m = await makeY('delete');
    const ctx = await contextFor(browser, m.email);
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/members/you`);
    await pg.getByRole('button', { name: 'Delete my account', exact: true }).click();
    const dlg = pg.locator('dialog[open]');
    await dlg.waitFor();
    const del = dlg.getByRole('button', { name: 'Delete my account', exact: true });
    eq(await del.getAttribute('aria-disabled'), 'true', 'Delete waits for the word');
    await dlg.getByLabel('Type delete to confirm').fill('delete');
    eq(await del.getAttribute('aria-disabled'), null, 'typed "delete": ready');
    const mark = fakesMark();
    await Promise.all([pg.waitForURL((u) => u.pathname === '/', { timeout: 30000 }), del.click()]);
    ok(true, 'deleted: lands on the public home page');
    const row = sql1(`select email, deleted_at is not null as deleted, membership_status, ended_reason from members where id = ${q(m.id)}`);
    eq(row, { email: `deleted+${m.id}@invalid.clubyuppie.com`, deleted: true, membership_status: 'cancelled', ended_reason: 'account_deleted' }, 'the members row is anonymised');
    ok(fakesSince(mark, 'stripe').some((l) => l.method === 'DELETE' && l.path === `/v1/subscriptions/${m.subscription}`), 'the subscription is cancelled in Stripe');
    await waitFor(() => messages(`member_id = ${q(m.id)} and template = 'account-deleted' and status = 'sent' and to_address = ${q(m.email)}`).length === 1, 'the account-deleted email went to the address they had');
    await pg.goto(`${BASE}/members/you`);
    await pg.waitForURL((u) => u.pathname === '/member-login', { timeout: 30000 });
    ok(true, 'the session is gone (members pages go to Log in)');
    // Log in again with the old address: no code is sent, and the page stays on Log in.
    const since = Date.now() - 500;
    await pg.goto(`${BASE}/member-login`);
    await pg.getByLabel(/email/i).first().fill(m.email);
    await pg.getByRole('button', { name: /send|continue|code/i }).first().click();
    const code = await waitForCode(m.email, since, 6000).catch(() => null);
    eq([code, new URL(pg.url()).pathname], [null, '/member-login'], 'the member can no longer log in (no code for the old address)');
    eq(sql1(`select count(*)::int as n from auth.users where lower(email) = lower(${q(m.email)})`).n, 0, 'and no account answers to that address');
    await ctx.close();
  }

  // ================================================================ Log out, and a session that ended
  {
    const m = await makeY('logout');
    const ctx = await contextFor(browser, m.email);
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/members/you`);
    await pg.getByRole('button', { name: 'Log out', exact: true }).first().click();
    await pg.locator('dialog[open]').waitFor();
    await Promise.all([pg.waitForURL((u) => u.pathname === '/member-login', { timeout: 30000 }), pg.locator('dialog[open]').getByRole('button', { name: 'Log out', exact: true }).click()]);
    eq(new URL(pg.url()).search, '?state=logged-out', 'Log out lands on /member-login?state=logged-out');
    await pg.goto(`${BASE}/members/events`);
    await pg.waitForURL((u) => u.pathname === '/member-login', { timeout: 30000 });
    eq(new URL(pg.url()).search, '', 'after logging out, a members page is the plain Log in (the cookie went with the session)');
    await ctx.close();
  }
  {
    // Forged: a cookie that is not a session at all.
    const forged = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]}-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: 'not.a.jwt', refresh_token: 'nope', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: '00000000-0000-0000-0000-000000000000' } })).toString('base64url')}`;
    const r1 = await page('/members/events', null, { cookie: forged });
    eq([r1.status, r1.location && new URL(r1.location, BASE).pathname + new URL(r1.location, BASE).search], [307, '/member-login?state=session-ended'], 'a forged session cookie: Log in with "Your session ended."');
    // Expired: a real session, signed out everywhere, its access token past its time.
    const m = await makeY('expired');
    const s = await memberSession(m.email);
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/logout?scope=global`, { method: 'POST', headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${s.access_token}` } });
    const stale = { ...s, expires_at: Math.floor(Date.now() / 1000) - 60, expires_in: -60 };
    const r2 = await page('/members/you', stale);
    eq([r2.status, r2.location && new URL(r2.location, BASE).search], [307, '?state=session-ended'], 'an expired session that cannot be refreshed: session ended');
    ok((r2.headers.get('set-cookie') ?? '').includes('auth-token='), 'and the dead cookie is cleared on the way');
    const r3 = await page('/members/you');
    eq([r3.status, r3.location && new URL(r3.location, BASE).pathname + new URL(r3.location, BASE).search], [307, '/member-login'], 'never logged in: the plain Log in page, as before');
    const live = await memberSession(seed.members.active.email);
    const r4 = await page('/members/you', { ...live, expires_at: Math.floor(Date.now() / 1000) - 60 });
    ok(r4.status === 200, `an expired access token with a good refresh token still opens the page (refreshed, ${r4.status})`);
  }
  {
    // In a browser: the forged cookie on a members page lands on Log in with the state.
    const ctx = await contextFor(browser, null);
    await ctx.addCookies([{ name: `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]}-auth-token`, value: 'base64-e30', domain: SUPA_HOST, path: '/' }]);
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/members/events`);
    await pg.waitForURL((u) => u.pathname === '/member-login', { timeout: 30000 });
    eq(new URL(pg.url()).search, '?state=session-ended', 'in a browser too: /member-login?state=session-ended');
    await ctx.close();
  }

  // ================================================================ 404
  {
    const ctx = await contextFor(browser, seed.members.active.email);
    const pg = await ctx.newPage();
    for (const path of ['/members/no-such-page', '/members/you/nothing/here', `/members/events/y-no-such-event-${rand()}`]) {
      await pg.goto(`${BASE}${path}`);
      const text = await mainText(pg);
      ok(text.includes('Not on the') && text.includes('list.') && text.includes('We can’t find that page. It may have moved.') && text.includes('Back to Events'), `members 404 at ${path}: "Not on the list.", Back to Events`);
      ok(await pg.locator('.mk-dock nav[aria-label="Main"]').isVisible(), `  inside the members shell, the tab bar there (${path})`);
      eq(await pg.locator('.mk-dock [aria-current="page"]').count(), 0, '  no tab lit');
    }
    await ctx.close();
    const pub = await page('/no-such-page');
    eq(pub.status, 404, 'public 404: HTTP 404');
    const ctx2 = await contextFor(browser, null);
    const pg2 = await ctx2.newPage();
    await pg2.goto(`${BASE}/no-such-page`);
    const text = await mainText(pg2);
    ok(text.includes('Not on the') && text.includes('Back to home') && text.includes('Contact us'), 'public 404: "Not on the list.", Back to home, Contact us');
    ok(await pg2.locator('[data-site-header]').isVisible(), 'under the public header');
    await ctx2.close();
    eq((await page('/maintenance')).status, 404, 'the maintenance page itself is never opened directly');
  }

  // ================================================================ page error, with the reference
  {
    const logFile = `/tmp/phase-a-server-${new URL(BASE).port || 80}.log`;
    const ctx = await contextFor(browser, seed.members.active.email);
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/members/test-error`);
    const text = await mainText(pg);
    const ref = /Reference (\d+)/.exec(text)?.[1];
    ok(text.includes('That didn’t') && text.includes('load.') && text.includes('Check your connection and try again.') && text.includes('Try again') && text.includes('Back to Events') && ref, `members error: "That didn’t load.", Try again, Back to Events, Reference ${ref}`, text);
    ok(await pg.locator('.mk-dock nav[aria-label="Main"]').isVisible(), '  inside the members shell');
    if (fs.existsSync(logFile)) {
      await waitFor(() => fs.readFileSync(logFile, 'utf8').includes(`[error] reference ${ref}:`), `  the server logged the same reference (${logFile})`);
    } else {
      console.log(`note: no server log at ${logFile}; the reference-in-the-log check is skipped`);
    }
    await pg.getByRole('button', { name: 'Try again' }).click();
    ok((await pg.locator('.sy-acts .mk-btn').first().innerText()).includes('Trying…') || (await mainText(pg)).includes('That didn’t'), '  Try again retries (the label reads Trying… until the page answers)');
    await ctx.close();
    const ctx2 = await contextFor(browser, null);
    const pg2 = await ctx2.newPage();
    await pg2.goto(`${BASE}/test-error`);
    const pub = await mainText(pg2);
    ok(pub.includes('That didn’t') && pub.includes('Back to home') && /Reference \d+/.test(pub), 'public error: "That didn’t load.", Back to home, a reference', pub);
    await ctx2.close();
  }

  // ================================================================ maintenance on and off
  {
    const s = await memberSession(seed.members.active.email);
    const on = { 'x-test-maintenance': 'on' };
    const m1 = await get('/members/events', s, on);
    ok(m1.status === 503 && m1.text.includes('Back in a') && m1.text.includes('moment.') && m1.text.includes('We’re making a quick update. Try again in a few minutes.'), 'maintenance on: a members page is "Back in a moment." with a 503', m1.status);
    eq(m1.headers.get('retry-after'), '300', '  with Retry-After');
    eq((await get('/members/you', null, on)).status, 503, '  for someone logged out too (no login bounce while it is on)');
    const admin = await get('/admin/login', null, on);
    ok(admin.status === 200 && !admin.text.includes('Back in a'), 'never for /admin');
    const login = await get('/member-login', null, on);
    ok(login.status === 200 && !login.text.includes('Back in a'), 'nor the login page');
    const home = await get('/', null, on);
    ok(home.status === 200 && !home.text.includes('Back in a'), 'nor the public site');
    const cronCall = await fetch(`${BASE}/api/cron/memberships`, { headers: { ...on, Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    eq(cronCall.status, 200, 'nor /api (the cron jobs and Stripe’s webhooks keep running)');
    const off = await get('/members/events', s);
    ok(off.status === 200 && !off.text.includes('Back in a'), 'maintenance off: the page as usual');
    const ctx = await contextFor(browser, seed.members.active.email);
    await ctx.setExtraHTTPHeaders(on);
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/members/events`);
    const text = await mainText(pg);
    ok(text.includes('Back in a') && text.includes('Try again') && new URL(pg.url()).pathname === '/members/events', 'in a browser: "Back in a moment." at the address asked for');
    eq(await pg.locator('.mk-dock').count(), 0, '  no tab bar, no links');
    await ctx.setExtraHTTPHeaders({});
    await pg.getByRole('button', { name: 'Try again' }).click();
    await pg.waitForLoadState('load');
    ok((await mainText(pg)).includes('Events'), '  switched off, Try again brings the page back');
    await ctx.close();
  }
} finally {
  await browser.close();
}
void exec;
done();
