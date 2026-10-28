"use client";

// Danger zone: Delete member, now the page's own dialog (r2b 15) with the same type-the-name rule as the old
// browser prompt. The button stays switched off until the name matches.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteMember } from "@/app/admin/members-actions";
import { BusyButton, SaveFailed } from "@/components/admin/bits";
import { Dialog } from "@/components/admin/dialog";

export function DeleteMember({ memberId, name, hasSubscription }: { memberId: string; name: string; hasSubscription: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim() === name.trim();

  function confirm() {
    if (!matches) return;
    start(async () => {
      const result = await deleteMember(memberId).catch(() => ({ success: false, error: "" }));
      if (!result.success) {
        setError(result.error ?? "");
        setOpen(false);
        return;
      }
      setOpen(false);
      router.push("/admin/members");
      router.refresh();
    });
  }

  return (
    <>
      {error !== null && <SaveFailed title="The member wasn’t deleted." raw={error || null} />}
      <div className="ad-acts">
        <button
          type="button"
          className="ad-btn sm danger"
          onClick={() => {
            setTyped("");
            setError(null);
            setOpen(true);
          }}
        >
          Delete member
        </button>
      </div>
      <Dialog
        open={open}
        title={`Delete ${name}?`}
        onClose={() => setOpen(false)}
        busy={busy}
        testId="dialog-delete-member"
        actions={
          <>
            <BusyButton type="button" className="danger solid" busy={busy} busyLabel="Deleting…" disabled={!matches} onClick={confirm}>
              Delete member
            </BusyButton>
            <button type="button" className="ad-btn secondary" disabled={busy} onClick={() => setOpen(false)}>
              Keep member
            </button>
          </>
        }
      >
        <p className="ad-p">
          This permanently deletes {name}’s account{hasSubscription ? " and cancels their Stripe subscription straight away" : ""}. This can’t be undone.
        </p>
        <div className="ad-field">
          <label htmlFor={`confirm-${memberId}`}>Type {name} to confirm</label>
          <input
            id={`confirm-${memberId}`}
            className="ad-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            data-autofocus
            onKeyDown={(e) => {
              if (e.key === "Enter") confirm();
            }}
          />
        </div>
      </Dialog>
    </>
  );
}
