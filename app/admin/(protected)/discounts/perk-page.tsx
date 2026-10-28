import { notFound } from "next/navigation";

import { NewPerkCard, PerkCard } from "@/components/admin/perks/PerkCard";
import type { PerkType } from "@/components/admin/perks/perk-types";
import { listPerks, perkCategories } from "./perks-data";

// The card for one discount or door (or the first one, beside the list from 768), and the new one.
export async function PerkPageBody({ type, id, created = false }: { type: PerkType; id: string | null; created?: boolean }) {
  const rows = await listPerks(type);
  const categories = type === "discount" ? await perkCategories() : [];
  if (id === "new") return <NewPerkCard type={type} categories={categories} />;
  const index = id ? rows.findIndex((r) => r.id === id) : 0;
  if (id && index < 0) notFound();
  const perk = rows[index];
  if (!perk) return null;
  return <PerkCard type={type} perk={perk} position={index + 1} total={rows.length} categories={categories} created={created} />;
}
