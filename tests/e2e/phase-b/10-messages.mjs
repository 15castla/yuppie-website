// Messages on the real pages (brief 2.2; the Messages agent's screens): two members logged in at once, each in
// their own browser context, through the real /member-login, on this branch's production build against the local
// stack. Send and receive by polling (and nothing moves while the other is typing), the safety note once with
// its permanent copy in chat info, phone numbers and emails going through, the link check, the 500-character
// limit, the rate limit and Retry, system lines, unread numbers in the inbox and on the icon (one source), Mark
// all as read, mute (no chat email for a muted chat: message_log), the new-message email per settings, block in a
// shared plan chat (the blocker stops seeing the other; the other is not told and cannot start a question),
// report a message, a member and a photo (an email to the club for each), leave, the host's chat has no Leave, a
// closed chat after a cancel and after the plan, the empty inbox and Updates, gated members refused.
//
//   tests/e2e/phase-b/server.sh build && tests/e2e/phase-b/server.sh start prod 3244
//   PHASE_B_BASE=http://localhost:3244 PHASE_B_TAG=bm. node tests/e2e/phase-b/10-messages.mjs
//
// Test people are <prefix>t-<name>-<random>@example.com, with approved photos (the photo gate is on).
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { loginMember } from '/home/claude/stack/tools/login.mjs';
import {
  ALERTS,
  BASE,
  action,
  cookieFor,
  cronAt,
  done,
  eq,
  exec,
  fakeState,
  logRows,
  makeMemberWithPhoto,
  ok,
  page as getPage,
  postPlan,
  q,
  redirectedTo,
  setPlanStart,
  sleep,
  sql,
  sql1,
  waitFor,
} from './lib.mjs';

const MIN = 60000;
const POLL_BUDGET_MS = 7000; // the thread polls every 3 seconds; "within a few seconds" with room for a slow build

// ---------------------------------------------------------------- people and a plan
const hana = await makeMemberWithPhoto('hana'); // the host
const gabe = await makeMemberWithPhoto('gabe');
const cora = await makeMemberWithPhoto('cora');
const dex = await makeMemberWithPhoto('dex'); // Email off
const ivy = await makeMemberWithPhoto('ivy'); // no chats at all
const planId = await postPlan(hana, { title: 'Bm chat plan', places: 8, where: 'Calder Park' });
const join = async (who, plan = planId) => (await action('invite.joinOpenInvite', [plan], who.session)).result;
const chatId = (await join(gabe)).chatId;
ok(chatId, 'Gabe is in the plan, and so in its chat');
await join(cora);
await join(dex);
const prefs = await action('notifications.setNotificationChannel', ['email', false], dex.session);
ok(prefs.result?.ok && prefs.result.preferences.channels.email === false, 'Dex turns Email off');

const thread = (who, id = chatId) => action('thread.getThread', [id, {}], who.session).then((r) => r.result);
const sendAs = (who, text, clientId = `bm-${Math.random().toString(36).slice(2)}`, to = chatId) =>
  action('thread.sendMessage', [{ chatId: to, text, clientId }], who.session).then((r) => r.result);
const counts = (who) => action('messages.getUnreadCounts', [], who.session).then((r) => r.result);
const badge = (who) => action('shell.getMessagesBadge', [], who.session).then((r) => r.result);
const bodies = (id = chatId) => sql(`select body from messages where chat_id = ${q(id)} and kind = 'text' order by created_at`).map((r) => r.body);

// ---------------------------------------------------------------- browsers: two members at once (three for the report)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = [];
async function loggedIn(member, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${member.email}: ${e.message}`));
  await loginMember(p, BASE, member.email);
  await p.waitForURL((u) => /^\/members\/[a-z]/.test(u.pathname), { timeout: 20000 }); // past /members (it redirects to the landing page)
  await p.waitForLoadState('networkidle');
  return p;
}
async function withCookie(member, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await ctx.addCookies(cookieFor(member.session).split('; ').map((kv) => {
    const i = kv.indexOf('=');
    return { name: kv.slice(0, i), value: kv.slice(i + 1), url: BASE };
  }));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${member.email}: ${e.message}`));
  return p;
}
const A = await loggedIn(hana);
const B = await loggedIn(gabe);
ok(new URL(A.url()).pathname.startsWith('/members') && new URL(B.url()).pathname.startsWith('/members'), 'Hana and Gabe log in through /member-login (two browser contexts)');
const threadUrl = (id = chatId) => `${BASE}/members/messages/${id}`;
const bubbles = (p) => p.locator('.msg-b').allInnerTexts();
const composer = (p) => p.locator('textarea.msg-input');
const bubble = (p, text) => p.locator('.msg-stream .msg-b', { hasText: text }).first();
async function sendUi(p, text) {
  await composer(p).fill(text);
  await p.locator('button.msg-send').click();
}

