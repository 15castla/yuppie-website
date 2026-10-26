import { requireMember } from "@/app/members/require-member";
import { YoursView } from "@/components/members/invite/yours-view";
import { flags, requireFlag } from "@/lib/members/flags";
import { ExampleScope } from "@/components/members/kit";
import { assertMockAllowed } from "@/lib/members/mock/guard";
import { listYours } from "@/lib/members/mock/open-invite";

// Open Invite > Yours: the plans you posted, the plans you are in, and the past ones.
export default async function OpenInviteYoursPage() {
  requireFlag("openInvite");
  assertMockAllowed();
  const [, yours] = await Promise.all([requireMember(), listYours()]);
  return (
    <ExampleScope>
      <YoursView yours={yours} paidPlans={flags.paidPlans} />
    </ExampleScope>
  );
}
