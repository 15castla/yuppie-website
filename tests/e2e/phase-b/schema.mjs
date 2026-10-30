// A plain-text picture of the database layout, one line per thing, for comparing two states of the schema:
// columns, constraints, indexes, RLS, policies (public and storage.objects), table, column and function
// grants, functions, triggers and storage buckets. Lines are sorted, so two pictures can be diffed as sets.
import { sql } from './lib.mjs';

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export function layout() {
  const lines = [];
  const add = (prefix, rows, fmt) => rows.forEach((r) => lines.push(`${prefix} ${fmt(r)}`.trim()));
  add('col', sql(`select table_name tb, column_name c, case when data_type = 'USER-DEFINED' then udt_name else data_type end ty, is_nullable n, column_default d from information_schema.columns where table_schema = 'public'`), (r) => `${r.tb}.${r.c} ${r.ty} ${r.n} ${norm(r.d)}`);
  add('con', sql(`select conrelid::regclass::text tb, conname n, pg_get_constraintdef(oid) d from pg_constraint where connamespace = 'public'::regnamespace and contype in ('p','f','u','c')`), (r) => `${r.tb} ${r.n} ${norm(r.d)}`);
  add('idx', sql(`select tablename tb, indexname n, indexdef d from pg_indexes where schemaname = 'public'`), (r) => `${r.tb} ${r.n} ${norm(r.d)}`);
  add('rls', sql(`select relname tb, relrowsecurity e, relforcerowsecurity f from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`), (r) => `${r.tb} ${r.e} ${r.f}`);
  add('pol', sql(`select schemaname s, tablename tb, policyname p, cmd c, permissive perm, array_to_string(roles, ',') roles, qual u, with_check w from pg_policies where schemaname in ('public', 'storage')`), (r) => `${r.s}.${r.tb} | ${r.p} | ${r.c} | ${r.perm} | ${r.roles} | ${norm(r.u)} | ${norm(r.w)}`);
  add('grant', sql(`select table_name tb, grantee g, string_agg(privilege_type, ',' order by privilege_type) p from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role') group by 1, 2`), (r) => `${r.tb} ${r.g} ${r.p}`);
  add('colgrant', sql(`select table_name tb, column_name c, grantee g, privilege_type p from information_schema.column_privileges where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('UPDATE', 'INSERT') and (table_name, grantee, privilege_type) not in (select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public')`), (r) => `${r.tb}.${r.c} ${r.g} ${r.p}`);
  add('fn', sql(`select p.proname n, pg_get_function_identity_arguments(p.oid) a, p.prosecdef s from pg_proc p where p.pronamespace = 'public'::regnamespace`), (r) => `${r.n}(${r.a}) secdef=${r.s}`);
  add('fngrant', sql(`select routine_name n, grantee g from information_schema.routine_privileges where routine_schema = 'public' and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')`), (r) => `${r.n} ${r.g}`);
  add('trg', sql(`select tgrelid::regclass::text tb, tgname n from pg_trigger where not tgisinternal and tgrelid::regclass::text not like 'storage.%' and tgrelid::regclass::text not like 'auth.%'`), (r) => `${r.tb} ${r.n}`);
  add('bucket', sql(`select id, public p, file_size_limit l, array_to_string(allowed_mime_types, ',') m from storage.buckets`), (r) => `${r.id} public=${r.p} limit=${r.l ?? ''} types=${r.m ?? ''}`);
  return [...new Set(lines)].sort();
}

/** What is in `b` and not in `a`, and the other way round. */
export function diff(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  return { added: b.filter((l) => !A.has(l)), removed: a.filter((l) => !B.has(l)) };
}
