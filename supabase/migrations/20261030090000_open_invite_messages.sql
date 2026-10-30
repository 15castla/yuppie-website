-- Members backend, stage 2 (Phase B): Open Invite plans, chats and messages,
-- the Updates feed, blocks, reports, private member photos and notification
-- preferences.
--
-- Defensive and re-runnable, like the stage 1 migrations: tables are
-- "create table if not exists", columns "add column if not exists", every
-- constraint, index, policy and trigger is dropped by name before it is made
-- again, functions are "create or replace". It applies on the stage 1 schema
-- (20261028090000 to 20261028090300) and on top of itself. Undo:
-- release/undo-phase-b.sql (proved to give the stage 1 layout back).
--
-- Security model (the brief, section 4):
--   * Every new table has RLS on. Members (the "authenticated" role) may only
--     SELECT, and only what is theirs: their own plans and the plans they are
--     going to, their own plan_members rows, the chats they are in and those
--     chats' messages (never a removed message, never one from a member they
--     blocked), their own Updates, their own blocks (never the blocks against
--     them), their own reports, their own photo rows and their own
--     notification preferences. "anon" gets nothing.
--   * Nobody but the server writes: no INSERT, UPDATE or DELETE grant on any
--     new table for anon or authenticated. The server actions check the
--     member and then write with the service role, or call the functions
--     below (service role only).
--   * members.photo_id and members.chat_safety_seen_at are server columns (no
--     column grant), and members.avatar_url is no longer member-writable:
--     photos are uploaded and recorded by the server only.
--   * Member photos live in the private bucket "member-photos". A restrictive
--     storage policy shuts anon and authenticated out of it whatever other
--     storage policies exist; uploads and signed URLs come from the server.
--
-- Times are timestamptz. Money is pence. Paid plans (price_pence) are in the
-- schema for stage 3; nothing in stage 2 sets them and join_plan refuses a
-- plan that has a price.

-- ---------------------------------------------------------------------------
-- 1. member_photos: every photo a member has uploaded (or that the release
--    script moved from the public bucket), with its review status. The
--    member's current photo is members.photo_id.
--
--    status   pending   shows straight away and waits in the admin Photos queue
--             approved  an admin kept it, or it was moved from the old public bucket
--             removed   an admin removed it (removal_reason is what the member sees)
--             replaced  the member uploaded a newer one
-- ---------------------------------------------------------------------------

