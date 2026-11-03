-- For the App Store submission (3 Nov 2026). Safe to run again. Run it BEFORE the code that uses it goes live: the
-- members area reads the new members columns on every page, and before they exist every member would be sent
-- to Log in.
--
-- 1. members.rules_agreed_at: when the member agreed to the community rules (Apple guideline 1.2: apps with member
--    posts and chat need users to agree to terms with no tolerance for objectionable content). Null: the rules gate
--    (app/members/require-member.ts) stops them at their next screen until they agree.
-- 2. members.concierge_consent_at: when the member agreed that their Concierge questions are sent to Anthropic
--    (Apple guideline 5.1.2(i): explicit permission before personal data goes to a third-party AI). Null: the
--    Concierge shows its permission screen and the server sends nothing.
-- 3. members.is_review_account: true only for the App Review account (release/review-account.mjs). The fixed review
--    code (lib/server/review-login.ts) works only for a member marked so, never for anyone else or an admin, whatever
--    REVIEW_LOGIN_EMAIL says.
--    All three are server columns, like photo_id and chat_safety_seen_at: no column grant, so members can read them
--    on their own row (the table's select policy) but never write them.
-- 4. review_login_attempts and review_login_take_try(): each try of the review code takes a row first, under one
--    lock, so tries sent at the same time cannot slip past the limit: ten not-successful tries in an hour, or thirty
--    in a day, and no more are taken until they age out. ok is null while a try is being checked. Service role only.

alter table public.members add column if not exists rules_agreed_at timestamptz;
alter table public.members add column if not exists concierge_consent_at timestamptz;
alter table public.members add column if not exists is_review_account boolean not null default false;

create table if not exists public.review_login_attempts (
  id bigserial primary key,
  at timestamptz not null default now(),
  ok boolean
);
alter table public.review_login_attempts alter column ok drop not null;
create index if not exists review_login_attempts_at on public.review_login_attempts (at);
alter table public.review_login_attempts enable row level security;
revoke all on public.review_login_attempts from anon, authenticated;
revoke all on sequence public.review_login_attempts_id_seq from anon, authenticated;

create or replace function public.review_login_take_try() returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('review_login_take_try', 0));
  if (select count(*) from public.review_login_attempts where ok is distinct from true and at > now() - interval '1 hour') >= 10
     or (select count(*) from public.review_login_attempts where ok is distinct from true and at > now() - interval '24 hours') >= 30 then
    return null;
  end if;
  insert into public.review_login_attempts (ok) values (null) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.review_login_take_try() from public, anon, authenticated;
grant execute on function public.review_login_take_try() to service_role;
