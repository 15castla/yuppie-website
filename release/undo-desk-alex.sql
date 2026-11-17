-- Undo supabase/migrations/20261119090000_desk_alex.sql: removes Alex's tables (the guidance, the Desk connector's
-- clients, codes and grants, the 06:30 email record and its schedule) and the reply-draft columns. Phases 1 and 2
-- stay. Albert's Claude account loses the Desk connector at once. Roll the site back first and run it only with Albert's explicit go.

begin;
-- the 06:30 email's schedule (release/schedule-desk-agenda.sql), when it was set
do $$
declare scheduled boolean := false;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    execute 'select exists (select 1 from cron.job where jobname = $1)' into scheduled using 'club-yuppie-desk-agenda';
    if scheduled then
      execute 'select cron.unschedule($1)' using 'club-yuppie-desk-agenda';
    end if;
  end if;
end $$;
drop table if exists public.desk_connector_grants;
drop table if exists public.desk_connector_codes;
drop table if exists public.desk_connector_clients;
drop table if exists public.desk_agenda_runs;
drop table if exists public.outreach_guidance;
drop index if exists public.outreach_draft_texts_outcome;
alter table public.outreach_draft_texts drop column if exists draft_id, drop column if exists draft_link, drop column if exists draft_error;
commit;

notify pgrst, 'reload schema';
