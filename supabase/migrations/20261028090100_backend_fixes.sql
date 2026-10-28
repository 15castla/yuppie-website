-- Members backend, Phase A fix round (fixer 1: backend and money). Applies on
-- top of 20261028090000_members_core_backend.sql, with it and the admin fixes
-- (20261028090200) in one release. Like the first, it is safe to run more
-- than once: every column is "add column if not exists", every policy and
-- index is dropped or made "if exists / if not exists".
--
-- 1. Refund retries (QA3-07). A refund Stripe did not answer (a timeout, a
--    crash, a Stripe error) stays 'pending' with no stripe_refund_id, and the
--    refunds job (GET /api/cron/refunds) tries it again with the same
--    idempotency key. refund_attempts counts the tries (the claim is made on
--    status and count together, so two callers never both try); after the
--    third failure the booking is 'failed' and the club is alerted.
--    refund_attempted_at is when the last try was claimed: the job leaves a
--    refund alone for 5 minutes after it.
-- 2. Applications (QA3-12). /apply inserts with the service role
--    (app/apply/actions.ts), and nothing else writes applications with a
--    member's or a visitor's key (the native app does not insert them). The
--    live policy "Anyone can apply" (INSERT for anon and authenticated, WITH
--    CHECK true) let anyone insert any row through the REST API, including
--    status 'approved' with made-up Stripe ids. It goes, and so does the
--    INSERT grant to anon and authenticated.

-- ---------------------------------------------------------------------------
-- 1. bookings: refund retries
-- ---------------------------------------------------------------------------

alter table public.bookings add column if not exists refund_attempts integer not null default 0;
alter table public.bookings add column if not exists refund_attempted_at timestamptz;

alter table public.bookings drop constraint if exists bookings_refund_attempts_check;
alter table public.bookings add constraint bookings_refund_attempts_check check (refund_attempts >= 0);

-- What the refunds job looks for: cancelled bookings whose refund is not done.
create index if not exists bookings_refund_due_idx
  on public.bookings (refund_status, refund_attempted_at)
  where status = 'cancelled' and refund_status in ('none', 'pending');

-- ---------------------------------------------------------------------------
-- 2. applications: no inserts through the REST API
-- ---------------------------------------------------------------------------

drop policy if exists "Anyone can apply" on public.applications;
revoke insert on public.applications from anon, authenticated;
