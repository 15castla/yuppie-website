"use client";

// The three dialogs You opens: Log out, Cancel membership and Delete my
// account. Bottom sheets on phones, a centred modal from 768px (Dialog).
// Each body is mounted only while its dialog is open, so it starts fresh
// every time.
//
// What is real: Log out (signOutMember) and Cancel membership
// (cancelMembership: the subscription stops at the end of the billing
// period). What is drawn but has no backend yet: the "Why are you leaving?"
// step (nothing stores a reason) and Delete my account (nothing deletes an
// account). The page gives them no way in unless it is the preview, which
// passes `withReason` and `canDelete`.

import { useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Button, Chip, FormField, Icon } from "@/components/members/kit";
import { Dialog } from "./dialog";

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
  /** signOutMember: clears the session and redirects to the main site. */
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

export type CancelResult = { success: boolean; error?: string };

export type CancelCopy = {
  /** "12 Nov": when the membership ends (the next billing date). Null when Stripe gave none. */
  endsOn: string | null;
  /** Preview only: a booked event after that date. No live code looks for one yet. */
  retreat?: string | null;
  /** Preview only: Open Invite and paid plans are off, so the live dialog does not mention hosted plans. */
  hostedPlans?: boolean;
};

export type CancelStep = "confirm" | "reason" | "done";

const REASONS = ["Too expensive", "Not enough events", "Moving away", "Something else"];

function ListItem({ icon, children }: { icon: "calendar" | "users" | "credit-card"; children: ReactNode }) {
  return (
    <li>
      <Icon name={icon} size={20} />
      <span>{children}</span>
    </li>
  );
}

function CancelBody({
  copy,
  cancel,
  withReason,
  initialStep,
  initialReason,
  onClose,
  onCancelled,
}: {
  copy: CancelCopy;
  cancel: (reason?: string) => Promise<CancelResult>;
  withReason: boolean;
  initialStep: CancelStep;
  initialReason: string | null;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [step, setStep] = useState<CancelStep>(initialStep);
  const [reason, setReason] = useState<string | null>(initialReason);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, startCancelling] = useTransition();

  const date = copy.endsOn;

  function handleCancel() {
    setError(null);
    startCancelling(async () => {
      const result = withReason && reason ? await cancel(reason) : await cancel();
      if (!result.success) {
        setError(result.error ?? "Your membership wasn’t cancelled. Try again.");
        return;
      }
      setStep("done");
      onCancelled();
    });
  }

  if (step === "done") {
    return (
      <>
        <h2 className="mk-h2" id="yu-cancel-title">
          {date ? `Your membership ends ${date}` : "Cancel requested"}
        </h2>
        <p className="yu-p" aria-live="polite">
          {date
            ? "You keep everything until then. Nothing more is taken."
            : "Your membership ends at the close of your current billing period. You keep everything until then."}
        </p>
        <div className="yu-acts">
          <Button onClick={onClose}>Got it</Button>
        </div>
      </>
    );
  }

  const errorLine = error ? (
    <p className="yu-dialog-err" role="alert">
      <Icon name="circle-alert" size={16} />
      <span>{error}</span>
    </p>
  ) : null;

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
        {errorLine}
        <div className="yu-acts">
          <Button className="yu-danger" pending={isCancelling} onClick={handleCancel}>
            {isCancelling ? "Working…" : "Cancel membership"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Keep my membership
          </Button>
        </div>
      </>
    );
  }

  const items: ReactNode[] = [];
  if (copy.retreat) {
    items.push(
      <ListItem key="retreat" icon="calendar">
        {copy.retreat}
      </ListItem>,
    );
  }
  if (copy.hostedPlans) {
    items.push(
      <ListItem key="hosted" icon="users">
        Plans you host after that date are cancelled, and anyone who paid is refunded.
      </ListItem>,
    );
  }
  items.push(
    <ListItem key="payments" icon="credit-card">
      {date ? `No more payments after ${date}.` : "No more payments after that."}
    </ListItem>,
  );

  return (
    <>
      {withReason ? <span className="mk-term">Step 1 of 2</span> : null}
      <h2 className="mk-h2" id="yu-cancel-title">
        Cancel your membership?
      </h2>
      <p className="yu-p">
        {date ? `You keep everything until ${date}.` : "You keep everything until the end of this billing period."} After that you’d need to apply again.
      </p>
      <ul className="yu-list">{items}</ul>
      {errorLine}
      <div className="yu-acts">
        <Button onClick={onClose}>Keep my membership</Button>
        {withReason ? (
          <Button variant="outline" onClick={() => setStep("reason")}>
            Continue
          </Button>
        ) : (
          <Button className="yu-danger" pending={isCancelling} onClick={handleCancel}>
            {isCancelling ? "Working…" : "Cancel membership"}
          </Button>
        )}
      </div>
    </>
  );
}

export function CancelDialog({
  open,
  onClose,
  copy,
  cancel,
  withReason = false,
  initialStep = "confirm",
  initialReason = null,
  onCancelled,
}: {
  open: boolean;
  onClose: () => void;
  copy: CancelCopy;
  /** cancelMembership: stops the subscription at the end of the billing period. */
  cancel: (reason?: string) => Promise<CancelResult>;
  /** Preview only: the two-step version with "Why are you leaving?". Nothing stores the reason yet. */
  withReason?: boolean;
  initialStep?: CancelStep;
  initialReason?: string | null;
  /** The cancel went through: the page notes it and refreshes. */
  onCancelled: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="yu-cancel-title">
      <CancelBody
        copy={copy}
        cancel={cancel}
        withReason={withReason}
        initialStep={initialStep}
        initialReason={initialReason}
        onClose={onClose}
        onCancelled={onCancelled}
      />
    </Dialog>
  );
}

// ---------------------------------------------------------------- Delete my account

// Drawn exactly as designed and NOT wired: nothing deletes an account yet
// (the auth user, photos, messages, the Stripe customer, hosted plans). The
// page never offers it, so this is reachable only from the preview.
export function DeleteDialog({
  open,
  onClose,
  initialTyped = "",
}: {
  open: boolean;
  onClose: () => void;
  initialTyped?: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="yu-delete-title">
      <DeleteBody onClose={onClose} initialTyped={initialTyped} />
    </Dialog>
  );
}

function DeleteBody({ onClose, initialTyped }: { onClose: () => void; initialTyped: string }) {
  const [typed, setTyped] = useState(initialTyped);
  const ready = typed.trim().toLowerCase() === "delete";
  return (
    <>
      <h2 className="mk-h2" id="yu-delete-title">
        Delete your account?
      </h2>
      <p className="yu-p">This removes your details, photo and messages for good. It also ends your membership today, with no refund.</p>
      <ul className="yu-list">
        <ListItem icon="users">Plans you host are cancelled, and anyone who paid is refunded.</ListItem>
      </ul>
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
      <div className="yu-acts">
        <Button className="yu-danger" aria-disabled={!ready} onClick={ready ? onClose : undefined}>
          Delete my account
        </Button>
        <Button variant="outline" onClick={onClose}>
          Keep my account
        </Button>
      </div>
    </>
  );
}
