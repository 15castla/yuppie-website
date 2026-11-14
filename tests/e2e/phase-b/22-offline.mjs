// Offline (Albert, 13 Nov 2026: "I want to improve the app so it still loads when disconnected from wifi like other
// apps do such as instagram. Although, it should still be clear the user is offline"). The members worker
// (public/members-sw.js), the bar and greyed-out actions (components/members/shell/offline.tsx), the wipe on Log in.
// In a real browser (Playwright's Chromium) as the app (its User-Agent), on the Phase B server.
//
//   PHASE_B_BASE=http://localhost:3241 node tests/e2e/phase-b/22-offline.mjs
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { action, cookieFor, done, eq, makeEvent, makeMemberWithPhoto, ok, page as getPage, postPlan, q, sql1, svc } from './lib.mjs';

const BASE = process.env.PHASE_B_BASE || 'http://localhost:3241';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';
const member = await makeMemberWithPhoto('off');
const event = await makeEvent('offline', { price: 1500 });
// A plan chat with a message the member hasn't read (14 Nov 2026: "can't seem to open messages offline").
const host = await makeMemberWithPhoto('offhost');
const planId = await postPlan(host, { title: 'Offline padel' });
const chatId = (await action('invite.joinOpenInvite', [planId], member.session)).result.chatId;
await action('thread.sendMessage', [{ chatId, text: 'See you at the gate', clientId: `c-${Date.now()}` }], host.session);
const readAt = () => sql1(`select last_read_at from chat_members where chat_id = ${q(chatId)} and member_id = ${q(member.id)}`).last_read_at;
const unreadBefore = readAt();
// Messages in the app needs Open Invite in the app (NEXT_PUBLIC_MEMBERS_OPEN_INVITE_APP=on in the build).
const messagesInApp = (await getPage('/members/messages', member.session, { 'user-agent': UA })).status === 200;
if (!messagesInApp) console.log('note: this build has no Messages in the app; the Messages checks are skipped');
// A real-looking discount for the members card (the seed's partners are examples, hidden from members). The list is
// cached for a minute, so wait until it shows.
const PERK = `Offline Test Barbers ${Date.now().toString(36)}`;
const { data: perkRow, error: perkError } = await svc.from('partner_perks').insert({ name: PERK, category: 'Grooming', area: 'Testtown', type: 'discount', headline: '10% off', badge: '10%', display_order: 0 }).select('id').single();
if (perkError) throw perkError;
for (let i = 0; i < 50; i += 1) {
  if ((await getPage('/members/discounts', member.session)).text.includes(PERK)) break;
  await new Promise((r) => setTimeout(r, 2000));
}

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
let saved = await savedPages();
ok(saved.includes('/members/you') && saved.includes(`/members/events/${event.slug}`), 'a page loaded is saved on the phone', saved);
ok(saved.includes('/members/events'), 'and one reached inside the app (saved in the background)', saved);
// every tab is saved ahead, visited or not (14 Nov 2026: Concierge, never opened, went to the offline screen)
for (let i = 0; i < 30 && !(saved.includes('/members/discounts') && saved.includes('/members/access')); i += 1) {
  await page.waitForTimeout(500);
  saved = await savedPages();
}
ok(saved.includes('/members/discounts') && saved.includes('/members/access'), 'the tabs never opened (Discounts, Access) are saved ahead', saved);
if (messagesInApp) {
  for (let i = 0; i < 30 && !saved.includes(`/members/messages/${chatId}`); i += 1) {
    await page.waitForTimeout(500);
    saved = await savedPages();
  }
  ok(saved.includes('/members/messages') && saved.includes(`/members/messages/${chatId}`), 'Messages and its chats are saved ahead', saved);
  eq(readAt(), unreadBefore, 'a chat saved ahead is not marked read (the member hasn’t opened it)');
}
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
await page.getByRole('link', { name: 'Discounts', exact: true }).first().click();
await page.waitForURL(/\/members\/discounts$/, { timeout: 15000 });
ok(true, 'and a tab never opened, saved ahead, opens too');
if (messagesInApp) {
  await page.goto(`${BASE}/members/messages`, { waitUntil: 'load' });
  await page.locator(`a[href="/members/messages/${chatId}"]:visible`).first().click();
  await page.waitForURL(new RegExp(`/members/messages/${chatId}$`), { timeout: 15000 });
  await page.locator(':text("See you at the gate"):visible').first().waitFor({ timeout: 8000 });
  await page.waitForTimeout(1500);
  eq(await page.locator(':text("That didn’t"):visible').count(), 0, 'and it stays (no "That didn’t load": the page’s own files were saved with it)');
  ok(true, 'offline: Messages opens, and its chat, with the messages');
  ok(await page.locator('img[src*="/storage/v1/object/sign/member-photos/"]:visible').first().evaluate((img) => img.complete && img.naturalWidth > 0), 'with the other member’s photo (saved with the chat, though it was never drawn)');
  await page.goto(`${BASE}/members/discounts`, { waitUntil: 'load' });
}
// the members card offline (14 Nov 2026): the last check on the phone, saying when it was
await page.locator('button.dc-row', { hasText: PERK }).first().click();
await page.locator('.dc-checked').waitFor({ timeout: 8000 });
ok(/^Offline · last checked \d\d:\d\d$/.test((await page.locator('.dc-checked').innerText()).trim()), 'the members card opens offline: "Offline · last checked 21:42"', await page.locator('.dc-checked').innerText());
ok((await page.locator('.dc-who-name').innerText()).includes('Off'), 'with the member’s name');
await page.keyboard.press('Escape');
await page.goto(`${BASE}/members/you`, { waitUntil: 'load' });
await bar().waitFor({ state: 'visible' });
await page.waitForTimeout(800);
await page.locator('a[href^="/members/you/help/"]').first().click();
await page.locator('.cy-offbar', { hasText: 'Not saved yet.' }).waitFor({ timeout: 5000 });
eq(new URL(page.url()).pathname, '/members/you', 'a link to a page not on the phone: the app stays where it is, with "Not saved yet. It opens when you’re back online."');
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
eq(await page.evaluate(() => localStorage.getItem('cy-card')), null, 'and the members card’s last check');

// ---------------------------------------------------------------- never the public site or Admin
const scopes = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => new URL(r.scope).pathname));
eq(scopes, ['/members'], 'the worker’s scope is /members only');
const r = await fetch(`${BASE}/members-sw.js`);
eq(r.status, 200, '/members-sw.js is served');

await browser.close();
await svc.from('partner_perks').delete().eq('id', perkRow.id);
done();
