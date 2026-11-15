-- Undo supabase/migrations/20261115120000_booking_fee.sql: join_paid_plan without the fee, and the two columns.
-- Only once no payment carries a fee you still need on record: select count(*) from public.plan_payments where fee_pence > 0;

begin;
drop function if exists public.join_paid_plan(uuid, uuid, uuid, text, integer, text, integer);
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
revoke all on function public.join_paid_plan(uuid, uuid, uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.join_paid_plan(uuid, uuid, uuid, text, integer, text) to service_role;
alter table public.plan_payments drop constraint if exists plan_payments_fee_check;
alter table public.plan_payments drop column if exists refunded_pence;
alter table public.plan_payments drop column if exists fee_pence;
commit;
