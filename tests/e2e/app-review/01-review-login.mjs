// The App Review account (lib/server/review-login.ts, release/review-account.mjs): the release script makes it; in the
// app its address sends no email and takes the fixed code; a wrong code is refused and counted; ten wrong codes lock
// it; on the website the address is an ordinary one; the session it gets is an ordinary member's (the rules gate next).
// Server: /home/claude/build-review/server.sh (REVIEW_LOGIN_EMAIL=appreview@example.com, REVIEW_LOGIN_CODE=424242).
import { execFileSync } from 'node:child_process';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { BASE, done, eq, exec, ok, q, sql1, svc } from '../phase-b/lib.mjs';

const EMAIL = 'appreview@example.com';
const CODE = '424242';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';
const script = (args) => execFileSync('node', ['release/review-account.mjs', ...args], { cwd: '/home/claude/co', env: { ...process.env, REVIEW_LOGIN_EMAIL: EMAIL }, encoding: 'utf8' });

// ---- the release script (a stale local login from before the review mark existed is cleared first)
exec(`delete from review_login_attempts`);
{
  const { data } = await svc.auth.admin.listUsers({ perPage: 1000 });
  const stale = data.users.find((u) => u.email === EMAIL);
  const marked = stale ? sql1(`select is_review_account from members where id = ${q(stale.id)}`)?.is_review_account : null;
  if (stale && !marked) await svc.auth.admin.deleteUser(stale.id);
}
ok(/Dry run|is there/.test(script([])), 'script: a dry run changes nothing');
ok(script(['--apply']).includes('Done: the App Review account'), 'script: --apply adds the account');
const row = sql1(`select m.id, m.full_name, m.membership_status, m.rules_agreed_at, m.concierge_consent_at, m.stripe_subscription_id, p.status photo, n.channel_email, n.channel_text from members m join member_photos p on p.id = m.photo_id join notification_preferences n on n.member_id = m.id where m.email = ${q(EMAIL)}`);
eq([row.full_name, row.membership_status, row.photo, row.channel_email, row.channel_text, row.rules_agreed_at, row.concierge_consent_at, row.stripe_subscription_id],
  ['App Review', 'active', 'approved', false, false, null, null, null], 'script: active, approved photo, notifications off, rules and Concierge not agreed, no Stripe');
eq(sql1(`select is_review_account from members where id = ${q(row.id)}`).is_review_account, true, 'script: marked as the review account');
ok(script(['--apply']).includes('Done'), 'script: --apply again is safe');
const tokens = () => sql1(`select count(*)::int n from auth.one_time_tokens where user_id = ${q(row.id)}`).n;

