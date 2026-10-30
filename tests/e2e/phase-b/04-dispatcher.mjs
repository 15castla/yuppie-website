// The notification dispatcher (brief 2.3, section 4): every plan event to every channel by the member's
// switches (Updates always; email by topic and channel; text only for reminders), blocks (a member who blocked
// the host hears nothing about them), gated members (nothing), the club's removal (an Update, no email), the
// chat emails on a fake clock (unread after 15 minutes, at most one per chat an hour, none when muted, when
// email is off, or when the only unread messages are from someone blocked; the kind of chat names the email),
// the switches page (Text on sends the check text first) and message_log for every send.
import { action, cronAt, done, emailsTo, eq, exec, fakesMark, fakesSince, logRows, makeMemberWithPhoto, ok, postPlan, q, sql, sql1, waitFor } from './lib.mjs';

const MIN = 60000;
const host = await makeMemberWithPhoto('dh');
const plain = await makeMemberWithPhoto('dp'); // defaults
const noEmail = await makeMemberWithPhoto('de');
const noTopic = await makeMemberWithPhoto('dt');
const blocker = await makeMemberWithPhoto('db');
const pausedLater = await makeMemberWithPhoto('dz');
const setChannel = (who, channel, on) => action('notifications.setNotificationChannel', [channel, on], who.session).then((r) => r.result);
const setTopic = (who, topic, on) => action('notifications.setNotificationTopic', [topic, on], who.session).then((r) => r.result);

// ---------------------------------------------------------------- the switches page
const settings = (await action('notifications.getNotificationSettings', [], plain.session)).result;
eq(settings.preferences.topics, { host: true, in: true, reminder24: true, reminder2: true, clubChanges: true }, 'defaults: every topic on');
eq(settings.preferences.channels, { push: true, email: true, text: false }, 'defaults: push on (stored), email on, text off');
eq([settings.preferences.pushPermission, settings.pushChannel], ['unavailable', false], 'push is not in stage 2: unavailable, and the Push row hidden');
eq(settings.preferences.email, plain.email, 'email goes to the account address');
ok(/7700 900123$/.test(settings.preferences.mobileNumber ?? ''), 'the number on file, formatted as You formats it (displayPhone)', settings.preferences.mobileNumber);
const off = await setChannel(noEmail, 'email', false);
ok(off.ok && off.preferences.channels.email === false, 'switch Email off: saved at once, the whole preferences back');
ok((await setTopic(noTopic, 'in', false)).ok, 'switch "Plans you’re in" off');
const mark0 = fakesMark();
const textOn = await setChannel(plain, 'text', true);
ok(textOn.ok && textOn.preferences.channels.text && textOn.preferences.textCheck === 'sent', 'Text on: saved, and the check is "sent"', textOn);
const check = fakesSince(mark0, 'sms');
ok(check.length === 1 && /reminders by text are on/.test(check[0].body ?? check[0].Body ?? JSON.stringify(check[0])), 'the check text went (r2c "Reminders switched on")', check);
eq(logRows(`member_id = ${q(plain.id)} and template = 'reminders-on'`).map((r) => [r.channel, r.status]), [['sms', 'sent']], 'logged in message_log');
exec(`update members set phone = null where id = ${q(noTopic.id)}`);
const noNumber = await setChannel(noTopic, 'text', true);
eq([noNumber.ok, noNumber.reason, noNumber.error], [false, 'no_number', 'Add a mobile number to get reminders by text.'], 'no number on file: Text stays off');
const youRow = (await action('notifications.getNotificationSettings', [], noEmail.session)).result.preferences.channels;
eq(youRow, { push: true, email: false, text: false }, 'saved switches read back');

