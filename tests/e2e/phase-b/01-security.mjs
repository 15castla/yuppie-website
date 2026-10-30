// RLS and grants on the stage 2 tables, with real member tokens through PostgREST (the brief, section 4):
// a member reads only their plans, their own places, the chats they are in and those chats' messages (never a
// removed one, never one from someone they blocked), their own Updates, blocks, reports, photos and switches;
// writes nothing at all; cannot run the functions; anon reads nothing. The photo bucket is private and its
// restrictive policy holds even against a broad permissive one. The stub refuses a member's token on it.
import crypto from 'node:crypto';
import { done, eq, exec, ok, q, rest, sql, sql1, seeded, memberSession, SUPA, ANON, action, BASE } from './lib.mjs';

const S = seeded();
const m = Object.fromEntries(Object.entries(S.members).map(([k, v]) => [k, v.id]));
const P = S.stage2.plans;
const A = await memberSession(S.members.active.email);
const E = await memberSession(S.members.ending.email);
const F2 = await memberSession(S.members.filler2.email);
const ids = (r) => (Array.isArray(r.json) ? r.json.map((x) => x.id ?? x.chat_id ?? x.plan_id ?? x.member_id).sort() : r.json);

// ---------------------------------------------------------------- reads
const plans = await rest('GET', 'plans?select=id', A);
eq(plans.status, 200, 'member reads plans: 200');
eq(ids(plans), [P.climbing.id, P.walk.id, P.padel.id, P.spin.id].sort(), 'active sees exactly the plans they host or are going to (not Comedy, Quiz or Gallery)');
const places = await rest('GET', 'plan_members?select=member_id', A);
ok(places.json.length > 0 && places.json.every((r) => r.member_id === m.active), 'plan_members: only their own rows');
const chats = await rest('GET', 'chats?select=id', A);
const mine = sql(`select chat_id from chat_members where member_id = ${q(m.active)} and left_at is null`).map((r) => r.chat_id).sort();
eq(ids(chats), mine, 'chats: exactly the chats they are in');
const eChats = await rest('GET', `chats?select=id&id=eq.${S.stage2.chats.climbingQuestion}`, E);
eq(eChats.json, [], 'ending (going to Climbing) cannot read the question chat between its host and someone else');
const eMsgs = await rest('GET', `messages?select=id&chat_id=eq.${S.stage2.chats.climbingQuestion}`, E);
eq(eMsgs.json, [], 'nor its messages');
const walkMsgs = await rest('GET', `messages?select=id,body&chat_id=eq.${P.walk.chatId}&kind=eq.text`, A);
ok(walkMsgs.json.length >= 4, 'active reads the messages of a chat they are in', walkMsgs.json);

// A blocked sender and a removed message are invisible through REST too.
const x = sql1(`select id from members where email = ${q(S.members.problem.email)}`).id;
exec(`insert into chat_members (chat_id, member_id, role) values (${q(P.walk.chatId)}, ${q(x)}, 'member') on conflict (chat_id, member_id) do update set left_at = null`);
const blockedMsg = crypto.randomUUID();
const removedMsg = crypto.randomUUID();
exec(`insert into messages (id, chat_id, kind, sender_id, body) values (${q(blockedMsg)}, ${q(P.walk.chatId)}, 'text', ${q(x)}, 'from someone active will block')`);
exec(`insert into messages (id, chat_id, kind, sender_id, body, removed_at) values (${q(removedMsg)}, ${q(P.walk.chatId)}, 'text', ${q(m.ending)}, 'removed words', now())`);
let seen = (await rest('GET', `messages?select=id&chat_id=eq.${P.walk.chatId}`, A)).json.map((r) => r.id);
ok(seen.includes(blockedMsg), 'before the block: the message shows');
ok(!seen.includes(removedMsg), 'a removed message is never readable through REST');
exec(`insert into blocks (blocker_id, blocked_id) values (${q(m.active)}, ${q(x)}) on conflict do nothing`);
seen = (await rest('GET', `messages?select=id&chat_id=eq.${P.walk.chatId}`, A)).json.map((r) => r.id);
ok(!seen.includes(blockedMsg), 'after blocking: the blocker no longer reads their messages, even in a shared plan chat');
const theirs = (await rest('GET', `messages?select=id&chat_id=eq.${P.walk.chatId}`, await memberSession(S.members.problem.email))).json.map((r) => r.id);
ok(theirs.length > 0 && theirs.includes(S.stage2.messages.walkActive), 'the blocked member still reads the blocker\'s messages (they are not told)');
exec(`delete from blocks where blocker_id = ${q(m.active)} and blocked_id = ${q(x)}; delete from messages where id in (${q(blockedMsg)}, ${q(removedMsg)}); delete from chat_members where chat_id = ${q(P.walk.chatId)} and member_id = ${q(x)}`);

