import { notFound } from "next/navigation";

import { testHooksEnabled } from "@/lib/test-hooks";

// TEST ONLY (tests/e2e/phase-a/11-you-system.mjs): a public page that fails on the server, so the public
// error page can be driven for real. A 404 unless MEMBERS_TEST_HOOKS=on, and always a 404 on the live site.
export const dynamic = "force-dynamic";

export default async function TestErrorPage() {
  if (!testHooksEnabled()) notFound();
  throw new Error("Test error: the public error page, on purpose.");
}
