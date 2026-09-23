"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { deleteMember } from "@/app/admin/members-actions";

// window.prompt() rather than a custom modal, since this admin panel has no
// modal UI to match elsewhere, and a real delete needs more than an
// OK/Cancel click. Typing the member's name back to confirm is the same
// "type to confirm" pattern GitHub/Vercel use for destructive actions,
// enough deliberate friction that a stray click can't trigger it.
export function DeleteMemberButton({
  memberId,
  memberName,
  hasStripeSubscription,
}: {
  memberId: string;
  memberName: string;
  hasStripeSubscription: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);

    const typed = window.prompt(
      `This permanently deletes ${memberName}'s account and cannot be undone.` +
        (hasStripeSubscription
          ? " Their Stripe subscription will also be cancelled immediately."
          : "") +
        `\n\nType "${memberName}" to confirm.`,
    );

    if (typed === null) return;
    if (typed.trim() !== memberName) {
      setError("Name didn't match exactly, so nothing was deleted.");
      return;
    }

    startTransition(async () => {
      const result = await deleteMember(memberId);
      if (!result.success) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.push("/admin/members");
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-full border border-red-700/30 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-700/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Deleting…" : "Delete member"}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
