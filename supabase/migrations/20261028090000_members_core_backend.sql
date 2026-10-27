-- Members backend, Phase A: membership state, booking cancellations and
-- refunds, event addresses, the message log, Stripe event idempotency and the
-- admin audit trail.
--
-- Written to apply on top of the live schema whatever its exact names are
-- (the base tables were made in the Supabase dashboard, not in this repo):
-- every column is "add column if not exists", every constraint and policy is
-- dropped by name before it is made again, and the old unique rule on
-- bookings (member_id, event_id) is found by its columns, not its name. It is
-- safe to run more than once.
--
-- Security model after this migration:
--   * members: a member reads their own row and can change only their own
--     profile fields (column grants). Status, dates, email and Stripe ids are
--     written by the server (service role) only.
--   * bookings: members read their own rows. Nobody but the server inserts,
--     updates or deletes them; every booking goes through book_event().
--   * event_addresses, message_log, admin_audit, stripe_events: admins (or
--     nobody, for stripe_events) through the REST API; the server uses the
--     service role.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- members
-- ---------------------------------------------------------------------------

alter table public.members add column if not exists cancel_at timestamptz;
alter table public.members add column if not exists cancel_requested_at timestamptz;
alter table public.members add column if not exists cancel_reason text;
alter table public.members add column if not exists payment_failed_at timestamptz;
alter table public.members add column if not exists grace_until timestamptz;
alter table public.members add column if not exists paused_at timestamptz;
alter table public.members add column if not exists ended_at timestamptz;
alter table public.members add column if not exists ended_reason text;
alter table public.members add column if not exists deleted_at timestamptz;
alter table public.members add column if not exists updated_at timestamptz default now();
-- Also added by earlier migrations; repeated so this file stands on its own.
alter table public.members add column if not exists employer text;
alter table public.members add column if not exists role_title text;

alter table public.members drop constraint if exists members_ended_reason_check;
alter table public.members add constraint members_ended_reason_check
  check (ended_reason is null or ended_reason in ('member_cancelled', 'payment_failed', 'admin_cancelled', 'account_deleted'));

create index if not exists members_stripe_subscription_id_idx on public.members (stripe_subscription_id);
create index if not exists members_stripe_customer_id_idx on public.members (stripe_customer_id);

drop trigger if exists members_set_updated_at on public.members;
create trigger members_set_updated_at before update on public.members
  for each row execute function public.set_updated_at();

-- Column grants: a member may change their profile fields and nothing else.
-- (The server's email sync and every status change use the service role.)
revoke insert, update, delete on public.members from anon, authenticated;
grant update (full_name, phone, employer, role_title, bio, avatar_url) on public.members to authenticated;

-- Every policy on members is replaced by the three below, whatever the
-- dashboard called the old ones (a broad self-update policy, or a policy
-- that let members read each other, must not survive).
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'members' loop
    execute format('drop policy %I on public.members', p.policyname);
  end loop;
end $$;

alter table public.members enable row level security;

create policy "Members read self" on public.members
  for select to authenticated
  using (id = auth.uid());

create policy "Members update self" on public.members
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Admins manage members" on public.members
  for all to authenticated
  using (exists (select 1 from public.admin_users where id = auth.uid()))
  with check (exists (select 1 from public.admin_users where id = auth.uid()));

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------

alter table public.events add column if not exists cancelled_at timestamptz;
alter table public.events add column if not exists cancel_note text;
alter table public.events add column if not exists updated_at timestamptz default now();
-- Last time the date, time or place changed after bookings existed. A booking
-- made before this moment may be cancelled for a full refund at any time
-- (decision C-D11).
alter table public.events add column if not exists changed_at timestamptz;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- event_addresses: the exact address, 1:1 with events. Its own table so no
-- existing member select policy on events can show it. Admins only; members
-- read it through the server, and only with a confirmed booking.
-- ---------------------------------------------------------------------------

create table if not exists public.event_addresses (
  event_id uuid primary key references public.events (id) on delete cascade,
  address text not null,
  updated_at timestamptz not null default now()
);

alter table public.event_addresses enable row level security;
revoke all on public.event_addresses from anon;

drop policy if exists "Admins manage event addresses" on public.event_addresses;
create policy "Admins manage event addresses" on public.event_addresses
  for all to authenticated
  using (exists (select 1 from public.admin_users where id = auth.uid()))
  with check (exists (select 1 from public.admin_users where id = auth.uid()));

drop trigger if exists event_addresses_set_updated_at on public.event_addresses;
create trigger event_addresses_set_updated_at before update on public.event_addresses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------

alter table public.bookings add column if not exists amount_pence integer not null default 0;
alter table public.bookings add column if not exists cancelled_at timestamptz;
alter table public.bookings add column if not exists cancelled_by text;
alter table public.bookings add column if not exists cancel_reason text;
alter table public.bookings add column if not exists refund_status text not null default 'none';
alter table public.bookings add column if not exists refund_pence integer;
alter table public.bookings add column if not exists stripe_refund_id text;
alter table public.bookings add column if not exists refund_error text;
alter table public.bookings add column if not exists reminder_24h_sent_at timestamptz;
alter table public.bookings add column if not exists reminder_2h_sent_at timestamptz;
alter table public.bookings add column if not exists updated_at timestamptz default now();
alter table public.bookings add column if not exists booked_at timestamptz not null default now();

alter table public.bookings drop constraint if exists bookings_cancelled_by_check;
alter table public.bookings add constraint bookings_cancelled_by_check
  check (cancelled_by is null or cancelled_by in ('member', 'club', 'system'));

alter table public.bookings drop constraint if exists bookings_cancel_reason_check;
alter table public.bookings add constraint bookings_cancel_reason_check
  check (cancel_reason is null or cancel_reason in ('member', 'member_late', 'event_cancelled', 'event_changed', 'membership_ended', 'account_deleted', 'admin'));

alter table public.bookings drop constraint if exists bookings_refund_status_check;
alter table public.bookings add constraint bookings_refund_status_check
  check (refund_status in ('none', 'pending', 'succeeded', 'failed'));

alter table public.bookings drop constraint if exists bookings_amount_pence_check;
alter table public.bookings add constraint bookings_amount_pence_check
  check (amount_pence >= 0 and (refund_pence is null or refund_pence >= 0));

-- Status: only confirmed and cancelled. NOT VALID first, so a stray old value
-- in the live table cannot stop the migration; then validated if it can be.
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('confirmed', 'cancelled')) not valid;
do $$
begin
  alter table public.bookings validate constraint bookings_status_check;
