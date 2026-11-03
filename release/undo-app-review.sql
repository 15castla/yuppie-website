-- Undo the App Review migration (20261103090000_app_review.sql). Albert's say only, after the code is rolled back.
-- Members' agreements to the community rules and the Concierge are lost (they would be asked again).
drop function if exists public.review_login_take_try();
drop table if exists public.review_login_attempts;
alter table public.members drop column if exists is_review_account;
alter table public.members drop column if exists concierge_consent_at;
alter table public.members drop column if exists rules_agreed_at;
