import { requireAdmin } from "@/app/admin/require-admin";
import { Suspense, type ReactNode } from "react";

import { SplitShell } from "@/components/admin/split-shell";
import { AdminMain, ListShapes, PageHead } from "@/components/admin/ui";
import { MembersList } from "./MembersList";
import { listMembers } from "./members-data";

// Members (r2b 15): the list on the left stays while the card on the right (the child page) changes.
async function MembersListData() {
  const rows = await listMembers();
  return <MembersList rows={rows} />;
}

export default async function MembersLayout({ children }: { children: ReactNode }) {
  // Every admin page and layout checks for itself (aal2): a soft navigation or router refresh can skip the
  // layouts above it (QA2-01).
  await requireAdmin();
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
