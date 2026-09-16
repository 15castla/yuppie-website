-- Partner perks (discounts + access), previously hardcoded as MOCK_PERKS in
-- components/members/mock-perks.ts. One table for both "discount" and
-- "access" rows (see the original comment in that file) so the admin side
-- has one thing to manage, split by `type` on the member-facing pages.
-- Seeded below with the exact rows that were in MOCK_PERKS so the Discounts
-- and Access pages don't regress the moment this ships.
create table if not exists partner_perks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('Food & Drink', 'Fitness', 'Grooming', 'Wellness')),
  area text not null,
  type text not null check (type in ('discount', 'access')),
  access_kind text check (access_kind in ('skip_queue', 'members_club', 'first_dibs', 'invite_only')),
  headline text not null,
  badge text,
  logo_url text,
  created_at timestamptz not null default now()
);

alter table partner_perks enable row level security;

-- Same shared-catalog rationale as events: the member-facing pages read
-- this via the service-role client (components/members/perks-data.ts), not
-- a member-scoped one, so no member SELECT policy is needed. Only admins
-- manage rows directly (defense in depth — the admin server actions also
-- call requireAdmin() independently, same pattern as every other admin
-- action in this codebase).
create policy "Admins can manage partner perks"
  on partner_perks
  for all
  using (exists (select 1 from admin_users where id = auth.uid()))
  with check (exists (select 1 from admin_users where id = auth.uid()));

insert into partner_perks (name, category, area, type, access_kind, headline, badge) values
  ('Bellina Trattoria', 'Food & Drink', 'Soho', 'discount', null, '20% off food, Mon–Thu', '20%'),
  ('Forge Fitness Studios', 'Fitness', 'Shoreditch', 'discount', null, '1 free class, then 15% off packages', '15%'),
  ('Hoxton Barbers Co.', 'Grooming', 'Hoxton', 'discount', null, '10% off every visit', '10%'),
  ('Lumen Sauna House', 'Wellness', 'Bermondsey', 'discount', null, '25% off single sessions', '25%'),
  ('Petra Rooftop Bar', 'Food & Drink', 'King''s Cross', 'discount', null, '2-for-1 cocktails before 8pm', '2-for-1'),
  ('Casa Fiora', 'Food & Drink', 'Mayfair', 'access', 'skip_queue', 'Show your membership at the door, Fri–Sat', null),
  ('The Vault, Shoreditch', 'Food & Drink', 'Shoreditch', 'access', 'skip_queue', 'Priority line every night after 10pm', null),
  ('Harewood House', 'Food & Drink', 'Mayfair', 'access', 'members_club', 'Reciprocal guest access, Mon–Wed', null),
  ('24hr early access', 'Food & Drink', 'Citywide', 'access', 'first_dibs', 'To any event that looks like it''ll sell out', null);

-- Single public bucket for member-facing images uploaded via the admin
-- panel (event photos, partner logos) and member self-service uploads
-- (profile photos) — folders (events/, perks/, avatars/) keep them apart.
-- `public: true` serves objects over the public URL with no RLS policy
-- needed for reads; every write goes through the service-role client from
-- a server action (app/admin/*, app/members/profile/actions.ts), which
-- bypasses storage RLS entirely, so no INSERT/UPDATE policy is needed
-- either — mirrors how every other admin write in this codebase works.
insert into storage.buckets (id, name, public)
values ('member-media', 'member-media', true)
on conflict (id) do nothing;
