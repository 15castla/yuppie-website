// Every fake (example-data) adapter lives under lib/members/mock/, and the
// page that uses it calls assertMockAllowed() first. On the live site
// (Vercel's production environment) that is a 404 unless the one deliberate
// switch MEMBERS_SHOW_EXAMPLES=on is set, so a feature flag can never put
// example data in front of a real member by mistake. Local runs and Vercel
// previews are always allowed. The pages that use it wrap their view in
// <ExampleScope> so every screen says it is an example (kit/example-note),
// unless NEXT_PUBLIC_MEMBERS_MARK_EXAMPLES=off (marking.ts) is also set.
// When a real backend exists for an area, its page stops using the adapter
// and the call is removed for that area.
//
// MEMBERS_SHOW_EXAMPLES is server only (no NEXT_PUBLIC_): it changes what a
// page may render, not what the browser bundle contains. Unset it and
// redeploy and every example screen is a 404 again.
import { notFound } from "next/navigation";

export function isMockAllowed(): boolean {
  if (process.env.VERCEL_ENV !== "production") return true;
  return process.env.MEMBERS_SHOW_EXAMPLES === "on";
}

export function assertMockAllowed(): void {
  if (!isMockAllowed()) notFound();
}

// The preview harness's stand-in server actions (mock/you-actions.ts) never
// run on the live site, even when example screens are switched on there: a
// server action is a public address, and these are only for the harness.
export function assertNotProduction(): void {
  if (process.env.VERCEL_ENV === "production") notFound();
}
