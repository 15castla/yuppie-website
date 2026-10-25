// Every fake (example-data) adapter lives under lib/members/mock/, and the
// page that uses it calls assertMockAllowed() first. On the live site
// (Vercel's production environment) that is a 404, so a feature flag can
// never put example data in front of a real member, whatever someone sets
// in the environment by mistake. Local runs and Vercel previews are
// allowed. When a real backend exists for an area, its page stops using the
// adapter and the call is removed for that area.
import { notFound } from "next/navigation";

export function isMockAllowed(): boolean {
  return process.env.VERCEL_ENV !== "production";
}

export function assertMockAllowed(): void {
  if (!isMockAllowed()) notFound();
}
