"use client";

// Danger zone: Delete member, the page's own dialog (r2b 15) with the same type-the-name rule as the old
// browser prompt. The button stays switched off until the name matches. It is the member's own Delete my
// account (QA2-02): the dialog says what happens, so nobody is surprised by a cancelled booking or a refund.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteMember } from "@/app/admin/members-actions";
import { Banner, BusyButton } from "@/components/admin/bits";
import { Dialog } from "@/components/admin/dialog";
import { pounds } from "@/components/admin/format";

export function DeleteMember({
  memberId,
  name,
  first,
  hasSubscription,
  futureBookings,
  futurePaidPence,
}: {
  memberId: string;
  name: string;
  first: string;
  hasSubscription: boolean;
  futureBookings: number;
  futurePaidPence: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim() === name.trim();

  function confirm() {
    if (!matches || busy) return;
    start(async () => {
      const result = await deleteMember(memberId).catch(() => ({ success: false as const, error: "The member wasn’t deleted. Try again in a moment." }));
      setOpen(false);
      if (!result.success) {
        setError(result.error);
        router.refresh();
        return;
      }
      router.push("/admin/members");
      router.refresh();
    });
  }

  const bookingsLine =
    futureBookings > 0
      ? `${futureBookings === 1 ? `${first}’s one future booking is` : `${first}’s ${futureBookings} future bookings are`} cancelled${
          futurePaidPence > 0 ? `, and the ${pounds(futurePaidPence)} paid goes back to the card` : ""
        }.`
      : null;

  return (
    <>
      {error !== null && <Banner title="The member wasn’t deleted.">{error}</Banner>}
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
        <p className="ad-p">This deletes {first}’s account, the same way as Delete my account. It can’t be undone.</p>
        <ul className="ad-steps">
          {hasSubscription && <li>The £10 a month subscription is cancelled in Stripe now. This month isn’t refunded.</li>}
          {bookingsLine && <li>{bookingsLine}</li>}
          <li>Name, phone, photo and other details are removed. Bookings and payment records are kept.</li>
          <li>{first} gets an email saying the account is deleted, and can’t log in again. {first} can apply again with the same email.</li>
        </ul>
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
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirm();
            }}
          />
        </div>
      </Dialog>
    </>
  );
}
