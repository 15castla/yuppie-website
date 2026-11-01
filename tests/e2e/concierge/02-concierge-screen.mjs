// The real Concierge screen in a browser, as the app sees it (User-Agent marker, is-native-app cookie, the app's
// safe areas): a tile asks the first question, "Looking for places…" while it waits, the reply with its places,
// sources and Open in Maps, the Remembered chip and Undo, persistence across a reload, Not sent and Try again,
// nothing wider than the screen. Same server as 01-concierge.mjs. Screenshots go to /home/claude/build-concierge/shots.
import fs from 'node:fs';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { BASE, cookieFor, done, eq, makeMemberWithPhoto, ok, q, rand, sql1 } from '../phase-b/lib.mjs';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';
const OUT = '/home/claude/build-concierge/shots';
fs.mkdirSync(OUT, { recursive: true });
const mode = (m) => fetch('https://fake-anthropic.test/__fake/anthropic/mode', { method: 'POST', body: JSON.stringify({ mode: m }) });
const M = await makeMemberWithPhoto(`cs${rand()}`, 'active', { full_name: 'Sam Screen' });

const browser = await chromium.launch();
async function open(width) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, userAgent: UA });
  const host = new URL(BASE).hostname;
  await ctx.addCookies([...cookieFor(M.session).split('; ').map((part) => { const i = part.indexOf('='); return { name: part.slice(0, i), value: part.slice(i + 1), domain: host, path: '/' }; }),
    { name: 'is-native-app', value: '1', domain: host, path: '/' }]);
  await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const s = document.createElement('style'); s.textContent = ':root{--native-safe-area-inset-top:59px;--native-safe-area-inset-bottom:34px}'; document.head.appendChild(s);
  }));
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push(String(e)));
  await pg.goto(`${BASE}/members/concierge`, { waitUntil: 'networkidle' });
  return { ctx, pg, errors };
}
const wide = (pg) => pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

await mode('reply');
const { ctx, pg, errors } = await open(390);
ok(await pg.getByText('Try asking').isVisible(), 'first open: Try asking');
await pg.screenshot({ path: `${OUT}/first-open-390.png` });
await pg.getByRole('button', { name: /Somewhere for supper on Thursday/ }).first().click();
await pg.getByText('Looking for places…').waitFor({ timeout: 5000 }).then(() => ok(true, 'waiting: Looking for places…'), () => ok(true, 'waiting: (answered before it could be seen)'));
await pg.getByRole('article', { name: 'Calder & Co' }).waitFor({ timeout: 30000 });
ok(await pg.getByRole('article', { name: 'The Marlow Cellar' }).isVisible(), 'reply: both places as cards');
eq(await pg.getByRole('link', { name: 'Open in Maps, Calder & Co' }).getAttribute('href'), `https://maps.apple.com/?q=${encodeURIComponent('Calder & Co, 14 Mill Street, London N1 1AA')}`, 'reply: Open in Maps');
ok(await pg.locator('.cn-sources').innerText().then((t) => t.includes('calder.example.test') && t.includes('guide.example.test')), 'reply: the sources under the cards');
eq(await pg.locator('.cn-sources a').first().getAttribute('href'), 'https://calder.example.test/', 'reply: a source links to its page');
ok(!(await wide(pg)), '390: nothing wider than the screen');
await pg.screenshot({ path: `${OUT}/reply-390.png` });

await mode('memory');
await pg.getByLabel('Ask the concierge').fill('We like it quiet, and somewhere near Angel.');
await pg.getByRole('button', { name: 'Send' }).click();
await pg.getByText('Remembered: likes quiet places.').waitFor({ timeout: 30000 });
ok(true, 'memory: the Remembered chip');
eq(sql1(`select count(*)::int n from concierge_memory where member_id = ${q(M.id)}`).n, 1, 'memory: saved');
await pg.getByRole('button', { name: 'Undo' }).last().click();
await pg.getByText('Forgotten: likes quiet places.').waitFor({ timeout: 5000 });
await pg.waitForTimeout(800);
eq(sql1(`select count(*)::int n from concierge_memory where member_id = ${q(M.id)}`).n, 0, 'Undo: forgotten on the server too');

await pg.reload({ waitUntil: 'networkidle' });
ok(await pg.getByRole('article', { name: 'Calder & Co' }).first().isVisible(), 'reload: the conversation is still there');
ok(!(await pg.getByText('Try asking').isVisible().catch(() => false)), 'reload: not the first open');

await mode('error');
await pg.getByLabel('Ask the concierge').fill('Somewhere for Friday?');
await pg.getByRole('button', { name: 'Send' }).click();
await pg.getByText('Not sent. No connection.').waitFor({ timeout: 30000 });
ok(true, 'the AI down: Not sent, with Try again');
await mode('reply');
await pg.getByRole('button', { name: 'Try again' }).click();
await pg.waitForFunction(() => document.querySelectorAll('.cn-rec').length >= 6, null, { timeout: 30000 });
ok(!(await pg.getByText('Not sent. No connection.').isVisible().catch(() => false)), 'Try again: answered');
eq(errors, [], 'no errors in the page');
await ctx.close();

const w430 = await open(430);
ok(!(await wide(w430.pg)), '430: nothing wider than the screen');
await w430.pg.screenshot({ path: `${OUT}/thread-430.png` });
await w430.ctx.close();
await browser.close();
done();
