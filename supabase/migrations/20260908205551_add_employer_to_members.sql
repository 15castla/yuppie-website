-- Employer / job title, shown to other members on event guest lists.
-- Nullable, same treatment as the other optional profile fields (phone,
-- bio, avatar_url).
ALTER TABLE members ADD COLUMN IF NOT EXISTS employer text;
