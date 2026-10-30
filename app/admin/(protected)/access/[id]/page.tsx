import { requireAdmin } from "@/app/admin/require-admin";
import { PerkPageBody } from "../../discounts/perk-page";

export default async function DoorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  // Every admin page and layout checks for itself (aal2): a soft navigation or router refresh can skip the
  // layouts above it (QA2-01).
  await requireAdmin();
  const { id } = await params;
  const { created } = await searchParams;
  return <PerkPageBody type="access" id={id} created={created === "1"} />;
}
