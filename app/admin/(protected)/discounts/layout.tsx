import { requireAdmin } from "@/app/admin/require-admin";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { PerksList } from "@/components/admin/perks/PerksList";
import { SplitShell } from "@/components/admin/split-shell";
import { AdminMain, ListShapes, PageHead } from "@/components/admin/ui";
import { listPerks } from "./perks-data";

// Discounts (r2b 18): the list (in the order members see it) stays while the card changes.
async function ListData() {
  return <PerksList type="discount" rows={await listPerks("discount")} />;
}

export default async function DiscountsLayout({ children }: { children: ReactNode }) {
  // Every admin page and layout checks for itself (aal2): a soft navigation or router refresh can skip the
  // layouts above it (QA2-01).
  await requireAdmin();
  return (
    <AdminMain>
      <SplitShell
        head={
          <PageHead
            title="Discounts"
            lead="The offers members show their phone for. Their order here is the order they see."
            right={
              <Link className="ad-btn" href="/admin/discounts/new">
                Add a discount
              </Link>
            }
          />
        }
        list={
          <Suspense fallback={<ListShapes rows={6} lead="tile" />}>
            <ListData />
          </Suspense>
        }
        basePath="/admin/discounts"
        backLabel="All discounts"
        keepParams={["q", "show"]}
      >
        {children}
      </SplitShell>
    </AdminMain>
  );
}
