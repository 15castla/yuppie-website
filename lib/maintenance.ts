// The maintenance switch (r2b section 6: "a static page the site serves with a 503 while Albert deploys
// something big", with "a flag or a middleware check" to switch it on). Server only, read per request by
// proxy.ts: MAINTENANCE_MODE=on shows "Back in a moment." for every members address (/members and below).
// Never for /admin (the club must be able to work), the public site, the login page or /api (Stripe's
// webhooks and the cron jobs keep running). MAINTENANCE_UNTIL=14:00 (optional) adds "We expect to be back
// by 14:00."; anything that is not a 24-hour time is ignored and the line is left out.
//
// Pure, no next/* imports: proxy.ts and app/maintenance/page.tsx both use it.

export const MAINTENANCE_HEADER = "x-club-maintenance";

/** The test hook (tests/e2e/phase-a/11-you-system.mjs): only with MEMBERS_TEST_HOOKS=on, never on the live site. */
export const MAINTENANCE_TEST_HEADER = "x-test-maintenance";

function testHooksOn(env: NodeJS.ProcessEnv): boolean {
  return env.MEMBERS_TEST_HOOKS === "on" && env.VERCEL_ENV !== "production";
}

export function maintenanceOn(env: NodeJS.ProcessEnv, testHeader: string | null): boolean {
  if (env.MAINTENANCE_MODE === "on") return true;
  return testHeader === "on" && testHooksOn(env);
}

export function isMaintenancePath(pathname: string): boolean {
  return pathname === "/members" || pathname.startsWith("/members/");
}

/** "14:00", or null when unset or not a 24-hour time. */
export function maintenanceUntil(env: NodeJS.ProcessEnv): string | null {
  const value = env.MAINTENANCE_UNTIL?.trim() ?? "";
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}
