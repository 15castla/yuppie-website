// Release step (stage 2), after release/move-member-photos.mjs --apply: delete the old public copies of member
// photos in member-media/avatars/ (readable by anyone with the link), through the Storage API (hosted Supabase
// refuses SQL deletes on storage tables). Until this has run, a member's old photo is still public, so no page
// may say "It's never public": once it has run and reports nothing left, set MEMBERS_PHOTOS_PRIVATE_DONE=on.
//
// It refuses (deletes nothing) while any member still has a photo the move would bring across (run the move
// first): every member's photo must be in the private bucket, or they have none to move (no photo link, a link
// elsewhere, a missing, unreadable or too-small file, a photo the club removed, a deleted account). And it never
// deletes a file that is still some member's current photo (one the move would bring across), checked again
// just before each delete. Everything else under avatars/ goes, files nobody points at included.
// members.avatar_url is left as it is (a rollback to stage 1 then shows initials instead of these photos).
//
// Run by Claude Code from the repo root with the live keys in the environment (NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SECRET_KEY):
//
//   node release/delete-public-avatars.mjs           # dry run: what it would delete, and anything in the way
//   node release/delete-public-avatars.mjs --apply   # deletes
//
// Options (for testing): --only-email-prefix <p> (the members it checks), --only-file-prefix <p> (only the files
// avatars/<p>...). Exit 0: done (or nothing to do); 1: refused or a delete failed; 2: set-up missing.
import { createClient } from '@supabase/supabase-js';
import { classify, FROM, membersWithAvatars, objectPathOf } from './lib/avatars.mjs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const opt = (name) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : null);
const ONLY_PREFIX = opt('--only-email-prefix');
const ONLY_FILES = opt('--only-file-prefix');
for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY']) {
  if (!process.env[name]) {
    console.error(`${name} is not set`);
    process.exit(2);
  }
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, ''), process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

/** Every file under a folder of member-media, through the Storage API, folders walked (1,000 at a time). */
async function listFiles(folder) {
  const out = [];
  const seen = new Set();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(FROM).list(folder, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    const page = (data ?? []).filter((item) => !seen.has(item.name));
    for (const item of page) {
      seen.add(item.name);
      const path = `${folder}/${item.name}`;
      // A folder has no id (the Storage API's listing): walk it.
      if (!item.id) out.push(...(await listFiles(path)));
      else out.push(path);
    }
    if ((data ?? []).length < 1000 || !page.length) return out;
  }
}

/** Members whose old public photo the move would still bring across (or link): their file is their photo. */
async function stillToMove() {
  const members = await membersWithAvatars(db, ONLY_PREFIX);
  const out = [];
  for (const member of members) {
    const plan = await classify(db, member);
    if (plan.action !== 'none') out.push({ member, path: objectPathOf(member.avatar_url), action: plan.action });
  }
  return out;
}

const blockers = await stillToMove();
let files = await listFiles('avatars');
if (ONLY_FILES) files = files.filter((p) => p.startsWith(`avatars/${ONLY_FILES}`));
const kept = new Set(blockers.map((b) => b.path).filter(Boolean));

console.log(`${APPLY ? 'APPLY' : 'DRY RUN (nothing changed)'}: ${files.length} files in ${FROM}/avatars/${ONLY_FILES ? ` (starting ${ONLY_FILES})` : ''}${ONLY_PREFIX ? `, members with email starting ${ONLY_PREFIX}` : ''}.`);
if (blockers.length) {
  console.log(`REFUSED: ${blockers.length} member${blockers.length === 1 ? ' still has a photo' : 's still have photos'} to move into the private bucket. Run node release/move-member-photos.mjs --apply first. Nothing was deleted.`);
  for (const b of blockers) console.log(`  ${b.member.id}  ${b.action === 'link' ? 'moved, not linked yet' : 'not moved yet'}  ${b.path ?? ''}`);
  process.exit(1);
}

let deleted = 0;
let failed = 0;
const refused = [];
const batch = [];
async function flush() {
  if (!batch.length) return;
  const paths = batch.splice(0, batch.length);
  const { data, error } = await db.storage.from(FROM).remove(paths);
  if (error) {
    failed += paths.length;
    console.log(`  failed: ${paths.length} files: ${error.message}`);
    return;
  }
  deleted += (data ?? []).length;
  failed += paths.length - (data ?? []).length;
}
for (const path of files) {
  if (kept.has(path)) {
    refused.push(path);
    continue;
  }
  if (!APPLY) {
    console.log(`  would delete  ${path}`);
    continue;
  }
  batch.push(path);
  if (batch.length >= 100) {
    // Checked again just before the delete: a member whose current photo this is (since the dry run) keeps it.
    const again = new Set((await stillToMove()).map((b) => b.path));
    for (let i = batch.length - 1; i >= 0; i -= 1) if (again.has(batch[i])) refused.push(...batch.splice(i, 1));
    await flush();
  }
}
if (APPLY && batch.length) {
  const again = new Set((await stillToMove()).map((b) => b.path));
  for (let i = batch.length - 1; i >= 0; i -= 1) if (again.has(batch[i])) refused.push(...batch.splice(i, 1));
  await flush();
}
for (const path of refused) console.log(`  kept (a member's current photo)  ${path}`);
if (APPLY) {
  const left = (await listFiles('avatars')).filter((p) => !ONLY_FILES || p.startsWith(`avatars/${ONLY_FILES}`));
  console.log(`Deleted ${deleted}, failed ${failed}, kept ${refused.length}. Left in ${FROM}/avatars/: ${left.length}.`);
  if (!left.length && !failed) console.log('Every old public copy is gone. Now set MEMBERS_PHOTOS_PRIVATE_DONE=on (server only) and redeploy, so the pages may say a photo is never public.');
  process.exit(failed || refused.length ? 1 : 0);
}
console.log(`Would delete ${files.length - refused.length}, keep ${refused.length}.`);
process.exit(0);