// ---------------------------------------------------------------- the empty inbox and Updates
const I = await withCookie(ivy);
await I.goto(`${BASE}/members/messages`, { waitUntil: 'networkidle' });
ok(await I.getByRole('heading', { name: 'No chats yet.' }).isVisible(), 'a member with no chats: "No chats yet."');
await I.getByRole('tab', { name: 'Updates' }).click();
ok(await I.getByRole('heading', { name: 'No updates yet.' }).isVisible(), 'and on Updates: "No updates yet."');
ok(!(await I.content()).includes('Example'), 'no example note anywhere: real data');
await I.context().close();

// ---------------------------------------------------------------- the safety note, once ever (decision 5 A)
await A.goto(threadUrl(), { waitUntil: 'networkidle' });
await B.goto(threadUrl(), { waitUntil: 'networkidle' });
ok(await A.locator('.msg-stream .msg-safety').isVisible(), 'the first chat Hana ever opens: the safety note');
ok(await B.locator('.msg-stream .msg-safety').isVisible(), 'and Gabe sees it the first time too');
await waitFor(() => sql1(`select count(*)::int n from members where id in (${q(hana.id)}, ${q(gabe.id)}) and chat_safety_seen_at is not null`).n === 2, 'the note is recorded as shown, for both');
ok(true, 'shown counts as seen (members.chat_safety_seen_at)');
await A.getByRole('button', { name: 'Got it' }).click();
ok(!(await A.locator('.msg-stream .msg-safety').count()), '"Got it" puts it away');
await A.reload({ waitUntil: 'networkidle' });
ok(!(await A.locator('.msg-stream .msg-safety').count()), 'opened again: not shown again');
await A.getByRole('button', { name: 'Chat info' }).click();
const infoSafety = A.locator('.msg-sheet .msg-safety');
eq(await infoSafety.innerText().then((t) => t.replace(/\s+/g, ' ').trim()), 'Meet somewhere public. Keep payments inside Club Yuppie.', 'the permanent copy lives in chat info');
ok(!(await A.locator('.msg-sheet').getByText('Leave chat').count()), 'the host has no "Leave chat" in their own plan chat');
ok(await A.locator('.msg-sheet').getByText('In this chat · 4').isVisible(), 'chat info: "In this chat · 4" (the host and three going)');
await A.getByRole('button', { name: 'Close' }).first().click();

// ---------------------------------------------------------------- send, and receive by polling while the other types
const lines = await A.locator('.msg-sys').allInnerTexts();
ok(lines.includes('Hana opened this chat') && lines.includes('Gabe is in') && lines.includes('Cora is in'), 'system lines: "Hana opened this chat", "Gabe is in"', lines);
await B.evaluate(() => { window.__noReload = 'still here'; });
await composer(B).click();
await composer(B).pressSequentially('I am typing a long ');
const boxBefore = await composer(B).boundingBox();
await sendUi(A, 'Hello from Hana');
await bubble(A, 'Hello from Hana').waitFor();
await waitFor(async () => !(await A.getByText('Sending…').count()), 'Hana\'s message leaves "Sending…"');
ok(!(await A.getByText('Not sent').count()), 'and is sent (no "Not sent")');
eq(bodies(), ['Hello from Hana'], 'it is stored once');
const t0 = Date.now();
await bubble(B, 'Hello from Hana').waitFor({ timeout: 15000 });
const tookMs = Date.now() - t0;
ok(tookMs < POLL_BUDGET_MS, `Gabe's open thread shows it without a reload, by polling (${tookMs} ms)`);
eq(await composer(B).inputValue(), 'I am typing a long ', 'Gabe\'s half-typed message is untouched');
ok(await B.evaluate(() => document.activeElement?.classList.contains('msg-input')), 'and the composer keeps the focus');
const boxAfter = await composer(B).boundingBox();
eq(Math.round(boxAfter.y), Math.round(boxBefore.y), 'the composer did not move');
eq(await B.evaluate(() => window.__noReload), 'still here', 'the page did not reload');
await composer(B).pressSequentially('message');
eq(await composer(B).inputValue(), 'I am typing a long message', 'typing carries on where it was');
await B.locator('button.msg-send').click();
await bubble(A, 'I am typing a long message').waitFor({ timeout: 15000 });
ok(true, 'and Gabe\'s message reaches Hana the same way');

