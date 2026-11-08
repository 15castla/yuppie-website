-- Undo supabase/migrations/20261108090000_rejoin.sql (only if Albert says roll back). Run as postgres in the SQL
-- editor. It puts back the approval function and the one-application-per-email indexes as they were before.
--
-- Roll the website back to the release before this one FIRST (Vercel, Promote the previous deployment): this
-- release's code reads applications.superseded_at, so /apply would break if the column went while it is live.
--
-- First check nothing has been superseded yet:
--   select count(*) from applications where superseded_at is not null;
-- If that is more than 0, an ended member has applied again: putting the old index back would fail (two
-- applications not declined for one email). Then leave this alone and ask the ops chat.

begin;

drop index if exists public.applications_email_unique_active;
create unique index applications_email_unique_active
on public.applications (lower(email))
where status <> 'rejected';

drop index if exists public.applications_email_active_unique;
create unique index applications_email_active_unique
on public.applications (email)
where status in ('pending', 'approved');

alter table public.applications drop column if exists superseded_at;

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

commit;
