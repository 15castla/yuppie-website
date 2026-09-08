-- Employer and role/job title were never carried from applications to
-- members on approval, even though both are already on v_application
-- (select * into v_application from applications). No other query
-- changes needed, just two more columns in the insert.
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

revoke all on function approve_application_and_create_member(uuid, uuid, text) from public;
grant execute on function approve_application_and_create_member(uuid, uuid, text) to service_role;
