// Open Invite on the server (brief 2.1): post with every form rule, the feed (blocks either way, cancelled,
// past, paused hosts, priced plans all hidden), the plan page in its states, I'm in under the row lock (no
// double joins, the host cannot join, the last place under concurrency), withdraw, host edit (too few places,
// a moved plan tells the people going), host cancel (tells everyone), report a plan, Yours, Your plans, the
// app's own switch, and that nothing takes money.
import { action, done, emailsTo, eq, exec, fakesMark, logRows, makeMemberWithPhoto, ok, page, planInput, planRow, postPlan, q, redirectedTo, setPlanStart, sql, sql1, waitFor, ALERTS, BASE } from './lib.mjs';

const host = await makeMemberWithPhoto('ph');
const guest = await makeMemberWithPhoto('pg');
const other = await makeMemberWithPhoto('po');
const paused = await makeMemberWithPhoto('pp');

// ---------------------------------------------------------------- post: every rule again on the server
const post = (over, who = host) => action('invite.postOpenInvite', [planInput(over)], who.session);
const errs = async (over) => (await post(over)).result;
eq((await errs({ title: '   ' })).errors.title, 'Add a title, a few words is fine.', 'empty title refused with the form\'s words');
eq((await errs({ title: 'x'.repeat(51) })).errors.title, 'Keep the title to 50 characters.', 'a title over 50 characters refused');
eq((await errs({ type: 'Dancing' })).errors.type, 'Pick a type so people can find it.', 'a type not in the list refused');
eq((await errs({ date: '2020-01-01' })).errors.date, 'Pick a date from today.', 'a past date refused');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
eq((await errs({ date: today, time: '00:00' })).errors.time, 'Pick a time from now.', 'a time earlier today refused');
eq((await errs({ where: '' })).errors.where, 'Say where you’re meeting.', 'no place refused');
eq((await errs({ places: 13 })).error, 'Pick between 2 and 12 places.', '13 places refused');
eq((await errs({ places: 1 })).error, 'Pick between 2 and 12 places.', '1 place refused');
eq((await errs({ note: 'n'.repeat(281) })).error, 'Keep the note to 280 characters.', 'a note over 280 refused');
eq((await errs({ cost: { pricePence: 2200, faceValueConfirmed: true } })).errors.price, 'Paid plans aren’t open yet. Turn off Add a cost to post it free.', 'a cost is refused: nothing in stage 2 takes money');
eq(sql1(`select count(*)::int n from plans where host_id = ${q(host.id)}`).n, 0, 'none of those made a plan');

const posted = await post({ title: 'Climbing test', places: 3, note: '  Shoes at the desk.  ' });
ok(posted.result.ok && posted.result.id, 'a good plan posts', posted.result);
const planId = posted.result.id;
const invite = posted.result.invite;
eq([invite.title, invite.where, invite.places, invite.hostGoing, invite.status, invite.you.role, invite.note], ['Climbing test', 'Calder Park', 3, true, 'scheduled', 'host', 'Shoes at the desk.'], 'it answers the plan as the host sees it (note trimmed)');
eq(invite.going.map((g) => g.id), [host.id], 'the host is going (I’m going too, by default)');
ok(invite.you.chatId, 'the host has the plan chat');
eq(sql(`select system_event from messages where chat_id = ${q(invite.you.chatId)}`).map((r) => r.system_event), ['opened'], 'the chat starts with "opened"');
eq(invite.cost, null, 'no cost');
const spare = await post({ title: 'Spare tickets', hostGoing: false, places: 2 });
eq([spare.result.invite.hostGoing, spare.result.invite.going.length], [false, 0], 'spare tickets: the host is not going and the places are all for others');

