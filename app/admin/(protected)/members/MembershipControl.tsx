"use client";

// The member card's Membership section (r2b 15): what the member has now, then three plain choices (Active,
// Paused, Cancelled) with what the member will see. Save is switched off until something changes; then a
// dialog asks about Stripe with the box ticked (B-D2). Cancelled is immediate and final (B-D23). Resume from
// a paused membership asks about Stripe the same way.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { adminCancelMemberNow, adminPauseMember, adminResumeMember, type MemberStatusResult } from "@/app/admin/member-status-actions";
import { Banner, BusyButton, SaveFailed } from "@/components/admin/bits";
import { CheckRow, Dialog } from "@/components/admin/dialog";
import { Pill, SavedLine, Section } from "@/components/admin/ui";

export type MembershipView = {
  memberId: string;
  first: string;
  status: "active" | "paused" | "cancelled";
  line: string;
  note: string | null;
  hasSubscription: boolean;
  pausedWithStripe: boolean | null;
  futureBookings: number;
};

type Choice = "active" | "paused" | "cancelled";
type Done = { title: string; hint: string };

export function MembershipControl({ view }: { view: MembershipView }) {
  const router = useRouter();
  const { first } = view;
  const [mode, setMode] = useState<"view" | "change">("view");
  const [pick, setPick] = useState<Choice>(view.status === "paused" ? "paused" : "active");
  const [dialog, setDialog] = useState<Choice | null>(null);
  const [stripeBox, setStripeBox] = useState(true);
  const [busy, startBusy] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const choicesRef = useRef<HTMLFieldSetElement>(null);

  // Change membership opens the three choices with the keyboard on the chosen one (QA2-11), the radio group's
  // own stop: Active for an active member, the first choice.
  useEffect(() => {
    if (mode !== "change") return;
    const checked = choicesRef.current?.querySelector<HTMLInputElement>("input[type=radio]:checked") ?? choicesRef.current?.querySelector<HTMLInputElement>("input[type=radio]");
    checked?.focus();
  }, [mode]);

  function openDialog(which: Choice) {
    setError(null);
    setStale(null);
    setStripeBox(which === "active" ? view.pausedWithStripe !== false : true);
    setDialog(which);
  }

  function run(which: Choice) {
    const stripe = view.hasSubscription && stripeBox;
    startBusy(async () => {
      let result: MemberStatusResult;
      try {
        result =
          which === "paused"
            ? await adminPauseMember(view.memberId, { stripe })
            : which === "cancelled"
              ? await adminCancelMemberNow(view.memberId, { stripe })
              : await adminResumeMember(view.memberId, { stripe });
      } catch {
        result = { ok: false, error: "" };
      }
      if (!result.ok) {
        setDialog(null);
        if (result.stale) {
          // Someone changed it since the page opened: say what it is now and show the card as it is.
          setStale(result.error);
          setMode("view");
          router.refresh();
          return;
        }
        setError(result.error || null);
        return;
      }
      const inStripe = result.stripe;
      if (which === "paused") {
        setDone({
          title: `${first}’s membership is paused.`,
          hint: `${inStripe ? "Payments are paused in Stripe." : "Payments in Stripe were left as they were."} ${first} sees a page that says the membership is paused.`,
        });
      } else if (which === "cancelled") {
        const n = result.cancelledBookings ?? 0;
        setDone({
          title: `${first}’s membership is cancelled.`,
          hint: `${inStripe ? "The subscription was cancelled in Stripe." : "The subscription in Stripe was left as it was."} ${first} gets the membership ended email.${
            n ? ` ${n === 1 ? "One future booking was" : `${n} future bookings were`} cancelled and paid ones refunded.` : ""
          }`,
        });
      } else {
        setDone({
          title: `${first}’s membership is active again.`,
          hint: `${inStripe ? "Payments run again in Stripe." : "Payments in Stripe were left as they were."} ${first} can use the members area now.`,
        });
      }
      setDialog(null);
      setMode("view");
      router.refresh();
    });
  }

  const status = view.status;
  const options: { key: Choice; label: string; line: string }[] = [
    { key: "active", label: "Active", line: "Full use of the members area. Payments run as normal." },
    { key: "paused", label: "Paused", line: `${first} sees a page that says the membership is paused, and can’t use the members area until you switch it back.` },
    {
      key: "cancelled",
      label: "Cancelled",
      line: `${first} sees a page that says the membership has ended and gets the membership ended email. To come back, ${first} applies again.`,
    },
  ];
  const current: Choice = status === "paused" ? "paused" : "active";

  let body;
  if (status === "cancelled") {
    body = (
      <>
        {done ? <SavedLine>{done.title}</SavedLine> : <p className="ad-p">{view.line}</p>}
        {done && <p className="ad-hint" style={{ marginTop: 0 }}>{done.hint}</p>}
        {view.note && <p className="ad-hint">{view.note}</p>}
      </>
    );
  } else if (mode === "change") {
    body = (
      <>
        <fieldset className="ad-opts" ref={choicesRef}>
          <legend>Membership</legend>
          {options.map((o) => (
            <label className="ad-opt" key={o.key}>
              <input type="radio" name={`membership-${view.memberId}`} value={o.key} checked={pick === o.key} onChange={() => setPick(o.key)} />
              <span className="rd" aria-hidden="true" />
              <span className="tx">
                <b>{o.label}</b>
                <span>{o.line}</span>
              </span>
              {o.key === "cancelled" && (
                <span className="fin">
                  <Pill kind="muted">Final</Pill>
                </span>
              )}
            </label>
          ))}
        </fieldset>
        <div className="ad-acts">
          <button type="button" className="ad-btn sm" disabled={pick === current} onClick={() => openDialog(pick)}>
            Save change
          </button>
          <button
            type="button"
            className="ad-btn sm secondary"
            onClick={() => {
              setMode("view");
              setPick(current);
            }}
          >
            Keep as it is
          </button>
        </div>
        <p className="ad-hint">You’ll be asked to confirm, and whether to change {first}’s payments in Stripe too.</p>
      </>
    );
  } else {
    body = (
      <>
        {done ? (
          <>
            <SavedLine>{done.title}</SavedLine>
            <p className="ad-hint" style={{ marginTop: 0 }}>
              {done.hint}
            </p>
          </>
        ) : (
          <>
            <p className="ad-p">{view.line}</p>
            {view.note && <p className="ad-hint">{view.note}</p>}
          </>
        )}
        <div className="ad-acts">
          {status === "paused" && (
            <button type="button" className="ad-btn sm" onClick={() => openDialog("active")}>
              Resume membership
            </button>
          )}
          <button
            type="button"
            className="ad-btn sm secondary"
            onClick={() => {
              setDone(null);
              setError(null);
              setStale(null);
              setPick(current);
              setMode("change");
            }}
          >
            Change membership
          </button>
        </div>
      </>
    );
  }

  const stripeHint = !view.hasSubscription ? <p className="ad-p">{first} has no subscription in Stripe, so only the club’s record changes.</p> : null;
  const bookingsLine =
    view.futureBookings > 0 ? (
      <p className="ad-p" style={{ fontSize: 15 }}>
        {view.futureBookings === 1 ? `${first}’s one future booking is cancelled` : `${first}’s ${view.futureBookings} future bookings are cancelled`}, and what was paid goes back to the card.
      </p>
    ) : null;

  return (
    <Section title="Membership">
      {stale !== null && (
        <Banner title="Nothing changed." info>
          {stale}
        </Banner>
      )}
      {error !== null && <SaveFailed raw={error || null} />}
      {body}

      <Dialog
        open={dialog === "paused"}
        title={`Pause ${first}’s membership?`}
        onClose={() => setDialog(null)}
        busy={busy}
        testId="dialog-pause"
        actions={
          <>
            <BusyButton type="button" busy={busy} busyLabel="Pausing…" onClick={() => run("paused")}>
              Pause membership
            </BusyButton>
            <button type="button" className="ad-btn secondary" disabled={busy} onClick={() => setDialog(null)}>
              Keep {first} active
            </button>
          </>
        }
      >
        <p className="ad-p">
          {first} can’t use the members area until you switch it back. {first} is not emailed.
        </p>
        {view.hasSubscription ? (
          <CheckRow
            checked={stripeBox}
            onChange={setStripeBox}
            disabled={busy}
            label={`Also pause ${first}’s £10 a month payments in Stripe`}
            hint="Nothing is taken until you resume. Untick to leave billing as it is."
          />
        ) : (
          stripeHint
        )}
      </Dialog>

      <Dialog
        open={dialog === "cancelled"}
        title={`Cancel ${first}’s membership?`}
        onClose={() => setDialog(null)}
        busy={busy}
        testId="dialog-cancel"
        actions={
          <>
            <BusyButton type="button" className="danger solid" busy={busy} busyLabel="Cancelling…" onClick={() => run("cancelled")}>
              Cancel membership
            </BusyButton>
            <button type="button" className="ad-btn secondary" disabled={busy} onClick={() => setDialog(null)}>
              Keep membership
            </button>
          </>
        }
      >
        <p className="ad-p">
          {first} sees a page that says the membership has ended, and gets the membership ended email. To come back, {first} applies again.
        </p>
        {bookingsLine}
        {view.hasSubscription ? (
          <CheckRow
            checked={stripeBox}
            onChange={setStripeBox}
            disabled={busy}
            label={`Also cancel ${first}’s £10 a month subscription in Stripe now`}
            hint={`This can’t be undone. ${first} is not refunded for the current month.`}
          />
        ) : (
          stripeHint
        )}
      </Dialog>

      <Dialog
        open={dialog === "active"}
        title={`Resume ${first}’s membership?`}
        onClose={() => setDialog(null)}
        busy={busy}
        testId="dialog-resume"
        actions={
          <>
            <BusyButton type="button" busy={busy} busyLabel="Resuming…" onClick={() => run("active")}>
              Resume membership
            </BusyButton>
            <button type="button" className="ad-btn secondary" disabled={busy} onClick={() => setDialog(null)}>
              Keep {first} paused
            </button>
          </>
        }
      >
        <p className="ad-p">{first} can use the members area again straight away. {first} is not emailed.</p>
        {view.hasSubscription ? (
          <CheckRow
            checked={stripeBox}
            onChange={setStripeBox}
            disabled={busy}
            label={`Also restart ${first}’s £10 a month payments in Stripe`}
            hint="Payments carry on from the next billing date. Untick to leave billing as it is."
          />
        ) : (
          stripeHint
        )}
      </Dialog>
    </Section>
  );
}
