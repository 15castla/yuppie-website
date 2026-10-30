import { requireMember } from "@/app/members/require-member";
import { PostedRoute } from "@/components/members/invite/posted-route";
import { peopleRefs } from "@/lib/server/people";
import { requireOpenInvite } from "../../guard";

// "Posted.": the page after posting, with the tab bar back. The member is real. The plan just posted is still
// read by PostedRoute from this tab's sessionStorage (demo-posted.ts); the Open Invite screen agent switches it
// to the plan the post action answered (postOpenInvite gives the id: /members/open-invite/new/done?id=<id>,
// load it with getOpenInvitePage).
export default async function PostedPage() {
  await requireOpenInvite();
  const member = await requireMember();
  const me = (await peopleRefs([member.id])).get(member.id)!;
  return <PostedRoute me={me} />;
}
