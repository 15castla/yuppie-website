import { notFound } from "next/navigation";

import { requireMember } from "@/app/members/require-member";
import { ReceiptView } from "@/components/members/payments/receipt-view";
import { receiptFor } from "@/lib/server/plan-payments";
import { paidPlansShown, requireOpenInvite } from "../../guard";

// Open Invite > a plan > receipt (15 Nov 2026): the member's own latest payment for a place on the plan. A 404 for
// anyone who did not pay for it, and while paid plans are off.
export default async function OpenInviteReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOpenInvite();
  if (!paidPlansShown()) notFound();
  const { id } = await params;
  const member = await requireMember();
  const receipt = /^[0-9a-f-]{36}$/i.test(id) ? await receiptFor({ id: member.id, email: member.email, full_name: member.full_name }, id) : null;
  if (!receipt) notFound();
  return <ReceiptView receipt={receipt} live />;
}
