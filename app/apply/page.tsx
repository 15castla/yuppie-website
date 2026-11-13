import { APPLY_METADATA, ApplyPageBody } from "./apply-page";

export const metadata = APPLY_METADATA;
export const dynamic = "force-dynamic";

export default async function ApplyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return <ApplyPageBody code={query.n} />;
}
