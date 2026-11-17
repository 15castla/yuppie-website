-- Undo supabase/migrations/20261118090000_outreach_drafter_link.sql: removes the Outlook connection's tables and
-- columns. The desk's Phase 1 record (partners, emails, replies, notes) stays. This deletes the drafter's key, the sync
-- history, every follow-up text, the list of ignored messages, and the Outlook ids, attachments and draft links on
-- touches, outcomes and follow-ups, so roll the site back first and run it only with Albert's explicit go.

begin;
drop table if exists public.outreach_draft_texts;
drop table if exists public.outreach_sync_runs;
drop table if exists public.outreach_drafter_keys;
drop table if exists public.outreach_ignored_messages;
alter table public.outreach_touches drop column if exists attachments, drop column if exists guess_kind, drop column if exists candidate_targets;
alter table public.outreach_outcomes drop column if exists attachments, drop column if exists hint, drop column if exists candidate_targets;
alter table public.outreach_followups drop column if exists draft_id, drop column if exists draft_link, drop column if exists draft_made_at,
  drop column if exists draft_error;
commit;

notify pgrst, 'reload schema';
