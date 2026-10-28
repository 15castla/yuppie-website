import { notFound } from "next/navigation";

import { testHooksEnabled } from "@/lib/test-hooks";
import { requireMember } from "../require-member";

// TEST ONLY (tests/e2e/phase-a/11-you-system.mjs): a members page that fails on the server, so the members
// error page ("That didn’t load." with its reference) can be driven for real. A 404 unless
// MEMBERS_TEST_HOOKS=on, and always a 404 on the live site.
export const dynamic = "force-dynamic";

export default async function MembersTestErrorPage() {
  if (!testHooksEnabled()) notFound();
  await requireMember();
  throw new Error("Test error: the members error page, on purpose.");
}
