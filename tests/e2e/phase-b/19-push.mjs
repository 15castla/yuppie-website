// Phone notifications (Albert, 11 Nov 2026: "move everything to app notifications"), against a fake Apple push
// service (HTTP/2 over TLS, fake-apns.test in /etc/hosts, our test CA; it checks each request's ES256 provider
// token against the test key's public half). This script starts its own Next server on PHASE_B_BASE's port with
// MEMBERS_PUSH_TESTERS (two testers; MEMBERS_PUSH_LIVE stays off), so it also shows that a member who is not a
// tester keeps the emails exactly as before.
//
//   PHASE_B_BASE=http://localhost:3243 node tests/e2e/phase-b/19-push.mjs     (after tests/e2e/phase-b/server.sh build)
//
// Covers: the Push row and the email row where push is live; saving a device (and refusing a bad token); the push
// to the host when someone joins (headers, provider token, the person named, the link, the thread); a chat message
// (as a group chat: the plan, "Name: words", grouped by chat; in a burst only the first plays a sound; none when
// muted, none from someone blocked); a question to the host (titled with the person); no chat email for a
// tester, the chat email as before for a member who is not; a plan moved and cancelled; plan and club-event
// reminders as pushes; a club event cancelled (the email stays, a push too); a token Apple no longer knows is
// removed; a tester with no phone is logged "no device"; quiet hours deliver silently; signing out removes the phone.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http2 from 'node:http2';
import { execFileSync } from 'node:child_process';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { loginMember } from '/home/claude/stack/tools/login.mjs';
import { BASE, action, adminSession, cookieFor, cronAt, done, emailsTo, eq, exec, fakesMark, logRows, makeBooking, makeEvent, makeMemberWithPhoto, ok, postPlan, q, sql, sql1, waitFor } from './lib.mjs';

const PORT = Number(new URL(BASE).port);
if (PORT === 3241) throw new Error('Run this against its own server port (PHASE_B_BASE=http://localhost:3243): it starts the server itself.');
const CERTS = '/home/claude/stack/certs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN = 60000;

// ---------------------------------------------------------------- the fake Apple push service
const publicKey = crypto.createPublicKey(fs.readFileSync(`${CERTS}/apns-test.pub`));
const got = [];
const gone = new Set();
function validJwt(jwt) {
  const [h, c, s] = (jwt ?? '').split('.');
  if (!h || !c || !s) return false;
  const header = JSON.parse(Buffer.from(h, 'base64url'));
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  if (header.alg !== 'ES256' || header.kid !== 'TESTKEY123' || claims.iss !== 'TEAMID1234') return false;
  return crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
}
const apns = http2.createSecureServer({ key: fs.readFileSync(`${CERTS}/fake-apns.key`), cert: fs.readFileSync(`${CERTS}/fake-apns.crt`) });
apns.on('stream', (stream, headers) => {
  let body = '';
  stream.setEncoding('utf8');
  stream.on('data', (c) => (body += c));
  stream.on('end', () => {
    const token = String(headers[':path']).split('/').pop();
    const valid = validJwt(String(headers.authorization ?? '').replace(/^bearer /, ''));
    got.push({ token, headers, payload: JSON.parse(body || '{}'), valid });
    if (!valid) {
      stream.respond({ ':status': 403 });
      return stream.end(JSON.stringify({ reason: 'InvalidProviderToken' }));
    }
    if (gone.has(token)) {
      stream.respond({ ':status': 410 });
      return stream.end(JSON.stringify({ reason: 'Unregistered' }));
    }
    stream.respond({ ':status': 200, 'apns-id': crypto.randomUUID() });
    stream.end();
  });
});
await new Promise((r) => apns.listen(2197, r));

