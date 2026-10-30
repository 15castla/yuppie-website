// The admin Reports queue (brief 2.5): the list with its numbers, a report's detail (the message in its context,
// the member's history), and every action (dismiss, remove the message, remove the plan, remove the photo with a
// reason, warn, suspend through stage 1's pause), each with an audit row, refusing a report someone already
// dealt with; admins only. And Delete my account leaving Open Invite and Messages cleanly (stage 1's path).
import { action, adminSession, done, eq, fakesMark, emailsTo, logRows, makeMemberWithPhoto, ok, postPlan, q, redirectedTo, rest, sql, sql1, waitFor } from './lib.mjs';

const admin = await adminSession('bf.');
const host = await makeMemberWithPhoto('ah');
const bad = await makeMemberWithPhoto('ab');
const rep1 = await makeMemberWithPhoto('ar1');
const rep2 = await makeMemberWithPhoto('ar2');
const planId = await postPlan(host, { title: 'Admin test plan', places: 8 });
const chatId = (await action('invite.joinOpenInvite', [planId], bad.session)).result.chatId;
await action('invite.joinOpenInvite', [planId], rep1.session);
await action('invite.joinOpenInvite', [planId], rep2.session);
const say = async (who, text) => (await action('thread.sendMessage', [{ chatId, text, clientId: `a-${Math.random().toString(36).slice(2)}` }], who.session)).result.message.id;
await say(host, 'Meet at the gate');
await say(rep1, 'See you there');
const badMsg = await say(bad, 'Easier if you just send me the money');
await say(rep2, 'That is odd');
await say(host, 'Please keep it in the app');
const report = (who, draft) => action('messages.sendReport', [draft], who.session).then((r) => r.result);
const asAdmin = (name, args) => action(`admin.reports.${name}`, args, admin).then((r) => r.result);

// ---------------------------------------------------------------- the queue and the detail
const mark = fakesMark();
const r1 = await report(rep1, { target: { kind: 'message', chatId, messageId: badMsg }, reason: 'pay_outside' });
const r2 = await report(rep2, { target: { kind: 'message', chatId, messageId: badMsg }, reason: 'spam' });
ok(r1.ok && r2.ok && r1.reportId !== r2.reportId, 'two members report the same message');
await waitFor(() => logRows(`report_id in (${q(r1.reportId)}, ${q(r2.reportId)}) and template = 'admin-new-report' and status = 'sent'`).length === 2, 'the club gets an email for each');
ok(emailsTo(mark, process.env.ADMIN_ALERTS_EMAIL).every((e) => /^New report: /.test(e.subject ?? '')), 'subject "New report: <reason>"');
const queue = await asAdmin('adminGetReports', ['open']);
const item = queue.items.find((i) => i.id === r1.reportId);
ok(item, 'the report is in the Open list');
eq([item.kind, item.reasonLabel, item.reporter.name, item.about.id, item.plan.title, item.messageText], ['message', 'Pressure to pay outside the app', 'Ar1 Tester', bad.id, 'Admin test plan', 'Easier if you just send me the money'], 'with the reason in words, who reported, who it is about, the plan and the message');
ok(queue.stats.open >= 2 && typeof queue.stats.oldestOpenHours === 'number', 'and the numbers', queue.stats);
eq(await asAdmin('adminOpenReportCount', []), queue.stats.open, 'the nav count is the open count');
const detail = await asAdmin('adminGetReport', [r1.reportId]);
eq(detail.context.map((c) => [c.text, c.reported]), [['Meet at the gate', false], ['See you there', false], ['Easier if you just send me the money', true], ['That is odd', false], ['Please keep it in the app', false]], 'the detail: the message with two either side, the reported one marked');
eq([detail.history.otherReports, detail.history.status], [1, 'active'], 'and the member\'s history (one other report)');

// ---------------------------------------------------------------- remove the message
eq((await asAdmin('adminRemoveReportedMessage', [r1.reportId])), { ok: true }, 'Remove message');
ok(sql1(`select removed_at from messages where id = ${q(badMsg)}`).removed_at, 'the message is removed');
const seen = (await action('thread.getThread', [chatId], rep2.session)).result.items.find((i) => i.id === badMsg);
eq([seen.status, seen.text], ['removed', ''], 'everyone in the chat sees "Message removed" (and not the words)');
eq((await rest('GET', `messages?select=id&id=eq.${badMsg}`, rep2.session)).json, [], 'nor through REST');
eq(sql(`select status from reports where id in (${q(r1.reportId)}, ${q(r2.reportId)}) order by created_at`).map((r) => r.status), ['message_removed', 'message_removed'], 'both reports on it are answered');
ok(sql(`select 1 from admin_audit where action = 'report.message_removed' and target_id = ${q(r1.reportId)}`).length === 1, 'an audit row');
eq((await asAdmin('adminRemoveReportedMessage', [r2.reportId])).error, 'Someone dealt with this report already. Nothing changed.', 'acting on an answered report: nothing changes');
ok((await asAdmin('adminGetReports', ['done'])).items.some((i) => i.id === r1.reportId), 'it is in Done');

// ---------------------------------------------------------------- dismiss, warn
const r3 = await report(rep1, { target: { kind: 'member', chatId, memberId: host.id }, reason: 'rude' });
eq(await asAdmin('adminDismissReport', [r3.reportId, 'Fine on reading']), { ok: true }, 'Dismiss');
eq(sql1(`select status, action_note from reports where id = ${q(r3.reportId)}`), { status: 'dismissed', action_note: 'Fine on reading' }, 'dismissed, with the note');
const r4 = await report(rep1, { target: { kind: 'member', chatId, memberId: bad.id }, reason: 'harassment' });
const mark2 = fakesMark();
eq(await asAdmin('adminWarnReportedMember', [r4.reportId]), { ok: true }, 'Warn');
eq(sql1(`select status from reports where id = ${q(r4.reportId)}`).status, 'warned', 'recorded as warned');
eq(emailsTo(mark2, bad.email).length, 0, 'and nothing is sent to them (no warning email is designed)');

