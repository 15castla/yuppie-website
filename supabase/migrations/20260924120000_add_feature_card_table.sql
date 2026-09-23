-- Generalizes the black card at the top of /members/access from
-- "featured invite-only event" (events.is_invite_only_feature +
-- events.invite_only_label) to "feature card" — any single event,
-- discount, or access perk, picked from one dropdown on /admin/access
-- (see app/admin/feature-card-actions.ts's setFeatureCard).
--
-- The `id boolean primary key default true check (id)` trick guarantees
-- at most one row can ever exist, enforced by Postgres rather than
-- application discipline — id can only ever be `true` (the check), and
-- true can only ever appear once in a primary key column.
create table feature_card (
  id boolean primary key default true check (id),
  content_type text not null check (content_type in ('event', 'discount', 'access')),
  content_id uuid not null,
  label text,
  updated_at timestamptz not null default now()
);

-- Carries over whichever event was previously featured, if any, so this
-- migration doesn't blank out a live card.
insert into feature_card (content_type, content_id, label)
select 'event', id, invite_only_label from events where is_invite_only_feature = true limit 1;

alter table events drop column is_invite_only_feature;
alter table events drop column invite_only_label;
