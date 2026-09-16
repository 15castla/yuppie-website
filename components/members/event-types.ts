// Matches the real `events` table (introspected via the Supabase REST
// schema endpoint — no migration file for this table exists in this repo).
export type EventCategory = "entertainment" | "sport" | "personal_progression";

export type Event = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: EventCategory;
  location: string | null;
  start_time: string;
  end_time: string | null;
  price_pence: number;
  capacity: number;
  image_url: string | null;
  // Powers the black "Invite Only" teaser card at the top of
  // /members/access (see components/members/access-view.tsx) — at most one
  // event has this set at a time, enforced by a partial unique index (see
  // supabase/migrations/20260916150000_add_invite_only_feature_to_events.sql)
  // and by app/admin/events-actions.ts's setFeaturedInviteOnlyEvent, which
  // always clears any existing one before setting a new one.
  is_invite_only_feature: boolean;
};

export const EVENT_COLUMNS =
  "id, slug, title, description, category, location, start_time, end_time, price_pence, capacity, image_url, is_invite_only_feature";
