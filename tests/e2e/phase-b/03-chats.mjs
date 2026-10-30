// Messages on the server (brief 2.2, section 4): the inbox and threads, send (membership, an open chat, 500
// characters, control characters stripped, the link check, 20 a minute, a client id so a retry never double
// posts), unread counts and the icon's number, read state, mute, leave and rejoin, the safety note, blocks in a
// plan chat and in a question, closed chats, and reporting from a chat.
import { action, done, eq, exec, makeMemberWithPhoto, ok, page, postPlan, q, setPlanStart, sql, sql1 } from './lib.mjs';

const host = await makeMemberWithPhoto('ch');
const g1 = await makeMemberWithPhoto('cg1');
const g2 = await makeMemberWithPhoto('cg2');
const asker = await makeMemberWithPhoto('cq');
const outsider = await makeMemberWithPhoto('cx');
const planId = await postPlan(host, { title: 'Chat test plan', places: 6 });
const join = async (who) => (await action('invite.joinOpenInvite', [planId], who.session)).result;
const chatId = (await join(g1)).chatId;
await join(g2);
const send = (who, text, clientId = `c-${Math.random().toString(36).slice(2)}`, to = chatId) => action('thread.sendMessage', [{ chatId: to, text, clientId }], who.session).then((r) => r.result);
const thread = (who, id = chatId, opts = {}) => action('thread.getThread', [id, opts], who.session).then((r) => r.result);
const chats = (who) => action('messages.getChats', [], who.session).then((r) => r.result);

// ---------------------------------------------------------------- the inbox and a thread
const hostChats = await chats(host);
eq(hostChats.map((c) => [c.kind, c.plan.id]), [['plan', planId]], 'the host\'s inbox: the plan chat');
const c0 = hostChats[0];
eq([c0.status, c0.closedReason, c0.muted, c0.plan.placesLeft, c0.plan.status], ['open', null, false, 3, 'open'], 'open, not muted, 3 places left');
eq(c0.participants.map((p) => [p.role, p.isYou]).sort(), [['host', true], ['member', false], ['member', false]].sort(), 'participants: the host and the two going');
const t0 = await thread(g1);
eq(t0.items.map((i) => i.kind === 'system' ? i.event : 'text'), ['opened', 'joined', 'joined'], 'the thread starts with the system lines');
eq([t0.firstUnreadId, t0.safetyNoteSeen], [null, false], 'nothing unread yet, and the safety note not seen');
eq((await action('thread.markSafetyNoteSeen', [], g1.session)).result, { ok: true }, 'the safety note: "Got it"');
eq((await thread(g1)).safetyNoteSeen, true, 'seen, once ever (every chat after this)');

// ---------------------------------------------------------------- sending, and every rule
eq((await send(g1, '   ')).reason, 'empty', 'an empty message is refused');
const long = await send(g1, 'x'.repeat(501));
eq([long.reason, long.error], ['too_long', '500/500 Message is at the limit'], '501 characters: refused with the composer\'s words');
ok((await send(g1, 'y'.repeat(500))).ok, 'exactly 500 characters goes');
for (const link of ['See https://example.com', 'www.example.com/brunch', 'wa.me/447700900123', 'example dot com', 'instagram.com/sam.jones', 'h t t p : // example . com', 'bit.ly/abc', 'example[.]com']) {
  const r = await send(g1, link);
  eq([r.reason, r.error], ['link', 'Links can’t be sent in chats. Tell people where to find it instead.'], `a link is refused on the server: "${link}"`);
}
const number = await send(g1, 'I’m on 07700 900456 if you get lost.');
ok(number.ok && number.message.text === 'I’m on 07700 900456 if you get lost.', 'a phone number goes through, as plain text');
ok((await send(g1, 'Email me at sam@example.co.uk')).ok, 'an email address goes through');
ok((await send(g1, 'Meet at 09:45, it is £12 each. See you there.Bring a towel')).ok, 'times, prices and a missing space after a full stop go through');
const dirty = await send(g1, '  hi\u0000 the​re\u0007  ');
eq(dirty.message.text, 'hi there', 'control and invisible characters are stripped, the ends trimmed');
const once = await send(g1, 'Only once please', 'retry-1');
const twice = await send(g1, 'Only once please', 'retry-1');
eq([twice.ok, twice.message.id], [true, once.message.id], 'the same clientId again (a retry): the message already stored');
eq(sql1(`select count(*)::int n from messages where chat_id = ${q(chatId)} and client_id = 'retry-1'`).n, 1, 'and only one row');
eq((await send(outsider, 'let me in')).reason, 'not_in_chat', 'someone not in the chat cannot send to it');
eq((await send(g1, 'hi', 'x', '00000000-0000-0000-0000-000000000000')).reason, 'not_found', 'a chat that does not exist');

