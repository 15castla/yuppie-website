// The Concierge's permission (Apple 5.1.2(i)): without it the tab shows the permission screen naming Anthropic and
// nothing reaches the AI, even from a page left open; Agree saves it and opens the Concierge; Turn off withdraws it;
// Not now goes to the landing page; the member cannot set it themselves. Same server as 01 (Concierge live, the fake AI).
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { BASE, cookieFor, done, eq, exec, makeMemberWithPhoto, ok, q, rand, sql1, REST, ANON } from '../phase-b/lib.mjs';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';
const FAKE = 'https://fake-anthropic.test/__fake/anthropic';
const requests = async () => (await (await fetch(`${FAKE}/requests`)).json()).length;
await fetch(`${FAKE}/mode`, { method: 'POST', body: JSON.stringify({ mode: 'reply' }) });
await fetch(`${FAKE}/clear`, { method: 'POST' });

const M = await makeMemberWithPhoto(`cc${rand()}`, 'active', { full_name: 'Sam Consent', concierge_consent_at: null });
eq(sql1(`select concierge_consent_at from members where id = ${q(M.id)}`).concierge_consent_at, null, 'start: no permission');

const self = await fetch(`${REST}/members?id=eq.${M.id}`, { method: 'PATCH', headers: { apikey: ANON, Authorization: `Bearer ${M.session.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ concierge_consent_at: new Date().toISOString() }) });
ok(self.status >= 400, `security: a member cannot give the permission by writing the column (${self.status})`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, userAgent: UA });
const host = new URL(BASE).hostname;
await ctx.addCookies([...cookieFor(M.session).split('; ').map((part) => { const i = part.indexOf('='); return { name: part.slice(0, i), value: part.slice(i + 1), domain: host, path: '/' }; }),
  { name: 'is-native-app', value: '1', domain: host, path: '/' }]);
const pg = await ctx.newPage();
const errors = [];
pg.on('pageerror', (e) => errors.push(String(e)));
await pg.goto(`${BASE}/members/concierge`, { waitUntil: 'networkidle' });
const text = await pg.locator('main').innerText();
ok(text.includes('Anthropic') && text.includes('Agree and continue') && text.includes('Not now'), 'screen: names Anthropic, with Agree and continue and Not now');
ok(!text.includes('Try asking'), 'screen: no questions to tap before agreeing');
ok(!(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'screen: nothing wider than a 390 screen');
await pg.screenshot({ path: '/home/claude/build-review/concierge-consent-390.png', fullPage: true });
eq(await requests(), 0, 'screen: nothing sent to the AI');
ok(await pg.getByRole('link', { name: 'privacy policy' }).isVisible(), 'screen: the privacy policy link');

// Not now
const notNow = await pg.getByRole('link', { name: 'Not now' }).getAttribute('href');
eq(notNow, '/members/open-invite', 'Not now: goes to the landing page');

// Agree
await pg.getByRole('button', { name: 'Agree and continue' }).click();
await pg.getByText('Try asking').waitFor({ timeout: 15000 });
ok(true, 'Agree: the Concierge opens');
ok(Boolean(sql1(`select concierge_consent_at from members where id = ${q(M.id)}`).concierge_consent_at), 'Agree: the permission is saved');

// ask once, so the book icon (and its sheet) is there
await pg.getByRole('button', { name: /Somewhere for supper on Thursday/ }).first().click();
await pg.getByRole('article', { name: 'Calder & Co' }).waitFor({ timeout: 30000 });
ok((await requests()) > 0, 'with permission: the question goes to the AI');

// permission withdrawn elsewhere while this page is open: nothing more is sent
exec(`update members set concierge_consent_at = null where id = ${q(M.id)}`);
const before = await requests();
await pg.getByLabel('Ask the concierge').fill('Somewhere for Friday?');
await pg.getByRole('button', { name: 'Send' }).click();
await pg.getByText('Not sent.').first().waitFor({ timeout: 20000 });
eq(await requests(), before, 'withdrawn: a question from an open page is not sent to the AI');
exec(`update members set concierge_consent_at = now() where id = ${q(M.id)}`);

// Turn off from the sheet
await pg.reload({ waitUntil: 'networkidle' });
await pg.getByRole('button', { name: /remembers/i }).first().click();
await pg.getByRole('button', { name: 'Turn off the Concierge' }).click();
await pg.getByRole('button', { name: 'Agree and continue' }).waitFor({ timeout: 15000 });
ok(true, 'Turn off: back to the permission screen');
eq(sql1(`select concierge_consent_at from members where id = ${q(M.id)}`).concierge_consent_at, null, 'Turn off: the permission is withdrawn');
ok(sql1(`select count(*)::int n from concierge_messages where member_id = ${q(M.id)}`).n > 0, 'Turn off: the conversation is kept');
eq(errors, [], 'no page errors');
await ctx.close();
await browser.close();
done();
