-- The Concierge, for real (Albert, 1 Nov 2026: "Build it for real"). An AI that recommends places and never books.
-- App only. The conversation and what it remembers about a member are kept here; the AI call is the server's
-- (lib/server/concierge.ts).
--
-- Defensive and re-runnable like the earlier migrations. Applies on the stage 2 schema. Undo:
-- release/undo-concierge.sql.
--
-- Security model: members never read or write these tables directly. Both have RLS on with no policy for
-- anon or authenticated and no grant to them: the server actions check the member (requireMember) and use the
-- service role. A member's rows go when their member row goes, and the account-deletion path deletes them too
-- (the members row is anonymised, not deleted).

-- ---------------------------------------------------------------------------
-- 1. concierge_messages: the conversation, oldest first.
--    role member      body = what the member typed
--    role concierge   body = the reply's first paragraph; reply = the rest (steps, closing, recommendations,
--                     sources, remembered), as the screen's types have it
create table if not exists public.concierge_messages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  role text not null,
  body text not null,
  reply jsonb,
  created_at timestamptz not null default now()
);
-- A question that got no reply (the AI could not be reached, or the turn was lost): kept, so it still counts
-- towards the day's limit, but never shown and never sent back to the AI as history.
alter table public.concierge_messages add column if not exists failed_at timestamptz;
alter table public.concierge_messages drop constraint if exists concierge_messages_role_check;
alter table public.concierge_messages add constraint concierge_messages_role_check check (role in ('member', 'concierge'));
alter table public.concierge_messages drop constraint if exists concierge_messages_body_check;
alter table public.concierge_messages add constraint concierge_messages_body_check check (char_length(body) between 1 and 4000);
drop index if exists public.concierge_messages_member_idx;
create index concierge_messages_member_idx on public.concierge_messages (member_id, created_at);

-- ---------------------------------------------------------------------------
-- 2. concierge_memory: what it has learned about a member's taste, in plain words ("Likes quiet places").
create table if not exists public.concierge_memory (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  text text not null,
  source_message_id uuid references public.concierge_messages(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.concierge_memory drop constraint if exists concierge_memory_text_check;
alter table public.concierge_memory add constraint concierge_memory_text_check check (char_length(text) between 1 and 80);
drop index if exists public.concierge_memory_member_idx;
create index concierge_memory_member_idx on public.concierge_memory (member_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. RLS and grants: nobody but the server.
do $$
declare t text;
begin
  foreach t in array array['concierge_messages', 'concierge_memory'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. concierge_take_turn: one member message in, under a per-member lock, within the limits. Records the
--    member's message and returns its id, or says why not:
--      inactive   the member cannot take part (paused, ended, deleted)
--      busy       a reply to an earlier message is still being written (one at a time)
--      limit      p_daily questions in the last 24 hours already (questions that failed count too, so a
--                 question that keeps failing cannot run up the bill)
--    "busy" is an unanswered, unfailed member message newer than p_busy_seconds.
create or replace function public.concierge_take_turn(p_member uuid, p_text text, p_daily integer, p_busy_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_last public.concierge_messages%rowtype;
  v_count integer;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('concierge:' || p_member::text, 0));
  if not public.member_can_take_part(p_member) then
    return jsonb_build_object('status', 'inactive');
  end if;
  select * into v_last from public.concierge_messages
    where member_id = p_member and failed_at is null order by created_at desc, id desc limit 1;
  if found and v_last.role = 'member' and v_last.created_at > now() - make_interval(secs => p_busy_seconds) then
    return jsonb_build_object('status', 'busy');
  end if;
  select count(*) into v_count from public.concierge_messages
    where member_id = p_member and role = 'member' and created_at > now() - interval '24 hours';
  if v_count >= p_daily then
    return jsonb_build_object('status', 'limit');
  end if;
  insert into public.concierge_messages (member_id, role, body) values (p_member, 'member', btrim(p_text)) returning id into v_id;
  return jsonb_build_object('status', 'ok', 'message_id', v_id);
end $$;

-- ---------------------------------------------------------------------------
-- 5. concierge_save_reply: the reply to one question, under the same lock, only while that question is still
--    there, unfailed, and the member's account still exists (a reply that finishes after Delete my account, or
--    after the question was given up, is not saved: 'gone'). With p_memory, also what it learned, unless the
--    member already has that line; then the oldest lines beyond p_max_memory go.
create or replace function public.concierge_save_reply(p_member uuid, p_question uuid, p_body text, p_reply jsonb, p_memory text, p_max_memory integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reply public.concierge_messages%rowtype;
  v_mem uuid;
  v_mem_text text;
begin
  perform pg_advisory_xact_lock(hashtextextended('concierge:' || p_member::text, 0));
  if not exists (select 1 from public.concierge_messages q join public.members m on m.id = q.member_id
                  where q.id = p_question and q.member_id = p_member and q.role = 'member' and q.failed_at is null and m.deleted_at is null) then
    return jsonb_build_object('status', 'gone');
  end if;
  insert into public.concierge_messages (member_id, role, body, reply) values (p_member, 'concierge', p_body, coalesce(p_reply, '{}'::jsonb))
    returning * into v_reply;
  if p_memory is not null and btrim(p_memory) <> ''
     and not exists (select 1 from public.concierge_memory where member_id = p_member and lower(text) = lower(btrim(p_memory))) then
    insert into public.concierge_memory (member_id, text, source_message_id) values (p_member, btrim(p_memory), v_reply.id)
      returning id, text into v_mem, v_mem_text;
    update public.concierge_messages set reply = reply || jsonb_build_object('remembered', jsonb_build_object('id', v_mem, 'text', v_mem_text))
      where id = v_reply.id;
    delete from public.concierge_memory where member_id = p_member and id in (
      select id from public.concierge_memory where member_id = p_member order by created_at desc, id desc offset greatest(p_max_memory, 1));
  end if;
  return jsonb_build_object('status', 'ok', 'id', v_reply.id, 'created_at', v_reply.created_at, 'memory_id', v_mem, 'memory_text', v_mem_text);
end $$;

-- ---------------------------------------------------------------------------
-- 6. concierge_purge: everything the Concierge has for a member (Delete my account), under the same lock, so a
--    reply being written at that moment is either saved before and deleted, or refused after.
create or replace function public.concierge_purge(p_member uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('concierge:' || p_member::text, 0));
  delete from public.concierge_memory where member_id = p_member;
  delete from public.concierge_messages where member_id = p_member;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.concierge_take_turn(uuid, text, integer, integer)',
    'public.concierge_save_reply(uuid, uuid, text, jsonb, text, integer)',
    'public.concierge_purge(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
