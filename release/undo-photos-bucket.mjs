// UNDO, storage half (stage 2): empty the private member-photos bucket and delete it, through the Storage API.
// Run it BEFORE release/undo-phase-b.sql: hosted Supabase refuses DELETE on the storage tables from SQL (since March
// 2026: "Direct deletion from storage tables is not allowed. Use the Storage API instead."), so the SQL undo no
// longer touches storage rows (it only drops the restrictive policy where it may).
//
// It deletes every member photo the stage 2 code stored (the old public copies in member-media/avatars/ are not
// touched: the stage 1 code shows those again, unless release/delete-public-avatars.mjs has been run). Export the
// photos first if they may be wanted.
//
// Run by Claude Code from the repo root with the live keys in the environment (NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SECRET_KEY):
//
//   node release/undo-photos-bucket.mjs           # dry run: how many files, nothing changed
//   node release/undo-photos-bucket.mjs --apply   # removes every file, then the bucket
//
// Exit 0: done (or there was no bucket); 1: something failed (run it again: it carries on); 2: set-up missing.
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'member-photos';
const APPLY = process.argv.slice(2).includes('--apply');
for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY']) {
  if (!process.env[name]) {
    console.error(`${name} is not set`);
    process.exit(2);
  }
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, ''), process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

/** Every file in the bucket (folders walked: member photos sit in <member id>/), 1,000 at a time. */
async function listFiles(folder = '') {
  const out = [];
  const seen = new Set();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(BUCKET).list(folder, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    const page = (data ?? []).filter((item) => !seen.has(item.name));
    for (const item of page) {
      seen.add(item.name);
      const path = folder ? `${folder}/${item.name}` : item.name;
      if (!item.id) out.push(...(await listFiles(path)));
      else out.push(path);
    }
    if ((data ?? []).length < 1000 || !page.length) return out;
  }
}

const { data: bucket, error: bucketError } = await db.storage.getBucket(BUCKET);
if (bucketError || !bucket) {
  console.log(`There is no ${BUCKET} bucket: nothing to undo here. Next: release/undo-phase-b.sql.`);
  process.exit(0);
}
if (bucket.public) {
  console.error(`${BUCKET} is public, which stage 2 never made it. Stop and look before deleting anything.`);
  process.exit(1);
}
const files = await listFiles();
if (!APPLY) {
  console.log(`DRY RUN (nothing changed): ${BUCKET} has ${files.length} files. With --apply they are removed and the bucket deleted.`);
  process.exit(0);
}

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
const left = await listFiles();
if (left.length) {
  // Whatever the listing missed or a remove refused: the API's own emptying, once.
  const { error } = await db.storage.emptyBucket(BUCKET);
  if (error) console.log(`  emptying the bucket failed: ${error.message}`);
}
const { error: deleteError } = await db.storage.deleteBucket(BUCKET);
if (deleteError) {
  console.log(`APPLIED, NOT FINISHED: removed ${removed} of ${files.length} files; the bucket was not deleted: ${deleteError.message}. Run this again.`);
  process.exit(1);
}
console.log(`APPLIED: removed ${removed} files and deleted the ${BUCKET} bucket.${failed ? ` (${failed} removes failed first; the bucket's emptying took them.)` : ''} Next: release/undo-phase-b.sql.`);
process.exit(0);
