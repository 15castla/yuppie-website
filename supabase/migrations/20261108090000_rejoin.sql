-- Rejoining after a membership ends (Albert, 8 Nov 2026: "If they end they would need to reapply"). Defensive and
-- re-runnable: it applies on the local baseline, on the live layout, and on top of itself. Undo:
-- release/undo-rejoin.sql.
--
-- Until now a member whose membership had ended could not apply again: their approved application still held the
-- email (applications_email_unique_active allows one application per email that is not declined), so /apply said
-- "You've already got an application with us"; and approving a new one would have charged them and then failed,
-- because approval inserts a members row for an account that already has one.
--
-- 1. applications.superseded_at: when an ended member applies again, their old approved application is kept as
--    it is and marked superseded; the one-application-per-email indexes (both: live has two) skip it, so the new
--    one can go in.
-- 2. approve_application_and_create_member: for an account that already has a members row, an ended membership
--    starts again on that row (same member, same history: bookings, photo, rules, plans), with the new
--    application's subscription and details; a current member (any membership whose end is not recorded) or a
--    deleted account is refused, so nobody ever has two memberships and a deleted account is never reused. A new
--    account is made as before. Same signature, same grants (service role only).

-- 1 -----------------------------------------------------------------------------------------------------
alter table public.applications add column if not exists superseded_at timestamptz;

comment on column public.applications.superseded_at is
  'Set when a later application from the same person replaces this one (a member whose membership ended applying again). The one-application-per-email index skips superseded rows.';

drop index if exists public.applications_email_unique_active;
create unique index applications_email_unique_active
on public.applications (lower(email))
where status <> 'rejected' and superseded_at is null;

-- The live database has a second, older index to the same effect (made in the dashboard, in the live dump: on email
-- as typed, pending or approved). It must skip superseded rows too, or it still blocks the new application.
drop index if exists public.applications_email_active_unique;
create unique index applications_email_active_unique
on public.applications (email)
where status in ('pending', 'approved') and superseded_at is null;

-- 2 -----------------------------------------------------------------------------------------------------
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
  v_member members%rowtype;
  v_ended boolean;
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

  select * into v_member
  from members
  where id = p_auth_user_id
  for update;

  if found then
    if v_member.deleted_at is not null then
      raise exception 'Account % was deleted: refusing to reuse it for application %', p_auth_user_id, p_application_id;
    end if;
    -- Ended means the end is recorded ('cancelled'). A cancel date or grace period that has passed but is not yet
    -- recorded still counts as current. Same test as lib/server/rejoin.ts (membershipEnded); before charging, the
    -- app also checks in Stripe that the old subscription is over (approvalBlock).
    v_ended := v_member.membership_status::text = 'cancelled';
    if not v_ended then
      raise exception 'Account % is a current member: refusing to start a second membership for application %', p_auth_user_id, p_application_id;
    end if;

    update members
    set membership_status = 'active',
        ended_at = null,
        ended_reason = null,
        cancel_at = null,
        cancel_requested_at = null,
        cancel_reason = null,
        payment_failed_at = null,
        grace_until = null,
        paused_at = null,
        full_name = coalesce(nullif(trim(v_application.full_name), ''), full_name),
        phone = coalesce(nullif(trim(v_application.phone), ''), phone),
        employer = coalesce(nullif(trim(v_application.employer), ''), employer),
        role_title = coalesce(nullif(trim(v_application.role_title), ''), role_title),
        stripe_customer_id = v_application.stripe_customer_id,
        stripe_subscription_id = v_application.stripe_subscription_id
    where id = p_auth_user_id;
  else
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
  end if;

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

-- The API (PostgREST) picks up the new column at once.
notify pgrst, 'reload schema';
