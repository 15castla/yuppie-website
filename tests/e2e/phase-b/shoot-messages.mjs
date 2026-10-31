// Screenshots of every Messages screen, for looking at next to the design shots (/home/claude/rebrand/v3/shots/msg-*):
//   - the real pages on real data (the inbox's Chats and Updates, a plan chat, a question, chat info, a closed
//     chat, Blocked members), web and app (the app's cookie and User-Agent), at 320, 390, 430, 768, 1024, 1280;
//   - every preview-harness state (fixtures) at the same widths, web and app.
// Phone widths at 2x, wider at 1x, like the design shots. Output: /home/claude/build/shots/messages-b/.
//
//   tests/e2e/phase-b/server.sh start prod 3244   (MEMBERS_PREVIEW=1 is on there, so the harness answers)
//   PHASE_B_BASE=http://localhost:3244 PHASE_B_TAG=bm. node tests/e2e/phase-b/shoot-messages.mjs [real|harness] [--widths 390,1280] [--only msg-thread]
import fs from 'node:fs';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { BASE, action, cookieFor, exec, makeMemberWithPhoto, postPlan, q } from './lib.mjs';

const OUT = '/home/claude/build/shots/messages-b';
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const which = args.find((a) => a === 'real' || a === 'harness') ?? 'both';
const widthArg = args.indexOf('--widths');
const WIDTHS = widthArg >= 0 ? args[widthArg + 1].split(',').map(Number) : [320, 390, 430, 768, 1024, 1280];
const onlyArg = args.indexOf('--only');
const ONLY = onlyArg >= 0 ? args[onlyArg + 1] : null;
const NATIVE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function context(width, mode, session) {
  const phone = width < 768;
  const ctx = await browser.newContext({
    viewport: { width, height: phone ? 844 : 900 },
    deviceScaleFactor: phone ? 2 : 1,
    ...(mode === 'app' ? { userAgent: NATIVE_UA } : {}),
  });
  const cookies = [];
  if (mode === 'app') cookies.push({ name: 'is-native-app', value: '1', url: BASE });
  if (session) {
    for (const kv of cookieFor(session).split('; ')) {
      const i = kv.indexOf('=');
      cookies.push({ name: kv.slice(0, i), value: kv.slice(i + 1), url: BASE });
    }
  }
  if (cookies.length) await ctx.addCookies(cookies);
  return ctx;
}
async function shoot(name, width, mode, session, path, before) {
  const ctx = await context(width, mode, session);
  const p = await ctx.newPage();
  await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts?.ready);
  if (before) await before(p);
  await p.waitForTimeout(250);
  const file = `${OUT}/${name}-${mode}-${width}.png`;
  await p.screenshot({ path: file });
  await ctx.close();
  return file;
}

// ---------------------------------------------------------------- real pages on real data
if (which !== 'harness') {
  const sam = await makeMemberWithPhoto('sam');
  const jas = await makeMemberWithPhoto('jasmin');
  const pri = await makeMemberWithPhoto('priya');
  const tom = await makeMemberWithPhoto('tom');
  const plan = await postPlan(jas, { title: 'Saturday morning class and brunch', places: 4, where: 'The Studio, Market Street', note: 'Class then brunch.' });
  const joined = async (who, id) => (await action('invite.joinOpenInvite', [id], who.session)).result.chatId;
  const chat = await joined(pri, plan);
  await joined(sam, plan);
  const say = (who, text, to = chat) => action('thread.sendMessage', [{ chatId: to, text, clientId: `s-${Math.random().toString(36).slice(2)}` }], who.session);
  await say(jas, 'Welcome both. Meet outside at 09:45, the class starts at 10:00 sharp.');
  await say(pri, 'Lovely. I’m on 07700 900456 if anyone gets lost.');
  await say(sam, 'Brilliant, see you there.');
  await say(jas, 'Brunch is booked for 11:15, I’ll bring the tickets.');
  // A question Sam asks Tom about Tom's plan, answered.
  const padel = await postPlan(tom, { title: 'Padel, then pizza', places: 4, where: 'Northgate Courts' });
  const q1 = await say(sam, 'Is it fine for a beginner?', `ask-${padel}`);
  const qChat = q1.result.chatId;
  await say(tom, 'Totally, we keep it friendly. Rackets are there to borrow.', qChat);
  // A closed chat: a plan that finished.
  const spin = await postPlan(jas, { title: 'Saturday spin', places: 6, where: 'The Spin Room' });
  await joined(sam, spin);
  exec(`update plans set starts_at = now() - interval '26 hours' where id = ${q(spin)}`);
  await action('messages.blockMember', [{ memberId: pri.id, chatId: null }], tom.session); // Tom's Blocked members list
  // Sam has seen the safety note (it shows once); an unread one stays in the inbox.
  await action('thread.markSafetyNoteSeen', [], sam.session);
  await action('thread.markChatRead', [qChat], sam.session);
  await say(tom, 'Bring trainers with a flat sole.', qChat);
  const shots = [
    ['real-inbox', sam, '/members/messages'],
    ['real-updates', jas, '/members/messages', (p) => p.getByRole('tab', { name: /^Updates/ }).click()],
    ['real-thread-plan', sam, `/members/messages/${chat}`],
    ['real-thread-question', sam, `/members/messages/${qChat}`],
    ['real-thread-closed', sam, `/members/messages/${await joinedChat(spin)}`],
    ['real-info', sam, `/members/messages/${chat}`, (p) => p.getByRole('button', { name: 'Chat info' }).click()],
    ['real-info-host', jas, `/members/messages/${chat}`, (p) => p.getByRole('button', { name: 'Chat info' }).click()],
    ['real-safety', pri, `/members/messages/${chat}`],
    ['real-blocked', tom, '/members/you/blocked'],
  ];
  async function joinedChat(planId) {
    const r = await action('messages.getChats', [], sam.session);
    return r.result.find((c) => c.plan.id === planId).id;
  }
  for (const [name, who, path, before] of shots) {
    if (ONLY && !name.startsWith(ONLY)) continue;
    for (const mode of ['web', 'app']) for (const w of WIDTHS) console.log(await shoot(name, w, mode, who.session, path, before));
  }
}

// ---------------------------------------------------------------- the harness: every state from fixtures
if (which !== 'real') {
  const screens = {
    'msg-inbox': ['list', 'empty', 'loading', 'error'],
    'msg-updates': ['list', 'empty', 'loading', 'error'],
    'msg-thread': ['plan', 'question', 'paid', 'walk', 'typing', 'keyboard', 'long', 'limit', 'link', 'number', 'rate', 'sending', 'failed', 'closed', 'cancelled', 'full', 'safety', 'new-question', 'removed', 'menu', 'select'],
    'msg-sheet': ['info', 'info-question', 'info-host', 'pick-member', 'report-message', 'report-member', 'report-photo', 'report-empty', 'report-failed', 'report-sent'],
    'msg-dialog': ['block', 'leave', 'block-failed'],
    'blocked-members': ['list', 'empty', 'unblock'],
  };
  for (const [screen, states] of Object.entries(screens)) {
    if (ONLY && !screen.startsWith(ONLY)) continue;
    for (const state of states) {
      for (const mode of ['web', 'app']) {
        for (const w of WIDTHS) console.log(await shoot(`${screen}-${state}`, w, mode, null, `/dev-preview/${screen}?shell=${mode}&state=${state}`));
      }
    }
  }
}
await browser.close();
