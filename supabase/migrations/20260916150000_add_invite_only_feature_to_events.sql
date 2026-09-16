-- Backs the black "Invite Only" teaser card at the top of
-- /members/access (components/members/access-view.tsx), which used to be
-- hardcoded placeholder copy ("Rooftop Closing Party") with no admin
-- control at all. Featuring an event there now just means flipping this
-- flag on it — admins pick from a dropdown of real events at /admin/access
-- rather than typing free-text that could drift from what's actually
-- happening.
alter table events add column if not exists is_invite_only_feature boolean not null default false;

-- Enforces "only one event can be selected" at the database level, not just
-- in the admin UI's <select> (defense in depth — see the same rationale
-- throughout this project's RLS policies). A plain unique index can't do
-- this directly since every non-featured row would also need a unique
-- value; a partial index scoped to only the true rows sidesteps that —
-- at most one row can have is_invite_only_feature = true, and any number
-- can have it false.
create unique index if not exists events_single_invite_only_feature
  on events (is_invite_only_feature)
  where is_invite_only_feature;
