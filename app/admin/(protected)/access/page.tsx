import { PerkPageBody } from "../discounts/perk-page";

export default async function IndexPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <PerkPageBody type="access" id={null} q={q ?? ""} />;
}
