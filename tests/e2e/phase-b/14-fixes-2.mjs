// Stage 2 fix round, fixer 2 (the member pages): one regression check per finding the reviewers raised on the
// screens (/home/claude/build-b/FIX_BRIEF_B.md "Fixer 2"), on a production build with the stage 2 switches on,
// against the local stack, in a browser (sessions as cookies) and through the test hook:
//   QB1-01  "Ask {name}" for a member with no chats opens the new question with its composer, and the first send works
//   QB1-07  a question on a plan the host cancelled: no "This chat closed" line (dated at a start that will not happen);
//           the lock row says the cancel
//   QB1-03  a plan that has started: the page says so and that the plan chat is open (it is), until 24 hours after the
//           start; then "finished" and "closed"; someone not going is not told about a chat they cannot read
//   QB1-06  long unbroken words in a title, a place, a note, a message and a question: no sideways scroll at 320, 390,
//           768 and 1280 on every page that shows them
//   QB1-09  the app with Open Invite hidden: no Messages (pages and actions 404, no icon, no number, no Open Invite band)
//   QB1-11  no hydration error (React #418) on Open Invite and Messages pages while the messages icon has a number
//   QB3-03  the redeem card's photo is the private photo through a signed URL, never avatar_url
//   QB2-06  the photo gate sends the member back to the page they were going to after Continue (members pages only)
//   QB2-07  one photo size rule in the browser and on the server: the shorter side at least 400px, the crop never
//           zooms below it, and each error line is true
//   QB1-10  the post form and the composer count characters as the server does (code points: an emoji is one)
//   photo   "It’s never public." only with MEMBERS_PHOTOS_PRIVATE_DONE=on (run this script with the same value)
//
//   tests/e2e/phase-b/server.sh build && tests/e2e/phase-b/server.sh start prod 3252
//   PHASE_B_BASE=http://localhost:3252 PHASE_B_TAG=bx2. node tests/e2e/phase-b/14-fixes-2.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import {
  BASE, action, cookieFor, done, eq, exec, fileArg, londonFormDate, makeMember, makeMemberWithPhoto, memberSession, ok, page, postPlan, q, setPlanStart,
  sleep, sql1, svc, waitFor,
} from './lib.mjs';

const FIX = '/home/claude/stack/tools/fixtures';
const APP_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';
const NO_FACE = 'window.FaceDetector = class { async detect() { return []; } };';
const planHref = (id) => `${BASE}/members/open-invite/${id}`;
const browser = await chromium.launch();

