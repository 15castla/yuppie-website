-- Role / job title, alongside the employer column added in
-- 20260908205551. The application form (app/apply/apply-form.tsx)
-- already treats employer and role/job title as two separate fields;
-- this keeps members in sync with that rather than merging them.
ALTER TABLE members ADD COLUMN IF NOT EXISTS role_title text;
