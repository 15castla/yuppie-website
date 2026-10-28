import { notFound } from "next/navigation";

import { NewPerkCard, PerkCard } from "@/components/admin/perks/PerkCard";
import type { PerkType } from "@/components/admin/perks/perk-types";
import { listPerks, perkCategories } from "./perks-data";

// The card for one discount or door (or the first one, beside the list from 768), and the new one.
export async function PerkPageBody({ type, id, created = false, q = "" }: { type: PerkType; id: string | null; created?: boolean; q?: string }) {
  const rows = await listPerks(type);
  const categories = type === "discount" ? await perkCategories() : [];
  if (id === "new") return <NewPerkCard type={type} categories={categories} />;
  const norm = (v: string | null) => (v ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const needle = norm(q);
  const index = id
    ? rows.findIndex((r) => r.id === id)
    : needle
      ? rows.findIndex((r) => norm(r.name).includes(needle) || norm(r.area).includes(needle) || norm(r.category).includes(needle))
      : 0;
  if (!id && index < 0) return null;
  if (id && index < 0) notFound();
  const perk = rows[index];
  if (!perk) return null;
  return <PerkCard type={type} perk={perk} position={index + 1} total={rows.length} categories={categories} created={created} />;
}
