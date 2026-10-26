import { requireMember } from "@/app/members/require-member";
import { OpenInviteView } from "@/components/members/invite/browse-view";
import { flags, requireFlag } from "@/lib/members/flags";
import { ExampleScope } from "@/components/members/kit";
import { assertMockAllowed } from "@/lib/members/mock/guard";
import { listOpenInvites } from "@/lib/members/mock/open-invite";

// Open Invite > Browse. Hidden (404) until NEXT_PUBLIC_MEMBERS_OPEN_INVITE=on,
// and still a 404 on the live site: it runs on example data (lib/members/mock).
export default async function OpenInvitePage() {
  requireFlag("openInvite");
  assertMockAllowed();
  const [, feed] = await Promise.all([requireMember(), listOpenInvites()]);
  return (
    <ExampleScope>
      <OpenInviteView feed={feed} paidPlans={flags.paidPlans} />
    </ExampleScope>
  );
}
