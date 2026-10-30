-- Phase A fix round, admin (fixer 3, 28 Oct 2026). Defensive and re-runnable, like
-- 20261028090000_members_core_backend.sql: it applies on the local baseline, on the live layout, and on top
-- of itself.
--
-- 1. QA2-04: approve_application_and_create_member refuses an application that is not waiting. The admin
--    action checks first (a page left open after another admin declined or approved it); this is the last
--    word for anything that slips between that check and the charge. Same signature, same body otherwise
--    (the live definition in supabase-layout-2026-10-27.md), same grants as the core migration left them:
--    service role only.
-- 2. QA2-06: events.change_emailed_at, when the people booked were last emailed about a date, time or place
--    change. The event card offers "Email them now" while changed_at is later (or nothing was emailed).

-- 1 -----------------------------------------------------------------------------------------------------
create or replace function public.approve_application_and_create_member(
  p_application_id uuid,
  p_auth_user_id uuid,
  p_reviewed_by text
)
returns void
language plpgsql
as $$
declare
  v_application applications%rowtype;
begin
  select * into v_application
  from applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Application % not found', p_application_id;
  end if;

  if v_application.status::text <> 'pending' then
    raise exception 'Application % is %, not waiting: refusing to approve it', p_application_id, v_application.status;
  end if;

  if v_application.stripe_subscription_id is null then
    raise exception 'Application % has no recorded Stripe subscription, refusing to create a member without a confirmed charge', p_application_id;
  end if;

  insert into members (
    id,
    email,
    full_name,
    phone,
    employer,
    role_title,
    membership_status,
    stripe_customer_id,
    stripe_subscription_id
  )
  values (
    p_auth_user_id,
    v_application.email,
    v_application.full_name,
    v_application.phone,
    v_application.employer,
    v_application.role_title,
    'active',
    v_application.stripe_customer_id,
    v_application.stripe_subscription_id
  );

  update applications
  set status = 'approved',
      reviewed_at = now(),
      reviewed_by = p_reviewed_by,
      payment_error = null
  where id = p_application_id;
end;
$$;

revoke all on function public.approve_application_and_create_member(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_application_and_create_member(uuid, uuid, text) to service_role;

-- 2 -----------------------------------------------------------------------------------------------------
alter table public.events add column if not exists change_emailed_at timestamptz;

comment on column public.events.change_emailed_at is
  'When the people booked were last emailed about a date, time or place change (event-changed). The admin event card offers "Email them now" while changed_at is later or this is null.';
