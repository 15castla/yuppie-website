// The Phase A migration: applies on top of itself (re-runnable), and leaves the schema the brief asks for.
// `node 00-migration.mjs --rebuild` first rebuilds the whole public schema with the stack's apply_repo.sh
// (baseline plus every migration; it DROPS public, so only when no one else is mid-test), then applies
// the Phase A migration a second time. Without --rebuild it only re-applies the migration and checks.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { done, eq, ok, sql, sql1 } from './lib.mjs';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const FILE = `${ROOT}/supabase/migrations/20261028090000_members_core_backend.sql`;
const psql = (file) => execFileSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-f', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

if (process.argv.includes('--rebuild')) {
  const out = execFileSync('/home/claude/stack/apply_repo.sh', [ROOT], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  ok(out.includes('APPLIED'), 'apply_repo.sh: baseline plus every migration applies from scratch');
  // The rebuild drops public (admin_users with it; auth users survive): seed the test admin and data again.
  execFileSync('node', ['/home/claude/stack/tools/seed.mjs', '--prefix', 'f.', '--quiet'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  ok(true, 'seed.mjs restores the test admin and data');
}
psql(FILE);
ok(true, 'the Phase A migration applies again on top of itself');
psql(FILE);
ok(true, 'and a third time');

const cols = (table) => sql(`select column_name from information_schema.columns where table_schema = 'public' and table_name = '${table}'`).map((r) => r.column_name);
const has = (table, list) => ok(list.every((c) => cols(table).includes(c)), `${table} has ${list.join(', ')}`, cols(table));
has('members', ['cancel_at', 'cancel_requested_at', 'cancel_reason', 'payment_failed_at', 'grace_until', 'paused_at', 'ended_at', 'ended_reason', 'deleted_at', 'updated_at']);
has('events', ['cancelled_at', 'cancel_note', 'updated_at', 'changed_at']);
has('bookings', ['amount_pence', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'refund_status', 'refund_pence', 'stripe_refund_id', 'refund_error', 'reminder_24h_sent_at', 'reminder_2h_sent_at', 'updated_at']);
has('applications', ['card_released_at']);
has('event_addresses', ['event_id', 'address', 'updated_at']);
has('message_log', ['id', 'channel', 'template', 'dedupe_key', 'to_address', 'member_id', 'application_id', 'booking_id', 'event_id', 'status', 'provider_id', 'error', 'created_at']);
has('stripe_events', ['id', 'type', 'received_at', 'processed_at', 'error']);
has('admin_audit', ['id', 'admin_id', 'action', 'target_type', 'target_id', 'details', 'created_at']);

const uniques = sql(`select pg_get_indexdef(indexrelid) as def from pg_index where indrelid = 'public.bookings'::regclass and indisunique and not indisprimary`).map((r) => r.def);
ok(uniques.some((d) => /\(member_id, event_id\) WHERE \(status = 'confirmed'::(text|booking_status)\)/.test(d)), 'bookings: one confirmed booking per member and event (partial unique index)', uniques);
ok(uniques.some((d) => /\(stripe_payment_intent_id\) WHERE \(stripe_payment_intent_id IS NOT NULL\)/.test(d)), 'bookings: one booking per payment intent', uniques);
ok(!uniques.some((d) => /\(member_id, event_id\)$/.test(d)), 'bookings: the old unique (member_id, event_id) is gone', uniques);
eq(sql1(`select count(*)::int as n from pg_constraint where conrelid = 'public.bookings'::regclass and contype = 'u'`).n, 0, 'bookings: no unique constraint left on (member_id, event_id)');

const policies = (table) => sql(`select policyname, cmd from pg_policies where schemaname = 'public' and tablename = '${table}' order by 1`);
eq(policies('bookings').map((p) => `${p.policyname}/${p.cmd}`), ['Members read own bookings/SELECT'], 'bookings: one read policy (own rows); no member insert or update');
eq(policies('members').map((p) => p.policyname), ['Members read self', 'Members update self'], 'members: read and update self, nothing broader');
const liveNames = ['Members can insert their own bookings', 'Members can view their own bookings', 'Members cancel own bookings', 'Members create own bookings', 'Members can update their own row', 'Members can view their own row', 'Members read own profile', 'Members update own profile'];
eq(sql(`select policyname from pg_policies where schemaname = 'public' and policyname in (${liveNames.map((n) => `'${n}'`).join(',')})`), [], 'none of the live member and booking policies is left (Members cancel own bookings included)');
eq(sql1(`select udt_name from information_schema.columns where table_schema = 'public' and table_name = 'bookings' and column_name = 'status'`).udt_name, 'booking_status', 'bookings.status is the live enum (the checks work on it)');
eq(sql1(`select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'events' and column_name = 'tier'`).is_nullable, 'YES', 'events.tier is optional now (live: NOT NULL with no default, so the admin could not create an event)');
for (const t of ['event_addresses', 'message_log', 'stripe_events', 'admin_audit']) {
  eq(sql1(`select relrowsecurity as on from pg_class where oid = 'public.${t}'::regclass`).on, true, `${t}: RLS on`);
}
eq(policies('stripe_events').length, 0, 'stripe_events: no policies (server only)');
const memberGrants = sql(`select column_name from information_schema.column_privileges where table_schema = 'public' and table_name = 'members' and grantee = 'authenticated' and privilege_type = 'UPDATE' order by 1`).map((r) => r.column_name);
// Stage 2 (20261030090000) takes avatar_url away from members too: photos are uploaded and recorded by the
// server only (private bucket, members.photo_id). With only the stage 1 migrations it is still there.
const stage2 = sql1(`select to_regclass('public.member_photos') is not null as on`).on;
eq(memberGrants, stage2 ? ['bio', 'employer', 'full_name', 'phone', 'role_title'] : ['avatar_url', 'bio', 'employer', 'full_name', 'phone', 'role_title'], 'members: authenticated may update only the profile columns');
const fnGrants = sql(`select grantee from information_schema.routine_privileges where routine_schema = 'public' and routine_name = 'book_event'`).map((r) => r.grantee);
ok(fnGrants.includes('service_role') && !fnGrants.includes('anon') && !fnGrants.includes('authenticated') && !fnGrants.includes('PUBLIC'), 'book_event: service role only', fnGrants);
ok(sql1(`select prosecdef from pg_proc where proname = 'book_event'`).prosecdef === true, 'book_event: security definer');
ok(sql1(`select count(*)::int as n from pg_proc where proname = 'approve_application_and_create_member'`).n === 1, 'approve_application_and_create_member is still there');
done();
