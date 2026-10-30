import { requireMember } from "@/app/members/require-member";
import { YoursView } from "@/components/members/invite/yours-view";
import { openInviteYours } from "@/lib/server/plans";
import { paidPlansShown, requireOpenInvite } from "../guard";

// Open Invite > Yours: the plans you posted, the plans you are in, and the past ones (real data).
export default async function OpenInviteYoursPage() {
  await requireOpenInvite();
  const member = await requireMember();
  const yours = await openInviteYours({ id: member.id, email: member.email });
  return <YoursView yours={yours} paidPlans={paidPlansShown()} />;
}
