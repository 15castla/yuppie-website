// Notifications and photos, the screens (stage 2, brief 2.3 and 2.4, You's Settings rows and Blocked members),
// driven through the real pages in a browser on this build (PHASE_B_BASE, default 3241) against the local stack,
// with real logins (/member-login and the code from the mailbox):
//   - You > Notifications: the defaults, every switch saved from the page and the dispatcher following it
//     (message_log, fakes.jsonl): Plans you're in and Email (plan-changed), Plans you host (the chat email),
//     24 hours and 2 hours (plan reminders), Changes (the club's event-changed email), Text (the check text first,
//     then reminder texts; quiet hours hold one), Push hidden while MEMBERS_PUSH_LIVE is off; a failed save goes
//     back and says so; no number on file; a changed number re-verifies; You's Notifications row follows.
//   - Photos: the gate after login (and on every page), the size rules in the browser, upload, crop, preview,
//     save (private bucket, pending, face check skipped where the browser has no FaceDetector), Continue; the face
//     check's warning with a FaceDetector that finds nothing (Use it anyway: "none" in the admin queue) and one
//     that finds a face; "We removed your last photo." with the admin's reason; Change photo from You; the camera
//     pre-prompt in the app (gate and sheet); signed URLs work, a public URL and a member's own token do not.
//   - Blocked members: the You row's count, the list, Unblock (asks first; a failure keeps the row), "No one blocked."
// With the switches off (stage 1's build: tests/e2e/phase-a/server.sh) it runs the "gate off" checks instead:
//   PHASE_B_BASE=http://localhost:3245 node tests/e2e/phase-b/12-notif-photos.mjs
import fs from 'node:fs';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { loginMember } from '/home/claude/stack/tools/login.mjs';
import {
  ANON, BASE, SUPA, action, adminSession, cronAt, done, emailsTo, eq, exec, fakesMark, fakesSince, logRows, londonFormDate, makeBooking, makeEvent,
  makeMember, makeMemberWithPhoto, memberSession, ok, page, planInput, postPlan, q, redirectedTo, setPlanStart, sql, sql1, waitFor,
} from './lib.mjs';

const FIX = '/home/claude/stack/tools/fixtures';
const PREFIX = process.env.PHASE_A_TAG;
const APP_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';
const browser = await chromium.launch();

async function loggedIn(email, { app = false, width = 390, init = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, userAgent: app ? APP_UA : undefined });
  if (init) await ctx.addInitScript(init);
  const pg = await ctx.newPage();
  await loginMember(pg, BASE, email);
  return { ctx, pg };
}
const settled = async (pg) => {
  await pg.locator('main:not([aria-busy="true"])').last().waitFor({ timeout: 30000 });
  return pg.locator('main:not([aria-busy="true"])').last();
};
/** The page has loaded and hydrated (a file set before React listens would be lost). */
const ready = async (pg) => {
  await pg.waitForLoadState('networkidle');
  return settled(pg);
};
const mainText = async (pg) => (await (await ready(pg)).innerText()).replace(/\s+/g, ' ');
const prefs = (id) => sql1(`select * from notification_preferences where member_id = ${q(id)}`);
const sw = (pg, name) => pg.getByRole('switch', { name, exact: true });
const checked = async (pg, name) => (await sw(pg, name).getAttribute('aria-checked')) === 'true';
async function flip(pg, name, memberId, column, expected) {
  await sw(pg, name).click();
  await waitFor(() => prefs(memberId)?.[column] === expected, `the page saved "${name}" ${expected ? 'on' : 'off'} (${column})`);
  await waitFor(async () => (await checked(pg, name)) === expected, `and the switch shows it`);
}
const youRow = async (pg, href) => {
  await pg.goto(`${BASE}/members/you`);
  await settled(pg);
  const row = pg.locator(`a.yu-nav[href="${href}"]`);
  return { text: (await row.innerText()).replace(/\s+/g, ' '), warn: await row.locator('.yu-warn').count() };
};
const londonHour = (d = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(d));
const sentTo = (where) => logRows(where).filter((r) => r.status === 'sent');

// Which build is this? A stage 2 member with a photo opens Notifications only when the switches are on.
const probe = await makeMemberWithPhoto('probe');
const switchesOn = (await page('/members/you/notifications', probe.session)).status === 200;

