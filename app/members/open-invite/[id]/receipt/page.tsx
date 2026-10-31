import { notFound } from "next/navigation";

import { requireMember } from "@/app/members/require-member";
import { ReceiptView } from "@/components/members/payments/receipt-view";
import { ExampleScope } from "@/components/members/kit";
import { assertMockAllowed } from "@/lib/members/mock/guard";
import { getReceipt } from "@/lib/members/mock/payments";
import { paidPlansShown, requireOpenInvite } from "../../guard";

// Open Invite > a plan > receipt. A paid-plans screen, still example data (paid plans are stage 3): a 404 unless
// the paid plans flag AND the server-only MEMBERS_PAID_PLANS_LIVE=on (never in stage 2), and then only where
// example screens may show (MEMBERS_SHOW_EXAMPLES on the live site).
export default async function OpenInviteReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOpenInvite();
  if (!paidPlansShown()) notFound();
  assertMockAllowed();
  const { id } = await params;
  const [, receipt] = await Promise.all([requireMember(), getReceipt(id)]);
  if (!receipt) notFound();
  return (
    <ExampleScope>
      <ReceiptView receipt={receipt} />
    </ExampleScope>
  );
}
