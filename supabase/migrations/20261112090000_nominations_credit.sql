-- Nominations and Club Yuppie credit (Albert, 11 to 12 Nov 2026: "a member can refer an applicant. Each member will
-- get 5 referrals, each time they refer a member if approved their account will be credited with £10 (can then be
-- spent on events etc.)"; "it's 5 nominations (doesn't matter if they get approved or not)"). Defensive and
-- re-runnable: it applies on the local baseline, on the live layout, and on top of itself.
-- Undo: release/undo-nominations.sql.
--
-- 1. members.nomination_code: the member's own code (ALBERT-7K2Q), made the first time they need it; their link is
--    clubyuppie.com/apply?n=<code>. Unique whatever the case. members.nominations_allowed: 5, more if the club says.
-- 2. applications.nominated_by: the member whose link or code the application came with. Every application made with
--    it uses one of their nominations, whatever the committee decides. A guard on insert drops the nomination (keeps
--    the application) when the member has none left (two people applying with the last one at the same moment).
-- 3. credit_ledger: Club Yuppie credit, one row per change (+ added, - spent), so a balance is the sum of a member's
--    rows. Credit is not money: it is spent on Club events, never paid out. Server only (no grants).

-- 1 -----------------------------------------------------------------------------------------------------
alter table public.members add column if not exists nomination_code text;
alter table public.members add column if not exists nominations_allowed integer not null default 5;

alter table public.members drop constraint if exists members_nomination_code_check;
alter table public.members add constraint members_nomination_code_check check (nomination_code is null or nomination_code ~ '^[A-Z]{1,12}-[2-9A-HJ-NP-Z]{4}$');
alter table public.members drop constraint if exists members_nominations_allowed_check;
alter table public.members add constraint members_nominations_allowed_check check (nominations_allowed between 0 and 100);

create unique index if not exists members_nomination_code_key on public.members (upper(nomination_code)) where nomination_code is not null;

comment on column public.members.nomination_code is 'The member''s nomination code (their link is /apply?n=<code>). Server written.';
comment on column public.members.nominations_allowed is 'How many applications may come with this member''s link or code (5 unless the club gives more).';

-- 2 -----------------------------------------------------------------------------------------------------
alter table public.applications add column if not exists nominated_by uuid references public.members (id) on delete set null;
create index if not exists applications_nominated_by_idx on public.applications (nominated_by) where nominated_by is not null;

comment on column public.applications.nominated_by is 'The member who nominated this applicant (their link or code). Uses one of their nominations.';

create or replace function public.applications_nomination_guard() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed integer;
  v_used integer;
begin
  if new.nominated_by is null then
    return new;
  end if;
  -- One at a time per member, so two applications cannot both take the last nomination.
  select nominations_allowed into v_allowed from public.members where id = new.nominated_by for update;
  if v_allowed is null then
    new.nominated_by := null;
    return new;
  end if;
  select count(*) into v_used from public.applications where nominated_by = new.nominated_by;
  if v_used >= v_allowed then
    new.nominated_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists applications_nomination_guard on public.applications;
create trigger applications_nomination_guard
  before insert on public.applications
  for each row execute function public.applications_nomination_guard();

revoke all on function public.applications_nomination_guard() from public, anon, authenticated;

-- 3 -----------------------------------------------------------------------------------------------------
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  amount_pence integer not null,
  kind text not null,
  application_id uuid references public.applications (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete set null,
  note text,
  created_by text,
  dedupe_key text,
  created_at timestamptz not null default now()
);

alter table public.credit_ledger drop constraint if exists credit_ledger_amount_check;
alter table public.credit_ledger add constraint credit_ledger_amount_check check (amount_pence <> 0 and abs(amount_pence) <= 100000);
alter table public.credit_ledger drop constraint if exists credit_ledger_kind_check;
alter table public.credit_ledger add constraint credit_ledger_kind_check check (kind in ('nomination', 'admin', 'booking', 'refund'));
alter table public.credit_ledger drop constraint if exists credit_ledger_note_check;
alter table public.credit_ledger add constraint credit_ledger_note_check check (note is null or char_length(note) <= 200);

create unique index if not exists credit_ledger_dedupe_key on public.credit_ledger (dedupe_key) where dedupe_key is not null;
create index if not exists credit_ledger_member_idx on public.credit_ledger (member_id, created_at desc);

alter table public.credit_ledger enable row level security;
revoke all on public.credit_ledger from anon, authenticated;

comment on table public.credit_ledger is
  'Club Yuppie credit: one row per change (+ added, - spent). A balance is the sum of a member''s rows. Not money: spent on Club events, never paid out. Server only.';
