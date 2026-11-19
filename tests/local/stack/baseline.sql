-- Base schema for the local stack: the live database as it was before the repo's migrations ran, so that
-- baseline + supabase/migrations/* (apply_repo.sh) gives the live layout of 27 Oct 2026 exactly
-- (/home/claude/build-a/live-schema/supabase-layout-2026-10-27.md: types, nullability, defaults, constraints,
-- indexes, the slug trigger, the RLS auto-enable event trigger, every policy as listed, full grants).
-- Rewritten 27 Oct by the foundation agent from that dump (the earlier file was a reconstruction).
--
-- Left to the repo migrations, because they create them without IF NOT EXISTS and would fail if they existed:
-- applications_email_unique_active (20260906204330), events.slug and events_slug_unique (20260909190148),
-- partner_perks and its policy (20260915120000, 20260921120000), feature_card (20260924120000), the
-- approve_application_and_create_member function, the stripe columns on applications, the focal point.

-- ---------------------------------------------------------------- enums (live: public schema)
create type public.application_status as enum ('pending', 'approved', 'rejected');
create type public.booking_status as enum ('confirmed', 'cancelled', 'waitlisted');
create type public.event_category as enum ('entertainment', 'sport', 'personal_progression');
create type public.event_tier as enum ('weekly', 'monthly', 'quarterly', 'annual');
create type public.membership_status as enum ('active', 'paused', 'cancelled');

-- ---------------------------------------------------------------- RLS on every new public table (live: rls_auto_enable)
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
     if cmd.schema_name is not null and cmd.schema_name in ('public') and cmd.schema_name not in ('pg_catalog', 'information_schema') and cmd.schema_name not like 'pg_toast%' and cmd.schema_name not like 'pg_temp%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
     else
        raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     end if;
  end loop;
end;
$function$;
-- The dump lists the function but not the trigger's name; ensure_rls is the name Supabase gives it.
drop event trigger if exists ensure_rls;
create event trigger ensure_rls on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();

-- ---------------------------------------------------------------- tables
create table public.admin_users (
  id uuid not null,
  created_at timestamptz not null default now(),
  constraint admin_users_pkey primary key (id),
  constraint admin_users_id_fkey foreign key (id) references auth.users (id) on delete cascade
);

create table public.applications (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  email text not null,
  phone text,
  employer text,
  role_title text,
  status public.application_status not null default 'pending'::public.application_status,
  reviewed_at timestamptz,
  reviewed_by text,
  linkedin_url text,
  instagram_username text,
  constraint applications_pkey primary key (id)
);

create table public.members (
  id uuid not null,
  email text not null,
  full_name text,
  phone text,
  bio text,
  avatar_url text,
  membership_status public.membership_status not null default 'active'::public.membership_status,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  constraint members_pkey primary key (id),
  constraint members_email_key unique (email),
  constraint members_id_fkey foreign key (id) references auth.users (id) on delete cascade
);

create table public.events (
  id uuid not null default gen_random_uuid(),
  title text not null,
  description text,
  category public.event_category not null,
  tier public.event_tier not null,
  location text,
  start_time timestamptz not null,
  end_time timestamptz,
  price_pence integer not null default 0,
  capacity integer not null,
  image_url text,
  created_at timestamptz not null default now(),
  constraint events_pkey primary key (id)
);

create table public.bookings (
  id uuid not null default gen_random_uuid(),
  member_id uuid not null,
  event_id uuid not null,
  status public.booking_status not null default 'confirmed'::public.booking_status,
  stripe_payment_intent_id text,
  booked_at timestamptz not null default now(),
  constraint bookings_pkey primary key (id),
  constraint bookings_member_id_event_id_key unique (member_id, event_id),
  constraint bookings_member_id_fkey foreign key (member_id) references public.members (id) on delete cascade,
  constraint bookings_event_id_fkey foreign key (event_id) references public.events (id) on delete cascade
);

create table public.invited_emails (
  email text not null,
  application_id uuid,
  invite_code text not null default encode(gen_random_bytes(9), 'base64'::text),
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + '14 days'::interval),
  used boolean not null default false,
  reminder_sent_at timestamptz,
  constraint invited_emails_pkey primary key (email),
  constraint invited_emails_invite_code_key unique (invite_code),
  constraint invited_emails_application_id_fkey foreign key (application_id) references public.applications (id)
);

-- ---------------------------------------------------------------- indexes (live, besides the keys above)
create unique index applications_email_active_unique on public.applications using btree (email)
  where (status = any (array['pending'::public.application_status, 'approved'::public.application_status]));
create index idx_applications_email on public.applications using btree (email);
create index idx_applications_status on public.applications using btree (status);
create index idx_bookings_event on public.bookings using btree (event_id);
create index idx_bookings_member on public.bookings using btree (member_id);
create index idx_events_category on public.events using btree (category);
create index idx_events_start_time on public.events using btree (start_time);

-- ---------------------------------------------------------------- RLS and policies (exactly as live, duplicates included)
alter table public.admin_users enable row level security;
alter table public.applications enable row level security;
alter table public.bookings enable row level security;
alter table public.events enable row level security;
alter table public.invited_emails enable row level security;
alter table public.members enable row level security;
-- admin_users: RLS on, no policies (only the service role reads it).

create policy "Admins can read applications" on public.applications for select to public
  using (exists (select 1 from public.admin_users where admin_users.id = auth.uid()));
create policy "Admins can update applications" on public.applications for update to public
  using (exists (select 1 from public.admin_users where admin_users.id = auth.uid()));
create policy "Anyone can apply" on public.applications for insert to anon, authenticated
  with check (true);

create policy "Members can insert their own bookings" on public.bookings for insert to public
  with check (auth.uid() = member_id);
create policy "Members can view their own bookings" on public.bookings for select to public
  using (auth.uid() = member_id);
create policy "Members cancel own bookings" on public.bookings for update to public
  using (auth.uid() = member_id);
create policy "Members create own bookings" on public.bookings for insert to public
  with check (auth.uid() = member_id);
create policy "Members read own bookings" on public.bookings for select to public
  using (auth.uid() = member_id);

create policy "Admins can manage events" on public.events for all to public
  using (exists (select 1 from public.admin_users where admin_users.id = auth.uid()));
create policy "Members read events" on public.events for select to authenticated
  using (true);

create policy "Admins can insert invited_emails" on public.invited_emails for insert to public
  with check (exists (select 1 from public.admin_users where admin_users.id = auth.uid()));
create policy "Admins can read invited_emails" on public.invited_emails for select to public
  using (exists (select 1 from public.admin_users where admin_users.id = auth.uid()));

create policy "Members can update their own row" on public.members for update to public
  using (auth.uid() = id) with check (auth.uid() = id);
create policy "Members can view their own row" on public.members for select to public
  using (auth.uid() = id);
create policy "Members read own profile" on public.members for select to public
  using (auth.uid() = id);
create policy "Members update own profile" on public.members for update to public
  using (auth.uid() = id);

-- ---------------------------------------------------------------- grants (live: the full set to both roles on every table)
grant all on all tables in schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------- example rows (the four seeded events; ids as live)
insert into public.events (id, title, description, category, tier, location, start_time, price_pence, capacity) values
 ('a1111111-0000-4000-8000-000000000001', 'Padel & Pints', 'Doubles then drinks.', 'sport', 'monthly', 'Northgate Courts', now() + interval '10 days', 1500, 16),
 ('a1111111-0000-4000-8000-000000000002', 'Supper Club: Wine & Charcuterie', 'Long table supper.', 'entertainment', 'monthly', 'The Cellar', now() + interval '17 days', 3500, 20),
 ('a1111111-0000-4000-8000-000000000003', 'Sunrise Wellness Retreat', 'Breathwork and breakfast.', 'personal_progression', 'quarterly', 'Hartley Polo Grounds', now() + interval '24 days', 0, 30),
 ('a1111111-0000-4000-8000-000000000004', 'Rooftop Social: End of Summer', 'Drinks on the roof.', 'entertainment', 'monthly', 'Petra Rooftop', now() + interval '31 days', 0, 60);

-- ---------------------------------------------------------------- the slug trigger (live). Made after the example rows,
-- because events.slug only exists once 20260909190148 has run (it backfills these four by id).
create or replace function public.events_generate_slug()
returns trigger
language plpgsql
as $function$
declare
  base_slug text;
  candidate text;
  suffix int := 1;
begin
  if new.slug is null or btrim(new.slug) = '' then
    base_slug := lower(regexp_replace(new.title, '[^a-zA-Z0-9]+', '-', 'g'));
    base_slug := trim(both '-' from base_slug);
    base_slug := base_slug || '-' || to_char(new.start_time, 'YYYY-MM-DD');
    candidate := base_slug;
    while exists (
      select 1 from events
      where slug = candidate
        and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) loop
      suffix := suffix + 1;
      candidate := base_slug || '-' || suffix;
    end loop;
    new.slug := candidate;
  end if;
  return new;
end;
$function$;
create trigger events_set_slug before insert on public.events for each row execute function public.events_generate_slug();
