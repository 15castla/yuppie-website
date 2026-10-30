// The stage 2 migration (20261030090000_open_invite_messages.sql), in the live-layout-check style.
// DESTRUCTIVE (apply_repo.sh drops public three times): only when no one else is mid-test. It ends with every
// migration applied, so run-all.mjs seeds after it.
//
//   1. stage 1 alone (every migration before this one): picture S1;
//   2. everything, then this file twice more on top of itself: picture S2. The stage 1 tables are unchanged
//      except for exactly the additions this migration means to make (and the one grant it takes away);
//   3. release/undo-phase-b.sql: picture S3 is S1 exactly, and pg_dump -s of public agrees;
//   4. everything again; the new tables have RLS on, member SELECT only, the functions are service role only,
//      the photo bucket is private with its restrictive policy.
//   node tests/e2e/phase-b/00-migration.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { done, eq, exec, ok, sql, sql1 } from './lib.mjs';
import { diff, layout } from './schema.mjs';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const MINE = '20261030090000_open_invite_messages.sql';
const FILE = `${ROOT}/supabase/migrations/${MINE}`;
const UNDO = `${ROOT}/release/undo-phase-b.sql`;
const psqlFile = (file) => {
  try {
    execFileSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-f', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    ok(false, `psql ${path.basename(file)}`, String(err.stderr || err.message).split('\n').filter((l) => /ERROR|DETAIL|HINT/.test(l)).join('\n'));
  }
};
const dump = () => execFileSync('pg_dump', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-s', '-n', 'public', '--no-owner', 'postgres'], { encoding: 'utf8' }).replace(/^--.*$/gm, '').replace(/^\\(un)?restrict .*$/gm, '').replace(/\n{2,}/g, '\n');
const NEW_TABLES = ['member_photos', 'plans', 'plan_members', 'chats', 'chat_members', 'messages', 'updates', 'blocks', 'reports', 'notification_preferences'];

// ---- 1. stage 1 alone
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-b-pre-'));
fs.mkdirSync(path.join(tmp, 'supabase/migrations'), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'supabase/migrations'))) {
  if (f < MINE) fs.copyFileSync(path.join(ROOT, 'supabase/migrations', f), path.join(tmp, 'supabase/migrations', f));
}
execFileSync('/home/claude/stack/apply_repo.sh', [tmp], { stdio: ['ignore', 'pipe', 'pipe'] });
// apply_repo.sh empties storage.buckets but leaves storage.objects' policies alone, so a policy from an
// earlier stage 2 run would still be here: stage 1 has none.
exec(`drop policy if exists "Member photos are server only" on storage.objects`);
eq(sql(`select policyname from pg_policies where schemaname = 'storage'`), [], 'stage 1: no storage policies (as live: "the bucket has no storage rules")');
ok(true, 'stage 1: baseline plus every migration before stage 2 applied');
const S1 = layout();
const D1 = dump();
ok(S1.length > 200, `stage 1 picture taken (${S1.length} lines)`);

