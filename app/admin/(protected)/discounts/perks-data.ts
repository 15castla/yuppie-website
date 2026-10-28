import "server-only";

// Discounts and doors for the admin lists and cards, read with the service role after requireAdmin().

import { cache } from "react";

import { createAdminSupabaseClient } from "@/app/admin/admin-client";
import { requireAdmin } from "@/app/admin/require-admin";
import { DEFAULT_CATEGORIES, type PerkRow, type PerkType } from "@/components/admin/perks/perk-types";

const COLUMNS = "id, display_order, name, category, area, type, access_kind, headline, badge, logo_url";

export const listPerks = cache(async function listPerks(type: PerkType): Promise<PerkRow[]> {
  await requireAdmin();
  const { data, error } = await createAdminSupabaseClient()
    .from("partner_perks")
    .select(COLUMNS)
    .eq("type", type)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(`perks list: ${error.message}`);
  return (data ?? []) as PerkRow[];
});

/** The baseline categories plus every one an admin has typed in, A to Z. */
export async function perkCategories(): Promise<string[]> {
  const rows = await listPerks("discount");
  return Array.from(new Set([...DEFAULT_CATEGORIES, ...rows.map((r) => r.category).filter((c): c is string => Boolean(c))])).sort((a, b) =>
    a.localeCompare(b),
  );
}