// ---------------------------------------------------------------- numbers and emails go through, as plain text (decision 2 A)
await sendUi(B, 'Ring me on 07700 900456 or gabe@example.com');
await bubble(A, 'Ring me on 07700 900456 or gabe@example.com').waitFor({ timeout: 15000 });
eq(await A.locator('.msg-b', { hasText: '07700 900456' }).locator('a').count(), 0, 'a phone number and an email go through, plain text (not a link)');

// ---------------------------------------------------------------- the link check
await composer(B).fill('The brunch place is www.example.com/brunch');
ok(await B.getByText('Links can’t be sent in chats. Tell people where to find it instead.').isVisible(), 'a link: the gentle line above the composer');
eq(await B.locator('button.msg-send').getAttribute('aria-disabled'), 'true', 'and Send stays inert');
await B.locator('button.msg-send').click({ force: true });
await composer(B).press('Enter');
await sleep(800);
ok(!bodies().some((b) => b.includes('www.example.com')), 'pressing it (or Enter) sends nothing');
const linkRefused = await sendAs(gabe, 'See https://example.com');
eq([linkRefused.ok, linkRefused.reason], [false, 'link'], 'the server refuses a link too (the composer is only a courtesy)');
await composer(B).fill('');
ok(!(await B.getByText('Links can’t be sent in chats.', { exact: false }).count()), 'the line goes when the link does');

// ---------------------------------------------------------------- the 500-character limit
await composer(B).fill('x'.repeat(460));
ok(await B.locator('.msg-count').getByText('460/500').isVisible(), 'the counter shows from 450 characters ("460/500")');
await composer(B).fill('x'.repeat(500));
ok(await B.locator('.msg-count.is-max').isVisible() && (await B.locator('.msg-count').innerText()).includes('Message is at the limit'), 'at 500: "500/500 Message is at the limit", in error red');
await composer(B).press('End');
await composer(B).pressSequentially('y');
eq((await composer(B).inputValue()).length, 500, 'typing stops at 500');
eq((await sendAs(gabe, 'z'.repeat(501))).reason, 'too_long', 'the server refuses 501');
await composer(B).fill('');

// ---------------------------------------------------------------- the rate limit, then Retry
const already = sql1(`select count(*)::int n from messages where sender_id = ${q(gabe.id)} and kind = 'text' and created_at > now() - interval '1 minute'`).n;
for (let n = already; n < 20; n += 1) ok((await sendAs(gabe, `Filler ${n}`)).ok, `filler ${n + 1} of 20 in a minute`);
await sendUi(B, 'One too many');
await B.locator('.msg-comp-line', { hasText: 'Slow down a moment.' }).waitFor({ timeout: 10000 });
ok(true, 'the 21st message in a minute: "Slow down a moment." above the composer');
ok(await B.locator('.msg-state').getByText('Not sent').isVisible(), 'and the message shows "Not sent" with Retry and Delete');
ok(!bodies().includes('One too many'), 'it was not stored');
exec(`update messages set created_at = created_at - interval '2 minutes' where sender_id = ${q(gabe.id)}`);
await B.getByRole('button', { name: 'Retry' }).click();
await waitFor(() => bodies().filter((b) => b === 'One too many').length === 1, 'Retry a minute later: stored once');
await waitFor(async () => !(await B.locator('.msg-state', { hasText: 'Not sent' }).count()) && !(await B.locator('.msg-comp-line').count()), 'the line and "Not sent" go');
ok(true, 'Retry after the minute sends it (once)');

