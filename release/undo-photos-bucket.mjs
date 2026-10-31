// UNDO, storage half (stage 2): export the private member-photos bucket to a folder on this computer, then empty it
// and delete it, through the Storage API. In the undo's order (release/live-migration-notes.md, stage 2, Undo):
// after the code is rolled back to stage 1, BEFORE release/undo-phase-b.sql. Hosted Supabase refuses DELETE on the
// storage tables from SQL (since March 2026: "Direct deletion from storage tables is not allowed. Use the Storage
// API instead."), so the SQL undo does not touch storage rows (it only drops the restrictive policy where it may).
//
// Once release/delete-public-avatars.mjs has run (release step 5), the files in this bucket are the ONLY copies of
// members' photos. So nothing is deleted until every file has been downloaded into the export folder, written,
// and read back the same (sha256), together with manifest.json: each file's path, size and sha256, and the photo
// records (member_photos: whose photo, its status, when) while that table still exists. An export that is not
// complete deletes nothing. The folder must be outside the repo: these are members' photos, never to be committed.
// Keep it somewhere private, and delete it when Albert says the photos are no longer needed.
//
// Run by Claude Code from the repo root with the live keys in the environment (NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SECRET_KEY):
//
//   node release/undo-photos-bucket.mjs                                       # dry run: how many files, nothing changed
//   node release/undo-photos-bucket.mjs --export-dir <folder>                 # export only (nothing deleted)
//   node release/undo-photos-bucket.mjs --apply --export-dir <same folder>    # export again, then remove every file and the bucket
//
// The old public copies in member-media/avatars/ are not touched here (stage 1 shows those again, unless release
// step 5 deleted them: then release/undo-phase-b.sql clears the links, so stage 1 shows initials).
// Exit 0: done (or there was no bucket); 1: something failed (run it again: it carries on); 2: set-up missing, or
// --apply without a complete export.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { listAll } from './lib/avatars.mjs';

const BUCKET = 'member-photos';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const exportAt = args.indexOf('--export-dir');
const EXPORT_DIR = exportAt >= 0 && args[exportAt + 1] ? path.resolve(args[exportAt + 1]) : null;
for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY']) {
  if (!process.env[name]) {
    console.error(`${name} is not set`);
    process.exit(2);
  }
}
if (exportAt >= 0 && !EXPORT_DIR) {
  console.error('--export-dir needs a folder.');
  process.exit(2);
}
if (EXPORT_DIR) {
  // Never inside the repo (it would sit next to the code, one `git add` from being committed).
  let repo = process.cwd();
  for (let dir = repo; dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      repo = dir;
      break;
    }
  }
  const rel = path.relative(repo, EXPORT_DIR);
  if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    console.error(`The export folder ${EXPORT_DIR} is inside the repo (${repo}). Pick a folder outside it: these are members' photos.`);
    process.exit(2);
  }
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, ''), process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

const { data: bucket, error: bucketError } = await db.storage.getBucket(BUCKET);
if (bucketError || !bucket) {
  console.log(`There is no ${BUCKET} bucket: nothing to undo here. Next: release/undo-phase-b.sql.`);
  process.exit(0);
}
if (bucket.public) {
  console.error(`${BUCKET} is public, which stage 2 never made it. Stop and look before deleting anything.`);
  process.exit(1);
}
const files = await listAll(db, BUCKET);

if (!APPLY && !EXPORT_DIR) {
  console.log(`DRY RUN (nothing changed): ${BUCKET} has ${files.length} files. Export them first with --export-dir <a folder outside the repo>; with --apply (and the same --export-dir) they are exported again, then removed and the bucket deleted.`);
  process.exit(0);
}
if (APPLY && files.length && !EXPORT_DIR) {
  console.error(`REFUSED: ${BUCKET} has ${files.length} files, and after release step 5 they are the only copies of members' photos. Run again with --export-dir <a folder outside the repo>. Nothing was deleted.`);
  process.exit(2);
}

