import { requireAdmin } from "@/app/admin/require-admin";
import { Suspense, type ReactNode } from "react";

import { SplitShell } from "@/components/admin/split-shell";
import { AdminMain, ListShapes, PageHead } from "@/components/admin/ui";
import { ApplicationsList, ApplicationsTabs } from "./ApplicationsList";
import { listApplications, type AppTab } from "./applications-data";

// Applications (r2b 16): Waiting, Approved and Declined; the list stays while the card changes.
async function TabsData() {
  const rows = await listApplications();
  const counts: Record<AppTab, number> = { waiting: 0, approved: 0, declined: 0 };
  for (const r of rows) counts[r.tab] += 1;
  return <ApplicationsTabs counts={counts} />;
}

async function ListData() {
  return <ApplicationsList rows={await listApplications()} />;
}

export default async function ApplicationsLayout({ children }: { children: ReactNode }) {
  // Every admin page and layout checks for itself (aal2): a soft navigation or router refresh can skip the
  // layouts above it (QA2-01).
  await requireAdmin();
  return (
    <AdminMain>
      <SplitShell
        head={
          <>
            <PageHead title="Applications" lead="Review who has applied. Approving takes their first payment and makes their account." />
            <Suspense fallback={<div className="ad-tabs" aria-hidden="true" style={{ height: 56 }} />}>
              <TabsData />
            </Suspense>
          </>
        }
        list={
          <Suspense fallback={<ListShapes rows={4} />}>
            <ListData />
          </Suspense>
        }
        basePath="/admin/applications"
        backLabel="All applications"
        keepParams={["tab", "show"]}
      >
        {children}
      </SplitShell>
    </AdminMain>
  );
}