// ---------------------------------------------------------------- the feed
const feedIds = async (who) => (await action('invite.getOpenInviteFeed', [], who.session)).result.invites.map((i) => i.id);
ok((await feedIds(guest)).includes(planId), 'the plan is in another member\'s feed');
const feed = (await action('invite.getOpenInviteFeed', [], guest.session)).result;
const card = feed.invites.find((i) => i.id === planId);
eq([card.you.role, card.you.chatId, card.you.askThreadId], ['guest', null, `ask-${planId}`], 'a guest: no chat yet, "Ask" goes to the ask-<plan> thread');
ok(feed.me.id === guest.id && feed.me.photoUrl, 'the feed carries the member themselves, with their photo');
ok(feed.invites.every((i, n, list) => n === 0 || list[n - 1].startsAt <= i.startsAt), 'soonest first');
exec(`insert into blocks values (${q(guest.id)}, ${q(host.id)})`);
ok(!(await feedIds(guest)).includes(planId), 'a member who blocked the host no longer sees the plan');
eq((await action('plan.getOpenInvitePage', [planId], guest.session)).result, null, 'nor its page');
exec(`delete from blocks where blocker_id = ${q(guest.id)}; insert into blocks values (${q(host.id)}, ${q(guest.id)})`);
ok(!(await feedIds(guest)).includes(planId), 'nor does a member the host blocked');
eq((await action('invite.joinOpenInvite', [planId], guest.session)).result.reason, 'not_found', 'and they cannot join it');
exec(`delete from blocks where blocker_id = ${q(host.id)}`);
ok((await feedIds(guest)).includes(planId), 'unblocked: back in the feed');
exec(`update members set membership_status = 'paused', paused_at = now() where id = ${q(paused.id)}`);
const pausedPlan = sql1(`select gen_random_uuid() id`).id;
exec(`insert into plans (id, host_id, title, type, starts_at, place, places) values (${q(pausedPlan)}, ${q(paused.id)}, 'Paused host plan', 'Sport', now() + interval '3 days', 'Somewhere', 4)`);
ok(!(await feedIds(guest)).includes(pausedPlan), 'a paused host\'s plans are not in the feed');
const priced = sql1(`select gen_random_uuid() id`).id;
exec(`insert into plans (id, host_id, title, type, starts_at, place, places, price_pence, face_value_confirmed) values (${q(priced)}, ${q(other.id)}, 'Priced plan', 'Culture', now() + interval '3 days', 'Somewhere', 4, 2200, true)`);
ok(!(await feedIds(guest)).includes(priced), 'a plan with a price is never shown while paid plans are not live');
eq((await action('plan.getOpenInvitePage', [priced], guest.session)).result, null, 'nor its page');
eq((await page(`/members/open-invite/${priced}`, guest.session)).status, 404, 'the page 404s');
eq((await action('invite.joinOpenInvite', [priced], guest.session)).result.ok, false, 'and it cannot be joined');
eq(sql1(`select count(*)::int n from plan_members where plan_id = ${q(priced)}`).n, 0, 'nobody is in it');

// ---------------------------------------------------------------- I'm in
const mark = fakesMark();
const joined = await action('invite.joinOpenInvite', [planId], guest.session);
ok(joined.result.ok && joined.result.invite.you.role === 'going' && joined.result.chatId, 'I’m in: the member is going and has the plan chat', joined.result);
eq(joined.result.invite.going.map((g) => g.id), [host.id, guest.id], 'going, in the order they said yes');
eq(sql(`select system_event, about_member_id from messages where chat_id = ${q(joined.result.chatId)} and kind = 'system' order by created_at`).map((r) => r.system_event), ['opened', 'joined'], 'the chat says they are in');
eq(sql(`select kind, actor_id, role from updates where member_id = ${q(host.id)} and plan_id = ${q(planId)}`), [{ kind: 'joined', actor_id: guest.id, role: 'host' }], 'the host gets a "joined" Update');
eq((await action('invite.joinOpenInvite', [planId], guest.session)).result.ok, true, 'joining again is fine');
eq(sql1(`select count(*)::int n from plan_members where plan_id = ${q(planId)} and member_id = ${q(guest.id)}`).n, 1, 'and does not double join');
eq(sql1(`select count(*)::int n from updates where member_id = ${q(host.id)} and plan_id = ${q(planId)}`).n, 1, 'nor send a second Update');
const self = await action('invite.joinOpenInvite', [planId], host.session);
eq(self.result.reason, 'host', 'the host cannot join their own plan as a guest');

