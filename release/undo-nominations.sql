-- Undo supabase/migrations/20261112090000_nominations_credit.sql (only if Albert says roll back). Run as postgres
-- in the SQL editor.
--
-- Roll the website back to the release before this one FIRST (Vercel, Promote the previous deployment): this
-- release's code reads and writes these columns and credit_ledger, so it would fail if they went while it is live.
-- Members' credit and who nominated whom are lost with them.

begin;

drop table if exists public.credit_ledger;

drop trigger if exists applications_nomination_guard on public.applications;
drop function if exists public.applications_nomination_guard();
drop index if exists public.applications_nominated_by_idx;
alter table public.applications drop column if exists nominated_by;

drop index if exists public.members_nomination_code_key;
alter table public.members drop constraint if exists members_nomination_code_check;
alter table public.members drop constraint if exists members_nominations_allowed_check;
alter table public.members drop column if exists nomination_code;
alter table public.members drop column if exists nominations_allowed;

commit;
