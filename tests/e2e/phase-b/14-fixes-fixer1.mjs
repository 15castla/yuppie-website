// Stage 2 fix round, fixer 1 (backend, privacy): one regression check per finding the reviewers (QB1, QB2, QB3)
// reproduced, through the real actions, REST and the database. The release scripts: 14-fixes-fixer1-release.mjs;
// the migrations on a scratch database: 14-fixes-fixer1-db.mjs.
//   PHASE_B_BASE=http://localhost:3251 PHASE_B_TAG=bx1. node tests/e2e/phase-b/14-fixes-fixer1.mjs
// Every clock here is the real one (no cron in the future: that would claim other agents' reminders early).
import crypto from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  PREFIX, action, adminSession, cron, done, emailsTo, eq, exec, fakeState, fakesMark, fileArg, jpegBase64, logRows, londonFormDate, makeEvent, makeBooking,
  makeMemberWithPhoto, ok, page, planInput, postPlan, q, rest, sleep, sql, sql1, waitFor,
} from './lib.mjs';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
// The fixes are additive and re-runnable: apply them again, in case another agent's 00 re-ran the stage 2 file
// (which puts stage 2's own function bodies and grants back) since.
execFileSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-f', `${ROOT}/supabase/migrations/20261031090000_stage2_fixes.sql`], { stdio: ['ignore', 'pipe', 'pipe'] });

const cid = () => crypto.randomUUID();
const chatOf = (planId) => sql1(`select id from chats where plan_id = ${q(planId)} and kind = 'plan'`).id;
const send = (who, chatId, text) => action('thread.sendMessage', [{ chatId, text, clientId: cid() }], who.session).then((r) => r.result);
const join = (who, planId) => action('invite.joinOpenInvite', [planId], who.session).then((r) => r.result);
const updatesFor = (who) => action('messages.getUpdates', [], who.session).then((r) => r.result);
const AD = await adminSession(PREFIX);
const AD2 = await adminSession(PREFIX);
const cancelLater = [];

// ================================================================ QB1-02 / QB2-01: blocks never hide plan facts
{
  const H = await makeMemberWithPhoto('blkhost', 'active', { full_name: 'Hester Blockhost' });
  const G = await makeMemberWithPhoto('blkguest');
  const O = await makeMemberWithPhoto('blkother');
  const pid = await postPlan(H, { title: 'bx1 block facts', places: 3 });
  for (const m of [G, O]) ok((await join(m, pid)).ok, `${m.email.split('@')[0]} joins`);
  const chat = chatOf(pid);
  eq((await action('messages.blockMember', [{ memberId: H.id, chatId: chat }], G.session)).result, { ok: true }, 'G blocks the host of a plan G is going to');
  const edit = await action('plan.editOpenInvite', [pid, planInput({ title: 'bx1 block facts', places: 3, ...londonFormDate(5, '20:15') })], H.session);
  ok(edit.result.ok, 'the host moves the time');
  const changed = sql(`select member_id, actor_id from updates where plan_id = ${q(pid)} and kind = 'changed'`);
  ok(changed.some((u) => u.member_id === G.id && u.actor_id === null), 'QB1-02: G (who blocked the host) gets the "changed" Update, without the host', changed);
  ok((await updatesFor(G)).some((u) => u.kind === 'changed' && u.plan.id === pid && u.actor === null), 'and it is in G\'s Updates list (not filtered out as the blocked host\'s)');
  await waitFor(() => logRows(`plan_id = ${q(pid)} and member_id = ${q(G.id)} and template = 'plan-changed' and status = 'sent'`).length === 1, 'QB2-01: and the plan-changed email, by G\'s email switch');
  ok((await action('plan.cancelOpenInvite', [pid], H.session)).result.ok, 'the host cancels');
  const cancelled = sql(`select member_id, actor_id from updates where plan_id = ${q(pid)} and kind = 'cancelled'`);
  ok(cancelled.some((u) => u.member_id === G.id && u.actor_id === null) && cancelled.some((u) => u.member_id === O.id && u.actor_id === H.id), 'QB1-02: G gets the "cancelled" Update without the host; O with the host', cancelled);
  await waitFor(() => logRows(`plan_id = ${q(pid)} and member_id = ${q(G.id)} and template = 'plan-cancelled' and status = 'sent'`).length === 1, 'QB2-01: and the plan-cancelled email');
  const gU = (await updatesFor(G)).find((u) => u.kind === 'cancelled' && u.plan.id === pid);
  ok(gU && gU.actor === null, 'the cancel is in G\'s Updates (the screen says "<title> was cancelled")');

  // The host blocked a guest; the guest withdraws from the full plan: the host hears a place opened, not who.
  const H2 = await makeMemberWithPhoto('blkhost2');
  const X = await makeMemberWithPhoto('blkleaver');
  const Y = await makeMemberWithPhoto('blkstayer');
  const p2 = await postPlan(H2, { title: 'bx1 blocked leaver', places: 3 });
  for (const m of [X, Y]) ok((await join(m, p2)).ok, 'joins the plan (now full)');
  eq((await action('messages.blockMember', [{ memberId: X.id, chatId: chatOf(p2) }], H2.session)).result, { ok: true }, 'the host blocks X');
  ok((await action('invite.withdrawFromOpenInvite', [p2], X.session)).result.ok, 'X withdraws from the full plan');
  const hostU = sql(`select kind, actor_id, role from updates where plan_id = ${q(p2)} and member_id = ${q(H2.id)} and kind in ('left', 'place_opened')`);
  eq(hostU, [{ kind: 'place_opened', actor_id: null, role: 'host' }], 'QB1-02: the host who blocked X hears that a place opened (no name), not "X left"');
  cancelLater.push([H2, p2]);
}

