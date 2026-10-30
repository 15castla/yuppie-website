// Release step (stage 2): move every member's photo from the public bucket (member-media/avatars/, readable by
// anyone with the link) into the private bucket member-photos, where members see it only through short-lived
// signed URLs. For each member whose avatar_url is a member-media/avatars/ file and who has no current photo:
//   * downloads the file and checks it is a photo (from its bytes);
//   * makes the same 480px and 160px squares the app makes (sharp, which comes with Next; if it is missing the
//     file is copied as it is, when it is a JPEG, PNG or WebP: the private bucket takes only those);
//   * uploads them to member-photos/<member id>/migrated-<photo id>-full.jpg (and -thumb.jpg);
//   * records the photo as approved (it was already public and members have seen it: photo decision 4 A puts
//     only members with no photo through the gate), source "migrated", with the old URL in legacy_url;
//   * makes it the member's current photo (members.photo_id).
// It deletes nothing: the public copies and members.avatar_url stay as they are (a rollback to stage 1 still
// shows them). Deleting the public copies is a later, separate step for Albert, once stage 2 is settled.
// It reports every member: moved (or would move), already has a photo, linked (moved before, now made current),
// and anything that needs a look (the file is missing, not a photo, a GIF with no converter, a link outside
// member-media). Safe to run again: a second run finds nothing to move.
//
// Run by Claude Code from the repo root with the live keys in the environment (NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SECRET_KEY), after the stage 2 migration and before the photo gate is switched on:
//
//   node release/move-member-photos.mjs            # dry run: reads and checks everything, changes nothing
//   node release/move-member-photos.mjs --apply    # copies, records and links
//
// Options (for testing): --only-email-prefix <p> (members whose email starts with it).
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

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
const FROM = 'member-media';
const TO = 'member-photos';
const PUBLIC_PREFIX = `/storage/v1/object/public/${FROM}/`;
const SIZES = { full: 480, thumb: 160 };

// ---------------------------------------------------------------- the photo (as lib/server/photos/image.ts)
function detectType(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 6 && b.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  return null;
}
let sharp = null;
try {
  sharp = (await import('sharp')).default;
} catch {
  sharp = null;
}

async function squares(bytes) {
  const make = (px) => sharp(bytes).rotate().resize(px, px, { fit: 'cover', withoutEnlargement: true }).flatten({ background: '#F5F3E7' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  const meta = await sharp(bytes).metadata();
  const side = Math.min(meta.width ?? SIZES.full, meta.height ?? SIZES.full);
  return { full: await make(SIZES.full), thumb: await make(SIZES.thumb), side: Math.min(side, SIZES.full) };
}

/** The object path in member-media for a public URL of it, or null. Works whatever the project host is. */
function objectPathOf(url) {
  try {
    const u = new URL(url);
    const at = u.pathname.indexOf(PUBLIC_PREFIX);
    if (at < 0) return null;
    return decodeURIComponent(u.pathname.slice(at + PUBLIC_PREFIX.length));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- the members
async function members() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from('members').select('id, email, avatar_url, photo_id, deleted_at').not('avatar_url', 'is', null).order('created_at', { ascending: true }).range(from, from + 999);
    if (ONLY_PREFIX) q = q.ilike('email', `${ONLY_PREFIX}%`);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

const report = [];
const note = (member, outcome, detail = '') => report.push({ id: member.id, outcome, detail });

async function moveOne(member) {
  if (member.deleted_at) return note(member, 'skipped: deleted account');
  const path = objectPathOf(member.avatar_url);
  if (!path) return note(member, 'needs a look: the photo link is not in member-media', member.avatar_url);
  if (!path.startsWith('avatars/')) return note(member, 'needs a look: not in member-media/avatars/', path);
  // Moved before (a run that stopped part way, or a second run): only link it if it is not current yet.
  const { data: before } = await db.from('member_photos').select('id').eq('member_id', member.id).eq('legacy_url', member.avatar_url).limit(1);
  if (member.photo_id) return note(member, before?.length ? 'already moved' : 'skipped: has a photo already (stage 2)');
  if (before?.length) {
    if (APPLY) {
      const { error } = await db.from('members').update({ photo_id: before[0].id }).eq('id', member.id).is('photo_id', null);
      if (error) return note(member, 'failed: linking', error.message);
    }
    return note(member, APPLY ? 'linked (moved before)' : 'would link (moved before)');
  }

  const { data: blob, error: downloadError } = await db.storage.from(FROM).download(path);
  if (downloadError || !blob) return note(member, 'needs a look: the file is missing', path);
  const bytes = Buffer.from(await blob.arrayBuffer());
  const type = detectType(bytes);
  if (!type) return note(member, 'needs a look: the file is not a photo', path);
  if (!sharp && type === 'image/gif') return note(member, 'needs a look: a GIF, and no converter here (sharp is missing)', path);
  if (!APPLY) return note(member, 'would move', `${path} (${type}, ${bytes.length} bytes${sharp ? ', resized' : ', as it is'})`);

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
      full = { bytes, type };
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
  const now = new Date().toISOString();
  const { error: insertError } = await db.from('member_photos').insert({
    id: photoId, member_id: member.id, path: fullPath, thumb_path: thumbPath, width: side, height: side, content_type: full.type,
    bytes: full.bytes.length, resized, source: 'migrated', face_check: 'skipped', status: 'approved', legacy_url: member.avatar_url, reviewed_at: now,
  });
  if (insertError) {
    await db.storage.from(TO).remove([fullPath, thumbPath].filter(Boolean));
    return note(member, 'failed: recording', insertError.message);
  }
  const { error: linkError } = await db.from('members').update({ photo_id: photoId }).eq('id', member.id).is('photo_id', null);
  if (linkError) return note(member, 'failed: linking', linkError.message);
  return note(member, 'moved', `${path} -> ${TO}/${fullPath}${resized ? ' (480 and 160)' : ''}`);
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
const list = await members();
for (const member of list) {
  try {
    await moveOne(member);
  } catch (err) {
    note(member, 'failed', err?.message ?? String(err));
  }
}
console.log(`${APPLY ? 'APPLIED' : 'DRY RUN (nothing changed)'}: ${list.length} members with a photo link${ONLY_PREFIX ? ` (email starting ${ONLY_PREFIX})` : ''}. sharp: ${sharp ? 'yes, photos are resized to 480 and 160' : 'no, photos are copied as they are'}.`);
for (const r of report) console.log(`  ${r.id}  ${r.outcome}${r.detail ? `  ${r.detail}` : ''}`);
const totals = report.reduce((t, r) => ({ ...t, [r.outcome.split(':')[0]]: (t[r.outcome.split(':')[0]] ?? 0) + 1 }), {});
console.log(`Totals: ${Object.entries(totals).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
console.log('Nothing was deleted: the public copies in member-media/avatars/ and members.avatar_url are as they were.');
process.exit(report.some((r) => r.outcome.startsWith('failed')) ? 1 : 0);
