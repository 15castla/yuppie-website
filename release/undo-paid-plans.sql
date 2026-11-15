-- Undo supabase/migrations/20261115090000_paid_plans.sql. Only while no real payment exists: it drops the payment
-- records. Check first: select count(*) from public.plan_payments;  (must be 0)
-- Plans that have a price keep it (the column is from stage 2); they show as free plans once the code is rolled back
-- only if MEMBERS_PAID_PLANS_LIVE is off.

begin;
delete from public.updates where kind in ('paid', 'refund_asked', 'refunded', 'payout');
alter table public.updates drop constraint if exists updates_kind_check;
alter table public.updates add constraint updates_kind_check
  check (kind in ('joined', 'left', 'full', 'place_opened', 'changed', 'cancelled', 'reminder'));
drop function if exists public.edit_plan_priced(uuid, uuid, text, text, timestamptz, text, text, integer, boolean, boolean, integer, boolean);
drop function if exists public.post_plan_priced(uuid, text, text, timestamptz, text, text, integer, boolean, integer, boolean);
drop function if exists public.plan_price_check(uuid, integer, boolean);
drop function if exists public.answer_plan_refund(uuid, uuid, text);
drop function if exists public.leave_paid_plan(uuid, uuid, text);
drop function if exists public.undo_paid_join(uuid);
drop function if exists public.join_paid_plan(uuid, uuid, uuid, text, integer, text);
drop function if exists public.hold_plan_place(uuid, uuid, integer);
drop table if exists public.plan_payments;
drop sequence if exists public.plan_receipt_seq;
drop table if exists public.plan_holds;
drop table if exists public.host_accounts;
-- plan_visible_to_me as the stage 2 fixes had it (priced plans hidden)
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
commit;
