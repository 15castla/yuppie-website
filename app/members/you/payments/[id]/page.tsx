import { notFound } from "next/navigation";

import { requireMember } from "@/app/members/require-member";
import { paidPlansShown } from "@/app/members/open-invite/guard";
import { PlanPaymentsView } from "@/components/members/payments/plan-payments-view";
import { openInviteOn, requireFlag } from "@/lib/members/flags";
import { detectShellMode } from "@/lib/members/shell-mode";
import { hostPlanPayments } from "@/lib/server/plan-payments";

// You > Payments > one plan: who paid, where the money is, and a refund request to answer (15 Nov 2026). The host
// only; a 404 for anyone else and while paid plans are off.
export default async function YouPaymentsPlanPage({ params }: { params: Promise<{ id: string }> }) {
  requireFlag("openInvite");
  requireFlag("paidPlans");
  if (!paidPlansShown() || !openInviteOn(await detectShellMode())) notFound();
  const { id } = await params;
  const member = await requireMember();
  const plan = /^[0-9a-f-]{36}$/i.test(id) ? await hostPlanPayments(member.id, id) : null;
  if (!plan) notFound();
  return <PlanPaymentsView plan={plan} live />;
}