// The rate limit: 20 a minute from one member, then "Slow down a moment."
const rater = await makeMemberWithPhoto('cr');
await join(rater);
let sent = 0;
let refused = null;
for (let n = 0; n < 25 && !refused; n += 1) {
  const r = await send(rater, `message ${n}`);
  if (r.ok) sent += 1;
  else refused = r;
}
eq([sent, refused?.reason, refused?.error], [20, 'rate_limited', 'Slow down a moment.'], 'the 21st message in a minute is refused');
exec(`update messages set created_at = created_at - interval '2 minutes' where sender_id = ${q(rater.id)}`);
ok((await send(rater, 'a minute later')).ok, 'a minute later it goes again');

// ---------------------------------------------------------------- unread, read, the icon's number
const before = (await action('messages.getUnreadCounts', [], g2.session)).result;
ok(before.chats === 1, 'g2 has one chat with unread messages', before);
const t2 = await thread(g2);
ok(t2.firstUnreadId && t2.items.find((i) => i.id === t2.firstUnreadId)?.senderId !== g2.id, 'the thread says where "N new messages" goes');
eq((await chats(g2))[0].unreadCount > 0, true, 'the inbox row is unread');
eq((await action('thread.markChatRead', [chatId], g2.session)).result, { ok: true }, 'opening reads it');
eq((await action('messages.getUnreadCounts', [], g2.session)).result.chats, 0, 'no unread chats now');
const hostUpdates = (await action('messages.getUnreadCounts', [], host.session)).result;
const badge = (await action('shell.getMessagesBadge', [], host.session)).result;
eq(badge, hostUpdates.chats + hostUpdates.updates, `the icon's number is unread chats plus unread updates (${badge})`);
ok(hostUpdates.updates >= 3, 'the host has their "joined" Updates unread');
const updates = (await action('messages.getUpdates', [], host.session)).result;
ok(updates.every((u) => u.plan.id === planId && u.role === 'host') && updates.some((u) => u.kind === 'joined' && u.actor?.id === g1.id), 'the Updates tab: who joined which plan', updates.map((u) => u.kind));
eq((await action('messages.markUpdateRead', [updates[0].id], host.session)).result, { ok: true, changed: true }, 'opening an update reads it');
const all = (await action('messages.markAllUpdatesRead', [], host.session)).result;
ok(all.ok && all.count === updates.length - 1, '"Mark all as read" reads the rest', all);
eq((await action('messages.getUnreadCounts', [], host.session)).result.updates, 0, 'no unread updates');
ok((await action('messages.markUpdateRead', [updates[0].id], g1.session)).result.changed === false, 'nobody can read someone else\'s update');

// ---------------------------------------------------------------- mute, leave, rejoin
eq((await action('thread.setChatMuted', [chatId, true], g2.session)).result, { ok: true }, 'mute');
eq((await chats(g2))[0].muted, true, 'the chat says it is muted');
eq((await action('thread.leaveChat', [chatId], host.session)).result.error, 'You host this plan, so its chat stays. Mute it instead.', 'the host keeps their own plan chat');
eq((await action('thread.leaveChat', [chatId], g2.session)).result, { ok: true }, 'g2 leaves the chat');
eq((await chats(g2)).length, 0, 'it leaves their inbox');
eq((await send(g2, 'still here?')).reason, 'not_in_chat', 'and they cannot send to it');
eq(sql1(`select status from plan_members where plan_id = ${q(planId)} and member_id = ${q(g2.id)}`).status, 'going', 'their place in the plan stays');
const back = await thread(g2);
ok(back && back.chat.id === chatId, 'opening the chat from the invite puts them back');
eq((await chats(g2)).length, 1, 'in their inbox again');