// ---------------------------------------------------------------- unread numbers: the inbox and the icon, from one source
await A.goto(`${BASE}/members/open-invite`, { waitUntil: 'networkidle' });
await sendUi(B, 'Are we still on for Wednesday?');
await sendUi(B, 'I can bring snacks');
await waitFor(() => bodies().includes('I can bring snacks'), 'Gabe sends two more while Hana is away');
const hanaCounts = await counts(hana);
ok(hanaCounts.chats === 1 && hanaCounts.updates >= 3, `Hana: one unread chat and her "joined" updates (${JSON.stringify(hanaCounts)})`);
await A.reload({ waitUntil: 'networkidle' });
const icon = A.getByRole('link', { name: /^Messages/ }).first();
await waitFor(async () => (await icon.getAttribute('aria-label')) === `Messages, ${hanaCounts.chats + hanaCounts.updates} unread`, 'the icon');
eq(await icon.getAttribute('aria-label'), `Messages, ${hanaCounts.chats + hanaCounts.updates} unread`, 'the icon: unread chats plus unread updates');
eq(await badge(hana), hanaCounts.chats + hanaCounts.updates, 'the same number the shell asks the server for');
await icon.click();
await A.waitForURL(/\/members\/messages$/);
await A.locator('.msg-row').first().waitFor(); // past the loading state
eq(await A.getByRole('tab').first().getAttribute('aria-label'), 'Chats, 1 unread', 'the inbox: "Chats, 1 unread"');
eq(await A.getByRole('tab').nth(1).getAttribute('aria-label'), `Updates, ${hanaCounts.updates} unread`, `and "Updates, ${hanaCounts.updates} unread"`);
ok(await A.locator('.msg-row.is-unread', { hasText: 'Bm chat plan' }).isVisible(), 'the plan chat\'s row is unread (heavier, with the dot)');
await A.locator('.msg-row', { hasText: 'Bm chat plan' }).click();
await A.waitForURL(new RegExp(`/members/messages/${chatId}$`));
await bubble(A, 'I can bring snacks').waitFor();
const divider = await A.locator('.msg-new').innerText().catch(() => '');
ok(/^\d+ new messages?$/.test(divider.trim()), `opening it: the "${divider.trim()}" divider`);
await sleep(3500);
ok(await A.locator('.msg-new').isVisible(), 'the divider stays put while the thread polls');
await A.getByRole('link', { name: 'Back to Messages' }).click();
await A.waitForURL(/\/members\/messages$/);
await A.waitForLoadState('networkidle');
// The inbox may come from the router's cache (staleTimes.dynamic is 30 seconds): drawn a while ago, it asks again.
await waitFor(async () => (await A.getByRole('tab').first().getAttribute('aria-label')) === 'Chats', 'back in the inbox');
eq(await A.getByRole('tab').first().getAttribute('aria-label'), 'Chats', 'back in the inbox: no unread chats');
eq((await counts(hana)).chats, 0, 'read on the server');

// ---------------------------------------------------------------- Mark all as read
await A.getByRole('tab', { name: /^Updates/ }).click();
if (!(await A.getByRole('button', { name: 'Mark all as read' }).count())) {
  console.log('DEBUG', await A.getByRole('tabpanel').innerText(), await A.getByRole('tab').nth(1).getAttribute('aria-label'), await counts(hana));
  await A.screenshot({ path: '/tmp/claude-0/-home-claude/e337cd27-fc4a-515d-836f-5913add7ea16/scratchpad/markall.png' });
}
await A.getByRole('button', { name: 'Mark all as read' }).click();
await waitFor(() => sql1(`select count(*)::int n from updates where member_id = ${q(hana.id)} and read_at is null`).n === 0, 'every update read on the server');
eq(await A.getByRole('tab').nth(1).getAttribute('aria-label'), 'Updates', '"Mark all as read": the Updates number goes');
eq(await badge(hana), 0, 'and the icon has nothing to show');

