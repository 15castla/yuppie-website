import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { BareBar, StandaloneScreen } from "@/components/members/system/standalone";
import { MaintenanceView } from "@/components/members/system/maintenance-view";
import { detectShellMode } from "@/lib/members/shell-mode";
import { MAINTENANCE_HEADER, maintenanceUntil } from "@/lib/maintenance";

// "Back in a moment." (r2b section 6). Never opened directly: proxy.ts rewrites members addresses here with
// a 503 while MAINTENANCE_MODE=on, and marks the request; anything else gets the 404. The address in the
// browser stays the one the member asked for, so Try again (a reload) brings them back to it.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Back in a moment.", robots: { index: false } };

export default async function MaintenancePage() {
  const headerList = await headers();
  if (headerList.get(MAINTENANCE_HEADER) !== "1") notFound();
  const mode = await detectShellMode();
  return (
    <StandaloneScreen mode={mode}>
      {mode === "web" ? <BareBar /> : null}
      <MaintenanceView mode={mode} until={maintenanceUntil(process.env)} />
    </StandaloneScreen>
  );
}
