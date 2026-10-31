import { requireMember } from "@/app/members/require-member";
import { PostView } from "@/components/members/invite/post-view";
import { newInviteContext } from "@/lib/server/plans";
import { paidPlansShown, requireOpenInvite } from "../guard";

// Open Invite > post a plan. Free plans only while paid plans are not live: the form gets paidPlans false, so
// "Add a cost" is not offered (and the server refuses a cost anyway: app/members/open-invite/actions.ts).
export default async function NewOpenInvitePage() {
  await requireOpenInvite();
  const member = await requireMember();
  const context = await newInviteContext({ id: member.id, email: member.email });
  return <PostView context={context} paidPlans={paidPlansShown()} />;
}
