// Stage 2 fix round 3 (the independent re-check of the integrated branch, /home/claude/build-b/qa/qr/): one
// regression check per finding, on a production build with the stage 2 switches on, against the local stack,
// through the real actions (the test hook), REST as a member, the pages, and the release scripts:
//   QR-01  blocking needs a real reason to know the person (a chat or a plan the two share or shared, or the host
//          of a plan you can see, from its question): a stranger's id is refused with the same words as an id that
//          does not exist, nothing is written; You > Blocked members shows a photo only while the two still share
//          a chat or a plan, otherwise the initial; legitimate blocks still work, both ways
//   QR-02  Delete my account and the photo move touch only the member's own avatars/<member id>-... file, never
//          another file avatar_url points at (an event image, another member's photo)
//   QR-03  the move without sharp leaves a photo stored turned (EXIF orientation) unmoved, "needs a look" (they
//          meet the gate); with sharp it is turned the right way up
//   QR-04  the app while Open Invite is hidden: You > Notifications has no Open Invite switches, You has no
//          Blocked members row (and its page and actions are 404s), as Messages already is
//   QR-05  a question whose other member blocked you is closed before you type (the lock row, no composer), and
//          nothing in it says why
//
//   tests/e2e/phase-b/server.sh build && tests/e2e/phase-b/server.sh start prod 3253
//   PHASE_B_BASE=http://localhost:3253 PHASE_B_TAG=bx3. node tests/e2e/phase-b/15-fixes-3.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  BASE, PREFIX as TAG, action, cookieFor, done, eq, makeMember, makeMemberWithPhoto, ok, page, postPlan, q, rand, rest, sql1, svc,
} from './lib.mjs';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const STORE = '/home/claude/stack/storage';
const sharp = createRequire(`${ROOT}/package.json`)('sharp');
const APP_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 YuppieNativeApp';
const cid = () => crypto.randomUUID();
const chatOf = (pid) => sql1(`select id from chats where plan_id = ${q(pid)} and kind = 'plan'`).id;
const join = async (who, pid) => (await action('invite.joinOpenInvite', [pid], who.session)).result;
const send = async (who, chatId, text) => (await action('thread.sendMessage', [{ chatId, text, clientId: cid() }], who.session)).result;
const block = async (who, memberId, chatId = null) => (await action('messages.blockMember', [{ memberId, chatId }], who.session)).result;
const blockedList = async (who) => (await action('blocked.getBlockedMembers', [], who.session)).result;
const rowFor = (list, id) => (Array.isArray(list) ? list.find((x) => x.member.id === id) : null);
const appPage = (url, m) => page(url, m.session, { 'user-agent': APP_UA, cookie: `${cookieFor(m.session)}; is-native-app=1` });
async function appAction(name, args, session) {
  const r = await fetch(`${BASE}/api/test-hooks/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': APP_UA, cookie: `${cookieFor(session)}; is-native-app=1` },
    body: JSON.stringify({ args }),
  });
  return r.json();
}
const cleanup = [];
const RUN = `x3${rand()}`;
const NEUTRAL = 'That member couldn’t be found.';

// ==================================================================== QR-01 who may be blocked
{
  const S = await makeMemberWithPhoto(`${RUN}str`, 'active', { full_name: 'Stella Stranger' });
  const N = await makeMemberWithPhoto(`${RUN}nosy`);
  eq(sql1(`select count(*)::int n from chat_members a join chat_members b on a.chat_id = b.chat_id where a.member_id = ${q(N.id)} and b.member_id = ${q(S.id)}`).n, 0, 'QR-01: the stranger and the nosy member share no chat');
  const asStranger = await block(N, S.id, null);
  eq(asStranger, { ok: false, error: NEUTRAL }, 'QR-01: blocking a stranger by id is refused');
  eq(await block(N, crypto.randomUUID(), null), asStranger, 'QR-01: with exactly the answer for an id that is no member (it says nothing about the stranger)');
  eq(await block(N, 'not-an-id', null), asStranger, 'QR-01: and for something that is not an id');
  // A chat id that is not theirs, or a question placeholder for a plan that is not the stranger's, changes nothing.
  const sPlan = await postPlan(S, { title: `${RUN} stranger plan`, places: 4 });
  cleanup.push([S, sPlan]);
  eq(await block(N, S.id, chatOf(sPlan)), asStranger, 'QR-01: naming the stranger\'s plan chat (not theirs) does not help');
  const other = await makeMemberWithPhoto(`${RUN}oth`);
  const oPlan = await postPlan(other, { title: `${RUN} other plan`, places: 4 });
  cleanup.push([other, oPlan]);
  eq(await block(N, S.id, `ask-${oPlan}`), asStranger, 'QR-01: nor a question about someone else\'s plan');
  eq(await block(N, S.id, `ask-${crypto.randomUUID()}`), asStranger, 'QR-01: nor a question about a plan that does not exist');
  eq(sql1(`select count(*)::int n from blocks where blocker_id = ${q(N.id)}`).n, 0, 'QR-01: nothing was written');
  const list = await blockedList(N);
  ok(Array.isArray(list) && list.length === 0, 'QR-01: You > Blocked members lists no one (no name, no photo of the stranger)', list);
  const viaRest = await rest('GET', `blocks?select=*&blocker_id=eq.${N.id}`, N.session);
  eq([viaRest.status, viaRest.json], [200, []], 'QR-01: REST: no block row to read');
  const restInsert = await rest('POST', 'blocks', N.session, { blocker_id: N.id, blocked_id: S.id });
  ok(restInsert.status === 401 || restInsert.status === 403, `QR-01: REST: a member cannot write a block directly (${restInsert.status})`);
  const restPhoto = await rest('GET', `member_photos?select=id,path&member_id=eq.${S.id}`, N.session);
  eq([restPhoto.status, restPhoto.json], [200, []], 'QR-01: REST: nor read the stranger\'s photo rows');
  const html = (await page('/members/you/blocked', N.session)).text;
  ok(html.includes('No one blocked.') && !html.includes('Stella') && !html.includes(`member-photos/${S.id}`), 'QR-01: the Blocked members page: "No one blocked.", nothing of the stranger');
}

// ---------------------------------------------------------------- legitimate blocks, both ways
{
  const H = await makeMemberWithPhoto(`${RUN}host`, 'active', { full_name: 'Hana Host' });
  const G = await makeMemberWithPhoto(`${RUN}gst`, 'active', { full_name: 'Gus Guest' });
  const F = await makeMemberWithPhoto(`${RUN}frm`, 'active', { full_name: 'Fay Former' });
  const pid = await postPlan(H, { title: `${RUN} both ways`, places: 5 });
  cleanup.push([H, pid]);
  ok((await join(G, pid)).ok && (await join(F, pid)).ok, 'QR-01: G and F join H\'s plan');
  const chat = chatOf(pid);
  eq(await block(G, H.id, chat), { ok: true }, 'QR-01: G blocks the host from the plan chat');
  eq(await block(H, G.id, chat), { ok: true }, 'QR-01: and the host blocks G back (both ways)');
  for (const [who, them, name] of [[G, H, 'Hana'], [H, G, 'Gus']]) {
    const row = rowFor(await blockedList(who), them.id);
    eq(row?.member.firstName, name, `QR-01: ${who === G ? 'G' : 'H'}'s Blocked members lists ${name} by name`);
    ok(row?.member.photoUrl && decodeURIComponent(row.member.photoUrl).includes(`/object/sign/member-photos/${them.id}/`), 'QR-01: with their photo while the two share the plan chat (they see it there anyway)');
    eq((await fetch(row.member.photoUrl)).status, 200, 'QR-01: and the photo loads');
  }
  // F withdraws, then blocks the host: a plan they shared counts.
  ok((await action('invite.withdrawFromOpenInvite', [pid], F.session)).result.ok, 'QR-01: F withdraws from the plan');
  eq(await block(F, H.id, null), { ok: true }, 'QR-01: F can still block the host (a plan they shared)');
  const fRow = rowFor(await blockedList(F), H.id);
  eq([fRow?.member.firstName, fRow?.member.photoUrl], ['Hana', null], 'QR-01: F\'s list: the host\'s name, and the initial instead of the photo (they share nothing now)');
  const fHtml = (await page('/members/you/blocked', F.session)).text;
  ok(fHtml.includes('Hana') && !fHtml.includes(`member-photos/${H.id}`), 'QR-01: the page draws the initial (no photo address of the host in it)');
  // The host changes their photo; G (blocked by the host) withdraws and cannot get the new one from the list.
  const up = await action('photo.uploadMyPhoto', [{ $formData: { face: 'found' }, $files: { photo: { name: 'p.jpg', type: 'image/jpeg', base64: fs.readFileSync('/home/claude/stack/tools/fixtures/photo-480.jpg').toString('base64') } } }], H.session);
  ok(up.result?.success, 'QR-01: the host changes their photo');
  ok((await action('invite.withdrawFromOpenInvite', [pid], G.session)).result.ok, 'QR-01: G withdraws');
  const gRow = rowFor(await blockedList(G), H.id);
  eq(gRow?.member.photoUrl ?? null, null, 'QR-01: G\'s list no longer has the host\'s photo (old or new)');
  eq(rowFor(await blockedList(H), G.id)?.member.photoUrl ?? null, null, 'QR-01: nor the host\'s list G\'s');
  // A question not asked yet: the host of a plan you can see (chat info in ask-<plan id>).
  const A = await makeMemberWithPhoto(`${RUN}ask`);
  const p2 = await postPlan(H, { title: `${RUN} ask first`, places: 4 });
  cleanup.push([H, p2]);
  eq(await block(A, H.id, `ask-${p2}`), { ok: true }, 'QR-01: blocking the host from a question not asked yet works (the plan is theirs and A can see it)');
  eq(rowFor(await blockedList(A), H.id)?.member.photoUrl ?? null, null, 'QR-01: A\'s list shows the host\'s initial (their plans are hidden from A now)');
  // A question asked: the host blocks the asker from it.
  const Q = await makeMemberWithPhoto(`${RUN}qst`);
  const asked = await send(Q, `ask-${p2}`, 'Is it near the station?');
  ok(asked?.ok, 'QR-01: Q asks the host a question');
  eq(await block(H, Q.id, asked.chatId), { ok: true }, 'QR-01: the host blocks Q from the question');
  eq(await block(H, H.id, null), { ok: false, error: 'You can’t block yourself.' }, 'QR-01: nobody blocks themselves');
}