// ================================================================ QB1-05: a paused or ended host's plan is closed by link
{
  const K = await makeMemberWithPhoto('pausehost');
  const G = await makeMemberWithPhoto('pausegoing');
  const M = await makeMemberWithPhoto('pauselink');
  const pid = await postPlan(K, { title: 'bx1 paused host', places: 4 });
  ok((await join(G, pid)).ok, 'G is going');
  exec(`update members set membership_status = 'paused', paused_at = now() where id = ${q(K.id)}`);
  eq((await action('plan.getOpenInvitePage', [pid], M.session)).result, null, 'QB1-05: a member with the link cannot open a paused host\'s plan');
  eq((await page(`/members/open-invite/${pid}`, M.session)).status, 404, 'the page is a 404 (the proxy\'s plan_visible_to_me)');
  const j = (await join(M, pid));
  eq([j.ok, j.reason], [false, 'not_found'], 'joining it by link is refused, as not found');
  eq((await send(M, `ask-${pid}`, 'is it on?')).reason, 'not_found', 'asking the host is refused too');
  eq(sql1(`select public.join_plan(${q(M.id)}, ${q(pid)}) ->> 'status' s`).s, 'not_found', 'and the database refuses the join itself');
  eq((await rest('POST', 'rpc/plan_visible_to_me', M.session, { p_plan: pid })).json, false, 'plan_visible_to_me answers false');
  ok((await action('plan.getOpenInvitePage', [pid], G.session)).result?.invite?.id === pid, 'a member already going still sees it');
  exec(`update members set membership_status = 'cancelled', paused_at = null, ended_at = now() where id = ${q(K.id)}`);
  eq((await action('plan.getOpenInvitePage', [pid], M.session)).result, null, 'an ended host\'s plan: the same');
  exec(`update members set membership_status = 'active', ended_at = null where id = ${q(K.id)}`);
  ok((await action('plan.getOpenInvitePage', [pid], M.session)).result?.invite?.id === pid, 'with the host active again it opens');
  cancelLater.push([K, pid]);
}

