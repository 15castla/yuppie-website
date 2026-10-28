"use client";

// The three dialogs You opens: Log out, Cancel membership (two steps) and Delete my account. Bottom sheets
// on phones, a centred modal from 768px (Dialog). Each body is mounted only while its dialog is open, so it
// starts fresh every time. All three are real (Phase A):
//   Log out            signOutMember: ends this session, then Log in says "You’re logged out." (B-D1 B)
//   Cancel membership  step 1 says what stays until the end date and which booked club events fall after it
//                      (D8: they are cancelled and refunded when it ends); step 2 asks why (optional) and
//                      cancels at the end of the billing period with that reason (requestCancelMembership)
//   Delete my account  type "delete"; deleteMyAccount ends everything and lands on the public home page
// The hosted-plans lines ("Plans you host ... refunded") are drawn only when Open Invite is real (paid plans
// are Phase B), so the live dialogs leave them out; the preview passes `hostedPlans` to draw them.

import { useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button, Chip, FormField, Icon } from "@/components/members/kit";
import { Dialog } from "./dialog";

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="yu-dialog-err" role="alert">
      <Icon name="circle-alert" size={16} />
      <span>{error}</span>
    </p>
  );
}

function ListItem({ icon, children }: { icon: "calendar" | "users" | "credit-card"; children: ReactNode }) {
  return (
    <li>
      <Icon name={icon} size={20} />
      <span>{children}</span>
    </li>
  );
}

// ---------------------------------------------------------------- Log out

function LogoutButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" pending={pending}>
      {pending ? "Logging out…" : "Log out"}
    </Button>
  );
}

export function LogoutDialog({
  open,
  onClose,
  email,
  signOut,
}: {
  open: boolean;
  onClose: () => void;
  email: string;
  /** signOutMember: ends the session and goes to Log in ("You’re logged out."). */
  signOut: () => void | Promise<void>;
}) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="yu-logout-title">
      <h2 className="mk-h2" id="yu-logout-title">
        Log out?
      </h2>
      <p className="yu-p">You can log back in any time. We’ll email a code to {email}.</p>
      <form action={signOut}>
        <div className="yu-acts">
          <LogoutButton />
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Cancel membership

/** Step 1's facts, from getCancelMembershipPreview. */
export type CancelPreview = {
  /** "12 Nov": the day access ends (the end of the billing period). Null when Stripe could not say. */
  until: string | null;
  /** Club events booked after that day (D8): "Sunrise Wellness Retreat", "Sun 15 Nov". */
  bookings: { title: string; when: string }[];
};

/** requestCancelMembership's answer, as the dialog needs it. */
export type CancelOutcome = { ok: true; until: string } | { ok: false; error: string };

export type CancelStep = "confirm" | "reason" | "done";

const REASONS = ["Too expensive", "Not enough events", "Moving away", "Something else"];

