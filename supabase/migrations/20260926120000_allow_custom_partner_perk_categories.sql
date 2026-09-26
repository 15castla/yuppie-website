-- Lets admins type a brand new discount category into the Category
-- dropdown at /admin/discounts (see app/admin/discounts-actions.ts and
-- app/admin/(protected)/discounts/NewPerkForm.tsx / EditPerkForm.tsx)
-- rather than being limited to the fixed four values the original CHECK
-- constraint allowed (from 20260915120000_add_partner_perks_table_and_media_storage.sql,
-- replaced in 20260916090000_make_perk_category_optional_for_access.sql to
-- permit null for Access perks). Still requires a non-empty value when
-- category is set at all, just no longer limited to a fixed list.
alter table partner_perks drop constraint if exists partner_perks_category_check;
alter table partner_perks add constraint partner_perks_category_check
  check (category is null or length(trim(category)) > 0);
