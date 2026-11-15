-- Paid Open Invite (Albert, 15 Nov 2026: "Ok shall we build the ability to add costs to open invite"), on the
-- money rules approved on 25 Oct (round 3 call 2): £1 to £200 a person with the face-value tick; the card is held
-- first, so a plan that fills charges nobody; Club Yuppie holds the money and pays the host about 2 working days
-- after the plan (Stripe Connect, separate charges and transfers); leave more than 24 hours before = refunded
-- automatically, later = ask the host (kept if no answer); the host or the club cancels = everyone refunded; Club
-- Yuppie covers the card fees and takes no cut. Defensive and re-runnable: it applies on the local baseline, on the
-- live layout, and on top of itself. Undo: release/undo-paid-plans.sql.
--
-- 1. host_accounts: a host's Stripe connected account (Express) and its Get paid status, as last read from Stripe.
-- 2. plan_holds: a place held for 10 minutes while a member pays (the PaymentIntent it led to).
-- 3. plan_payments: one row per payment for a place. Money records are never deleted by a cascade.
-- 4. Functions (service role only): hold_plan_place, join_paid_plan, undo_paid_join, leave_paid_plan,
--    answer_plan_refund, plan_price_check, post_plan_priced, edit_plan_priced; plan_visible_to_me no longer hides a
--    plan for having a price.
-- 5. Updates: four more kinds (paid, refund_asked, refunded, payout).
-- Server only: no grants to anon or authenticated on any of it.

