-- Adds one person to the admin and the Outreach Desk team (Albert, 19 Nov 2026: Kira, kira@clubyuppie.com, KW, Kira
-- Woodd). Run after supabase/migrations/20261120090000_desk_team.sql, with Albert's go. The app can never do this.
-- The person must already have a login (Supabase, Authentication, Users): this makes that login an admin with the
-- desk, with their initials (the RM code) and name. They then set their own password with "Forgot password" on
-- /admin/login and scan the code into their authenticator app the first time they log in.
--
-- psql (values on the command line, never saved in a file):
--   psql "$LIVE_DB_URL" -v ON_ERROR_STOP=1 -v email="kira@clubyuppie.com" -v initials="KW" -v full_name="Kira Woodd" \
--     -f release/add-desk-admin.sql
-- SQL editor or Claude Code's Supabase tool: replace :'email', :'initials' and :'full_name' below with the values in
-- quotes, run the whole thing, and don't save the query.
--
-- It stops (and changes nothing) unless the email is exactly one login and the initials are 2 or 3 capital letters
-- nobody else has. It prints only counts, never an email. Re-runnable: running it again just sets the same values.

begin;

select length(set_config('desk.new_email', :'email', true)) > 0 as email_given,
       length(set_config('desk.new_initials', :'initials', true)) > 0 as initials_given,
       length(set_config('desk.new_name', :'full_name', true)) > 0 as name_given;

do $$
declare
  n integer;
  uid uuid;
  ini text := upper(btrim(current_setting('desk.new_initials')));
  nm text := btrim(current_setting('desk.new_name'));
begin
  select count(*) into n from auth.users u where lower(u.email) = lower(btrim(current_setting('desk.new_email')));
  if n <> 1 then
    raise exception 'Expected exactly one login with that email, found %', n;
  end if;
  select u.id into uid from auth.users u where lower(u.email) = lower(btrim(current_setting('desk.new_email')));
  if ini !~ '^[A-Z]{2,3}$' then
    raise exception 'Initials must be 2 or 3 letters';
  end if;
  if exists (select 1 from public.admin_users where initials = ini and id <> uid) then
    raise exception 'Someone else already has those initials';
  end if;
  if length(nm) not between 1 and 120 then
    raise exception 'Give a name';
  end if;
  insert into public.admin_users (id) values (uid) on conflict (id) do nothing;
  update public.admin_users set desk_access = true, initials = ini, full_name = nm where id = uid;
end $$;

select count(*) as admins, count(*) filter (where desk_access or is_owner) as desk_team from public.admin_users;

commit;