// ================================================================ QB2-02 / QB3-12: check texts and the daily cap
{
  const T = await makeMemberWithPhoto('textcheck', 'active', { phone: '+447700900611' });
  const checks = () => sql1(`select count(*)::int n from message_log where member_id = ${q(T.id)} and template = 'reminders-on' and status = 'sent'`).n;
  const on = () => action('notifications.setNotificationChannel', ['text', true], T.session).then((r) => r.result);
  const off = () => action('notifications.setNotificationChannel', ['text', false], T.session).then((r) => r.result);
  ok((await on()).ok, 'Text on');
  eq(checks(), 1, 'one check text');
  for (let i = 0; i < 4; i += 1) {
    await off();
    ok((await on()).ok, `Text off and on again (${i + 1})`);
  }
  // The old rule allowed one a minute: make the last check text two minutes old and toggle again.
  exec(`update notification_preferences set text_check_sent_at = now() - interval '2 minutes' where member_id = ${q(T.id)}`);
  exec(`update message_log set created_at = now() - interval '2 minutes' where member_id = ${q(T.id)} and template = 'reminders-on'`);
  await off();
  ok((await on()).ok, 'and again two minutes later');
  eq(checks(), 1, 'QB2-02/QB3-12: still one check text in 24 hours, however often Text is switched (it stays on for that number)');
  // A new number gets its own check text at the next Text on, within the limits (3 check texts a day per member).
  exec(`update members set phone = '+447700900612' where id = ${q(T.id)}`);
  const prefs = (await action('notifications.getNotificationSettings', [], T.session)).result.preferences;
  eq(prefs.channels.text, false, 'a changed number turns texts off');
  ok((await on()).ok, 'Text on for the new number');
  exec(`update members set phone = '+447700900615' where id = ${q(T.id)}`);
  ok((await on()).ok, 'and for a third number');
  eq(sql(`select to_address from message_log where member_id = ${q(T.id)} and template = 'reminders-on' and status = 'sent' order by created_at`).map((r) => r.to_address), ['+447700900611', '+447700900612', '+447700900615'], 'each new number got its one check text');
  exec(`update members set phone = '+447700900616' where id = ${q(T.id)}`);
  const refused = await on();
  eq([refused.ok, refused.reason], [false, 'check_limit'], 'QB3-12: a fourth number in a day: refused, plainly (3 check texts a day at most)');
  eq(refused.error, 'We’ve sent you a check text in the last 24 hours, so try again tomorrow.', 'the words (new, flagged)');
  eq(checks(), 3, 'nothing more sent');
  exec(`update message_log set created_at = now() - interval '25 hours' where member_id = ${q(T.id)} and template = 'reminders-on'`);
  ok((await on()).ok, 'a day later: Text on for it');
  eq(sql1(`select to_address from message_log where member_id = ${q(T.id)} and template = 'reminders-on' and status = 'sent' order by created_at desc limit 1`).to_address, '+447700900616', 'its check text goes');

  // The daily cap on all texts: a member at the cap gets no more today (logged as skipped).
  const U = await makeMemberWithPhoto('textcap', 'active', { phone: '+447700900613' });
  ok((await action('notifications.setNotificationChannel', ['text', true], U.session)).result.ok, 'U: Text on');
  const H = await makeMemberWithPhoto('textcaphost');
  const pid = await postPlan(H, { title: 'bx1 text cap', places: 4 });
  ok((await join(U, pid)).ok, 'U joins a plan');
  exec(`update plans set starts_at = now() + interval '20 hours' where id = ${q(pid)}; update plan_members set joined_at = now() - interval '3 days' where plan_id = ${q(pid)}`);
  for (let i = 0; i < 7; i += 1) exec(`insert into message_log (channel, template, dedupe_key, to_address, member_id, status) values ('sms', 'plan-reminder', ${q(`bx1-cap-${U.id}-${i}`)}, '+447700900613', ${q(U.id)}, 'sent')`);
  eq(sql1(`select count(*)::int n from message_log where member_id = ${q(U.id)} and channel = 'sms' and status = 'sent'`).n, 8, 'U has had 8 texts today (the check and 7 more)');
  await cron('reminders');
  const row = await waitFor(() => sql1(`select status, error from message_log where member_id = ${q(U.id)} and plan_id = ${q(pid)} and channel = 'sms'`), 'the 24-hour plan reminder text was decided');
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  if (hour >= 7 && hour < 22) eq([row.status, row.error], ['skipped', 'daily text limit: 8 in 24 hours'], 'QB3-12: over the daily cap the reminder text is skipped, and logged why');
  else eq(row.status, 'skipped', 'QB3-12: (quiet hours now: the reminder text is held, not sent; the cap is proved on the check text below)');
  ok(logRows(`member_id = ${q(U.id)} and plan_id = ${q(pid)} and channel = 'email' and template = 'plan-reminder'`).some((r) => r.status === 'sent'), 'the email reminder still goes');
  // The cap counts every text, the check text too (sent at any hour: it answers the member's own tap).
  exec(`update members set phone = '+447700900614' where id = ${q(U.id)}`);
  exec(`update notification_preferences set text_check_sent_at = now() - interval '25 hours' where member_id = ${q(U.id)}`);
  const capped = (await action('notifications.setNotificationChannel', ['text', true], U.session)).result;
  eq([capped.ok, capped.reason], [false, 'check_limit'], 'QB3-12: at the daily cap a new number\'s check text is not sent, and Text stays off');
  eq(sql1(`select status, error from message_log where member_id = ${q(U.id)} and template = 'reminders-on' and to_address = '+447700900614'`), { status: 'skipped', error: 'daily text limit: 8 in 24 hours' }, 'logged as skipped, with why');
  cancelLater.push([H, pid]);
}

// ================================================================ QB2-05: a moved club event's reminders follow it
{
  const m = await makeMemberWithPhoto('evmove');
  const ev = await makeEvent('bx1evmove', { price: 0, startInHours: 3 });
  const b = await makeBooking(m, ev);
  exec(`update bookings set booked_at = now() - interval '5 days', reminder_24h_sent_at = now() - interval '20 hours' where id = ${q(b.id)}`);
  exec(`insert into message_log (channel, template, dedupe_key, to_address, member_id, booking_id, event_id, status) values ('email', 'event-reminder', ${q(`event-reminder-24h:${b.id}`)}, ${q(m.email)}, ${q(m.id)}, ${q(b.id)}, ${q(ev.id)}, 'sent')`);
  const e = sql1(`select title, category, location, capacity from events where id = ${q(ev.id)}`);
  const newStart = new Date(Date.now() + 20 * 3600000);
  const local = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(newStart).replace(' ', 'T');
  const up = await action('admin.events.updateEventDetails', [{ $formData: { event_id: ev.id, title: e.title, description: 'Test event', category: e.category, location: e.location, start_time: local, price_pounds: '0', capacity: String(e.capacity) } }], AD);
  ok(up.result.success && up.result.moved === 'time', 'the admin moves the event 17 hours later', up.result);
  eq(sql1(`select reminder_24h_sent_at, reminder_2h_sent_at from bookings where id = ${q(b.id)}`), { reminder_24h_sent_at: null, reminder_2h_sent_at: null }, 'QB2-05: the move clears the bookings\' reminder claims');
  await cron('reminders');
  const startMs = new Date(sql1(`select start_time from events where id = ${q(ev.id)}`).start_time).getTime();
  await waitFor(() => logRows(`booking_id = ${q(b.id)} and template = 'event-reminder' and status = 'sent' and dedupe_key = ${q(`event-reminder-24h:${b.id}:${startMs}`)}`).length === 1, 'QB2-05: the 24-hour reminder goes again for the new time (its key carries the new start)');
}

