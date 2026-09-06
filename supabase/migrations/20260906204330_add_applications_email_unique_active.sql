-- A given email should only have one "live" application at a time
-- (pending or approved). Rejected applications don't count, so someone
-- who was rejected can submit a fresh application later with the same
-- email. lower(email) so "Test@Example.com" and "test@example.com"
-- collide as the same applicant, matching the normalization applied in
-- app/apply/actions.ts's submitApplication before insert.
create unique index applications_email_unique_active
on applications (lower(email))
where status <> 'rejected';
