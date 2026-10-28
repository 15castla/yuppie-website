-- UNDO for supabase/migrations/20261028090000_members_core_backend.sql, back to the live layout of 27 Oct 2026
-- (live-schema/supabase-layout-2026-10-27.md). Read release/live-migration-notes.md first.
--
-- It deletes data: the new tables (message_log, stripe_events, admin_audit, event_addresses) and the new
-- columns (cancel dates, refund records, reminders, addresses). Export them first (see the notes).
-- To put the old unique rule back it also deletes cancelled booking rows that share a member and event with
-- another row (a member who cancelled and booked again keeps only the newer row).
-- Kept on purpose: approve_application_and_create_member stays service-role only (re-granting it to anon and
-- authenticated would reopen a hole).
-- Run it with the previous release's code deployed (or about to be): this code needs the new columns.
begin;

-- ---- policies back exactly as live
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in ('members', 'bookings') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;
create policy "Members can update their own row" on public.members for update to public using (auth.uid() = id) with check (auth.uid() = id);
create policy "Members can view their own row" on public.members for select to public using (auth.uid() = id);
create policy "Members read own profile" on public.members for select to public using (auth.uid() = id);
create policy "Members update own profile" on public.members for update to public using (auth.uid() = id);
create policy "Members can insert their own bookings" on public.bookings for insert to public with check (auth.uid() = member_id);
create policy "Members can view their own bookings" on public.bookings for select to public using (auth.uid() = member_id);
create policy "Members cancel own bookings" on public.bookings for update to public using (auth.uid() = member_id);
create policy "Members create own bookings" on public.bookings for insert to public with check (auth.uid() = member_id);
create policy "Members read own bookings" on public.bookings for select to public using (auth.uid() = member_id);

-- ---- grants back (live: the full set on every table)
revoke update (full_name, phone, employer, role_title, bio, avatar_url) on public.members from authenticated;
grant all on public.members, public.bookings to anon, authenticated;

-- ---- bookings: the old unique rule, the old columns and checks
delete from public.bookings b
 using public.bookings c
 where b.member_id = c.member_id and b.event_id = c.event_id and b.id <> c.id
   and b.status = 'cancelled' and (c.status = 'confirmed' or c.booked_at > b.booked_at);
drop index if exists public.bookings_one_confirmed_per_member_event;
drop index if exists public.bookings_stripe_payment_intent_unique;
drop index if exists public.bookings_event_status_idx;
drop index if exists public.bookings_member_status_idx;
alter table public.bookings add constraint bookings_member_id_event_id_key unique (member_id, event_id);
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings drop constraint if exists bookings_cancelled_by_check;
alter table public.bookings drop constraint if exists bookings_cancel_reason_check;
alter table public.bookings drop constraint if exists bookings_refund_status_check;
alter table public.bookings drop constraint if exists bookings_amount_pence_check;
drop trigger if exists bookings_set_updated_at on public.bookings;
alter table public.bookings
  drop column if exists amount_pence, drop column if exists cancelled_at, drop column if exists cancelled_by,
  drop column if exists cancel_reason, drop column if exists refund_status, drop column if exists refund_pence,
  drop column if exists stripe_refund_id, drop column if exists refund_error, drop column if exists reminder_24h_sent_at,
  drop column if exists reminder_2h_sent_at, drop column if exists updated_at;

-- ---- members
alter table public.members drop constraint if exists members_ended_reason_check;
drop index if exists public.members_stripe_subscription_id_idx;
drop index if exists public.members_stripe_customer_id_idx;
drop trigger if exists members_set_updated_at on public.members;
alter table public.members
  drop column if exists cancel_at, drop column if exists cancel_requested_at, drop column if exists cancel_reason,
  drop column if exists payment_failed_at, drop column if exists grace_until, drop column if exists paused_at,
  drop column if exists ended_at, drop column if exists ended_reason, drop column if exists deleted_at,
  drop column if exists updated_at;

-- ---- events (tier NOT NULL again only if every event has one; otherwise it stays optional)
drop trigger if exists events_set_updated_at on public.events;
alter table public.events
  drop column if exists cancelled_at, drop column if exists cancel_note, drop column if exists updated_at,
  drop column if exists changed_at;
do $$
begin
  if not exists (select 1 from public.events where tier is null) then
    alter table public.events alter column tier set not null;
  else
    raise notice 'events.tier left optional: % events have no tier', (select count(*) from public.events where tier is null);
  end if;
end $$;

-- ---- applications
alter table public.applications drop column if exists card_released_at;

-- ---- the new tables and functions
drop function if exists public.book_event(uuid, uuid, integer, text, boolean);
drop table if exists public.message_log;
drop table if exists public.stripe_events;
drop table if exists public.admin_audit;
drop table if exists public.event_addresses;
drop function if exists public.set_updated_at();

commit;
