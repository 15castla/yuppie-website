"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";

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
// stubs; ProfileEditView passes the real server actions.

const inputClasses =
  "h-14 w-full rounded-xl border-2 border-foreground/20 bg-cream px-4 text-center text-lg tracking-[0.5em] text-foreground placeholder:text-foreground/40 outline-none transition-colors focus:border-foreground";

export function EmailChangeVerify({
  currentEmail,
  newEmail,
  verify,
  resend,
  onDone,
  onCancel,
}: {
  currentEmail: string;
  newEmail: string;
  verify: typeof verifyEmailChange;
  resend: () => Promise<{ success: boolean; error?: string }>;
  onDone: (email: string) => void;
  onCancel: () => void;
}) {
  const [sentTo, setSentTo] = useState<"new" | "current">("new");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isVerifying, startVerifying] = useTransition();
  const [isResending, startResending] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, [sentTo]);

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
        setError(result.error ?? "Something went wrong sending the code.");
        return;
      }
      setCode("");
      setSentTo("new");
      setNotice("We've sent a new code.");
    });
  }

  const helper =
    sentTo === "new"
      ? `Enter the 6-digit code we sent to ${newEmail}.`
      : `One more step: enter the 6-digit code we sent to your current address, ${currentEmail}.`;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-bold text-foreground">
          Confirm your new email
        </h2>
        <p aria-live="polite" className="text-sm text-foreground-muted">
          {helper}
        </p>
      </div>

      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        aria-label="6-digit code"
        aria-invalid={error ? true : undefined}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
        placeholder="123456"
        className={cn(inputClasses, error && "border-red-700!")}
      />

      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="text-sm text-foreground-muted">{notice}</p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={isVerifying}
          className="rounded-full bg-foreground px-6 py-2.5 text-sm font-bold text-background disabled:opacity-60"
        >
          {isVerifying ? "Verifying…" : "Verify code"}
        </button>
        <button
          type="button"
          onClick={handleResend}
          disabled={isResending || isVerifying}
          className="text-sm font-medium text-foreground/50 hover:text-foreground hover:underline disabled:opacity-60"
        >
          {isResending ? "Sending…" : "Send a new code"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isVerifying}
          className="text-sm font-medium text-foreground/50 hover:text-foreground hover:underline disabled:opacity-60"
        >
          Keep my current email
        </button>
      </div>
    </form>
  );
}