// ==================================================================== QR-05 a question closed by a block, before typing
{
  const H = await makeMemberWithPhoto(`${RUN}qh`, 'active', { full_name: 'Quentin Host' });
  const J = await makeMemberWithPhoto(`${RUN}qj`);
  const K = await makeMemberWithPhoto(`${RUN}qk`);
  const pid = await postPlan(H, { title: `${RUN} question about parking`, places: 4 });
  cleanup.push([H, pid]);
  const a = await send(J, `ask-${pid}`, 'Parking nearby?');
  const k = await send(K, `ask-${pid}`, 'Can I bring a friend?');
  ok(a?.ok && k?.ok, 'QR-05: J and K ask the host');
  const before = (await action('thread.getThread', [a.chatId], J.session)).result;
  eq([before.chat.status, before.chat.closedReason], ['open', null], 'QR-05: J\'s question is open');
  eq(await block(H, J.id, a.chatId), { ok: true }, 'QR-05: the host blocks J from the question');
  const th = (await action('thread.getThread', [a.chatId], J.session)).result;
  eq([th?.chat.status, th?.chat.closedReason], ['closed', 'invite_closed'], 'QR-05: J\'s question is closed now, as a question whose invite closed');
  ok(!th.items.some((i) => i.kind === 'system' && i.event === 'closed'), 'QR-05: with no "This chat closed" line dated at a start that has not come');
  ok(th.items.some((i) => i.kind === 'text' && i.text === 'Parking nearby?'), 'QR-05: J\'s own message is still there');
  const strings = [];
  (function walk(v) {
    if (typeof v === 'string') strings.push(v);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  })(th);
  ok(!strings.some((s) => /block/i.test(s)), 'QR-05: no word in J\'s thread says "block"');
  const keys = (v, p = '') => (v && typeof v === 'object' ? Object.entries(v).flatMap(([key, x]) => { const k = `${p}${Array.isArray(v) ? '[]' : key}`; return [k, ...keys(x, `${k}.`)]; }) : []);
  eq([...new Set(keys(th))].sort(), [...new Set(keys(before))].sort(), 'QR-05: and its shape is the open question\'s (no field added for the block)');
  ok(th.chat.participants.every((p) => p.blockedByYou === false), 'QR-05: J has blocked no one (the only block field says so)');
  const inbox = (await action('messages.getChats', [], J.session)).result;
  const inRow = inbox.find((c) => c.id === a.chatId);
  eq([inRow?.status, inRow?.closedReason], ['closed', 'invite_closed'], 'QR-05: the inbox has it closed too');
  const html = (await page(`/members/messages/${a.chatId}`, J.session)).text;
  ok(html.includes('Questions close when the invite closes.') && !html.includes('<textarea'), 'QR-05: the page draws the lock row and no composer, before J types');
  const sent = await send(J, a.chatId, 'Hello?');
  eq([sent.ok, sent.reason, sent.error], [false, 'closed', 'This chat is closed'], 'QR-05: a send (from an old page) is the closed chat\'s answer, as before');
  const kTh = (await action('thread.getThread', [k.chatId], K.session)).result;
  eq(kTh.chat.status, 'open', 'QR-05: K\'s question on the same plan stays open');
  // The other way round: the asker blocks the host; the host's side of that question closes.
  const L = await makeMemberWithPhoto(`${RUN}ql`);
  const l = await send(L, `ask-${pid}`, 'What time do we finish?');
  eq(await block(L, H.id, l.chatId), { ok: true }, 'QR-05: an asker blocks the host from their question');
  const hTh = (await action('thread.getThread', [l.chatId], H.session)).result;
  eq([hTh?.chat.status, hTh?.chat.closedReason], ['closed', 'invite_closed'], 'QR-05: the host sees that question closed, before typing');
  eq((await send(H, l.chatId, 'We finish at nine')).reason, 'closed', 'QR-05: and a send is refused as closed');
  eq((await action('messages.unblockMember', [J.id], H.session)).result, { ok: true }, 'QR-05: the host unblocks J');
  eq((await action('thread.getThread', [a.chatId], J.session)).result.chat.status, 'open', 'QR-05: J\'s question is open again');
}

