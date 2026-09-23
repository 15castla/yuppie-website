import { unstable_cache } from "next/cache";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";

// The raw singleton row; see supabase/migrations/20260924120000_add_feature_card_table.sql.
// Resolving content_id into an actual title/subtitle to display is left to
// the caller (app/members/access/page.tsx), which cross-references its
// own already-fetched events/perks arrays rather than this file doing a
// second round trip.
export type FeatureCard = {
  content_type: "event" | "discount" | "access";
  content_id: string;
  label: string | null;
};

// A blank label on the feature_card row means "use this type's default",
// not one fixed string across all three. Shared between
// FeatureCardForm.tsx (as the label input's placeholder, so the admin can
// see what they'll get by leaving it blank) and app/members/access/page.tsx
// (to resolve the final label before it reaches AccessView.tsx).
export const DEFAULT_FEATURE_LABEL: Record<FeatureCard["content_type"], string> = {
  event: "INVITE ONLY",
  discount: "FEATURED DISCOUNT",
  access: "EXCLUSIVE ACCESS",
};

// Mirrors components/members/events-data.ts / perks-data.ts exactly:
// shared catalog content, only changed via /admin/access's
// FeatureCardForm.tsx (app/admin/feature-card-actions.ts's setFeatureCard
// calls revalidateTag("feature-card") on every write).
export const getCachedFeatureCard = unstable_cache(
  async () => {
    const adminClient = createAdminSupabaseClient();
    const { data, error } = await adminClient
      .from("feature_card")
      .select("content_type, content_id, label")
      .eq("id", true)
      .maybeSingle();

    if (error) {
      console.error("Failed to load feature card:", error);
    }

    return (data as FeatureCard | null) ?? null;
  },
  ["feature-card"],
  { tags: ["feature-card"], revalidate: 60 },
);
