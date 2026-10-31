// Member photos (brief 2.4): the gate (required after login; the API enforces it too), upload to the private
// bucket through the real action (the type from the bytes, under 10 MB, big enough; sharp makes 480px and 160px
// squares with no metadata), signed URLs everywhere (the shell, You, Open Invite), Change photo keeps the history,
// the admin Photos queue (reported first, New and Changed, the face check, Before and Now), Keep and Remove with
// a reason (the photo comes off, the gate, the photo-removed email), and Delete my account removing every photo.
import fs from 'node:fs';
import { action, adminSession, done, emailsTo, eq, exec, fakeState, fakesMark, logRows, makeMember, makeMemberWithPhoto, memberSession, ok, page, q, redirectedTo, sql, sql1, waitFor } from './lib.mjs';

const FIX = '/home/claude/stack/tools/fixtures';
const STORE = '/home/claude/stack/storage/member-photos';
const file = (name, type = 'image/jpeg') => ({ name, type, base64: fs.readFileSync(`${FIX}/${name}`).toString('base64') });
const upload = (session, name, face, type) => action('photo.uploadMyPhoto', [{ $formData: face ? { face } : {}, $files: { photo: file(name, type) } }], session).then((r) => r.result);
// Width and height of a stored JPEG, from its start-of-frame (no image library).
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}

// ---------------------------------------------------------------- the gate
const fresh = await makeMember('phg');
const s = await memberSession(fresh.email);
eq(await redirectedTo('/members/open-invite', s), '/members/photo', 'no photo: every members page sends them to the photo gate');
eq(await redirectedTo('/members/events', s), '/members/photo', 'Events too');
eq((await action('invite.getOpenInviteFeed', [], s)).redirect, '/members/photo', 'and the API: an Open Invite action is refused the same way');
eq((await action('thread.sendMessage', [{ chatId: 'x', text: 'hi', clientId: 'g1' }], s)).redirect, '/members/photo', 'a Messages action too');
eq((await page('/members/photo', s)).status, 200, 'the gate itself opens');
const gate0 = (await action('photo.getMyPhotoGate', [], s)).result;
eq([gate0.hasPhoto, gate0.removed, gate0.existing], [false, null, true], 'what the gate shows: no photo, nothing removed, an existing member (joined before the gate date)');

// ---------------------------------------------------------------- uploading: the rules
eq((await upload(s, 'not-a-photo.jpg')).reason, 'type', 'a file that is not a photo (whatever its name says): refused as "type"');
// Over 10 MB never reaches the photo code over HTTP: Next caps a request body (10 MB here, through the test hook;
// 1 MB for a real server action by default), so the server's own "large" rule is the second line of defence.
const big = await upload(s, 'photo-11mb.jpg');
eq(big.success, false, 'over 10 MB: refused (the request itself is capped)');
eq((await upload(s, 'photo-120.jpg')).reason, 'small', 'under 160px: refused as "small"');
eq(sql1(`select count(*)::int n from member_photos where member_id = ${q(fresh.id)}`).n, 0, 'none of them was recorded');
const up = await upload(s, 'photo-800.jpg', 'none');
ok(up.success && up.photoId && up.url?.includes('/object/sign/member-photos/'), 'a good photo saves, and the answer carries a signed URL', up);
const row = sql1(`select * from member_photos where id = ${q(up.photoId)}`);
eq([row.status, row.source, row.face_check, row.resized, row.member_id], ['pending', 'new', 'none', true, fresh.id], 'recorded as pending (the admin queue), new, "no face found", resized');
eq(sql1(`select photo_id from members where id = ${q(fresh.id)}`).photo_id, up.photoId, 'it is the current photo at once');
const full = fs.readFileSync(`${STORE}/${row.path}`);
const thumb = fs.readFileSync(`${STORE}/${row.thumb_path}`);
eq([jpegSize(full), jpegSize(thumb)], [[480, 480], [160, 160]], 'the server made a 480px and a 160px square (sharp, Next\'s own optional dependency)');
const viaUrl = await fetch(up.url);
eq([viaUrl.status, viaUrl.headers.get('content-type')], [200, 'image/jpeg'], 'the signed URL serves it');
eq(await redirectedTo('/members/open-invite', s), null, 'with a photo the gate lets them through');
const you = await page('/members/you', s);
ok(you.status === 200 && you.text.includes('/object/sign/member-photos/'), 'You (and the shell) show it through signed URLs');
ok(!you.text.includes('/object/public/member-photos/'), 'never a public link');

