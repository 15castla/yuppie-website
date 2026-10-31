import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/app/members/require-member";
import { PlansView } from "@/components/members/plans/plans-view";
import { flags, openInviteOn } from "@/lib/members/flags";
import { listClubEventPlans } from "@/lib/members/plans/club-events";
import type { Plan, PlansWhen } from "@/lib/members/plans/types";
import { detectShellMode } from "@/lib/members/shell-mode";
import { openInvitePlanRows } from "@/lib/server/plans";

// Your plans: the club events the member has booked and, with Open Invite on (in this shell), the Open Invites
// they host or are going to (stage 2 brief 2.1: "Your plans including Open Invite plans"), upcoming or past
// (?when=past). Real data, in date order (upcoming soonest first, past newest first).
export default async function MembersPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ when?: string | string[] }>;
}) {
  const { when: whenParam } = await searchParams;
  const when: PlansWhen = whenParam === "past" ? "past" : "upcoming";

  const member = await requireMember();
  const mode = await detectShellMode();
  const showInvites = openInviteOn(mode);
  const supabase = await createClient();
  const [events, invites] = await Promise.all([
    listClubEventPlans(supabase, member.id, when),
    showInvites ? openInvitePlanRows(member.id, when) : Promise.resolve([]),
  ]);
  const at = (plan: Plan) => new Date(plan.startsAt).getTime();
  const plans: Plan[] = [...events, ...invites].sort((a, b) => (when === "upcoming" ? at(a) - at(b) : at(b) - at(a)));

  return <PlansView plans={plans} when={when} openInvite={showInvites && flags.openInvite} />;
}