/** A browser context signed in as `member` (its session as the SSR cookie), on the web or in the app. */
async function as(member, { width = 390, app = false, init = null } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 768 ? 844 : 900 },
    deviceScaleFactor: 1,
    timezoneId: 'Europe/London',
    locale: 'en-GB',
    ...(app ? { userAgent: APP_UA } : {}),
  });
  if (init) await ctx.addInitScript(init);
  const cookies = cookieFor(member.session).split('; ').map((kv) => {
    const i = kv.indexOf('=');
    return { name: kv.slice(0, i), value: kv.slice(i + 1), url: BASE };
  });
  if (app) cookies.push({ name: 'is-native-app', value: '1', url: BASE });
  await ctx.addCookies(cookies);
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push(e.message));
  pg.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return { ctx, pg, errors };
}
async function open(pg, url) {
  await pg.goto(url, { waitUntil: 'networkidle' });
  await pg.locator('main:not([aria-busy="true"])').last().waitFor({ timeout: 30000 }).catch(() => {});
}
const mainText = async (pg) => (await pg.locator('body').innerText()).replace(/\s+/g, ' ');
const visible = (locator) => locator.filter({ visible: true });
async function shows(locator, label) {
  try {
    await visible(locator).first().waitFor({ state: 'visible', timeout: 15000 });
    ok(true, label);
  } catch (err) {
    const shot = path.join(os.tmpdir(), '14-fixes-2-fail.png');
    await locator.page().screenshot({ path: shot, fullPage: true }).catch(() => {});
    ok(false, label, `${String(err).split('\n')[0]} (at ${locator.page().url()}, shot ${shot})`);
  }
}
/** document wider than the window: the page scrolls sideways. */
const sideways = (pg) => pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/** A server action as the app would call it (the native User-Agent and the is-native-app cookie). */
async function appAction(name, args, session) {
  const r = await fetch(`${BASE}/api/test-hooks/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': APP_UA, cookie: `${cookieFor(session)}; is-native-app=1` },
    body: JSON.stringify({ args }),
  });
  return r.json();
}
/** A plain RGB PNG of w x h (no dependency: zlib and its crc32 are Node's own). */
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
const pngFile = (w, h) => ({ name: `photo-${w}x${h}.png`, mimeType: 'image/png', buffer: png(w, h) });
// ==================================================================== QB1-01 the first question, no chats yet
const host1 = await makeMemberWithPhoto('fxhost');
const fresh = await makeMemberWithPhoto('fxfresh');
const plan1 = await postPlan(host1, { title: 'Fx2 ask plan', places: 4 });
eq(sql1(`select count(*)::int n from chat_members where member_id = ${q(fresh.id)}`).n, 0, 'QB1-01: the asker has no chats at all');
let qChat = null;
// 1280 first: the send at 390 makes the question, after which "Ask" opens it rather than a new one
for (const width of [1280, 390]) {
  const { ctx, pg } = await as(fresh, { width });
  await open(pg, planHref(plan1));
  await visible(pg.locator('a', { hasText: /^Ask / })).first().click();
  await pg.waitForURL(/\/members\/messages\/ask-/, { timeout: 15000 });
  await shows(pg.locator('textarea.msg-input'), `QB1-01 ${width}: "Ask Fxhost" opens the new question with its composer`);
  // the first time any chat opens the safety note leads (with the question's intro); after that the empty prompt
  await shows(pg.getByText(/Only you and Fxhost can see this chat\.|Ask Fxhost anything about the plan\./), `QB1-01 ${width}: with the question's intro, or the new question's prompt ("Ask Fxhost anything about the plan.")`);
  eq(await visible(pg.getByRole('heading', { name: 'No chats yet.' })).count(), 0, `QB1-01 ${width}: not "No chats yet." with nowhere to type`);
  ok((await sideways(pg)) <= 0, `QB1-01 ${width}: no sideways scroll`);
  if (width === 390) {
    await pg.locator('textarea.msg-input').fill('Is it beginner friendly?');
    await pg.getByRole('button', { name: 'Send', exact: true }).click();
    await pg.waitForURL((u) => !u.pathname.includes('ask-'), { timeout: 15000 }).catch(() => {});
    qChat = sql1(`select id from chats where plan_id = ${q(plan1)} and kind = 'question' and asker_id = ${q(fresh.id)}`)?.id ?? null;
    ok(qChat && pg.url().endsWith(`/members/messages/${qChat}`), 'QB1-01: the first send makes the question and the address moves to it', pg.url());
    await shows(pg.locator('.msg-b', { hasText: 'Is it beginner friendly?' }), 'QB1-01: the question shows in the thread');
  }
  await ctx.close();
}

// ==================================================================== QB1-07 a cancelled plan's question
eq((await action('plan.cancelOpenInvite', [plan1], host1.session)).result.ok, true, 'QB1-07: the host cancels the plan');
const cancelledThread = (await action('thread.getThread', [qChat], fresh.session)).result;
eq(cancelledThread.chat.status, 'closed', 'QB1-07: the question is closed');
eq(cancelledThread.items.filter((i) => i.kind === 'system' && i.event === 'closed').length, 0, 'QB1-07: no "This chat closed" line in it (it would be dated at the start, in the future)');
ok(cancelledThread.items.every((i) => new Date(i.at ?? i.sentAt).getTime() <= Date.now() + 5000), 'QB1-07: nothing in the thread is dated in the future');
{
  const { ctx, pg } = await as(fresh);
  await open(pg, `${BASE}/members/messages/${qChat}`);
  const text = await mainText(pg);
  ok(text.includes('This chat is closed') && text.includes('Fxhost cancelled this plan.'), 'QB1-07: the lock row gives the cancel as the reason');
  ok(!text.includes('This chat closed.') && !text.includes('Questions close when the invite closes.'), 'QB1-07: and nothing says the invite closed');
  await ctx.close();
}

// ==================================================================== QB1-03 a plan that has started
const host2 = await makeMemberWithPhoto('fxstart');
const going2 = await makeMemberWithPhoto('fxgoing');
const viewer2 = await makeMemberWithPhoto('fxview');
const plan2 = await postPlan(host2, { title: 'Fx2 started plan', places: 4 });
eq((await action('invite.joinOpenInvite', [plan2], going2.session)).result.ok, true, 'QB1-03: a member joins');
const chat2 = sql1(`select id from chats where plan_id = ${q(plan2)} and kind = 'plan'`).id;
setPlanStart(plan2, -60);
const until = /The plan chat is open until \w{3} \d{1,2} \w{3}, \d{2}:\d{2}\./;
for (const width of [390, 1280]) {
  const { ctx, pg } = await as(going2, { width });
  await open(pg, planHref(plan2));
  const text = await mainText(pg);
  ok(text.includes('This plan has started.') && until.test(text), `QB1-03 ${width}: an hour in, the page says it has started and the plan chat is open until 24 hours after`, text.slice(0, 400));
  ok(!text.includes('The plan chat is closed') && !text.includes('Closed. You can still read it.') && !text.includes('This plan has finished.'), `QB1-03 ${width}: never that the chat is closed`);
  const button = width < 768 ? pg.locator('.mk-dock').getByRole('link', { name: /Open chat/ }) : pg.locator('.oi-act').getByRole('link', { name: /Open chat/ });
  await shows(button, `QB1-03 ${width}: the action is "Open chat"${width < 768 ? ' (docked bar, "Started")' : ' (the action card)'}`);
  if (width < 768) ok((await pg.locator('.mk-dock').innerText()).includes('Started'), 'QB1-03: the bar says "Started", not "Finished"');
  await visible(button).first().click();
  await pg.waitForURL(`**/members/messages/${chat2}`, { timeout: 15000 });
  await shows(pg.locator('textarea.msg-input'), `QB1-03 ${width}: and the chat it opens takes messages (open for 24 hours after the start)`);
  await ctx.close();
}
eq((await action('thread.sendMessage', [{ chatId: chat2, text: 'Running five minutes late', clientId: `fx2late${Date.now()}` }], going2.session)).result.ok, true, 'QB1-03: the server agrees: the chat is open an hour in');
{
  const { ctx, pg } = await as(host2);
  await open(pg, planHref(plan2));
  ok(until.test(await mainText(pg)), 'QB1-03: the host is told the same');
  await ctx.close();
}
{
  const { ctx, pg } = await as(viewer2);
  await open(pg, planHref(plan2));
  const text = await mainText(pg);
  ok(text.includes('This plan has started.') && !/plan chat/i.test(text), 'QB1-03: someone not going: "This plan has started.", nothing about a chat they cannot read');
  await ctx.close();
}
setPlanStart(plan2, -25 * 60);
{
  const { ctx, pg } = await as(going2);
  await open(pg, planHref(plan2));
  const text = await mainText(pg);
  ok(text.includes('This plan has finished. The plan chat is closed. You can still read it.'), 'QB1-03: over 24 hours after the start: finished, the plan chat closed');
  ok((await pg.locator('.mk-dock').innerText()).includes('Finished'), 'QB1-03: and the bar says "Finished"');
  await open(pg, `${BASE}/members/messages/${chat2}`);
  eq(await visible(pg.locator('textarea.msg-input')).count(), 0, 'QB1-03: and the chat is read only');
  await ctx.close();
}

// ==================================================================== QB1-06 long unbroken words
const host3 = await makeMemberWithPhoto('fxlong');
const guest3 = await makeMemberWithPhoto('fxlongguest');
const asker3 = await makeMemberWithPhoto('fxlongasker');
const word = (n, c) => c.repeat(n);
const plan3 = await postPlan(host3, {
  title: `Supercalifragilistic${word(30, 'q')}`,
  where: `TheOldBoathouseStepsByTheRiverPath${word(86, 'w')}`,
  note: `Bring a towel. ${word(250, 'n')}`,
  places: 6,
});
await action('invite.joinOpenInvite', [plan3], guest3.session);
const chat3 = sql1(`select id from chats where plan_id = ${q(plan3)} and kind = 'plan'`).id;
await action('thread.sendMessage', [{ chatId: chat3, text: `Hello ${word(300, 'm')}`, clientId: `fx2long${Date.now()}` }], guest3.session);
const q3 = (await action('thread.sendMessage', [{ chatId: `ask-${plan3}`, text: `Question ${word(200, 'k')}`, clientId: `fx2q${Date.now()}` }], asker3.session)).result.chatId;
const longPages = [
  [host3, '/members/open-invite', 'the feed (card)'],
  [host3, `/members/open-invite/${plan3}`, 'the plan page, host (questions)'],
  [guest3, `/members/open-invite/${plan3}`, 'the plan page, going (chat preview)'],
  [asker3, `/members/open-invite/${plan3}`, 'the plan page, not going'],
  [host3, '/members/open-invite/yours', 'Yours, hosting'],
  [guest3, '/members/open-invite/yours', 'Yours, going'],
  [host3, `/members/open-invite/new/done?id=${plan3}`, 'Posted.'],
  [host3, `/members/open-invite/${plan3}/edit`, 'Edit invite (preview)'],
  [host3, '/members/messages', 'the inbox'],
  [guest3, `/members/messages/${chat3}`, 'the plan chat'],
  [host3, `/members/messages/${q3}`, 'the question, host'],
  [asker3, `/members/messages/${q3}`, 'the question, asker'],
  [guest3, '/members/plans', 'Your plans'],
];
for (const width of [320, 390, 768, 1280]) {
  const contexts = new Map();
  for (const [member, url, label] of longPages) {
    if (!contexts.has(member)) contexts.set(member, await as(member, { width }));
    const { pg } = contexts.get(member);
    await open(pg, `${BASE}${url}`);
    const over = await sideways(pg);
    ok(over <= 0, `QB1-06 ${width}: ${label}: no sideways scroll`, `${over}px too wide`);
  }
  // Updates: the update card beside the list (from 1024) previews the plan
  const { pg } = contexts.get(host3);
  await open(pg, `${BASE}/members/messages`);
  await visible(pg.getByRole('tab', { name: /^Updates/ })).first().click();
  await sleep(400);
  ok((await sideways(pg)) <= 0, `QB1-06 ${width}: Updates (and the plan card beside it): no sideways scroll`);
  for (const { ctx } of contexts.values()) await ctx.close();
}

// ==================================================================== QB1-09 the app while Open Invite is hidden there
const appPage = (url, member) => page(url, member.session, { 'user-agent': APP_UA, cookie: `${cookieFor(member.session)}; is-native-app=1` });
eq((await page('/members/messages', guest3.session)).status, 200, 'QB1-09: on the web Messages opens');
eq((await appPage('/members/messages', guest3)).status, 404, 'QB1-09: in the app (Open Invite hidden) the inbox is a 404');
eq((await appPage(`/members/messages/${chat3}`, guest3)).status, 404, 'QB1-09: a chat too');
eq((await appPage(`/members/messages/ask-${plan2}`, guest3)).status, 404, 'QB1-09: and a first question');
eq((await appAction('messages.getChats', [], guest3.session)).notFound, true, 'QB1-09: the app gets no Messages actions (getChats is a 404)');
eq((await appAction('thread.sendMessage', [{ chatId: chat3, text: 'from the app', clientId: `fx2app${Date.now()}` }], guest3.session)).notFound, true, 'QB1-09: nor send');
const webBadge = (await action('shell.getMessagesBadge', [], host3.session)).result;
ok(webBadge > 0, `QB1-09: on the web the icon has a number (${webBadge})`);
eq((await appAction('shell.getMessagesBadge', [], host3.session)).result, 0, 'QB1-09: in the app no number is fetched (0)');
{
  const { ctx, pg } = await as(host3, { app: true });
  await open(pg, `${BASE}/members/events`);
  eq(await visible(pg.locator('[aria-label^="Messages"]')).count(), 0, 'QB1-09: the app’s Events: no messages icon');
  eq(await pg.locator('a[href="/members/open-invite"]').count(), 0, 'QB1-09: and no "See Open Invites" band (the app has no Open Invite yet)');
  await open(pg, `${BASE}/members/messages`);
  const text = await mainText(pg);
  ok(text.includes('Not on the list.') || text.includes('Not on the list'), 'QB1-09: the app’s /members/messages draws "Not on the list."');
  eq(await visible(pg.locator('[aria-label^="Messages"]')).count(), 0, 'QB1-09: with no messages icon on it');
  eq(await visible(pg.locator('a', { hasText: 'Open Invite' })).count(), 0, 'QB1-09: and no back link to Open Invite');
  await ctx.close();
}
{
  const { ctx, pg } = await as(host3);
  await open(pg, `${BASE}/members/events`);
  ok((await pg.locator('a[href="/members/open-invite"]').count()) > 0, 'QB1-09: the web’s Events still has the Open Invite band');
  await ctx.close();
}

// ==================================================================== QB1-11 no hydration error with a number on the icon
for (const width of [390, 1280]) {
  const { ctx, pg, errors } = await as(host3, { width });
  for (const url of ['/members/open-invite', '/members/open-invite/yours', `/members/open-invite/${plan3}`, '/members/messages', `/members/messages/${q3}`]) {
    errors.length = 0;
    await open(pg, `${BASE}${url}`);
    await sleep(1200);
    const hydration = errors.filter((e) => /#418|#423|#425|hydrat/i.test(e));
    eq(hydration, [], `QB1-11 ${width}: ${url}: no hydration error`);
  }
  await open(pg, `${BASE}/members/open-invite`);
  await waitFor(async () => (await visible(pg.locator('[aria-label^="Messages,"]')).count()) > 0, `QB1-11 ${width}: and the live number still arrives on the icon ("Messages, N unread")`);
  await ctx.close();
}

// ==================================================================== QB3-03 the redeem card's photo
const redeemer = await makeMemberWithPhoto('fxredeem');
await svc.from('members').update({ avatar_url: 'https://legacy.example/member-media/avatars/old.jpg' }).eq('id', redeemer.id);
const redeem = (await action('redemption.getRedemptionStatus', [], redeemer.session)).result;
ok(redeem.photo_url?.includes('/object/sign/member-photos/'), 'QB3-03: the redeem card gets the private photo through a signed URL', redeem.photo_url);
ok(!('avatar_url' in redeem) && !JSON.stringify(redeem).includes('legacy.example'), 'QB3-03: never the old public avatar_url');
eq((await fetch(redeem.photo_url)).status, 200, 'QB3-03: the signed URL serves the photo');
const pausedRedeemer = await makeMemberWithPhoto('fxredeempaused');
exec(`update members set membership_status = 'paused', paused_at = now() where id = ${q(pausedRedeemer.id)}`);
const pausedRedeem = (await action('redemption.getRedemptionStatus', [], pausedRedeemer.session)).result;
eq([pausedRedeem.membership_status, pausedRedeem.photo_url], ['paused', null], 'QB3-03: no photo is signed for a membership that is not active (the card shows none)');

// ==================================================================== QB2-06 back to the page after the gate
const noPhoto = await makeMember('fxgate');
noPhoto.session = await memberSession(noPhoto.email);
const gateTarget = (text) => /NEXT_REDIRECT;(?:replace|push);([^;"\\]+);/.exec(text)?.[1] ?? null;
eq(gateTarget((await page('/members/open-invite/yours', noPhoto.session)).text), '/members/photo?next=%2Fmembers%2Fopen-invite%2Fyours', 'QB2-06: the gate carries the page they were going to (?next=)');
eq(gateTarget((await page('/members/open-invite', noPhoto.session)).text), '/members/photo', 'QB2-06: the landing page needs none (Continue goes there anyway)');
eq(gateTarget((await page(`/members/plans?when=past`, noPhoto.session)).text), '/members/photo?next=%2Fmembers%2Fplans%3Fwhen%3Dpast', 'QB2-06: the query comes along');
{
  const { ctx, pg } = await as(noPhoto, { init: NO_FACE });
  await pg.goto(`${BASE}/members/open-invite/yours`);
  await pg.waitForURL('**/members/photo?next=%2Fmembers%2Fopen-invite%2Fyours', { timeout: 20000 });
  await pg.waitForLoadState('networkidle');
  const text = await mainText(pg);
  // photo: the privacy line (MEMBERS_PHOTOS_PRIVATE_DONE is the server's switch; run this script with the same value)
  if (process.env.MEMBERS_PHOTOS_PRIVATE_DONE === 'on') {
    ok(text.includes('Only members who are logged in can see your photo. It’s never public.'), 'photo: with MEMBERS_PHOTOS_PRIVATE_DONE=on the gate says "It’s never public."');
  } else {
    ok(text.includes('Only members who are logged in can see your photo.') && !text.includes('never public'), 'photo: until the old public copies are deleted, the gate does not say "It’s never public."');
  }
  // QB2-07 in the browser: the error lines are true, and the zoom never goes below 400px
  const input = pg.locator('input[type=file]').first();
  await input.setInputFiles(pngFile(600, 300));
  await waitFor(async () => (await mainText(pg)).includes('Too small. Choose a photo at least 400 pixels tall.'), 'QB2-07: 600 x 300: "at least 400 pixels tall" (it is wide enough)');
  await input.setInputFiles(pngFile(300, 600));
  await waitFor(async () => (await mainText(pg)).includes('Too small. Choose a photo at least 400 pixels wide.'), 'QB2-07: 300 x 600: "at least 400 pixels wide" (the design’s line)');
  await input.setInputFiles(`${FIX}/photo-200.jpg`);
  await waitFor(async () => (await mainText(pg)).includes('Too small. Choose a photo at least 400 pixels wide.'), 'QB2-07: 200 x 200: refused in the browser');
  eq(sql1(`select count(*)::int n from member_photos where member_id = ${q(noPhoto.id)}`).n, 0, 'QB2-07: nothing uploaded');
  await input.setInputFiles(pngFile(450, 450));
  await waitFor(async () => (await mainText(pg)).includes('Fit your face in the circle.'), 'QB2-07: 450 x 450: the crop');
  for (let i = 0; i < 25; i += 1) await visible(pg.getByRole('button', { name: 'Zoom in' })).first().click();
  eq(await visible(pg.getByRole('slider', { name: 'Zoom' })).first().inputValue(), '100', 'QB2-07: zoomed in as far as it goes');
  // at zoom 1 the photo's short side fills the circle (80% of the stage); 450px may zoom to 450/400 = 1.125 (90%), never 2.4
  const drawn = await visible(pg.locator('.ph-crop img')).first().evaluate((img) => img.style.getPropertyValue('--w'));
  ok(Math.abs(parseFloat(drawn) - 90) < 0.5, `QB2-07: a 450px photo zooms only until the circle holds 400px of it (drawn ${drawn} of the stage, not 192%)`);
  await visible(pg.getByRole('button', { name: 'Next' })).first().click();
  await visible(pg.getByRole('button', { name: 'Use it anyway' })).first().click();
  // the server refuses a square under 400px (below), so taking this one means the browser saved 400px or more
  await waitFor(async () => (await mainText(pg)).includes('Your photo is on.'), 'QB2-07: the server takes what the browser saved at full zoom (browser and server agree)', 30000);
  // QB2-06: Continue
  await visible(pg.getByRole('link', { name: 'Continue' })).first().click();
  await pg.waitForURL('**/members/open-invite/yours', { timeout: 20000 });
  ok(true, 'QB2-06: Continue goes back to the page the gate stopped them on (Yours)');
  // only a members page on this site comes out of ?next= (a member with a photo is sent straight on)
  for (const [next, expected, label] of [
    ['%2Fmembers%2Fplans', '/members/plans', 'a members page'],
    ['https%3A%2F%2Fevil.example%2Fmembers', '/members/open-invite', 'another site: the landing page instead'],
    ['%2F%2Fevil.example%2Fmembers', '/members/open-invite', '"//host": the landing page instead'],
    ['%2F%5Cevil.example', '/members/open-invite', '"/\\host": the landing page instead'],
    ['%2Fadmin', '/members/open-invite', 'not a members page: the landing page instead'],
    ['%2Fmembers%2Fphoto', '/members/open-invite', 'the gate itself: the landing page instead'],
  ]) {
    await pg.goto(`${BASE}/members/photo?next=${next}`);
    await pg.waitForURL((u) => u.pathname === expected, { timeout: 20000 }).catch(() => {});
    eq(new URL(pg.url()).pathname, expected, `QB2-06: ?next= ${label}`);
  }
  await ctx.close();
}

// ==================================================================== QB2-07 the server's floor
const sizer = await makeMemberWithPhoto('fxsize');
const upload = (file) => action('photo.uploadMyPhoto', [fileArg({ face: 'found' }, { photo: file })], sizer.session).then((r) => r.result);
const asB64 = (name, type, buf) => ({ name, type, base64: buf.toString('base64') });
eq((await upload(asB64('p.jpg', 'image/jpeg', fs.readFileSync(`${FIX}/photo-200.jpg`)))).reason, 'small', 'QB2-07: the server refuses a 200px photo too ("small"; it took anything over 160px)');
const wideOnly = await upload(asB64('p.png', 'image/png', png(600, 300)));
eq([wideOnly.reason, wideOnly.error], ['small', 'Too small. Choose a photo at least 400 pixels tall.'], 'QB2-07: and a 600 x 300 one (the shorter side is under 400), in words that are true for it');
const narrow = await upload(asB64('p.png', 'image/png', png(300, 600)));
eq(narrow.error, 'Too small. Choose a photo at least 400 pixels wide.', 'QB2-07: a 300 x 600 one gets the design’s line');
ok((await upload(asB64('p.png', 'image/png', png(400, 400)))).success, 'QB2-07: a 400px square is taken');

// ==================================================================== QB1-10 characters counted as the server counts them
const emoji = '🎾';
{
  const { ctx, pg } = await as(host3);
  await open(pg, `${BASE}/members/open-invite/new`);
  const title = visible(pg.getByLabel(/^What/)).first();
  await title.fill(emoji.repeat(60));
  eq([...(await title.inputValue())].length, 50, 'QB1-10: the title takes 50 emoji (code points), not 25 (UTF-16 units)');
  ok((await mainText(pg)).includes('50/50'), 'QB1-10: and its counter says 50/50');
  const note = visible(pg.locator('textarea')).first();
  await note.fill(`${emoji.repeat(10)}abc`);
  ok((await mainText(pg)).includes('13/280'), 'QB1-10: the note counts an emoji as one (13/280)');
  await ctx.close();
}
const emojiPlan = await action('invite.postOpenInvite', [{ title: emoji.repeat(50), type: 'Sport', ...londonFormDate(6), where: emoji.repeat(120), places: 4, hostGoing: true, note: emoji.repeat(280), cost: null }], host3.session);
eq(emojiPlan.result.ok, true, 'QB1-10: and the server takes the same 50 / 120 / 280 emoji');
{
  const { ctx, pg } = await as(guest3);
  const chat = sql1(`select id from chats where plan_id = ${q(plan3)} and kind = 'plan'`).id;
  await open(pg, `${BASE}/members/messages/${chat}`);
  const box = pg.locator('textarea.msg-input');
  await box.fill(emoji.repeat(510));
  eq([...(await box.inputValue())].length, 500, 'QB1-10: the composer takes 500 emoji (code points)');
  ok((await mainText(pg)).includes('500/500 Message is at the limit'), 'QB1-10: "500/500 Message is at the limit"');
  await pg.getByRole('button', { name: 'Send', exact: true }).click();
  await waitFor(() => sql1(`select char_length(body)::int n from messages where chat_id = ${q(chat)} and body like ${q(`${emoji}%`)} order by created_at desc limit 1`)?.n === 500, 'QB1-10: and the server stores all 500');
  await box.fill(`${emoji.repeat(455)}`);
  ok((await mainText(pg)).includes('455/500'), 'QB1-10: the counter counts them as one each (455/500)');
  await ctx.close();
}

// tidy: the long and started plans out of everyone's feed
exec(`update plans set status = 'cancelled', cancelled_at = now() where id in (${[plan3, emojiPlan.result.id].map(q).join(',')}) and status = 'scheduled'`);
await browser.close();
done();
