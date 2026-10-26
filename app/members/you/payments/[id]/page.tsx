import { notFound } from "next/navigation";

import { requireMember } from "@/app/members/require-member";
import { PlanPaymentsView } from "@/components/members/payments/plan-payments-view";
import { requireFlag } from "@/lib/members/flags";
import { assertMockAllowed } from "@/lib/members/mock/guard";
import { getHostPlanPayments } from "@/lib/members/mock/payments";

// You > Payments > one plan: who paid and where the money is. A 404 while paid plans are off.
export default async function YouPaymentsPlanPage({ params }: { params: Promise<{ id: string }> }) {
  requireFlag("openInvite");
  requireFlag("paidPlans");
  assertMockAllowed();
  const { id } = await params;
  const [, plan] = await Promise.all([requireMember(), getHostPlanPayments(id)]);
  if (!plan) notFound();
  return <PlanPaymentsView plan={plan} />;
}