if (!switchesOn) {
  // ================================================================ the photo gate switched off (stage 1's build)
  const plain = await makeMember('gateoff');
  const s = await memberSession(plain.email);
  eq(await redirectedTo('/members/events', s), null, 'gate off: a member with no photo opens Events (no gate)');
  eq((await page('/members/photo', s)).status, 404, 'gate off: /members/photo is a 404');
  eq((await page('/members/you/photo', s)).status, 404, 'gate off: Change photo is a 404');
  eq((await page('/members/you/notifications', s)).status, 404, 'notifications off: its page is a 404');
  eq((await page('/members/you/blocked', s)).status, 404, 'messages off: Blocked members is a 404');
  const { ctx, pg } = await loggedIn(plain.email);
  ok(new URL(pg.url()).pathname.startsWith('/members/events'), 'gate off: after login the member lands on Events, not the gate', pg.url());
  await pg.goto(`${BASE}/members/you`);
  const you = await mainText(pg);
  ok(!you.includes('Change photo') && !you.includes('Settings'), 'You: no Change photo and no Settings rows while their switches are off');
  await pg.goto(`${BASE}/members/profile/edit`);
  await settled(pg);
  ok((await pg.locator('input[type=file]').count()) > 0, 'Edit details keeps its photo row while the gate is off');
  const before = fs.existsSync('/home/claude/stack/storage/member-media/avatars') ? fs.readdirSync('/home/claude/stack/storage/member-media/avatars').length : 0;
  const up = await action('profile.updateAvatar', [{ $formData: {}, $files: { photo: { name: 'p.jpg', type: 'image/jpeg', base64: fs.readFileSync(`${FIX}/photo-800.jpg`).toString('base64') } } }], s);
  ok(up.result.success && up.result.url.includes('/object/sign/member-photos/'), 'Edit details saves into the private bucket and answers a signed URL', up.result);
  const after = fs.existsSync('/home/claude/stack/storage/member-media/avatars') ? fs.readdirSync('/home/claude/stack/storage/member-media/avatars').length : 0;
  eq(after, before, 'and nothing new is written to the public member-media/avatars/');
  await pg.goto(`${BASE}/members/profile/edit`);
  await settled(pg);
  const src = await pg.locator('main img').first().getAttribute('src');
  ok(src && decodeURIComponent(src).includes('/object/sign/member-photos/'), 'Edit details shows the photo through a signed URL, never the old public avatar_url', src);
  await ctx.close();
  await browser.close();
  done();
  process.exit(0);
}