// ==================================================================== QR-04 the app while Open Invite is hidden
{
  const M = await makeMemberWithPhoto(`${RUN}app`);
  const web = await page('/members/you/notifications', M.session);
  ok(web.status === 200 && web.text.includes('Plans you host') && web.text.includes('For Open Invite plans and Club events you’re booked on.'), 'QR-04: on the web, Notifications has the Open Invite switches');
  const app = await appPage('/members/you/notifications', M);
  eq(app.status, 200, 'QR-04: in the app Notifications opens');
  ok(!app.text.includes('Plans you host') && !app.text.includes('Plans you’re in') && !app.text.includes('Open Invite'), 'QR-04: with no Open Invite switches and no word of Open Invite');
  ok(app.text.includes('For Club events you’re booked on.') && app.text.includes('24 hours before') && app.text.includes('Booking confirmed'), 'QR-04: the reminders (for Club events) and Club events stay');
  const webYou = await page('/members/you', M.session);
  ok(webYou.text.includes('Blocked members'), 'QR-04: on the web, You has the Blocked members row');
  const appYou = await appPage('/members/you', M);
  ok(appYou.status === 200 && !appYou.text.includes('Blocked members') && appYou.text.includes('Notifications'), 'QR-04: in the app, You has no Blocked members row (Notifications stays)');
  eq((await page('/members/you/blocked', M.session)).status, 200, 'QR-04: on the web Blocked members opens');
  eq((await appPage('/members/you/blocked', M)).status, 404, 'QR-04: in the app it is a 404');
  eq((await appAction('blocked.getBlockedMembers', [], M.session)).notFound, true, 'QR-04: and its list action is a 404 in the app');
  eq((await appAction('blocked.unblockMember', [M.id], M.session)).notFound, true, 'QR-04: so is Unblock');
  eq((await appAction('messages.blockMember', [{ memberId: M.id, chatId: null }], M.session)).notFound, true, 'QR-04: and Block (as Messages)');
}

