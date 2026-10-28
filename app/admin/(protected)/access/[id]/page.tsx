import { PerkPageBody } from "../../discounts/perk-page";

export default async function DoorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  return <PerkPageBody type="access" id={id} created={created === "1"} />;
}
