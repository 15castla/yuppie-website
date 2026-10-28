import { requireAdmin } from "@/app/admin/require-admin";
import { PerkPageBody } from "../discounts/perk-page";

export default async function IndexPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  // Every admin page and layout checks for itself (aal2): a soft navigation or router refresh can skip the
  // layouts above it (QA2-01).
  await requireAdmin();
  const { q } = await searchParams;
  return <PerkPageBody type="access" id={null} q={q ?? ""} />;
}
