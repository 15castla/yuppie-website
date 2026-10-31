// Does the local stack's baseline plus the repo's migrations (everything before the Phase A migration) give
// the live layout of 27 Oct 2026? Compares tables, columns (type, nullability, default), constraints, public
// indexes, policies, enums and triggers with /home/claude/build-a/live-schema/supabase-layout-2026-10-27.md.
// Then the same comparison after the full rebuild plus release/undo-phase-a.sql (the undo gives
// the live layout back). DESTRUCTIVE: rebuilds the public schema three times (apply_repo.sh) and ends with
// every migration applied and seed.mjs run. Only when no one else is mid-test.
//   node tests/e2e/phase-a/live-layout-check.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { done, eq, ok, sql } from './lib.mjs';

const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const DUMP = '/home/claude/build-a/live-schema/supabase-layout-2026-10-27.md';
const PHASE_A = '20261028090000_members_core_backend.sql';
const md = fs.readFileSync(DUMP, 'utf8');
const rows = (block) => block.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('|---')).map((l) => l.slice(2, -2).split(' | ').map((c) => c.trim()));
const section = (title, next) => md.slice(md.indexOf(title), next ? md.indexOf(next, md.indexOf(title)) : undefined);
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/public\./g, '').replace(/extensions\./g, '').trim();

// ---- rebuild without the Phase A migration
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-a-pre-'));
fs.mkdirSync(path.join(tmp, 'supabase/migrations'), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'supabase/migrations'))) {
  if (f < '20261028090000') fs.copyFileSync(path.join(ROOT, 'supabase/migrations', f), path.join(tmp, 'supabase/migrations', f));
}
execFileSync('/home/claude/stack/apply_repo.sh', [tmp], { stdio: ['ignore', 'pipe', 'pipe'] });
ok(true, 'baseline plus the repo migrations before Phase A applied');

