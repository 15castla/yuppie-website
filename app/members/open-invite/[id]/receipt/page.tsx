import { notFound } from "next/navigation";

import { requireMember } from "@/app/members/require-member";
import { ReceiptView } from "@/components/members/payments/receipt-view";
import { requireFlag } from "@/lib/members/flags";
import { assertMockAllowed } from "@/lib/members/mock/guard";
import { getReceipt } from "@/lib/members/mock/payments";

// Open Invite > a plan > receipt. A paid-plans screen: a 404 while paid plans are off.
export default async function OpenInviteReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  requireFlag("openInvite");
  requireFlag("paidPlans");
  assertMockAllowed();
  const { id } = await params;
  const [, receipt] = await Promise.all([requireMember(), getReceipt(id)]);
  if (!receipt) notFound();
  return <ReceiptView receipt={receipt} />;
}
