import { requireAdmin } from "@/app/admin/require-admin";
import { EmptyCard } from "@/components/admin/empty-card";
import { dateParts, dayDate, pounds, time24 } from "@/components/admin/format";
import { AdminMain, DateCol, PageHead, Pill } from "@/components/admin/ui";
import { adminPayments, type AdminPaymentRow } from "@/lib/server/plan-payments";
import { RefundButton } from "./RefundButton";

// Admin > Payments (15 Nov 2026): every payment for a place on a paid Open Invite plan, newest first, where the money
// is, and a Refund for one still held by Club Yuppie (a no-show, a complaint). Once the money has gone to the host it
// is refunded in Stripe (reverse the transfer first).

const STATUS: Record<AdminPaymentRow["status"], { label: string; kind: "plain" | "ink" | "muted" }> = {
  held: { label: "Held", kind: "ink" },
  refund_asked: { label: "Refund asked", kind: "plain" },
  refund_due: { label: "Refund on its way", kind: "plain" },
  refunded: { label: "Refunded", kind: "muted" },
  paid_out: { label: "Paid to host", kind: "muted" },
};

const WHY: Record<string, string> = {
  "left-in-time": "left more than 24 hours before",
  "host-cancelled": "the host cancelled",
  "host-agreed": "the host agreed",
  club: "Club Yuppie refunded it",
};

export default async function AdminPaymentsPage() {
  // Every admin page and layout checks for itself (aal2): a soft navigation or router refresh can skip the
  // layouts above it (QA2-01).
  await requireAdmin();
  const rows = await adminPayments();
  const held = rows.filter((r) => r.status === "held" || r.status === "refund_asked").reduce((sum, r) => sum + r.amountPence, 0);
  const stuck = rows.filter((r) => r.status === "refund_due" && r.tries >= 3).length;
  return (
    <AdminMain>
      <PageHead
        title="Payments"
        lead={
          rows.length
            ? `Open Invite payments. ${pounds(held)} held by Club Yuppie until the plans are over.${stuck ? ` ${stuck} refund${stuck === 1 ? "" : "s"} Stripe keeps refusing: look in Stripe.` : ""}`
            : "Open Invite payments show here once members pay for a place."
        }
      />
      <div style={{ marginTop: 24 }}>
        {rows.length === 0 ? (
          <EmptyCard a="No payments" b="yet." line="When a member pays to join an Open Invite plan, it shows here." sub="With where the money is, and a refund button while Club Yuppie still holds it." art="coupes" />
        ) : (
          <div className="ad-q">
            {rows.map((r) => {
              const status = STATUS[r.status];
              const { weekday, day } = dateParts(r.paidAt);
              const detail =
                r.status === "refunded" || r.status === "refund_due"
                  ? `Refunded${r.refundReason ? `: ${WHY[r.refundReason] ?? r.refundReason}` : ""}${r.refundedAt ? `, ${dayDate(r.refundedAt)}` : ""}`
                  : r.status === "paid_out"
                    ? `To the host's bank about ${r.payoutOn ? dayDate(`${r.payoutOn}T09:00:00Z`) : "2 working days after the plan"}`
                    : `Plan ${dayDate(r.startsAt)}, ${time24(r.startsAt)}. Paid to the host about 2 working days after.`;
              return (
                <div className="ad-item" key={r.id}>
                  <span className="lead">
                    <DateCol weekday={weekday} day={day} />
                  </span>
                  <span>
                    <span className="t">
                      {pounds(r.amountPence)} · {r.payerName} for {r.planTitle}
                    </span>
                    <span className="m">
                      Host {r.hostName} · {r.method} · No. {r.receipt} · {time24(r.paidAt)}
                    </span>
                    <span className={r.status === "refund_due" && r.tries >= 3 ? "m flag" : "m"}>{detail}</span>
                  </span>
                  <span className="end">
                    <Pill kind={status.kind}>{status.label}</Pill>
                    {r.status === "held" || r.status === "refund_asked" || r.status === "refund_due" ? (
                      <RefundButton paymentId={r.id} label={r.status === "refund_due" ? "Try the refund again" : `Refund ${pounds(r.amountPence)}`} />
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminMain>
  );
}