function compare(when) {
  // ---- columns
  const tables = [...md.matchAll(/### public\.(\w+) \(base table\)\n\n([\s\S]*?)(?=\n###|\n## )/g)];
  for (const [, table, block] of tables) {
    const live = rows(block).slice(1).map(([c, t, n, d]) => `${c} ${t} ${n} ${norm(d)}`);
    const local = sql(`select column_name as c, case when data_type = 'USER-DEFINED' then udt_name else data_type end as tb, is_nullable as n, column_default as d from information_schema.columns where table_schema = 'public' and table_name = '${table}' order by ordinal_position`).map((r) => `${r.c} ${r.tb} ${r.n} ${norm(r.d)}`);
    eq(local, live, `${when}: public.${table} columns, types, nullability and defaults as live`);
  }
  const localTables = sql(`select table_name as tb from information_schema.tables where table_schema = 'public' order by 1`).map((r) => r.tb);
  eq(localTables, tables.map((t) => t[1]).sort(), `${when}: the same public tables as live`);

  // ---- constraints
  const liveCons = rows(section('## 2. Constraints', '## 3.')).slice(1).filter((r) => r[0].startsWith('public.')).map(([t, n, , d]) => `${t.replace('public.', '')} ${n} ${norm(d)}`).sort();
  const localCons = sql(`select conrelid::regclass::text as tb, conname as n, pg_get_constraintdef(oid) as d from pg_constraint where connamespace = 'public'::regnamespace and contype in ('p','f','u','c')`).map((r) => `${r.tb.replace('public.', '')} ${r.n} ${norm(r.d)}`).sort();
  eq(localCons, liveCons, `${when}: constraints as live`);

  // ---- indexes
  const liveIdx = rows(section('## 3. Indexes', '## 4.')).slice(1).map(([t, n, d]) => `${t} ${n} ${norm(d)}`).sort();
  const localIdx = sql(`select tablename as tb, indexname as n, indexdef as d from pg_indexes where schemaname = 'public'`).map((r) => `${r.tb} ${r.n} ${norm(r.d)}`).sort();
  eq(localIdx, liveIdx, `${when}: public indexes as live`);

  // ---- RLS and policies
  const liveRls = rows(section('### RLS per `public` table', '### Policies')).slice(1).map(([t, e, f]) => `${t} ${e} ${f}`).sort();
  const localRls = sql(`select relname as tb, relrowsecurity as e, relforcerowsecurity as f from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`).map((r) => `${r.tb} ${r.e} ${r.f}`).sort();
  eq(localRls, liveRls, `${when}: RLS on every table, not forced, as live`);
  const livePol = rows(section('### Policies', '## 5.')).slice(1).map(([t, p, c, perm, roles, u, w]) => `${t.replace('public.', '')} | ${p} | ${c} | ${perm} | ${roles.replace(/ /g, '')} | ${norm(u)} | ${norm(w)}`).sort();
  const localPol = sql(`select tablename as tb, policyname as p, cmd as c, permissive as perm, array_to_string(roles, ',') as roles, qual as u, with_check as w from pg_policies where schemaname = 'public'`).map((r) => `${r.tb} | ${r.p} | ${r.c} | ${r.perm} | ${r.roles} | ${norm(r.u)} | ${norm(r.w)}`).sort();
  eq(localPol, livePol, `${when}: every policy as live (names, commands, roles, rules; duplicates included)`);

  // ---- enums, triggers, functions, grants
  const liveEnums = rows(section('### Enums', '### Installed')).slice(1).filter((r) => r[0] === 'public').map(([, n, v]) => `${n}: ${v}`).sort();
  const localEnums = sql(`select t.typname as n, string_agg(e.enumlabel, ', ' order by e.enumsortorder) as v from pg_type t join pg_enum e on e.enumtypid = t.oid where t.typnamespace = 'public'::regnamespace group by 1`).map((r) => `${r.n}: ${r.v}`).sort();
  eq(localEnums, liveEnums, `${when}: enums as live`);
  eq(sql(`select tgname as n from pg_trigger where tgrelid = 'public.events'::regclass and not tgisinternal`).map((r) => r.n), ['events_set_slug'], `${when}: events_set_slug trigger as live`);
  ok(sql(`select 1 from pg_event_trigger where evtfoid = 'public.rls_auto_enable'::regproc`).length === 1, `${when}: the rls_auto_enable event trigger is installed`);
  eq(sql(`select proname as n from pg_proc where pronamespace = 'public'::regnamespace order by 1`).map((r) => r.n), ['approve_application_and_create_member', 'events_generate_slug', 'rls_auto_enable'], `${when}: the same public functions as live`);
  const grants = sql(`select table_name as tb, grantee as g, string_agg(privilege_type, ', ' order by privilege_type) as p from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') group by 1, 2`);
  ok(grants.length === 16 && grants.every((g) => g.p === 'DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE'), `${when}: full grants to anon and authenticated on every table, as live`, grants);
}

compare('before Phase A');

// ---- and back to everything, Phase A included
execFileSync('/home/claude/stack/apply_repo.sh', [ROOT], { stdio: ['ignore', 'pipe', 'pipe'] });
ok(true, 'rebuilt with every migration, Phase A included');
// Stage 2 first (its undo gives the stage 1 layout back; tests/e2e/phase-b/00-migration.mjs proves it), then Phase A.
if (fs.existsSync(`${ROOT}/release/undo-phase-b.sql`)) {
  execFileSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-f', `${ROOT}/release/undo-phase-b.sql`], { stdio: ['ignore', 'pipe', 'pipe'] });
}
execFileSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-f', `${ROOT}/release/undo-phase-a.sql`], { stdio: ['ignore', 'pipe', 'pipe'] });
ok(true, 'release/undo-phase-a.sql applied');
compare('after the undo');
execFileSync('/home/claude/stack/apply_repo.sh', [ROOT], { stdio: ['ignore', 'pipe', 'pipe'] });
execFileSync('node', ['/home/claude/stack/tools/seed.mjs', '--prefix', 'f.', '--quiet'], { stdio: ['ignore', 'pipe', 'pipe'] });
ok(true, 'rebuilt with every migration again, and seeded');
fs.rmSync(tmp, { recursive: true, force: true });
done();
