-- Backs drag-to-reorder on /admin/discounts and /admin/access
-- (app/admin/discounts-actions.ts's reorderPerks). Backfilled per `type`
-- so existing rows keep their current relative order (matching the
-- created_at + id ordering the admin pages used before this) rather than
-- interleaving discounts and access rows against each other.
alter table partner_perks add column display_order integer;

update partner_perks set display_order = sub.rn
from (
  select id, row_number() over (partition by type order by created_at asc, id asc) as rn
  from partner_perks
) sub
where partner_perks.id = sub.id;

alter table partner_perks alter column display_order set not null;

-- Deliberately no uniqueness constraint: reorderPerks renumbers a whole
-- type's rows at once, so transient duplicate values mid-update are fine
-- as long as the final state is a clean sequence. createPerk also relies
-- on being able to insert a new row's order one below the current min
-- without needing to renumber anything else.
