import { requireAdmin } from "@/app/admin/require-admin";
import { listApplications } from "./applications-data";
import { ApplicationCard } from "./ApplicationCard";
import { currentTab } from "./app-tabs";

// /admin/applications: from 768 the first application in the tab shows beside the list (oldest waiting first).
export default async function ApplicationsIndexPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  // Every admin page and layout checks for itself (aal2): a soft navigation or router refresh can skip the
  // layouts above it (QA2-01).
  await requireAdmin();
  const tab = currentTab((await searchParams).tab ?? null);
  const first = (await listApplications()).find((a) => tab === "all" || a.tab === tab);
  if (!first) return null;
  return <ApplicationCard applicationId={first.id} />;
}
