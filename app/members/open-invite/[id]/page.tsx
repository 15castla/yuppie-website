import { notFound } from "next/navigation";

import { requireMember } from "@/app/members/require-member";
import { PlanView } from "@/components/members/invite/plan-view";
import { openInvitePage } from "@/lib/server/plans";
import { paidPlansShown, requireOpenInvite } from "../guard";

// Open Invite > a plan, in every state (open, you're in, your own, full, cancelled, past, asked). A 404 when the
// member may not see it (not found, removed by the club, a block either way) and for a plan with a cost while
// paid plans are not live.
export default async function OpenInvitePlanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOpenInvite();
  const { id } = await params;
  const member = await requireMember();
  const page = await openInvitePage({ id: member.id, email: member.email }, id);
  if (!page || (page.invite.cost && !paidPlansShown())) notFound();
  return <PlanView page={page} paidPlans={paidPlansShown()} />;
}
