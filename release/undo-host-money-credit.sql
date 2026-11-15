-- Undo supabase/migrations/20261116090000_host_money_credit.sql: back to paid plans before 16 Nov (Get paid before
-- adding a price, payouts by the sweep). Only once no payment is ready, credited or withdrawing and no credit was earned
-- or spent on a plan. Check first:
--   select status, count(*) from public.plan_payments group by status;   (no ready, credited, withdrawing)
--   select count(*) from public.credit_ledger where kind in ('earnings', 'plan');   (must be 0)
--   select count(*) from public.plan_payments where credit_pence > 0;   (must be 0)

begin;
drop function if exists public.credit_host_money(uuid);

drop function if exists public.join_paid_plan(uuid, uuid, uuid, text, integer, text, integer, integer);
create or replace function public.join_paid_plan(p_member uuid, p_plan uuid, p_hold uuid, p_payment_intent text, p_amount integer, p_method text, p_fee integer default 0)
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

  insert into public.plan_payments (plan_id, payer_id, host_id, hold_id, amount_pence, fee_pence, payment_intent_id, method, status)
  values (p_plan, p_member, v_plan.host_id, p_hold, p_amount, greatest(0, coalesce(p_fee, 0)), p_payment_intent, nullif(btrim(coalesce(p_method, '')), ''), 'held')
  returning id, receipt_no into v_pay;
  update public.plan_holds set status = 'paid' where id = p_hold;

  return jsonb_build_object('status', 'joined', 'payment_id', v_pay.id, 'receipt_no', v_pay.receipt_no,
                            'going', v_going, 'places', v_plan.places, 'full', v_going >= v_plan.places, 'chat_id', v_chat);
end;
$$;

revoke all on function public.join_paid_plan(uuid, uuid, uuid, text, integer, text, integer) from public, anon, authenticated;
grant execute on function public.join_paid_plan(uuid, uuid, uuid, text, integer, text, integer) to service_role;

drop function if exists public.spend_credit(uuid, integer, text, uuid, boolean, text, text);
create or replace function public.spend_credit(
  p_member uuid,
  p_pence integer,
  p_key text,
  p_booking uuid default null,
  p_strict boolean default true
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
  insert into public.credit_ledger (member_id, amount_pence, kind, booking_id, dedupe_key)
  values (p_member, -v_spend, 'booking', p_booking, p_key);
  return v_spend;
end;
$$;

revoke all on function public.spend_credit(uuid, integer, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.spend_credit(uuid, integer, text, uuid, boolean) to service_role;

alter table public.credit_ledger drop constraint if exists credit_ledger_kind_check;
alter table public.credit_ledger add constraint credit_ledger_kind_check check (kind in ('nomination', 'admin', 'booking', 'refund'));

drop index if exists public.plan_payments_ready_idx;
alter table public.plan_payments drop constraint if exists plan_payments_status_check;
alter table public.plan_payments add constraint plan_payments_status_check check (status in ('held', 'refund_asked', 'refund_due', 'refunded', 'paid_out'));
alter table public.plan_payments drop constraint if exists plan_payments_credit_check;
alter table public.plan_payments drop column if exists credited_at;
alter table public.plan_payments drop column if exists ready_reminders;
alter table public.plan_payments drop column if exists ready_at;
alter table public.plan_payments drop column if exists credit_pence;
notify pgrst, 'reload schema';
commit;
