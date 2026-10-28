import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { SplitShell } from "@/components/admin/split-shell";
import { AdminMain, ListShapes, PageHead } from "@/components/admin/ui";
import { EventsList, EventsTabs } from "./EventsList";
import { listEvents } from "./events-data";

// Events (r2b 17): the list (Coming up, Past) stays while the card (Details, Attendees, or a new event) changes.
async function TabsData() {
  const rows = await listEvents();
  return <EventsTabs counts={{ coming: rows.filter((r) => !r.past).length, past: rows.filter((r) => r.past).length }} />;
}

async function ListData() {
  return <EventsList rows={await listEvents()} />;
}

export default function EventsLayout({ children }: { children: ReactNode }) {
  return (
    <AdminMain>
      <SplitShell
        head={
          <>
            <PageHead
              title="Events"
              lead="Make events, see who has booked and export the list."
              right={
                <Link className="ad-btn" href="/admin/events/new">
                  Add an event
                </Link>
              }
            />
            <Suspense fallback={<div className="ad-tabs" aria-hidden="true" style={{ height: 56 }} />}>
              <TabsData />
            </Suspense>
          </>
        }
        list={
          <Suspense fallback={<ListShapes rows={5} lead="date" />}>
            <ListData />
          </Suspense>
        }
        basePath="/admin/events"
        backLabel="All events"
        keepParams={["list", "show"]}
      >
        {children}
      </SplitShell>
    </AdminMain>
  );
}
