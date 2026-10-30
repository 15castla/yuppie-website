import { requireMember } from "@/app/members/require-member";
import { OpenInviteView } from "@/components/members/invite/browse-view";
import { openInviteFeed } from "@/lib/server/plans";
import { paidPlansShown, requireOpenInvite } from "./guard";

// Open Invite > Browse: the real feed (lib/server/plans.ts openInviteFeed: upcoming, not cancelled, hosts with an
// active membership, never a plan of someone you blocked or who blocked you, soonest first). A 404 while the
// flag is off, and in the app while its own switch is off (Open Invite decision 6).
export default async function OpenInvitePage() {
  await requireOpenInvite();
  const member = await requireMember();
  const feed = await openInviteFeed({ id: member.id, email: member.email });
  return <OpenInviteView feed={feed} paidPlans={paidPlansShown()} />;
}