// ---------------------------------------------------------------- blocks in a plan chat
const g2Says = await send(g2, 'A message from g2');
eq((await action('messages.blockMember', [{ memberId: g2.id, chatId }], g1.session)).result, { ok: true }, 'g1 blocks g2');
ok(!(await thread(g1)).items.some((i) => i.id === g2Says.message.id), 'g1 no longer sees g2\'s messages, even in the plan chat they share');
ok((await thread(g2)).items.some((i) => i.senderId === g1.id), 'g2 still sees g1\'s (and is not told)');
await action('thread.markChatRead', [chatId], g1.session);
const g2Again = await send(g2, 'Another one');
ok(g2Again.ok, 'g2 can still send in the plan chat (blocking does not break the plan for everyone)');
eq((await action('messages.getUnreadCounts', [], g1.session)).result.chats, 0, 'and g2\'s new message is not unread for g1');
eq((await action('blocked.getBlockedMembers', [], g1.session)).result.map((b) => b.member.id), [g2.id], 'You > Blocked members lists them');
eq((await action('blocked.unblockMember', [g2.id], g1.session)).result, { ok: true }, 'unblock');
ok((await thread(g1)).items.some((i) => i.id === g2Says.message.id), 'their messages are back');

// ---------------------------------------------------------------- questions, and a block in a question
const q1 = await send(asker, 'Is there parking?', 'q-1', `ask-${planId}`);
ok(q1.ok && q1.chatId !== `ask-${planId}`, 'a first question makes the question chat and answers its real id');
const qThread = await thread(asker, q1.chatId);
eq([qThread.chat.kind, qThread.chat.other.id, qThread.chat.participants.length], ['question', host.id, 2], 'a question between the asker and the host');
eq((await thread(g1, q1.chatId)), null, 'nobody else can open it');
eq((await page(`/members/messages/${q1.chatId}`, g1.session)).status, 404, 'its page is a 404 for them');
eq((await page(`/members/messages/${q1.chatId}`, asker.session)).status, 200, 'and opens for the asker');
eq((await page(`/members/messages/ask-${planId}`, outsider.session)).status, 200, 'an ask-<plan> page opens for a member who has not asked');
const empty = await thread(outsider, `ask-${planId}`);
eq([empty.chat.id, empty.chat.kind, empty.items.length, empty.chat.other.id], [`ask-${planId}`, 'question', 0, host.id], 'as an empty question with the host');
eq((await send(host, 'Ask myself?', 'self-ask', `ask-${planId}`)).reason, 'not_found', 'the host cannot ask their own plan');
eq((await chats(host)).map((c) => c.kind).sort(), ['plan', 'question'], 'the host\'s inbox has the question too');
ok((await send(host, 'Yes, round the back.', 'q-2', q1.chatId)).ok, 'the host answers');
await action('messages.blockMember', [{ memberId: asker.id, chatId: q1.chatId }], host.session);
eq((await send(asker, 'Hello?', 'q-3', q1.chatId)).reason, 'blocked', 'a member the host blocked cannot send in their question');
eq((await thread(host, q1.chatId)), null, 'the host no longer has the question');
ok(!(await chats(host)).some((c) => c.id === q1.chatId), 'nor in the inbox');
const planB = await postPlan(host, { title: 'Second plan' });
eq((await send(asker, 'And this one?', 'q-4', `ask-${planB}`)).reason, 'not_found', 'nor ask about another of the host\'s plans');
eq((await action('invite.joinOpenInvite', [planB], asker.session)).result.reason, 'not_found', 'nor join them');
await action('messages.unblockMember', [asker.id], host.session);

