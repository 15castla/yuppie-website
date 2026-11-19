-- Undo supabase/migrations/20261120090000_desk_team.sql: the desk goes back to the owner only. Removes desk access,
-- initials and names, every partner's Relationship Manager, the links from notes and action points to a meeting, and
-- everyone's guidance but the owner's (which goes back to one row per kind). Kira (and anyone else added with
-- release/add-desk-admin.sql) stays an admin but loses the desk. Nothing else changes: notes and action points stay.
-- Roll the site back first and run it only with Albert's explicit go.

begin;
-- guidance: the owner's only, one row per kind again
delete from public.outreach_guidance where admin_id is distinct from (select id from public.admin_users where is_owner limit 1);
alter table public.outreach_guidance drop constraint if exists outreach_guidance_pkey;
alter table public.outreach_guidance drop column if exists admin_id;
alter table public.outreach_guidance add constraint outreach_guidance_pkey primary key (kind);

drop index if exists public.outreach_notes_meeting_idx;
drop index if exists public.outreach_actions_meeting_idx;
alter table public.outreach_notes drop column if exists meeting_id;
alter table public.outreach_actions drop column if exists meeting_id;

drop index if exists public.outreach_targets_rm_idx;
alter table public.outreach_targets drop column if exists rm;

drop index if exists public.admin_users_initials;
alter table public.admin_users drop constraint if exists admin_users_initials_check;
alter table public.admin_users drop constraint if exists admin_users_full_name_check;
alter table public.admin_users drop column if exists desk_access, drop column if exists initials, drop column if exists full_name;
commit;

notify pgrst, 'reload schema';