// ================================================================ QB2-08: short signed URLs
{
  const m = await makeMemberWithPhoto('signed');
  const feed = (await action('invite.getOpenInviteFeed', [], m.session)).result;
  const url = feed.me.photoUrl;
  const token = new URL(url).searchParams.get('token');
  const exp = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()).exp;
  const minutes = (exp - Date.now() / 1000) / 60;
  ok(minutes > 4 && minutes <= 10.1, `QB2-08: a photo's signed URL lasts 10 minutes at most (${minutes.toFixed(1)} minutes left)`);
}

// ================================================================ QB2-09: reminder Updates and the Going list
{
  const H = await makeMemberWithPhoto('remhost', 'active', { full_name: 'Remy Host' });
  const A = await makeMemberWithPhoto('remgoer', 'active', { full_name: 'Ada Goer' });
  const B = await makeMemberWithPhoto('rempaused', 'active', { full_name: 'Bertram Paused' });
  const C = await makeMemberWithPhoto('remoff', 'active', { full_name: 'Cleo Off' });
  const pid = await postPlan(H, { title: 'bx1 reminder rules', places: 6 });
  for (const m of [A, B, C]) ok((await join(m, pid)).ok, 'joins');
  ok((await action('notifications.setNotificationTopic', ['reminder24', false], C.session)).result.ok, 'C turns "24 hours before" off');
  exec(`update members set membership_status = 'paused', paused_at = now() where id = ${q(B.id)}`);
  exec(`update plans set starts_at = now() + interval '20 hours' where id = ${q(pid)}`);
  // In the order they said yes: the host, A, B, C.
  for (const [m, h] of [[H, 96], [A, 72], [B, 71], [C, 70]]) exec(`update plan_members set joined_at = now() - interval '${h} hours' where plan_id = ${q(pid)} and member_id = ${q(m.id)}`);
  const mark = fakesMark();
  await cron('reminders');
  const rem = sql(`select member_id from updates where plan_id = ${q(pid)} and kind = 'reminder'`).map((r) => r.member_id);
  ok(rem.includes(A.id) && rem.includes(H.id) && !rem.includes(C.id), 'QB2-09: no 24-hour reminder Update for C, who switched that reminder off (A and the host get one)', rem);
  const mail = await waitFor(() => emailsTo(mark, A.email).find((x) => /bx1 reminder rules/.test(x.subject)), 'A\'s plan reminder email');
  const full = (await fakeState()).emails.filter((x) => [].concat(x.to).includes(A.email) && x.subject === mail.subject).at(-1);
  ok(/Going: Remy, Cleo and you/.test(full.text) && !/Bertram/.test(full.text), 'QB2-09: its Going list leaves out the paused member', full.text.split('\n').find((l) => l.startsWith('Going')));
  exec(`update members set membership_status = 'active', paused_at = null where id = ${q(B.id)}`);
  cancelLater.push([H, pid]);
}

// ================================================================ QB3-01: admins acting at once
async function messageScene(tagName) {
  const H = await makeMemberWithPhoto(`${tagName}h`);
  const G = await makeMemberWithPhoto(`${tagName}g`);
  const R = await makeMemberWithPhoto(`${tagName}r`);
  const pid = await postPlan(H, { title: `bx1 ${tagName}`, places: 6 });
  for (const m of [G, R]) await join(m, pid);
  const chat = chatOf(pid);
  const msg = (await send(G, chat, `rude words ${tagName}`)).message.id;
  cancelLater.push([H, pid]);
  return { H, G, R, pid, chat, msg };
}
const report = (who, target, reason) => action('messages.sendReport', [{ target, reason }], who.session).then((r) => r.result);
{
  for (let i = 0; i < 3; i += 1) {
    const s = await messageScene(`race${i}`);
    const rep = await report(s.R, { kind: 'message', chatId: s.chat, messageId: s.msg }, 'rude');
    const [rm, dis] = await Promise.all([action('admin.reports.adminRemoveReportedMessage', [rep.reportId], AD), action('admin.reports.adminDismissReport', [rep.reportId], AD2)]);
    const st = sql1(`select status from reports where id = ${q(rep.reportId)}`).status;
    const removed = Boolean(sql1(`select removed_at from messages where id = ${q(s.msg)}`).removed_at);
    const wins = [rm.result.ok, dis.result.ok].filter(Boolean).length;
    const loser = rm.result.ok ? dis.result : rm.result;
    ok(wins === 1 && (rm.result.ok ? st === 'message_removed' && removed : st === 'dismissed' && !removed) && /Nothing changed\./.test(loser.error),
      `QB3-01 race ${i}: remove message vs dismiss at once: one acts (${st}, message removed ${removed}), the other is told "${loser.error}"`, { rm: rm.result, dis: dis.result });
  }
  // A claim held by another admin: nothing changes and the admin is told.
  const s = await messageScene('held');
  const rep = await report(s.R, { kind: 'message', chatId: s.chat, messageId: s.msg }, 'spam');
  exec(`update reports set claim_token = gen_random_uuid(), claimed_by = gen_random_uuid(), claimed_at = now() where id = ${q(rep.reportId)}`);
  const held = (await action('admin.reports.adminRemoveReportedMessage', [rep.reportId], AD)).result;
  eq(held, { ok: false, error: 'Someone else is dealing with this report now. Nothing changed.' }, 'a report another admin is acting on: refused plainly');
  eq([sql1(`select status from reports where id = ${q(rep.reportId)}`).status, sql1(`select removed_at from messages where id = ${q(s.msg)}`).removed_at], ['open', null], 'and nothing changed');
  exec(`update reports set claimed_at = now() - interval '5 minutes' where id = ${q(rep.reportId)}`);
  eq((await action('admin.reports.adminDismissReport', [rep.reportId], AD)).result, { ok: true }, 'a claim left by a stopped server is free again after two minutes');
  eq((await action('admin.reports.adminDismissReport', [rep.reportId], AD)).result.error, 'Someone dealt with this report already. Nothing changed.', 'and a report dealt with says so');

  // Photos: Keep and Remove at once.
  for (let i = 0; i < 3; i += 1) {
    const G = await makeMemberWithPhoto(`kr${i}`);
    exec(`update member_photos set status = 'pending', reviewed_at = null where id = ${q(G.photoId)}`);
    const [k, r] = await Promise.all([action('admin.photos.adminKeepPhoto', [G.photoId], AD), action('admin.photos.adminRemovePhoto', [G.photoId, 'not_clear'], AD2)]);
    const st = sql1(`select status from member_photos where id = ${q(G.photoId)}`).status;
    const wins = [k.result.ok, r.result.ok].filter(Boolean).length;
    ok(wins === 1 && (k.result.ok ? st === 'approved' : st === 'removed'), `QB3-01 photo race ${i}: Keep vs Remove at once: one acts (${st}); the other: ${JSON.stringify(k.result.ok ? r.result : k.result)}`);
  }
}

