-- Readable slugs for event detail URLs instead of raw UUIDs. Backfilled
-- for the four existing seeded events (titles verified against the live
-- table before writing this, not assumed from memory).
ALTER TABLE events ADD COLUMN IF NOT EXISTS slug text;

UPDATE events SET slug = 'padel-and-pints' WHERE id = 'a1111111-0000-4000-8000-000000000001';
UPDATE events SET slug = 'supper-club-wine-charcuterie' WHERE id = 'a1111111-0000-4000-8000-000000000002';
UPDATE events SET slug = 'sunrise-wellness-retreat' WHERE id = 'a1111111-0000-4000-8000-000000000003';
UPDATE events SET slug = 'rooftop-social-end-of-summer' WHERE id = 'a1111111-0000-4000-8000-000000000004';

ALTER TABLE events ALTER COLUMN slug SET NOT NULL;
ALTER TABLE events ADD CONSTRAINT events_slug_unique UNIQUE (slug);
