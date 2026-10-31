import { notFound, redirect } from "next/navigation";

import { requireMember } from "@/app/members/require-member";
import { PostedView } from "@/components/members/invite/post-view";
import { ROUTES } from "@/lib/members/routes";
import { openInvitePage } from "@/lib/server/plans";
import { paidPlansShown, requireOpenInvite } from "../../guard";

// "Posted.": the page after posting, with the tab bar back. The plan is the one the post action answered
// (/members/open-invite/new/done?id=<plan id>), loaded again for this member. Only its host sees it: no id, a plan
// that is not theirs, or one that cannot be found sends them to the form.
export default async function PostedPage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  await requireOpenInvite();
  const { id } = await searchParams;
  const member = await requireMember();
  const planId = typeof id === "string" ? id : "";
  const page = planId ? await openInvitePage({ id: member.id, email: member.email }, planId) : null;
  if (!page || page.invite.you.role !== "host") redirect(ROUTES.openInviteNew);
  if (page.invite.cost && !paidPlansShown()) notFound();
  return <PostedView invite={page.invite} me={page.me} />;
}
