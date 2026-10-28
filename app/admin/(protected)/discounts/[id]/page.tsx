import { PerkPageBody } from "../perk-page";

export default async function DiscountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  return <PerkPageBody type="discount" id={id} created={created === "1"} />;
}
