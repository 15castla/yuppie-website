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
};

export const EVENT_COLUMNS =
  "id, slug, title, description, category, location, start_time, end_time, price_pence, capacity, image_url";