exception when check_violation then
  raise notice 'bookings_status_check left NOT VALID: rows with another status exist';
end $$;

-- The old rule "one row per member and event" (a constraint or a plain unique
-- index on exactly those two columns, whatever its name) is replaced by "one
-- confirmed booking per member and event", so a member can book again after
-- cancelling.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.bookings'::regclass
      and con.contype = 'u'
      and (
        select array_agg(att.attname::text order by att.attname::text)
        from unnest(con.conkey) as k(attnum)
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
      ) = array['event_id', 'member_id']
  loop
    execute format('alter table public.bookings drop constraint %I', c.conname);
  end loop;

  for c in
    select ic.relname
    from pg_index x
    join pg_class ic on ic.oid = x.indexrelid
    where x.indrelid = 'public.bookings'::regclass
      and x.indisunique
      and not x.indisprimary
      and x.indpred is null
      and not exists (select 1 from pg_constraint where conindid = x.indexrelid)
      and (
        select array_agg(att.attname::text order by att.attname::text)
        from unnest(x.indkey::int2[]) as k(attnum)
        join pg_attribute att on att.attrelid = x.indrelid and att.attnum = k.attnum
      ) = array['event_id', 'member_id']
  loop
    execute format('drop index public.%I', c.relname);
  end loop;
end $$;

create unique index if not exists bookings_one_confirmed_per_member_event
  on public.bookings (member_id, event_id) where status = 'confirmed';
create unique index if not exists bookings_stripe_payment_intent_unique
  on public.bookings (stripe_payment_intent_id) where stripe_payment_intent_id is not null;
create index if not exists bookings_event_status_idx on public.bookings (event_id, status);
create index if not exists bookings_member_status_idx on public.bookings (member_id, status);

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

-- Members read their own bookings; admins read all. No member write of any
-- kind: the old member insert policy goes, whatever its name, and the table
-- privileges are taken away as well.
revoke insert, update, delete on public.bookings from anon, authenticated;

do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'bookings' loop
    execute format('drop policy %I on public.bookings', p.policyname);
  end loop;
end $$;

alter table public.bookings enable row level security;

create policy "Members read own bookings" on public.bookings
  for select to authenticated
  using (member_id = auth.uid());

create policy "Admins read bookings" on public.bookings
  for select to authenticated
  using (exists (select 1 from public.admin_users where id = auth.uid()));

-- ---------------------------------------------------------------------------
-- applications
-- ---------------------------------------------------------------------------

-- When the saved card was released (payment method detached) on decline (C-D8).
alter table public.applications add column if not exists card_released_at timestamptz;

-- ---------------------------------------------------------------------------
-- message_log: every email and text the server sends (or skipped, or failed).
-- dedupe_key makes a repeated send a no-op.
-- ---------------------------------------------------------------------------