// ---------------------------------------------------------------- mute, and the new-message email per settings
await A.goto(threadUrl(), { waitUntil: 'networkidle' });
await A.getByRole('button', { name: 'Chat info' }).click();
await A.getByRole('switch', { name: /Mute notifications/ }).click();
await waitFor(() => sql1(`select muted from chat_members where chat_id = ${q(chatId)} and member_id = ${q(hana.id)}`).muted === true, 'Hana mutes the chat (saved)');
eq(await A.getByRole('switch', { name: /Mute notifications/ }).getAttribute('aria-checked'), 'true', 'the switch is on');
await A.getByRole('button', { name: 'Close' }).first().click();
await A.goto(`${BASE}/members/open-invite`, { waitUntil: 'networkidle' }); // away, so the chat stays unread for her
for (const who of [cora, dex]) await action('thread.markChatRead', [chatId], who.session);
await sleep(1100);
await sendUi(B, 'Anyone there?');
await waitFor(() => bodies().includes('Anyone there?'), 'Gabe writes while the others are away');
const sentAt = new Date(sql1(`select created_at from messages where chat_id = ${q(chatId)} and body = 'Anyone there?'`).created_at).getTime();
const nudges = (who) => logRows(`member_id = ${q(who.id)} and template = 'new-message' and chat_id = ${q(chatId)}`);
await cronAt('reminders', sentAt + 16 * MIN);
eq(nudges(cora).map((r) => [r.channel, r.status]), [['email', 'sent']], 'Cora (Email on, not muted) gets the new-message email after 15 minutes');
eq(nudges(hana).length, 0, 'Hana muted the chat: no email (message_log has none)');
eq(nudges(dex).length, 0, 'Dex turned Email off: no email');
eq(nudges(gabe).length, 0, 'the sender gets none');
const state = await fakeState();
const coraMail = (state.emails ?? []).find((e) => JSON.stringify(e.to ?? '').includes(cora.email) && /^New message in/.test(e.subject ?? ''));
ok(coraMail && /^New message in Bm chat plan/.test(coraMail.subject ?? ''), `the email names the chat only: "${coraMail?.subject}"`);
ok(coraMail && !JSON.stringify(coraMail).includes('Anyone there?'), 'and never the message');
await A.goto(threadUrl(), { waitUntil: 'networkidle' });
await A.getByRole('button', { name: 'Chat info' }).click();
await A.getByRole('switch', { name: /Mute notifications/ }).click();
await waitFor(() => sql1(`select muted from chat_members where chat_id = ${q(chatId)} and member_id = ${q(hana.id)}`).muted === false, 'and unmutes it');
await A.getByRole('button', { name: 'Close' }).first().click();

// ---------------------------------------------------------------- block in a shared plan chat (decision 6 A)
await A.getByRole('button', { name: 'Chat info' }).click();
await A.getByRole('button', { name: /^Block a member/ }).click();
await A.locator('.msg-sheet').getByRole('button', { name: /^Gabe/ }).click();
ok(await A.getByRole('heading', { name: 'Block Gabe?' }).isVisible(), 'the block dialog: "Block Gabe?"');
await A.getByRole('button', { name: 'Block Gabe' }).click();
await waitFor(() => sql1(`select count(*)::int n from blocks where blocker_id = ${q(hana.id)} and blocked_id = ${q(gabe.id)}`).n === 1, 'the block is saved');
await waitFor(async () => !(await A.getByRole('heading', { name: 'Block Gabe?' }).count()), 'the dialog closes');
ok(!(await bubbles(A)).some((t) => t.includes('Ring me on 07700')), 'Hana no longer sees Gabe\'s messages, at once');
ok((await bubbles(A)).includes('Hello from Hana'), 'her own are still there');
await A.goto(`${BASE}/members/open-invite`, { waitUntil: 'networkidle' });
await B.reload({ waitUntil: 'networkidle' });
await sendUi(B, 'Can you see this?');
await bubble(B, 'Can you see this?').waitFor();
await waitFor(() => bodies().includes('Can you see this?'), 'Gabe can still write in the shared plan chat');
ok((await bubbles(B)).includes('Hello from Hana'), 'Gabe still sees Hana\'s messages');
ok(!/block/i.test(await B.locator('main').innerText()), 'and nothing tells Gabe he was blocked');
const coraSees = await thread(cora);
ok(coraSees.items.some((i) => i.text === 'Can you see this?'), 'everyone else still sees Gabe');
const hanaSees = await thread(hana);
ok(!hanaSees.items.some((i) => i.kind === 'text' && i.senderId === gabe.id), 'the server gives Hana none of Gabe\'s messages');
eq((await counts(hana)).chats, 0, 'and Gabe\'s new message is not unread for her');
await A.goto(threadUrl(), { waitUntil: 'networkidle' });
await sleep(3500);
ok(!(await bubbles(A)).some((t) => t.includes('Can you see this?')), 'Hana\'s open thread never shows it, poll after poll');
const planB = await postPlan(hana, { title: 'Bm second plan', places: 4 });
eq((await getPage(`/members/messages/ask-${planB}`, gabe.session)).status, 404, 'Gabe cannot open a question to Hana (a 404)');
const ask = await sendAs(gabe, 'Can I ask something?', 'bm-ask-1', `ask-${planB}`);
ok(!ask.ok && ['blocked', 'not_found'].includes(ask.reason), `nor start one by sending (${ask.reason})`);
eq(sql1(`select count(*)::int n from chats where plan_id = ${q(planB)} and kind = 'question'`).n, 0, 'no question chat was made');

