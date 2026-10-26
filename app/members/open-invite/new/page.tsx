import { requireMember } from "@/app/members/require-member";
import { PostView } from "@/components/members/invite/post-view";
import { flags, requireFlag } from "@/lib/members/flags";
import { ExampleScope } from "@/components/members/kit";
import { assertMockAllowed } from "@/lib/members/mock/guard";
import { getNewInviteContext } from "@/lib/members/mock/open-invite";

// Open Invite > post a plan.
export default async function NewOpenInvitePage() {
  requireFlag("openInvite");
  assertMockAllowed();
  const [, context] = await Promise.all([requireMember(), getNewInviteContext()]);
  return (
    <ExampleScope>
      <PostView context={context} paidPlans={flags.paidPlans} />
    </ExampleScope>
  );
}
