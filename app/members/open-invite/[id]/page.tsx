import { notFound } from "next/navigation";

import { requireMember } from "@/app/members/require-member";
import { PlanView } from "@/components/members/invite/plan-view";
import { flags, requireFlag } from "@/lib/members/flags";
import { ExampleScope } from "@/components/members/kit";
import { assertMockAllowed } from "@/lib/members/mock/guard";
import { getOpenInvite } from "@/lib/members/mock/open-invite";

// Open Invite > a plan. A plan with a cost is a 404 while paid plans are off.
export default async function OpenInvitePlanPage({ params }: { params: Promise<{ id: string }> }) {
  requireFlag("openInvite");
  assertMockAllowed();
  const { id } = await params;
  const [, page] = await Promise.all([requireMember(), getOpenInvite(id)]);
  if (!page || (page.invite.cost && !flags.paidPlans)) notFound();
  return (
    <ExampleScope>
      <PlanView page={page} paidPlans={flags.paidPlans} />
    </ExampleScope>
  );
}
