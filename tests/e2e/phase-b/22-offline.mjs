// Offline (Albert, 13 Nov 2026: "I want to improve the app so it still loads when disconnected from wifi like other
// apps do such as instagram. Although, it should still be clear the user is offline"). The members worker
// (public/members-sw.js), the bar and greyed-out actions (components/members/shell/offline.tsx), the wipe on Log in.
// In a real browser (Playwright's Chromium) as the app (its User-Agent), on the Phase B server.
//
//   PHASE_B_BASE=http://localhost:3241 node tests/e2e/phase-b/22-offline.mjs
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { cookieFor, done, eq, makeEvent, makeMemberWithPhoto, ok } from './lib.mjs';

const BASE = process.env.PHASE_B_BASE || 'http://localhost:3241';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';
const member = await makeMemberWithPhoto('off');
const event = await makeEvent('offline', { price: 1500 });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, userAgent: UA, isMobile: true, hasTouch: true });
await ctx.addCookies(cookieFor(member.session).split('; ').map((c) => { const i = c.indexOf('='); return { name: c.slice(0, i), value: c.slice(i + 1), url: BASE }; }));
const page = await ctx.newPage();
const bar = () => page.locator('.cy-offbar');
const savedPages = () => page.evaluate(async () => (await caches.has('cy-pages-v1')) ? (await (await caches.open('cy-pages-v1')).keys()).map((r) => new URL(r.url).pathname) : []);

// ---------------------------------------------------------------- online: pages are saved as they are seen
await page.goto(`${BASE}/members/you`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 20000 });
ok(true, 'the members worker takes charge of the members pages');
eq(await bar().getAttribute('data-show'), 'false', 'online: no bar');
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('link', { name: 'Events', exact: true }).first().click();
await page.waitForURL(/\/members\/events$/);
await page.waitForTimeout(2500);
await page.goto(`${BASE}/members/events/${event.slug}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const saved = await savedPages();
ok(saved.includes('/members/you') && saved.includes(`/members/events/${event.slug}`), 'a page loaded is saved on the phone', saved);
ok(saved.includes('/members/events'), 'and one reached inside the app (saved in the background)', saved);
ok(await page.evaluate(async () => (await (await caches.open('cy-images-v1')).keys()).some((r) => r.url.includes('/storage/v1/object/sign/member-photos/'))), 'the member’s photo is kept too');

// ---------------------------------------------------------------- offline: the saved pages open, clearly offline
await ctx.setOffline(true);
await page.reload({ waitUntil: 'load' });
await bar().waitFor({ state: 'visible' });
ok(/^You’re offline\. Showing what you saw at \d\d:\d\d\.$/.test((await bar().innerText()).trim()), 'offline: the event opens, with "You’re offline. Showing what you saw at …"', await bar().innerText());
const book = page.getByRole('button', { name: 'Book my spot' }).first();
eq(await book.evaluate((el) => [el.hasAttribute('data-needs-net'), getComputedStyle(el).pointerEvents]), [true, 'none'], 'Book my spot is greyed out and can’t be tapped');
await page.goto(`${BASE}/members/you`, { waitUntil: 'load' });
ok((await page.locator('h1').first().innerText()).includes('Hey'), 'Profile opens offline');
ok(await page.locator('img[src*="/storage/v1/object/sign/member-photos/"]').first().evaluate((img) => img.complete && img.naturalWidth > 0), 'with the photo');
await page.getByRole('link', { name: 'Events', exact: true }).first().click();
await page.waitForURL(/\/members\/events$/, { timeout: 15000 });
await bar().waitFor({ state: 'visible' });
ok(true, 'tapping a tab offline opens its saved page');
await page.goto(`${BASE}/members/you/help/privacy`, { waitUntil: 'load' });
eq((await page.locator('h1').innerText()).trim(), 'You’re offline', 'a page never opened: "You’re offline", with Go back');
await page.goto(`${BASE}/members`, { waitUntil: 'commit' });
await page.waitForURL(/\/members\/(open-invite|events)$/, { timeout: 10000 }).catch(() => {});
ok(/\/members\/(open-invite|events)$/.test(new URL(page.url()).pathname), '/members offline (how the app opens): the saved landing page', page.url());

// ---------------------------------------------------------------- back online
await page.goto(`${BASE}/members/you`, { waitUntil: 'load' });
await page.locator('.cy-offbar', { hasText: 'You’re offline' }).waitFor();
await ctx.setOffline(false);
await page.locator('.cy-offbar', { hasText: 'Back online' }).waitFor({ timeout: 5000 });
ok(true, 'back online: "Back online"');
await page.locator('.cy-offbar[data-show=false]').waitFor({ state: 'attached', timeout: 8000 });
ok(true, 'and the bar goes');

// ---------------------------------------------------------------- the Log in page wipes the member's pages
await ctx.clearCookies();
await page.goto(`${BASE}/member-login`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const left = await page.evaluate(async () => caches.keys());
ok(!left.some((k) => /^cy-(pages|images|meta)-/.test(k)), 'signed out: Log in wipes the saved pages and photos', left);

// ---------------------------------------------------------------- never the public site or Admin
const scopes = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => new URL(r.scope).pathname));
eq(scopes, ['/members'], 'the worker’s scope is /members only');
const r = await fetch(`${BASE}/members-sw.js`);
eq(r.status, 200, '/members-sw.js is served');

await browser.close();
done();
