import { PerkPageBody } from "./perk-page";

export default async function IndexPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <PerkPageBody type="discount" id={null} q={q ?? ""} />;
}
