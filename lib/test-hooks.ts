// The Phase A test hooks' switch: MEMBERS_TEST_HOOKS=on, and never on the live site (VERCEL_ENV=production),
// whatever the variable says. The same rule as app/api/test-hooks/[action]/route.ts.
export function testHooksEnabled(): boolean {
  return process.env.MEMBERS_TEST_HOOKS === "on" && process.env.VERCEL_ENV !== "production";
}