// ================================================================ QB3-02 and QB3-10: photo reports
{
  const s = await messageScene('photorep');
  const rep = await report(s.R, { kind: 'photo', chatId: s.chat, memberId: s.G.id }, 'not_them');
  ok(rep.ok, 'R reports G\'s photo from the chat');
  const old = s.G.photoId;
  const up = await action('photo.uploadMyPhoto', [fileArg({ face: 'found' }, { photo: { name: 'p.jpg', type: 'image/jpeg', base64: jpegBase64(480) } })], s.G.session);
  ok(up.result.success, 'G changes the photo (the reported one is now replaced)');
  const mark = fakesMark();
  const rm = (await action('admin.reports.adminRemoveReportedPhoto', [rep.reportId, 'not_suitable'], AD)).result;
  eq(rm, { ok: false, error: 'The member has changed that photo since. Check the new one.' }, 'QB3-02: removing the replaced photo from the report is refused, plainly');
  eq(sql1(`select photo_id from members where id = ${q(s.G.id)}`).photo_id, up.result.photoId, 'G keeps the new photo');
  eq(sql1(`select status from reports where id = ${q(rep.reportId)}`).status, 'open', 'the report stays open');
  eq((await action('admin.photos.adminRemovePhoto', [old, 'not_suitable'], AD)).result.error, 'The member has changed that photo since. Check the new one.', 'and from the Photos queue the same (as Keep is)');
  await sleep(1500);
  eq(emailsTo(mark, s.G.email).length, 0, 'G got no photo-removed email');
  const queue = (await action('admin.photos.adminGetPhotos', ['check'], AD)).result;
  const item = queue.items.find((i) => i.photoId === up.result.photoId);
  ok(item && item.pill === 'reported' && item.report?.id === rep.reportId, 'QB3-02/QB3-10: the new photo is in the Photos queue, as reported, with that report', item);
  eq((await action('admin.photos.adminKeepPhoto', [up.result.photoId], AD)).result, { ok: true }, 'the admin keeps the new photo');
  eq(sql1(`select status from reports where id = ${q(rep.reportId)}`).status, 'dismissed', 'which closes the report about it');

  // A reason to see the photo.
  const T = await makeMemberWithPhoto('phototarget');
  const X = await makeMemberWithPhoto('photostranger');
  const none = await report(X, { kind: 'photo', chatId: null, memberId: T.id }, 'not_them');
  eq(none.ok, false, 'QB3-10: a member who shares no chat or plan with T cannot report T\'s photo');
  const tp = await postPlan(T, { title: 'bx1 photo seen in the feed', places: 4 });
  const seen = await report(X, { kind: 'photo', chatId: null, memberId: T.id }, 'not_them');
  ok(seen.ok, 'once T hosts a plan X can see (the feed shows T\'s photo), X can');
  eq(sql1(`select photo_id, plan_id from reports where id = ${q(seen.reportId)}`), { photo_id: T.photoId, plan_id: tp }, 'the report has the photo and the plan where it was seen');
  // A member report about the photo, by someone with an open report about the same member's behaviour.
  const s2 = await messageScene('photomember');
  const first = await report(s2.R, { kind: 'member', chatId: s2.chat, memberId: s2.G.id }, 'harassment');
  const second = await report(s2.R, { kind: 'member', chatId: s2.chat, memberId: s2.G.id }, 'photo_not_them_or_unsuitable');
  ok(first.ok && second.ok && second.reportId !== first.reportId && !second.duplicate, 'QB3-10: a photo report after a behaviour report about the same member is its own report', { first, second });
  ok((await action('admin.photos.adminGetPhotos', ['check'], AD)).result.items.some((i) => i.photoId === s2.G.photoId && i.report?.id === second.reportId), 'it reaches the Photos queue');
  await waitFor(() => logRows(`report_id = ${q(second.reportId)} and template = 'admin-new-report' and status = 'sent'`).length === 1, 'and emails the club');
  cancelLater.push([T, tp]);
}