// The last place, five members at once: one gets it.
const racers = await Promise.all([1, 2, 3, 4, 5].map((n) => makeMemberWithPhoto(`pr${n}`)));
const results = await Promise.all(racers.map((r) => action('invite.joinOpenInvite', [planId], r.session)));
const winners = results.filter((r) => r.result.ok);
eq(winners.length, 1, 'five at once for the last place: exactly one is in');
ok(results.filter((r) => !r.result.ok).every((r) => r.result.reason === 'full' && r.result.error === 'The last place has gone.'), 'the others are told it is full', results.map((r) => r.result.reason));
eq(sql1(`select count(*)::int n from plan_members where plan_id = ${q(planId)} and status = 'going'`).n, 3, 'the plan has exactly its 3 places taken');
const winner = racers[results.findIndex((r) => r.result.ok)];
await waitFor(() => sql(`select kind from updates where plan_id = ${q(planId)} and kind = 'full'`).length === 2, 'full: an Update for the host and for the member already going (not the one who filled it)');
eq(sql(`select member_id from updates where plan_id = ${q(planId)} and kind = 'full' order by member_id`).map((r) => r.member_id).sort(), [host.id, guest.id].sort(), 'to the host and the earlier guest');
eq(emailsTo(mark, host.email).length, 0, 'joining sends the host no email (Updates only, as the table says)');

// ---------------------------------------------------------------- withdraw
const left = await action('invite.withdrawFromOpenInvite', [planId], winner.session);
ok(left.result.ok && left.result.invite.you.role === 'guest', 'withdraw: no longer going', left.result);
eq(sql1(`select left_reason from chat_members where chat_id = ${q(joined.result.chatId)} and member_id = ${q(winner.id)}`).left_reason, 'withdrew', 'and out of the plan chat');
ok(sql(`select 1 from updates where member_id = ${q(host.id)} and plan_id = ${q(planId)} and kind = 'left' and actor_id = ${q(winner.id)}`).length === 1, 'the host gets a "left" Update');
ok(sql(`select 1 from updates where member_id = ${q(guest.id)} and plan_id = ${q(planId)} and kind = 'place_opened'`).length === 1, 'a full plan with a place again: "place opened" for the member going');
eq((await action('invite.withdrawFromOpenInvite', [planId], winner.session)).result.reason, 'not_in', 'withdrawing again: not in');
eq((await action('invite.withdrawFromOpenInvite', [planId], host.session)).result.reason, 'host', 'the host cannot withdraw (they cancel)');
const rejoin = await action('invite.joinOpenInvite', [planId], winner.session);
ok(rejoin.result.ok, 'they can join again while there is a place');
eq(sql1(`select left_at from chat_members where chat_id = ${q(joined.result.chatId)} and member_id = ${q(winner.id)}`).left_at, null, 'and are back in the chat');
await action('invite.withdrawFromOpenInvite', [planId], winner.session);

// ---------------------------------------------------------------- the plan page in its states
const pageOf = async (who, id = planId) => (await action('plan.getOpenInvitePage', [id], who.session)).result;
eq((await pageOf(host)).invite.you.role, 'host', 'page: the host sees "your own"');
eq((await pageOf(guest)).invite.you.role, 'going', 'page: the guest sees "you’re in"');
eq((await pageOf(other)).invite.you.role, 'guest', 'page: someone else sees "open"');
// A question, and the host's answer (asked state; the host's question list).
const ask = await action('thread.sendMessage', [{ chatId: `ask-${planId}`, text: 'Do I need my own shoes?', clientId: 'ask-1' }], other.session);
ok(ask.result.ok && ask.result.chatId !== `ask-${planId}`, 'a first question makes the question chat', ask.result);
const hostView = await pageOf(host);
eq(hostView.invite.you.questions.map((x) => [x.from.id, x.text, x.unread]), [[other.id, 'Do I need my own shoes?', 1]], 'the host sees who asked, what, and that it is unread');
await action('thread.sendMessage', [{ chatId: ask.result.chatId, text: 'No, hire them at the desk.', clientId: 'reply-1' }], host.session);
const asked = await pageOf(other);
eq([asked.invite.you.askThreadId, asked.invite.you.hostReply], [ask.result.chatId, 'No, hire them at the desk.'], 'the asker\'s page: "Ask" goes to their chat and shows the host\'s reply');

