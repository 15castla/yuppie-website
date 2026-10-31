import { notFound, redirect } from "next/navigation";

import { requireMember } from "@/app/members/require-member";
import { valuesOf } from "@/components/members/invite/form-values";
import { PostView } from "@/components/members/invite/post-view";
import { openInviteHref } from "@/lib/members/routes";
import { newInviteContext, openInvitePage } from "@/lib/server/plans";
import { paidPlansShown, requireOpenInvite } from "../../guard";

// Open Invite > a plan > "Edit invite": the post form filled in with the plan (the design says to reuse it). The
// host only: anyone else gets a 404. A plan that was cancelled or has started cannot change: back to its page.
// Saving is editOpenInvite (app/members/open-invite/[id]/actions.ts): every form rule again, never fewer places
// than the people going, and a new time or place tells them (the plan-changed email or an Update).
export default async function EditOpenInvitePage({ params }: { params: Promise<{ id: string }> }) {
  await requireOpenInvite();
  const { id } = await params;
  const member = await requireMember();
  const viewer = { id: member.id, email: member.email };
  const [page, context] = await Promise.all([openInvitePage(viewer, id), newInviteContext(viewer)]);
  if (!page || page.invite.you.role !== "host" || (page.invite.cost && !paidPlansShown())) notFound();
  if (page.invite.status !== "scheduled") redirect(openInviteHref(page.invite.id));
  const others = page.invite.going.filter((person) => person.id !== member.id);
  return (
    <PostView
      context={context}
      paidPlans={paidPlansShown()}
      initial={valuesOf(page.invite)}
      editing={{ id: page.invite.id, title: page.invite.title, others }}
    />
  );
}
