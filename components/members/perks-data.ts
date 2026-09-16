import { unstable_cache } from "next/cache";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { PERK_COLUMNS, type PartnerPerk } from "./mock-perks";

// Mirrors components/members/events-data.ts exactly: partner perks are
// shared catalog content, identical for every member, only changed via
// /admin/discounts — cached for 60s rather than hit on every request, with
// revalidateTag("perks") called from app/admin/discounts-actions.ts on
// every write so admin edits show up immediately instead of waiting out
// the window.
export const getCachedPerks = unstable_cache(
  async () => {
    const adminClient = createAdminSupabaseClient();
    const { data, error } = await adminClient
      .from("partner_perks")
      .select(PERK_COLUMNS)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to load partner perks:", error);
    }

    return (data ?? []) as PartnerPerk[];
  },
  ["partner-perks-list"],
  { tags: ["perks"], revalidate: 60 },
);
