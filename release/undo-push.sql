-- Undo supabase/migrations/20261111090000_push.sql (only if Albert says roll back). Run as postgres in the SQL
-- editor.
--
-- Roll the website back to the release before this one FIRST (Vercel, Promote the previous deployment): this
-- release's code writes push_devices and push rows in message_log, so it would fail if they went while it is live.
-- Then MEMBERS_PUSH_LIVE (and MEMBERS_PUSH_TESTERS) can be removed in Vercel; the emails come back on their own.

begin;

drop table if exists public.push_devices;

delete from public.message_log where channel = 'push';
alter table public.message_log drop constraint if exists message_log_channel_check;
alter table public.message_log add constraint message_log_channel_check check (channel in ('email', 'sms'));

alter table public.chat_members drop column if exists pushed_at;

commit;
