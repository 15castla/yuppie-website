import { notFound } from "next/navigation";

import { requireMember } from "@/app/members/require-member";
import { PlanPaymentsView } from "@/components/members/payments/plan-payments-view";
import { requireFlag } from "@/lib/members/flags";
import { paidPlansLive } from "@/lib/server/config";
import { ExampleScope } from "@/components/members/kit";
import { assertMockAllowed } from "@/lib/members/mock/guard";
import { getHostPlanPayments } from "@/lib/members/mock/payments";

// You > Payments > one plan: who paid and where the money is. A 404 while paid plans are off.
export default async function YouPaymentsPlanPage({ params }: { params: Promise<{ id: string }> }) {
  requireFlag("openInvite");
  requireFlag("paidPlans");
  // Paid plans are stage 3: a 404 unless the server-only MEMBERS_PAID_PLANS_LIVE=on too (never in stage 2).
  if (!paidPlansLive()) notFound();
  assertMockAllowed();
  const { id } = await params;
  const [, plan] = await Promise.all([requireMember(), getHostPlanPayments(id)]);
  if (!plan) notFound();
  return (
    <ExampleScope>
      <PlanPaymentsView plan={plan} />
    </ExampleScope>
  );
}