const updatesA = await rest('GET', 'updates?select=member_id', A);
ok(updatesA.json.length >= 3 && updatesA.json.every((r) => r.member_id === m.active), 'updates: their own only');
eq((await rest('GET', `updates?select=id&member_id=eq.${m.active}`, E)).json, [], 'another member cannot read them');
eq((await rest('GET', 'blocks?select=blocker_id,blocked_id', A)).json.filter((b) => b.blocked_id === m.filler2).length, 1, 'blocks: the blocker reads their own block');
eq((await rest('GET', 'blocks?select=blocker_id', F2)).json, [], 'the blocked member cannot see it (they are not told)');
const reportsA = await rest('GET', 'reports?select=id,reporter_id', A);
ok(reportsA.json.length >= 2 && reportsA.json.every((r) => r.reporter_id === m.active), 'reports: their own only');
ok(!(await rest('GET', 'reports?select=id', E)).json.some((r) => r.id === S.stage2.reports.message), 'another member cannot read a report about a message they did not report');
eq((await rest('GET', `reports?select=id&member_id=eq.${m.filler1}`, await memberSession(S.members.filler1.email))).json, [], 'nor can the member reported read reports about them');
const photosA = await rest('GET', 'member_photos?select=member_id,path', A);
ok(photosA.json.length >= 1 && photosA.json.every((r) => r.member_id === m.active), 'member_photos: their own rows only');
eq((await rest('GET', `member_photos?select=id&member_id=eq.${m.filler1}`, A)).json, [], 'another member\'s private photo records are not readable');
eq((await rest('GET', 'notification_preferences?select=member_id', E)).json.map((r) => r.member_id), [m.ending], 'notification_preferences: their own');
eq((await rest('GET', `notification_preferences?select=member_id&member_id=eq.${m.ending}`, A)).json, [], 'not anyone else\'s');