// ---------------------------------------------------------------- reports from a chat
const report = (who, draft) => action('messages.sendReport', [draft], who.session).then((r) => r.result);
const rm = await report(g2, { target: { kind: 'message', chatId, messageId: once.message.id }, reason: 'pay_outside' });
ok(rm.ok, 'report a message in a chat they are in');
eq(sql1(`select kind, reason, member_id, chat_id, message_id from reports where id = ${q(rm.reportId)}`), { kind: 'message', reason: 'pay_outside', member_id: g1.id, chat_id: chatId, message_id: once.message.id }, 'stored with who sent it');
eq((await report(g1, { target: { kind: 'message', chatId, messageId: once.message.id }, reason: 'rude' })).ok, false, 'nobody can report their own message');
eq((await report(outsider, { target: { kind: 'message', chatId, messageId: once.message.id }, reason: 'rude' })).ok, false, 'nor one in a chat they are not in');
ok((await report(g2, { target: { kind: 'member', chatId, memberId: g1.id }, reason: 'harassment' })).ok, 'report a member in the chat');
eq((await report(outsider, { target: { kind: 'member', chatId, memberId: g1.id }, reason: 'harassment' })).ok, false, 'not from outside it');
const rp = await report(g2, { target: { kind: 'photo', chatId: null, memberId: g1.id }, reason: 'not_them' });
ok(rp.ok && sql1(`select photo_id from reports where id = ${q(rp.reportId)}`).photo_id === g1.photoId, 'report a photo: the photo as it is now');
ok((await report(g2, { target: { kind: 'member', chatId, memberId: g1.id }, reason: 'photo_not_them_or_unsuitable' })).ok, 'a member report about their photo');
eq((await report(g2, { target: { kind: 'message', chatId, messageId: once.message.id }, reason: 'not_them' })).error, 'Pick a reason.', 'a photo reason on a message is refused');

// ---------------------------------------------------------------- closed chats
const qq = await send(asker, 'Last question', 'q-5', q1.chatId);
ok(qq.ok, 'a question before the plan starts');
setPlanStart(planId, -10);
eq((await send(asker, 'Too late?', 'q-6', q1.chatId)).reason, 'closed', 'a question closes when the plan starts');
const qClosed = await thread(asker, q1.chatId);
eq([qClosed.chat.status, qClosed.chat.closedReason, qClosed.items.at(-1).event], ['closed', 'invite_closed', 'closed'], 'closed: invite_closed, with the "closed" line last');
ok((await send(g1, 'On my way')).ok, 'the plan chat stays open on the day');
setPlanStart(planId, -(25 * 60));
eq((await send(g1, 'Thanks all')).reason, 'closed', 'a plan chat closes 24 hours after the plan');
const pClosed = await thread(g1);
eq([pClosed.chat.status, pClosed.chat.closedReason, pClosed.chat.plan.status], ['closed', 'plan_finished', 'finished'], 'closed: plan_finished, the plan finished');
const cancelPlan = await postPlan(host, { title: 'Will be cancelled' });
const cChat = (await action('invite.joinOpenInvite', [cancelPlan], g1.session)).result.chatId;
await action('plan.cancelOpenInvite', [cancelPlan], host.session);
const cClosed = await thread(g1, cChat);
eq([cClosed.chat.status, cClosed.chat.closedReason, cClosed.items.at(-1).event, cClosed.items.at(-1).memberId], ['closed', 'host_cancelled', 'cancelled', host.id], 'a cancelled plan\'s chat closes with "{host} cancelled this plan."');
eq((await send(g1, 'Oh no', 'x', cChat)).reason, 'closed', 'and refuses messages');
ok((await chats(g1)).some((c) => c.id === cChat && c.status === 'closed'), 'closed chats stay in the inbox (read only)');

// ---------------------------------------------------------------- the pages
const inbox = await page('/members/messages', g1.session);
ok(inbox.status === 200 && inbox.text.includes('Chat test plan') && !/Example screen|Example content/.test(inbox.text), 'the inbox page: real chats, no example note');
eq((await page('/members/messages/not-a-chat', g1.session)).status, 404, 'a thread that is not theirs: 404');
done();