// ---------------------------------------------------------------- report a message, a member and a photo (Cora, on a computer)
const C = await loggedIn(cora, { width: 1280, height: 900 });
await C.goto(threadUrl(), { waitUntil: 'networkidle' });
const target = C.locator('.msg-b', { hasText: 'Ring me on 07700 900456' });
await target.click({ button: 'right' });
await C.getByRole('menuitem', { name: 'Report message' }).click();
ok(await C.getByRole('heading', { name: 'Report this message' }).isVisible(), 'a right click (a long press on a phone): "Report message", then the sheet');
await C.getByRole('radio', { name: 'Pressure to pay outside the app' }).click();
const reportsBefore = sql1(`select count(*)::int n from reports where reporter_id = ${q(cora.id)}`).n;
await C.getByRole('button', { name: 'Send report' }).click();
await C.getByRole('heading', { name: 'Report sent.' }).waitFor();
const msgReport = sql1(`select * from reports where reporter_id = ${q(cora.id)} order by created_at desc limit 1`);
eq([msgReport.kind, msgReport.reason, msgReport.member_id, msgReport.chat_id, msgReport.status], ['message', 'pay_outside', gabe.id, chatId, 'open'], 'the message report is saved with its reason');
ok(msgReport.message_id && sql1(`select body from messages where id = ${q(msgReport.message_id)}`).body.startsWith('Ring me on'), 'about that message');
await waitFor(() => logRows(`report_id = ${q(msgReport.id)}`).some((r) => r.to_address === ALERTS && r.status === 'sent'), 'the club is emailed');
ok(true, `the club is emailed about it (${ALERTS})`);
ok(await C.getByRole('button', { name: 'Block Gabe too' }).isVisible(), '"Report sent." offers "Block Gabe too"');
await C.getByRole('button', { name: 'Done' }).click();
await C.getByRole('button', { name: 'Chat info' }).click();
await C.getByRole('button', { name: /^Report a member/ }).click();
await C.locator('.msg-sheet').getByRole('button', { name: /^Gabe/ }).click();
eq(await C.getByRole('radio').count(), 7, 'a member report has seven reasons');
await C.getByRole('radio', { name: 'Rude or unkind' }).click();
await C.getByRole('button', { name: 'Send report' }).click();
await C.getByRole('heading', { name: 'Report sent.' }).waitFor();
await C.getByRole('button', { name: 'Done' }).click();
await C.getByRole('button', { name: 'Chat info' }).click();
await C.getByRole('button', { name: /^Report a photo/ }).click();
await C.locator('.msg-sheet').getByRole('button', { name: /^Gabe/ }).click();
eq(await C.getByRole('radio').allInnerTexts().then((t) => t.map((x) => x.trim())), ['It isn’t them', 'It isn’t suitable', 'Something else'], 'a photo report: three choices');
await C.getByRole('radio', { name: 'It isn’t them' }).click();
await C.getByRole('button', { name: 'Send report' }).click();
await C.getByRole('heading', { name: 'Report sent.' }).waitFor();
await C.getByRole('button', { name: 'Done' }).click();
const all = sql(`select kind, reason from reports where reporter_id = ${q(cora.id)} order by created_at`);
eq(all.length - reportsBefore, 3, 'three reports from Cora');
eq(all.slice(-2).map((r) => [r.kind, r.reason]), [['member', 'rude'], ['photo', 'not_them']], 'a member report and a photo report, with their reasons');
const lastTwo = sql(`select id from reports where reporter_id = ${q(cora.id)} order by created_at desc limit 2`);
await waitFor(() => lastTwo.every((r) => logRows(`report_id = ${q(r.id)}`).some((l) => l.to_address === ALERTS)), 'each report emails the club');
ok(true, 'and each one emails the club');

