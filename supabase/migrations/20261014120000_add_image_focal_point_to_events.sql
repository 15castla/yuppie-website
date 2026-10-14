-- Focal point for an event's photo: which part of it stays in frame when
-- the photo is cropped to the fixed 16:9 frame (EVENT_PHOTO_CLASS in
-- components/members/ui.tsx). Percentages of the photo's width (x) and
-- height (y), 0-100, used as CSS object-position. Chosen by clicking the
-- photo at /admin/events. Both default to 50 (centre), which is exactly how
-- every photo was cropped before this, so existing events need no backfill.
-- Adding a column with a constant default doesn't rewrite the table.
alter table events
  add column if not exists image_focal_x numeric(5, 2) not null default 50
    constraint events_image_focal_x_range check (image_focal_x between 0 and 100),
  add column if not exists image_focal_y numeric(5, 2) not null default 50
    constraint events_image_focal_y_range check (image_focal_y between 0 and 100);