// ---------------------------------------------------------------- people, then the server with them as testers
const tester = await makeMemberWithPhoto('pt'); // hosts, has a phone
const noPhone = await makeMemberWithPhoto('pu'); // a tester with no phone
const other = await makeMemberWithPhoto('pn'); // not a tester: emails as before
const fourth = await makeMemberWithPhoto('pf'); // not a tester
const ROOT = new URL('../../..', import.meta.url).pathname;
const env = {
  ...process.env,
  MEMBERS_PUSH_TESTERS: `${tester.email.toUpperCase()}, ${noPhone.email}`,
  APNS_ORIGIN: 'https://fake-apns.test:2197',
  APNS_KEY: fs.readFileSync(`${CERTS}/apns-test.p8`, 'utf8').trim().replace(/\n/g, '\\n'),
  APNS_KEY_ID: 'TESTKEY123',
  APNS_TEAM_ID: 'TEAMID1234',
};
const serverSh = `${ROOT}tests/e2e/phase-b/server.sh`;
try {
  execFileSync(serverSh, ['stop', String(PORT)], { stdio: 'ignore' });
} catch {}
execFileSync(serverSh, ['start', 'prod', String(PORT)], { env, stdio: 'inherit' });

const stop = () => {
  try {
    execFileSync(serverSh, ['stop', String(PORT)], { stdio: 'ignore' });
  } catch {}
  apns.close();
};
process.on('exit', stop);

