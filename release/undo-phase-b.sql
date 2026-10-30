-- UNDO for the stage 2 (Phase B) migration 20261030090000_open_invite_messages.sql, back to the stage 1
-- layout (main e1e4a78: the four Phase A migrations), in one transaction. Proved locally by
-- tests/e2e/phase-b/00-migration.mjs: the schema after stage 1 plus stage 2 plus this file is the stage 1
-- schema exactly (tables, columns, constraints, indexes, policies, grants, functions, triggers, buckets).
--
-- It deletes data: every Open Invite plan, chat, message, Update, block, report, photo record and
-- notification preference, and the new message_log and booking columns. Export them first.
-- It does NOT delete the files in the private member-photos bucket (storage files are not removed by SQL on
-- Supabase): empty the bucket from the dashboard or the API first, then this drops the bucket row. Members'
-- old public avatar_url values were never changed by stage 2, so the stage 1 code shows them again.
-- Run it with the stage 1 code deployed (or about to be): the stage 2 code needs these tables.
begin;

-- Storage: the restrictive policy and the bucket (the bucket must be empty; see above).
drop policy if exists "Member photos are server only" on storage.objects;
delete from storage.buckets where id = 'member-photos' and not exists (select 1 from storage.objects where bucket_id = 'member-photos');

-- Functions (the tables' own triggers go with the tables).
drop function if exists public.unread_counts(uuid);
drop function if exists public.chat_unread(uuid);
drop function if exists public.mark_chat_read(uuid, uuid);
drop function if exists public.open_question(uuid, uuid);
drop function if exists public.cancel_plan(uuid, uuid, uuid, text);
drop function if exists public.edit_plan(uuid, uuid, text, text, timestamptz, text, text, integer, boolean);
drop function if exists public.leave_plan(uuid, uuid);
drop function if exists public.join_plan(uuid, uuid);
drop function if exists public.post_plan(uuid, text, text, timestamptz, text, text, integer, boolean);
drop function if exists public.blocked_between(uuid, uuid);
drop function if exists public.member_can_take_part(uuid);

-- Stage 1 tables: the added columns.
alter table public.bookings drop column if exists reminder_2h_text_at;
alter table public.bookings drop column if exists reminder_24h_text_at;
drop index if exists public.message_log_plan_idx;
alter table public.message_log drop column if exists photo_id;
alter table public.message_log drop column if exists report_id;
alter table public.message_log drop column if exists chat_id;
alter table public.message_log drop column if exists plan_id;
alter table public.members drop constraint if exists members_photo_id_fkey;
alter table public.members drop column if exists chat_safety_seen_at;
alter table public.members drop column if exists photo_id;
-- Stage 1's column grant: a member could change avatar_url.
grant update (avatar_url) on public.members to authenticated;

-- The new tables, children first. Some read policies look at another table (messages at chat_members and
-- blocks, chats at chat_members, plans at plan_members), so those policies go before the tables they read.
drop table if exists public.notification_preferences;
drop table if exists public.reports;
drop table if exists public.updates;
drop table if exists public.messages;
drop function if exists public.messages_touch_chat();
drop table if exists public.blocks;
do $$
begin
  if to_regclass('public.chats') is not null then
    drop policy if exists "Members read chats they are in" on public.chats;
  end if;
  if to_regclass('public.plans') is not null then
    drop policy if exists "Members read own plans" on public.plans;
  end if;
end;
$$;
drop table if exists public.chat_members;
drop table if exists public.chats;
drop table if exists public.plan_members;
drop table if exists public.plans;
drop table if exists public.member_photos;

commit;
