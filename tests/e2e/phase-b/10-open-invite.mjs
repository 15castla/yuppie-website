// Open Invite on the real pages (stage 2 brief 2.1), driven in Playwright on a production build with the stage 2
// switches on, against the local stack, with real logins (/member-login and the code from the local mailbox):
// post (every form rule, free plans only), the Posted. page, browse (signed photos, the empty feed), I'm in, the
// last place under a race (one gets it, the other the TakenSheet), withdraw (a place opens), the plan page in
// every state (open, in, own, full, cancelled, past, asked), questions to the host and the host's view of them,
// host edit (the people going are told what moved: plan-changed email and Update; a refusal from the server shows
// under the form), host cancel (everyone told), report a plan (the reasons as drawn, the club emailed), Your
// invites and Your plans, blocks either way, gated members refused, paid plans nowhere, the app's own switch, and
// a session that ended mid-page.
//
//   tests/e2e/phase-b/server.sh build && tests/e2e/phase-b/server.sh start prod 3243
//   PHASE_B_BASE=http://localhost:3243 PHASE_B_TAG=bo. node tests/e2e/phase-b/10-open-invite.mjs
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '/home/claude/stack/node_modules/playwright/index.mjs';
import { loginMember } from '/home/claude/stack/tools/login.mjs';
import {
  ALERTS,
  BASE,
  action,
  cookieFor,
  done,
  eq,
  exec,
  fakeState,
  fakesMark,
  fakesSince,
  logRows,
  londonFormDate,
  makeMemberWithPhoto,
  ok,
  page as getPage,
  postPlan,
  q,
  rand,
  redirectedTo,
  setPlanStart,
  sql,
  sql1,
  waitFor,
} from './lib.mjs';

const NATIVE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';
const r = rand();
const planHref = (id) => `${BASE}/members/open-invite/${id}`;
const uuid = /^[0-9a-f-]{36}$/;

// ---------------------------------------------------------------- people (each with an approved photo)
const [host, a, b, c, d, x, y, e, p] = await Promise.all(
  ['hana', 'ari', 'ben', 'cal', 'dee', 'xan', 'yas', 'eve', 'pip'].map((name) => makeMemberWithPhoto(name)),
);

const browser = await chromium.launch();
async function signIn(member, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...options });
  const page = await context.newPage();
  await loginMember(page, BASE, member.email);
  // the buttons work once the page is hydrated
  await page.waitForLoadState('networkidle');
  return { context, page };
}
const dock = (page) => page.locator('.mk-dock');
const dialog = (page) => page.getByRole('dialog');
const card = (page, title) => page.locator('article.oi-card', { has: page.getByRole('heading', { name: title, exact: true }) });
/** Wait (up to 15 s) for the locator to be on screen: pages stream in after the URL changes. */
async function shows(locator, label) {
  try {
    // the phone and the desktop layouts are both in the page (one hidden by CSS): the visible one
    await locator.filter({ visible: true }).first().waitFor({ state: 'visible', timeout: 15000 });
    ok(true, label);
  } catch (err) {
    const shot = path.join(os.tmpdir(), '10-open-invite-fail.png');
    await locator.page().screenshot({ path: shot, fullPage: true }).catch(() => {});
    ok(false, label, `${String(err).split('\n')[0]} (at ${locator.page().url()}, shot ${shot})`);
  }
}
const going = (planId) => sql(`select member_id, role from plan_members where plan_id = ${q(planId)} and status = 'going' order by joined_at`);
const updatesFor = (memberId, planId) => sql(`select kind, actor_id, role, previous_starts_at from updates where member_id = ${q(memberId)} and plan_id = ${q(planId)} order by created_at`);

