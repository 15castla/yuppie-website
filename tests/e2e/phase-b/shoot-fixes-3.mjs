// Stage 2 fix round 3: screenshots of the screens the fixes changed, for a look next to the designs, at 320, 390,
// 768 and 1280: the app's You and Notifications while Open Invite is hidden there (QR-04), You > Blocked members
// with a photo and with the initial (QR-01), and a question closed by the host's block (QR-05). Prints how far each
// page scrolls sideways (0 is right). Shots go to the folder given (default /tmp/fix3-shots).
//   PHASE_B_BASE=http://localhost:3253 PHASE_B_TAG=bx3. node tests/e2e/phase-b/shoot-fixes-3.mjs [folder]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { BASE, action, cookieFor, makeMemberWithPhoto, postPlan, sleep, sql1, q } from './lib.mjs';

const OUT = process.argv[2] ?? '/tmp/fix3-shots';
fs.mkdirSync(OUT, { recursive: true });
const APP_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';
const WIDTHS = [320, 390, 768, 1280];
const browser = await chromium.launch();
async function as(member, { width, app = false }) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, deviceScaleFactor: 1, timezoneId: 'Europe/London', locale: 'en-GB', ...(app ? { userAgent: APP_UA } : {}) });
  const cookies = cookieFor(member.session).split('; ').map((kv) => ({ name: kv.slice(0, kv.indexOf('=')), value: kv.slice(kv.indexOf('=') + 1), url: BASE }));
  if (app) cookies.push({ name: 'is-native-app', value: '1', url: BASE });
  await ctx.addCookies(cookies);
  return { ctx, pg: await ctx.newPage() };
}
const results = [];
async function shot(member, url, name, opts = {}) {
  for (const width of WIDTHS) {
    const { ctx, pg } = await as(member, { width, ...opts });
    await pg.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
    await pg.locator('main:not([aria-busy="true"])').last().waitFor({ timeout: 30000 }).catch(() => {});
    await sleep(400);
    results.push([`${name}-${width}`, await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)]);
    await pg.screenshot({ path: path.join(OUT, `${name}-${width}.png`), fullPage: true });
    await ctx.close();
  }
}

const host = await makeMemberWithPhoto('shhost', 'active', { full_name: 'Hana Host' });
const guest = await makeMemberWithPhoto('shguest', 'active', { full_name: 'Gus Guest' });
const left = await makeMemberWithPhoto('shleft', 'active', { full_name: 'Lou Left' });
const pid = await postPlan(host, { title: 'Sunday walk', places: 5 });
const chat = sql1(`select id from chats where plan_id = ${q(pid)} and kind = 'plan'`).id;
for (const m of [guest, left]) await action('invite.joinOpenInvite', [pid], m.session);
await action('messages.blockMember', [{ memberId: guest.id, chatId: chat }], host.session);
await action('messages.blockMember', [{ memberId: left.id, chatId: chat }], host.session);
await action('invite.withdrawFromOpenInvite', [pid], left.session);
const asker = await makeMemberWithPhoto('shasker');
const asked = (await action('thread.sendMessage', [{ chatId: `ask-${pid}`, text: 'Is it a long walk?', clientId: crypto.randomUUID() }], asker.session)).result;
await action('messages.blockMember', [{ memberId: asker.id, chatId: asked.chatId }], host.session);

await shot(host, '/members/you/notifications', 'app-notifications', { app: true });
await shot(host, '/members/you', 'app-you', { app: true });
await shot(host, '/members/you/blocked', 'web-blocked');
await shot(asker, `/members/messages/${asked.chatId}`, 'web-question-closed');
await action('plan.cancelOpenInvite', [pid], host.session).catch(() => {});
await browser.close();
for (const [name, over] of results) console.log(`${over === 0 ? 'ok  ' : 'SIDEWAYS'} ${name}: ${over}px`);
console.log(`shots in ${OUT}`);
