"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";

import { Button, Icon } from "@/components/members/kit";
import { cn } from "@/lib/utils";
import type { verifyEmailChange } from "@/app/members/profile/actions";

// Code entry for a login-email change (see requestEmailChange and
// verifyEmailChange in app/members/profile/actions.ts). Same pattern as
// member sign-in's code step: one input for a typed 6-digit code, no
// link to click, errors as red text under the input.
//
// Always asks for the new address's code first. If the project has
// "secure email change" on, the server reports that a second code (from
// the current address) is still needed, and this moves to that step;
// with it off, the first code finishes the change.
//
// The actions come in as props so the states can be exercised with
// stubs; the Edit details view passes the real server actions. Drawn on the
// members kit (the "you-edit" design); the behaviour is unchanged.

// What the preview sets on the first draw. Nothing live passes it.
export type EmailChangeDemo = {
  code?: string;
  error?: string;
  sentTo?: "new" | "current";
};

export function EmailChangeVerify({
  currentEmail,
  newEmail,
  verify,
  resend,
  onDone,
  onCancel,
  demo,
}: {
  currentEmail: string;
  newEmail: string;
  verify: typeof verifyEmailChange;
  resend: () => Promise<{ success: boolean; error?: string }>;
  onDone: (email: string) => void;
  onCancel: () => void;
  demo?: EmailChangeDemo;
}) {
  const [sentTo, setSentTo] = useState<"new" | "current">(demo?.sentTo ?? "new");
  const [code, setCode] = useState(demo?.code ?? "");
  const [error, setError] = useState<string | null>(demo?.error ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isVerifying, startVerifying] = useTransition();
  const [isResending, startResending] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // The preview draws the wrong-code state unfocused, as designed.
    if (demo?.error) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [sentTo, demo?.error]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setError(null);
    startVerifying(async () => {
      const result = await verify(sentTo, code);
      if (result.status === "error") {
        setError(result.error);
        return;
      }
      if (result.status === "needs_other_code") {
        setCode("");
        setSentTo(sentTo === "new" ? "current" : "new");
        return;
      }
      onDone(result.email);
    });
  }

  function handleResend() {
    setError(null);
    setNotice(null);
    startResending(async () => {
      const result = await resend();
      if (!result.success) {
        setError(result.error ?? "We couldn’t send the code. Try again.");
        return;
      }
      setCode("");
      setSentTo("new");
      setNotice("We’ve sent a new code.");
    });
  }

  const helper =
    sentTo === "new" ? (
      <>
        We sent a 6-digit code to <b>{newEmail}</b>.
      </>
    ) : (
      <>
        One more step: enter the 6-digit code we sent to your current address, <b>{currentEmail}</b>.
      </>
    );

  return (
    <form onSubmit={handleSubmit} noValidate className="yu-form">
      <div>
        <h2 className="mk-h2">Confirm your new email</h2>
        <p className="yu-p" style={{ marginTop: 8 }} aria-live="polite">
          {helper}
        </p>
      </div>

      <div className="mk-field">
        <label htmlFor="email-code">6-digit code</label>
        <input
          id="email-code"
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          aria-invalid={error ? true : undefined}
          aria-describedby="email-code-error"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          placeholder="······"
          className={cn("mk-input yu-code", error && "mk-invalid")}
        />
        <p className="mk-error-text" id="email-code-error" role={error ? "alert" : undefined} aria-live="polite">
          {error ? (
            <>
              <Icon name="circle-alert" size={14} />
              <span>{error}</span>
            </>
          ) : null}
        </p>
        {notice && !error ? <p className="yu-notice">{notice}</p> : null}
      </div>

      <Button type="submit" block className="yu-save" pending={isVerifying}>
        {isVerifying ? "Verifying…" : "Verify code"}
      </Button>

      <div className="yu-links">
        <Button variant="quiet" onClick={handleResend} disabled={isResending || isVerifying}>
          {isResending ? "Sending…" : "Send a new code"}
        </Button>
        <Button variant="quiet" onClick={onCancel} disabled={isVerifying}>
          Keep my current email
        </Button>
      </div>
    </form>
  );
}
