// Stage 2 fix round, fixer 2: screenshots of every screen the fixes changed, at 320, 390, 768 and 1280, on the web
// and in the app (where the app has the screen: Open Invite and Messages stay hidden there in stage 2), for a look
// next to the designs. Prints how far each page scrolls sideways (0 is right). Shots go to the folder given
// (default /tmp/fix2-shots).
//   PHASE_B_BASE=http://localhost:3252 PHASE_B_TAG=bx2. node tests/e2e/phase-b/shoot-fixes-2.mjs [folder]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { BASE, action, cookieFor, makeMember, makeMemberWithPhoto, memberSession, postPlan, q, setPlanStart, sleep, sql1, svc } from './lib.mjs';

const OUT = process.argv[2] ?? '/tmp/fix2-shots';
fs.mkdirSync(OUT, { recursive: true });
const APP_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';
const NO_FACE = 'window.FaceDetector = class { async detect() { return []; } };';
const WIDTHS = [320, 390, 768, 1280];
const browser = await chromium.launch();

async function as(member, { width, app = false, init = null }) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, deviceScaleFactor: 1, timezoneId: 'Europe/London', locale: 'en-GB', ...(app ? { userAgent: APP_UA } : {}) });
  if (init) await ctx.addInitScript(init);
  const cookies = cookieFor(member.session).split('; ').map((kv) => ({ name: kv.slice(0, kv.indexOf('=')), value: kv.slice(kv.indexOf('=') + 1), url: BASE }));
  if (app) cookies.push({ name: 'is-native-app', value: '1', url: BASE });
  await ctx.addCookies(cookies);
  return { ctx, pg: await ctx.newPage() };
}
async function open(pg, url) {
  await pg.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
  await pg.locator('main:not([aria-busy="true"])').last().waitFor({ timeout: 30000 }).catch(() => {});
  await sleep(500);
}
const sideways = (pg) => pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const results = [];
async function shoot(pg, name, { full = true } = {}) {
  const over = await sideways(pg);
  results.push([name, over]);
  await pg.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
}
function png(w, h) {
  const row = w * 3 + 1;
  const raw = Buffer.alloc(row * h, 0x9a);
  for (let y = 0; y < h; y += 1) raw[y * row] = 0;
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---- the people and plans
const host = await makeMemberWithPhoto('fxvhost');
const going = await makeMemberWithPhoto('fxvgoing');
const fresh = await makeMemberWithPhoto('fxvfresh');
const started = await postPlan(host, { title: 'Bouldering and a pint', places: 4 });
await action('invite.joinOpenInvite', [started], going.session);
setPlanStart(started, -60);
const startedChat = sql1(`select id from chats where plan_id = ${q(started)} and kind = 'plan'`).id;
await action('thread.sendMessage', [{ chatId: startedChat, text: 'Running five minutes late, save me a spot', clientId: `fxv1${Date.now()}` }], going.session);
const long = await postPlan(host, {
  title: `Supercalifragilistic${'q'.repeat(30)}`,
  where: `TheOldBoathouseStepsByTheRiverPath${'w'.repeat(86)}`,
  note: `Bring a towel. ${'n'.repeat(250)}`,
  places: 6,
});
await action('invite.joinOpenInvite', [long], going.session);
const longChat = sql1(`select id from chats where plan_id = ${q(long)} and kind = 'plan'`).id;
await action('thread.sendMessage', [{ chatId: longChat, text: `Hello ${'m'.repeat(300)}`, clientId: `fxv2${Date.now()}` }], going.session);
const asked = await postPlan(host, { title: 'Padel, then pizza', places: 4 });
const askedQ = (await action('thread.sendMessage', [{ chatId: `ask-${asked}`, text: 'Is it beginner friendly?', clientId: `fxv3${Date.now()}` }], going.session)).result.chatId;
await action('plan.cancelOpenInvite', [asked], host.session);
const club = await postPlan(host, { title: 'Gallery late and a drink', places: 4 });
await action('invite.joinOpenInvite', [club], going.session);
await svc.rpc('club_cancel_plan', { p_plan: club, p_reason: 'host_paused' });
const newQ = await postPlan(host, { title: 'Sunday walk and coffee', places: 4 });

// ---- web, every width
for (const width of WIDTHS) {
  const G = await as(going, { width });
  await open(G.pg, `/members/open-invite/${started}`);
  await shoot(G.pg, `qb1-03-started-plan-web-${width}`);
  await open(G.pg, `/members/messages/${startedChat}`);
  await shoot(G.pg, `qb1-03-started-chat-web-${width}`, { full: false });
  await open(G.pg, `/members/open-invite/${long}`);
  await shoot(G.pg, `qb1-06-long-plan-web-${width}`);
  await open(G.pg, '/members/open-invite');
  await shoot(G.pg, `qb1-06-long-feed-web-${width}`);
  await open(G.pg, `/members/messages/${longChat}`);
  await shoot(G.pg, `qb1-06-long-chat-web-${width}`, { full: false });
  await open(G.pg, `/members/messages/${askedQ}`);
  await shoot(G.pg, `qb1-07-cancelled-question-web-${width}`, { full: false });
  await open(G.pg, `/members/open-invite/${club}`);
  await shoot(G.pg, `qb1-07-club-cancelled-plan-web-${width}`);
  await open(G.pg, '/members/access');
  const perk = G.pg.locator('main button.dc-row').first();
  if (await perk.count()) {
    await perk.click().catch(() => {});
    await sleep(1500);
  }
  await shoot(G.pg, `qb3-03-redeem-web-${width}`, { full: false });
  await G.ctx.close();

  const F = await as(fresh, { width });
  await open(F.pg, `/members/open-invite/${newQ}`);
  await F.pg.locator('a', { hasText: /^Ask / }).filter({ visible: true }).first().click();
  await F.pg.waitForURL(/\/members\/messages\/ask-/, { timeout: 15000 });
  await sleep(1200);
  await shoot(F.pg, `qb1-01-new-question-web-${width}`, { full: false });
  await F.ctx.close();

  const H = await as(host, { width });
  await open(H.pg, `/members/open-invite/${club}`);
  await shoot(H.pg, `qb1-07-club-cancelled-host-web-${width}`);
  await open(H.pg, `/members/open-invite/${long}/edit`);
  await shoot(H.pg, `qb1-06-long-edit-web-${width}`);
  await open(H.pg, '/members/open-invite/new');
  await H.pg.getByLabel(/^What/).filter({ visible: true }).first().fill('🎾'.repeat(60));
  await sleep(300);
  await shoot(H.pg, `qb1-10-post-emoji-web-${width}`, { full: false });
  await H.ctx.close();
}

// ---- the composer at the limit (emoji), 390
{
  const G = await as(going, { width: 390 });
  await open(G.pg, `/members/messages/${longChat}`);
  await G.pg.locator('textarea.msg-input').fill('🎾'.repeat(510));
  await sleep(300);
  await shoot(G.pg, 'qb1-10-composer-500-web-390', { full: false });
  await G.ctx.close();
}

// ---- the photo gate (web and app, every width): the first screen, the "tall" line, the crop at full zoom
for (const app of [false, true]) {
  for (const width of WIDTHS) {
    const m = await makeMember(`fxvgate${width}${app ? 'a' : 'w'}`);
    m.session = await memberSession(m.email);
    const P = await as(m, { width, app, init: NO_FACE });
    await P.pg.goto(`${BASE}/members/plans`);
    await P.pg.waitForURL('**/members/photo**', { timeout: 20000 });
    await P.pg.waitForLoadState('networkidle');
    await sleep(500);
    const tag = `${app ? 'app' : 'web'}-${width}`;
    await shoot(P.pg, `privacy-gate-${tag}`, { full: false });
    const input = P.pg.locator('input[type=file]').first();
    await input.setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: png(600, 300) });
    await sleep(800);
    await shoot(P.pg, `qb2-07-tall-${tag}`, { full: false });
    await input.setInputFiles({ name: 'sq.png', mimeType: 'image/png', buffer: png(450, 450) });
    await sleep(800);
    for (let i = 0; i < 25; i += 1) await P.pg.getByRole('button', { name: 'Zoom in' }).filter({ visible: true }).first().click().catch(() => {});
    await shoot(P.pg, `qb2-07-crop-max-${tag}`, { full: false });
    await P.ctx.close();
  }
}

// ---- the app: Events (no Open Invite band, no messages icon), Messages (404), the redeem card
for (const width of WIDTHS) {
  const A = await as(going, { width, app: true });
  await open(A.pg, '/members/events');
  await shoot(A.pg, `qb1-09-events-app-${width}`);
  await open(A.pg, '/members/messages');
  await shoot(A.pg, `qb1-09-messages-404-app-${width}`, { full: false });
  await open(A.pg, '/members/access');
  const perk = A.pg.locator('main button.dc-row').first();
  if (await perk.count()) {
    await perk.click().catch(() => {});
    await sleep(1500);
  }
  await shoot(A.pg, `qb3-03-redeem-app-${width}`, { full: false });
  await A.ctx.close();
}

{
  const { error } = await svc.from('plans').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).in('id', [long, newQ]).eq('status', 'scheduled');
  if (error) console.error('tidy:', error.message);
}
await browser.close();
for (const [name, over] of results) console.log(over > 0 ? 'WIDE' : 'ok  ', String(over).padStart(4), name);
console.log(`${results.length} shots in ${OUT}; ${results.filter(([, o]) => o > 0).length} scroll sideways`);
