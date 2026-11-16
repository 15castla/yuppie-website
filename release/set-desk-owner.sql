-- Make one admin the owner: the only admin who can see the Outreach Desk (Albert, 15 Nov 2026). Run once, after
-- supabase/migrations/20261117090000_outreach_desk.sql, with Albert's go. The app can never set or change this.
--
-- psql (the email Albert signs in to /admin with, given on the command line, never saved in a file):
--   psql "$LIVE_DB_URL" -v ON_ERROR_STOP=1 -v owner_email="<Albert's admin email>" -f release/set-desk-owner.sql
-- SQL editor or Claude Code's Supabase tool: replace :'owner_email' below with the email in quotes, run the whole
-- thing, and don't save the query.
--
-- It stops with "Expected exactly one admin with that email" (and changes nothing) unless that email is exactly one
-- admin. It prints only a count, never an email.

begin;

-- (set_config returns its value, so only whether it was given is shown)
select length(set_config('desk.owner_email', :'owner_email', true)) > 0 as email_given;

do $$
declare
  n integer;
begin
  select count(*) into n
    from public.admin_users a
    join auth.users u on u.id = a.id
   where lower(u.email) = lower(current_setting('desk.owner_email'));
  if n <> 1 then
    raise exception 'Expected exactly one admin with that email, found %', n;
  end if;
  update public.admin_users set is_owner = false where is_owner;
  update public.admin_users a
     set is_owner = true
    from auth.users u
   where u.id = a.id
     and lower(u.email) = lower(current_setting('desk.owner_email'));
end $$;

select count(*) as owners from public.admin_users where is_owner;

commit;