// ---- 2. everything, then the stage 2 file twice more
const out = execFileSync('/home/claude/stack/apply_repo.sh', [ROOT], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
ok(out.includes(`-> ${MINE}`) && out.includes('APPLIED'), 'stage 2 applies on the stage 1 schema from scratch');
psqlFile(FILE);
ok(true, 'and again on top of itself');
psqlFile(FILE);
ok(true, 'and a third time');
const S2 = layout();
const d = diff(S1, S2);
const STAGE1_TABLES = new Set(sql(`select tablename tb from pg_tables where schemaname = 'public'`).map((r) => r.tb).filter((t) => !NEW_TABLES.includes(t)));
const tableOf = (line) => {
  const word = line.split(' ')[1] ?? '';
  return word.split('.')[0].split('|')[0].trim();
};
const onStage1 = (line) => !line.startsWith('fn') && !line.startsWith('fngrant') && !line.startsWith('bucket') && !line.startsWith('pol storage') && STAGE1_TABLES.has(tableOf(line));
eq(d.added.filter(onStage1).sort(), [
  'col bookings.reminder_24h_text_at timestamp with time zone YES',
  'col bookings.reminder_2h_text_at timestamp with time zone YES',
  'col members.chat_safety_seen_at timestamp with time zone YES',
  'col members.photo_id uuid YES',
  'col message_log.chat_id uuid YES',
  'col message_log.photo_id uuid YES',
  'col message_log.plan_id uuid YES',
  'col message_log.report_id uuid YES',
  'con members members_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES member_photos(id) ON DELETE SET NULL',
  'con message_log message_log_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL',
  'con message_log message_log_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES member_photos(id) ON DELETE SET NULL',
  'con message_log message_log_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL',
  'con message_log message_log_report_id_fkey FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL',
  'idx message_log message_log_plan_idx CREATE INDEX message_log_plan_idx ON public.message_log USING btree (plan_id) WHERE (plan_id IS NOT NULL)',
].sort(), 'stage 1 tables: only the intended new columns, keys and index (nothing else on them changed)');
eq(d.removed, ['colgrant members.avatar_url authenticated UPDATE'], 'stage 1 tables: the one thing taken away is a member updating avatar_url (photos are server-written now)');
eq(d.added.filter((l) => l.startsWith('pol storage')), ['pol storage.objects | Member photos are server only | ALL | RESTRICTIVE | anon,authenticated | (bucket_id <> \'member-photos\'::text) | (bucket_id <> \'member-photos\'::text)'], 'storage: one new policy, restrictive, shutting anon and authenticated out of member-photos');
eq(d.added.filter((l) => l.startsWith('bucket')), ['bucket member-photos public=false limit=10485760 types=image/jpeg,image/png,image/webp'], 'storage: the private member-photos bucket (10 MB, JPG, PNG, WebP)');
eq(S2.filter((l) => l.startsWith('bucket member-media')), S1.filter((l) => l.startsWith('bucket member-media')), 'storage: member-media is unchanged');

// ---- 3. the undo
psqlFile(UNDO);
ok(true, 'release/undo-phase-b.sql applied');
psqlFile(UNDO);
ok(true, 'and again (the undo is re-runnable too)');
const S3 = layout();
const u = diff(S1, S3);
eq(u, { added: [], removed: [] }, 'after the undo the layout is stage 1 exactly (tables, columns, keys, indexes, RLS, policies, grants, functions, triggers, buckets)');
eq(dump() === D1, true, 'and pg_dump -s of public agrees, byte for byte');

// ---- 4. everything again, and the new tables' rules
execFileSync('/home/claude/stack/apply_repo.sh', [ROOT], { stdio: ['ignore', 'pipe', 'pipe'] });
ok(true, 'rebuilt with every migration');
for (const t of NEW_TABLES) {
  eq(sql1(`select relrowsecurity r from pg_class where oid = 'public.${t}'::regclass`).r, true, `${t}: RLS on`);
  const grants = sql(`select grantee g, string_agg(privilege_type, ',' order by privilege_type) p from information_schema.role_table_grants where table_schema = 'public' and table_name = '${t}' and grantee in ('anon', 'authenticated') group by 1`);
  eq(grants, [{ g: 'authenticated', p: 'SELECT' }], `${t}: anon nothing, authenticated SELECT only (no member writes through REST)`);
  const policies = sql(`select cmd from pg_policies where schemaname = 'public' and tablename = '${t}'`).map((r) => r.cmd);
  ok(policies.length >= 1 && policies.every((c) => c === 'SELECT'), `${t}: read policies only`, policies);
}
const fns = sql(`select p.proname n, p.prosecdef s, coalesce((select string_agg(g.grantee, ',' order by g.grantee) from information_schema.routine_privileges g where g.specific_name = p.proname || '_' || p.oid and g.grantee in ('PUBLIC', 'anon', 'authenticated')), '') g from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('member_can_take_part','blocked_between','post_plan','join_plan','leave_plan','edit_plan','cancel_plan','open_question','mark_chat_read','chat_unread','unread_counts','messages_touch_chat')`);
eq(fns.length, 12, 'the twelve new functions exist');
ok(fns.every((f) => f.s === true && f.g === ''), 'every new function is security definer and not executable by PUBLIC, anon or authenticated', fns);
const memberCols = sql(`select column_name c from information_schema.column_privileges where table_schema = 'public' and table_name = 'members' and grantee = 'authenticated' and privilege_type = 'UPDATE' order by 1`).map((r) => r.c);
eq(memberCols, ['bio', 'employer', 'full_name', 'phone', 'role_title'], 'members: a member may update their profile fields only (not avatar_url, photo_id or chat_safety_seen_at)');
fs.rmSync(tmp, { recursive: true, force: true });
done();
