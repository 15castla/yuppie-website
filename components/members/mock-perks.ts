// Discounts and Access are really the same underlying thing, a partner
// venue with a perk attached, just differently framed — kept as one shape
// here (type: "discount" | "access") matching the real `partner_perks`
// table (see supabase/migrations/20260915120000_add_partner_perks_table_and_media_storage.sql).
// This used to also hold a hardcoded MOCK_PERKS array before that table
// existed — now perks are real rows, fetched via
// components/members/perks-data.ts and managed at /admin/discounts.
export type PartnerPerk = {
  id: string;
  name: string;
  // Null for Access-type rows — access-view.tsx groups perks by access_kind
  // only and never reads category, so it isn't collected on that admin form
  // (see supabase/migrations/20260916090000_make_perk_category_optional_for_access.sql).
  // Always set for Discount-type rows.
  category: "Food & Drink" | "Fitness" | "Grooming" | "Wellness" | null;
  area: string;
  type: "discount" | "access";
  access_kind: "skip_queue" | "members_club" | "first_dibs" | "invite_only" | null;
  headline: string;
  badge: string | null;
  logo_url: string | null;
  display_order: number;
};

export const PERK_COLUMNS =
  "id, name, category, area, type, access_kind, headline, badge, logo_url, display_order";