try {
  // ================================================================ Notifications: the page and the defaults
  const M = await makeMemberWithPhoto('nt');
  const H = await makeMemberWithPhoto('nth');
  const C = await makeMemberWithPhoto('ntc');
  eq(prefs(M.id), null, 'a member who never opened the page has no preferences row (the defaults)');
  const { ctx: mCtx, pg } = await loggedIn(M.email);
  await pg.goto(`${BASE}/members/you/notifications`);
  let text = await mainText(pg);
  ok(text.includes('Notifications.') && text.includes('Only what you need.'), 'the page opens after a real login: "Notifications." / "Only what you need."');
  const defaults = {};
  for (const name of ['Plans you host', 'Plans you’re in', '24 hours before', '2 hours before', 'Changes', 'Email', 'Text']) defaults[name] = await checked(pg, name);
  eq(defaults, { 'Plans you host': true, 'Plans you’re in': true, '24 hours before': true, '2 hours before': true, Changes: true, Email: true, Text: false }, 'the defaults: every topic on, email on, text off');
  eq(await pg.getByRole('switch', { name: 'Push' }).count(), 0, 'no Push switch while MEMBERS_PUSH_LIVE is off');
  ok(!/\bPush\b/.test(text) && !text.includes('App only'), 'and no Push row at all (not even "App only")');
  ok(text.includes('Booking confirmed') && text.includes('Always on') && text.includes('We always email your booking and the exact address.'), 'Booking confirmed is a pill, "Always on", not a switch');
  // displayPhone: "07700 900123" for a valid GB mobile; the test range (07700 900xxx) is not one, so it reads "+44 7700 900123".
  ok(/Reminders only, to (07700 900123|\+44 7700 900123)\./.test(text), 'Text shows the number it will use before it is switched on', text);
  ok(text.includes(`Reminders, bookings and chat nudges, to ${M.email}.`), 'Email names the address');
  eq((await action('notifications.getNotificationSettings', [], M.session)).result.pushChannel, false, 'getNotificationSettings: pushChannel false (push is stored, never sent, in stage 2)');
  let row = await youRow(pg, '/members/you/notifications');
  eq([row.text, row.warn], ['Notifications Email', 0], 'You > Settings: Notifications reads "Email" (no push yet)');

  // ---------------------------------------------------------------- Plans you're in and Email: the plan-changed email
  const P1 = await postPlan(H, { title: 'Notif walk', ...londonFormDate(6, '18:30') });
  for (const who of [M, C]) eq((await action('invite.joinOpenInvite', [P1], who.session)).result.ok, true, `${who === M ? 'the member' : 'a control member'} joins the host's plan`);
  const edit = async (time) => {
    const r = await action('plan.editOpenInvite', [P1, planInput({ title: 'Notif walk', ...londonFormDate(6, time) })], H.session);
    ok(r.result.ok, `the host moves the plan to ${time}`, r.result);
    return sql1(`select extract(epoch from changed_at)*1000 as ms from plans where id = ${q(P1)}`).ms;
  };
  const changedTo = (who, stamp) => sentTo(`plan_id = ${q(P1)} and member_id = ${q(who.id)} and template = 'plan-changed'`).filter((r) => r.dedupe_key.endsWith(`:${Math.floor(stamp)}`));
  await pg.goto(`${BASE}/members/you/notifications`);
  await ready(pg);
  await flip(pg, 'Plans you’re in', M.id, 'topic_in', false);
  let stamp = await edit('19:00');
  await waitFor(() => changedTo(C, stamp).length === 1, 'the control member (defaults) gets the plan-changed email');
  eq(changedTo(M, stamp).length, 0, '"Plans you’re in" off: the dispatcher sends the member no plan-changed email');
  ok(sql1(`select count(*)::int n from updates where plan_id = ${q(P1)} and member_id = ${q(M.id)} and kind = 'changed'`).n >= 1, 'the Update is still written (a record in the app, not a notification)');
  await flip(pg, 'Plans you’re in', M.id, 'topic_in', true);
  await flip(pg, 'Email', M.id, 'channel_email', false);
  stamp = await edit('19:30');
  await waitFor(() => changedTo(C, stamp).length === 1, 'the control member gets the second plan-changed email');
  eq(changedTo(M, stamp).length, 0, 'Email off: still none for the member');
  await flip(pg, 'Email', M.id, 'channel_email', true);
  stamp = await edit('20:00');
  await waitFor(() => changedTo(M, stamp).length === 1, 'both back on: the member gets the plan-changed email');

  // ---------------------------------------------------------------- Plans you host: the chat email
  const P2 = await postPlan(M, { title: 'Notif host', ...londonFormDate(7, '18:30') });
  eq((await action('invite.joinOpenInvite', [P2], C.session)).result.ok, true, 'a guest joins the member’s own plan');
  const chat2 = sql1(`select id from chats where plan_id = ${q(P2)} and kind = 'plan'`).id;
  const sent2 = await action('thread.sendMessage', [{ chatId: chat2, text: 'See you there', clientId: `bn-${Date.now()}` }], C.session);
  ok(sent2.result.ok, 'the guest writes in the plan chat');
  exec(`update messages set created_at = now() - interval '16 minutes' where chat_id = ${q(chat2)} and kind = 'text'`);
  await flip(pg, 'Plans you host', M.id, 'topic_host', false);
  await cronAt('reminders', Date.now());
  eq(logRows(`chat_id = ${q(chat2)} and member_id = ${q(M.id)} and template = 'new-message'`).length, 0, '"Plans you host" off: the reminders job sends the host no chat email');
  await flip(pg, 'Plans you host', M.id, 'topic_host', true);
  await cronAt('reminders', Date.now());
  eq(sentTo(`chat_id = ${q(chat2)} and member_id = ${q(M.id)} and template = 'new-message'`).length, 1, 'on again: the chat email goes (unread after 15 minutes)');

  // ---------------------------------------------------------------- 24 hours and 2 hours: plan reminders
  const reminderPlan = async (title) => {
    const id = await postPlan(H, { title, ...londonFormDate(8, '18:30') });
    eq((await action('invite.joinOpenInvite', [id], M.session)).result.ok, true, `the member joins "${title}"`);
    exec(`update plan_members set joined_at = now() - interval '2 days' where plan_id = ${q(id)}`);
    return id;
  };
  const reminded = (planId, who, window, channel = 'email') => sentTo(`plan_id = ${q(planId)} and member_id = ${q(who.id)} and template = 'plan-reminder' and channel = '${channel}'`).filter((r) => r.dedupe_key.includes(`-${window}:`));
  const P3 = await reminderPlan('Notif remind');
  await flip(pg, '24 hours before', M.id, 'topic_reminder24', false);
  setPlanStart(P3, 23 * 60 + 30);
  await cronAt('reminders', Date.now());
  eq(reminded(P3, H, '24h').length, 1, 'the host (defaults) gets the 24-hour reminder');
  eq(reminded(P3, M, '24h').length, 0, '"24 hours before" off: the member gets none');
  await flip(pg, '24 hours before', M.id, 'topic_reminder24', true);
  await flip(pg, '2 hours before', M.id, 'topic_reminder2', false);
  setPlanStart(P3, 110);
  await cronAt('reminders', Date.now());
  eq(reminded(P3, H, '2h').length, 1, 'the host gets the 2-hour reminder');
  eq(reminded(P3, M, '2h').length, 0, '"2 hours before" off: the member gets none');
  await flip(pg, '2 hours before', M.id, 'topic_reminder2', true);
  const P4 = await reminderPlan('Notif remind two');
  setPlanStart(P4, 23 * 60 + 30);
  await cronAt('reminders', Date.now());
  eq(reminded(P4, M, '24h').length, 1, 'both reminders on: the 24-hour reminder email goes to the member');
  setPlanStart(P4, 110);
  await cronAt('reminders', Date.now());
  eq(reminded(P4, M, '2h').length, 1, 'and the 2-hour one');

  // ---------------------------------------------------------------- Changes: the club's event-changed email
  const admin = await adminSession(PREFIX);
  const ev = await makeEvent('notifev', { startInHours: 24 * 12 });
  await makeBooking(M, ev, { paid: false });
  await makeBooking(C, ev, { paid: false });
  const startLocal = (daysAhead, hh, mm) => `${londonFormDate(daysAhead).date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  const moveEvent = async (hh) => {
    const r = await action('admin.events.updateEventDetails', [{ $formData: { event_id: ev.id, title: ev.title, category: 'sport', location: ev.location, address: 'Notifev Hall, 1 Sample Road, Anytown AB1 2CD', start_time: startLocal(12, hh, 0), price_pounds: '0', capacity: '20', notify_booked: 'on' } }], admin);
    ok(r.result.success && r.result.emailing, `the club moves the event to ${hh}:00 and emails the people booked`, r.result);
  };
  const evChanged = (who) => sentTo(`event_id = ${q(ev.id)} and member_id = ${q(who.id)} and template = 'event-changed'`).length;
  await flip(pg, 'Changes', M.id, 'topic_club_changes', false);
  await moveEvent(19);
  await waitFor(() => evChanged(C) === 1, 'the control member gets the event-changed email');
  eq(evChanged(M), 0, '"Changes" off: the member gets no event-changed email');
  await flip(pg, 'Changes', M.id, 'topic_club_changes', true);
  await moveEvent(20);
  await waitFor(() => evChanged(M) === 1, '"Changes" on: the member gets it');

  // ---------------------------------------------------------------- Text: opt in, the check text, reminder texts
  await pg.goto(`${BASE}/members/you/notifications`);
  await ready(pg);
  let mark = fakesMark();
  await flip(pg, 'Text', M.id, 'channel_text', true);
  await waitFor(() => fakesSince(mark, 'sms').filter((t) => t.to === '+447700900123').length === 1, 'Text on: one check text goes to the number on file');
  const check = fakesSince(mark, 'sms').find((t) => t.to === '+447700900123');
  ok(/^Club Yuppie: reminders by text are on\. Turn them off any time at \S+\/members\/you\/notifications$/.test(check.body), 'it says where to turn them off', check.body);
  eq([prefs(M.id).text_check, prefs(M.id).text_check_number], ['sent', '+447700900123'], 'the check is recorded against that number');
  eq(logRows(`member_id = ${q(M.id)} and template = 'reminders-on'`).map((r) => [r.channel, r.status]), [['sms', 'sent']], 'message_log: the check text, sent');
  await waitFor(async () => (await mainText(pg)).includes('We sent a text to check it’s you.'), 'the row shows the tick line');
  row = await youRow(pg, '/members/you/notifications');
  eq(row.text, 'Notifications Email, text', 'You > Settings: "Email, text"');
  // A reminder text, outside quiet hours (22:00 to 07:00 London): now if the clock allows, else the next 07:01.
  let at = new Date();
  if (londonHour(at) >= 22 || londonHour(at) < 7) {
    while (londonHour(at) !== 7) at = new Date(at.getTime() + 15 * 60000);
    at = new Date(at.getTime() - (at.getUTCMinutes() * 60000) + 60000);
  }
  const P5 = await reminderPlan('Notif text');
  setPlanStart(P5, Math.round((at.getTime() - Date.now()) / 60000) + 23 * 60 + 30);
  mark = fakesMark();
  await cronAt('reminders', at);
  eq(reminded(P5, M, '24h', 'sms').length, 1, 'with Text on, the 24-hour reminder goes by text too');
  const reminderText = fakesSince(mark, 'sms').find((t) => t.to === '+447700900123');
  ok(reminderText && /^Club Yuppie: Notif text is tomorrow at \d\d:\d\d, Calder Park\. See the plan: \S+$/.test(reminderText.body), 'the plan text, from the sender name, no message or member words beyond the title and place', reminderText);
  if (londonHour() >= 22 || londonHour() < 7) {
    const P6 = await reminderPlan('Notif quiet');
    setPlanStart(P6, 23 * 60 + 30);
    await cronAt('reminders', Date.now());
    eq(logRows(`plan_id = ${q(P6)} and member_id = ${q(M.id)} and channel = 'sms'`).map((r) => [r.status, r.error]), [['skipped', 'quiet hours: held until 07:00']], 'quiet hours: a reminder text due now is held until 07:00 (email is not held)');
    eq(reminded(P6, M, '24h').length, 1, 'while its email goes');
  }
  // A changed number: Text reads off until it is switched on again (a new check text to the new number).
  exec(`update members set phone = '+447700900456' where id = ${q(M.id)}`);
  await pg.goto(`${BASE}/members/you/notifications`);
  text = await mainText(pg);
 ok(/Reminders only, to (07700 900456|\+44 7700 900456)\./.test(text) && !(await checked(pg, 'Text')), 'a new number on file: the row shows it and Text reads off (texts stopped)');
  mark = fakesMark();
  await sw(pg, 'Text').click();
  await waitFor(() => fakesSince(mark, 'sms').filter((t) => t.to === '+447700900456').length === 1, 'switching it on again sends the check text to the new number');
  await waitFor(() => prefs(M.id).text_check_number === '+447700900456', 'and records it');
  await flip(pg, 'Text', M.id, 'channel_text', false);
  const P7 = await reminderPlan('Notif no text');
  setPlanStart(P7, Math.round((at.getTime() - Date.now()) / 60000) + 23 * 60 + 30);
  await cronAt('reminders', at);
  eq([reminded(P7, M, '24h').length, reminded(P7, M, '24h', 'sms').length], [1, 0], 'Text off: the reminder comes by email only');

  // ---------------------------------------------------------------- a save that fails goes back and says so
  const notifPage = (url) => url.pathname === '/members/you/notifications';
  await pg.route(notifPage, (route) => (route.request().method() === 'POST' ? route.abort('failed') : route.continue()));
  await sw(pg, '2 hours before').click();
  await waitFor(async () => (await mainText(pg)).includes('Couldn’t save that. Check your connection and try again.'), 'a failed save: the row says "Couldn’t save that. Check your connection and try again."');
  ok(await checked(pg, '2 hours before'), 'and the switch went back to where it was');
  eq(prefs(M.id).topic_reminder2, true, 'nothing was saved');
  await pg.unroute(notifPage);
  // Everything off: the You row warns.
  await pg.goto(`${BASE}/members/you/notifications`);
  await ready(pg);
  await flip(pg, 'Email', M.id, 'channel_email', false);
  row = await youRow(pg, '/members/you/notifications');
  eq([row.text, row.warn], ['Notifications Off. You may miss reminders.', 1], 'every channel off: You reads "Off. You may miss reminders." in amber');
  eq(prefs(M.id).channel_push, true, 'push is stored as it was (on) and never sent: nothing in message_log is a push');
  await mCtx.close();

  // ---------------------------------------------------------------- no number on file, and the app
  const N = await makeMemberWithPhoto('ntn', 'active', { phone: null });
  const { ctx: nCtx, pg: npg } = await loggedIn(N.email, { app: true });
  await npg.goto(`${BASE}/members/you/notifications`);
  text = await mainText(npg);
  ok(text.includes('Add a mobile number to get reminders by text.') && text.includes('Add a number'), 'no number on file: the drawn state ("Add a mobile number…", "Add a number")');
  ok(!(await checked(npg, 'Text')), 'its switch stays off');
  eq(await npg.getByRole('switch', { name: 'Push' }).count(), 0, 'in the app too: no Push row while push is not live');
  mark = fakesMark();
  const noNumber = await action('notifications.setNotificationChannel', ['text', true], N.session);
  eq([noNumber.result.ok, noNumber.result.reason], [false, 'no_number'], 'the server refuses Text with no number (no_number)');
  eq(fakesSince(mark, 'sms').length, 0, 'and sends nothing');
  await sw(npg, 'Text').click();
  await npg.waitForURL('**/members/profile/edit', { timeout: 15000 });
  ok(true, 'a tap on the Text row opens the number step (Edit details, where the phone number is edited)');
  row = await youRow(npg, '/members/you/notifications');
  eq(row.text, 'Notifications Email', 'You in the app: "Email" (push is not live, so it is not promised)');
  await nCtx.close();

  // ================================================================ Photos: the gate after login
  const G = await makeMember('gate');
  const { ctx: gCtx, pg: gpg } = await loggedIn(G.email);
  await gpg.waitForURL('**/members/photo', { timeout: 20000 });
  await ready(gpg);
  text = await mainText(gpg);
  ok(text.includes('Add your photo.') && text.includes('Every member has one now, so people know who they’re meeting.'), 'after login, no photo: the gate, with the existing-member line');
  ok(text.includes('Only members who are logged in can see your photo. It’s never public.'), 'the privacy line is on the first screen');
  await gpg.goto(`${BASE}/members/events`);
  await gpg.waitForURL('**/members/photo', { timeout: 20000 });
  await ready(gpg);
  ok(true, 'any other page sends them back to the gate');
  const fileInput = gpg.locator('input[type=file]').first();
  for (const [file, words] of [['photo-200.jpg', 'Too small. Choose a photo at least 400 pixels wide.'], ['not-a-photo.jpg', 'That file isn’t a photo. Choose a JPG, PNG or HEIC.'], ['photo-11mb.jpg', 'That file is too big. Choose one under 10 MB.']]) {
    await fileInput.setInputFiles(`${FIX}/${file}`);
    await waitFor(async () => (await mainText(gpg)).includes(words), `${file}: "${words}" on the Start screen`);
  }
  eq(sql1(`select count(*)::int n from member_photos where member_id = ${q(G.id)}`).n, 0, 'nothing uploaded for any of them');
  eq(await gpg.evaluate(() => 'FaceDetector' in window), false, 'this browser has no FaceDetector (so no face check)');
  const avatarsBefore = fs.existsSync('/home/claude/stack/storage/member-media/avatars') ? fs.readdirSync('/home/claude/stack/storage/member-media/avatars').length : 0;
  await fileInput.setInputFiles(`${FIX}/photo-800.jpg`);
  await waitFor(async () => (await mainText(gpg)).includes('Fit your face in the circle.'), 'a good photo: "Move and zoom."');
  await gpg.getByRole('button', { name: 'Next' }).click();
  await waitFor(async () => (await mainText(gpg)).includes('This is how members see you.'), '"Looking good?" with the three sizes');
  await gpg.getByRole('button', { name: 'Save photo' }).click();
  await waitFor(async () => (await mainText(gpg)).includes('Your photo is on.'), 'saved: "Looking good, Gate." / "Your photo is on."');
  let photo = sql1(`select p.* from member_photos p join members m on m.photo_id = p.id where m.id = ${q(G.id)}`);
  eq([photo.status, photo.source, photo.face_check], ['pending', 'new', 'skipped'], 'recorded: pending (the admin queue), new, face check skipped (no detector)');
  ok(fs.existsSync(`/home/claude/stack/storage/member-photos/${photo.path}`), 'the file is in the private bucket');
  const avatarsAfter = fs.existsSync('/home/claude/stack/storage/member-media/avatars') ? fs.readdirSync('/home/claude/stack/storage/member-media/avatars').length : 0;
  eq(avatarsAfter, avatarsBefore, 'and nothing was written to the public member-media/avatars/');
  await gpg.getByRole('link', { name: 'Continue' }).click();
  await gpg.waitForURL('**/members/open-invite', { timeout: 20000 });
  ok(true, 'Continue goes to the landing page (Open Invite on the web)');

  // ---------------------------------------------------------------- signed URLs, never public
  await gpg.goto(`${BASE}/members/you`);
  await settled(gpg);
  const youImg = await gpg.locator('.yu-photo img').first().getAttribute('src');
  const signed = new URL(youImg, BASE).searchParams.get('url') ?? youImg;
  ok(signed.includes('/storage/v1/object/sign/member-photos/') && signed.includes('token='), 'You shows the photo through a signed URL', signed);
  const viaSigned = await fetch(signed);
  eq([viaSigned.status, viaSigned.headers.get('content-type')], [200, 'image/jpeg'], 'the signed URL serves the photo');
  const publicUrl = `${SUPA}/storage/v1/object/public/member-photos/${photo.path}`;
  ok((await fetch(publicUrl)).status >= 400, 'a plain public URL to the same file does not', publicUrl);
  const gSession = await memberSession(G.email);
  const asMember = await fetch(`${SUPA}/storage/v1/object/authenticated/member-photos/${photo.path}`, { headers: { apikey: ANON, Authorization: `Bearer ${gSession.access_token}` } });
  ok(asMember.status >= 400, 'nor does the member’s own token read the bucket directly (only the server signs)', asMember.status);
  const forged = `${signed.split('?')[0]}?token=forged`;
  ok((await fetch(forged)).status >= 400, 'and a signed URL with a forged token does not');
  ok(!(await page('/members/you', gSession)).text.includes('/object/public/member-photos/'), 'You’s HTML never carries a public photo link');

  // ---------------------------------------------------------------- Change photo from You
  await gpg.getByRole('link', { name: 'Change photo' }).click();
  await gpg.waitForURL('**/members/you/photo', { timeout: 15000 });
  await gpg.locator('dialog[open]').waitFor();
  await gpg.waitForLoadState('networkidle');
  ok((await gpg.locator('dialog[open]').innerText()).includes('Your new photo shows straight away.'), 'Change photo opens the sheet over You');
  await gpg.locator('dialog[open] input[type=file]').first().setInputFiles(`${FIX}/photo-600.png`);
  await waitFor(async () => (await gpg.locator('dialog[open]').innerText()).includes('Fit your face in the circle.'), 'the crop opens in the sheet');
  await gpg.getByRole('button', { name: 'Use this photo' }).click();
  await gpg.waitForURL((u) => u.pathname === '/members/you', { timeout: 20000 });
  await waitFor(async () => (await gpg.locator('body').innerText()).includes('Photo changed'), 'back on You: "Photo changed"');
  const changed = sql1(`select p.* from member_photos p join members m on m.photo_id = p.id where m.id = ${q(G.id)}`);
  eq([changed.source, changed.status, changed.previous_photo_id], ['changed', 'pending', photo.id], 'the new photo: changed, pending (the queue’s "Changed"), with its Before');
  eq(sql1(`select status from member_photos where id = ${q(photo.id)}`).status, 'replaced', 'the old one is marked replaced');
  const newSrc = await gpg.locator('.yu-photo img').first().getAttribute('src');
  ok(newSrc !== youImg && decodeURIComponent(newSrc).includes(changed.path), 'the new photo shows at once on the page');
  await gCtx.close();

  // ---------------------------------------------------------------- the soft face check (a FaceDetector that finds nothing / a face)
  const fakeDetector = (faces) => `window.FaceDetector = class { constructor() {} async detect() { return ${faces ? '[{ boundingBox: { x: 10, y: 10, width: 100, height: 100 } }]' : '[]'}; } };`;
  const F = await makeMember('noface');
  const { ctx: fCtx, pg: fpg } = await loggedIn(F.email, { init: fakeDetector(false) });
  await fpg.waitForURL('**/members/photo', { timeout: 20000 });
  await ready(fpg);
  await fpg.locator('input[type=file]').first().setInputFiles(`${FIX}/photo-800.jpg`);
  await waitFor(async () => (await mainText(fpg)).includes('Fit your face in the circle.'), 'the crop');
  await fpg.getByRole('button', { name: 'Next' }).click();
  await waitFor(async () => (await mainText(fpg)).includes('This doesn’t look like a photo of you.'), 'no face found: "This doesn’t look like a photo of you."');
  text = await mainText(fpg);
  ok(text.includes('We can’t see a face in it. Other members need to recognise you.'), 'with the reason, and nothing is blocked');
  eq(sql1(`select count(*)::int n from member_photos where member_id = ${q(F.id)}`).n, 0, 'nothing is saved until the member decides');
  await fpg.getByRole('button', { name: 'Use it anyway' }).click();
  await waitFor(async () => (await mainText(fpg)).includes('Your photo is on.'), '"Use it anyway" saves it');
  const fPhoto = sql1(`select p.* from member_photos p join members m on m.photo_id = p.id where m.id = ${q(F.id)}`);
  eq([fPhoto.status, fPhoto.face_check], ['pending', 'none'], 'recorded as pending, "none"');
  const queue = (await action('admin.photos.adminGetPhotos', ['check'], admin)).result;
  const item = queue.items.find((i) => i.photoId === fPhoto.id);
  ok(item && item.faceCheck === 'none' && item.pill === 'new', 'it waits in the admin Photos queue as New, "No face found"', item);
  await fCtx.close();
  const Y = await makeMember('face');
  const { ctx: yCtx, pg: ypg } = await loggedIn(Y.email, { init: fakeDetector(true) });
  await ypg.waitForURL('**/members/photo', { timeout: 20000 });
  await ready(ypg);
  await ypg.locator('input[type=file]').first().setInputFiles(`${FIX}/photo-800.jpg`);
  await waitFor(async () => (await mainText(ypg)).includes('Fit your face in the circle.'), 'the crop');
  await ypg.getByRole('button', { name: 'Next' }).click();
  await waitFor(async () => (await mainText(ypg)).includes('This is how members see you.'), 'a face found: straight to "Looking good?"');
  await ypg.getByRole('button', { name: 'Save photo' }).click();
  await waitFor(async () => (await mainText(ypg)).includes('Your photo is on.'), 'saved');
  eq(sql1(`select p.face_check from member_photos p join members m on m.photo_id = p.id where m.id = ${q(Y.id)}`).face_check, 'found', 'recorded as "found" (the queue’s "Face found")');
  await yCtx.close();

  // ---------------------------------------------------------------- the club removes a photo
  mark = fakesMark();
  eq((await action('admin.photos.adminRemovePhoto', [fPhoto.id, 'not_member'], admin)).result, { ok: true }, 'the admin removes it: "Not a photo of the member"');
  const { ctx: rCtx, pg: rpg } = await loggedIn(F.email);
  await rpg.waitForURL('**/members/photo', { timeout: 20000 });
  await ready(rpg);
  text = await mainText(rpg);
  ok(text.includes('We removed your last photo.') && text.includes('It wasn’t a photo of you. Please add a new one.'), 'their next login meets the gate with "We removed your last photo." and the admin’s reason');
  ok(!text.includes('Every member has one now'), 'not the existing-member line');
  ok(!text.includes('A clear photo of your face'), 'the removed screen drops the tips, as drawn');
  await waitFor(() => sentTo(`member_id = ${q(F.id)} and photo_id = ${q(fPhoto.id)} and template = 'photo-removed'`).length === 1, 'the photo-removed email (message_log)');
  ok(emailsTo(mark, F.email).length >= 1, 'and it reached the fake mail service');
  await rCtx.close();

  // ---------------------------------------------------------------- the camera pre-prompt in the app (gate, then the sheet)
  const A = await makeMember('cam');
  const { ctx: aCtx, pg: apg } = await loggedIn(A.email, { app: true });
  await apg.waitForURL('**/members/photo', { timeout: 20000 });
  await ready(apg);
  await apg.locator('.ph-dock').getByRole('button', { name: 'Take a photo' }).click();
  await waitFor(async () => (await mainText(apg)).includes('We need the camera to take your photo.'), 'app: Take a photo shows our own pre-prompt first');
  ok((await mainText(apg)).includes('Your phone will ask you to allow it. We only use the camera when you take your photo.'), 'with the design’s words');
  const [chooser] = await Promise.all([apg.waitForEvent('filechooser'), apg.locator('.ph-dock').getByRole('button', { name: 'Continue' }).click()]);
  eq(await chooser.element().getAttribute('capture'), 'user', 'Continue opens the camera (the front camera hint), where the phone asks');
  const [again] = await Promise.all([apg.waitForEvent('filechooser'), apg.locator('.ph-dock').getByRole('button', { name: 'Take a photo' }).click()]);
  eq(await again.element().getAttribute('capture'), 'user', 'the second time, straight to the camera (asked once per device)');
  await aCtx.close();
  const S = await makeMemberWithPhoto('camsheet');
  const { ctx: sCtx, pg: spg } = await loggedIn(S.email, { app: true });
  await spg.goto(`${BASE}/members/you/photo`);
  await spg.locator('dialog[open]').waitFor();
  await spg.waitForLoadState('networkidle');
  await spg.locator('dialog[open]').getByRole('button', { name: 'Take a photo' }).click();
  await waitFor(async () => (await spg.locator('dialog[open]').innerText()).includes('We need the camera to take your photo.'), 'Change photo in the app: the same pre-prompt, in the sheet');
  const [lib] = await Promise.all([spg.waitForEvent('filechooser'), spg.getByRole('button', { name: 'Choose from library instead' }).click()]);
  eq(await lib.element().getAttribute('capture'), null, '"Choose from library instead" opens the library (no camera)');
  await sCtx.close();

  // ================================================================ Blocked members
  const B = await makeMemberWithPhoto('blk');
  const O = await makeMemberWithPhoto('blko');
  eq((await action('messages.blockMember', [{ memberId: O.id }], B.session)).result, { ok: true }, 'the member blocks someone (as from a chat)');
  const { ctx: bCtx, pg: bpg } = await loggedIn(B.email);
  row = await youRow(bpg, '/members/you/blocked');
  eq(row.text, 'Blocked members 1 person', 'You > Settings: Blocked members "1 person"');
  await bpg.goto(`${BASE}/members/you/blocked`);
  await ready(bpg);
  text = await mainText(bpg);
  const dayMonth = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short' }).format(new Date()).replace('Sept', 'Sep');
  ok(text.includes('Blocked members.') && text.includes('Blko') && text.includes(`Blocked ${dayMonth}`), 'the list: their first name and "Blocked <date>"', text);
  const blkImg = await bpg.locator('.msg-blk-row img').first().getAttribute('src');
  ok(blkImg && decodeURIComponent(blkImg).includes('/object/sign/member-photos/'), 'their photo through a signed URL');
  const blockedPage = (url) => url.pathname === '/members/you/blocked';
  await bpg.route(blockedPage, (route) => (route.request().method() === 'POST' ? route.abort('failed') : route.continue()));
  await bpg.getByRole('button', { name: 'Unblock Blko' }).click();
  await bpg.getByRole('alertdialog').waitFor();
  ok((await bpg.getByRole('alertdialog').innerText()).includes('Blko will be able to message you and ask you questions again.'), 'Unblock asks first, saying what happens');
  await bpg.getByRole('alertdialog').getByRole('button', { name: 'Unblock Blko' }).click();
  await waitFor(async () => (await bpg.getByRole('alertdialog').innerText()).includes('That didn’t go through. Try again in a moment.'), 'a failed unblock keeps the sheet open and says so');
  eq(sql1(`select count(*)::int n from blocks where blocker_id = ${q(B.id)}`).n, 1, 'the block stays');
  await bpg.unroute(blockedPage);
  await bpg.getByRole('alertdialog').getByRole('button', { name: 'Unblock Blko' }).click();
  await waitFor(async () => (await mainText(bpg)).includes('No one blocked.'), 'unblocked: the row goes, "No one blocked."');
  eq(sql1(`select count(*)::int n from blocks where blocker_id = ${q(B.id)}`).n, 0, 'the block is gone from the database');
  row = await youRow(bpg, '/members/you/blocked');
  eq(row.text, 'Blocked members None', 'You > Settings: "None"');
  await bCtx.close();
} finally {
  await browser.close();
}
done();