// ================================================================ QB3-06 and QB3-07: the club's cancels
{
  const S = await makeMemberWithPhoto('susp', 'active', { full_name: 'Sasha Suspended' });
  const G1 = await makeMemberWithPhoto('suspguest');
  const R = await makeMemberWithPhoto('suspreporter');
  const H2 = await makeMemberWithPhoto('susphost2');
  const p1 = await postPlan(S, { title: 'bx1 suspended host', places: 5 });
  for (const m of [G1, R]) ok((await join(m, p1)).ok, 'joins S\'s plan');
  const p2 = await postPlan(H2, { title: 'bx1 suspended guest', places: 5 });
  ok((await join(S, p2)).ok, 'S is going to H2\'s plan');
  const q2 = await send(S, `ask-${(await postPlan(H2, { title: 'bx1 suspended asks', places: 5 }))}`, 'what time?');
  ok(q2.ok, 'S asked H2 a question');
  const rep = await report(R, { kind: 'member', chatId: chatOf(p1), memberId: S.id }, 'harassment');
  const mark = fakesMark();
  eq((await action('admin.reports.adminSuspendReportedMember', [rep.reportId, { stripe: false }], AD)).result, { ok: true }, 'the admin suspends S from the report');
  eq(sql1(`select status, removed_reason from plans where id = ${q(p1)}`), { status: 'cancelled', removed_reason: 'host_paused' }, 'QB3-06: S\'s upcoming plan is cancelled by the club');
  const cu = sql(`select member_id, actor_id from updates where plan_id = ${q(p1)} and kind = 'cancelled'`);
  ok([G1.id, R.id].every((id) => cu.some((u) => u.member_id === id && u.actor_id === null)), 'the people going get a "cancelled" Update (no host named)', cu);
  const g1Mail = await waitFor(() => emailsTo(mark, G1.email).find((x) => x.subject === 'Cancelled: bx1 suspended host'), 'and the plan-cancelled email');
  const g1Full = (await fakeState()).emails.filter((x) => [].concat(x.to).includes(G1.email) && x.subject === g1Mail.subject).at(-1);
  ok(/Club Yuppie cancelled bx1 suspended host/.test(g1Full.text) && !/Sasha cancelled/.test(g1Full.text), 'in the club\'s words (S did not cancel it)', g1Full.text.slice(0, 200));
  eq(sql1(`select status from plan_members where plan_id = ${q(p2)} and member_id = ${q(S.id)}`).status, 'left', 'QB3-06: S is withdrawn from the plan S was going to');
  ok(sql(`select actor_id from updates where plan_id = ${q(p2)} and member_id = ${q(H2.id)} and kind = 'left'`).some((u) => u.actor_id === S.id), 'its host is told as for any withdrawal');
  eq(sql1(`select count(*)::int n from chat_members where member_id = ${q(S.id)} and left_at is null`).n, 0, 'every chat is closed to S');
  eq(emailsTo(mark, S.email).filter((x) => /Cancelled|cancelled/.test(x.subject)).length, 0, 'the suspended host hears nothing of it');
  const sChat = (await action('messages.getChats', [], S.session));
  ok(sChat.redirect || (Array.isArray(sChat.result) && sChat.result.length === 0), 'and S (gated) has no chats');

  // Ending a membership does the same.
  const E = await makeMemberWithPhoto('endhost');
  const G3 = await makeMemberWithPhoto('endguest');
  const p3 = await postPlan(E, { title: 'bx1 ended host', places: 4 });
  ok((await join(G3, p3)).ok, 'G3 joins E\'s plan');
  const end = await action('admin.memberStatus.adminCancelMemberNow', [E.id, { stripe: false }], AD);
  ok(end.result.ok, 'the admin ends E\'s membership', end.result);
  eq(sql1(`select status, removed_reason from plans where id = ${q(p3)}`), { status: 'cancelled', removed_reason: 'host_ended' }, 'QB3-06: an ended host\'s upcoming plan is cancelled by the club');
  ok(sql(`select actor_id from updates where plan_id = ${q(p3)} and member_id = ${q(G3.id)} and kind = 'cancelled'`).some((u) => u.actor_id === null), 'the people going are told');

  // QB3-07: the club removes a plan from a report: the host is told.
  const s = await messageScene('removeplan');
  const rp = await report(s.R, { kind: 'plan', planId: s.pid }, 'unsafe');
  const mark2 = fakesMark();
  eq((await action('admin.reports.adminRemoveReportedPlan', [rp.reportId], AD)).result, { ok: true }, 'the admin removes the plan');
  ok(sql(`select role, actor_id from updates where plan_id = ${q(s.pid)} and member_id = ${q(s.H.id)} and kind = 'cancelled'`).some((u) => u.role === 'host' && u.actor_id === null), 'QB3-07: the host gets a "cancelled" Update');
  const hostMail = await waitFor(() => emailsTo(mark2, s.H.email).find((x) => x.subject === 'We cancelled your plan: bx1 removeplan'), 'QB3-07: and the club\'s plan-cancelled email ("We cancelled your plan", new wording)');
  ok(hostMail, 'host email');
  await waitFor(() => emailsTo(mark2, s.G.email).some((x) => x.subject === 'Cancelled: bx1 removeplan'), 'the people going get the club\'s plan-cancelled email too');
  const hostU = (await updatesFor(s.H)).find((u) => u.plan.id === s.pid && u.kind === 'cancelled');
  ok(hostU && hostU.actor === null && hostU.role === 'host', 'and the Update is in the host\'s list');
  const thread = (await action('thread.getThread', [s.chat], s.G.session)).result;
  const line = thread.items.find((i) => i.kind === 'system' && i.event === 'cancelled');
  ok(line && line.memberId === null, 'the plan chat\'s "cancelled" line names nobody (the screen: "This plan was cancelled.")');
}