// ---------------------------------------------------------------- remove a photo
const r5 = await report(rep2, { target: { kind: 'photo', chatId: null, memberId: bad.id }, reason: 'not_suitable' });
eq(await asAdmin('adminRemoveReportedPhoto', [r5.reportId, 'not_suitable']), { ok: true }, 'Remove photo from a report');
eq(sql1(`select status, removal_reason from member_photos where id = ${q(bad.photoId)}`), { status: 'removed', removal_reason: 'not_suitable' }, 'the photo is removed with the reason');
eq(sql1(`select status from reports where id = ${q(r5.reportId)}`).status, 'photo_removed', 'the report says so');
await waitFor(() => logRows(`member_id = ${q(bad.id)} and template = 'photo-removed' and status = 'sent'`).length === 1, 'and the member is emailed');
eq(await redirectedTo('/members/open-invite', bad.session), '/members/photo', 'they meet the photo gate');

// ---------------------------------------------------------------- suspend
const r6 = await report(rep2, { target: { kind: 'member', chatId, memberId: rep1.id }, reason: 'threats' });
eq(await asAdmin('adminSuspendReportedMember', [r6.reportId, { stripe: false }]), { ok: true }, 'Suspend (pause through stage 1\'s path, Stripe left alone)');
eq(sql1(`select membership_status from members where id = ${q(rep1.id)}`).membership_status, 'paused', 'the member is paused');
eq((await action('thread.sendMessage', [{ chatId, text: 'hello?', clientId: 'susp-1' }], rep1.session)).redirect, '/members/membership', 'and can use none of it (the membership gate)');
ok(!(await action('invite.getOpenInviteFeed', [], rep2.session)).result.invites.some((i) => i.host.id === rep1.id), 'their plans leave the feed');
ok(sql(`select 1 from admin_audit where action = 'member.pause' and target_id = ${q(rep1.id)}`).length === 1, 'stage 1\'s audit row for the pause');

// ---------------------------------------------------------------- remove a plan
const r7 = await action('invite.reportOpenInvite', [planId, 'Feels unsafe'], rep2.session).then((r) => r.result);
eq(await asAdmin('adminRemoveReportedPlan', [r7.reportId, 'Feels unsafe']), { ok: true }, 'Remove the plan');
eq(sql1(`select status, removed_at is not null r from plans where id = ${q(planId)}`), { status: 'cancelled', r: true }, 'cancelled and marked removed');
eq((await action('plan.getOpenInvitePage', [planId], (await makeMemberWithPhoto('ax')).session)).result, null, 'gone for anyone not going');
eq((await action('plan.getOpenInvitePage', [planId], rep2.session)).result.invite.status, 'cancelled', 'cancelled for those going');

// ---------------------------------------------------------------- admins only
eq((await action('admin.reports.adminGetReports', ['open'], rep2.session)).redirect, '/', 'a member cannot read the queue');
eq((await action('admin.reports.adminDismissReport', [r6.reportId], rep2.session)).redirect, '/', 'nor act on it');

// ---------------------------------------------------------------- Delete my account leaves Open Invite cleanly
const leaver = await makeMemberWithPhoto('ad');
const friend = await makeMemberWithPhoto('af');
const hosted = await postPlan(leaver, { title: 'Leaver hosts', places: 4 });
const hostedChat = (await action('invite.joinOpenInvite', [hosted], friend.session)).result.chatId;
const theirs = await postPlan(friend, { title: 'Friend hosts', places: 4 });
const theirsChat = (await action('invite.joinOpenInvite', [theirs], leaver.session)).result.chatId;
const leaverMsg = (await action('thread.sendMessage', [{ chatId: theirsChat, text: 'See you all', clientId: 'leaver-1' }], leaver.session)).result.message.id;
await action('messages.blockMember', [{ memberId: friend.id, chatId: theirsChat }], leaver.session);
const markDel = fakesMark();
await action('you.deleteMyAccount', ['delete'], leaver.session);
eq(sql1(`select status from plans where id = ${q(hosted)}`).status, 'cancelled', 'the plan they hosted is cancelled');
ok(sql(`select 1 from updates where plan_id = ${q(hosted)} and member_id = ${q(friend.id)} and kind = 'cancelled'`).length === 1, 'the member going is told (an Update)');
await waitFor(() => emailsTo(markDel, friend.email).some((e) => /^Cancelled: Leaver hosts/.test(e.subject ?? '')), 'and emailed');
eq(sql1(`select status from plan_members where plan_id = ${q(theirs)} and member_id = ${q(leaver.id)}`).status, 'left', 'they withdraw from the plan they were going to');
ok(sql(`select 1 from updates where plan_id = ${q(theirs)} and member_id = ${q(friend.id)} and kind = 'left'`).length === 1, 'its host is told');
ok(sql1(`select removed_at from messages where id = ${q(leaverMsg)}`).removed_at, 'their messages read "Message removed"');
eq(sql1(`select count(*)::int n from chat_members where member_id = ${q(leaver.id)} and left_at is null`).n, 0, 'they are in no chat');
eq(sql1(`select count(*)::int n from blocks where blocker_id = ${q(leaver.id)} or blocked_id = ${q(leaver.id)}`).n, 0, 'their blocks are gone');
eq(sql1(`select count(*)::int n from member_photos where member_id = ${q(leaver.id)}`).n, 0, 'and their photos');
void hostedChat;
done();