-- 1 -----------------------------------------------------------------------------------------------------
create table if not exists public.host_accounts (
  member_id uuid primary key references public.members (id) on delete cascade,
  stripe_account_id text not null unique,
  status text not null default 'not-set-up',
  account_ending text,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.host_accounts drop constraint if exists host_accounts_status_check;
alter table public.host_accounts add constraint host_accounts_status_check check (status in ('not-set-up', 'needs-info', 'in-review', 'ready'));
drop trigger if exists host_accounts_set_updated_at on public.host_accounts;
create trigger host_accounts_set_updated_at before update on public.host_accounts for each row execute function public.set_updated_at();
comment on table public.host_accounts is 'A host''s Stripe connected account for Get paid, and its status as last read from Stripe. Server only.';

-- 2 -----------------------------------------------------------------------------------------------------
create table if not exists public.plan_holds (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  amount_pence integer not null,
  held_until timestamptz not null,
  payment_intent_id text unique,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.plan_holds drop constraint if exists plan_holds_status_check;
-- open: the place is held until held_until. paid: it became a payment. released: given up (closed, expired, a new
-- try); its PaymentIntent may still be settled by the sweep. closed: checked, nothing more to do.
alter table public.plan_holds add constraint plan_holds_status_check check (status in ('open', 'paid', 'released', 'closed'));
alter table public.plan_holds drop constraint if exists plan_holds_amount_check;
alter table public.plan_holds add constraint plan_holds_amount_check check (amount_pence > 0);
create index if not exists plan_holds_open_idx on public.plan_holds (plan_id) where status = 'open';
create index if not exists plan_holds_unsettled_idx on public.plan_holds (created_at) where payment_intent_id is not null and status in ('open', 'released');
drop trigger if exists plan_holds_set_updated_at on public.plan_holds;
create trigger plan_holds_set_updated_at before update on public.plan_holds for each row execute function public.set_updated_at();

-- 3 -----------------------------------------------------------------------------------------------------
create sequence if not exists public.plan_receipt_seq start 1001;

create table if not exists public.plan_payments (
  id uuid primary key default gen_random_uuid(),
  receipt_no bigint not null default nextval('public.plan_receipt_seq') unique,
  plan_id uuid not null references public.plans (id) on delete restrict,
  payer_id uuid not null references public.members (id) on delete restrict,
  host_id uuid not null references public.members (id) on delete restrict,
  hold_id uuid references public.plan_holds (id) on delete set null,
  amount_pence integer not null,
  payment_intent_id text not null unique,
  charge_id text,
  method text,
  status text not null default 'held',
  paid_at timestamptz not null default now(),
  refund_asked_at timestamptz,
  refund_reason text,
  refund_due_at timestamptz,
  refund_id text,
  refund_tries integer not null default 0,
  refunded_at timestamptz,
  transfer_id text,
  transfer_tries integer not null default 0,
  transferred_at timestamptz,
  payout_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.plan_payments drop constraint if exists plan_payments_amount_check;
alter table public.plan_payments add constraint plan_payments_amount_check check (amount_pence between 100 and 20000);
alter table public.plan_payments drop constraint if exists plan_payments_status_check;
-- held: taken, held by Club Yuppie. refund_asked: the member left it late and asked the host (still held, still in).
-- refund_due: a refund is decided and Stripe has not confirmed it yet (the sweep tries again). refunded. paid_out:
-- sent to the host's Stripe account (Stripe pays it into their bank).
alter table public.plan_payments add constraint plan_payments_status_check check (status in ('held', 'refund_asked', 'refund_due', 'refunded', 'paid_out'));
alter table public.plan_payments drop constraint if exists plan_payments_refund_reason_check;
alter table public.plan_payments add constraint plan_payments_refund_reason_check check (refund_reason is null or refund_reason in ('left-in-time', 'host-cancelled', 'host-agreed', 'club'));
create index if not exists plan_payments_plan_idx on public.plan_payments (plan_id);
create index if not exists plan_payments_payer_idx on public.plan_payments (payer_id, paid_at desc);
create index if not exists plan_payments_host_idx on public.plan_payments (host_id, paid_at desc);
create index if not exists plan_payments_open_idx on public.plan_payments (status) where status in ('held', 'refund_asked', 'refund_due');
drop trigger if exists plan_payments_set_updated_at on public.plan_payments;
create trigger plan_payments_set_updated_at before update on public.plan_payments for each row execute function public.set_updated_at();
comment on table public.plan_payments is 'Payments for places on paid Open Invite plans (Stripe, held by Club Yuppie, paid out to the host). Never deleted by a cascade.';

do $$
declare t text;
begin
  foreach t in array array['host_accounts', 'plan_holds', 'plan_payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
revoke all on sequence public.plan_receipt_seq from anon, authenticated;
grant usage, select on sequence public.plan_receipt_seq to service_role;

-- 4 -----------------------------------------------------------------------------------------------------

-- Pay and join, step 1: hold a place for p_minutes while the member pays. Under the plan's row lock, so the last
-- place goes to one member. Places held by others (not run out) count as taken.
-- Returns {status, hold_id, amount, held_until}; status one of
--   held | already_in | full | started | cancelled | host | free | blocked | inactive | not_found
create or replace function public.hold_plan_place(p_member uuid, p_plan uuid, p_minutes integer default 10)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan record;
  v_going integer;
  v_held integer;
  v_hold record;
begin
  select id, host_id, starts_at, places, status, removed_at, price_pence into v_plan from public.plans where id = p_plan for update;
  if not found or v_plan.removed_at is not null then return jsonb_build_object('status', 'not_found'); end if;
  if not public.member_can_take_part(p_member) then return jsonb_build_object('status', 'inactive'); end if;
  if v_plan.host_id = p_member then return jsonb_build_object('status', 'host'); end if;
  if not public.member_can_take_part(v_plan.host_id) then return jsonb_build_object('status', 'not_found'); end if;
  if v_plan.status <> 'scheduled' then return jsonb_build_object('status', 'cancelled'); end if;
  if v_plan.starts_at <= now() then return jsonb_build_object('status', 'started'); end if;
  if v_plan.price_pence is null then return jsonb_build_object('status', 'free'); end if;
  if public.blocked_between(p_member, v_plan.host_id) then return jsonb_build_object('status', 'blocked'); end if;
  if exists (select 1 from public.plan_members where plan_id = p_plan and member_id = p_member and status = 'going') then
    return jsonb_build_object('status', 'already_in');
  end if;

  -- Holds that ran out, and this member's earlier try, give their place back.
  update public.plan_holds set status = 'released'
   where plan_id = p_plan and status = 'open' and (held_until < now() or member_id = p_member);

  select count(*) into v_going from public.plan_members where plan_id = p_plan and status = 'going';
  select count(*) into v_held from public.plan_holds where plan_id = p_plan and status = 'open';
  if v_going + v_held >= v_plan.places then
    return jsonb_build_object('status', 'full');
  end if;

  insert into public.plan_holds (plan_id, member_id, amount_pence, held_until)
  values (p_plan, p_member, v_plan.price_pence, now() + make_interval(mins => greatest(1, least(coalesce(p_minutes, 10), 30))))
  returning id, amount_pence, held_until into v_hold;
  return jsonb_build_object('status', 'held', 'hold_id', v_hold.id, 'amount', v_hold.amount_pence, 'held_until', v_hold.held_until);
end;
$$;

-- Pay and join, step 2: the card is held (the PaymentIntent is authorised); take the place and record the payment.
-- The server captures the card only after this says "joined" (and undoes it if the capture fails). A hold that ran
-- out still joins if a place is free. Idempotent on the PaymentIntent.
-- Returns {status, payment_id, receipt_no, going, places, full, chat_id, price}; status one of
--   joined | already_paid | already_in | full | price_changed | started | cancelled | host | blocked | inactive | not_found
create or replace function public.join_paid_plan(p_member uuid, p_plan uuid, p_hold uuid, p_payment_intent text, p_amount integer, p_method text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan record;
  v_going integer;
  v_held integer;
  v_chat uuid;
  v_pay record;
begin
  select id, host_id, starts_at, places, status, removed_at, price_pence into v_plan from public.plans where id = p_plan for update;
  select id, receipt_no into v_pay from public.plan_payments where payment_intent_id = p_payment_intent;
  select id into v_chat from public.chats where plan_id = p_plan and kind = 'plan';
  if v_pay.id is not null then
    return jsonb_build_object('status', 'already_paid', 'payment_id', v_pay.id, 'receipt_no', v_pay.receipt_no, 'chat_id', v_chat);
  end if;
  if v_plan.id is null or v_plan.removed_at is not null then return jsonb_build_object('status', 'not_found'); end if;
  if not public.member_can_take_part(p_member) then return jsonb_build_object('status', 'inactive'); end if;
  if v_plan.host_id = p_member then return jsonb_build_object('status', 'host'); end if;
  if not public.member_can_take_part(v_plan.host_id) then return jsonb_build_object('status', 'not_found'); end if;
  if v_plan.status <> 'scheduled' then return jsonb_build_object('status', 'cancelled'); end if;
  if v_plan.starts_at <= now() then return jsonb_build_object('status', 'started'); end if;
  if public.blocked_between(p_member, v_plan.host_id) then return jsonb_build_object('status', 'blocked'); end if;
  if v_plan.price_pence is distinct from p_amount then
    return jsonb_build_object('status', 'price_changed', 'price', v_plan.price_pence);
  end if;
  if exists (select 1 from public.plan_members where plan_id = p_plan and member_id = p_member and status = 'going') then
    return jsonb_build_object('status', 'already_in', 'chat_id', v_chat);
  end if;

  select count(*) into v_going from public.plan_members where plan_id = p_plan and status = 'going';
  select count(*) into v_held from public.plan_holds
   where plan_id = p_plan and status = 'open' and held_until >= now() and member_id <> p_member;
  if v_going + v_held >= v_plan.places then
    return jsonb_build_object('status', 'full', 'going', v_going, 'places', v_plan.places);
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
    insert into public.messages (chat_id, kind, system_event, about_member_id) values (v_chat, 'system', 'paid', p_member);
  end if;

  insert into public.plan_payments (plan_id, payer_id, host_id, hold_id, amount_pence, payment_intent_id, method, status)
  values (p_plan, p_member, v_plan.host_id, p_hold, p_amount, p_payment_intent, nullif(btrim(coalesce(p_method, '')), ''), 'held')
  returning id, receipt_no into v_pay;
  update public.plan_holds set status = 'paid' where id = p_hold;

  return jsonb_build_object('status', 'joined', 'payment_id', v_pay.id, 'receipt_no', v_pay.receipt_no,
                            'going', v_going, 'places', v_plan.places, 'full', v_going >= v_plan.places, 'chat_id', v_chat);
end;
$$;

-- The card could not be captured after join_paid_plan: nothing was taken, so the place and the record go.
create or replace function public.undo_paid_join(p_payment uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pay record;
  v_chat uuid;
begin
  select * into v_pay from public.plan_payments where id = p_payment;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  perform 1 from public.plans where id = v_pay.plan_id for update;
  update public.plan_members set status = 'left', left_at = now() where plan_id = v_pay.plan_id and member_id = v_pay.payer_id and status = 'going';
  select id into v_chat from public.chats where plan_id = v_pay.plan_id and kind = 'plan';
  if v_chat is not null then
    update public.chat_members set left_at = now(), left_reason = 'withdrew' where chat_id = v_chat and member_id = v_pay.payer_id and left_at is null;
    delete from public.messages where chat_id = v_chat and kind = 'system' and system_event = 'paid' and about_member_id = v_pay.payer_id and created_at >= v_pay.paid_at - interval '1 minute';
  end if;
  update public.plan_holds set status = 'closed' where id = v_pay.hold_id;
  delete from public.plan_payments where id = p_payment and status = 'held' and refund_id is null and transfer_id is null;
  return jsonb_build_object('status', 'undone');
end;
$$;

-- Leaving a paid plan. p_mode: refund (more than 24 hours before: leave, refunded in full), ask (inside 24 hours:
-- ask the host, stay in), no_refund (leave, the host keeps it). The 24-hour line is checked here, at the tap.
-- Returns {status, payment_id, was_full, refund}; status one of
--   left | asked | late | in_time | no_payment | not_in | started | host | not_found
create or replace function public.leave_paid_plan(p_member uuid, p_plan uuid, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan record;
  v_pay record;
  v_going integer;
  v_in_time boolean;
begin
  select id, host_id, starts_at, places, status into v_plan from public.plans where id = p_plan for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if v_plan.host_id = p_member then return jsonb_build_object('status', 'host'); end if;
  if not exists (select 1 from public.plan_members where plan_id = p_plan and member_id = p_member and status = 'going') then
    return jsonb_build_object('status', 'not_in');
  end if;
  if v_plan.starts_at <= now() then return jsonb_build_object('status', 'started'); end if;
  select id, status into v_pay from public.plan_payments
   where plan_id = p_plan and payer_id = p_member and status in ('held', 'refund_asked')
   order by paid_at desc limit 1 for update;
  if v_pay.id is null then return jsonb_build_object('status', 'no_payment'); end if;
  v_in_time := v_plan.starts_at - now() > interval '24 hours';

  if p_mode = 'ask' then
    if v_in_time then return jsonb_build_object('status', 'in_time'); end if;
    update public.plan_payments set status = 'refund_asked', refund_asked_at = now() where id = v_pay.id;
    return jsonb_build_object('status', 'asked', 'payment_id', v_pay.id);
  end if;
  if p_mode = 'refund' and not v_in_time then return jsonb_build_object('status', 'late'); end if;
  if p_mode not in ('refund', 'no_refund') then return jsonb_build_object('status', 'not_found'); end if;

  select count(*) into v_going from public.plan_members where plan_id = p_plan and status = 'going';
  update public.plan_members set status = 'left', left_at = now() where plan_id = p_plan and member_id = p_member;
  update public.chat_members cm
     set left_at = now(), left_reason = 'withdrew'
    from public.chats c
   where c.id = cm.chat_id and c.plan_id = p_plan and c.kind = 'plan' and cm.member_id = p_member and cm.left_at is null;
  if p_mode = 'refund' then
    update public.plan_payments set status = 'refund_due', refund_reason = 'left-in-time', refund_due_at = now() where id = v_pay.id;
  else
    update public.plan_payments set status = 'held', refund_asked_at = null where id = v_pay.id;
  end if;
  return jsonb_build_object('status', 'left', 'payment_id', v_pay.id, 'was_full', v_going >= v_plan.places, 'refund', p_mode = 'refund');
end;
$$;

-- The host answers a refund request (until the plan starts; after that an unanswered one is kept). Refund: the
-- member's place goes back to the plan. Returns {status, payment_id, payer_id, was_full}; status one of
--   refunded | kept | not_asked | started | not_found
create or replace function public.answer_plan_refund(p_host uuid, p_payment uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pay record;
  v_plan record;
  v_going integer;
begin
  select id, plan_id, payer_id, status into v_pay from public.plan_payments where id = p_payment;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select id, host_id, starts_at, places, status into v_plan from public.plans where id = v_pay.plan_id for update;
  if v_plan.host_id <> p_host then return jsonb_build_object('status', 'not_found'); end if;
  select id, plan_id, payer_id, status into v_pay from public.plan_payments where id = p_payment for update;
  if v_pay.status <> 'refund_asked' then return jsonb_build_object('status', 'not_asked'); end if;
  if v_plan.starts_at <= now() then return jsonb_build_object('status', 'started'); end if;
  if p_answer = 'keep' then
    update public.plan_payments set status = 'held' where id = p_payment;
    return jsonb_build_object('status', 'kept', 'payment_id', p_payment, 'payer_id', v_pay.payer_id);
  end if;
  if p_answer <> 'refund' then return jsonb_build_object('status', 'not_found'); end if;
  select count(*) into v_going from public.plan_members where plan_id = v_plan.id and status = 'going';
  update public.plan_payments set status = 'refund_due', refund_reason = 'host-agreed', refund_due_at = now() where id = p_payment;
  update public.plan_members set status = 'left', left_at = now() where plan_id = v_plan.id and member_id = v_pay.payer_id and status = 'going';
  update public.chat_members cm
     set left_at = now(), left_reason = 'withdrew'
    from public.chats c
   where c.id = cm.chat_id and c.plan_id = v_plan.id and c.kind = 'plan' and cm.member_id = v_pay.payer_id and cm.left_at is null;
  return jsonb_build_object('status', 'refunded', 'payment_id', p_payment, 'payer_id', v_pay.payer_id, 'was_full', v_going >= v_plan.places);
end;
$$;

-- May this plan's price become p_price? ok | same | paid (someone has paid: the price stays) | guests (people are in
-- for free: no cost can be added) | not_found
create or replace function public.plan_price_check(p_plan uuid, p_price integer, p_face boolean)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan record;
begin
  select id, price_pence, face_value_confirmed into v_plan from public.plans where id = p_plan;
  if not found then return 'not_found'; end if;
  if v_plan.price_pence is not distinct from p_price and (p_price is null or v_plan.face_value_confirmed = coalesce(p_face, false)) then
    return 'same';
  end if;
  if exists (select 1 from public.plan_payments where plan_id = p_plan) then return 'paid'; end if;
  if p_price is not null and exists (select 1 from public.plan_members where plan_id = p_plan and status = 'going' and role = 'guest') then
    return 'guests';
  end if;
  return 'ok';
end;
$$;

-- post_plan with a price (null: free), in one transaction, so a paid plan is never seen free.
create or replace function public.post_plan_priced(
  p_host uuid, p_title text, p_type text, p_starts_at timestamptz, p_place text, p_note text, p_places integer,
  p_host_going boolean, p_price integer, p_face boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  v := public.post_plan(p_host, p_title, p_type, p_starts_at, p_place, p_note, p_places, p_host_going);
  if v->>'status' = 'posted' and p_price is not null then
    update public.plans set price_pence = p_price, face_value_confirmed = coalesce(p_face, false) where id = (v->>'plan_id')::uuid;
  end if;
  return v;
end;
$$;

-- edit_plan, and the price with it when p_set_price (under the same lock and transaction). A price that may not
-- change answers price_paid or price_guests and changes nothing.
create or replace function public.edit_plan_priced(
  p_host uuid, p_plan uuid, p_title text, p_type text, p_starts_at timestamptz, p_place text, p_note text,
  p_places integer, p_host_going boolean, p_set_price boolean, p_price integer, p_face boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
  v_check text := 'same';
begin
  perform 1 from public.plans where id = p_plan for update;
  if p_set_price then
    v_check := public.plan_price_check(p_plan, p_price, p_face);
    if v_check in ('paid', 'guests') then return jsonb_build_object('status', 'price_' || v_check); end if;
  end if;
  v := public.edit_plan(p_host, p_plan, p_title, p_type, p_starts_at, p_place, p_note, p_places, p_host_going);
  if v->>'status' = 'saved' and p_set_price and v_check = 'ok' then
    update public.plans set price_pence = p_price, face_value_confirmed = case when p_price is null then false else coalesce(p_face, false) end where id = p_plan;
    v := v || jsonb_build_object('price_changed', true);
  end if;
  return v;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.hold_plan_place(uuid, uuid, integer)',
    'public.join_paid_plan(uuid, uuid, uuid, text, integer, text)',
    'public.undo_paid_join(uuid)',
    'public.leave_paid_plan(uuid, uuid, text)',
    'public.answer_plan_refund(uuid, uuid, text)',
    'public.plan_price_check(uuid, integer, boolean)',
    'public.post_plan_priced(uuid, text, text, timestamptz, text, text, integer, boolean, integer, boolean)',
    'public.edit_plan_priced(uuid, uuid, text, text, timestamptz, text, text, integer, boolean, boolean, integer, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Plans with a price are seen like any other now (the members proxy's real 404 for a plan page used this, and hid
-- every priced plan while paid plans were stage 3). The rest is the stage 2 fixes' rule unchanged.
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
           and auth.uid() is not null
           and public.member_can_take_part(p.host_id)
           and not public.blocked_between(auth.uid(), p.host_id)
         )
       )
  );
$$;
revoke all on function public.plan_visible_to_me(uuid) from public, anon, authenticated;
grant execute on function public.plan_visible_to_me(uuid) to authenticated, service_role;

-- 5 -----------------------------------------------------------------------------------------------------
-- paid: to the host, "Sam paid £22 for Padel" (refund_pence carries the amount). refund_asked: to the host, "Sam
-- asked for a refund". refunded: to the member, "£22 refunded for Padel". payout: to the host, "£44 on its way".
alter table public.updates drop constraint if exists updates_kind_check;
alter table public.updates add constraint updates_kind_check
  check (kind in ('joined', 'left', 'full', 'place_opened', 'changed', 'cancelled', 'reminder', 'paid', 'refund_asked', 'refunded', 'payout'));
