// Two of Albert's points (9 Nov 2026): an Open Invite opens at once from its card (the plan page is fetched ahead
// while the card is on screen), and the discount or access card swipes away to the right (a short, slow swipe
// springs back). Needs example partners on: the Concierge server (/home/claude/build-concierge/server.sh).
//
//   PHASE_B_BASE=http://localhost:3101 node tests/e2e/phase-b/18-card-swipe-and-plan-prefetch.mjs
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { BASE, cookieFor, done, eq, makeMemberWithPhoto, ok, postPlan, rand } from './lib.mjs';

const r = rand();
const [host, guest] = await Promise.all([makeMemberWithPhoto(`sph${r}`), makeMemberWithPhoto(`spg${r}`)]);
const title = `Speed ${r}`;
const plan = await postPlan(host, { title, places: 4 });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const h = new URL(BASE).hostname;
await ctx.addCookies(cookieFor(guest.session).split('; ').map((p) => { const i = p.indexOf('='); return { name: p.slice(0, i), value: p.slice(i + 1), domain: h, path: '/' }; }));
const pg = await ctx.newPage();
const fetched = [];
pg.on('request', (req) => { if (req.url().includes(`/members/open-invite/${plan}`) && req.headers()['rsc']) fetched.push(req.url()); });

// ---- the plan page, fetched ahead
await pg.goto(`${BASE}/members/open-invite`, { waitUntil: 'networkidle' });
const card = pg.locator('article.oi-card', { has: pg.getByRole('heading', { name: title, exact: true }) });
await card.scrollIntoViewIfNeeded();
await pg.waitForTimeout(1500);
ok(fetched.length > 0, 'the plan page is fetched ahead while its card is on screen');
const before = fetched.length;
const t0 = Date.now();
await card.getByRole('link', { name: title }).click();
await pg.locator('h1', { hasText: title }).first().waitFor();
const ms = Date.now() - t0;
ok(ms < 600, `a tap opens it at once (${ms} ms)`);
eq(fetched.length, before, 'and the tap fetches nothing more');

// ---- the redeem card swipes away
await pg.goto(`${BASE}/members/discounts`, { waitUntil: 'networkidle' });
const swipe = async (dx, steps = 8, wait = 20) => pg.evaluate(async ({ dx, steps, wait }) => {
  const modal = document.querySelector('.dc-modal');
  const at = (x, y) => new Touch({ identifier: 1, target: modal, clientX: x, clientY: y });
  const fire = (type, x, y) => modal.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [at(x, y)], changedTouches: [at(x, y)] }));
  fire('touchstart', 60, 400);
  for (let i = 1; i <= steps; i++) { fire('touchmove', 60 + (dx * i) / steps, 402); await new Promise((r) => setTimeout(r, wait)); }
  fire('touchend', 60 + dx, 402);
}, { dx, steps, wait });
await pg.locator('.mk-row, button').filter({ hasText: /off|%|free/i }).first().click();
await pg.locator('.dc-card').waitFor();
await swipe(60, 6, 60);
await pg.waitForTimeout(400);
eq(await pg.locator('.dc-card').count(), 1, 'a short, slow swipe: the card springs back');
eq(await pg.locator('.dc-card').evaluate((el) => el.style.transform), '', 'to where it was');
await swipe(220);
await pg.waitForTimeout(500);
eq(await pg.locator('.dc-card').count(), 0, 'swiped past a third: the card is put away');

await browser.close();
done();
