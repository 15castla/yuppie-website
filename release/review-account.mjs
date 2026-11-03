// The App Review account (3 Nov 2026): one active member for Apple's reviewers, who sign in with a fixed code
// instead of an emailed one (lib/server/review-login.ts: REVIEW_LOGIN_EMAIL and REVIEW_LOGIN_CODE in Vercel).
//
//   REVIEW_LOGIN_EMAIL=... node release/review-account.mjs                    # dry run
//   REVIEW_LOGIN_EMAIL=... node release/review-account.mjs --apply            # adds it (or puts it back as below)
//   REVIEW_LOGIN_EMAIL=... node release/review-account.mjs --remove --apply   # removes it and everything it did
//
// Run from the repo root with the live keys in the environment (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY).
// The code itself is never needed here and never printed.
//
// What it adds: a login for that address (confirmed, so no email is ever needed) and an active member called
// "App Review", with no Stripe subscription, a drawn photo from the club's group drawing (approved, so the photo gate
// does not stop the reviewer) and every notification switch off (nothing is emailed or texted to the address). It has
// not agreed to the community rules or the Concierge yet: the reviewer sees and agrees to both, as a new member would.
// Running --apply again resets those two, so each review starts the same way.
//
// --remove deletes its photo files, then its login; the database removes the rest with it (its member row, photo,
// any plans it posted and their chats, its places and messages).
//
// It marks the member members.is_review_account: the fixed review code works only for a member marked so. It refuses
// any address that is an admin, or a member it did not make (no mark), so a real member or an admin can never be
// turned into the review account, or removed, by mistake. Use an address nobody could guess (it never needs to
// receive mail: nothing is sent to it).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const REMOVE = process.argv.includes('--remove');
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const EMAIL = (process.env.REVIEW_LOGIN_EMAIL ?? '').trim().toLowerCase();
if (!SUPA || !process.env.SUPABASE_SECRET_KEY) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY first.');
  process.exit(1);
}
if (!EMAIL || !EMAIL.includes('@')) {
  console.error('Set REVIEW_LOGIN_EMAIL to the review account address first.');
  process.exit(1);
}
const NAME = 'App Review';
const db = createClient(SUPA, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const PHOTOS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sample-photos');
const LETTER = 'O';
const say = (line) => console.log(line);

async function findUser() {
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listing logins: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === EMAIL);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function guard(user, { mustBeMarked }) {
  const { data: admin } = await db.from('admin_users').select('id').eq('id', user.id).maybeSingle();
  if (admin) throw new Error(`refusing: ${EMAIL} is an admin`);
  const { data: row, error } = await db.from('members').select('id, is_review_account, stripe_subscription_id').eq('id', user.id).maybeSingle();
  if (error) throw new Error(`reading the member: ${error.message}`);
  if (row ? !row.is_review_account || row.stripe_subscription_id : mustBeMarked) {
    throw new Error(`refusing: ${EMAIL} is not the App Review account this script made`);
  }
}

async function remove() {
  const user = await findUser();
  if (!user) { say(`No login for ${EMAIL}: nothing to remove.`); return; }
  await guard(user, { mustBeMarked: true });
  if (!APPLY) { say(`Would remove the App Review account ${EMAIL} and what it posted. Dry run: add --apply.`); return; }
  const { data: files } = await db.storage.from('member-photos').list(user.id, { limit: 100 });
  const paths = (files ?? []).map((f) => `${user.id}/${f.name}`);
  if (paths.length) {
    const { error } = await db.storage.from('member-photos').remove(paths);
    if (error) throw new Error(`photo files: ${error.message}`);
  }
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`login: ${error.message}`);
  say(`Removed the App Review account ${EMAIL} (${paths.length} photo files).`);
}

async function add() {
  let user = await findUser();
  // A login with no member row is refused too: it could be anyone's (an admin's, or a half-finished signup).
  if (user) await guard(user, { mustBeMarked: true });
  if (!APPLY) { say(user ? `The App Review account ${EMAIL} is there; --apply resets it.` : `Would add the App Review account ${EMAIL}. Dry run: add --apply.`); return; }
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({ email: EMAIL, email_confirm: true });
    if (error) throw new Error(`login: ${error.message}`);
    user = data.user;
    say(`Added the login ${EMAIL}.`);
  } else {
    await db.auth.admin.updateUserById(user.id, { ban_duration: 'none' });
  }
  let { error } = await db.from('members').upsert({
    id: user.id, email: EMAIL, full_name: NAME, membership_status: 'active', rules_agreed_at: null, concierge_consent_at: null,
    is_review_account: true,
  });
  if (error) throw new Error(`member row: ${error.message}`);
  ({ error } = await db.from('notification_preferences').upsert({
    member_id: user.id, topic_host: false, topic_in: false, topic_reminder24: false, topic_reminder2: false, topic_club_changes: false,
    channel_push: false, channel_email: false, channel_text: false,
  }, { onConflict: 'member_id' }));
  if (error) throw new Error(`notification switches: ${error.message}`);
  const full = `${user.id}/review-${LETTER}-full.jpg`;
  const thumb = `${user.id}/review-${LETTER}-thumb.jpg`;
  for (const [p, f] of [[full, `${LETTER}-480.jpg`], [thumb, `${LETTER}-160.jpg`]]) {
    const { error: e } = await db.storage.from('member-photos').upload(p, fs.readFileSync(path.join(PHOTOS, f)), { contentType: 'image/jpeg', upsert: true });
    if (e) throw new Error(`photo ${p}: ${e.message}`);
  }
  const { data: photo, error: pe } = await db.from('member_photos').upsert({
    member_id: user.id, path: full, thumb_path: thumb, width: 480, height: 480, content_type: 'image/jpeg',
    bytes: fs.statSync(path.join(PHOTOS, `${LETTER}-480.jpg`)).size, resized: true, source: 'new', face_check: 'skipped',
    status: 'approved', reviewed_at: new Date().toISOString(),
  }, { onConflict: 'path' }).select('id').single();
  if (pe) throw new Error(`photo row: ${pe.message}`);
  ({ error } = await db.from('members').update({ photo_id: photo.id }).eq('id', user.id));
  if (error) throw new Error(`photo link: ${error.message}`);
  say(`Done: the App Review account ${EMAIL} is an active member with a photo, rules and Concierge not yet agreed, notifications off.`);
}

if (REMOVE) await remove();
else await add();