// ---------------------------------------------------------------- plan events by channel
const planId = await postPlan(host, { title: 'Dispatcher plan', places: 8 });
for (const who of [plain, noEmail, noTopic, blocker, pausedLater]) eq((await action('invite.joinOpenInvite', [planId], who.session)).result.ok, true, `member ${who.email.split('@')[0]} joins`);
eq(sql1(`select count(*)::int n from updates where member_id = ${q(host.id)} and plan_id = ${q(planId)} and kind = 'joined'`).n, 5, 'the host: a "joined" Update per member');
exec(`insert into blocks values (${q(blocker.id)}, ${q(host.id)})`);
exec(`update members set membership_status = 'paused', paused_at = now() where id = ${q(pausedLater.id)}`);
const move = await action('plan.editOpenInvite', [planId, { title: 'Dispatcher plan', type: 'Sport', date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 9 * 86400000)), time: '20:15', where: 'Somewhere new', places: 8, hostGoing: true, note: '', cost: null }], host.session);
ok(move.result.ok, 'the host moves the plan');
const changedTo = sql(`select member_id from updates where plan_id = ${q(planId)} and kind = 'changed'`).map((r) => r.member_id).sort();
eq(changedTo, [plain.id, noEmail.id, noTopic.id].sort(), '"changed" Updates for everyone going, whatever their switches; none for the blocker or the paused member');
await waitFor(() => logRows(`plan_id = ${q(planId)} and template = 'plan-changed'`).length >= 1, 'the plan-changed email logged');
await new Promise((r) => setTimeout(r, 1500));
eq(logRows(`plan_id = ${q(planId)} and template = 'plan-changed'`).map((r) => r.member_id), [plain.id], 'the email only to the member with Email and "Plans you’re in" on (not email off, not the topic off, not the blocker, not the paused member)');
const mark1 = fakesMark();
await action('plan.cancelOpenInvite', [planId], host.session);
await waitFor(() => logRows(`plan_id = ${q(planId)} and template = 'plan-cancelled'`).length >= 1, 'plan-cancelled logged');
await new Promise((r) => setTimeout(r, 1500));
eq(logRows(`plan_id = ${q(planId)} and template = 'plan-cancelled'`).map((r) => r.member_id), [plain.id], 'the cancelled email: the same rule');
const cancelledUpd = sql(`select member_id, actor_id from updates where plan_id = ${q(planId)} and kind = 'cancelled' order by member_id`);
eq(cancelledUpd.map((r) => r.member_id).sort(), [plain.id, noEmail.id, noTopic.id, blocker.id].sort(), '"cancelled" Updates for everyone going and able to hear (the paused member hears nothing)');
eq(cancelledUpd.find((r) => r.member_id === blocker.id).actor_id, null, 'the member who blocked the host: an Update without naming the host');
eq(emailsTo(mark1, blocker.email).length + emailsTo(mark1, pausedLater.email).length, 0, 'no email to the blocker or the paused member');
ok(sql(`select count(*)::int n from message_log where plan_id = ${q(planId)} and channel = 'sms'`)[0].n === 0, 'and no texts: plan changes are never texted');

// ---------------------------------------------------------------- the club removes a plan
const removed = await postPlan(host, { title: 'To be removed', places: 4 });
await action('invite.joinOpenInvite', [removed], plain.session);
exec(`insert into reports (reporter_id, kind, reason, member_id, plan_id) values (${q(plain.id)}, 'plan', 'not_real', ${q(host.id)}, ${q(removed)})`);
const reportId = sql1(`select id from reports where plan_id = ${q(removed)}`).id;
const { adminSession } = await import('./lib.mjs');
const admin = await adminSession('bf.');
const rem = await action('admin.reports.adminRemoveReportedPlan', [reportId, 'Not a real plan'], admin);
ok(rem.result.ok, 'the club removes a reported plan', rem.result);
eq(sql1(`select kind, actor_id from updates where plan_id = ${q(removed)} and member_id = ${q(plain.id)}`), { kind: 'cancelled', actor_id: null }, 'the member going gets an Update (no host named)');
await new Promise((r) => setTimeout(r, 1000));
eq(logRows(`plan_id = ${q(removed)} and template = 'plan-cancelled'`).length, 0, 'and no "Priya cancelled" email (there is no design for a removal)');

