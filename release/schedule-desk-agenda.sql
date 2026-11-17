-- Alex's 06:30 email to Albert (Outreach Desk, Phase 3, 17 Nov 2026): schedule /api/cron/desk-agenda with pg_cron,
-- using the cron secret already in Vault (club_yuppie_cron_secret, set by release/schedule-cron.sql). No secret in
-- this file: run it as it is, in the SQL editor or through the Supabase MCP, after the deploy.
--
-- pg_cron runs in UTC, so the job is called at 05:30 and 06:30 UTC; the site sends only in the run that is 06:xx in
-- the UK (05:30 UTC in summer time, 06:30 UTC in winter) and only once a day (desk_agenda_runs). Safe to run again:
-- the job is rescheduled under its name.

select cron.schedule(
  'club-yuppie-desk-agenda',
  '30 5,6 * * *',
  $$
  select net.http_get(
    url := 'https://clubyuppie.com/api/cron/desk-agenda',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'club_yuppie_cron_secret')),
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);

-- Check:
--   select jobname, schedule, active from cron.job where jobname = 'club-yuppie-desk-agenda';
--     expect one row, '30 5,6 * * *', active
--   the morning after: select day, sent_at, counts from public.desk_agenda_runs order by day desc limit 3;
-- To stop it: select cron.unschedule('club-yuppie-desk-agenda');