create table if not exists public.message_log (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'sms')),
  template text not null,
  dedupe_key text unique,
  to_address text,
  member_id uuid references public.members (id) on delete set null,
  application_id uuid references public.applications (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  provider_id text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists message_log_member_idx on public.message_log (member_id);
create index if not exists message_log_created_idx on public.message_log (created_at desc);

alter table public.message_log enable row level security;
revoke all on public.message_log from anon;
revoke insert, update, delete on public.message_log from authenticated;

drop policy if exists "Admins read message log" on public.message_log;
create policy "Admins read message log" on public.message_log
  for select to authenticated
  using (exists (select 1 from public.admin_users where id = auth.uid()));

-- ---------------------------------------------------------------------------
-- stripe_events: one row per webhook event id, so a retried delivery is not
-- processed twice. Server only (RLS on, no policies, no grants).
-- ---------------------------------------------------------------------------

create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- admin_audit: one row per admin action.
-- ---------------------------------------------------------------------------

create table if not exists public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_created_idx on public.admin_audit (created_at desc);
create index if not exists admin_audit_target_idx on public.admin_audit (target_type, target_id);

alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon;
revoke insert, update, delete on public.admin_audit from authenticated;

drop policy if exists "Admins read audit" on public.admin_audit;
create policy "Admins read audit" on public.admin_audit
  for select to authenticated
  using (exists (select 1 from public.admin_users where id = auth.uid()));

-- ---------------------------------------------------------------------------
-- book_event: the one way a booking row is made. Locks the event row, so the
-- capacity check and the insert cannot race another booking for the same
-- event. Service role only.
--
-- Returns {status, booking_id?, over_capacity?, same_payment?}:
--   booked          a new confirmed booking (over_capacity true when a paid
--                   booking was allowed past a full event, decision A-D7)
--   already_booked  a confirmed booking exists for this member and event, or
--                   a booking already exists for this payment intent
--                   (same_payment true: the other caller got there first)
--   full | started | cancelled | inactive | not_found
-- ---------------------------------------------------------------------------

create or replace function public.book_event(
  p_member uuid,
  p_event uuid,
  p_amount integer,
  p_payment_intent text,
  p_allow_over_capacity boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event record;
  v_member record;
  v_booking_id uuid;
  v_confirmed integer;
  v_over boolean := false;
begin
  select id, start_time, capacity, cancelled_at
    into v_event
    from public.events
   where id = p_event
     for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- The same payment, recorded already (the page and the webhook both call
  -- this for one payment).
  if p_payment_intent is not null then
    select id into v_booking_id
      from public.bookings
     where stripe_payment_intent_id = p_payment_intent;
    if found then
      return jsonb_build_object('status', 'already_booked', 'booking_id', v_booking_id, 'same_payment', true);
    end if;
  end if;

  select id, membership_status, cancel_at, grace_until, deleted_at
    into v_member
    from public.members
   where id = p_member;

  if not found
     or v_member.membership_status <> 'active'
     or v_member.deleted_at is not null
     or (v_member.cancel_at is not null and v_member.cancel_at <= now())
     or (v_member.grace_until is not null and v_member.grace_until <= now()) then
    return jsonb_build_object('status', 'inactive');
  end if;

  if v_event.cancelled_at is not null then
    return jsonb_build_object('status', 'cancelled');
  end if;

  if v_event.start_time <= now() then
    return jsonb_build_object('status', 'started');
  end if;

  select id into v_booking_id
    from public.bookings
   where member_id = p_member
     and event_id = p_event
     and status = 'confirmed'
   limit 1;
  if found then
    return jsonb_build_object('status', 'already_booked', 'booking_id', v_booking_id, 'same_payment', false);
  end if;

  if v_event.capacity is not null then
    select count(*) into v_confirmed
      from public.bookings
     where event_id = p_event
       and status = 'confirmed';
    if v_confirmed >= v_event.capacity then
      if not coalesce(p_allow_over_capacity, false) then
        return jsonb_build_object('status', 'full');
      end if;
      v_over := true;
    end if;
  end if;

  begin
    insert into public.bookings (member_id, event_id, status, stripe_payment_intent_id, amount_pence)
    values (p_member, p_event, 'confirmed', p_payment_intent, greatest(coalesce(p_amount, 0), 0))
    returning id into v_booking_id;
  exception when unique_violation then
    select id into v_booking_id
      from public.bookings
     where (p_payment_intent is not null and stripe_payment_intent_id = p_payment_intent)
        or (member_id = p_member and event_id = p_event and status = 'confirmed')
     limit 1;
    return jsonb_build_object('status', 'already_booked', 'booking_id', v_booking_id, 'same_payment', p_payment_intent is not null);
  end;

  return jsonb_build_object('status', 'booked', 'booking_id', v_booking_id, 'over_capacity', v_over);
end;
$$;

revoke all on function public.book_event(uuid, uuid, integer, text, boolean) from public, anon, authenticated;
grant execute on function public.book_event(uuid, uuid, integer, text, boolean) to service_role;

-- New helpers are server only too.
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- approve_application_and_create_member keeps working unchanged: it inserts
-- the same members columns as before, through the service role.
