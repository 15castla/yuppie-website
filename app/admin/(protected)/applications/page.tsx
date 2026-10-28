import { listApplications } from "./applications-data";
import { ApplicationCard } from "./ApplicationCard";
import { currentTab } from "./app-tabs";

// /admin/applications: from 768 the first application in the tab shows beside the list (oldest waiting first).
export default async function ApplicationsIndexPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = currentTab((await searchParams).tab ?? null);
  const first = (await listApplications()).find((a) => a.tab === tab);
  if (!first) return null;
  return <ApplicationCard applicationId={first.id} />;
}
