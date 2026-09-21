"use client";

import { useState, useTransition } from "react";

import { revokeMembership } from "@/app/admin/members-actions";

// Plain window.confirm() rather than a custom modal — cancelling someone's
// paid membership is consequential enough to want a deliberate second
// click, but this admin panel doesn't otherwise have modal UI anywhere
// worth matching (its other destructive actions, like deleting a perk,
// skip confirmation entirely — this one earns the extra step since it
// affects a paying member rather than catalog content).
export function RevokeMembershipButton({
  memberId,
  memberName,
}: {
  memberId: string;
  memberName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    const confirmed = window.confirm(
      `Revoke ${memberName}'s membership? Their status will be set to "cancelled". This doesn't cancel their Stripe subscription or delete their account.`,
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await revokeMembership(memberId);
      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-full border border-red-700/30 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-700/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Revoking…" : "Revoke membership"}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
