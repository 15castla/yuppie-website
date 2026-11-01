import { requireMember } from "@/app/members/require-member";
import { ConciergeView } from "@/components/members/concierge/concierge-view";
import { requireFlag } from "@/lib/members/flags";
import { ExampleScope } from "@/components/members/kit";
import { assertMockAllowed } from "@/lib/members/mock/guard";
import { getConciergeScript, getConciergeSnapshot } from "@/lib/members/mock/concierge";
import { conciergeLive, loadConcierge } from "@/lib/server/concierge";
import { notFound } from "next/navigation";
import { detectShellMode } from "@/lib/members/shell-mode";
import { forgetAllConciergeMemory, forgetConciergeMemory, sendConciergeMessage } from "./actions";

// A reply checks places on the web first, which can take a while: the page's server actions get up to a minute.
export const maxDuration = 60;

// The Concierge: an AI that recommends places and never books. App only, behind flags.concierge (a 404 on the
// web and with the flag off; the checks run before anything about the member is read).
//   live (CONCIERGE_LIVE=on and ANTHROPIC_API_KEY): the real backend (lib/server/concierge.ts), with the
//        conversation and memory from the database and the page's server actions for send and forget.
//   not live: the example-data adapter as before, a 404 on the live site unless MEMBERS_SHOW_EXAMPLES=on.
export default async function MembersConciergePage() {
  requireFlag("concierge");
  if (conciergeLive()) {
    if ((await detectShellMode()) !== "app") notFound();
    const member = await requireMember();
    const snapshot = await loadConcierge(member.id);
    return (
      <ConciergeView
        snapshot={snapshot}
        send={sendConciergeMessage}
        onForget={forgetConciergeMemory}
        onForgetAll={forgetAllConciergeMemory}
      />
    );
  }
  assertMockAllowed();
  if ((await detectShellMode()) !== "app") notFound();

  const [, snapshot] = await Promise.all([requireMember(), getConciergeSnapshot()]);
  return (
    <ExampleScope>
      <ConciergeView snapshot={snapshot} script={getConciergeScript()} />
    </ExampleScope>
  );
}
