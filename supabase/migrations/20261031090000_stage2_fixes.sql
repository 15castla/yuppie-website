-- Members backend, stage 2 fixes (31 Oct 2026, after the three independent reviews QB1, QB2, QB3).
--
-- Additive and re-runnable, on top of 20261030090000_open_invite_messages.sql: columns are "add column if not
-- exists", functions are "create or replace", grants are revoked and given again. Nothing here touches a stage 1
-- table. Undo: release/undo-phase-b.sql (it drops every stage 2 table and function, these included).
--
--   1. reports and member_photos learn a claim, so two admins acting at once never both act (QB3-01);
--   2. members read only the report and plan columns that are theirs to read (QB3-08): not a report's status,
--      action note or admin, not who removed a plan or why;
--   3. a plan is joinable, askable and visible by link only while its host may take part (QB1-05);
--   4. cancel_plan stamps the cancel after it holds the plan's lock, and the club can cancel a plan whose host was
--      paused or ended (QB3-06, QB3-14);
--   5. Updates about a plan are written only while it is still on (QB3-14);
--   6. the chat rate limit is checked and the message stored under one lock per sender (QB3-09).

-- ---------------------------------------------------------------------------
-- 1. Claims
-- ---------------------------------------------------------------------------

alter table public.reports add column if not exists claim_token uuid;
alter table public.reports add column if not exists claimed_by uuid;
alter table public.reports add column if not exists claimed_at timestamptz;

alter table public.member_photos add column if not exists review_claim uuid;
alter table public.member_photos add column if not exists review_claimed_at timestamptz;

-- Claim an open report for one admin action. One conditional update: of two admins at once, one gets it.
-- Returns {status: claimed | taken (someone else is acting on it) | closed (dealt with) | not_found}.
create or replace function public.claim_report(p_report uuid, p_token uuid, p_admin uuid, p_stale_seconds integer default 120)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_status text;
begin
  update public.reports
     set claim_token = p_token, claimed_by = p_admin, claimed_at = now()
   where id = p_report
     and status = 'open'
     and (claim_token is null or claimed_at < now() - make_interval(secs => p_stale_seconds))
  returning id into v_id;
  if v_id is not null then
    return jsonb_build_object('status', 'claimed');
  end if;
  select status into v_status from public.reports where id = p_report;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_status <> 'open' then
    return jsonb_build_object('status', 'closed', 'report_status', v_status);
  end if;
  return jsonb_build_object('status', 'taken');
end;
$$;