const browser = await chromium.launch();
async function loginPage(app) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...(app ? { userAgent: UA } : {}) });
  if (app) await ctx.addCookies([{ name: 'is-native-app', value: '1', domain: new URL(BASE).hostname, path: '/' }]);
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/member-login`, { waitUntil: 'networkidle' });
  return { ctx, pg };
}
async function sendEmail(pg, address) {
  await pg.getByLabel('Email address').fill(address);
  await pg.getByRole('button', { name: 'Send login code' }).click();
}
// The login screen draws a message twice (one is the layout's measuring copy), so wait on the page's text.
const waitText = (pg, text) => pg.waitForFunction((t) => document.querySelector('main')?.innerText.includes(t), text, { timeout: 10000 });
async function enterCode(pg, code) {
  await pg.getByLabel('6-digit code').fill(code);
  await pg.getByRole('button', { name: 'Verify code' }).click();
}

// ---- in the app: no email, wrong code, right code
{
  const before = tokens();
  const { ctx, pg } = await loginPage(true);
  await sendEmail(pg, 'AppReview@Example.com ');
  await pg.getByLabel('6-digit code').waitFor({ timeout: 10000 });
  ok(true, 'app: the review address goes to the code step');
  await pg.waitForTimeout(600);
  ok((await pg.locator('main').innerText()).includes('Enter the review code from the App Review notes.'), 'app: the code step says where the code is, not "we sent"');
  eq(tokens(), before, 'app: no login code was made or sent for it');
  await enterCode(pg, '111111');
  await waitText(pg, 'That code isn’t right.');
  ok(true, 'app: a wrong code is refused');
  eq(sql1(`select count(*)::int n from review_login_attempts where ok = false`).n, 1, 'app: the wrong code is counted');
  await pg.getByRole('button', { name: 'Send a new code' }).click();
  eq(await pg.getByLabel('6-digit code').inputValue(), '', 'app: Send a new code just clears the box (there is no email)');
  await enterCode(pg, CODE);
  await pg.waitForURL((u) => u.pathname === '/members/rules', { timeout: 20000 });
  ok(true, 'app: the right code signs in, and the rules gate comes first');
  eq(sql1(`select count(*)::int n from review_login_attempts where ok = true`).n, 1, 'app: the sign-in is logged');
  const cookies = await ctx.cookies();
  ok(cookies.some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token')), 'app: an ordinary session cookie');
  await ctx.close();
}

// ---- on the website the address is ordinary (the code is refused, nothing special happens)
{
  const { ctx, pg } = await loginPage(false);
  await sendEmail(pg, EMAIL);
  await pg.getByLabel('6-digit code').waitFor({ timeout: 10000 });
  await pg.waitForTimeout(600);
  ok((await pg.locator('main').innerText()).includes(`We sent a 6-digit code to ${EMAIL}.`), 'web: the ordinary code step (an emailed code)');
  await enterCode(pg, CODE);
  await pg.waitForTimeout(2500);
  ok(!new URL(pg.url()).pathname.startsWith('/members'), 'web: the fixed code does not sign in on the website');
  await ctx.close();
}

// ---- ten wrong codes lock it, even for the right code
{
  exec(`delete from review_login_attempts; insert into review_login_attempts (ok) select false from generate_series(1, 10)`);
  const { ctx, pg } = await loginPage(true);
  await sendEmail(pg, EMAIL);
  await pg.getByLabel('6-digit code').waitFor({ timeout: 10000 });
  await enterCode(pg, CODE);
  await waitText(pg, 'Too many tries.');
  ok(true, 'lock: after ten wrong codes in an hour, the right code is refused too');
  ok(!new URL(pg.url()).pathname.startsWith('/members'), 'lock: not signed in');
  exec(`update review_login_attempts set at = now() - interval '2 hours'`);
  await enterCode(pg, CODE);
  await pg.waitForURL((u) => u.pathname.startsWith('/members'), { timeout: 20000 });
  ok(true, 'lock: an hour later the right code works again');
  await ctx.close();
}

// ---- only the marked account, never an admin: without the mark, or as an admin, the address is ordinary
for (const [label, before, after] of [
  ['unmarked', `update members set is_review_account = false where id = ${q(row.id)}`, `update members set is_review_account = true where id = ${q(row.id)}`],
  ['an admin', `insert into admin_users (id) values (${q(row.id)}) on conflict do nothing`, `delete from admin_users where id = ${q(row.id)}`],
]) {
  exec(`delete from review_login_attempts; ${before}`);
  const { ctx, pg } = await loginPage(true);
  await sendEmail(pg, EMAIL);
  await pg.getByLabel('6-digit code').waitFor({ timeout: 10000 });
  await pg.waitForTimeout(600);
  ok((await pg.locator('main').innerText()).includes(`We sent a 6-digit code to ${EMAIL}.`), `${label}: the ordinary code step`);
  await enterCode(pg, CODE);
  await pg.waitForTimeout(2500);
  ok(!new URL(pg.url()).pathname.startsWith('/members'), `${label}: the fixed code signs nobody in`);
  eq(sql1(`select count(*)::int n from review_login_attempts`).n, 0, `${label}: no try was even taken`);
  exec(after);
  await ctx.close();
}
await browser.close();

// ---- tries sent all at once cannot slip past the limit (the database takes them one at a time)
exec(`delete from review_login_attempts`);
const takes = await Promise.all(Array.from({ length: 40 }, () => svc.rpc('review_login_take_try')));
eq(takes.filter((t) => !t.error && t.data !== null).length, 10, 'limit: 40 tries at once, exactly 10 taken');
exec(`update review_login_attempts set ok = false, at = now() - interval '2 hours'`);
exec(`insert into review_login_attempts (ok, at) select false, now() - interval '3 hours' from generate_series(1, 20)`);
const day = await svc.rpc('review_login_take_try');
eq(day.data, null, 'limit: thirty not-successful tries in a day stop it too');
exec(`delete from review_login_attempts`);

// ---- the script removes it
ok(script(['--remove']).includes('Would remove'), 'script: --remove alone is a dry run');
ok(script(['--remove', '--apply']).includes('Removed'), 'script: --remove --apply removes it');
eq(sql1(`select count(*)::int n from members where email = ${q(EMAIL)}`).n, 0, 'script: the member row went with the login');
ok(script(['--apply']).includes('Done'), 'script: and it can be added again');
done();
