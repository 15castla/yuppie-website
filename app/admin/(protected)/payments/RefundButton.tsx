"use client";

import { useState } from "react";

import { adminRefundPlanPayment } from "@/app/admin/payments-actions";

// One payment back to the member's card, in full, after a second tap ("Refund £22" then "Yes, refund it"). The
// viewer never shows confirm() dialogs, so the check is on the button itself.
export function RefundButton({ paymentId, label }: { paymentId: string; label: string }) {
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    if (!sure) {
      setSure(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await adminRefundPlanPayment(paymentId);
      if (!result.ok) setError(result.error);
      setSure(false);
    } catch {
      setError("That didn’t go through. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className="ad-btn sm secondary" disabled={busy} onClick={() => void go()}>
        {busy ? "Refunding…" : sure ? "Yes, refund it" : label}
      </button>
      {sure && !busy ? (
        <button type="button" className="ad-link" onClick={() => setSure(false)}>
          Not now
        </button>
      ) : null}
      {error ? (
        <small role="alert" style={{ color: "var(--error)", maxWidth: 220 }}>
          {error}
        </small>
      ) : null}
    </>
  );
}
