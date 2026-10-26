import { requireMember } from "@/app/members/require-member";
import { ConciergeView } from "@/components/members/concierge/concierge-view";
import { requireFlag } from "@/lib/members/flags";
import { ExampleScope } from "@/components/members/kit";
import { assertMockAllowed } from "@/lib/members/mock/guard";
import { getConciergeScript, getConciergeSnapshot } from "@/lib/members/mock/concierge";
import { notFound } from "next/navigation";
import { detectShellMode } from "@/lib/members/shell-mode";

// The Concierge: an AI that recommends places and never books. App only, behind
// flags.concierge, and on the example-data adapter until a backend exists, so it
// is a 404 on the web, with the flag off, and on the live site (VERCEL_ENV=production).
// The checks run in that order, before anything about the member is read.
// When the real backend exists the adapter import and assertMockAllowed() go,
// and the page passes the backend's `send` instead of `script`
// (lib/members/concierge/types.ts says what it has to do).
export default async function MembersConciergePage() {
  requireFlag("concierge");
  assertMockAllowed();
  if ((await detectShellMode()) !== "app") notFound();

  const [, snapshot] = await Promise.all([requireMember(), getConciergeSnapshot()]);
  return (
    <ExampleScope>
      <ConciergeView snapshot={snapshot} script={getConciergeScript()} />
    </ExampleScope>
  );
}
