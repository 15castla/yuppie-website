"use client";

// Cancel event (B-D8, r2b 17): the dialog says how many are booked and how much goes back, takes an optional
// reason (the words after "because" in the email) and shows the email they get. Then every booking is
// cancelled, paid ones refunded in full, and each person emailed (adminCancelEvent).

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { adminCancelEvent } from "@/app/admin/event-booking-actions";
import { BusyButton, SaveFailed } from "@/components/admin/bits";
import { Dialog } from "@/components/admin/dialog";
import { pounds } from "@/components/admin/format";

type Preview = { subject: string; preheader: string };

export function CancelEvent({
  eventId,
  title,
  booked,
  paid,
  refundTotal,
  perPerson,
  preview,
}: {
  eventId: string;
  title: string;
  booked: number;
  /** How many booked people paid. */
  paid: number;
  /** All that goes back, in pence. */
  refundTotal: number;
  /** What each paid, when everyone who paid paid the same. */
  perPerson: number | null;
  preview: Preview | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  let body: string;
  if (booked === 0) body = "Nobody is booked, so nobody is emailed. Members stop seeing it straight away. It can’t be undone.";
  else if (paid === 0)
    body = `${booked === 1 ? "1 person is booked. They get" : `${booked} people are booked. They each get`} an email. Nothing is refunded because the event is included in the membership. It can’t be undone.`;
  else if (paid === booked && perPerson !== null)
    body =
      booked === 1
        ? `1 person is booked. They get an email, and the ${pounds(perPerson)} they paid goes back to their card. It can’t be undone.`
        : `${booked} people are booked. They each get an email, and the ${pounds(perPerson)} each paid goes back to their card. That is ${pounds(refundTotal)} in all. It can’t be undone.`;
  else
    body = `${booked} people are booked. They each get an email, and the ${paid === 1 ? "1 who paid gets" : `${paid} who paid get`} their money back: ${pounds(refundTotal)} in all. It can’t be undone.`;

  const action = paid > 0 ? `Cancel event and refund ${paid}` : booked > 0 ? `Cancel event and email ${booked}` : "Cancel event";

  function confirm() {
    start(async () => {
      const result = await adminCancelEvent(eventId, { note: reason.trim() || null }).catch(() => ({ ok: false as const, error: "" }));
      setOpen(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="ad-btn sm danger"
        onClick={() => {
          setError(null);
          setReason("");
          setOpen(true);
        }}
      >
        Cancel event
      </button>
      {error !== null && (
        <div style={{ flexBasis: "100%" }}>
          <SaveFailed title="The event wasn’t cancelled." raw={error || null} />
        </div>
      )}
      <Dialog
        open={open}
        title={`Cancel ${title}?`}
        onClose={() => setOpen(false)}
        busy={busy}
        testId="dialog-cancel-event"
        actions={
          <>
            <BusyButton type="button" className="danger solid" busy={busy} busyLabel="Cancelling…" onClick={confirm}>
              {action}
            </BusyButton>
            <button type="button" className="ad-btn secondary" disabled={busy} onClick={() => setOpen(false)}>
              Keep the event
            </button>
          </>
        }
      >
        <p className="ad-p">{body}</p>
        {booked > 0 && (
          <div className="ad-field">
            <label htmlFor={`reason-${eventId}`}>Reason (optional)</label>
            <input
              id={`reason-${eventId}`}
              className="ad-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Because the courts are closed that evening"
              autoComplete="off"
              maxLength={200}
              disabled={busy}
              data-autofocus
            />
            <p className="hint">Added to the email after the date. Leave it empty to say nothing.</p>
          </div>
        )}
        {preview && booked > 0 && (
          <div className="prev" data-testid="preview-cancel-email">
            <b>The email {booked === 1 ? "1 person gets" : `${booked} people get`}</b>
            <p className="subj">{preview.subject}</p>
            <span>{preview.preheader}</span>
          </div>
        )}
      </Dialog>
    </>
  );
}
