import { requireMember } from "@/app/members/require-member";
import { PaymentsView } from "@/components/members/payments/payments-view";
import { requireFlag } from "@/lib/members/flags";
import { assertMockAllowed } from "@/lib/members/mock/guard";
import { getHostPayments } from "@/lib/members/mock/payments";

// You > Payments: the host's money from paid plans. A 404 while paid plans are off.
export default async function YouPaymentsPage() {
  requireFlag("openInvite");
  requireFlag("paidPlans");
  assertMockAllowed();
  const [, payments] = await Promise.all([requireMember(), getHostPayments()]);
  return <PaymentsView payments={payments} />;
}
