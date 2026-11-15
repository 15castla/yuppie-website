-- Paid Open Invite's booking fee (Albert, 15 Nov 2026: "I think we should build a flat £1 booking fee as that will
-- cover the majority of cases"). A member pays the host's price plus Club Yuppie's £1, shown in the price from the
-- start (the drip pricing rules); the host gets their price; the fee is kept when a member leaves and refunded when
-- the plan is cancelled (by the host or the club) or the club refunds the payment. Re-runnable on top of itself.
-- Undo: release/undo-booking-fee.sql.
--
-- 1. plan_payments.fee_pence (the booking fee paid with the place) and refunded_pence (what went back to the card).
-- 2. join_paid_plan takes the fee (p_fee, default 0). The six-argument version from 20261115090000 goes: nobody can
--    pay before Stripe Connect is on, so no payment is in flight between the two.

alter table public.plan_payments add column if not exists fee_pence integer not null default 0;
alter table public.plan_payments add column if not exists refunded_pence integer;
alter table public.plan_payments drop constraint if exists plan_payments_fee_check;
alter table public.plan_payments add constraint plan_payments_fee_check check (fee_pence between 0 and 500);
comment on column public.plan_payments.amount_pence is 'The place: what the host gets (and what leaving in time gives back).';
comment on column public.plan_payments.fee_pence is 'Club Yuppie''s booking fee paid with the place (the card was charged amount_pence + fee_pence).';
comment on column public.plan_payments.refunded_pence is 'What went back to the card (the place, plus the fee when the plan was cancelled or the club refunded it).';

drop function if exists public.join_paid_plan(uuid, uuid, uuid, text, integer, text);

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
