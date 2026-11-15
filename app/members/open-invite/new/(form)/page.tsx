import { requireMember } from "@/app/members/require-member";
import { PostView } from "@/components/members/invite/post-view";
import { newInviteContext } from "@/lib/server/plans";
import { paidPlansShown, requireOpenInvite } from "../../guard";

// Open Invite > post a plan. "Add a cost" while paid plans are on (15 Nov 2026; off, the form is the free one and
// the server refuses a cost anyway). A cost needs Get paid, which goes to Stripe and back here.
export default async function NewOpenInvitePage({ searchParams }: { searchParams: Promise<{ getpaid?: string }> }) {
  await requireOpenInvite();
  const member = await requireMember();
  const { getpaid } = await searchParams;
  const context = await newInviteContext({ id: member.id, email: member.email }, new Date(), { backFromStripe: getpaid === "back" });
  return <PostView context={context} paidPlans={paidPlansShown()} live />;
}
