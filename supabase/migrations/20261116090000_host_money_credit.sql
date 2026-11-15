-- Host money the Vinted way, and Club Yuppie credit on paid places (Albert, 16 Nov 2026: "Yes change it to the vinted
-- way", then "the cash should just be moved to a Yuppie wallet ... the user can spend that on other events / open
-- invites etc. If the member wishes to withdraw cash from the yuppie wallet to their bank it is then that they have to
-- confirm identity"; a cash wallet needs an FCA licence, so: "build it that way and in future I will investigate
-- getting a license"). Re-runnable on top of itself. Undo: release/undo-host-money-credit.sql.
--
-- 1. plan_payments: a host no longer needs Get paid to add a price. 24 hours after the plan starts the host's money
--    is ready (status ready, ready_at) and the host chooses: Club Yuppie credit (credited: one credit_ledger row per
--    payment, kind earnings, never turned back into cash) or their bank (withdrawing while the transfer to their
--    Stripe account is made, then paid_out). ready_reminders counts the reminders sent (7 and 30 days).
--    credit_pence: how much of the place and fee the payer paid with credit (the card paid the rest). A place paid
--    wholly with credit has no PaymentIntent: payment_intent_id is 'credit:<hold id>'.
-- 2. credit_ledger: kinds earnings (a host's plan money added as credit) and plan (credit spent on a paid place).
--    spend_credit takes the kind and a note (the plan's title, for the history).
-- 3. join_paid_plan takes p_credit (stored as credit_pence).
-- 4. credit_host_money: the host's ready money becomes credit, at once and once per payment.

-- 1 -----------------------------------------------------------------------------------------------------
alter table public.plan_payments add column if not exists credit_pence integer not null default 0;
alter table public.plan_payments add column if not exists ready_at timestamptz;
alter table public.plan_payments add column if not exists ready_reminders integer not null default 0;
alter table public.plan_payments add column if not exists credited_at timestamptz;
alter table public.plan_payments drop constraint if exists plan_payments_credit_check;
alter table public.plan_payments add constraint plan_payments_credit_check check (credit_pence >= 0 and credit_pence <= amount_pence + fee_pence);
alter table public.plan_payments drop constraint if exists plan_payments_status_check;
-- held: taken, held by Club Yuppie until the plan is over. refund_asked: the member left it late and asked the host.
-- refund_due: a refund is decided, Stripe has not confirmed it yet. refunded. ready: the plan is over, the money is the
-- host's, waiting for them to choose. credited: added to the host's Club Yuppie credit. withdrawing: being sent to the
-- host's Stripe account. paid_out: sent there (Stripe pays it into their bank).
alter table public.plan_payments add constraint plan_payments_status_check
  check (status in ('held', 'refund_asked', 'refund_due', 'refunded', 'ready', 'credited', 'withdrawing', 'paid_out'));
create index if not exists plan_payments_ready_idx on public.plan_payments (host_id) where status in ('ready', 'withdrawing');
comment on column public.plan_payments.credit_pence is 'How much of the place and fee was paid with Club Yuppie credit (the card paid the rest; refunds go to the card first, never more than it paid).';
comment on column public.plan_payments.ready_at is 'When the plan was over and the money became the host''s to add to credit or withdraw.';
comment on table public.plan_payments is 'Payments for places on paid Open Invite plans (Stripe and Club Yuppie credit, held by Club Yuppie until the plan is over, then the host''s: credit or their bank). Never deleted by a cascade.';

-- 2 -----------------------------------------------------------------------------------------------------
alter table public.credit_ledger drop constraint if exists credit_ledger_kind_check;
alter table public.credit_ledger add constraint credit_ledger_kind_check check (kind in ('nomination', 'admin', 'booking', 'refund', 'earnings', 'plan'));
comment on table public.credit_ledger is
  'Club Yuppie credit: one row per change (+ added, - spent). A balance is the sum of a member''s rows. Not money: spent on Club events and paid Open Invite places, never paid out. Server only.';

drop function if exists public.spend_credit(uuid, integer, text, uuid, boolean);
create or replace function public.spend_credit(
  p_member uuid,
  p_pence integer,
  p_key text,
  p_booking uuid default null,
  p_strict boolean default true,
  p_kind text default 'booking',
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_done integer;
  v_balance integer;
  v_spend integer;
begin
  if p_pence is null or p_pence <= 0 or p_key is null then
    return 0;
  end if;
  if coalesce(p_kind, 'booking') not in ('booking', 'plan') then
    return -1;
  end if;
  perform 1 from public.members where id = p_member for update;
  if not found then
    return -1;
  end if;
  -- Taken already under this key: the same answer again.
  select -amount_pence into v_done from public.credit_ledger where dedupe_key = p_key;
  if found then
    return v_done;
  end if;
  select coalesce(sum(amount_pence), 0) into v_balance from public.credit_ledger where member_id = p_member;
  if p_strict and v_balance < p_pence then
    return -1;
  end if;
  v_spend := least(greatest(v_balance, 0), p_pence);
  if v_spend <= 0 then
    return 0;
  end if;
  insert into public.credit_ledger (member_id, amount_pence, kind, booking_id, dedupe_key, note)
  values (p_member, -v_spend, coalesce(p_kind, 'booking'), p_booking, p_key, nullif(left(btrim(coalesce(p_note, '')), 200), ''));
  return v_spend;
end;
$$;
revoke all on function public.spend_credit(uuid, integer, text, uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.spend_credit(uuid, integer, text, uuid, boolean, text, text) to service_role;

-- 3 -----------------------------------------------------------------------------------------------------
drop function if exists public.join_paid_plan(uuid, uuid, uuid, text, integer, text, integer);

create or replace function public.join_paid_plan(p_member uuid, p_plan uuid, p_hold uuid, p_payment_intent text, p_amount integer, p_method text, p_fee integer default 0, p_credit integer default 0)
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

  insert into public.plan_payments (plan_id, payer_id, host_id, hold_id, amount_pence, fee_pence, credit_pence, payment_intent_id, method, status)
  values (p_plan, p_member, v_plan.host_id, p_hold, p_amount, greatest(0, coalesce(p_fee, 0)), least(greatest(0, coalesce(p_credit, 0)), p_amount + greatest(0, coalesce(p_fee, 0))), p_payment_intent, nullif(btrim(coalesce(p_method, '')), ''), 'held')
  returning id, receipt_no into v_pay;
  update public.plan_holds set status = 'paid' where id = p_hold;

  return jsonb_build_object('status', 'joined', 'payment_id', v_pay.id, 'receipt_no', v_pay.receipt_no,
                            'going', v_going, 'places', v_plan.places, 'full', v_going >= v_plan.places, 'chat_id', v_chat);
end;
$$;

revoke all on function public.join_paid_plan(uuid, uuid, uuid, text, integer, text, integer, integer) from public, anon, authenticated;
grant execute on function public.join_paid_plan(uuid, uuid, uuid, text, integer, text, integer, integer) to service_role;

-- 4 -----------------------------------------------------------------------------------------------------
-- The host's ready money becomes Club Yuppie credit: every ready payment of theirs, under its row lock, one ledger
-- row each (earnings:<payment>, the plan's title as its note). Answers {pence, count}.
create or replace function public.credit_host_money(p_host uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_pence integer := 0;
  v_count integer := 0;
begin
  perform 1 from public.members where id = p_host for update;
  for v_row in
    select pp.id, pp.amount_pence, p.title
      from public.plan_payments pp
      join public.plans p on p.id = pp.plan_id
     where pp.host_id = p_host and pp.status = 'ready'
     order by pp.ready_at, pp.paid_at
     for update of pp
  loop
    insert into public.credit_ledger (member_id, amount_pence, kind, dedupe_key, note)
    values (p_host, v_row.amount_pence, 'earnings', 'earnings:' || v_row.id, nullif(left(btrim(coalesce(v_row.title, '')), 200), ''))
    on conflict do nothing;
    update public.plan_payments set status = 'credited', credited_at = now() where id = v_row.id;
    v_pence := v_pence + v_row.amount_pence;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('pence', v_pence, 'count', v_count);
end;
$$;
revoke all on function public.credit_host_money(uuid) from public, anon, authenticated;
grant execute on function public.credit_host_money(uuid) to service_role;

-- PostgREST: pick up the new function signatures now.
notify pgrst, 'reload schema';
