import { Suspense, type ReactNode } from "react";

import { SplitShell } from "@/components/admin/split-shell";
import { AdminMain, ListShapes, PageHead } from "@/components/admin/ui";
import { MembersList } from "./MembersList";
import { listMembers } from "./members-data";

// Members (r2b 15): the list on the left stays while the card on the right (the child page) changes.
async function MembersListData() {
  const rows = await listMembers();
  return <MembersList rows={rows} defaultId={rows[0]?.id ?? null} />;
}

export default function MembersLayout({ children }: { children: ReactNode }) {
  return (
    <AdminMain>
      <SplitShell
        head={
          <PageHead
            title="Members"
            lead="Search for a member, open them to see their details, change their membership or look at what they have booked."
          />
        }
        list={
          <Suspense fallback={<ListShapes rows={6} />}>
            <MembersListData />
          </Suspense>
        }
        basePath="/admin/members"
        backLabel="All members"
        keepParams={["q", "status", "show"]}
      >
        {children}
      </SplitShell>
    </AdminMain>
  );
}