function CancelBody({
  preview,
  hostedPlans,
  cancel,
  initialStep,
  initialReason,
  onClose,
}: {
  preview: CancelPreview;
  hostedPlans: boolean;
  cancel: (reason: string | null) => Promise<CancelOutcome>;
  initialStep: CancelStep;
  initialReason: string | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState<CancelStep>(initialStep);
  const [reason, setReason] = useState<string | null>(initialReason);
  const [error, setError] = useState<string | null>(null);
  const [until, setUntil] = useState<string | null>(preview.until);
  const [isCancelling, startCancelling] = useTransition();

  function handleCancel() {
    setError(null);
    startCancelling(async () => {
      const result = await cancel(reason);
      if (!result.ok) {
        setError(result.error || "Your membership wasn’t cancelled. Try again.");
        return;
      }
      setUntil(result.until);
      setStep("done");
    });
  }

  if (step === "done") {
    return (
      <>
        <h2 className="mk-h2" id="yu-cancel-title">
          {until ? `Your membership ends ${until}` : "Cancel requested"}
        </h2>
        <p className="yu-p" aria-live="polite">
          {until
            ? "You keep everything until then. Nothing more is taken."
            : "Your membership ends at the close of your current billing period. You keep everything until then."}
        </p>
        <div className="yu-acts">
          <Button onClick={onClose}>Got it</Button>
        </div>
      </>
    );
  }

  if (step === "reason") {
    return (
      <>
        <span className="mk-term">Step 2 of 2</span>
        <h2 className="mk-h2" id="yu-cancel-title">
          Why are you leaving?
        </h2>
        <p className="yu-p">Optional. It helps us run the club.</p>
        <div className="yu-chips" role="group" aria-label="Why are you leaving?">
          {REASONS.map((label) => (
            <Chip key={label} active={reason === label} onClick={() => setReason(reason === label ? null : label)}>
              {label}
            </Chip>
          ))}
        </div>
        <ErrorLine error={error} />
        <div className="yu-acts">
          <Button className="yu-danger" pending={isCancelling} onClick={isCancelling ? undefined : handleCancel}>
            {isCancelling ? "Working…" : "Cancel membership"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Keep my membership
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <span className="mk-term">Step 1 of 2</span>
      <h2 className="mk-h2" id="yu-cancel-title">
        Cancel your membership?
      </h2>
      <p className="yu-p">
        {until ? `You keep everything until ${until}.` : "You keep everything until the end of this billing period."} After that you’d need to apply
        again.
      </p>
      <ul className="yu-list">
        {preview.bookings.map((booking) => (
          <ListItem key={`${booking.title}-${booking.when}`} icon="calendar">
            {booking.title}, {booking.when}, is after that date. You’d lose your place.
          </ListItem>
        ))}
        {hostedPlans ? <ListItem icon="users">Plans you host after that date are cancelled, and anyone who paid is refunded.</ListItem> : null}
        <ListItem icon="credit-card">{until ? `No more payments after ${until}.` : "No more payments after that."}</ListItem>
      </ul>
      <div className="yu-acts">
        <Button onClick={onClose}>Keep my membership</Button>
        <Button variant="outline" onClick={() => setStep("reason")}>
          Continue
        </Button>
      </div>
    </>
  );
}

export function CancelDialog({
  open,
  onClose,
  preview,
  hostedPlans = false,
  cancel,
  initialStep = "confirm",
  initialReason = null,
}: {
  open: boolean;
  onClose: () => void;
  preview: CancelPreview;
  /** Preview only: Open Invite's hosted plans line (paid plans are Phase B). */
  hostedPlans?: boolean;
  /** requestCancelMembership: cancels at the end of the billing period, saving the reason. */
  cancel: (reason: string | null) => Promise<CancelOutcome>;
  initialStep?: CancelStep;
  initialReason?: string | null;
}) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="yu-cancel-title">
      <CancelBody
        preview={preview}
        hostedPlans={hostedPlans}
        cancel={cancel}
        initialStep={initialStep}
        initialReason={initialReason}
        onClose={onClose}
      />
    </Dialog>
  );
}

// ---------------------------------------------------------------- Delete my account

export function DeleteDialog({
  open,
  onClose,
  deleteAccount,
  hostedPlans = false,
  initialTyped = "",
}: {
  open: boolean;
  onClose: () => void;
  /** deleteMyAccount: on success the server signs out and goes to the public home page; it only returns on failure. */
  deleteAccount: (confirmation: string) => Promise<{ ok: false; error: string } | void>;
  /** Preview only: Open Invite's hosted plans line (paid plans are Phase B). */
  hostedPlans?: boolean;
  initialTyped?: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="yu-delete-title">
      <DeleteBody onClose={onClose} deleteAccount={deleteAccount} hostedPlans={hostedPlans} initialTyped={initialTyped} />
    </Dialog>
  );
}

function DeleteBody({
  onClose,
  deleteAccount,
  hostedPlans,
  initialTyped,
}: {
  onClose: () => void;
  deleteAccount: (confirmation: string) => Promise<{ ok: false; error: string } | void>;
  hostedPlans: boolean;
  initialTyped: string;
}) {
  const [typed, setTyped] = useState(initialTyped);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, startDeleting] = useTransition();
  const ready = typed.trim().toLowerCase() === "delete";

  function handleDelete() {
    if (!ready || isDeleting) return;
    setError(null);
    startDeleting(async () => {
      const result = await deleteAccount(typed);
      if (result && !result.ok) setError(result.error || "Your account wasn’t deleted. Try again.");
    });
  }

  return (
    <>
      <h2 className="mk-h2" id="yu-delete-title">
        Delete your account?
      </h2>
      <p className="yu-p">This removes your details, photo and messages for good. It also ends your membership today, with no refund.</p>
      {hostedPlans ? (
        <ul className="yu-list">
          <ListItem icon="users">Plans you host are cancelled, and anyone who paid is refunded.</ListItem>
        </ul>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleDelete();
        }}
      >
        <FormField
          label="Type delete to confirm"
          name="confirm"
          placeholder="delete"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
        <ErrorLine error={error} />
        <div className="yu-acts">
          <Button type="submit" className="yu-danger" aria-disabled={!ready || undefined} pending={isDeleting}>
            {isDeleting ? "Deleting…" : "Delete my account"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Keep my account
          </Button>
        </div>
      </form>
    </>
  );
}