-- Claim a photo for Keep or Remove, when its status is one of p_statuses. A claim is held p_hold_seconds (the
-- action does not give it back when it succeeds), so a second decision sent at the same moment changes nothing.
-- Returns {status: claimed | taken | state (its status is not one of p_statuses) | not_found, photo_status}.
create or replace function public.claim_photo_review(p_photo uuid, p_token uuid, p_statuses text[], p_hold_seconds integer default 15)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  update public.member_photos
     set review_claim = p_token, review_claimed_at = now()
   where id = p_photo
     and status = any (p_statuses)
     and (review_claim is null or review_claimed_at < now() - make_interval(secs => p_hold_seconds))
  returning status into v_status;
  if v_status is not null then
    return jsonb_build_object('status', 'claimed', 'photo_status', v_status);
  end if;
  select status into v_status from public.member_photos where id = p_photo;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not (v_status = any (p_statuses)) then
    return jsonb_build_object('status', 'state', 'photo_status', v_status);
  end if;
  return jsonb_build_object('status', 'taken', 'photo_status', v_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. What members may read (QB3-08). The stage 2 migration gave members SELECT on whole tables; for reports and
--    plans it is now these columns only. A reporter sees what they reported, never what was done about it; a
--    member going to a plan never sees who removed it or why. The server reads everything with the service role.
-- ---------------------------------------------------------------------------

revoke select on public.reports from authenticated;
revoke select (status, acted_at, acted_by, action_note, nudged_at, updated_at, claim_token, claimed_by, claimed_at) on public.reports from authenticated;
grant select (id, reporter_id, kind, reason, member_id, plan_id, chat_id, message_id, photo_id, created_at) on public.reports to authenticated;

revoke select on public.plans from authenticated;
revoke select (removed_by, removed_reason) on public.plans from authenticated;
grant select (id, host_id, title, type, starts_at, place, note, places, host_going, price_pence, face_value_confirmed,
              status, cancelled_at, changed_at, removed_at, created_at, updated_at) on public.plans to authenticated;

-- ---------------------------------------------------------------------------
-- 3. A plan whose host is paused or ended (QB1-05): not joinable, not askable, not visible by link to anyone but
--    its host and the people going (the feed already leaves it out). member_can_take_part is the book_event rule.
-- ---------------------------------------------------------------------------

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
  -- The host is paused or ended: the plan is not there for anyone new (the feed rule, QB1-05).
  if not public.member_can_take_part(v_plan.host_id) then
    return jsonb_build_object('status', 'not_found');
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
  if not public.member_can_take_part(v_plan.host_id) then
    return jsonb_build_object('status', 'not_found');
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

create or replace function public.plan_visible_to_me(p_plan uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.plans p
     where p.id = p_plan
       and (
         p.host_id = auth.uid()
         or exists (select 1 from public.plan_members pm where pm.plan_id = p.id and pm.member_id = auth.uid() and pm.status = 'going')
         or (
           p.removed_at is null
           and p.price_pence is null
           and auth.uid() is not null
           and public.member_can_take_part(p.host_id)
           and not public.blocked_between(auth.uid(), p.host_id)
         )
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Cancels. cancel_plan is the stage 2 function with one change: cancelled_at is the clock after the plan's lock
--    is held (not the start of the transaction), so a join or an Update that got the lock first is always stamped
--    before the cancel (QB3-14). club_cancel_plan is the club's cancel of a plan whose host was paused or ended
--    (QB3-06): no host check, the "cancelled" line names nobody, the reason is kept (members cannot read it).
-- ---------------------------------------------------------------------------

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
         cancelled_at = coalesce(cancelled_at, clock_timestamp()),
         removed_at = case when p_removed_by is not null then clock_timestamp() else removed_at end,
         removed_by = coalesce(p_removed_by, removed_by),
         removed_reason = coalesce(p_removed_reason, removed_reason)
   where id = p_plan;

  if v_plan.status <> 'cancelled' then
    select id into v_chat from public.chats where plan_id = p_plan and kind = 'plan';
    if v_chat is not null then
      insert into public.messages (chat_id, kind, system_event, about_member_id, created_at)
      values (v_chat, 'system', 'cancelled', case when p_removed_by is null then v_plan.host_id else null end, clock_timestamp());
    end if;
  end if;

  return jsonb_build_object('status', 'cancelled', 'was_cancelled', v_plan.status = 'cancelled');
end;
$$;

-- Returns {status: cancelled | already_cancelled | started | not_found}.
create or replace function public.club_cancel_plan(p_plan uuid, p_reason text)
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
  if v_plan.status = 'cancelled' then
    return jsonb_build_object('status', 'already_cancelled');
  end if;
  if v_plan.starts_at <= now() then
    return jsonb_build_object('status', 'started');
  end if;
  update public.plans
     set status = 'cancelled', cancelled_at = clock_timestamp(), removed_reason = p_reason
   where id = p_plan;
  select id into v_chat from public.chats where plan_id = p_plan and kind = 'plan';
  if v_chat is not null then
    insert into public.messages (chat_id, kind, system_event, about_member_id, created_at)
    values (v_chat, 'system', 'cancelled', null, clock_timestamp());
  end if;
  return jsonb_build_object('status', 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Updates about a plan, written only while it is on (QB3-14: no "X joined" after the cancel). The plan row is
--    held FOR SHARE while they are written, so a cancel waits for them, or they see the cancel and write nothing.
--    p_rows: [{member_id, kind, actor_id, role, reminder_hours, previous_starts_at, refund_pence, going_count,
--    dedupe_key}]. Returns how many were new (a dedupe key seen before is a no-op).
-- ---------------------------------------------------------------------------

create or replace function public.write_plan_updates(p_plan uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  perform 1 from public.plans where id = p_plan and status = 'scheduled' for share;
  if not found then
    return 0;
  end if;
  with ins as (
    insert into public.updates (member_id, kind, plan_id, actor_id, role, reminder_hours, previous_starts_at, refund_pence, going_count, dedupe_key)
    select r.member_id, r.kind, p_plan, r.actor_id, r.role, r.reminder_hours, r.previous_starts_at, r.refund_pence, r.going_count, r.dedupe_key
      from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
        as r(member_id uuid, kind text, actor_id uuid, role text, reminder_hours integer, previous_starts_at timestamptz,
             refund_pence integer, going_count integer, dedupe_key text)
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*)::integer into v_n from ins;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Send a chat message under one lock per sender (QB3-09): the same message again (client id), the rate limit
--    and the insert happen one at a time for each member, so sixty sends at once store at most p_limit.
--    The server checks membership, blocks, links and the length first. Returns {status: sent | duplicate |
--    rate_limited, id}.
-- ---------------------------------------------------------------------------

create or replace function public.send_chat_message(p_chat uuid, p_sender uuid, p_body text, p_client_id text, p_limit integer, p_window_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('chat-send:' || p_sender::text, 0));
  if p_client_id is not null then
    select id into v_id from public.messages where chat_id = p_chat and sender_id = p_sender and client_id = p_client_id;
    if v_id is not null then
      return jsonb_build_object('status', 'duplicate', 'id', v_id);
    end if;
  end if;
  select count(*) into v_count
    from public.messages
   where sender_id = p_sender and kind = 'text' and created_at > clock_timestamp() - make_interval(secs => p_window_seconds);
  if v_count >= p_limit then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into public.messages (chat_id, kind, sender_id, body, client_id, created_at)
  values (p_chat, 'text', p_sender, p_body, p_client_id, clock_timestamp())
  returning id into v_id;
  return jsonb_build_object('status', 'sent', 'id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: every function here is the server's only (security definer, service role), except plan_visible_to_me,
-- which stays the one members may run (a boolean about the caller, for the proxy's 404).
-- ---------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.claim_report(uuid, uuid, uuid, integer)',
    'public.claim_photo_review(uuid, uuid, text[], integer)',
    'public.join_plan(uuid, uuid)',
    'public.open_question(uuid, uuid)',
    'public.cancel_plan(uuid, uuid, uuid, text)',
    'public.club_cancel_plan(uuid, text)',
    'public.write_plan_updates(uuid, jsonb)',
    'public.send_chat_message(uuid, uuid, text, text, integer, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

revoke all on function public.plan_visible_to_me(uuid) from public, anon, authenticated;
grant execute on function public.plan_visible_to_me(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
