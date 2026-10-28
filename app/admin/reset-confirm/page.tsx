"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { LoginMessage, LoginShell } from "@/components/admin/login-shell";

// Choose a new admin password (r2b 13), reached from the link in the password-reset email
// (/admin/reset-confirm?token_hash=...&type=recovery). Deliberately does NOT call verifyOtp on page load:
// mail apps often open links before a person does, and a token_hash works once, so an auto-verifying page
// would burn it before the real click. The page waits for "Continue"; only that click verifies.
//
// QA2-03: with two-factor log in on, Supabase Auth changes a password only for an aal2 session, and the link
// gives aal1. So an admin with an authenticator app enters its code first (the Log in page's code step, the
// same words), then chooses the password. An admin who never set one up goes straight to the password.

type Stage = "confirm" | "code" | "verified" | "invalid";

const INVALID_LINK = "This link is invalid, expired, or has already been used.";
// Every message the set-password form can show, in one place.
const SET_PASSWORD_ERRORS = {
  tooShort: "Password must be at least 8 characters.",
  mismatch: "The two passwords don’t match.",
  failed: "We couldn’t set your password. Try again in a moment.",
};
// The Log in page's code step words (app/admin/login/page.tsx).
const CODE_ERRORS = {
  required: "Enter the 6-digit code from your authenticator app.",
  incorrect: "That code is incorrect or has expired. Try again.",
  factorsFailed: "We couldn’t check your two-factor log in. Try again in a moment.",
};

export default function ResetConfirmPage() {
  const router = useRouter();
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("confirm");
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [linkUsed, setLinkUsed] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = params.get("token_hash");
    const type = params.get("type");
    /* eslint-disable react-hooks/set-state-in-effect -- read once from the address (the link in the email) */
    if (!hash || type !== "recovery") {
      setStage("invalid");
      return;
    }
    setTokenHash(hash);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function handleContinue() {
    if (!tokenHash) return;
    setError(null);
    setConfirming(true);
    const supabase = createClient();
    // The link works once: a second Continue (after the factor check failed) only checks the factors again.
    if (!linkUsed) {
      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
      if (verifyError) {
        setConfirming(false);
        setStage("invalid");
        return;
      }
      setLinkUsed(true);
    }
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    setConfirming(false);
    if (factorsError) {
      setError(CODE_ERRORS.factorsFailed);
      return;
    }
    const totp = factors.totp[0];
    if (totp) {
      setFactorId(totp.id);
      setStage("code");
      return;
    }
    setStage("verified");
  }

  async function handleCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== 6 || !factorId) {
      setError(CODE_ERRORS.required);
      return;
    }
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error: codeError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setSubmitting(false);
    if (codeError) {
      setError(CODE_ERRORS.incorrect);
      return;
    }
    setCode("");
    setStage("verified");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      setError(SET_PASSWORD_ERRORS.tooShort);
      return;
    }
    if (password !== confirmPassword) {
      setError(SET_PASSWORD_ERRORS.mismatch);
      return;
    }
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setSubmitting(false);
      // Auth wants the authenticator code first (a factor added since this page checked): ask for it.
      if (updateError.code === "insufficient_aal") {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        if (factors?.totp[0]) {
          setFactorId(factors.totp[0].id);
          setStage("code");
          setError(null);
          return;
        }
      }
      setError(SET_PASSWORD_ERRORS.failed);
      return;
    }
    await supabase.auth.signOut();
    router.push("/admin/login?passwordSet=1");
  }

  if (stage === "invalid") {
    return (
      <LoginShell title="That link has gone" lead={INVALID_LINK}>
        <Link className="ad-btn block" href="/admin/login">
          Back to log in
        </Link>
      </LoginShell>
    );
  }

  if (stage === "code") {
    return (
      <LoginShell title="Enter your code" lead="Enter the 6-digit code from your authenticator app. Then choose a new password.">
        <form onSubmit={handleCode} noValidate className="ad-lform" style={{ marginTop: 0 }}>
          <div className="ad-field">
            <label htmlFor="reset-code">6-digit code</label>
            <input
              id="reset-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className={`ad-input code${error ? " is-error" : ""}`}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "reset-code-msg" : undefined}
              autoFocus
            />
          </div>
          <div id="reset-code-msg">
            <LoginMessage error={error} />
          </div>
          <button type="submit" className="ad-btn block" disabled={submitting} aria-busy={submitting || undefined}>
            {submitting ? "Verifying…" : "Verify code"}
          </button>
        </form>
      </LoginShell>
    );
  }

  if (stage === "verified") {
    return (
      <LoginShell title="Choose a password" lead="Choose a password for your admin account.">
        <form onSubmit={handleSubmit} noValidate className="ad-lform" style={{ marginTop: 0 }}>
          <div className="ad-field">
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="New password"
              autoComplete="new-password"
              className={`ad-input${error === SET_PASSWORD_ERRORS.tooShort ? " is-error" : ""}`}
              aria-describedby="new-password-hint"
            />
            <p className="hint" id="new-password-hint">
              At least 8 characters.
            </p>
          </div>
          <div className="ad-field">
            <label htmlFor="confirm-password">Confirm password</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm password"
              autoComplete="new-password"
              className={`ad-input${error === SET_PASSWORD_ERRORS.mismatch ? " is-error" : ""}`}
            />
          </div>
          <LoginMessage error={error} />
          <button type="submit" className="ad-btn block" disabled={submitting} aria-busy={submitting || undefined}>
            {submitting ? "Saving…" : "Set password"}
          </button>
        </form>
      </LoginShell>
    );
  }

  return (
    <LoginShell title="Choose a password" lead="Continue to set a new password for your admin account.">
      <LoginMessage error={error} />
      <button type="button" className="ad-btn block" onClick={handleContinue} disabled={!tokenHash || confirming} aria-busy={confirming || undefined}>
        {confirming ? "Checking the link…" : "Continue"}
      </button>
    </LoginShell>
  );
}
