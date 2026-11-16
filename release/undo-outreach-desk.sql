-- Undo supabase/migrations/20261117090000_outreach_desk.sql: removes the Outreach Desk's tables and the owner flag.
-- This deletes every outreach record (partners, contacts, emails, letters, replies, notes, actions, follow-ups), so
-- roll the site back first and run it only with Albert's explicit go. Check first what would be lost:
--   select count(*) from public.outreach_targets;
--   select count(*) from public.outreach_touches;
--   select count(*) from public.outreach_notes;

begin;
drop table if exists public.outreach_actions;
drop table if exists public.outreach_notes;
drop table if exists public.outreach_followups;
drop table if exists public.outreach_stage_history;
drop table if exists public.outreach_outcomes;
drop table if exists public.outreach_touch_recipients;
drop table if exists public.outreach_touches;
drop table if exists public.outreach_contacts;
drop table if exists public.outreach_targets;
drop index if exists public.admin_users_one_owner;
alter table public.admin_users drop column if exists is_owner;
commit;

notify pgrst, 'reload schema';