// ---------------------------------------------------------------- leave chat (Cora), and back from the invite
await C.getByRole('button', { name: 'Chat info' }).click();
await C.getByRole('button', { name: /^Leave chat/ }).click();
ok(await C.getByRole('heading', { name: 'Leave this chat?' }).isVisible(), 'the leave dialog');
await C.locator('.msg-dialog').getByRole('button', { name: 'Leave chat' }).click();
await C.waitForURL(/\/members\/messages$/);
ok(sql1(`select left_at from chat_members where chat_id = ${q(chatId)} and member_id = ${q(cora.id)}`).left_at, 'Cora has left the chat');
eq(sql1(`select status from plan_members where plan_id = ${q(planId)} and member_id = ${q(cora.id)}`).status, 'going', 'and her place in the plan stays');
await C.waitForLoadState('networkidle');
ok(!(await C.locator('.msg-row', { hasText: 'Bm chat plan' }).count()), 'the chat is gone from her inbox');
await C.goto(threadUrl(), { waitUntil: 'networkidle' });
ok(await C.locator('textarea.msg-input').isVisible(), 'opening it again from the invite puts her back in');

// ---------------------------------------------------------------- a closed chat: the host cancels; a plan that has passed
await B.goto(threadUrl(), { waitUntil: 'networkidle' });
const cancelled = await action('plan.cancelOpenInvite', [planId], hana.session);
ok(cancelled.result?.ok, 'Hana cancels the plan');
await B.getByText('This chat is closed').waitFor({ timeout: 15000 });
ok(await B.getByText('Hana cancelled this plan.').first().isVisible(), 'Gabe\'s open thread closes by itself: "This chat is closed", "Hana cancelled this plan."');
eq(await B.locator('textarea.msg-input').count(), 0, 'the composer is gone');
eq((await sendAs(gabe, 'Too late')).reason, 'closed', 'and the server refuses a message in it');
const planC = await postPlan(hana, { title: 'Bm past plan', places: 4 });
const pastChat = (await join(gabe, planC)).chatId;
setPlanStart(planC, -25 * 60);
await B.goto(threadUrl(pastChat), { waitUntil: 'networkidle' });
ok(await B.getByText('This chat is closed').isVisible() && await B.getByText('Plan chats close 24 hours after the plan.').first().isVisible(), 'a plan that finished over 24 hours ago: closed, "Plan chats close 24 hours after the plan."');
ok(await B.locator('.msg-pin').getByText('Finished').isVisible(), 'the pin says "Finished"');
await B.goto(`${BASE}/members/messages`, { waitUntil: 'networkidle' });
ok(await B.locator('.msg-group-label', { hasText: 'Closed' }).isVisible(), 'the inbox lists them under "Closed"');
ok(await B.locator('.msg-row.is-closed', { hasText: 'Bm past plan' }).getByText('Closed · read only').isVisible(), '"Closed · read only"');

// ---------------------------------------------------------------- gated members are refused
const pia = await makeMemberWithPhoto('pia', 'paused');
eq(await redirectedTo('/members/messages', pia.session), '/members/membership', 'a paused member: the inbox sends them to the membership gate');
eq(await redirectedTo(`/members/messages/${chatId}`, pia.session), '/members/membership', 'and a thread');
for (const [name, args] of [['messages.getChats', []], ['thread.sendMessage', [{ chatId, text: 'hi', clientId: 'pia-1' }]], ['messages.sendReport', [{ target: { kind: 'member', chatId, memberId: gabe.id }, reason: 'rude' }]]]) {
  eq((await action(name, args, pia.session)).redirect, '/members/membership', `${name}: refused (to the gate)`);
}
const ended = await makeMemberWithPhoto('eli', 'ended');
eq(await redirectedTo('/members/messages', ended.session), '/members/membership', 'an ended member too');

eq(errors, [], 'no page errors in any browser');
await browser.close();
done();