// ---------------------------------------------------------------- writes: none at all
const denied = (r) => [401, 403].includes(r.status);
const snapshot = () => sql1(`select (select count(*) from plans) p, (select count(*) from plan_members) pm, (select count(*) from chats) c, (select count(*) from chat_members) cm, (select count(*) from messages) ms, (select count(*) from updates) u, (select count(*) from blocks) b, (select count(*) from reports) r, (select count(*) from member_photos) ph, (select count(*) from notification_preferences) np, (select string_agg(title || status, ',' order by id) from plans) t, (select string_agg(muted::text || coalesce(last_read_at::text, ''), ',' order by chat_id, member_id) from chat_members) cmx, (select string_agg(coalesce(read_at::text, ''), ',' order by id) from updates) ux, (select string_agg(status, ',' order by id) from member_photos) phx`);
const before = snapshot();
const attempts = [
  ['POST', 'plans', { host_id: m.active, title: 'Sneaky', type: 'Sport', starts_at: new Date(Date.now() + 86400000).toISOString(), place: 'X', places: 4 }],
  ['PATCH', `plans?id=eq.${P.climbing.id}`, { title: 'Changed by REST' }],
  ['DELETE', `plans?id=eq.${P.climbing.id}`],
  ['POST', 'plan_members', { plan_id: P.comedy.id, member_id: m.active }],
  ['PATCH', `plan_members?plan_id=eq.${P.walk.id}&member_id=eq.${m.active}`, { status: 'left' }],
  ['POST', 'chats', { plan_id: P.comedy.id, kind: 'question', asker_id: m.active }],
  ['POST', 'chat_members', { chat_id: S.stage2.chats.climbingQuestion, member_id: m.ending, role: 'member' }],
  ['PATCH', `chat_members?chat_id=eq.${P.walk.chatId}&member_id=eq.${m.active}`, { muted: true, last_read_at: new Date().toISOString() }],
  ['POST', 'messages', { chat_id: P.walk.chatId, kind: 'text', sender_id: m.active, body: 'http://example.com via REST' }],
  ['PATCH', `messages?id=eq.${S.stage2.messages.walkActive}`, { body: 'edited' }],
  ['DELETE', `messages?id=eq.${S.stage2.messages.walkActive}`],
  ['PATCH', `updates?member_id=eq.${m.active}`, { read_at: new Date().toISOString() }],
  ['POST', 'updates', { member_id: m.active, kind: 'joined', plan_id: P.walk.id, role: 'going' }],
  ['POST', 'blocks', { blocker_id: m.active, blocked_id: m.ending }],
  ['DELETE', `blocks?blocker_id=eq.${m.active}`],
  ['POST', 'reports', { reporter_id: m.active, kind: 'plan', reason: 'other', plan_id: P.comedy.id }],
  ['PATCH', `reports?reporter_id=eq.${m.active}`, { status: 'dismissed' }],
  ['POST', 'member_photos', { member_id: m.active, path: `${m.active}/rest.jpg` }],
  ['PATCH', `member_photos?member_id=eq.${m.active}`, { status: 'approved' }],
  ['POST', 'notification_preferences', { member_id: m.active, channel_text: true }],
  ['PATCH', `notification_preferences?member_id=eq.${m.ending}`, { channel_text: false }],
];
for (const [method, path, body] of attempts) {
  const r = await rest(method, path, method === 'PATCH' && path.startsWith('notification_preferences') ? E : A, body);
  ok(denied(r), `REST ${method} ${path.split('?')[0]} as a member: refused (${r.status})`, r.json);
}
eq(snapshot(), before, 'and nothing in any stage 2 table changed');
for (const col of [{ photo_id: S.stage2.photos.filler1 }, { avatar_url: 'https://evil.example/x.jpg' }, { chat_safety_seen_at: new Date().toISOString() }]) {
  const r = await rest('PATCH', `members?id=eq.${m.active}`, A, col);
  ok(denied(r), `members: a member cannot set ${Object.keys(col)[0]} through REST (${r.status})`);
}
eq(sql1(`select photo_id = ${q(S.stage2.photos.active)} as same from members where id = ${q(m.active)}`).same, true, 'their photo is unchanged');
const nameOk = await rest('PATCH', `members?id=eq.${m.active}`, A, { full_name: 'Ada Active' });
eq(nameOk.status, 200, 'stage 1 still works: a member updates their own name');

for (const fn of ['join_plan', 'post_plan', 'leave_plan', 'cancel_plan', 'open_question', 'unread_counts', 'chat_unread', 'mark_chat_read', 'chat_nudges_due', 'blocked_between']) {
  const r = await rest('POST', `rpc/${fn}`, A, { p_member: m.active, p_plan: P.comedy.id });
  ok([401, 403, 404].includes(r.status), `rpc/${fn} as a member: refused (${r.status})`);
}
eq(sql1(`select count(*)::int n from plan_members where plan_id = ${q(P.comedy.id)} and member_id = ${q(m.active)}`).n, 0, 'join_plan through REST did not join');

// ---------------------------------------------------------------- anon
for (const t of ['plans', 'plan_members', 'chats', 'chat_members', 'messages', 'updates', 'blocks', 'reports', 'member_photos', 'notification_preferences']) {
  const r = await rest('GET', `${t}?select=*&limit=1`, null);
  ok(denied(r) || (Array.isArray(r.json) && r.json.length === 0), `anon reads nothing from ${t} (${r.status})`);
}

