import { Suspense, type ReactNode } from "react";

import { requireAdmin } from "@/app/admin/require-admin";
import { QueueHeadLoading, QueueStats } from "@/components/admin/queue";
import { SplitShell } from "@/components/admin/split-shell";
import { AdminMain, ListShapes, PageHead } from "@/components/admin/ui";
import { photoQueues } from "./photos-data";
import { PhotosList, PhotosTabs } from "./PhotosList";

// Photos (photo spec 3, photo-admin-*, framed in r2b 19): new and changed photos and any a member reported.
// Photos show straight away, so this is where they are checked, within 24 hours. The list stays while the card
// beside it changes; on a phone the list stacks above the card (B-D22 A).
const LEAD =
  "New and changed photos, and any a member reported. Photos show straight away, so this is where you check them. Aim to clear the list within 24 hours.";
const STATS = ["To check", "Reported", "Oldest waiting", "Removed this month"];

async function HeadData() {
  const q = await photoQueues();
  return (
    <>
      <PageHead title="Photos" lead={LEAD} right={<PhotosTabs counts={q.counts} />} />
      <QueueStats label="Photos in numbers" items={q.stats} />
    </>
  );
}

async function ListData() {
  const q = await photoQueues();
  return <PhotosList check={q.check} done={q.done} />;
}

export default async function PhotosLayout({ children }: { children: ReactNode }) {
  // Every admin page and layout checks for itself (aal2): a soft navigation or router refresh can skip the
  // layouts above it (QA2-01).
  await requireAdmin();
  return (
    <AdminMain>
      <SplitShell
        stack
        head={
          <Suspense fallback={<QueueHeadLoading title="Photos" lead={LEAD} tabs={["To check", "Done"]} stats={STATS} />}>
            <HeadData />
          </Suspense>
        }
        list={
          <Suspense fallback={<ListShapes rows={3} />}>
            <ListData />
          </Suspense>
        }
        basePath="/admin/photos"
        backLabel="All photos"
        keepParams={["tab"]}
      >
        {children}
      </SplitShell>
    </AdminMain>
  );
}
