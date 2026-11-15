import { notFound } from "next/navigation";

import { requireMember } from "@/app/members/require-member";
import { paidPlansShown } from "@/app/members/open-invite/guard";
import { PaymentsView } from "@/components/members/payments/payments-view";
import { openInviteOn, requireFlag } from "@/lib/members/flags";
import { detectShellMode } from "@/lib/members/shell-mode";
import { hostPayments } from "@/lib/server/plan-payments";

// You > Payments: the host's money from paid plans and Get paid (15 Nov 2026: lib/server/plan-payments.ts). A 404
// while paid plans are off, or where Open Invite does not show.
export default async function YouPaymentsPage({ searchParams }: { searchParams: Promise<{ getpaid?: string }> }) {
  requireFlag("openInvite");
  requireFlag("paidPlans");
  if (!paidPlansShown() || !openInviteOn(await detectShellMode())) notFound();
  const member = await requireMember();
  const { getpaid } = await searchParams;
  const payments = await hostPayments(member.id, new Date(), { backFromStripe: getpaid === "back" });
  const notice = getpaid === "error" ? "We couldn’t reach Stripe just now. Try again in a moment." : null;
  return <PaymentsView payments={payments} live notice={notice} />;
}
