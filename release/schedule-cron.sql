-- Schedule the members backend's jobs with Supabase Cron (pg_cron) and pg_net (QA3 checklist 4). Vercel's
-- Hobby plan allows one cron run a day, and the jobs need every 15 minutes, so the database calls the site.
--
-- Run once after the deploy, as postgres, with psql (the cron secret comes from the environment, never from
-- a file or a chat; it is the same CRON_SECRET the site has in Vercel production):
--
--   psql "$LIVE_DB_URL" -v ON_ERROR_STOP=1 -v cron_secret="$CRON_SECRET" -f release/schedule-cron.sql
--
-- (In the SQL editor instead: replace both :'cron_secret' below with the secret in quotes, run, and do not save
-- the query.) Safe to run again: the secret is updated in place and each job is rescheduled under its name.
--
-- Follows Supabase's guides "Cron: Install", "Scheduling Edge Functions" (pg_net plus Vault) and
-- "Vault": pg_cron in pg_catalog, pg_net in extensions, the secret in vault.secrets read through
-- vault.decrypted_secrets at run time.
--
-- Each job: GET https://clubyuppie.com/api/cron/<job> with "Authorization: Bearer <secret>". The jobs are
-- idempotent and safe every 15 minutes; they run on different minutes so they never overlap.
--   reminders    02, 17, 32, 47  (24-hour and 2-hour event reminder emails)
--   memberships  07, 22, 37, 52  (grace over, cancel dates passed, A-D8 sweeps; it asks Stripe first)
--   refunds      12, 27, 42, 57  (refunds Stripe never answered, retried; QA3-07)

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
create extension if not exists pg_net with schema extensions;

-- The secret, in Vault (made the first time, updated after). Plain statements, so psql fills in :'cron_secret'.
select vault.create_secret(:'cron_secret', 'club_yuppie_cron_secret', 'Bearer token for https://clubyuppie.com/api/cron/* (CRON_SECRET in Vercel)')
 where not exists (select 1 from vault.secrets where name = 'club_yuppie_cron_secret');
select vault.update_secret(id, :'cron_secret') from vault.secrets where name = 'club_yuppie_cron_secret';

select cron.schedule(
  'club-yuppie-reminders',
  '2,17,32,47 * * * *',
  $$
  select net.http_get(
    url := 'https://clubyuppie.com/api/cron/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'club_yuppie_cron_secret')),
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);

select cron.schedule(
  'club-yuppie-memberships',
  '7,22,37,52 * * * *',
  $$
  select net.http_get(
    url := 'https://clubyuppie.com/api/cron/memberships',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'club_yuppie_cron_secret')),
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);

select cron.schedule(
  'club-yuppie-refunds',
  '12,27,42,57 * * * *',
  $$
  select net.http_get(
    url := 'https://clubyuppie.com/api/cron/refunds',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'club_yuppie_cron_secret')),
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);

-- Check (also after the first quarter hour):
--   select jobname, schedule, active from cron.job where jobname like 'club-yuppie-%' order by 1;
--     expect three rows, active
--   select jobid, status, return_message, start_time from cron.job_run_details order by start_time desc limit 9;
--     expect succeeded (pg_cron only queued the request)
--   select id, status_code, left(content, 200), error_msg, created from net._http_response order by created desc limit 9;
--     expect 200 and {"job":"...","ok":true,...}; 401 means the secret differs from CRON_SECRET in Vercel
-- To stop one: select cron.unschedule('club-yuppie-refunds');