// ---------------------------------------------------------------- edit
const edit = (over, who = host) => action('plan.editOpenInvite', [planId, planInput({ title: 'Climbing test', places: 3, ...over })], who.session);
eq((await edit({ places: 2 }, guest)).result.error, 'That plan couldn’t be found.', 'only the host can edit');
const fewer = await edit({ places: 2, hostGoing: true });
ok(fewer.result.ok, 'two places for two people going is fine');
exec(`update plans set places = 3 where id = ${q(planId)}`);
const tooFew = await action('invite.joinOpenInvite', [planId], other.session);
ok(tooFew.result.ok, 'a third member joins');
eq((await edit({ places: 2 })).result.error, '3 people are going, so keep at least 3 places.', 'an edit to fewer places than people going is refused: nobody is taken off');
eq((await edit({ cost: { pricePence: 1000, faceValueConfirmed: true } })).result.errors.price, 'Paid plans aren’t open yet. Turn off Add a cost to post it free.', 'an edit cannot add a cost');
const before = planRow(planId);
const mark2 = fakesMark();
const moved = await edit({ ...{ date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 6 * 86400000)), time: '19:00' }, where: 'The Boulder Yard' });
ok(moved.result.ok && moved.result.invite.where === 'The Boulder Yard', 'the host moves the plan (time and place)', moved.result);
ok(planRow(planId).changed_at, 'changed_at recorded');
const changed = sql(`select member_id, actor_id, previous_starts_at from updates where plan_id = ${q(planId)} and kind = 'changed' order by member_id`);
eq(changed.map((r) => r.member_id).sort(), [guest.id, other.id].sort(), 'a "changed" Update for each member going (not the host)');
ok(changed.every((r) => r.actor_id === host.id && new Date(r.previous_starts_at).getTime() === new Date(before.starts_at).getTime()), 'with the host and the time it was');
await waitFor(() => logRows(`plan_id = ${q(planId)} and template = 'plan-changed' and status = 'sent'`).length === 2, 'the plan-changed email to both, logged as sent');
const changedMail = emailsTo(mark2, guest.email).find((e) => /Date or place changed/.test(e.subject ?? ''));
ok(changedMail, 'the email went through Resend with the designed subject', emailsTo(mark2, guest.email).map((e) => e.subject));
const noteOnly = await edit({ ...{ date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 6 * 86400000)), time: '19:00' }, where: 'The Boulder Yard', title: 'Climbing, renamed', note: 'New note' });
ok(noteOnly.result.ok, 'a title or note change saves');
eq(sql1(`select count(*)::int n from updates where plan_id = ${q(planId)} and kind = 'changed'`).n, 2, 'and tells nobody (only time and place changes do)');

// ---------------------------------------------------------------- report a plan
const mark3 = fakesMark();
const rep = await action('invite.reportOpenInvite', [planId, 'Not a real plan'], other.session);
ok(rep.result.ok && !rep.result.duplicate, 'report a plan (the sheet sends the label)', rep.result);
eq(sql1(`select kind, reason, member_id, plan_id, status from reports where id = ${q(rep.result.reportId)}`), { kind: 'plan', reason: 'not_real', member_id: host.id, plan_id: planId, status: 'open' }, 'stored with the reason id and the host as who it is about');
await waitFor(() => logRows(`report_id = ${q(rep.result.reportId)} and template = 'admin-new-report' and status = 'sent'`).length === 1, 'the club is emailed (admin-new-report)');
ok(emailsTo(mark3, ALERTS).length === 1, `to ADMIN_ALERTS_EMAIL (${ALERTS})`);
const again = await action('invite.reportOpenInvite', [planId, 'not_real'], other.session);
eq([again.result.reportId, again.result.duplicate], [rep.result.reportId, true], 'the same report again (by id this time) is the same report');
eq(logRows(`template = 'admin-new-report' and report_id = ${q(rep.result.reportId)}`).length, 1, 'and no second email');
eq((await action('invite.reportOpenInvite', [planId, 'other'], host.session)).result.ok, false, 'a host cannot report their own plan');
eq((await action('invite.reportOpenInvite', [planId, 'made up'], guest.session)).result.error, 'Pick a reason.', 'a reason that is not on the list is refused');

// ---------------------------------------------------------------- Yours and Your plans
const yours = (await action('invite.getOpenInviteYours', [], host.session)).result;
eq(yours.posted.map((p) => p.id).sort(), [planId, spare.result.id].sort(), 'Yours: posted');
const gYours = (await action('invite.getOpenInviteYours', [], guest.session)).result;
eq(gYours.joined.map((p) => p.id), [planId], 'Yours: joined');
const plansPage = await page('/members/plans', guest.session);
ok(plansPage.status === 200 && plansPage.text.includes('Climbing, renamed'), 'Your plans lists the Open Invite plan they are going to');

