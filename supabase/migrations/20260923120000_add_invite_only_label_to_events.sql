-- Lets admins override the small-caps badge text on the featured
-- invite-only event card at the top of /members/access (previously
-- hardcoded "INVITE ONLY" in components/members/access-view.tsx). Null
-- means "use the default text", so no backfill needed.
alter table events add column invite_only_label text;
