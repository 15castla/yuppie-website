import { requireAdmin } from "@/app/admin/require-admin";
import { ReportCard } from "../ReportCard";

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; stale?: string }> }) {
  // Every admin page and layout checks for itself (aal2): a soft navigation or router refresh can skip the
  // layouts above it (QA2-01).
  await requireAdmin();
  const [{ id }, { done, stale }] = await Promise.all([params, searchParams]);
  return <ReportCard reportId={id} done={done ?? null} stale={stale === "1"} />;
}