// ---------------------------------------------------------------- metadata, PNG, Change photo
const exif = await upload(s, 'photo-exif.jpg');
ok(exif.success, 'a photo with Exif data saves');
const exifRow = sql1(`select path, source, previous_photo_id from member_photos where id = ${q(exif.photoId)}`);
ok(!fs.readFileSync(`${STORE}/${exifRow.path}`).includes('LOCATION-MARKER-CAMERA'), 'its Exif (camera and location data) is gone from the stored file');
eq([exifRow.source, exifRow.previous_photo_id], ['changed', up.photoId], 'a second photo is "changed", with the one it replaced (Before and Now)');
eq(sql1(`select status from member_photos where id = ${q(up.photoId)}`).status, 'replaced', 'the old one is marked replaced (kept in the history)');
const png = await upload(s, 'photo-600.png', 'found', 'image/png');
ok(png.success && sql1(`select content_type from member_photos where id = ${q(png.photoId)}`).content_type === 'image/jpeg', 'a PNG saves too (stored as a JPEG square)');
const before = fs.existsSync('/home/claude/stack/storage/member-media/avatars') ? fs.readdirSync('/home/claude/stack/storage/member-media/avatars').filter((f) => f.startsWith(fresh.id)).length : 0;
const viaProfile = await action('profile.updateAvatar', [{ $formData: {}, $files: { photo: file('photo-480.jpg') } }], s);
ok(viaProfile.result.success && viaProfile.result.url.includes('/object/sign/member-photos/'), 'Edit details (updateAvatar) saves into the private bucket too');
const after = fs.existsSync('/home/claude/stack/storage/member-media/avatars') ? fs.readdirSync('/home/claude/stack/storage/member-media/avatars').filter((f) => f.startsWith(fresh.id)).length : 0;
eq(after, before, 'and nothing new is written to the public member-media/avatars/');
const current = sql1(`select photo_id from members where id = ${q(fresh.id)}`).photo_id;

// ---------------------------------------------------------------- the admin Photos queue
const admin = await adminSession('bf.');
const reporter = await makeMemberWithPhoto('phr');
exec(`insert into reports (reporter_id, kind, reason, member_id, photo_id) values (${q(reporter.id)}, 'photo', 'not_them', ${q(fresh.id)}, ${q(current)})`);
const queue = (await action('admin.photos.adminGetPhotos', ['check'], admin)).result;
const item = queue.items.find((i) => i.photoId === current);
ok(item, 'the queue has the photo', queue.items.slice(0, 3));
eq([item.pill, item.report?.reason, item.report?.by, item.faceCheck], ['reported', 'not_them', 'Phr', 'skipped'], 'reported: the pill, the reason, who reported it, the face check (skipped: Edit details sends none)');
ok(item.photoUrl?.includes('/object/sign/') && item.previousPhotoUrl?.includes('/object/sign/'), 'the photo and its Before, both signed', item);
ok(queue.items.indexOf(item) < queue.items.findIndex((i) => i.pill !== 'reported'), 'reported photos come first');
ok(queue.stats.toCheck >= 1 && queue.stats.reported >= 1, 'the numbers', queue.stats);
const member2 = await makeMember('phk');
const s2 = await memberSession(member2.email);
const keepMe = await upload(s2, 'photo-480.jpg', 'found');
ok((await action('admin.photos.adminGetPhotos', ['check'], admin)).result.items.some((i) => i.photoId === keepMe.photoId && i.pill === 'new'), 'a new photo is in the queue as "New"');
eq((await action('admin.photos.adminKeepPhoto', [keepMe.photoId], admin)).result, { ok: true }, 'Keep photo');
eq(sql1(`select status, reviewed_by is not null r from member_photos where id = ${q(keepMe.photoId)}`), { status: 'approved', r: true }, 'approved, by the admin');
ok(!(await action('admin.photos.adminGetPhotos', ['check'], admin)).result.items.some((i) => i.photoId === keepMe.photoId), 'it leaves To check');
ok((await action('admin.photos.adminGetPhotos', ['done'], admin)).result.items.some((i) => i.photoId === keepMe.photoId), 'and is in Done');
ok(sql(`select 1 from admin_audit where action = 'photo.keep' and target_id = ${q(keepMe.photoId)}`).length === 1, 'an audit row');
eq((await action('admin.photos.adminKeepPhoto', [keepMe.photoId], s2)).redirect, '/', 'a member cannot call it (stage 1 requireAdmin sends them away)');