// ==================================================================== QR-02 Delete my account: only the member's own file
{
  const put = async (objectPath, file = '/home/claude/stack/tools/fixtures/photo-480.jpg') => {
    const { error } = await svc.storage.from('member-media').upload(objectPath, fs.readFileSync(file), { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    return svc.storage.from('member-media').getPublicUrl(objectPath).data.publicUrl;
  };
  const eventUrl = await put(`events/${RUN}-probe.jpg`);
  const someone = await makeMember(`${RUN}else`);
  const theirUrl = await put(`avatars/${someone.id}-${Date.now()}.jpg`);
  const D1 = await makeMemberWithPhoto(`${RUN}del1`);
  const D2 = await makeMemberWithPhoto(`${RUN}del2`);
  const D3 = await makeMemberWithPhoto(`${RUN}del3`);
  const ownUrl = await put(`avatars/${D3.id}-${Date.now()}.jpg`);
  // As a stage 1 member could have set it (avatar_url was member-writable then).
  await svc.from('members').update({ avatar_url: eventUrl }).eq('id', D1.id);
  await svc.from('members').update({ avatar_url: theirUrl }).eq('id', D2.id);
  await svc.from('members').update({ avatar_url: ownUrl }).eq('id', D3.id);
  for (const m of [D1, D2, D3]) ok((await action('you.deleteMyAccount', ['delete'], m.session)).redirect !== undefined, `QR-02: ${m.email.split('@')[0]} deletes their account`);
  eq((await fetch(eventUrl)).status, 200, 'QR-02: an event image avatar_url pointed at is still there');
  eq((await fetch(theirUrl)).status, 200, 'QR-02: another member\'s photo avatar_url pointed at is still there');
  ok((await fetch(ownUrl)).status >= 400, 'QR-02: the member\'s own avatars/<id>-... photo is deleted (as before)');
  await svc.storage.from('member-media').remove([`events/${RUN}-probe.jpg`, theirUrl.split('/object/public/member-media/')[1]]);
}

// ==================================================================== QR-02, QR-03 the photo move
{
  const PREFIX = `${TAG}t-${RUN}mv`;
  const move = (flags = [], env = {}) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [`${ROOT}/release/move-member-photos.mjs`, '--only-email-prefix', PREFIX, ...flags], { encoding: 'utf8', cwd: ROOT, env: { ...process.env, ...env } }) };
    } catch (err) {
      return { code: err.status, out: `${err.stdout}${err.stderr}` };
    }
  };
  const line = (out, m) => out.split('\n').find((l) => l.includes(m.id)) ?? '';
  const withAvatar = async (name, bytes, objectPathFor) => {
    const m = await makeMember(`${RUN}mv${name}`);
    const objectPath = objectPathFor(m);
    const { error } = await svc.storage.from('member-media').upload(objectPath, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    await svc.from('members').update({ avatar_url: svc.storage.from('member-media').getPublicUrl(objectPath).data.publicUrl, photo_id: null }).eq('id', m.id);
    return { ...m, objectPath };
  };
  // Portrait 600 x 900 stored sideways: red left half, blue right half, EXIF orientation 6 (shown turned 90 degrees
  // clockwise: red on top). And the same upright (orientation 1).
  const portrait = (orientation) =>
    sharp({ create: { width: 600, height: 900, channels: 3, background: '#ff0000' } })
      .composite([{ input: { create: { width: 300, height: 900, channels: 3, background: '#0000ff' } }, left: 300, top: 0 }])
      .jpeg()
      .withMetadata({ orientation })
      .toBuffer();
  const owner = await makeMember(`${RUN}mvowner`);
  const turned = await withAvatar('turned', await portrait(6), (m) => `avatars/${m.id}-${Date.now()}.jpg`);
  const upright = await withAvatar('upright', await portrait(1), (m) => `avatars/${m.id}-${Date.now()}.jpg`);
  const borrowed = await withAvatar('borrow', fs.readFileSync('/home/claude/stack/tools/fixtures/photo-800.jpg'), () => `avatars/${owner.id}-${Date.now()}.jpg`);
  const sneaky = await withAvatar('sneak', fs.readFileSync('/home/claude/stack/tools/fixtures/photo-800.jpg'), (m) => `avatars/x${m.id}-${Date.now()}.jpg`);
  const photos = (m) => sql1(`select count(*)::int n from member_photos where member_id = ${q(m.id)}`).n;

  const dryNo = move([], { MOVE_PHOTOS_NO_SHARP: 'on' });
  eq(dryNo.code, 0, 'QR-03: the move without sharp, dry run: exit 0');
  ok(line(dryNo.out, turned).includes('needs a look: stored turned (EXIF orientation 6)') && line(dryNo.out, turned).includes('they meet the photo gate'), 'QR-03: the sideways-stored photo is "needs a look" (orientation 6), not "would move"', line(dryNo.out, turned));
  ok(line(dryNo.out, upright).includes('would move'), 'QR-03: an upright one would move as before');
  ok(line(dryNo.out, borrowed).includes('needs a look: not their own photo file'), 'QR-02: a link to another member\'s file is "needs a look"', line(dryNo.out, borrowed));
  ok(line(dryNo.out, sneaky).includes('needs a look: not their own photo file'), 'QR-02: so is a file only named like theirs', line(dryNo.out, sneaky));
  const applyNo = move(['--apply'], { MOVE_PHOTOS_NO_SHARP: 'on' });
  eq(applyNo.code, 0, 'QR-03: the move without sharp, --apply: exit 0');
  eq([photos(turned), sql1(`select photo_id from members where id = ${q(turned.id)}`).photo_id], [0, null], 'QR-03: the sideways photo was left unmoved: no photo record, they meet the gate');
  eq(sql1(`select status from member_photos p join members m on m.photo_id = p.id where m.id = ${q(upright.id)}`)?.status, 'approved', 'QR-03: the upright photo moved');
  eq([photos(borrowed), photos(sneaky)], [0, 0], 'QR-02: neither file that is not theirs was copied as their photo');
  // With sharp (as on Vercel): turned the right way up.
  const withSharp = move(['--apply']);
  ok(line(withSharp.out, turned).includes('moved') && line(withSharp.out, turned).includes('(480 and 160)'), 'QR-03: with sharp the sideways photo moves', line(withSharp.out, turned));
  const p = sql1(`select p.path from member_photos p join members m on m.photo_id = p.id where m.id = ${q(turned.id)}`);
  const { data: px, info } = await sharp(fs.readFileSync(`${STORE}/member-photos/${p.path}`)).raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => { const i = (y * info.width + x) * info.channels; return [px[i], px[i + 1], px[i + 2]]; };
  const top = at(Math.floor(info.width / 2), 8);
  const bottom = at(Math.floor(info.width / 2), info.height - 8);
  ok(top[0] > 200 && top[2] < 60 && bottom[2] > 200 && bottom[0] < 60, `QR-03: and is stored the right way up (red on top ${top}, blue below ${bottom})`);
  ok(line(withSharp.out, borrowed).includes('needs a look: not their own photo file') && photos(borrowed) === 0, 'QR-02: with sharp too, another member\'s file is never moved');
  for (const m of [turned, upright, borrowed, sneaky]) await svc.storage.from('member-media').remove([m.objectPath]);
}

for (const [host, pid] of cleanup) await action('plan.cancelOpenInvite', [pid], host.session).catch(() => {});
done();