try {
  const quietNow = () => {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    return hour >= 22 || hour < 7;
  };
  const pushesSince = (mark, token) => got.slice(mark).filter((p) => !token || p.token === token);
  const pushLog = (where) => sql(`select template, status, error, member_id, to_address from message_log where channel = 'push' and ${where} order by created_at`);

  // ---------------------------------------------------------------- the switches page
  const mine = (await action('notifications.getNotificationSettings', [], tester.session)).result;
  eq(mine.pushChannel, true, 'a tester: the Push row is there (MEMBERS_PUSH_TESTERS, any case and spaces)');
  eq((await action('notifications.getNotificationSettings', [], other.session)).result.pushChannel, false, 'not a tester: no Push row (MEMBERS_PUSH_LIVE is off)');

  // ---------------------------------------------------------------- a phone
  const phone = crypto.randomBytes(32).toString('hex');
  eq((await action('notifications.registerPushDevice', [phone, 'sandbox'], tester.session)).result, { ok: true }, 'the app hands over its device token');
  eq(sql1(`select member_id, environment, platform from push_devices where token = ${q(phone)}`), { member_id: tester.id, environment: 'sandbox', platform: 'ios' }, 'saved to the member, sandbox (a build from Xcode)');
  eq(sql1(`select push_permission from notification_preferences where member_id = ${q(tester.id)}`).push_permission, 'granted', 'and the permission reads granted');
  eq((await action('notifications.registerPushDevice', ['not-a-token', 'sandbox'], tester.session)).result.ok, false, 'a bad token is refused');
  eq((await action('notifications.registerPushDevice', [phone, 'elsewhere'], tester.session)).result.ok, false, 'so is an unknown environment');
  eq((await action('notifications.pushAskDue', [], tester.session)).result, { ok: true, ask: false }, 'no offer yet: nothing to hear about');

  // ---------------------------------------------------------------- someone joins the tester's plan
  const P = await postPlan(tester, { title: 'Push plan', places: 6 });
  eq((await action('notifications.pushAskDue', [], tester.session)).result.ask, true, 'after posting a plan, the app may offer to turn notifications on');
  eq((await action('notifications.pushAskDue', [], other.session)).result.ask, false, 'never for a member push is not live for');
  let mark = got.length;
  ok((await action('invite.joinOpenInvite', [P], other.session)).result.ok, 'another member joins');
  await waitFor(() => pushesSince(mark).length >= 1, 'a push to the host');
  const joined = got[mark];
  eq(joined.token, phone, 'to the host\'s phone');
  ok(joined.valid, 'with a valid ES256 provider token (key id, team id)');
  eq([joined.headers['apns-topic'], joined.headers['apns-push-type'], joined.headers['apns-priority']], ['com.clubyuppie.app', 'alert', '10'], 'topic (the bundle ID), type alert, priority 10');
  eq(joined.payload.aps.alert, { title: 'Push plan', body: 'Pn is in.' }, 'the plan, and who joined (Albert, 11 Nov: names on notifications)');
  eq([joined.payload.path, joined.payload.aps['thread-id']], [`/members/open-invite/${P}`, `plan:${P}`], 'it opens the plan, grouped by the plan');
  if (quietNow()) eq([joined.payload.aps['interruption-level'], joined.payload.aps.sound], ['passive', undefined], 'quiet hours: delivered silently');
  else eq([joined.payload.aps.sound, joined.payload.aps['interruption-level']], ['default', undefined], 'outside quiet hours: with a sound');
  await sleep(500);
  eq(pushLog(`plan_id = ${q(P)}`).map((r) => [r.template, r.status, r.member_id, r.to_address]), [['push-plan-joined', 'sent', tester.id, '1 device']], 'logged in message_log (channel push)');
  eq(pushesSince(mark + 1).length, 0, 'nobody else: the member who joined hears nothing');

  // ---------------------------------------------------------------- the plan chat
  const chatId = sql1(`select id from chats where plan_id = ${q(P)} and kind = 'plan'`).id;
  await action('thread.markSafetyNoteSeen', [], other.session);
  await action('thread.markSafetyNoteSeen', [], tester.session);
  const send = (who, text) => action('thread.sendMessage', [{ chatId, text, clientId: `c-${Math.random().toString(36).slice(2)}` }], who.session).then((r) => r.result);
  mark = got.length;
  ok((await send(other, 'Hello all')).ok, 'a message');
  await waitFor(() => pushesSince(mark).length >= 1, 'a push for the message');
  const msg = got[mark];
  eq(msg.payload.aps.alert, { title: 'Push plan', body: 'Pn: Hello all' }, 'as a group chat: the plan, then who said what');
  eq([msg.headers['apns-collapse-id'], msg.payload.path, msg.payload.aps['thread-id']], [undefined, `/members/messages/${chatId}`, `chat:${chatId}`], 'every message stays on the phone, grouped by chat, opens the chat');
  if (!quietNow()) eq(msg.payload.aps.sound, 'default', 'the first message: a sound');
  mark = got.length;
  await send(other, 'Second one');
  await send(other, 'Third   one,\non two lines');
  await waitFor(() => pushesSince(mark).length >= 2, 'more messages: a push each');
  eq(pushesSince(mark).map((p) => p.payload.aps.alert.body), ['Pn: Second one', 'Pn: Third one, on two lines'], 'each with its words (on one line)');
  ok(pushesSince(mark).every((p) => p.payload.aps.sound === undefined), 'but quietly: no sound until the host reads the chat');
  await action('thread.markChatRead', [chatId], tester.session);
  await sleep(50);
  mark = got.length;
  await send(other, 'After reading');
  await waitFor(() => pushesSince(mark).length >= 1, 'read the chat, then a new message: a push');
  if (!quietNow()) eq(got[mark].payload.aps.sound, 'default', 'with a sound again');
  mark = got.length;
  await send(other, 'x'.repeat(300));
  await waitFor(() => pushesSince(mark).length >= 1, 'a long message');
  eq(got[mark].payload.aps.alert.body, `Pn: ${'x'.repeat(179)}…`, 'its words cut at 180 characters');
  eq((await action('thread.setChatMuted', [chatId, true], tester.session)).result, { ok: true }, 'the host mutes the chat');
  await action('thread.markChatRead', [chatId], tester.session);
  mark = got.length;
  await send(other, 'While muted');
  await sleep(1500);
  eq(pushesSince(mark).length, 0, 'muted: no push');
  await action('thread.setChatMuted', [chatId, false], tester.session);
  await action('thread.markChatRead', [chatId], tester.session);
  exec(`insert into blocks values (${q(tester.id)}, ${q(other.id)})`);
  mark = got.length;
  await send(other, 'From someone blocked');
  await sleep(1500);
  eq(pushesSince(mark).length, 0, 'from someone they blocked: no push');
  exec(`delete from blocks where blocker_id = ${q(tester.id)} and blocked_id = ${q(other.id)}`);

  // A question to the host: a chat between two, titled with the person.
  await action('thread.markSafetyNoteSeen', [], noPhone.session);
  mark = got.length;
  const asked = await action('thread.sendMessage', [{ chatId: `ask-${P}`, text: 'Is there parking?', clientId: 'q-push' }], noPhone.session).then((r) => r.result);
  ok(asked.ok, 'a member asks the host a question');
  await waitFor(() => pushesSince(mark).length >= 1, 'a push to the host');
  eq(got[mark].payload.aps.alert, { title: 'Pu', subtitle: 'Question about Push plan', body: 'Is there parking?' }, 'titled with the person, about the plan, the question itself');
  eq(got[mark].payload.aps['thread-id'], `chat:${asked.chatId}`, 'grouped as its own chat');

  // Chat emails: none for the tester; a member who is not a tester still gets theirs, 15 minutes on.
  ok((await action('invite.joinOpenInvite', [P], fourth.session)).result.ok, 'a member who is not a tester joins the plan (and its chat)');
  await send(tester, 'From the host');
  await send(other, 'Unread by the host');
  const nudgeMark = fakesMark();
  const cron = await cronAt('reminders', Date.now() + 16 * MIN);
  eq(cron.status, 200, 'the reminders job, 16 minutes on');
  ok(emailsTo(nudgeMark, fourth.email).length === 1, 'the member who is not a tester: the chat email, as before');
  eq(emailsTo(nudgeMark, tester.email).length, 0, 'the tester, with an unread message: no chat email');

  // ---------------------------------------------------------------- a plan the tester is in: moved, then cancelled
  const Q = await postPlan(other, { title: 'Their plan', places: 6 });
  ok((await action('invite.joinOpenInvite', [Q], tester.session)).result.ok, 'the tester joins someone else\'s plan');
  ok((await action('invite.joinOpenInvite', [Q], fourth.session)).result.ok, 'and so does a member who is not a tester');
  const moveTo = new Date(Date.now() + 9 * 86400000);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(moveTo);
  mark = got.length;
  const emailMark = fakesMark();
  ok((await action('plan.editOpenInvite', [Q, { title: 'Their plan', type: 'Sport', date: ymd, time: '20:15', where: 'Somewhere new', places: 6, hostGoing: true, note: 'Meet at the gate.', cost: null }], other.session)).result.ok, 'the host moves it (time and place)');
  await waitFor(() => pushesSince(mark).length >= 1, 'a push to the tester');
  eq(got[mark].payload.aps.alert.title, 'Their plan', 'titled with the plan');
  ok(/^Pn moved the plan to [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} at 20:15, at Somewhere new\.$/.test(got[mark].payload.aps.alert.body), 'the host named, the new time and place', got[mark].payload.aps.alert.body);
  await waitFor(() => logRows(`plan_id = ${q(Q)} and template = 'plan-changed'`).length >= 1, 'the plan-changed email to the member who is not a tester');
  await sleep(1000);
  eq(logRows(`plan_id = ${q(Q)} and template = 'plan-changed'`).map((r) => r.member_id), [fourth.id], 'the email only to them, none to the tester');
  eq(emailsTo(emailMark, tester.email).length, 0, 'the tester got no email');
  mark = got.length;
  await action('plan.cancelOpenInvite', [Q], other.session);
  await waitFor(() => pushesSince(mark).length >= 1, 'cancelled: a push');
  eq(got[mark].payload.aps.alert, { title: 'Their plan', body: 'Pn cancelled the plan.' }, 'the plan, cancelled by the host (named)');
  await waitFor(() => logRows(`plan_id = ${q(Q)} and template = 'plan-cancelled'`).length >= 1, 'the email to the other member');
  await sleep(1000);
  eq(logRows(`plan_id = ${q(Q)} and template = 'plan-cancelled'`).map((r) => r.member_id), [fourth.id], 'the cancelled email only to the member who is not a tester');

  // ---------------------------------------------------------------- reminders, 24 hours before
  const R = await postPlan(other, { title: 'Reminder push plan', places: 6 });
  await action('invite.joinOpenInvite', [R], tester.session);
  exec(`update plans set starts_at = now() + interval '23 hours' where id = ${q(R)}`);
  exec(`update plan_members set joined_at = now() - interval '2 days' where plan_id = ${q(R)}`);
  const event = await makeEvent('pushev', { startInHours: 23 });
  await makeBooking(tester, event, { bookedAgoHours: 48 });
  await makeBooking(fourth, event, { bookedAgoHours: 48 });
  mark = got.length;
  const remMark = fakesMark();
  const rem = await cronAt('reminders', Date.now());
  eq(rem.status, 200, 'the reminders job');
  const reminders = pushesSince(mark);
  const planRem = reminders.find((p) => p.payload.path === `/members/open-invite/${R}`);
  const eventRem = reminders.find((p) => p.payload.path === `/members/events/${event.slug}`);
  ok(planRem && planRem.payload.aps.alert.title === 'Reminder push plan' && /^(Today|Tomorrow) at \d\d:\d\d, at Calder Park\.$/.test(planRem.payload.aps.alert.body), 'the plan reminder, a push: the plan, when and where', planRem?.payload);
  ok(planRem && Number(planRem.headers['apns-expiration']) > Date.now() / 1000, 'it expires at the start (no use after)');
  ok(eventRem && eventRem.payload.aps.alert.title === 'Pushev night' && /^(Today|Tomorrow) at \d\d:\d\d, at pushev Hall\.$/.test(eventRem.payload.aps.alert.body), 'the club-event reminder, a push', eventRem?.payload);
  eq(eventRem?.payload.aps['thread-id'], `event:${event.id}`, 'grouped by the event');
  ok(rem.json.result.pushes >= 1 && rem.json.result.plans.pushes >= 1, 'the job counts them', rem.json.result);
  eq(emailsTo(remMark, tester.email).length, 0, 'no reminder emails to the tester');
  ok(emailsTo(remMark, other.email).some((e) => /Reminder push plan/.test(JSON.stringify(e))), 'the host, not a tester: the plan reminder email as before');
  ok(emailsTo(remMark, fourth.email).some((e) => /Pushev night/.test(JSON.stringify(e))), 'the other member booked: the event reminder email as before');
  mark = got.length;
  await cronAt('reminders', Date.now() + 60000);
  await sleep(500);
  eq(pushesSince(mark).filter((p) => p.token === phone).length, 0, 'run again: nothing twice');

  // ---------------------------------------------------------------- the club cancels the event
  const admin = await adminSession('bf.');
  mark = got.length;
  const cancelMark = fakesMark();
  ok((await action('admin.eventBookings.adminCancelEvent', [event.id, { note: 'closed' }], admin)).result.ok, 'the club cancels the event');
  await waitFor(() => pushesSince(mark).some((p) => p.payload.aps.alert.title === 'Pushev night' && p.payload.aps.alert.body === 'This event has been cancelled.'), 'a push to the tester (a free booking: nothing about a refund)');
  await waitFor(() => emailsTo(cancelMark, tester.email).length >= 1, 'and the event-cancelled email still goes (it is about the booking)');

  // ---------------------------------------------------------------- a token Apple no longer knows
  const old = crypto.randomBytes(32).toString('hex');
  await action('notifications.registerPushDevice', [old, 'production'], tester.session);
  gone.add(old);
  mark = got.length;
  ok((await action('invite.joinOpenInvite', [P], noPhone.session)).result.ok, 'someone else joins the tester\'s plan');
  await waitFor(() => pushesSince(mark).length >= 2, 'a push to both of the tester\'s phones');
  await waitFor(() => !sql1(`select count(*)::int n from push_devices where token = ${q(old)}`).n, 'Apple said Unregistered: that phone is removed');
  eq(sql1(`select count(*)::int n from push_devices where token = ${q(phone)}`).n, 1, 'the good one stays');
  await sleep(500);
  eq(pushLog(`plan_id = ${q(P)} and template = 'push-plan-joined'`).map((r) => [r.status, r.to_address]).at(-1), ['sent', '2 devices'], 'sent (one phone took it)');

  // ---------------------------------------------------------------- a tester with no phone
  const noPhoneMark = fakesMark();
  const S = await postPlan(noPhone, { title: 'No phone plan', places: 6 });
  await action('invite.joinOpenInvite', [S], other.session);
  await waitFor(() => pushLog(`plan_id = ${q(S)}`).length >= 1, 'the push is logged');
  eq(pushLog(`plan_id = ${q(S)}`).map((r) => [r.template, r.status, r.error]), [['push-plan-joined', 'skipped', 'no device']], 'no phone: skipped, "no device"');
  eq(emailsTo(noPhoneMark, noPhone.email).length, 0, 'and no email instead');

  // ---------------------------------------------------------------- in the app (a stand-in for the iPhone's side)
  const APP_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';
  const SHOTS = '/tmp/claude-0/-home-claude/e337cd27-fc4a-515d-836f-5913add7ea16/scratchpad/push-shots';
  fs.mkdirSync(SHOTS, { recursive: true });
  const appToken = crypto.randomBytes(32).toString('hex');
  // What AppDelegate.swift's PushBridge does, in the page: answers "status", "ask" and "openSettings".
  // Its state lasts across pages, as the phone's does (the init script runs again on every page).
  const nativeStub = ({ state, token }) => {
    window.__pushState = window.localStorage.getItem('stub-push-state') || state;
    window.__pushLog = [];
    const reply = (detail) => setTimeout(() => window.dispatchEvent(new CustomEvent('yuppie-push', { detail })), 30);
    window.webkit = { messageHandlers: { yuppiePush: { postMessage: (m) => {
      window.__pushLog.push(m.action);
      if (m.action === 'ask' && window.__pushState === 'not_asked') {
        window.__pushState = 'granted';
        window.localStorage.setItem('stub-push-state', 'granted');
      }
      if (m.action === 'status' || m.action === 'ask') {
        reply({ type: 'status', status: window.__pushState });
        if (window.__pushState === 'granted') reply({ type: 'token', token, environment: 'sandbox' });
      }
    } } } };
  };
  const browser = await chromium.launch();
  const errors = [];
  const appPage = async (email, state) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: APP_UA, deviceScaleFactor: 2 });
    await ctx.addInitScript(nativeStub, { state, token: appToken });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => errors.push(`${pg.url()}: ${e.message}`));
    await loginMember(pg, BASE, email);
    await pg.waitForURL((u) => /^\/members\/[a-z]/.test(u.pathname), { timeout: 20000 });
    return { ctx, pg };
  };
  try {
    // A tester with no phone yet, who has posted a plan: the offer.
    const { ctx: c1, pg: p1 } = await appPage(noPhone.email, 'not_asked');
    const offer = p1.getByRole('dialog', { name: 'Turn on notifications?' });
    await offer.waitFor({ timeout: 15000 });
    ok(true, 'in the app, with something to hear about: "Turn on notifications?"');
    ok((await offer.innerText()).includes('We don’t email these any more.'), 'it says the emails have stopped');
    await p1.screenshot({ path: `${SHOTS}/offer.png` });
    await offer.getByRole('button', { name: 'Turn on' }).click();
    await waitFor(() => sql1(`select count(*)::int n from push_devices where token = ${q(appToken)} and member_id = ${q(noPhone.id)}`).n === 1, 'Turn on: iOS asks, allowed, the phone is saved');
    await offer.waitFor({ state: 'detached', timeout: 10000 });
    ok(true, 'and the sheet goes');
    eq(sql1(`select push_permission from notification_preferences where member_id = ${q(noPhone.id)}`).push_permission, 'granted', 'the permission saved: granted');
    // Settings in the app.
    await p1.goto(`${BASE}/members/you/notifications`);
    const pushSwitch = p1.getByRole('switch', { name: 'Push' });
    await pushSwitch.waitFor({ timeout: 15000 });
    eq(await pushSwitch.getAttribute('aria-checked'), 'true', 'Push: on');
    const page1 = await p1.locator('main').innerText();
    ok(page1.includes('On this iPhone.'), '"On this iPhone."');
    ok(page1.includes('Your account, bookings and payments only') && page1.includes('Always on'), 'Email: account, bookings and payments only, no switch ("Always on")');
    eq(await p1.getByRole('switch', { name: 'Email' }).count(), 0, 'no Email switch');
    await p1.screenshot({ path: `${SHOTS}/settings-on.png`, fullPage: true });
    const testMark = got.length;
    await p1.getByRole('button', { name: 'Send a test' }).click();
    // (The channels are drawn twice, for a phone and for a computer: the phone's are the ones on screen.)
    await p1.locator('.mk-show-phone').getByText('Sent. It should arrive in a few seconds.').waitFor({ timeout: 15000 });
    await p1.screenshot({ path: `${SHOTS}/settings-test-sent.png`, fullPage: true });
    ok(pushesSince(testMark, appToken).some((p) => p.payload.aps.alert.body === 'Notifications are on. This is how they’ll look.'), '"Send a test": a test notification to this phone');
    await p1.getByRole('button', { name: 'Send a test' }).click();
    await p1.locator('.mk-show-phone').getByText('One went a moment ago.').waitFor({ timeout: 15000 });
    ok(true, 'again within the minute: not sent twice');
    // A tapped notification opens its page (the members area's router).
    await p1.evaluate((path) => window.__yuppiePushOpen(path), `/members/messages/${chatId}`);
    await p1.waitForURL(`**/members/messages/${chatId}`, { timeout: 15000 });
    ok(true, 'a tapped notification opens its page');
    await c1.close();

    // Not now: the sheet goes and does not come back on the next page.
    const { ctx: c2, pg: p2 } = await appPage(noPhone.email, 'not_asked');
    await p2.goto(`${BASE}/members/you/notifications`);
    const offer2 = p2.getByRole('dialog', { name: 'Turn on notifications?' });
    await offer2.waitFor({ timeout: 15000 });
    await offer2.getByRole('button', { name: 'Not now' }).click();
    await offer2.waitFor({ state: 'detached', timeout: 10000 });
    const ask = p2.getByRole('switch', { name: 'Push' });
    eq(await ask.getAttribute('aria-checked'), 'false', 'not asked yet: the Push switch is off');
    ok((await p2.locator('main').innerText()).includes('Not turned on yet on this iPhone.'), '"Not turned on yet on this iPhone."');
    await p2.screenshot({ path: `${SHOTS}/settings-not-asked.png`, fullPage: true });
    await p2.reload();
    await p2.getByRole('switch', { name: 'Push' }).waitFor();
    await sleep(2000);
    eq(await p2.getByRole('dialog', { name: 'Turn on notifications?' }).count(), 0, 'Not now: no offer on the next page');
    await p2.getByRole('switch', { name: 'Push' }).click();
    await waitFor(async () => (await p2.getByRole('switch', { name: 'Push' }).getAttribute('aria-checked')) === 'true', 'a tap on the Push switch asks iOS, and it reads on');
    await c2.close();

    // Not allowed in the iPhone's settings: the banner, and Open Settings goes to the app's page there.
    const { ctx: c3, pg: p3 } = await appPage(noPhone.email, 'denied');
    await p3.goto(`${BASE}/members/you/notifications`);
    await p3.getByText('Notifications are off for Club Yuppie on this iPhone.').first().waitFor({ timeout: 15000 });
    ok(true, 'denied: the banner');
    await waitFor(() => sql1(`select push_permission from notification_preferences where member_id = ${q(noPhone.id)}`).push_permission === 'denied', 'the permission saved: denied');
    await p3.getByRole('button', { name: 'Open Settings' }).first().click();
    ok((await p3.evaluate(() => window.__pushLog)).includes('openSettings'), 'Open Settings asks the app to open the iPhone\'s Settings');
    await p3.screenshot({ path: `${SHOTS}/settings-denied.png`, fullPage: true });
    await c3.close();
    eq(errors, [], 'no page errors');
  } finally {
    await browser.close();
  }

  // ---------------------------------------------------------------- signing out removes this phone
  const out = await fetch(`${BASE}/api/test-hooks/profile.signOutMember`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `${cookieFor(tester.session)}; yuppie-push-device=${phone}` },
    body: JSON.stringify({ args: [] }),
  }).then((r) => r.json());
  ok(out.redirect && /member-login/.test(out.redirect), 'signed out (to Log in)', out);
  eq(sql1(`select count(*)::int n from push_devices where member_id = ${q(tester.id)}`).n, 0, 'this phone gets no more of their notifications');

  done();
} finally {
  stop();
}