// ---------------------------------------------------------------- cancel
const mark4 = fakesMark();
eq((await action('plan.cancelOpenInvite', [planId], guest.session)).result.error, 'That plan couldn’t be found.', 'only the host can cancel');
const cancelled = await action('plan.cancelOpenInvite', [planId], host.session);
ok(cancelled.result.ok && cancelled.result.invite.status === 'cancelled', 'the host cancels', cancelled.result);
eq(sql(`select member_id, actor_id from updates where plan_id = ${q(planId)} and kind = 'cancelled' order by member_id`).map((r) => [r.member_id, r.actor_id]).sort(), [[guest.id, host.id], [other.id, host.id]].sort(), 'a "cancelled" Update for everyone going');
await waitFor(() => logRows(`plan_id = ${q(planId)} and template = 'plan-cancelled' and status = 'sent'`).length === 2, 'and the plan-cancelled email to each');
ok(emailsTo(mark4, other.email).some((e) => /^Cancelled: /.test(e.subject ?? '')), 'with the designed subject');
eq(sql(`select system_event from messages where chat_id = ${q(joined.result.chatId)} and kind = 'system' order by created_at`).at(-1).system_event, 'cancelled', 'the plan chat gets the "cancelled" line');
ok(!(await feedIds(guest)).includes(planId), 'a cancelled plan leaves the feed');
eq((await pageOf(guest)).invite.status, 'cancelled', 'its page shows the cancelled state to those going');
eq((await action('invite.joinOpenInvite', [planId], racers[4].session)).result.reason, 'cancelled', 'and it cannot be joined');
eq((await action('plan.cancelOpenInvite', [planId], host.session)).result.ok, true, 'cancelling again changes nothing');
eq(sql1(`select count(*)::int n from updates where plan_id = ${q(planId)} and kind = 'cancelled'`).n, 2, 'and tells nobody twice');

// ---------------------------------------------------------------- started and past
const soon = await postPlan(host, { title: 'Starting soon' });
await action('invite.joinOpenInvite', [soon], guest.session);
setPlanStart(soon, -5);
eq((await action('invite.withdrawFromOpenInvite', [soon], guest.session)).result.reason, 'started', 'a started plan cannot be left');
eq((await action('invite.joinOpenInvite', [soon], other.session)).result.reason, 'started', 'nor joined');
eq((await pageOf(guest, soon)).invite.status, 'finished', 'its page reads finished (past)');
ok(!(await feedIds(other)).includes(soon), 'and it is out of the feed');
const gPast = (await action('invite.getOpenInviteYours', [], guest.session)).result;
ok(gPast.past.some((p) => p.id === soon), 'Yours: past');

// ---------------------------------------------------------------- the app's own switch, and the pages
eq((await page('/members/open-invite', guest.session)).status, 200, 'web: Open Invite opens');
eq((await page('/members/open-invite', guest.session, { 'user-agent': 'Mozilla/5.0 YuppieNativeApp' })).status, 404, 'the app: Open Invite is a 404 while its own switch is off (decision 6)');
const appLanding = await fetch(`${BASE}/members`, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 YuppieNativeApp' } });
eq(new URL(appLanding.headers.get('location'), BASE).pathname, '/members/events', 'the app lands on Events');
const webLanding = await fetch(`${BASE}/members`, { redirect: 'manual' });
eq(new URL(webLanding.headers.get('location'), BASE).pathname, '/members/open-invite', 'the web lands on Open Invite');
const noMock = await page('/members/open-invite', guest.session);
ok(!/Example screen|Example content/.test(noMock.text), 'the real page carries no example note');
eq(await redirectedTo(`/members/open-invite/${planId}/receipt`, guest.session), null, 'receipt (paid plans) is not a page...');
eq((await page(`/members/open-invite/${planId}/receipt`, guest.session)).status, 404, '...it is a 404 while paid plans are not live');
eq((await page('/members/you/payments', guest.session)).status, 404, 'You > Payments: 404 too');
done();
