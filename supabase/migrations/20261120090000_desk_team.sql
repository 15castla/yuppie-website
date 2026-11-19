-- The Outreach Desk becomes a team desk (Albert, 19 Nov 2026: "I need to add Kira (kira@clubyuppie.com) as an admin
-- and, she will need access to the desk section too ... add an Relationship Manager (RM) column ... you can use a code
-- ... e.g. AC for me and KW (Kira Woodd) for Kira"; the timeline groups a meeting into one item; each person's own
-- settings). Replaces "owner only" (15 Nov) for the desk itself; Alex, the Outlook drafter and the 06:30 email stay
-- the owner's.
--
-- Adds: who on the admin may use the desk (the owner always can), each person's initials (the RM code) and name; the
-- Relationship Manager on each partner (every partner today starts with the owner, AC); notes and action points tied
-- to a meeting or call (an action point of kind meeting or call); and each person's own guidance for the emails Alex
-- writes (until now one set, the owner's).
-- Re-runnable on top of itself. Undo: release/undo-desk-team.sql. A person is added to the desk team with
-- release/add-desk-admin.sql, never by the app.

-- 1. The desk team ----------------------------------------------------------------------------------------------
alter table public.admin_users add column if not exists desk_access boolean not null default false;
alter table public.admin_users add column if not exists initials text;
alter table public.admin_users add column if not exists full_name text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'admin_users_initials_check') then
    alter table public.admin_users add constraint admin_users_initials_check check (initials is null or initials ~ '^[A-Z]{2,3}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'admin_users_full_name_check') then
    alter table public.admin_users add constraint admin_users_full_name_check check (full_name is null or length(btrim(full_name)) between 1 and 120);
  end if;
end $$;
create unique index if not exists admin_users_initials on public.admin_users (initials) where initials is not null;
comment on column public.admin_users.desk_access is 'Can use the Outreach Desk (the owner always can). Set by release/add-desk-admin.sql, never by the app.';
comment on column public.admin_users.initials is 'The person''s code on the desk, shown as a partner''s Relationship Manager (AC, KW).';

-- the owner is Albert Castle, AC
update public.admin_users set desk_access = true where is_owner and not desk_access;
update public.admin_users set initials = 'AC'
 where is_owner and initials is null and not exists (select 1 from public.admin_users where initials = 'AC');
update public.admin_users set full_name = 'Albert Castle' where is_owner and full_name is null;

-- 2. The Relationship Manager on each partner -------------------------------------------------------------------
alter table public.outreach_targets add column if not exists rm uuid references public.admin_users (id) on delete set null;
create index if not exists outreach_targets_rm_idx on public.outreach_targets (rm);
comment on column public.outreach_targets.rm is 'The Relationship Manager: the person on the desk who looks after this partner (admin_users.id).';
update public.outreach_targets set rm = (select id from public.admin_users where is_owner limit 1) where rm is null;

-- 3. Meetings: notes and action points tied to a meeting or call ------------------------------------------------
alter table public.outreach_notes add column if not exists meeting_id uuid references public.outreach_actions (id) on delete set null;
alter table public.outreach_actions add column if not exists meeting_id uuid references public.outreach_actions (id) on delete set null;
create index if not exists outreach_notes_meeting_idx on public.outreach_notes (meeting_id) where meeting_id is not null;
create index if not exists outreach_actions_meeting_idx on public.outreach_actions (meeting_id) where meeting_id is not null;
comment on column public.outreach_notes.meeting_id is 'The meeting or call these notes are from (an outreach_actions row of kind meeting or call).';
comment on column public.outreach_actions.meeting_id is 'The meeting or call this action point came out of.';

-- 4. Each person's own guidance for the emails Alex writes -------------------------------------------------------
alter table public.outreach_guidance add column if not exists admin_id uuid references public.admin_users (id) on delete cascade;
update public.outreach_guidance set admin_id = (select id from public.admin_users where is_owner limit 1) where admin_id is null;
-- only when there is no owner at all (a fresh database): guidance nobody owns can't be used
delete from public.outreach_guidance where admin_id is null;
alter table public.outreach_guidance alter column admin_id set not null;
alter table public.outreach_guidance drop constraint if exists outreach_guidance_pkey;
alter table public.outreach_guidance add constraint outreach_guidance_pkey primary key (admin_id, kind);
comment on table public.outreach_guidance is 'Outreach Desk: each person''s guidance for each kind of email Alex writes for them. Alex writes a kind only once it is approved. Desk team only.';

-- 5. The tables say who may read them --------------------------------------------------------------------------
comment on table public.outreach_targets is 'Outreach Desk: the businesses Club Yuppie approaches. Desk team only (service role; RLS on, no policies).';