// ---------------------------------------------------------------- chat emails, on a fake clock
const chatPlan = await postPlan(host, { title: 'Chatty plan', places: 8 });
const join = async (who) => (await action('invite.joinOpenInvite', [chatPlan], who.session)).result.chatId;
const chatId = await join(plain);
await join(noEmail);
const muted = await makeMemberWithPhoto('dm');
await join(muted);
await action('thread.setChatMuted', [chatId, true], muted.session);
const reader = await makeMemberWithPhoto('dr');
await join(reader);
const blockOnly = await makeMemberWithPhoto('do');
await join(blockOnly);
const loud = await makeMemberWithPhoto('dl');
await join(loud);
await action('messages.blockMember', [{ memberId: loud.id, chatId }], blockOnly.session);
// Everyone has read the chat up to now (the join lines are not messages anyway).
for (const who of [host, plain, noEmail, muted, reader, blockOnly, loud]) await action('thread.markChatRead', [chatId], who.session);
const m1 = await action('thread.sendMessage', [{ chatId, text: 'First message from loud', clientId: 'n-1' }], loud.session);
ok(m1.result.ok, 'loud sends a message');
await action('thread.markChatRead', [chatId], reader.session);
const t0 = Date.now();
const nudged = (who) => logRows(`member_id = ${q(who.id)} and template = 'new-message' and chat_id = ${q(chatId)}`);
await cronAt('reminders', t0 + 10 * MIN);
eq(nudged(plain).length, 0, '10 minutes after: no email yet');
const r1 = await cronAt('reminders', t0 + 16 * MIN);
ok(r1.json.ok && r1.json.result.nudges.sent >= 2, 'the job sends chat emails at 15 minutes', r1.json.result?.nudges);
eq(nudged(plain).map((r) => r.status), ['sent'], 'a member with Email on gets one');
eq(nudged(host).map((r) => r.status), ['sent'], 'the host too');
eq(nudged(noEmail).length + nudged(muted).length + nudged(reader).length + nudged(blockOnly).length + nudged(loud).length, 0, 'none for: Email off, a muted chat, a member who read it, a member whose only unread message is from someone they blocked, the sender');
const subj = sql1(`select dedupe_key from message_log where member_id = ${q(plain.id)} and template = 'new-message'`).dedupe_key;
eq(subj, `chat-nudge:${chatId}:${plain.id}:${m1.result.message.id}`, 'deduped per chat, member and first unread message');
const m2 = await action('thread.sendMessage', [{ chatId, text: 'Second message', clientId: 'n-2' }], loud.session);
// On the fake clock: the second message lands 20 minutes in (after the first email at 16 minutes).
const m2At = t0 + 20 * MIN;
exec(`update messages set created_at = to_timestamp(${m2At / 1000}) where id = ${q(m2.result.message.id)}`);
await cronAt('reminders', m2At + 20 * MIN);
eq(nudged(plain).length, 1, 'a second message 20 minutes later inside the hour: no second email');
await cronAt('reminders', t0 + 16 * MIN + 61 * MIN);
eq(nudged(plain).length, 2, 'after the hour, with a newer message still unread: one more');
await cronAt('reminders', t0 + 16 * MIN + 125 * MIN);
eq(nudged(plain).length, 2, 'and nothing again without a new message since that email');
// A question names itself: "New question about ..." to the host, "New reply about ..." to the asker.
const asker = await makeMemberWithPhoto('dq');
const mark2 = fakesMark();
const askMsg = await action('thread.sendMessage', [{ chatId: `ask-${chatPlan}`, text: 'Is it indoors?', clientId: 'dq-1' }], asker.session);
const askAt = new Date(sql1(`select created_at from messages where id = ${q(askMsg.result.message.id)}`).created_at).getTime();
await cronAt('reminders', askAt + 16 * MIN);
ok(emailsTo(mark2, host.email).some((e) => /^New question about Chatty plan/.test(e.subject ?? '')), 'the host: "New question about Chatty plan"');
const reply = await action('thread.sendMessage', [{ chatId: askMsg.result.chatId, text: 'Yes, all indoors.', clientId: 'dh-1' }], host.session);
const replyAt = new Date(sql1(`select created_at from messages where id = ${q(reply.result.message.id)}`).created_at).getTime();
await cronAt('reminders', replyAt + 16 * MIN);
ok(emailsTo(mark2, asker.email).some((e) => /^New reply about Chatty plan/.test(e.subject ?? '')), 'the asker: "New reply about Chatty plan"');
ok(emailsTo(mark2, host.email).concat(emailsTo(mark2, asker.email)).every((e) => !JSON.stringify(e).includes('Is it indoors?') && !JSON.stringify(e).includes('all indoors')), 'never the message words in an email (decision 1 A)');
eq(sql1(`select count(*)::int n from message_log where chat_id = ${q(chatId)} and channel = 'sms'`).n, 0, 'chat news is never a text');
done();
