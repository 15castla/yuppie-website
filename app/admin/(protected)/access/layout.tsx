import { Suspense, type ReactNode } from "react";

import { PerksList } from "@/components/admin/perks/PerksList";
import { SplitShell } from "@/components/admin/split-shell";
import { AdminMain, ListShapes } from "@/components/admin/ui";
import { listPerks } from "../discounts/perks-data";
import { AccessHead } from "./AccessHead";

// Access (r2b 18): Doors (list and card, in the order members see them) and the Feature card (full width).
async function HeadData() {
  return <AccessHead doors={(await listPerks("access")).length} />;
}

async function ListData() {
  return <PerksList type="access" rows={await listPerks("access")} />;
}

export default function AccessLayout({ children }: { children: ReactNode }) {
  return (
    <AdminMain>
      <SplitShell
        head={
          <Suspense fallback={<AccessHead doors={null} />}>
            <HeadData />
          </Suspense>
        }
        list={
          <Suspense fallback={<ListShapes rows={5} lead="tile" />}>
            <ListData />
          </Suspense>
        }
        basePath="/admin/access"
        backLabel="All doors"
        keepParams={["q", "show"]}
        fullSegments={["feature"]}
      >
        {children}
      </SplitShell>
    </AdminMain>
  );
}
