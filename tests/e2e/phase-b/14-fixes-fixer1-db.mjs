// Stage 2 fixes, fixer 1: the migrations on a SCRATCH database of their own (never the shared one), in the hosted
// layout QB3 simulated (/home/claude/build-b/qa/qb3/live): the storage tables owned by supabase_storage_admin and
// a statement trigger refusing DELETE on them (hosted Supabase since March 2026).
//
//   1. stage 1 (baseline and every migration before stage 2): its schema S1;
//   2. stage 2 and the fixes, then both again twice (re-runnable);
//   3. the fixes' rules: column grants (QB3-08), the new functions server only, the claim columns;
//   4. QB3-05: the storage policy block skips with a notice for a role that may not create policies (the migration
//      goes on), and the undo never DELETEs a storage row (the hosted trigger would refuse it);
//   5. the undo twice: public is S1 again byte for byte (pg_dump -s), with the bucket left for
//      release/undo-photos-bucket.mjs (proved in 14-fixes-fixer1-release.mjs).
//   node tests/e2e/phase-b/14-fixes-fixer1-db.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { done, eq, ok } from './lib.mjs';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const DB = `scratch_${(process.env.PHASE_B_TAG || 'bx1.').replace(/\W/g, '')}_fixes`;
const STAGE2 = '20261030090000_open_invite_messages.sql';
const FIXES = '20261031090000_stage2_fixes.sql';
const MIG = (f) => `${ROOT}/supabase/migrations/${f}`;
const UNDO = `${ROOT}/release/undo-phase-b.sql`;
const base = ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres'];
const psql = (args, db = DB) => execFileSync('psql', [...base, '-d', db, '-q', '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const run = (file, db = DB) => {
  try {
    const out = execFileSync('psql', [...base, '-d', db, '-q', '-v', 'ON_ERROR_STOP=1', '-f', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out };
  } catch (err) {
    return { ok: false, out: String(err.stderr || err.message) };
  }
};
const q1 = (query, db = DB) => JSON.parse(psql(['-At', '-c', `select coalesce(json_agg(t), '[]'::json) from (${query}) t`], db) || '[]');
const dump = () => execFileSync('pg_dump', [...base, '-s', '-n', 'public', '--no-owner', DB], { encoding: 'utf8' }).replace(/^--.*$/gm, '').replace(/^\\(un)?restrict .*$/gm, '').replace(/\n{2,}/g, '\n');
const storagePicture = () => JSON.stringify(q1(`select 'pol' k, policyname n, permissive p from pg_policies where schemaname = 'storage' union all select 'bucket', id, public::text from storage.buckets order by 1, 2`));

// ---------------------------------------------------------------- a scratch database in the hosted layout
psql(['-c', `drop database if exists ${DB}`], 'postgres');
psql(['-c', `create database ${DB}`], 'postgres');
const init = fs.readFileSync('/home/claude/build-b/qa/qb3/live/00-init-db.sql', 'utf8').replace(/alter database qb3/g, `alter database ${DB}`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bx1-db-'));
fs.writeFileSync(`${tmp}/init.sql`, init);
eq(run(`${tmp}/init.sql`).ok, true, `scratch database ${DB}: auth, extensions and storage as on hosted (storage tables owned by supabase_storage_admin)`);
eq(run('/home/claude/stack/baseline.sql').ok, true, 'the baseline applies');
const migrations = fs.readdirSync(`${ROOT}/supabase/migrations`).filter((f) => f.endsWith('.sql')).sort();
for (const f of migrations.filter((f) => f < STAGE2)) {
  const r = run(MIG(f));
  if (!r.ok) ok(false, `stage 1 migration ${f}`, r.out.slice(0, 800));
}
ok(true, 'stage 1: every migration before stage 2 applied');
const S1 = dump();
const S1storage = storagePicture();
ok(S1.length > 10000, `stage 1 schema taken (${S1.length} characters)`);

// The hosted rule: no DELETE on storage tables except through the Storage API.
eq(run('/home/claude/build-b/qa/qb3/live/sim-protect-delete.sql').ok, true, 'the hosted "no DELETE on storage tables" trigger is in place');

// ---------------------------------------------------------------- 2. stage 2 and the fixes, three times
eq(migrations.filter((f) => f >= STAGE2), [STAGE2, FIXES], 'the stage 2 migrations are the stage 2 file and the fixes file, in that order');
for (let i = 1; i <= 3; i += 1) {
  const a = run(MIG(STAGE2));
  ok(a.ok, `run ${i}: the stage 2 migration applies`, a.out.split('\n').filter((l) => /ERROR/.test(l)).join('\n'));
  const b = run(MIG(FIXES));
  ok(b.ok, `run ${i}: the fixes apply on top of it`, b.out.split('\n').filter((l) => /ERROR/.test(l)).join('\n'));
}
const S2 = dump();

// ---------------------------------------------------------------- 3. what the fixes made
const colgrants = (t) => q1(`select column_name c from information_schema.column_privileges where table_schema = 'public' and table_name = '${t}' and grantee = 'authenticated' and privilege_type = 'SELECT' order by 1`).map((r) => r.c);
const tablegrants = (t) => q1(`select privilege_type p from information_schema.role_table_grants where table_schema = 'public' and table_name = '${t}' and grantee = 'authenticated' order by 1`).map((r) => r.p);
eq(tablegrants('reports'), [], 'QB3-08 reports: no table-wide SELECT for members any more');
eq(colgrants('reports'), ['chat_id', 'created_at', 'id', 'kind', 'member_id', 'message_id', 'photo_id', 'plan_id', 'reason', 'reporter_id'], 'QB3-08 reports: members may read what they reported, not status, action_note, acted_by, acted_at or the claim');
eq(tablegrants('plans'), [], 'QB3-08 plans: no table-wide SELECT for members any more');
const planCols = colgrants('plans');
ok(!planCols.includes('removed_by') && !planCols.includes('removed_reason') && planCols.includes('title') && planCols.includes('status') && planCols.length === 17, `QB3-08 plans: every column but removed_by and removed_reason (${planCols.join(',')})`);
for (const t of ['plan_members', 'chats', 'chat_members', 'messages', 'updates', 'blocks', 'member_photos', 'notification_preferences']) {
  eq(tablegrants(t), ['SELECT'], `${t}: still SELECT only for members`);
}
const fns = q1(`select p.proname n, p.prosecdef s, coalesce((select string_agg(g.grantee, ',' order by g.grantee) from information_schema.routine_privileges g where g.specific_name = p.proname || '_' || p.oid and g.grantee in ('PUBLIC', 'anon', 'authenticated')), '') g from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('claim_report','claim_photo_review','club_cancel_plan','write_plan_updates','send_chat_message','join_plan','open_question','cancel_plan','plan_visible_to_me') order by 1`);
eq(fns.length, 9, 'the five new functions and the four replaced ones exist');
ok(fns.every((f) => f.s === true && (f.n === 'plan_visible_to_me' ? f.g === 'authenticated' : f.g === '')), 'all security definer; none runnable by members or anon, but plan_visible_to_me (as before)', fns);
eq(q1(`select column_name c from information_schema.columns where table_schema = 'public' and ((table_name = 'reports' and column_name like 'claim%') or (table_name = 'member_photos' and column_name like 'review_claim%')) order by 1`).map((r) => r.c), ['claim_token', 'claimed_at', 'claimed_by', 'review_claim', 'review_claimed_at'], 'the claim columns');

// ---------------------------------------------------------------- 4. QB3-05 on a role that may not create storage policies
psql(['-c', `do $$ begin if not exists (select 1 from pg_roles where rolname = 'scratch_fixer1_migrator') then create role scratch_fixer1_migrator nologin; end if; end $$;`], 'postgres');
psql(['-c', 'grant usage on schema storage to scratch_fixer1_migrator; grant select, insert, update on storage.buckets to scratch_fixer1_migrator;']);
const stage2Text = fs.readFileSync(MIG(STAGE2), 'utf8');
const block = /\ndo \$\$\nbegin\n  begin\n    execute 'drop policy if exists "Member photos are server only"[\s\S]*?\nend;\n\$\$;/.exec(stage2Text)?.[0];
ok(block, 'the storage policy block of the stage 2 migration found');
fs.writeFileSync(`${tmp}/storage-block.sql`, `set role scratch_fixer1_migrator;\n${block}\nreset role;\n`);
const asMigrator = (() => {
  try {
    const out = execFileSync('psql', [...base, '-d', DB, '-v', 'ON_ERROR_STOP=1', '-f', `${tmp}/storage-block.sql`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out };
  } catch (err) {
    return { ok: false, out: String(err.stderr || err.message) };
  }
})();
ok(asMigrator.ok, 'a role that cannot create policies on storage.objects runs the policy block without an error (the migration would go on)', asMigrator.out);
// psql prints notices on stderr; execFileSync keeps stderr only on failure, so ask again with 2>&1.
const notice = execFileSync('bash', ['-c', `psql ${base.join(' ')} -d ${DB} -v ON_ERROR_STOP=1 -f ${tmp}/storage-block.sql 2>&1`], { encoding: 'utf8' });
ok(/NOTICE:\s+Skipped the restrictive storage policy/.test(notice), 'and says so in a notice', notice);
eq(q1(`select count(*)::int n from pg_policies where schemaname = 'storage' and policyname = 'Member photos are server only'`)[0].n, 1, 'as the owner (here) the policy is made: the bucket keeps its second lock where it can have one');
eq(q1(`select public from storage.buckets where id = 'member-photos'`), [{ public: false }], 'the member-photos bucket is private');
// The real RLS answer without the policy: no permissive storage policy, so a member reads nothing.
psql(['-c', `insert into storage.objects (bucket_id, name) values ('member-photos', 'scratch/secret.jpg') on conflict do nothing`]);
psql(['-c', `drop policy "Member photos are server only" on storage.objects`]);
const asMember = psql(['-At', '-c', `set role authenticated; select count(*) from storage.objects where bucket_id = 'member-photos'`]).trim();
eq(asMember, '0', 'without the restrictive policy a member still reads no member-photos object (RLS on, no permissive policy)');
const again = run(MIG(STAGE2));
ok(again.ok, 'the stage 2 migration puts the policy back when run again');
ok(run(MIG(FIXES)).ok, 'and the fixes after it');
fs.writeFileSync(`${tmp}/undo-block.sql`, `set role scratch_fixer1_migrator;\n${/\ndo \$\$\nbegin\n  begin\n    execute 'drop policy if exists[\s\S]*?\nend;\n\$\$;/.exec(fs.readFileSync(UNDO, 'utf8'))?.[0]}\nreset role;\n`);
const undoNotice = execFileSync('bash', ['-c', `psql ${base.join(' ')} -d ${DB} -v ON_ERROR_STOP=1 -f ${tmp}/undo-block.sql 2>&1; echo EXIT=$?`], { encoding: 'utf8' });
ok(/EXIT=0/.test(undoNotice) && /NOTICE:\s+Left the storage policy/.test(undoNotice), 'the undo\'s policy block: a role that may not drop it gets a notice, not an error', undoNotice);

// ---------------------------------------------------------------- 5. the undo, twice, under the hosted delete rule
const u1 = run(UNDO);
ok(u1.ok, 'release/undo-phase-b.sql runs with DELETE on storage refused (it deletes no storage row)', u1.out.split('\n').filter((l) => /ERROR/.test(l)).join('\n'));
ok(!/delete from storage\./i.test(fs.readFileSync(UNDO, 'utf8').replace(/--.*$/gm, '')), 'and has no DELETE on a storage table in it');
ok(run(UNDO).ok, 'and again (re-runnable)');
eq(dump() === S1, true, 'after the undo public is stage 1 again, byte for byte (pg_dump -s: tables, columns, grants, column grants, functions, policies, triggers)');
eq(q1(`select id, public from storage.buckets where id = 'member-photos'`), [{ id: 'member-photos', public: false }], 'the bucket is left for release/undo-photos-bucket.mjs (the Storage API)');
// The API step done (a stand-in here: the trigger lets the Storage API's own role delete), storage is stage 1 too.
psql(['-c', `set storage.allow_delete_query = 'true'; delete from storage.objects where bucket_id = 'member-photos'; delete from storage.buckets where id = 'member-photos'`]);
eq(storagePicture(), S1storage, 'with the bucket emptied and deleted through the API, storage is stage 1 again (no policy, no bucket)');
ok(S2 !== S1, 'the stage 2 schema was different (the comparison means something)');

psql(['-c', `drop database if exists ${DB}`], 'postgres');
fs.rmSync(tmp, { recursive: true, force: true });
done();