// ---------------------------------------------------------------- the export (every file, read back the same)
async function exportAll() {
  fs.mkdirSync(path.join(EXPORT_DIR, BUCKET), { recursive: true });
  const manifestPath = path.join(EXPORT_DIR, 'manifest.json');
  let earlier = { files: [], photos: null };
  try {
    earlier = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    // no earlier export here
  }
  const done = new Map((earlier.files ?? []).map((f) => [f.path, f]));
  const failed = [];
  let bytesTotal = 0;
  for (const file of files) {
    try {
      const { data, error } = await db.storage.from(BUCKET).download(file);
      if (error || !data) throw error ?? new Error('no data');
      const bytes = Buffer.from(await data.arrayBuffer());
      const target = path.join(EXPORT_DIR, BUCKET, file);
      if (!target.startsWith(path.join(EXPORT_DIR, BUCKET) + path.sep)) throw new Error('a path outside the export folder');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
      const back = fs.readFileSync(target);
      if (back.length !== bytes.length || sha256(back) !== sha256(bytes)) throw new Error('the saved copy is not the same');
      done.set(file, { path: file, bytes: bytes.length, sha256: sha256(bytes), exportedAt: new Date().toISOString() });
      bytesTotal += bytes.length;
    } catch (err) {
      failed.push(`${file}: ${err?.message ?? err}`);
    }
  }
  // The photo records, while the table is there (gone after release/undo-phase-b.sql: the earlier ones are kept).
  let photos = earlier.photos ?? null;
  const { data: rows, error: rowsError } = await db
    .from('member_photos')
    .select('id, member_id, path, thumb_path, status, source, face_check, removal_reason, legacy_url, created_at, reviewed_at')
    .order('created_at', { ascending: true })
    .limit(100000);
  if (!rowsError) photos = rows;
  fs.writeFileSync(manifestPath, JSON.stringify({ bucket: BUCKET, exportedAt: new Date().toISOString(), files: [...done.values()], photos }, null, 2));
  return { failed, bytesTotal, photos: photos?.length ?? 0 };
}

if (EXPORT_DIR) {
  const exported = await exportAll();
  if (exported.failed.length) {
    console.log(`EXPORT NOT COMPLETE: ${exported.failed.length} of ${files.length} files could not be saved to ${EXPORT_DIR}. Nothing was deleted. Run it again.`);
    for (const line of exported.failed) console.log(`  ${line}`);
    process.exit(1);
  }
  console.log(`EXPORTED: ${files.length} files (${exported.bytesTotal} bytes) from ${BUCKET} to ${EXPORT_DIR}/${BUCKET}/, each read back the same, with manifest.json (${exported.photos} photo records).`);
  if (!APPLY) {
    console.log('Nothing was deleted. Next, when you are ready: the same command with --apply.');
    process.exit(0);
  }
}

// ---------------------------------------------------------------- removing the files and the bucket
let removed = 0;
let failed = 0;
for (let i = 0; i < files.length; i += 100) {
  const paths = files.slice(i, i + 100);
  const { data, error } = await db.storage.from(BUCKET).remove(paths);
  if (error) {
    failed += paths.length;
    console.log(`  failed to remove ${paths.length} files: ${error.message}`);
  } else {
    removed += (data ?? []).length;
    failed += paths.length - (data ?? []).length;
  }
}
const left = await listAll(db, BUCKET);
if (left.length) {
  // Whatever the listing missed or a remove refused: the API's own emptying, once. Only files the export saved:
  // anything new since (a photo uploaded in the meantime) stops the undo here.
  const exportedNow = new Set(files);
  const unseen = left.filter((f) => !exportedNow.has(f));
  if (unseen.length) {
    console.log(`APPLIED, NOT FINISHED: removed ${removed} files; ${unseen.length} new files appeared since the export (${unseen.slice(0, 5).join(', ')}). Run this again (it exports them first).`);
    process.exit(1);
  }
  const { error } = await db.storage.emptyBucket(BUCKET);
  if (error) console.log(`  emptying the bucket failed: ${error.message}`);
}
const { error: deleteError } = await db.storage.deleteBucket(BUCKET);
if (deleteError) {
  console.log(`APPLIED, NOT FINISHED: removed ${removed} of ${files.length} files; the bucket was not deleted: ${deleteError.message}. Run this again.`);
  process.exit(1);
}
console.log(`APPLIED: removed ${removed} files and deleted the ${BUCKET} bucket.${failed ? ` (${failed} removes failed first; the bucket's emptying took them.)` : ''} The export in ${EXPORT_DIR ?? '(none: the bucket was empty)'} is now the only copy. Next: release/undo-phase-b.sql.`);
process.exit(0);
