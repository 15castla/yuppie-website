-- Access perks (skip_queue / members_club / first_dibs / invite_only) never
-- show `category` anywhere. components/members/access-view.tsx groups them
-- purely by access_kind, and app/admin/perk-shared.tsx's PerkPreview never
-- reads it on the access branch. It was only ever collected because the
-- column was NOT NULL, forcing every access perk's admin form to ask an
-- irrelevant question. This drops that requirement: Discount perks are
-- unaffected and still require a category (validated in
-- app/admin/discounts-actions.ts's readPerkFields).
alter table partner_perks alter column category drop not null;

-- The inline CHECK from the original CREATE TABLE (supabase/migrations/
-- 20260915120000_add_partner_perks_table_and_media_storage.sql) didn't
-- allow NULL. Drop and recreate it to permit null alongside the existing
-- four values. Postgres's default name for an inline column CHECK is
-- <table>_<column>_check.
alter table partner_perks drop constraint if exists partner_perks_category_check;
alter table partner_perks add constraint partner_perks_category_check
  check (category is null or category in ('Food & Drink', 'Fitness', 'Grooming', 'Wellness'));

-- Cosmetic cleanup: the four access rows seeded in the original migration
-- were all given 'Food & Drink' as a required-but-meaningless placeholder.
update partner_perks set category = null where type = 'access';