// ================================================================ QB3-08: what members read through REST
{
  const s = await messageScene('rest');
  const rep = await report(s.R, { kind: 'message', chatId: s.chat, messageId: s.msg }, 'rude');
  await action('admin.reports.adminDismissReport', [rep.reportId, 'bx1 note: spoke to them'], AD);
  for (const col of ['status', 'action_note', 'acted_by', 'acted_at', 'claimed_by']) {
    const r = await rest('GET', `reports?select=${col}&id=eq.${rep.reportId}`, s.R.session);
    ok([401, 403].includes(r.status), `QB3-08: the reporter cannot read reports.${col} (${r.status})`, r.json);
  }
  const star = await rest('GET', 'reports?select=*', s.R.session);
  ok([401, 403].includes(star.status) || (Array.isArray(star.json) && star.json.every((x) => !('action_note' in x))), `select=* does not show the note either (${star.status})`);
  const mine = await rest('GET', `reports?select=id,kind,reason,message_id,created_at&id=eq.${rep.reportId}`, s.R.session);
  eq([mine.status, mine.json.length, mine.json[0]?.reason], [200, 1, 'rude'], 'the reporter still reads what they reported');
  exec(`update plans set removed_by = gen_random_uuid(), removed_reason = 'bx1 secret reason' where id = ${q(s.pid)}`);
  for (const col of ['removed_by', 'removed_reason']) {
    const r = await rest('GET', `plans?select=${col}&id=eq.${s.pid}`, s.G.session);
    ok([401, 403].includes(r.status), `QB3-08: a member going cannot read plans.${col} (${r.status})`, r.json);
  }
  const plan = await rest('GET', `plans?select=id,title,status,removed_at&id=eq.${s.pid}`, s.G.session);
  eq([plan.status, plan.json[0]?.id], [200, s.pid], 'but reads the plan itself');
  exec(`update plans set removed_by = null, removed_reason = null where id = ${q(s.pid)}`);
}

// ================================================================ QB3-09: the rate limit under parallel sends
{
  const s = await messageScene('rate');
  const P = await makeMemberWithPhoto('rateparallel');
  ok((await join(P, s.pid)).ok, 'P joins');
  const res = await Promise.all(Array.from({ length: 40 }, (_, i) => send(P, s.chat, `par ${i}`)));
  const sent = res.filter((r) => r.ok).length;
  const stored = sql1(`select count(*)::int n from messages where sender_id = ${q(P.id)} and kind = 'text'`).n;
  ok(sent === 20 && stored === 20 && res.filter((r) => r.reason === 'rate_limited').length === 20, `QB3-09: 40 sends at once: 20 go, 20 are told to slow down (${sent} sent, ${stored} stored)`);
  const again = await send(P, s.chat, 'one more');
  eq(again.reason, 'rate_limited', 'and the next one too, within the minute');
}

// ================================================================ QB3-13: joiners kept, spaced hand-off links caught
{
  const s = await messageScene('chars');
  const words = 'Coding tonight \u{1F469}\u200d\u{1F4BB} then pride \u{1F3F3}\uFE0F\u200d\u{1F308}, \u0633\u0644\u0627\u0645\u200c\u062f\u0646\u06cc\u0627';
  const zwj = await send(s.G, s.chat, words);
  ok(zwj.ok && zwj.message.text.includes('‍') && zwj.message.text.includes('‌'), 'QB3-13: the zero-width joiner and non-joiner are kept (emoji sequences, Persian)');
  eq(sql1(`select body from messages where id = ${q(zwj.message.id)}`).body, words, 'stored as written');
  const bidi = await send(s.G, s.chat, 'abc‮def⁦x⁩');
  ok(bidi.ok && !/[‪-‮⁦-⁩]/.test(bidi.message.text), 'direction overrides and isolates are still taken out');
  for (const text of ['wa . me / 4477', 'wa dot me/447700900123', 't . me/sam', 'linktr . ee/sam', 'bit . ly/x']) {
    eq((await send(s.G, s.chat, text)).reason, 'link', `QB3-13: "${text}" is a link`);
  }
  for (const text of ['I’m. Me too', 'ok . me as well', 'call me on 07700 900123']) ok((await send(s.G, s.chat, text)).ok, `"${text}" goes through`);
}

