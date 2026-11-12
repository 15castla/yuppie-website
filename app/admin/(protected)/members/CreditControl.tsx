"use client";

// A member's page, Nominations and credit (12 Nov 2026): add or take off credit with a reason (the member sees the
// reason in their credit history), and how many nominations they may make. Each saves at once and says what it did.

import { useState, useTransition } from "react";

import { BusyButton } from "@/components/admin/bits";
import { Icon } from "@/components/admin/icons";
import { adminAdjustCredit, adminSetNominationsAllowed, type CreditActionResult } from "@/app/admin/credit-actions";

function Outcome({ result }: { result: CreditActionResult | null }) {
  if (!result) return null;
  return result.ok ? (
    <p className="ad-saved" role="status">
      <Icon name="check" size={18} />
      {result.message}
    </p>
  ) : (
    <p className="ad-errline" role="alert">
      <Icon name="circle-alert" size={18} />
      {result.error}
    </p>
  );
}

export function CreditControl({ memberId, first, allowed }: { memberId: string; first: string; allowed: number }) {
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [creditResult, setCreditResult] = useState<CreditActionResult | null>(null);
  const [savingCredit, startCredit] = useTransition();

  const [count, setCount] = useState(String(allowed));
  const [countResult, setCountResult] = useState<CreditActionResult | null>(null);
  const [savingCount, startCount] = useTransition();

  function saveCredit() {
    const pounds = Number(amount.replace(/[£,\s]/g, ""));
    if (!Number.isFinite(pounds) || pounds <= 0) {
      setCreditResult({ ok: false, error: "Enter an amount in pounds, like 10 or 2.50." });
      return;
    }
    const pence = Math.round(pounds * 100) * (direction === "add" ? 1 : -1);
    setCreditResult(null);
    startCredit(async () => {
      const result = await adminAdjustCredit(memberId, pence, reason);
      setCreditResult(result);
      if (result.ok) {
        setAmount("");
        setReason("");
      }
    });
  }

  function saveCount() {
    setCountResult(null);
    startCount(async () => setCountResult(await adminSetNominationsAllowed(memberId, Number(count))));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 20 }}>
      <div className="ad-field">
        <fieldset className="ad-opts" style={{ marginTop: 0 }}>
          <legend>Add or take off credit</legend>
          <span className="lb" aria-hidden="true" style={{ display: "block", padding: "0 0 10px", font: "700 14px/1.2 var(--font-body)" }}>
            Add or take off credit
          </span>
          {(
            [
              ["add", "Add credit", "Goes on their credit now."],
              ["remove", "Take off credit", "Only what they have. They see it in their history."],
            ] as const
          ).map(([key, label, line]) => (
            <label className="ad-opt" key={key}>
              <input type="radio" name={`credit-dir-${memberId}`} checked={direction === key} onChange={() => setDirection(key)} />
              <span className="rd" aria-hidden="true" />
              <span className="tx">
                <b>{label}</b>
                <span>{line}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label htmlFor={`credit-amount-${memberId}`}>Amount (£)</label>
        <input
          id={`credit-amount-${memberId}`}
          className="ad-input"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="10"
          autoComplete="off"
          disabled={savingCredit}
        />
        <label htmlFor={`credit-reason-${memberId}`}>Reason</label>
        <input
          id={`credit-reason-${memberId}`}
          className="ad-input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Sorry about the mix-up at the wine night"
          autoComplete="off"
          maxLength={200}
          disabled={savingCredit}
        />
        <p className="hint">{first} sees the reason in their credit history. Credit is for Club events only and is never paid out.</p>
        <div className="ad-acts">
          <BusyButton type="button" className="sm" busy={savingCredit} busyLabel="Saving…" onClick={saveCredit}>
            {direction === "add" ? "Add credit" : "Take off credit"}
          </BusyButton>
        </div>
        <Outcome result={creditResult} />
      </div>

      <div className="ad-field">
        <label htmlFor={`nominations-${memberId}`}>Nominations they can make</label>
        <input
          id={`nominations-${memberId}`}
          className="ad-input"
          inputMode="numeric"
          value={count}
          onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ""))}
          style={{ maxWidth: 120 }}
          disabled={savingCount}
        />
        <p className="hint">5 for everyone. Each application made with their link or code uses one, approved or not.</p>
        <div className="ad-acts">
          <BusyButton type="button" className="sm secondary" busy={savingCount} busyLabel="Saving…" onClick={saveCount}>
            Save
          </BusyButton>
        </div>
        <Outcome result={countResult} />
      </div>
    </div>
  );
}
