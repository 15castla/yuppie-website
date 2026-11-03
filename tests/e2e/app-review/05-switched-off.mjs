// The review switches off (REVIEW_LOGIN_EMAIL and REVIEW_LOGIN_CODE unset, as everywhere but Production during a
// review): the review address is an ordinary address in the app too, and the fixed code signs nobody in.
// Server: the same build started with both empty, on PHASE_B_BASE (3102).
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { BASE, done, ok } from '../phase-b/lib.mjs';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA });
await ctx.addCookies([{ name: 'is-native-app', value: '1', domain: new URL(BASE).hostname, path: '/' }]);
const pg = await ctx.newPage();
await pg.goto(`${BASE}/member-login`, { waitUntil: 'networkidle' });
await pg.getByLabel('Email address').fill('appreview@example.com');
await pg.getByRole('button', { name: 'Send login code' }).click();
await pg.getByLabel('6-digit code').waitFor({ timeout: 10000 });
await pg.waitForTimeout(600);
const text = await pg.locator('main').innerText();
ok(text.includes('We sent a 6-digit code to appreview@example.com.') && !text.includes('review code'), 'off: the ordinary code step (a real code is sent)');
await pg.getByLabel('6-digit code').fill('424242');
await pg.getByRole('button', { name: 'Verify code' }).click();
await pg.waitForTimeout(3000);
ok(!new URL(pg.url()).pathname.startsWith('/members'), 'off: the fixed code signs nobody in');
await browser.close();
done();
