"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { LoginMessage, LoginShell } from "@/components/admin/login-shell";

// The admin Log in (r2b 13, B-D21): the admin look, the word "Log in", plain messages. How it works does not
// change: a password, then a 6-digit code from an authenticator app. Real two factors, enforced by Supabase's
// own session assurance level (aal2), not a separate cookie: app/admin/require-admin.ts checks
// getAuthenticatorAssuranceLevel() against the server session. A password alone only reaches aal1, which is
// why signInWithPassword succeeding isn't enough to reach /admin: the enrol or verify step promotes the
// session to aal2.

type Step = "password" | "reset-sent" | "enroll" | "code";

// Every message each step can show, in one place. No "Please", no "Something went wrong".
const PASSWORD_STEP_ERRORS = {
  required: "Enter your email and password.",
  incorrect: "Incorrect email or password.",
  factorsFailed: "We couldn’t check your two-factor log in. Try again in a moment.",
  enrollFailed: "We couldn’t set up two-factor log in. Try again in a moment.",
  emailFirst: "Enter your email first, then choose Forgot your password?",
  resetFailed: "We couldn’t send the reset email. Try again in a moment.",
};
const PASSWORD_SET_NOTICE = "Password set. You can log in below.";
const TOTP_ERRORS = {
  required: "Enter the 6-digit code from your authenticator app.",
  incorrect: "That code is incorrect or has expired. Try again.",
};

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("password");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("passwordSet") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the address after the reset page sends us here
      setNotice(PASSWORD_SET_NOTICE);
    }
  }, []);

  // Set once password sign-in succeeds: the id of a brand-new unverified factor from mfa.enroll() (step
  // "enroll"), or of an already-verified one from mfa.listFactors() (step "code").
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError(PASSWORD_STEP_ERRORS.required);
      return;
    }
    setError(null);
    setNotice(null);
    setSubmitting(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setSubmitting(false);
      setError(PASSWORD_STEP_ERRORS.incorrect);
      return;
    }

    const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) {
      setSubmitting(false);
      setError(PASSWORD_STEP_ERRORS.factorsFailed);
      return;
    }

    if (factorsData.totp.length === 0) {
      const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Club Yuppie admin",
        friendlyName: `admin-${email}`,
      });
      setSubmitting(false);
      if (enrollError) {
        setError(PASSWORD_STEP_ERRORS.enrollFailed);
        return;
      }
      setFactorId(enrollData.id);
      setQrCode(enrollData.totp.qr_code);
      setSecret(enrollData.totp.secret);
      setStep("enroll");
      return;
    }

    setSubmitting(false);
    setFactorId(factorsData.totp[0].id);
    setStep("code");
  }

  async function handleVerifyTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code.trim() || !factorId) {
      setError(TOTP_ERRORS.required);
      return;
    }
    setError(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (verifyError) {
      setSubmitting(false);
      setError(TOTP_ERRORS.incorrect);
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError(PASSWORD_STEP_ERRORS.emailFirst);
      return;
    }
    setError(null);
    setNotice(null);
    setSubmitting(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/admin/reset-confirm`,
    });
    setSubmitting(false);
    if (resetError) {
      setError(PASSWORD_STEP_ERRORS.resetFailed);
      return;
    }
    setStep("reset-sent");
  }

  function goBackToPassword() {
    setStep("password");
    setPassword("");
    setCode("");
    setFactorId(null);
    setQrCode(null);
    setSecret(null);
    setError(null);
  }

  const codeField = (
    <div className="ad-field">
      <label htmlFor="admin-code">6-digit code</label>
      <input
        id="admin-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
        placeholder="123456"
        className={`ad-input code${error ? " is-error" : ""}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "admin-login-msg" : undefined}
        autoFocus
      />
    </div>
  );

  const back = (
    <p className="ad-lfoot">
      <button type="button" onClick={goBackToPassword} className="ad-link">
        Use a different email or password
      </button>
    </p>
  );

  if (step === "reset-sent") {
    return (
      <LoginShell title="Check your email" lead={`If an admin account exists for ${email}, we’ve sent a link to set a password.`}>
        <p className="ad-lfoot">
          <button type="button" onClick={goBackToPassword} className="ad-link">
            Back to log in
          </button>
        </p>
      </LoginShell>
    );
  }

  if (step === "code") {
    return (
      <LoginShell title="Enter your code" lead="Enter the 6-digit code from your authenticator app.">
        <form onSubmit={handleVerifyTotp} noValidate className="ad-lform" style={{ marginTop: 0 }}>
          {codeField}
          <div id="admin-login-msg">
            <LoginMessage error={error} />
          </div>
          <button type="submit" className="ad-btn block" disabled={submitting} aria-busy={submitting || undefined}>
            {submitting ? "Verifying…" : "Verify code"}
          </button>
          {back}
        </form>
      </LoginShell>
    );
  }

  if (step === "enroll") {
    return (
      <LoginShell title="Set up two-factor log in" lead="Scan this with Microsoft Authenticator, or any authenticator app.">
        {qrCode && (
          <div className="ad-qr">
            <span className="q">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCode} alt="Authenticator app code to scan" />
            </span>
          </div>
        )}
        {secret && (
          <p className="ad-hint" style={{ textAlign: "center", margin: "0 auto" }}>
            Can’t scan it? Enter this code instead:
            <br />
            <span className="ad-mono">{secret}</span>
          </p>
        )}
        <form onSubmit={handleVerifyTotp} noValidate className="ad-lform" style={{ marginTop: 0 }}>
          {codeField}
          <div id="admin-login-msg">
            <LoginMessage error={error} />
          </div>
          <button type="submit" className="ad-btn block" disabled={submitting} aria-busy={submitting || undefined}>
            {submitting ? "Confirming…" : "Confirm and continue"}
          </button>
          {back}
        </form>
      </LoginShell>
    );
  }

  return (
    <LoginShell title="Log in" lead="Enter your email and password.">
      <form onSubmit={handlePasswordSubmit} noValidate className="ad-lform" style={{ marginTop: 0 }}>
        <div className="ad-field">
          <label htmlFor="admin-email">Email</label>
          <input
            id="admin-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className={`ad-input${error === PASSWORD_STEP_ERRORS.incorrect ? " is-error" : ""}`}
          />
        </div>
        <div className="ad-field">
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className={`ad-input${error === PASSWORD_STEP_ERRORS.incorrect ? " is-error" : ""}`}
          />
        </div>
        {/* One message at a time: an error replaces the "Password set" notice. */}
        <LoginMessage error={error} notice={notice} />
        <button type="submit" className="ad-btn block" disabled={submitting} aria-busy={submitting || undefined}>
          {submitting ? "Continuing…" : "Continue"}
        </button>
        <p className="ad-lfoot">
          <button type="button" onClick={handleForgotPassword} className="ad-link" disabled={submitting}>
            Forgot your password?
          </button>
        </p>
      </form>
    </LoginShell>
  );
}
