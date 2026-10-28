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

type Stage = "confirm" | "verified" | "invalid";

const INVALID_LINK = "This link is invalid, expired, or has already been used.";
// Every message the set-password form can show, in one place.
const SET_PASSWORD_ERRORS = {
  tooShort: "Password must be at least 8 characters.",
  mismatch: "The two passwords don’t match.",
  failed: "We couldn’t set your password. Try again in a moment.",
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
    const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
    setConfirming(false);
    if (verifyError) {
      setStage("invalid");
      return;
    }
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
      <button type="button" className="ad-btn block" onClick={handleContinue} disabled={!tokenHash || confirming} aria-busy={confirming || undefined}>
        {confirming ? "Checking the link…" : "Continue"}
      </button>
    </LoginShell>
  );
}