// ================================================================ QB3-14: no "joined" after the cancel
{
  for (let t = 0; t < 3; t += 1) {
    const H = await makeMemberWithPhoto(`cxrace${t}`);
    const crowd = await Promise.all(Array.from({ length: 6 }, (_, i) => makeMemberWithPhoto(`cxr${t}${i}`)));
    const pid = await postPlan(H, { title: `bx1 cancel race ${t}`, places: 12 });
    const jobs = crowd.map((m) => join(m, pid));
    jobs.splice(3, 0, sleep(40 + t * 30).then(() => action('plan.cancelOpenInvite', [pid], H.session).then((r) => r.result)));
    await Promise.all(jobs);
    await sleep(500);
    const at = sql1(`select cancelled_at from plans where id = ${q(pid)}`).cancelled_at;
    const late = sql1(`select count(*)::int n from updates where plan_id = ${q(pid)} and kind in ('joined', 'full') and created_at > ${q(at)}`).n;
    const lateJoins = sql1(`select count(*)::int n from plan_members where plan_id = ${q(pid)} and role = 'guest' and joined_at > ${q(at)} and status = 'going'`).n;
    eq([late, lateJoins], [0, 0], `QB3-14 trial ${t}: no "joined" Update and no join stamped after the cancel`);
  }
  const H = await makeMemberWithPhoto('cxdirect');
  const pid = await postPlan(H, { title: 'bx1 cancelled first', places: 4 });
  await action('plan.cancelOpenInvite', [pid], H.session);
  eq(sql1(`select public.write_plan_updates(${q(pid)}, ${q(JSON.stringify([{ member_id: H.id, kind: 'joined', role: 'host', dedupe_key: `bx1-late-${pid}` }]))}::jsonb) n`).n, 0, 'the database writes no people Update for a cancelled plan');
}

// ================================================================ QB1-04: the blocked member is not told
{
  const Gh = await makeMemberWithPhoto('qblockhost');
  const J = await makeMemberWithPhoto('qblocked');
  const pid = await postPlan(Gh, { title: 'bx1 question block', places: 4 });
  const asked = await send(J, `ask-${pid}`, 'is there parking?');
  ok(asked.ok, 'J asks the host');
  eq((await action('messages.blockMember', [{ memberId: J.id, chatId: asked.chatId }], Gh.session)).result, { ok: true }, 'the host blocks J');
  const r = await send(J, asked.chatId, 'J again');
  eq([r.ok, r.reason, r.error], [false, 'closed', 'This chat is closed'], 'QB1-04: J\'s send is refused with the closed chat\'s words');
  ok(!/block/i.test(JSON.stringify(r)), 'nothing in the answer says "block"');
  eq((await send(Gh, asked.chatId, 'host to J')).reason, 'blocked', 'the host (who blocked) is told plainly');
  cancelLater.push([Gh, pid]);
}

// ================================================================ QB1-08: names on system lines after a withdrawal
{
  const H = await makeMemberWithPhoto('sysname');
  const W = await makeMemberWithPhoto('withdrawer', 'active', { full_name: 'Wilhelmina Withdraws' });
  const pid = await postPlan(H, { title: 'bx1 system names', places: 4 });
  ok((await join(W, pid)).ok, 'W joins');
  ok((await action('invite.withdrawFromOpenInvite', [pid], W.session)).result.ok, 'and withdraws');
  const thread = (await action('thread.getThread', [chatOf(pid)], H.session)).result;
  const line = thread.items.find((i) => i.kind === 'system' && i.event === 'joined' && i.memberId === W.id);
  ok(line && line.member?.firstName === 'Wilhelmina', 'QB1-08: the "is in" line still carries W\'s name', line);
  ok(!thread.chat.participants.some((p) => p.member.id === W.id), 'though W is no longer in the chat');
  cancelLater.push([H, pid]);
}

// ================================================================ QB1-10: characters are code points on the server
{
  const H = await makeMemberWithPhoto('codepoints');
  const post = (over) => action('invite.postOpenInvite', [planInput({ places: 4, ...over })], H.session).then((r) => r.result);
  const fifty = await post({ title: '😀'.repeat(50), where: '🏠'.repeat(120), note: '✨'.repeat(140) + '🎉'.repeat(140) });
  ok(fifty.ok, 'QB1-10: a 50-emoji title, a 120-emoji place and a 280-emoji note are taken (100, 240 and 420 UTF-16 units)', fifty);
  eq(sql1(`select char_length(title) title_len, char_length(place) place_len, char_length(note) note_len from plans where id = ${q(fifty.id)}`), { title_len: 50, place_len: 120, note_len: 280 }, 'and stored at those lengths');
  eq((await post({ title: '😀'.repeat(51) })).errors?.title, 'Keep the title to 50 characters.', '51 emoji: too long');
  eq((await post({ where: '🏠'.repeat(121) })).errors?.where, 'Keep the place to 120 characters.', '121 emoji in the place: too long');
  eq((await post({ note: '🎉'.repeat(281) })).error, 'Keep the note to 280 characters.', '281 emoji in the note: too long');
  const s = await messageScene('cpmsg');
  ok((await send(s.G, s.chat, '😀'.repeat(500))).ok, '500 emoji in a message: sent');
  eq((await send(s.G, s.chat, '😀'.repeat(501))).reason, 'too_long', '501: too long');
  cancelLater.push([H, fifty.id]);
}

for (const [host, pid] of cancelLater) await action('plan.cancelOpenInvite', [pid], host.session).catch(() => {});
done();
