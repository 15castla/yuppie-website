import { Suspense, type ReactNode } from "react";

import { requireAdmin } from "@/app/admin/require-admin";
import { QueueHeadLoading, QueueStats } from "@/components/admin/queue";
import { SplitShell } from "@/components/admin/split-shell";
import { AdminMain, ListShapes, PageHead } from "@/components/admin/ui";
import { reportQueues } from "./reports-data";
import { ReportsList, ReportsTabs } from "./ReportsList";

// Reports (msg-admin-moderation-1280, framed in r2b 19): what members reported (messages, members, photos and
// plans), newest first, with the 24-hour promise on the page: the lead, "Review within 24 h", and the oldest
// open report in red once it is past it. The list stays while the card beside it changes; on a phone the list
// stacks above the card (B-D22 A).
const LEAD =
  "Messages, members, photos and plans that members reported, newest first. Apple and Google expect a quick response, so aim to clear the list within 24 hours.";
const STATS = ["Open reports", "Oldest open", "Review within", "Removed this month"];

async function HeadData() {
  const q = await reportQueues();
  return (
    <>
      <PageHead
        title="Reports"
        lead={LEAD}
        right={<ReportsTabs counts={q.counts} />}
      />
      <QueueStats label="Reports in numbers" items={q.stats} />
    </>
  );
}

async function ListData() {
  const q = await reportQueues();
  return <ReportsList open={q.open} done={q.done} />;
}

export default async function ReportsLayout({ children }: { children: ReactNode }) {
  // Every admin page and layout checks for itself (aal2): a soft navigation or router refresh can skip the
  // layouts above it (QA2-01).
  await requireAdmin();
  return (
    <AdminMain>
      <SplitShell
        stack
        head={
          <Suspense fallback={<QueueHeadLoading title="Reports" lead={LEAD} tabs={["Open", "Done"]} stats={STATS} />}>
            <HeadData />
          </Suspense>
        }
        list={
          <Suspense fallback={<ListShapes rows={3} />}>
            <ListData />
          </Suspense>
        }
        basePath="/admin/reports"
        backLabel="All reports"
        keepParams={["tab"]}
      >
        {children}
      </SplitShell>
    </AdminMain>
  );
}