// ---------------------------------------------------------------- the private photo bucket
eq(sql1(`select public, file_size_limit from storage.buckets where id = 'member-photos'`), { public: false, file_size_limit: 10485760 }, 'member-photos is a private bucket, 10 MB');
eq(sql1(`select permissive, cmd from pg_policies where schemaname = 'storage' and policyname = 'Member photos are server only'`), { permissive: 'RESTRICTIVE', cmd: 'ALL' }, 'its storage policy is restrictive, for every command');
// Database-level proof of the policy (the stub does not run RLS; the real storage API does): a row for a file in
// each bucket, read through PostgREST as the member, with and without a broad permissive policy.
exec(`insert into storage.objects (bucket_id, name) values ('member-photos', 'bf-rls/secret.jpg'), ('member-media', 'bf-rls/public.jpg') on conflict do nothing`);
const objs = async (who) => (await rest('GET', 'objects?select=bucket_id,name&name=like.bf-rls*', who, null, { 'Accept-Profile': 'storage' })).json;
eq(await objs(A), [], 'as a member, storage.objects shows nothing (no permissive policy at all)');
exec(`create policy "bf temp everything" on storage.objects for all to authenticated using (true) with check (true)`);
const withBroad = await objs(A);
exec(`drop policy "bf temp everything" on storage.objects`);
eq(withBroad.map((o) => o.bucket_id), ['member-media'], 'even with a policy letting members see every object, member-photos stays hidden (the restrictive policy is ANDed)');
exec(`delete from storage.objects where name like 'bf-rls/%'`);

const path = sql1(`select path from member_photos where id = ${q(S.stage2.photos.active)}`).path;
const pub = await fetch(`${SUPA}/storage/v1/object/public/member-photos/${path}`);
eq(pub.status, 400, 'the stub: no public URL for a member photo');
const asMember = await fetch(`${SUPA}/storage/v1/object/member-photos/${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${A.access_token}` } });
eq(asMember.status, 403, 'the stub: a member\'s token cannot read the file');
const list = await fetch(`${SUPA}/storage/v1/object/list/member-photos`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${A.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ prefix: m.active }) });
eq(list.status, 403, 'nor list the bucket');
const up = await fetch(`${SUPA}/storage/v1/object/member-photos/${m.active}/by-member.jpg`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${A.access_token}`, 'content-type': 'image/jpeg' }, body: Buffer.from('x') });
eq(up.status, 403, 'nor upload into it');
const sign = await fetch(`${SUPA}/storage/v1/object/sign/member-photos/${path}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${A.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn: 60 }) });
eq(sign.status, 403, 'nor sign a URL for it');
const anonGet = await fetch(`${SUPA}/storage/v1/object/member-photos/${path}`, { headers: { apikey: ANON } });
eq(anonGet.status, 403, 'nor can anon');

// The server hands out signed URLs (the feed's photos), and they work.
const feed = (await action('invite.getOpenInviteFeed', [], A)).result;
const hostPhoto = feed.invites.find((i) => i.id === P.walk.id)?.host.photoUrl;
ok(typeof hostPhoto === 'string' && hostPhoto.includes('/object/sign/member-photos/') && hostPhoto.includes('token='), 'the feed\'s photos are signed URLs in the private bucket', hostPhoto);
const img = await fetch(hostPhoto);
eq([img.status, img.headers.get('content-type')], [200, 'image/jpeg'], 'and a signed URL serves the photo');
const forged = await fetch(hostPhoto.replace(/token=[^&]+/, 'token=forged.forged'));
eq(forged.status, 400, 'a forged token does not');

// ---------------------------------------------------------------- gated members use none of it
const paused = await memberSession(S.members.paused.email);
for (const name of ['invite.getOpenInviteFeed', 'messages.getChats', 'thread.sendMessage', 'notifications.getNotificationSettings']) {
  const r = await action(name, name === 'thread.sendMessage' ? [{ chatId: P.walk.chatId, text: 'hi', clientId: 'paused-1' }] : [], paused);
  eq(r.redirect, '/members/membership', `${name}: a paused member is sent to the membership gate`);
}
const noCookie = await fetch(`${BASE}/api/test-hooks/invite.getOpenInviteFeed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"args":[]}' });
eq((await noCookie.json()).result, { sessionEnded: true }, 'no session: SESSION_ENDED');
done();
