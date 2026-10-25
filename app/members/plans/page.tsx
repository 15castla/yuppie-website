import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/app/members/require-member";
import { PlansView } from "@/components/members/plans/plans-view";
import { flags } from "@/lib/members/flags";
import { listClubEventPlans } from "@/lib/members/plans/club-events";
import type { PlansWhen } from "@/lib/members/plans/types";

// Your plans: the club events the member has booked, upcoming or past
// (?when=past). Real data. The Open Invite rows join the list when the Open
// Invite backend exists (lib/members/plans/types.ts has the row type); until
// then, with the flag on or off, the list is club events.
export default async function MembersPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ when?: string | string[] }>;
}) {
  const { when: whenParam } = await searchParams;
  const when: PlansWhen = whenParam === "past" ? "past" : "upcoming";

  const member = await requireMember();
  const supabase = await createClient();
  const plans = await listClubEventPlans(supabase, member.id, when);

  return <PlansView plans={plans} when={when} openInvite={flags.openInvite} />;
}