const mark = fakesMark();
eq((await action('admin.photos.adminRemovePhoto', [current, 'made_up'], admin)).result.error, 'Pick a reason the member will see.', 'Remove needs one of the three reasons');
eq((await action('admin.photos.adminRemovePhoto', [current, 'not_clear'], admin)).result, { ok: true }, 'Remove and ask for a new one ("not a clear photo of you")');
eq(sql1(`select status, removal_reason from member_photos where id = ${q(current)}`), { status: 'removed', removal_reason: 'not_clear' }, 'removed, with the reason');
eq(sql1(`select photo_id from members where id = ${q(fresh.id)}`).photo_id, null, 'it comes off at once');
eq(sql1(`select status from reports where photo_id = ${q(current)}`).status, 'photo_removed', 'the open report about it is closed as photo_removed');
eq(await redirectedTo('/members/open-invite', s), '/members/photo', 'the member meets the gate at their next screen');
const gate1 = (await action('photo.getMyPhotoGate', [], s)).result;
eq([gate1.hasPhoto, gate1.removed?.reason], [false, 'not_clear'], 'the gate shows "We removed your last photo." with the reason');
await waitFor(() => logRows(`photo_id = ${q(current)} and template = 'photo-removed' and status = 'sent'`).length === 1, 'the photo-removed email');
ok(emailsTo(mark, fresh.email).some((e) => e.subject === 'We removed your photo'), 'with the designed subject', emailsTo(mark, fresh.email).map((e) => e.subject));
// The fake keeps each email whole in its state (the log line has the subject only).
const stored = (await fakeState()).emails.filter((e) => (Array.isArray(e.to) ? e.to : [e.to]).includes(fresh.email) && e.subject === 'We removed your photo').at(-1);
ok(/it wasn’t a clear photo of you/.test(stored?.text ?? '') && /it wasn’t a clear photo of you/.test(stored?.html ?? ''), 'and the reason in the member\'s words, in both parts');
eq((await action('admin.photos.adminRemovePhoto', [current, 'not_clear'], admin)).result.error, 'That photo was removed already.', 'removing again: nothing changes');
const back = await upload(s, 'photo-480.jpg', 'found');
ok(back.success, 'they add a new photo');
eq(await redirectedTo('/members/open-invite', s), null, 'and are through the gate again');

// ---------------------------------------------------------------- Delete my account removes every photo
const leaver = await makeMemberWithPhoto('phd');
const leaverPhotos = sql(`select path from member_photos where member_id = ${q(leaver.id)}`).map((r) => r.path);
ok(leaverPhotos.length === 1 && fs.existsSync(`${STORE}/${leaverPhotos[0]}`), 'a member with a photo');
const del = await action('you.deleteMyAccount', ['delete'], leaver.session);
ok(del.redirect || del.result === null || del.result?.ok !== false, 'Delete my account', del);
eq(sql1(`select count(*)::int n from member_photos where member_id = ${q(leaver.id)}`).n, 0, 'every photo record is gone');
ok(!fs.existsSync(`${STORE}/${leaverPhotos[0]}`), 'and the file in the private bucket');
eq(sql1(`select photo_id from members where id = ${q(leaver.id)}`).photo_id, null, 'no current photo');
done();

