-- Phase A fix round 2, admin (fixer 3, 28 Oct 2026). Defensive and re-runnable, like the migrations before it.
--
-- QA2-04 (second round): Approve and Decline pressed at the same moment could both run: approve() charged the
-- card while decline() declined the application, so the applicant paid and got no account. Approve and Decline
-- now each claim the waiting application first, with one conditional UPDATE (claim_application below), before
-- anything touches Stripe or the row. Postgres runs two UPDATEs of the same row one after the other, and the
-- second re-reads the row and its WHERE once the first has committed, so exactly one claim wins; the other
-- action is refused and changes nothing. The winner releases the claim when it has finished (or failed).
-- A claim left behind by a crash (the function died midway) is taken over once it is older than two minutes.
--
-- Columns: processing_at (when the claim was taken), processing_by (the admin's email, for the refusal
-- message), processing_action ('approve' or 'decline'), processing_token (only the claim's own action may
-- release it).

alter table public.applications add column if not exists processing_at timestamptz;
alter table public.applications add column if not exists processing_by text;
alter table public.applications add column if not exists processing_action text;
alter table public.applications add column if not exists processing_token uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.applications'::regclass and conname = 'applications_processing_action_check'
  ) then
    alter table public.applications
      add constraint applications_processing_action_check check (processing_action is null or processing_action in ('approve', 'decline'));
  end if;
end $$;

comment on column public.applications.processing_at is
  'Set while an admin''s Approve or Decline is running (claim_application); cleared when it ends. Older than two minutes means the action died: the next one may take it over.';

-- Claim a waiting application for one action. Returns {claimed: true, token} or {claimed: false, reason:
-- 'not_found' | 'status' | 'busy', status, processing_action, processing_by, processing_at, charged}.
create or replace function public.claim_application(
  p_application_id uuid,
  p_action text,
  p_by text,
  p_stale_after interval default interval '2 minutes'
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
  v_row applications%rowtype;
begin
  if p_action not in ('approve', 'decline') then
    raise exception 'claim_application: unknown action %', p_action;
  end if;

  update applications
  set processing_at = now(),
      processing_by = p_by,
      processing_action = p_action,
      processing_token = v_token
  where id = p_application_id
    and status = 'pending'
    and (processing_at is null or processing_at < now() - p_stale_after)
  returning * into v_row;

  if found then
    return jsonb_build_object('claimed', true, 'token', v_token);
  end if;

  select * into v_row from applications where id = p_application_id;
  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object(
    'claimed', false,
    'reason', case when v_row.status::text <> 'pending' then 'status' else 'busy' end,
    'status', v_row.status::text,
    'processing_action', v_row.processing_action,
    'processing_by', v_row.processing_by,
    'processing_at', v_row.processing_at,
    'charged', v_row.stripe_subscription_id is not null
  );
end;
$$;

-- Release a claim: only the action holding it (its token) can.
create or replace function public.release_application(p_application_id uuid, p_token uuid)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  update applications
  set processing_at = null, processing_by = null, processing_action = null, processing_token = null
  where id = p_application_id and processing_token = p_token;
  return found;
end;
$$;

revoke all on function public.claim_application(uuid, text, text, interval) from public, anon, authenticated;
grant execute on function public.claim_application(uuid, text, text, interval) to service_role;
revoke all on function public.release_application(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_application(uuid, uuid) to service_role;