create table if not exists public.member_photos (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  path text not null,
  thumb_path text,
  width integer,
  height integer,
  content_type text not null default 'image/jpeg',
  bytes integer,
  resized boolean not null default false,
  source text not null default 'new',
  face_check text not null default 'skipped',
  status text not null default 'pending',
  previous_photo_id uuid references public.member_photos (id) on delete set null,
  legacy_url text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  removal_reason text,
  removed_at timestamptz,
  replaced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.member_photos drop constraint if exists member_photos_source_check;
alter table public.member_photos add constraint member_photos_source_check check (source in ('new', 'changed', 'migrated'));
alter table public.member_photos drop constraint if exists member_photos_face_check_check;
alter table public.member_photos add constraint member_photos_face_check_check check (face_check in ('found', 'none', 'skipped'));
alter table public.member_photos drop constraint if exists member_photos_status_check;
alter table public.member_photos add constraint member_photos_status_check check (status in ('pending', 'approved', 'removed', 'replaced'));
alter table public.member_photos drop constraint if exists member_photos_removal_reason_check;
alter table public.member_photos add constraint member_photos_removal_reason_check
  check (removal_reason is null or removal_reason in ('not_clear', 'not_member', 'not_suitable'));
alter table public.member_photos drop constraint if exists member_photos_removed_has_reason;
alter table public.member_photos add constraint member_photos_removed_has_reason
  check (status <> 'removed' or (removal_reason is not null and removed_at is not null));

create index if not exists member_photos_member_idx on public.member_photos (member_id, created_at desc);
create index if not exists member_photos_pending_idx on public.member_photos (created_at) where status = 'pending';
create unique index if not exists member_photos_path_key on public.member_photos (path);

drop trigger if exists member_photos_set_updated_at on public.member_photos;
create trigger member_photos_set_updated_at before update on public.member_photos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. members: the current photo and the chat safety note (both server only)
-- ---------------------------------------------------------------------------

alter table public.members add column if not exists photo_id uuid;
alter table public.members add column if not exists chat_safety_seen_at timestamptz;

alter table public.members drop constraint if exists members_photo_id_fkey;
alter table public.members add constraint members_photo_id_fkey
  foreign key (photo_id) references public.member_photos (id) on delete set null;

-- A member may still change their own profile fields (stage 1's column
-- grants), but no longer avatar_url: photos are written by the server only
-- (the old public URLs stay in the column, unread, until a later clean-up).
revoke update (avatar_url) on public.members from authenticated;

-- ---------------------------------------------------------------------------
-- 3. plans (Open Invite) and plan_members (who is going)
--
--    places counts the host when host_going (the host then has a
--    plan_members row with role 'host'). "Full" is going = places.
--    "Finished" is not stored: it is starts_at in the past.
-- ---------------------------------------------------------------------------

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.members (id) on delete cascade,
  title text not null,
  type text not null,
  starts_at timestamptz not null,
  place text not null,
  note text,
  places integer not null,
  host_going boolean not null default true,
  price_pence integer,
  face_value_confirmed boolean not null default false,
  status text not null default 'scheduled',
  cancelled_at timestamptz,
  changed_at timestamptz,
  removed_at timestamptz,
  removed_by uuid,
  removed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.plans drop constraint if exists plans_title_check;
alter table public.plans add constraint plans_title_check check (char_length(btrim(title)) between 1 and 50);
alter table public.plans drop constraint if exists plans_type_check;
alter table public.plans add constraint plans_type_check
  check (type in ('Sport', 'Food and drink', 'Wellness', 'Culture', 'Something else'));
alter table public.plans drop constraint if exists plans_place_check;
alter table public.plans add constraint plans_place_check check (char_length(btrim(place)) between 1 and 120);
alter table public.plans drop constraint if exists plans_note_check;
alter table public.plans add constraint plans_note_check check (note is null or char_length(note) <= 280);
alter table public.plans drop constraint if exists plans_places_check;
alter table public.plans add constraint plans_places_check check (places between 2 and 12);
alter table public.plans drop constraint if exists plans_price_check;
alter table public.plans add constraint plans_price_check check (price_pence is null or price_pence between 100 and 20000);
alter table public.plans drop constraint if exists plans_status_check;
alter table public.plans add constraint plans_status_check check (status in ('scheduled', 'cancelled'));
alter table public.plans drop constraint if exists plans_cancelled_check;
alter table public.plans add constraint plans_cancelled_check check ((status = 'cancelled') = (cancelled_at is not null));

create index if not exists plans_starts_idx on public.plans (starts_at) where status = 'scheduled' and removed_at is null;
create index if not exists plans_host_idx on public.plans (host_id, starts_at desc);

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

create table if not exists public.plan_members (
  plan_id uuid not null references public.plans (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  role text not null default 'guest',
  status text not null default 'going',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  reminder_24h_sent_at timestamptz,
  reminder_2h_sent_at timestamptz,
  reminder_24h_text_at timestamptz,
  reminder_2h_text_at timestamptz,
  primary key (plan_id, member_id)
);

alter table public.plan_members drop constraint if exists plan_members_role_check;
alter table public.plan_members add constraint plan_members_role_check check (role in ('host', 'guest'));
alter table public.plan_members drop constraint if exists plan_members_status_check;
alter table public.plan_members add constraint plan_members_status_check check (status in ('going', 'left'));

create index if not exists plan_members_member_idx on public.plan_members (member_id, status);
create index if not exists plan_members_going_idx on public.plan_members (plan_id) where status = 'going';

-- ---------------------------------------------------------------------------
-- 4. chats, chat_members (membership, read marker, mute) and messages
--
--    A chat always belongs to a plan: one plan chat per plan (the host and
--    everyone going), and one question chat per plan and asker (the asker
--    and the host). "Closed" is not stored: a plan chat closes when the plan
--    is cancelled or 24 hours after it starts; a question when the plan is
--    cancelled or starts.
-- ---------------------------------------------------------------------------

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  kind text not null,
  asker_id uuid references public.members (id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.chats drop constraint if exists chats_kind_check;
alter table public.chats add constraint chats_kind_check check (kind in ('plan', 'question'));
alter table public.chats drop constraint if exists chats_asker_check;
alter table public.chats add constraint chats_asker_check check ((kind = 'plan') = (asker_id is null));

create unique index if not exists chats_one_plan_chat on public.chats (plan_id) where kind = 'plan';
create unique index if not exists chats_one_question on public.chats (plan_id, asker_id) where kind = 'question';

create table if not exists public.chat_members (
  chat_id uuid not null references public.chats (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  left_reason text,
  last_read_at timestamptz,
  muted boolean not null default false,
  nudged_at timestamptz,
  primary key (chat_id, member_id)
);

alter table public.chat_members drop constraint if exists chat_members_role_check;
alter table public.chat_members add constraint chat_members_role_check check (role in ('host', 'member'));
alter table public.chat_members drop constraint if exists chat_members_left_reason_check;
alter table public.chat_members add constraint chat_members_left_reason_check
  check (left_reason is null or left_reason in ('withdrew', 'left_chat'));

create index if not exists chat_members_member_idx on public.chat_members (member_id) where left_at is null;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  kind text not null default 'text',
  sender_id uuid references public.members (id) on delete set null,
  body text,
  system_event text,
  about_member_id uuid references public.members (id) on delete set null,
  client_id text,
  removed_at timestamptz,
  removed_by uuid,
  removed_reason text,
  created_at timestamptz not null default now()
);

alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text', 'system'));
alter table public.messages drop constraint if exists messages_text_check;
alter table public.messages add constraint messages_text_check
  check (kind <> 'text' or (body is not null and char_length(body) between 1 and 500));
alter table public.messages drop constraint if exists messages_system_check;
alter table public.messages add constraint messages_system_check
  check (kind <> 'system' or system_event in ('opened', 'joined', 'paid', 'cancelled', 'closed'));
alter table public.messages drop constraint if exists messages_client_id_check;
alter table public.messages add constraint messages_client_id_check check (client_id is null or char_length(client_id) between 1 and 64);

create index if not exists messages_chat_idx on public.messages (chat_id, created_at);
create index if not exists messages_sender_recent_idx on public.messages (sender_id, created_at desc) where kind = 'text';
create unique index if not exists messages_client_key on public.messages (chat_id, sender_id, client_id) where client_id is not null;

-- The inbox orders chats by their last message.
create or replace function public.messages_touch_chat()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.chats
     set last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at)
   where id = new.chat_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_chat on public.messages;
create trigger messages_touch_chat after insert on public.messages
  for each row execute function public.messages_touch_chat();

-- ---------------------------------------------------------------------------
-- 5. updates: the Updates tab (Open Invite only; club events never write
--    here). One row per event and recipient; dedupe_key makes a repeated
--    event a no-op. The feed shows 30 days.
-- ---------------------------------------------------------------------------

create table if not exists public.updates (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null,
  plan_id uuid not null references public.plans (id) on delete cascade,
  actor_id uuid references public.members (id) on delete set null,
  role text not null,
  reminder_hours integer,
  previous_starts_at timestamptz,
  refund_pence integer,
  going_count integer,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.updates drop constraint if exists updates_kind_check;
alter table public.updates add constraint updates_kind_check
  check (kind in ('joined', 'left', 'full', 'place_opened', 'changed', 'cancelled', 'reminder'));
alter table public.updates drop constraint if exists updates_role_check;
alter table public.updates add constraint updates_role_check check (role in ('host', 'going'));
alter table public.updates drop constraint if exists updates_reminder_hours_check;
alter table public.updates add constraint updates_reminder_hours_check check (reminder_hours is null or reminder_hours in (24, 2));

create unique index if not exists updates_dedupe_key on public.updates (dedupe_key) where dedupe_key is not null;
create index if not exists updates_member_idx on public.updates (member_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. blocks (decision 6 A): the blocker no longer sees the other's messages
--    and the other cannot start a question or join the blocker's plans; the
--    other is not told (they cannot read this row).
-- ---------------------------------------------------------------------------

create table if not exists public.blocks (
  blocker_id uuid not null references public.members (id) on delete cascade,
  blocked_id uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

alter table public.blocks drop constraint if exists blocks_not_self;
alter table public.blocks add constraint blocks_not_self check (blocker_id <> blocked_id);

create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

-- ---------------------------------------------------------------------------
-- 7. reports: a plan, a member, a message or a photo. Every report emails the
--    club (decision 4 A). member_id is who it is about (a message's sender, a
--    plan's host); photo_id the photo as it was when reported.
-- ---------------------------------------------------------------------------

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.members (id) on delete set null,
  kind text not null,
  reason text not null,
  member_id uuid references public.members (id) on delete set null,
  plan_id uuid references public.plans (id) on delete set null,
  chat_id uuid references public.chats (id) on delete set null,
  message_id uuid references public.messages (id) on delete set null,
  photo_id uuid references public.member_photos (id) on delete set null,
  status text not null default 'open',
  acted_at timestamptz,
  acted_by uuid,
  action_note text,
  nudged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reports drop constraint if exists reports_kind_check;
alter table public.reports add constraint reports_kind_check check (kind in ('message', 'member', 'photo', 'plan'));
alter table public.reports drop constraint if exists reports_reason_check;
alter table public.reports add constraint reports_reason_check check (reason in (
  -- message and member (messages spec 3.6)
  'rude', 'harassment', 'spam', 'pay_outside', 'threats', 'other', 'photo_not_them_or_unsuitable',
  -- photo
  'not_them', 'not_suitable',
  -- plan (Open Invite spec 3.5)
  'payment_outside', 'price_above_cost', 'unkind', 'unsafe', 'not_real'
));
alter table public.reports drop constraint if exists reports_status_check;
alter table public.reports add constraint reports_status_check check (status in (
  'open', 'dismissed', 'message_removed', 'plan_removed', 'photo_removed', 'warned', 'suspended'
));
alter table public.reports drop constraint if exists reports_target_check;
alter table public.reports add constraint reports_target_check check (
  (kind = 'message' and message_id is not null and chat_id is not null)
  or (kind = 'member' and member_id is not null)
  or (kind = 'photo' and member_id is not null)
  or (kind = 'plan' and plan_id is not null)
);

create index if not exists reports_status_idx on public.reports (status, created_at);
create index if not exists reports_reporter_idx on public.reports (reporter_id, created_at desc);

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at before update on public.reports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. notification_preferences: five topics times three channels
--    (notifications spec 3.1). No row means the defaults: every topic on,
--    push on, email on, text off. Push is stored and never sent in stage 2.
-- ---------------------------------------------------------------------------

create table if not exists public.notification_preferences (
  member_id uuid primary key references public.members (id) on delete cascade,
  topic_host boolean not null default true,
  topic_in boolean not null default true,
  topic_reminder24 boolean not null default true,
  topic_reminder2 boolean not null default true,
  topic_club_changes boolean not null default true,
  channel_push boolean not null default true,
  channel_email boolean not null default true,
  channel_text boolean not null default false,
  text_check text not null default 'none',
  text_check_number text,
  text_check_sent_at timestamptz,
  push_permission text not null default 'not_asked',
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences drop constraint if exists notification_preferences_text_check_check;
alter table public.notification_preferences add constraint notification_preferences_text_check_check
  check (text_check in ('none', 'sent', 'verified'));
alter table public.notification_preferences drop constraint if exists notification_preferences_push_permission_check;
alter table public.notification_preferences add constraint notification_preferences_push_permission_check
  check (push_permission in ('granted', 'denied', 'not_asked', 'unavailable'));

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. stage 1 tables: message_log learns the new things a send is about, and
--    club-event bookings get their own claim for reminder texts (a text can
--    be held for quiet hours while the email goes on time).
-- ---------------------------------------------------------------------------

alter table public.message_log add column if not exists plan_id uuid;
alter table public.message_log add column if not exists chat_id uuid;
alter table public.message_log add column if not exists report_id uuid;
alter table public.message_log add column if not exists photo_id uuid;

alter table public.message_log drop constraint if exists message_log_plan_id_fkey;
alter table public.message_log add constraint message_log_plan_id_fkey foreign key (plan_id) references public.plans (id) on delete set null;
alter table public.message_log drop constraint if exists message_log_chat_id_fkey;
alter table public.message_log add constraint message_log_chat_id_fkey foreign key (chat_id) references public.chats (id) on delete set null;
alter table public.message_log drop constraint if exists message_log_report_id_fkey;
alter table public.message_log add constraint message_log_report_id_fkey foreign key (report_id) references public.reports (id) on delete set null;
alter table public.message_log drop constraint if exists message_log_photo_id_fkey;
alter table public.message_log add constraint message_log_photo_id_fkey foreign key (photo_id) references public.member_photos (id) on delete set null;

create index if not exists message_log_plan_idx on public.message_log (plan_id) where plan_id is not null;

alter table public.bookings add column if not exists reminder_24h_text_at timestamptz;
alter table public.bookings add column if not exists reminder_2h_text_at timestamptz;

-- ---------------------------------------------------------------------------
-- 10. RLS, policies and grants on the new tables
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['member_photos', 'plans', 'plan_members', 'chats', 'chat_members', 'messages', 'updates', 'blocks', 'reports', 'notification_preferences'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

drop policy if exists "Members read own photos" on public.member_photos;
create policy "Members read own photos" on public.member_photos
  for select to authenticated
  using (member_id = auth.uid());

drop policy if exists "Admins read member photos" on public.member_photos;
create policy "Admins read member photos" on public.member_photos
  for select to authenticated
  using (exists (select 1 from public.admin_users where id = auth.uid()));

drop policy if exists "Members read own plans" on public.plans;
create policy "Members read own plans" on public.plans
  for select to authenticated
  using (
    host_id = auth.uid()
    or exists (
      select 1 from public.plan_members pm
       where pm.plan_id = plans.id and pm.member_id = auth.uid() and pm.status = 'going'
    )
  );

drop policy if exists "Members read own plan places" on public.plan_members;
create policy "Members read own plan places" on public.plan_members
  for select to authenticated
  using (member_id = auth.uid());

drop policy if exists "Members read own chat rows" on public.chat_members;
create policy "Members read own chat rows" on public.chat_members
  for select to authenticated
  using (member_id = auth.uid());

drop policy if exists "Members read chats they are in" on public.chats;
create policy "Members read chats they are in" on public.chats
  for select to authenticated
  using (exists (
    select 1 from public.chat_members cm
     where cm.chat_id = chats.id and cm.member_id = auth.uid() and cm.left_at is null
  ));

drop policy if exists "Members read messages in their chats" on public.messages;
create policy "Members read messages in their chats" on public.messages
  for select to authenticated
  using (
    removed_at is null
    and exists (
      select 1 from public.chat_members cm
       where cm.chat_id = messages.chat_id and cm.member_id = auth.uid() and cm.left_at is null
    )
    and (
      sender_id is null
      or not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = messages.sender_id)
    )
  );

drop policy if exists "Members read own updates" on public.updates;
create policy "Members read own updates" on public.updates
  for select to authenticated
  using (member_id = auth.uid());

drop policy if exists "Members read own blocks" on public.blocks;
create policy "Members read own blocks" on public.blocks
  for select to authenticated
  using (blocker_id = auth.uid());

drop policy if exists "Members read own reports" on public.reports;
create policy "Members read own reports" on public.reports
  for select to authenticated
  using (reporter_id = auth.uid());

drop policy if exists "Admins read reports" on public.reports;
create policy "Admins read reports" on public.reports
  for select to authenticated
  using (exists (select 1 from public.admin_users where id = auth.uid()));

drop policy if exists "Members read own notification preferences" on public.notification_preferences;
create policy "Members read own notification preferences" on public.notification_preferences
  for select to authenticated
  using (member_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 11. Functions. All security definer, service role only. Each takes the
--     plan row lock first, so capacity, joins, edits and cancels for one plan
--     happen one at a time.
-- ---------------------------------------------------------------------------

-- Is this member allowed to take part (the same rule as book_event: active,
-- or ending or in payment grace with the date still ahead)?
create or replace function public.member_can_take_part(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.members m
     where m.id = p_member
       and m.membership_status = 'active'
       and m.deleted_at is null
       and (m.cancel_at is null or m.cancel_at > now())
       and (m.grace_until is null or m.grace_until > now())
  );
$$;

-- Is there a block between two members, either way?
create or replace function public.blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.blocks
     where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

-- Post a free plan: the plan, the host's place when going, the plan chat
-- with the host in it, and the "opened" line. The server checks the form
-- first; the table checks are the last word.
-- Returns {status: 'posted', plan_id, chat_id} | {status: 'inactive'} | {status: 'past'}.
create or replace function public.post_plan(
  p_host uuid,
  p_title text,
  p_type text,
  p_starts_at timestamptz,
  p_place text,
  p_note text,
  p_places integer,
  p_host_going boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan uuid;
  v_chat uuid;
begin
  if not public.member_can_take_part(p_host) then
    return jsonb_build_object('status', 'inactive');
  end if;
  if p_starts_at <= now() then
    return jsonb_build_object('status', 'past');
  end if;

  insert into public.plans (host_id, title, type, starts_at, place, note, places, host_going)
  values (p_host, btrim(p_title), p_type, p_starts_at, btrim(p_place), nullif(btrim(coalesce(p_note, '')), ''), p_places, coalesce(p_host_going, true))
  returning id into v_plan;

  if coalesce(p_host_going, true) then
    insert into public.plan_members (plan_id, member_id, role, status) values (v_plan, p_host, 'host', 'going');
  end if;

  insert into public.chats (plan_id, kind) values (v_plan, 'plan') returning id into v_chat;
  insert into public.chat_members (chat_id, member_id, role) values (v_chat, p_host, 'host');
  insert into public.messages (chat_id, kind, system_event, about_member_id) values (v_chat, 'system', 'opened', p_host);

  return jsonb_build_object('status', 'posted', 'plan_id', v_plan, 'chat_id', v_chat);
end;
$$;

-- "I'm in": a place on a free plan, under the plan's row lock, so the last
-- place goes to one member only. Also puts the member in the plan chat and
-- writes "{name} is in".
-- Returns {status, going, places, full, chat_id}; status one of
--   joined | already_in | full | started | cancelled | host | paid | blocked | inactive | not_found
create or replace function public.join_plan(p_member uuid, p_plan uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan record;
  v_going integer;
  v_existing text;
  v_chat uuid;
begin
  select id, host_id, starts_at, places, status, removed_at, price_pence
    into v_plan
    from public.plans
   where id = p_plan
     for update;

  if not found or v_plan.removed_at is not null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not public.member_can_take_part(p_member) then
    return jsonb_build_object('status', 'inactive');
  end if;
  if v_plan.host_id = p_member then
    return jsonb_build_object('status', 'host');
  end if;
  if v_plan.status <> 'scheduled' then
    return jsonb_build_object('status', 'cancelled');
  end if;
  if v_plan.starts_at <= now() then
    return jsonb_build_object('status', 'started');
  end if;
  -- Paid plans are stage 3: nothing in stage 2 takes money.
  if v_plan.price_pence is not null then
    return jsonb_build_object('status', 'paid');
  end if;
  if public.blocked_between(p_member, v_plan.host_id) then
    return jsonb_build_object('status', 'blocked');
  end if;

  select count(*) into v_going from public.plan_members where plan_id = p_plan and status = 'going';
  select status into v_existing from public.plan_members where plan_id = p_plan and member_id = p_member;
  select id into v_chat from public.chats where plan_id = p_plan and kind = 'plan';

  if v_existing = 'going' then
    return jsonb_build_object('status', 'already_in', 'going', v_going, 'places', v_plan.places, 'full', v_going >= v_plan.places, 'chat_id', v_chat);
  end if;
  if v_going >= v_plan.places then
    return jsonb_build_object('status', 'full', 'going', v_going, 'places', v_plan.places, 'full', true);
  end if;

  insert into public.plan_members (plan_id, member_id, role, status, joined_at, left_at,
                                   reminder_24h_sent_at, reminder_2h_sent_at, reminder_24h_text_at, reminder_2h_text_at)
  values (p_plan, p_member, 'guest', 'going', now(), null, null, null, null, null)
  on conflict (plan_id, member_id) do update
     set status = 'going', joined_at = now(), left_at = null,
         reminder_24h_sent_at = null, reminder_2h_sent_at = null, reminder_24h_text_at = null, reminder_2h_text_at = null;
  v_going := v_going + 1;

  if v_chat is not null then
    insert into public.chat_members (chat_id, member_id, role, joined_at, left_at, left_reason)
    values (v_chat, p_member, 'member', now(), null, null)
    on conflict (chat_id, member_id) do update set left_at = null, left_reason = null, joined_at = now();
    insert into public.messages (chat_id, kind, system_event, about_member_id) values (v_chat, 'system', 'joined', p_member);
  end if;

  return jsonb_build_object('status', 'joined', 'going', v_going, 'places', v_plan.places, 'full', v_going >= v_plan.places, 'chat_id', v_chat);
end;
$$;

-- Withdraw: a free plan is open to leave until it starts (Open Invite
-- decision). Takes the member out of the plan chat too.
-- Returns {status, was_full, going}; status one of left | not_in | started | host | not_found
create or replace function public.leave_plan(p_member uuid, p_plan uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan record;
  v_going integer;
begin
  select id, host_id, starts_at, places, status, removed_at
    into v_plan
    from public.plans
   where id = p_plan
     for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_plan.host_id = p_member then
    return jsonb_build_object('status', 'host');
  end if;
  if not exists (select 1 from public.plan_members where plan_id = p_plan and member_id = p_member and status = 'going') then
    return jsonb_build_object('status', 'not_in');
  end if;
  if v_plan.starts_at <= now() then
    return jsonb_build_object('status', 'started');
  end if;

  select count(*) into v_going from public.plan_members where plan_id = p_plan and status = 'going';
  update public.plan_members set status = 'left', left_at = now() where plan_id = p_plan and member_id = p_member;
  update public.chat_members cm
     set left_at = now(), left_reason = 'withdrew'
    from public.chats c
   where c.id = cm.chat_id and c.plan_id = p_plan and c.kind = 'plan' and cm.member_id = p_member and cm.left_at is null;

  return jsonb_build_object('status', 'left', 'was_full', v_going >= v_plan.places, 'going', v_going - 1);
end;
$$;

-- Host edit (the post form again). The server checks the form first.
-- Returns {status, time_changed, place_changed, previous_starts_at, previous_place, going}; status one of
--   saved | not_found | not_host | cancelled | started | past | too_few_places | full
create or replace function public.edit_plan(
  p_host uuid,
  p_plan uuid,
  p_title text,
  p_type text,
  p_starts_at timestamptz,
  p_place text,
  p_note text,
  p_places integer,
  p_host_going boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan record;
  v_guests integer;
  v_need integer;
  v_time_changed boolean;
  v_place_changed boolean;
begin
  select * into v_plan from public.plans where id = p_plan for update;
  if not found or v_plan.removed_at is not null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_plan.host_id <> p_host then
    return jsonb_build_object('status', 'not_host');
  end if;
  if v_plan.status <> 'scheduled' then
    return jsonb_build_object('status', 'cancelled');
  end if;
  if v_plan.starts_at <= now() then
    return jsonb_build_object('status', 'started');
  end if;
  if p_starts_at <= now() then
    return jsonb_build_object('status', 'past');
  end if;

  select count(*) into v_guests from public.plan_members where plan_id = p_plan and status = 'going' and role = 'guest';
  v_need := v_guests + case when coalesce(p_host_going, true) then 1 else 0 end;
  if v_need > p_places then
    -- The guests fit but the host, turning "I'm going too" on, does not: "full". Otherwise there are fewer
    -- places than people going: "too_few_places" (nobody is ever taken off a plan by an edit).
    if coalesce(p_host_going, true) and not v_plan.host_going and v_guests <= p_places then
      return jsonb_build_object('status', 'full', 'going', v_guests);
    end if;
    return jsonb_build_object('status', 'too_few_places', 'going', v_need);
  end if;

  v_time_changed := p_starts_at <> v_plan.starts_at;
  v_place_changed := btrim(p_place) <> v_plan.place;

  update public.plans
     set title = btrim(p_title),
         type = p_type,
         starts_at = p_starts_at,
         place = btrim(p_place),
         note = nullif(btrim(coalesce(p_note, '')), ''),
         places = p_places,
         host_going = coalesce(p_host_going, true),
         changed_at = case when v_time_changed or v_place_changed then now() else changed_at end
   where id = p_plan;

  if coalesce(p_host_going, true) then
    insert into public.plan_members (plan_id, member_id, role, status) values (p_plan, p_host, 'host', 'going')
    on conflict (plan_id, member_id) do update set status = 'going', left_at = null;
  else
    update public.plan_members set status = 'left', left_at = now() where plan_id = p_plan and member_id = p_host and status = 'going';
  end if;

  -- A moved plan: reminders follow the new time (spec 3.6), so their claims start again. The dedupe keys in
  -- message_log carry the start time, so a reminder already sent for the old time does not block the new one.
  if v_time_changed then
    update public.plan_members
       set reminder_24h_sent_at = null, reminder_2h_sent_at = null, reminder_24h_text_at = null, reminder_2h_text_at = null
     where plan_id = p_plan;
  end if;

  return jsonb_build_object(
    'status', 'saved',
    'time_changed', v_time_changed,
    'place_changed', v_place_changed,
    'previous_starts_at', v_plan.starts_at,
    'previous_place', v_plan.place,
    'going', v_need
  );
end;
$$;

-- Host cancel (or the club removing a plan: p_removed_by set). Closes the
-- plan chat with a "cancelled" line.
-- Returns {status}; status one of cancelled | not_found | not_host | already_cancelled | started
create or replace function public.cancel_plan(p_host uuid, p_plan uuid, p_removed_by uuid default null, p_removed_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan record;
  v_chat uuid;
begin
  select * into v_plan from public.plans where id = p_plan for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if p_removed_by is null and v_plan.host_id <> p_host then
    return jsonb_build_object('status', 'not_host');
  end if;
  if p_removed_by is null and v_plan.status = 'cancelled' then
    return jsonb_build_object('status', 'already_cancelled');
  end if;
  if p_removed_by is null and v_plan.starts_at <= now() then
    return jsonb_build_object('status', 'started');
  end if;

  update public.plans
     set status = 'cancelled',
         cancelled_at = coalesce(cancelled_at, now()),
         removed_at = case when p_removed_by is not null then now() else removed_at end,
         removed_by = coalesce(p_removed_by, removed_by),
         removed_reason = coalesce(p_removed_reason, removed_reason)
   where id = p_plan;

  if v_plan.status <> 'cancelled' then
    select id into v_chat from public.chats where plan_id = p_plan and kind = 'plan';
    if v_chat is not null then
      insert into public.messages (chat_id, kind, system_event, about_member_id)
      values (v_chat, 'system', 'cancelled', case when p_removed_by is null then v_plan.host_id else null end);
    end if;
  end if;

  return jsonb_build_object('status', 'cancelled', 'was_cancelled', v_plan.status = 'cancelled');
end;
$$;

-- A question to the host, made on the first send (types: askThreadId exists
-- before the chat does). One chat per plan and asker.
-- Returns {status, chat_id}; status one of ok | not_found | host | closed | blocked | inactive
create or replace function public.open_question(p_member uuid, p_plan uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan record;
  v_chat uuid;
begin
  select id, host_id, starts_at, status, removed_at into v_plan from public.plans where id = p_plan for update;
  if not found or v_plan.removed_at is not null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_plan.host_id = p_member then
    return jsonb_build_object('status', 'host');
  end if;
  select id into v_chat from public.chats where plan_id = p_plan and kind = 'question' and asker_id = p_member;
  if v_chat is not null then
    return jsonb_build_object('status', 'ok', 'chat_id', v_chat, 'created', false);
  end if;
  if not public.member_can_take_part(p_member) then
    return jsonb_build_object('status', 'inactive');
  end if;
  if v_plan.status <> 'scheduled' or v_plan.starts_at <= now() then
    return jsonb_build_object('status', 'closed');
  end if;
  if public.blocked_between(p_member, v_plan.host_id) then
    return jsonb_build_object('status', 'blocked');
  end if;

  insert into public.chats (plan_id, kind, asker_id) values (p_plan, 'question', p_member) returning id into v_chat;
  insert into public.chat_members (chat_id, member_id, role) values (v_chat, v_plan.host_id, 'host'), (v_chat, p_member, 'member');
  insert into public.messages (chat_id, kind, system_event, about_member_id) values (v_chat, 'system', 'opened', p_member);
  return jsonb_build_object('status', 'ok', 'chat_id', v_chat, 'created', true);
end;
$$;

-- Mark a chat read, on the database's clock (so a message that lands while
-- the page is open is never marked read by a slower app clock).
create or replace function public.mark_chat_read(p_member uuid, p_chat uuid)
returns timestamptz
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.chat_members set last_read_at = now()
   where chat_id = p_chat and member_id = p_member
  returning last_read_at;
$$;

-- Unread messages per chat for one member: text messages from others since
-- the read marker, not removed, not from a member they blocked. Only chats
-- the member is still in.
create or replace function public.chat_unread(p_member uuid)
returns table (chat_id uuid, unread integer, first_unread_id uuid, first_unread_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cm.chat_id,
         count(m.id)::integer as unread,
         (array_agg(m.id order by m.created_at))[1] as first_unread_id,
         min(m.created_at) as first_unread_at
    from public.chat_members cm
    join public.messages m on m.chat_id = cm.chat_id
   where cm.member_id = p_member
     and cm.left_at is null
     and m.kind = 'text'
     and m.removed_at is null
     and m.sender_id is distinct from p_member
     and m.created_at > coalesce(cm.last_read_at, '-infinity'::timestamptz)
     and not exists (select 1 from public.blocks b where b.blocker_id = p_member and b.blocked_id = m.sender_id)
   group by cm.chat_id;
$$;

-- The number on the messages icon (messages decision 8 A): unread chats plus
-- unread updates (30 days), as {chats, updates}.
create or replace function public.unread_counts(p_member uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'chats', (select count(*) from public.chat_unread(p_member) where unread > 0),
    'updates', (select count(*) from public.updates u
                 where u.member_id = p_member and u.read_at is null and u.created_at > now() - interval '30 days')
  );
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.member_can_take_part(uuid)',
    'public.blocked_between(uuid, uuid)',
    'public.post_plan(uuid, text, text, timestamptz, text, text, integer, boolean)',
    'public.join_plan(uuid, uuid)',
    'public.leave_plan(uuid, uuid)',
    'public.edit_plan(uuid, uuid, text, text, timestamptz, text, text, integer, boolean)',
    'public.cancel_plan(uuid, uuid, uuid, text)',
    'public.open_question(uuid, uuid)',
    'public.mark_chat_read(uuid, uuid)',
    'public.chat_unread(uuid)',
    'public.unread_counts(uuid)',
    'public.messages_touch_chat()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. The private bucket for member photos. Members never read, list or
--     write it directly: the restrictive policy below is ANDed with every
--     other storage policy, so no permissive policy (today's or a future
--     one) can open it to anon or authenticated. The server uploads with the
--     service role and hands out short-lived signed URLs.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('member-photos', 'member-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Member photos are server only" on storage.objects;
create policy "Member photos are server only" on storage.objects
  as restrictive
  for all
  to anon, authenticated
  using (bucket_id <> 'member-photos')
  with check (bucket_id <> 'member-photos');