try {
  // ---------------------------------------------------------------- post (web, 390): every form rule, free only
  const H = await signIn(host);
  eq(new URL(H.page.url()).pathname, '/members/open-invite', 'web: logging in lands on Open Invite (the landing page on the web)');
  const webTabs = await H.page.locator('nav.mk-tabbar a').allInnerTexts();
  eq(webTabs[0]?.trim(), 'Open Invite', 'web: Open Invite is the first tab');
  await H.page.getByRole('link', { name: 'Post an Open Invite' }).first().click();
  await H.page.waitForURL('**/members/open-invite/new');
  const form = H.page.locator('form.oi-form');
  eq(await H.page.getByText('Add a cost').count(), 0, 'post form: no "Add a cost" (free plans only while paid plans are not live)');
  ok(!/£/.test(await H.page.locator('main').innerText()), 'post form: no price anywhere');
  const postButton = dock(H.page).getByRole('button', { name: 'Post Open Invite' });
  await postButton.click();
  for (const words of ['Add a title, a few words is fine.', 'Pick a type so people can find it.', 'Pick a date from today.', 'Say where you’re meeting.']) {
    await shows(form.getByText(words), `post, empty: "${words}"`);
  }
  ok((await postButton.isEnabled()) && (await postButton.getAttribute('aria-disabled')) === null, 'post: the button stays a normal button with errors (decision 3)');
  ok(await H.page.getByLabel('What').evaluate((el) => el === document.activeElement), 'post: tapping it moves focus to the first error');
  await H.page.getByLabel('What').click();
  await H.page.keyboard.type('x'.repeat(56));
  eq((await H.page.getByLabel('What').inputValue()).length, 50, 'What: 50 characters at most');
  await shows(form.getByText('50/50'), 'What: the live counter');
  const title = `Climb ${r}`;
  await H.page.getByLabel('What').fill(title);
  await form.getByRole('button', { name: 'Sport' }).click();
  eq(await form.getByRole('button', { name: 'Sport' }).getAttribute('aria-pressed'), 'true', 'Type: one chip');
  const today = londonFormDate(0);
  await H.page.getByLabel('When').fill(today.date);
  await H.page.getByLabel('Time').fill('00:00');
  await H.page.getByLabel('Where').fill('The Boulder Yard');
  await postButton.click();
  await shows(form.getByText('Pick a time from now.'), 'When: a time earlier today is refused');
  // soon, so the plan is among the first hundred in a shared test database's feed
  const day = londonFormDate(2);
  await H.page.getByLabel('When').fill(day.date);
  await H.page.getByLabel('Time').fill('18:30');
  eq(await H.page.getByLabel('Where').getAttribute('maxlength'), '120', 'Where: 120 characters at most');
  eq(await H.page.getByLabel('Note').getAttribute('maxlength'), '280', 'Note: 280 characters at most');
  ok(await H.page.getByText('A venue or a meeting point, not a home address.').count() === 0, 'Where: the help line goes once a place is in');
  ok(await H.page.getByLabel('I’m going too').isChecked(), 'I’m going too: ticked by default');
  const fewer = H.page.getByRole('button', { name: 'Fewer places' });
  const more = H.page.getByRole('button', { name: 'More places' });
  await fewer.click();
  await fewer.click();
  ok(await fewer.isDisabled(), 'Places: 2 at least');
  for (let i = 0; i < 10; i += 1) await more.click();
  ok(await more.isDisabled(), 'Places: 12 at most');
  for (let i = 0; i < 9; i += 1) await fewer.click();
  await shows(H.page.getByText('You and 2 others'), 'Places: 3, "You and 2 others"');
  await H.page.getByLabel('Note').fill('Shoes at the desk.');
  await postButton.click();
  await H.page.waitForURL(/\/members\/open-invite\/new\/done\?id=/);
  const planId = new URL(H.page.url()).searchParams.get('id');
  ok(uuid.test(planId), 'posted: the Posted. page has the new plan’s id');
  await shows(H.page.locator('h1:visible', { hasText: 'Posted.' }), 'posted: "Posted."');
  await shows(card(H.page, title), 'posted: the new plan as a card');
  eq(await H.page.locator('a:visible', { hasText: 'See my invite' }).first().getAttribute('href'), `/members/open-invite/${planId}`, 'posted: "See my invite" opens the plan');
  const row = sql1(`select title, type, place, note, places, host_going, price_pence, status from plans where id = ${q(planId)}`);
  eq(row, { title, type: 'Sport', place: 'The Boulder Yard', note: 'Shoes at the desk.', places: 3, host_going: true, price_pence: null, status: 'scheduled' }, 'the plan is in the database as posted, free');
  eq(going(planId), [{ member_id: host.id, role: 'host' }], 'the host is going');
  const planChat = sql1(`select id from chats where plan_id = ${q(planId)} and kind = 'plan'`).id;
  eq((await redirectedTo('/members/open-invite/new/done', host.session)), '/members/open-invite/new', 'Posted. with no id goes back to the form');
  eq((await redirectedTo(`/members/open-invite/new/done?id=${planId}`, a.session)), '/members/open-invite/new', 'someone else’s plan id on Posted. goes to the form');

  // ---------------------------------------------------------------- browse and I'm in
  const A = await signIn(a);
  const cardA = card(A.page, title);
  await cardA.waitFor();
  const hostPhoto = await cardA.locator('.oi-by img').getAttribute('src');
  ok(/\/storage\/v1\/object\/sign\/member-photos\//.test(hostPhoto) && /token=/.test(hostPhoto), 'browse: the host’s photo is a signed URL from the private bucket', hostPhoto);
  eq(await cardA.getAttribute('data-state'), 'open', 'browse: the card is open');
  await A.page.getByRole('button', { name: 'Sport' }).click();
  await shows(cardA, 'browse: the Sport chip keeps it');
  await A.page.getByRole('button', { name: 'Culture' }).click();
  ok(!(await cardA.isVisible()), 'browse: the Culture chip hides it');
  await A.page.getByRole('button', { name: 'Any day' }).click();
  await cardA.getByRole('button', { name: 'I’m in' }).click();
  await dialog(A.page).getByRole('heading', { name: 'You’re in.' }).waitFor();
  ok(true, 'I’m in: "You’re in."');
  await shows(dialog(A.page).getByText('Hana can see you’re in.', { exact: false }), 'I’m in: the host can see you’re in');
  eq(await dialog(A.page).getByRole('link', { name: 'Open chat' }).getAttribute('href'), `/members/messages/${planChat}`, 'I’m in: "Open chat" opens the plan chat');
  await dialog(A.page).getByRole('button', { name: 'Done' }).click();
  eq(await cardA.getAttribute('data-state'), 'in', 'browse: the card now says you’re in');
  eq(going(planId).map((g) => g.member_id), [host.id, a.id], 'the place is taken in the database');
  await waitFor(() => updatesFor(host.id, planId).some((u) => u.kind === 'joined' && u.actor_id === a.id), 'the host has the "joined" Update');

  // ---------------------------------------------------------------- the last place: two at once
  const B = await signIn(b);
  const C = await signIn(c);
  await Promise.all([B.page.goto(planHref(planId), { waitUntil: 'networkidle' }), C.page.goto(planHref(planId), { waitUntil: 'networkidle' })]);
  await shows(dock(B.page).getByText('1 place left'), 'plan page, open: "1 place left" in the bar');
  await Promise.all([dock(B.page).getByRole('button', { name: 'I’m in' }).click(), dock(C.page).getByRole('button', { name: 'I’m in' }).click()]);
  await Promise.all([dialog(B.page).waitFor(), dialog(C.page).waitFor()]);
  const sheets = [await dialog(B.page).innerText(), await dialog(C.page).innerText()];
  eq(sheets.filter((t) => t.includes('You’re in.')).length, 1, 'the race: one of the two gets the last place');
  eq(sheets.filter((t) => t.includes('That was the last place.')).length, 1, 'the race: the other sees "That was the last place."');
  const [W, L, winner, loser] = sheets[0].includes('You’re in.') ? [B, C, b, c] : [C, B, c, b];
  eq(await dialog(L.page).getByRole('link', { name: 'Ask Hana' }).getAttribute('href'), `/members/messages/ask-${planId}`, 'the race: "Ask Hana" opens the question thread');
  eq(await dialog(L.page).getByRole('link', { name: 'See other invites' }).getAttribute('href'), '/members/open-invite', 'the race: "See other invites"');
  eq(going(planId).length, 3, 'the race: exactly 3 of 3 going, no double booking');
  eq([going(planId).some((g) => g.member_id === winner.id), going(planId).some((g) => g.member_id === loser.id)], [true, false], 'the race: the place is the winner’s, the other has none');
  await L.page.keyboard.press('Escape');
  await shows(dock(L.page).getByText('Full', { exact: true }), 'plan page, full: the bar says Full');
  await shows(L.page.getByText('All places are taken.'), 'plan page, full: "All places are taken."');
  await waitFor(() => updatesFor(host.id, planId).some((u) => u.kind === 'full'), 'the host has the "full" Update');

  // ---------------------------------------------------------------- withdraw: the place goes back
  await W.page.keyboard.press('Escape');
  await shows(dock(W.page).getByText('You’re in', { exact: true }), 'plan page, in: "You’re in" in the bar');
  await W.page.locator('.oi-tail').getByRole('button', { name: 'Withdraw from this plan' }).click();
  await dialog(W.page).getByRole('heading', { name: 'Withdraw from this plan?' }).waitFor();
  await dialog(W.page).getByRole('button', { name: 'Withdraw' }).click();
  await dialog(W.page).waitFor({ state: 'detached' });
  await shows(dock(W.page).getByRole('button', { name: 'I’m in' }), 'withdraw: the page is open again');
  eq(sql1(`select status from plan_members where plan_id = ${q(planId)} and member_id = ${q(winner.id)}`).status, 'left', 'withdraw: the place went back');
  await waitFor(() => updatesFor(host.id, planId).some((u) => u.kind === 'left' && u.actor_id === winner.id), 'withdraw: the host has the "left" Update');
  await waitFor(() => updatesFor(a.id, planId).some((u) => u.kind === 'place_opened'), 'withdraw: the people going hear a place opened');
  await L.page.reload({ waitUntil: 'networkidle' });
  await dock(L.page).getByRole('button', { name: 'I’m in' }).click();
  await dialog(L.page).getByRole('heading', { name: 'You’re in.' }).waitFor();
  ok(true, 'the member who missed out gets the place that opened');
  await dialog(L.page).getByRole('button', { name: 'Done' }).click();

  // ---------------------------------------------------------------- questions to the host
  const D = await signIn(d);
  await D.page.goto(planHref(planId), { waitUntil: 'networkidle' });
  await shows(D.page.getByText('You can still ask Hana a question.'), 'plan page, full: the notice offers a question');
  const ask = D.page.locator('.oi-tail').getByRole('link', { name: /Ask Hana/ });
  eq(await ask.getAttribute('href'), `/members/messages/ask-${planId}`, 'Ask Hana: the question thread (made on the first message)');
  await ask.click();
  await D.page.waitForURL(`**/members/messages/ask-${planId}`);
  ok(!(await D.page.getByText('Not on the list.').count()), 'Ask Hana: the thread opens');
  const asked = await action('thread.sendMessage', [{ chatId: `ask-${planId}`, text: 'Is it beginner friendly?', clientId: crypto.randomUUID() }], d.session);
  ok(asked.result?.ok && uuid.test(asked.result.chatId), 'the first question makes the question chat', asked.result);
  const questionChat = asked.result.chatId;
  await H.page.goto(planHref(planId), { waitUntil: 'networkidle' });
  const questions = H.page.locator('.oi-detail .mk-show-phone', { has: H.page.getByRole('heading', { name: 'Questions' }) });
  await shows(questions.getByText('Is it beginner friendly?'), 'host view: the question on the plan page');
  eq(await questions.getByRole('link', { name: /Dee/ }).getAttribute('href'), `/members/messages/${questionChat}`, 'host view: it opens the question thread');
  eq((await questions.locator('.oi-n').allInnerTexts()).map((t) => t.trim()), ['1'], 'host view: the unread number on the question');
  await shows(questions.getByText('1 new'), 'host view: "1 new"');
  await shows(dock(H.page).getByRole('link', { name: 'Edit invite' }), 'host view: "Edit invite" in the bar');
  const whoIn = await H.page.locator('.oi-who .oi-person b').allInnerTexts();
  ok(whoIn.includes('Hana') && whoIn.includes('Ari'), 'host view: who is in, with photos', whoIn);
  ok(/You, poster/.test(await H.page.locator('.oi-who').innerText()), 'host view: the host is "You, poster"');
  await H.page.goto(`${BASE}/members/open-invite/yours`, { waitUntil: 'networkidle' });
  const yoursCard = card(H.page, title);
  await shows(yoursCard.getByText('Is it beginner friendly?'), 'Yours: the question sits inside the host’s card');
  await shows(H.page.getByRole('heading', { name: 'Posted by you' }), 'Yours: "Posted by you"');
  await action('thread.sendMessage', [{ chatId: questionChat, text: 'Yes, all levels.', clientId: crypto.randomUUID() }], host.session);
  await H.page.goto(planHref(planId), { waitUntil: 'networkidle' });
  await shows(questions.getByText('Is it beginner friendly?'), 'host view: the question stays once answered');
  eq(await questions.locator('.oi-n').count(), 0, 'host view: no number once it is read (never a "0")');
  eq(await questions.getByText(/new$/).count(), 0, 'host view: and no "new"');
  await D.page.goto(planHref(planId), { waitUntil: 'networkidle' });
  await shows(D.page.locator('.oi-tail').getByText('Your question to Hana'), 'plan page, asked: "Your question to Hana"');
  await shows(D.page.locator('.oi-tail').getByText('Hana: Yes, all levels.'), 'plan page, asked: the host’s reply');

  // ---------------------------------------------------------------- Your invites and Your plans (going and hosting)
  await A.page.goto(`${BASE}/members/open-invite/yours`, { waitUntil: 'networkidle' });
  await shows(A.page.getByRole('heading', { name: 'You’re in' }), 'Yours: "You’re in"');
  await shows(card(A.page, title), 'Yours: the plan under it');
  await A.page.goto(`${BASE}/members/plans`, { waitUntil: 'networkidle' });
  const planRowA = A.page.locator('a', { hasText: title });
  await shows(planRowA, 'Your plans: the Open Invite is listed');
  ok(/You’re in/.test(await planRowA.innerText()), 'Your plans: pill "You’re in" for a guest');
  await H.page.goto(`${BASE}/members/plans`, { waitUntil: 'networkidle' });
  ok(/Yours/.test(await H.page.locator('a', { hasText: title }).innerText()), 'Your plans: pill "Yours" for the host');

  // ---------------------------------------------------------------- host edit: the people going are told what moved
  let mark = fakesMark();
  await H.page.goto(planHref(planId), { waitUntil: 'networkidle' });
  await dock(H.page).getByRole('link', { name: 'Edit invite' }).click();
  await H.page.waitForURL(`**/members/open-invite/${planId}/edit`);
  await shows(H.page.getByRole('heading', { name: 'Edit invite.' }), 'edit: the post form, "Edit invite."');
  eq([await H.page.getByLabel('What').inputValue(), await H.page.getByLabel('Where').inputValue(), await H.page.getByLabel('Time').inputValue()], [title, 'The Boulder Yard', '18:30'], 'edit: filled in with the plan');
  ok(await H.page.getByRole('button', { name: 'Fewer places' }).isDisabled(), 'edit: places never below the 3 going');
  await shows(H.page.getByText('If you change the time or place, everyone who’s in is told.'), 'edit: says the people going are told');
  eq(await H.page.locator('.mk-dock .mk-btn').innerText(), 'Save changes', 'edit: "Save changes"');
  await H.page.getByLabel('Where').fill('Northgate Climbing Wall');
  await H.page.getByLabel('Time').fill('19:00');
  await dock(H.page).getByRole('button', { name: 'Save changes' }).click();
  await H.page.waitForURL(planHref(planId));
  await shows(H.page.locator('.oi-facts').getByText('Northgate Climbing Wall'), 'edit: the plan page shows the new place');
  ok(/19:00/.test(await H.page.locator('.oi-facts').innerText()), 'edit: and the new time');
  ok(sql1(`select changed_at from plans where id = ${q(planId)}`).changed_at, 'edit: the plan is marked changed');
  const goingNow = going(planId).map((g) => g.member_id).filter((id) => id !== host.id);
  eq(goingNow.length, 2, 'two people are going besides the host');
  for (const id of goingNow) {
    await waitFor(() => updatesFor(id, planId).some((u) => u.kind === 'changed' && u.previous_starts_at), `edit: an Update for each person going (${id.slice(0, 8)}), with the old time`);
  }
  await waitFor(() => logRows(`plan_id = ${q(planId)} and template = 'plan-changed' and status = 'sent'`).length === 2, 'edit: the plan-changed email to each person going (message_log)');
  eq(logRows(`plan_id = ${q(planId)} and template = 'plan-changed'`).map((m) => m.member_id).sort(), [...goingNow].sort(), 'edit: to the people going, not the host');
  const changedMail = (await fakeState()).emails.filter((m) => m.to.includes(a.email) && m.subject === `Date or place changed: ${title}`).at(-1);
  ok(changedMail && /The Boulder Yard/.test(changedMail.text) && /Northgate Climbing Wall/.test(changedMail.text) && /19:00/.test(changedMail.text), 'edit: the email shows what changed (was and now)', changedMail?.text?.slice(0, 600));
  ok(fakesSince(mark, 'email').some((m) => m.subject === `Date or place changed: ${title}`), 'edit: sent through the email fake (fakes.jsonl)');
  // a change that moves nothing tells nobody
  await dock(H.page).getByRole('link', { name: 'Edit invite' }).click();
  await H.page.waitForURL('**/edit');
  await H.page.getByLabel('Note').fill('Shoes at the desk. Chalk is free.');
  await dock(H.page).getByRole('button', { name: 'Save changes' }).click();
  await H.page.waitForURL(planHref(planId));
  await shows(H.page.getByText('Chalk is free.', { exact: false }), 'edit: a new note shows');
  eq(logRows(`plan_id = ${q(planId)} and template = 'plan-changed'`).length, 2, 'edit: only the note changed: no new emails');

  // the server refuses: the line under the form (a race: the plan filled while the host was editing)
  const spare = await postPlan(host, { title: `Spare ${r}`, places: 2, hostGoing: false });
  await H.page.goto(`${planHref(spare)}/edit`, { waitUntil: 'networkidle' });
  ok(!(await H.page.getByLabel('I’m going too').isChecked()), 'edit: spare tickets, the host is not going');
  for (const m of [a, b]) eq((await action('invite.joinOpenInvite', [spare], m.session)).result.ok, true, 'meanwhile someone takes a place');
  await H.page.getByLabel('I’m going too').check({ force: true });
  await dock(H.page).getByRole('button', { name: 'Save changes' }).click();
  const formLine = H.page.locator('.oi-form-e');
  await formLine.waitFor();
  await shows(formLine.getByText('There’s no place left for you. Add a place first.'), 'edit refused: the server’s words under the form');
  eq(await formLine.getByRole('alert').count(), 1, 'edit refused: announced (role=alert)');
  await waitFor(() => formLine.evaluate((el) => el === document.activeElement), 'edit refused: focus moves to it', 5000);
  ok(H.page.url().endsWith('/edit'), 'edit refused: still on the form');
  eq(sql1(`select host_going from plans where id = ${q(spare)}`).host_going, false, 'edit refused: nothing saved');

  // ---------------------------------------------------------------- past: the plan page and Yours
  setPlanStart(spare, -60);
  await A.page.goto(planHref(spare), { waitUntil: 'networkidle' });
  await shows(A.page.getByText('This plan has finished.'), 'plan page, past: "This plan has finished."');
  await shows(dock(A.page).getByText('Finished'), 'plan page, past: "Finished" in the bar');
  await shows(A.page.locator('.oi-tail').getByText('Closed. You can still read it.'), 'plan page, past: the plan chat is closed');
  await A.page.goto(`${BASE}/members/open-invite/yours`, { waitUntil: 'networkidle' });
  ok(/You were in/.test(await A.page.locator('.oi-past').innerText()), 'Yours: the past plan under Past, "You were in"');

  // ---------------------------------------------------------------- report a plan (the reasons as drawn)
  mark = fakesMark();
  await A.page.goto(planHref(planId), { waitUntil: 'networkidle' });
  await A.page.locator('.oi-tail').getByRole('button', { name: 'Report this invite' }).click();
  await dialog(A.page).getByRole('heading', { name: 'Report this invite' }).waitFor();
  const reasons = await dialog(A.page).locator('.oi-reason').allInnerTexts();
  eq(reasons.map((t) => t.trim()), ['Payment outside Club Yuppie', 'Price above what it cost', 'Unkind or rude', 'Feels unsafe', 'Not a real plan', 'Something else'], 'report: the six reasons as drawn');
  await shows(dialog(A.page).getByText('Hana won’t be told who reported it.', { exact: false }), 'report: the host is not told who');
  await dialog(A.page).getByText('Not a real plan').click();
  await dialog(A.page).getByRole('button', { name: 'Send report' }).click();
  await dialog(A.page).getByRole('heading', { name: 'Report sent.' }).waitFor();
  ok(true, 'report: "Report sent."');
  const report = sql1(`select id, kind, reason, status, plan_id, member_id from reports where reporter_id = ${q(a.id)} order by created_at desc limit 1`);
  eq([report.kind, report.reason, report.status, report.plan_id, report.member_id], ['plan', 'not_real', 'open', planId, host.id], 'report: stored, about the plan and its host');
  await waitFor(() => logRows(`report_id = ${q(report.id)} and template = 'admin-new-report' and to_address = ${q(ALERTS)}`).length === 1, 'report: the club is emailed (ADMIN_ALERTS_EMAIL)');
  await dialog(A.page).getByRole('button', { name: 'Done' }).click();

  // ---------------------------------------------------------------- blocks, either way
  const walk = await postPlan(host, { title: `Walk ${r}`, places: 6, ...londonFormDate(2, '10:00') });
  const X = await signIn(x);
  await shows(card(X.page, `Walk ${r}`), 'blocks: before, the plan is in the feed');
  eq((await action('messages.blockMember', [{ memberId: host.id }], x.session)).result, { ok: true }, 'blocks: x blocks the host (the real action)');
  await X.page.reload({ waitUntil: 'networkidle' });
  eq(await card(X.page, `Walk ${r}`).count(), 0, 'blocks: a blocked member’s plans never show');
  await X.page.goto(planHref(walk), { waitUntil: 'networkidle' });
  await shows(X.page.getByText('Not on the list.'), 'blocks: their plan page is not found');
  eq((await action('messages.blockMember', [{ memberId: y.id }], host.session)).result, { ok: true }, 'blocks: the host blocks y');
  const Y = await signIn(y);
  eq(await card(Y.page, `Walk ${r}`).count(), 0, 'blocks: the host who blocked you: their plans never show');
  eq((await action('invite.joinOpenInvite', [walk], y.session)).result.reason, 'not_found', 'blocks: and joining is refused on the server');

  // ---------------------------------------------------------------- the empty feed (every host blocked, for this one member)
  const E = await signIn(e);
  let empty = false;
  for (let attempt = 0; attempt < 3 && !empty; attempt += 1) {
    exec(`insert into blocks (blocker_id, blocked_id) select distinct ${q(e.id)}::uuid, host_id from plans where status = 'scheduled' and starts_at > now() on conflict do nothing`);
    await E.page.goto(`${BASE}/members/open-invite`, { waitUntil: 'networkidle' });
    empty = (await E.page.getByText('Be the first. Post a plan and see who’s in.').count()) > 0;
  }
  ok(empty, 'browse, empty: "Be the first. Post a plan and see who’s in."');
  await shows(E.page.getByRole('heading', { name: /No Open Invites/ }), 'browse, empty: "No Open Invites yet."');
  exec(`delete from blocks where blocker_id = ${q(e.id)}`);

  // ---------------------------------------------------------------- host cancel: everyone going is told
  mark = fakesMark();
  await H.page.goto(planHref(planId), { waitUntil: 'networkidle' });
  await H.page.locator('.oi-tail').getByRole('button', { name: 'Cancel this invite' }).click();
  await dialog(H.page).getByRole('heading', { name: 'Cancel this plan?' }).waitFor();
  await shows(dialog(H.page).getByText('Everyone who’s in is told straight away', { exact: false }), 'cancel: says everyone in is told');
  await dialog(H.page).getByRole('button', { name: 'Cancel the plan' }).click();
  await dialog(H.page).getByRole('heading', { name: 'Plan cancelled.' }).waitFor();
  await shows(dialog(H.page).getByText('Everyone who was in has been told.'), 'cancel: "Plan cancelled."');
  await dialog(H.page).getByRole('button', { name: 'Done' }).click();
  await shows(H.page.getByText('You cancelled this invite.'), 'plan page, cancelled (host): "You cancelled this invite."');
  await shows(dock(H.page).getByText('Cancelled'), 'plan page, cancelled: "Cancelled" in the bar');
  eq(sql1(`select status from plans where id = ${q(planId)}`).status, 'cancelled', 'cancel: stored');
  for (const id of goingNow) await waitFor(() => updatesFor(id, planId).some((u) => u.kind === 'cancelled'), `cancel: an Update for each person going (${id.slice(0, 8)})`);
  await waitFor(() => logRows(`plan_id = ${q(planId)} and template = 'plan-cancelled' and status = 'sent'`).length === 2, 'cancel: the plan-cancelled email to each person going (message_log)');
  ok(fakesSince(mark, 'email').filter((m) => m.subject === `Cancelled: ${title}`).length === 2, 'cancel: sent through the email fake');
  await A.page.goto(planHref(planId), { waitUntil: 'networkidle' });
  await shows(A.page.getByText('Hana cancelled this invite.'), 'plan page, cancelled (guest): "Hana cancelled this invite."');
  await A.page.goto(`${BASE}/members/open-invite`, { waitUntil: 'networkidle' });
  eq(await card(A.page, title).count(), 0, 'browse: a cancelled plan is off the list');
  eq((await redirectedTo(`/members/open-invite/${planId}/edit`, host.session)), `/members/open-invite/${planId}`, 'edit: a cancelled plan cannot be edited (back to its page)');
  ok(/NEXT_HTTP_ERROR_FALLBACK;404/.test((await getPage(`/members/open-invite/${walk}/edit`, a.session)).text), 'edit: someone else’s plan is "Not on the list." (the page’s notFound)');
  eq((await getPage(`/members/open-invite/${walk}/edit`, y.session)).status, 404, 'edit: a plan you may not see is a real 404');

  // ---------------------------------------------------------------- paid plans: nothing that takes money
  const priced = sql1('select gen_random_uuid() id').id;
  exec(`insert into plans (id, host_id, title, type, starts_at, place, places, price_pence, face_value_confirmed) values (${q(priced)}, ${q(host.id)}, ${q(`Priced ${r}`)}, 'Culture', now() + interval '4 days', 'The Bell Room', 3, 2200, true)`);
  await A.page.goto(`${BASE}/members/open-invite`, { waitUntil: 'networkidle' });
  eq(await card(A.page, `Priced ${r}`).count(), 0, 'paid: a plan with a price is not in the feed');
  ok(!/£|and join|Pay /.test(await A.page.locator('main').innerText()), 'paid: no price and no pay button on browse');
  eq((await getPage(`/members/open-invite/${priced}`, a.session)).status, 404, 'paid: its page is a 404');
  eq((await getPage(`/members/open-invite/${walk}/receipt`, a.session)).status, 404, 'paid: no receipt page');
  eq((await getPage('/members/you/payments', a.session)).status, 404, 'paid: no payments page');
  exec(`delete from plans where id = ${q(priced)}`);

  // ---------------------------------------------------------------- a session that ended on the page
  await B.page.goto(planHref(walk), { waitUntil: 'networkidle' });
  await B.context.clearCookies();
  await dock(B.page).getByRole('button', { name: 'I’m in' }).click();
  await B.page.waitForURL(/\/member-login\?state=session-ended/);
  ok(true, 'session ended: I’m in goes to Log in with "Your session ended."');
  eq(going(walk).some((g) => g.member_id === b.id), false, 'session ended: nothing was joined');

  // ---------------------------------------------------------------- gated members are refused
  exec(`update members set membership_status = 'paused', paused_at = now() where id = ${q(p.id)}`);
  for (const path of ['/members/open-invite', `/members/open-invite/${walk}`, '/members/open-invite/new', '/members/open-invite/yours', `/members/open-invite/${walk}/edit`]) {
    eq(await redirectedTo(path, p.session), '/members/membership', `paused: ${path} goes to the membership gate`);
  }
  const pausedJoin = await action('invite.joinOpenInvite', [walk], p.session);
  ok(pausedJoin.redirect === '/members/membership' || pausedJoin.result?.ok === false, 'paused: I’m in is refused', pausedJoin);
  eq(going(walk).some((g) => g.member_id === p.id), false, 'paused: nothing was joined');
  const P = await signIn(p);
  eq(new URL(P.page.url()).pathname, '/members/membership', 'paused: logging in lands on the gate, not Open Invite');

  // ---------------------------------------------------------------- the app: hidden while its own switch is off
  const App = await signIn(a, { userAgent: NATIVE_UA });
  eq(new URL(App.page.url()).pathname, '/members/events', 'app: logging in lands on Events (Open Invite hidden in the app)');
  const appTabs = (await App.page.locator('nav.mk-tabbar a').allInnerTexts()).map((t) => t.trim());
  ok(appTabs.length > 0 && !appTabs.includes('Open Invite'), 'app: no Open Invite tab', appTabs);
  await App.page.goto(`${BASE}/members/open-invite`, { waitUntil: 'networkidle' });
  await shows(App.page.getByText('Not on the list.'), 'app: Open Invite is a 404');
  const back = App.page.getByRole('link', { name: /Back to/ }).first();
  eq(await back.innerText(), 'Back to Events', 'app: the 404 goes back to Events, not Open Invite');
  await App.page.goto(planHref(walk), { waitUntil: 'networkidle' });
  await shows(App.page.getByText('Not on the list.'), 'app: a plan page is a 404');
  const asApp = (name, args) =>
    fetch(`${BASE}/api/test-hooks/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': NATIVE_UA, cookie: cookieFor(a.session) }, body: JSON.stringify({ args }) }).then((res) => res.json());
  eq(await asApp('invite.joinOpenInvite', [walk]), { notFound: true }, 'app: the Open Invite actions are a 404 in the app too');
  eq((await action('invite.joinOpenInvite', [walk], a.session)).result.ok, true, 'web: the same member joins it on the web');
  await App.page.goto(`${BASE}/members/plans`, { waitUntil: 'networkidle' });
  eq(await App.page.locator('a', { hasText: `Walk ${r}` }).count(), 0, 'app: Your plans has no Open Invite rows');
} finally {
  await browser.close();
}
done();
