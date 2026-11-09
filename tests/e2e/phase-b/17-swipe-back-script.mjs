// The iOS app's swipe back (mobile/ios/App/App/SceneDelegate.swift, SwipeBack, 9 Nov 2026): the script it runs in
// every page tells the app, on each touch start, whether a swipe may start there. Run here in Chromium with a
// stand-in for the app's message handler: blocked on a sideways-scrolling row, a sheet or dialog, and anything that
// handles its own drags (touch-action none or pan-y); free elsewhere. Same server as 10-open-invite.mjs.
//
//   PHASE_B_BASE=http://localhost:3241 node tests/e2e/phase-b/17-swipe-back-script.mjs
import fs from 'node:fs';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { BASE, cookieFor, makeMemberWithPhoto, postPlan } from './lib.mjs';
const swift = fs.readFileSync('/home/claude/co/mobile/ios/App/App/SceneDelegate.swift', 'utf8');
const script = swift.split('private static let touchScript = """')[1].split('"""')[0];
let fails = 0;
const eq2 = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m, JSON.stringify(a));
const ok = (c, m, x = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m} ${x}`); if (!c) fails++; };
const r = Math.random().toString(36).slice(2, 6);
const [host, guest] = await Promise.all([makeMemberWithPhoto(`swh${r}`), makeMemberWithPhoto(`swg${r}`)]);
const plan = await postPlan(host, { title: `Swipe ${r}`, places: 4 });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const h = new URL(BASE).hostname;
await ctx.addCookies(cookieFor(guest.session).split('; ').map((p) => { const i = p.indexOf('='); return { name: p.slice(0, i), value: p.slice(i + 1), domain: h, path: '/' }; }));
await ctx.addInitScript(() => { window.__said = []; window.webkit = { messageHandlers: { yuppieSwipeBack: { postMessage: (v) => window.__said.push(v) } } }; });
await ctx.addInitScript(script);
const pg = await ctx.newPage();
const said = () => pg.evaluate(() => window.__said.at(-1));
const last = async () => (await said())?.no;
const touchAt = async (locator) => { const b = await locator.boundingBox(); await pg.touchscreen.tap(b.x + Math.min(20, b.width / 2), b.y + b.height / 2); await pg.waitForTimeout(100); return last(); };
await pg.goto(`${BASE}/members/open-invite`, { waitUntil: 'networkidle' });
const chips = pg.locator('.mk-chips').first();
const sw = await chips.evaluate((el) => [el.scrollWidth, el.clientWidth]);
ok((await touchAt(chips.locator('button').first())) === (sw[0] > sw[1] + 1), 'chips row: blocked when it scrolls sideways', JSON.stringify(sw));
ok((await touchAt(pg.locator('h1').first())) === false, 'the title: a swipe may start');
// A tab's own page: the tab on its left (9 Nov 2026); the first tab, none.
eq2(await said(), { no: false, tab: true, left: null }, 'Open Invite, the first tab: on a tab, nothing to its left');
await pg.goto(`${BASE}/members/events`, { waitUntil: 'networkidle' });
await touchAt(pg.locator('h1').first());
eq2(await said(), { no: false, tab: true, left: '/members/open-invite' }, 'Events: the tab on its left is Open Invite');
await pg.goto(`${BASE}/members/discounts`, { waitUntil: 'networkidle' });
await touchAt(pg.locator('h1').first());
eq2(await said(), { no: false, tab: true, left: '/members/events' }, 'Discounts (the website has no Concierge tab): Events');
await pg.goto(`${BASE}/members/open-invite`, { waitUntil: 'networkidle' });
await pg.goto(`${BASE}/members/open-invite/${plan}`, { waitUntil: 'networkidle' });
ok((await touchAt(pg.locator('h1').first())) === false, 'plan page: a swipe may start');
eq2(await said(), { no: false, tab: false, left: null }, 'plan page: not a tab, so it goes back');
await pg.locator('.mk-dock').getByRole('button', { name: 'I’m in' }).click();
await pg.getByRole('dialog').waitFor();
ok((await touchAt(pg.getByRole('dialog').locator('h2').first())) === true, 'a sheet open: blocked');
await pg.getByRole('dialog').getByRole('button', { name: 'Not now' }).click();
await pg.waitForTimeout(400);
ok((await touchAt(pg.locator('h1').first())) === false, 'sheet closed: a swipe may start again');
await pg.goto(`${BASE}/members/you/photo`, { waitUntil: 'networkidle' });
await pg.locator('dialog[open]').waitFor();
ok((await touchAt(pg.locator('dialog[open] h2').first())) === true, 'Change photo dialog open: blocked');
await pg.goto(`${BASE}/members`, { waitUntil: 'networkidle' });
await pg.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'touch-action:none;width:200px;height:200px;position:fixed;top:300px;left:50px;background:red;z-index:9'; d.id = 'tn'; document.body.appendChild(d); const e = document.createElement('div'); e.style.cssText = 'touch-action:pan-y;width:200px;height:100px;position:fixed;top:550px;left:50px;background:blue;z-index:9'; e.id = 'py'; document.body.appendChild(e); });
ok((await touchAt(pg.locator('#tn'))) === true, 'touch-action none (the cropper): blocked');
ok((await touchAt(pg.locator('#py'))) === true, 'touch-action pan-y (the zoom slider): blocked');
await browser.close();
console.log(fails ? `FAIL 17-swipe-back-script.mjs: ${fails}` : 'PASS 17-swipe-back-script.mjs');
process.exit(0);
