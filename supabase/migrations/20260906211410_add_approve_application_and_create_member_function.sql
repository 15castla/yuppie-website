-- Atomically provisions a member and marks the application approved, so
-- an admin retry (after a failure that happens past the Stripe-charge
-- step) can never end up with only one of "members row exists" /
-- "applications.status = approved" true. Called via .rpc(...) from
-- app/admin/applications-actions.ts's approve().
--
-- Reads stripe_customer_id and stripe_subscription_id off the
-- application row itself (both already written there before this is
-- ever called) rather than taking them as parameters, so there's one
-- source of truth for what actually got charged.
create or replace function approve_application_and_create_member(
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

  if v_application.stripe_subscription_id is null then
    raise exception 'Application % has no recorded Stripe subscription — refusing to create a member without a confirmed charge', p_application_id;
  end if;

  insert into members (
    id,
    email,
    full_name,
    phone,
    membership_status,
    stripe_customer_id,
    stripe_subscription_id
  )
  values (
    p_auth_user_id,
    v_application.email,
    v_application.full_name,
    v_application.phone,
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

-- Postgres grants EXECUTE on new functions to PUBLIC by default, which
-- would let anyone holding just the anon/publishable key (embedded in
-- client-side JS) call this directly via PostgREST and forge a
-- membership. Only the service-role client (used exclusively by
-- app/admin/*) should ever be able to call this.
revoke all on function approve_application_and_create_member(uuid, uuid, text) from public;
grant execute on function approve_application_and_create_member(uuid, uuid, text) to service_role;
