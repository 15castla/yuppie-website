import { requireAdmin } from "@/app/admin/require-admin";
import { reportTab } from "./report-tabs";
import { ReportCard } from "./ReportCard";
import { reportQueues } from "./reports-data";

// /admin/reports: the first report in the tab shows beside the list (below it on a phone, B-D22 A).
export default async function ReportsIndexPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  // Every admin page and layout checks for itself (aal2): a soft navigation or router refresh can skip the
  // layouts above it (QA2-01).
  await requireAdmin();
  const tab = reportTab((await searchParams).tab);
  const q = await reportQueues();
  const first = (tab === "done" ? q.done : q.open)[0];
  if (!first) return null;
  return <ReportCard reportId={first.id} />;
}
