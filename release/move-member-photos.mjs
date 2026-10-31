// Release step (stage 2): move every member's photo from the public bucket (member-media/avatars/, readable by
// anyone with the link) into the private bucket member-photos, where members see it only through short-lived
// signed URLs. For each member whose avatar_url is their own member-media/avatars/ file (avatars/<member id>-...,
// as the stage 1 upload named it; a link to any other file in the bucket is reported, never moved: QR-02) and who
// has no current photo:
//   * downloads the file and checks it is a photo (from its bytes) and big enough (the shorter side at least
//     400px, the photo rule; a smaller one is left, and the member meets the photo gate);
//   * makes the same 480px and 160px squares the app makes (sharp, which comes with Next; if it is missing the
//     file is copied as it is, when it is a JPEG, PNG or WebP, with its metadata, location included, stripped;
//     a photo stored turned, with an EXIF orientation other than upright, cannot be turned without sharp and would
//     show sideways once its metadata is gone, so it is left where it is and reported "needs a look": the member
//     meets the photo gate, QR-03);
//   * uploads them to member-photos/<member id>/migrated-<photo id>-full.jpg (and -thumb.jpg);
//   * records the photo as approved (it was already public and members have seen it: photo decision 4 A puts
//     only members with no photo through the gate), source "migrated", with the old URL in legacy_url;
//   * makes it the member's current photo (members.photo_id).
// It never undoes the club's decision (stage 2 fixes, QB2-03 and QB3-11): a member whose latest photo the club
// removed is left alone (they meet the photo gate), and a moved photo the club removed is never linked again.
// It deletes nothing: the public copies and members.avatar_url stay as they are (a rollback to stage 1 still
// shows them). Deleting the public copies is the next step: release/delete-public-avatars.mjs.
// It reports every member: moved (or would move), linked (moved before, now made current), already moved, and
// anything skipped or that needs a look (the file is missing, not a photo, too small, a link outside member-media,
// removed by the club). "moved" and "linked" are said only when something changed. Safe to run again: a second
// run finds nothing to move.
//
// Run by Claude Code from the repo root with the live keys in the environment (NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SECRET_KEY), after the stage 2 migration and before the photo gate is switched on:
//
//   node release/move-member-photos.mjs            # dry run: reads and checks everything, changes nothing
//   node release/move-member-photos.mjs --apply    # copies, records and links
//
// Options (for testing): --only-email-prefix <p> (members whose email starts with it); MOVE_PHOTOS_NO_SHARP=on
// (the path for a platform without sharp).
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { classify, exifOrientation, membersWithAvatars, SIZES, stripMetadata, TO } from './lib/avatars.mjs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const prefixAt = args.indexOf('--only-email-prefix');
const ONLY_PREFIX = prefixAt >= 0 ? args[prefixAt + 1] : null;
for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY']) {
  if (!process.env[name]) {
    console.error(`${name} is not set`);
    process.exit(2);
  }
}
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, '');
const db = createClient(SUPA, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let sharp = null;
if (process.env.MOVE_PHOTOS_NO_SHARP !== 'on') {
  try {
    sharp = (await import('sharp')).default;
  } catch {
    sharp = null;
  }
}

async function squares(bytes) {
  const make = (px) => sharp(bytes).rotate().resize(px, px, { fit: 'cover', withoutEnlargement: true }).flatten({ background: '#F5F3E7' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  const meta = await sharp(bytes).metadata();
  const side = Math.min(meta.width ?? SIZES.full, meta.height ?? SIZES.full);
  return { full: await make(SIZES.full), thumb: await make(SIZES.thumb), side: Math.min(side, SIZES.full) };
}

const report = [];
const note = (member, outcome, detail = '') => report.push({ id: member.id, outcome, detail });

async function moveOne(member) {
  const plan = await classify(db, member);
  if (plan.action === 'none') return note(member, plan.outcome, plan.detail);

  if (plan.action === 'link') {
    if (!APPLY) return note(member, 'would link (moved before)');
    const { data, error } = await db.from('members').update({ photo_id: plan.photoId }).eq('id', member.id).is('photo_id', null).select('id');
    if (error) return note(member, 'failed: linking', error.message);
    return note(member, data?.length ? 'linked (moved before)' : 'skipped: has a photo already (stage 2)');
  }

  const { path, bytes, type, size } = plan;
  if (!sharp && type === 'image/gif') return note(member, 'needs a look: a GIF, and no converter here (sharp is missing)', path);
  // Without sharp the pixels stay as stored and the orientation goes with the metadata (QR-03): not moved.
  const orientation = sharp ? 1 : exifOrientation(bytes, type);
  if (orientation !== 1) {
    return note(member, `needs a look: stored turned (EXIF orientation ${orientation}) and sharp is missing, so it cannot be turned; not moved, they meet the photo gate`, path);
  }
  if (!APPLY) return note(member, 'would move', `${path} (${type}, ${size.width} x ${size.height}, ${bytes.length} bytes${sharp ? ', resized' : ', as it is, metadata stripped'})`);

  const photoId = randomUUID();
  let full;
  let thumb = null;
  let resized = false;
  let side = null;
  try {
    if (sharp) {
      const made = await squares(bytes);
      full = { bytes: made.full, type: 'image/jpeg' };
      thumb = { bytes: made.thumb, type: 'image/jpeg' };
      resized = true;
      side = made.side;
    } else {
      // No sharp: the file as it is, without its metadata (location data included). Not readable safely: not moved.
      const clean = stripMetadata(bytes, type);
      if (!clean) return note(member, 'needs a look: the photo could not be cleaned of its metadata', path);
      full = { bytes: clean, type };
    }
  } catch (err) {
    return note(member, 'needs a look: the photo could not be read', `${path}: ${err?.message ?? err}`);
  }
  const ext = full.type === 'image/png' ? 'png' : full.type === 'image/webp' ? 'webp' : 'jpg';
  const fullPath = `${member.id}/migrated-${photoId}-full.${ext}`;
  const thumbPath = thumb ? `${member.id}/migrated-${photoId}-thumb.jpg` : null;
  const up = await db.storage.from(TO).upload(fullPath, full.bytes, { contentType: full.type, upsert: false });
  if (up.error) return note(member, 'failed: upload', up.error.message);
  if (thumb) {
    const upThumb = await db.storage.from(TO).upload(thumbPath, thumb.bytes, { contentType: thumb.type, upsert: false });
    if (upThumb.error) {
      await db.storage.from(TO).remove([fullPath]);
      return note(member, 'failed: upload', upThumb.error.message);
    }
  }
  const undoFiles = () => db.storage.from(TO).remove([fullPath, thumbPath].filter(Boolean));
  const now = new Date().toISOString();
  const { error: insertError } = await db.from('member_photos').insert({
    id: photoId, member_id: member.id, path: fullPath, thumb_path: thumbPath, width: side ?? Math.min(size.width, size.height), height: side ?? Math.min(size.width, size.height),
    content_type: full.type, bytes: full.bytes.length, resized, source: 'migrated', face_check: 'skipped', status: 'approved', legacy_url: member.avatar_url, reviewed_at: now,
  });
  if (insertError) {
    await undoFiles();
    return note(member, 'failed: recording', insertError.message);
  }
  const { data: linked, error: linkError } = await db.from('members').update({ photo_id: photoId }).eq('id', member.id).is('photo_id', null).select('id');
  if (linkError) return note(member, 'failed: linking', linkError.message);
  if (!linked?.length) {
    // The member added a photo of their own meanwhile: theirs stays, and this copy goes again (nothing changed).
    await db.from('member_photos').delete().eq('id', photoId);
    await undoFiles();
    return note(member, 'skipped: has a photo already (stage 2)');
  }
  return note(member, 'moved', `${path} -> ${TO}/${fullPath}${resized ? ' (480 and 160)' : ' (as it is, metadata stripped)'}`);
}

// ---------------------------------------------------------------- run
const { data: bucket, error: bucketError } = await db.storage.getBucket(TO);
if (bucketError || !bucket) {
  console.error(`The private bucket ${TO} does not exist: apply the stage 2 migration first.`);
  process.exit(2);
}
if (bucket.public) {
  console.error(`${TO} is public. It must be private: stop and check the stage 2 migration.`);
  process.exit(2);
}
const list = await membersWithAvatars(db, ONLY_PREFIX);
for (const member of list) {
  try {
    await moveOne(member);
  } catch (err) {
    note(member, 'failed', err?.message ?? String(err));
  }
}
console.log(`${APPLY ? 'APPLIED' : 'DRY RUN (nothing changed)'}: ${list.length} members with a photo link${ONLY_PREFIX ? ` (email starting ${ONLY_PREFIX})` : ''}. sharp: ${sharp ? 'yes, photos are resized to 480 and 160' : 'no, photos are copied as they are, metadata stripped'}.`);
for (const r of report) console.log(`  ${r.id}  ${r.outcome}${r.detail ? `  ${r.detail}` : ''}`);
const totals = report.reduce((t, r) => ({ ...t, [r.outcome.split(':')[0].split(' (')[0]]: (t[r.outcome.split(':')[0].split(' (')[0]] ?? 0) + 1 }), {});
console.log(`Totals: ${Object.entries(totals).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
console.log('Nothing was deleted: the public copies in member-media/avatars/ and members.avatar_url are as they were (next: release/delete-public-avatars.mjs).');
process.exit(report.some((r) => r.outcome.startsWith('failed')) ? 1 : 0);
