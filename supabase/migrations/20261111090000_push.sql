-- Phone notifications (Albert, 11 Nov 2026: "we need to stop with the email notifications and move everything to app
-- notifications, e.g. message notifications, if someone joins, reminders etc."). Defensive and re-runnable: it
-- applies on the local baseline, on the live layout, and on top of itself. Undo: release/undo-push.sql.
--
-- 1. push_devices: one row per iPhone the app is signed in on (its APNs device token), written by the server only
--    (no grants: members never read or write it). A token signed in by another member moves to them; signing out
--    removes it; a deleted account takes its rows with it.
-- 2. message_log takes push rows too (channel 'push'), so every phone notification is logged and deduped like an
--    email or a text.
-- 3. chat_members.pushed_at: when a chat last sent this member a phone notification, so a burst of messages makes
--    one notification until they read the chat (a server column: no column grant).

-- 1 -----------------------------------------------------------------------------------------------------
create table if not exists public.push_devices (
  token text primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  environment text not null,
  platform text not null default 'ios',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.push_devices drop constraint if exists push_devices_environment_check;
alter table public.push_devices add constraint push_devices_environment_check check (environment in ('sandbox', 'production'));
alter table public.push_devices drop constraint if exists push_devices_platform_check;
alter table public.push_devices add constraint push_devices_platform_check check (platform in ('ios'));
alter table public.push_devices drop constraint if exists push_devices_token_check;
alter table public.push_devices add constraint push_devices_token_check check (token ~ '^[0-9a-f]{32,200}$');

create index if not exists push_devices_member_idx on public.push_devices (member_id);

alter table public.push_devices enable row level security;
revoke all on public.push_devices from anon, authenticated;

comment on table public.push_devices is
  'iPhones signed in to the app that may get phone notifications (APNs device tokens). Server only.';

-- 2 -----------------------------------------------------------------------------------------------------
-- The channel check may carry another name on the live database: drop whichever check names the channel.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.message_log'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%channel%'
  loop
    execute format('alter table public.message_log drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.message_log add constraint message_log_channel_check check (channel in ('email', 'sms', 'push'));

-- 3 -----------------------------------------------------------------------------------------------------
alter table public.chat_members add column if not exists pushed_at timestamptz;

comment on column public.chat_members.pushed_at is
  'When this chat last sent this member a phone notification; the next waits until they have read the chat. Server only.';
