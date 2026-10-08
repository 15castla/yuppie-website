"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/Button";
import { MessageSlot, StepStack } from "@/components/StableLayout";

const inputClasses =
  "w-full rounded-xl border-2 border-foreground/20 bg-[#F5F3E7] px-4 py-3.5 text-base text-foreground placeholder:text-foreground/40 outline-none transition-colors focus:border-foreground";

const linkClasses =
  "text-sm font-medium text-foreground/50 outline-none transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline";

type Step = "password" | "reset-sent" | "enroll" | "code";

// Every message each step can show, in one place so MessageSlot can
// reserve room for the longest and the card doesn't resize.
const PASSWORD_STEP_ERRORS = {
  required: "Email and password are required.",
  incorrect: "Incorrect email or password.",
  factorsFailed: "Something went wrong checking your two-factor setup. Please try again.",
  enrollFailed: "Something went wrong setting up two-factor authentication. Please try again.",
  emailFirst: "Enter your email first.",
  resetFailed: "Something went wrong sending the reset email. Please try again.",
};
const PASSWORD_SET_NOTICE = "Password set. You can log in below.";
const TOTP_ERRORS = {
  required: "Enter the 6-digit code from your authenticator app.",
  incorrect: "That code is incorrect or has expired. Please try again.",
};

const cardClasses = "w-full max-w-sm rounded-3xl border border-foreground/10 bg-[#F5F3E7] p-8";

// Real two factors: password (this file) plus a TOTP authenticator app,
// enforced by Supabase's own session assurance level (aal2), not a
// separate cookie: app/admin/require-admin.ts checks
// getAuthenticatorAssuranceLevel() directly against the server session.
// A password-only sign-in only ever reaches aal1, which is why
// signInWithPassword succeeding below isn't enough on its own to reach
// /admin: the enroll/verify step below is what promotes the session to
// aal2.
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
      setNotice(PASSWORD_SET_NOTICE);
    }
  }, []);

  // Set once password sign-in succeeds: either the id of a brand-new
  // unverified factor from mfa.enroll() (step "enroll"), or the id of an
  // already-verified one from mfa.listFactors() (step "code"). Either
  // way, challengeAndVerify() just needs this plus the 6-digit code.
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
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

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
        issuer: "Yuppie Admin",
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
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });

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

  // Steps hidden by StepStack are still rendered, so each slot only shows
  // the error while its own step is active; otherwise a longer message
  // from another step would stretch a hidden layer past its reserve.
  const totpError = (
    <MessageSlot reserve={Object.values(TOTP_ERRORS)} className="text-sm font-medium text-red-700">
      {(step === "code" || step === "enroll") && error && <p>{error}</p>}
    </MessageSlot>
  );

  const resetSentStep = (
    <>
      <h1 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
        Check your email
      </h1>
      <p className="mt-2 text-center text-sm text-foreground/60">
        If an admin account exists for {email}, we&apos;ve sent a link to
        set a password.
      </p>

      <div className="mt-8">
        <button type="button" onClick={goBackToPassword} className={linkClasses}>
          Back to login
        </button>
      </div>
    </>
  );

  const codeStep = (
    <>
      <h1 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
        Enter your code
      </h1>
      <p className="mt-2 text-center text-sm text-foreground/60">
        Enter the 6-digit code from your authenticator app.
      </p>

      <form onSubmit={handleVerifyTotp} noValidate className="mt-8 flex flex-col gap-4">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          placeholder="123456"
          className={`${inputClasses} text-center text-lg tracking-[0.5em]`}
        />

        {totpError}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Verifying…" : "Verify code"}
        </Button>

        <button type="button" onClick={goBackToPassword} className={linkClasses}>
          Use a different email or password
        </button>
      </form>
    </>
  );

  const passwordStep = (
    <>
      <h1 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
        Admin Login
      </h1>
      <p className="mt-2 text-center text-sm text-foreground/60">
        Enter your email and password.
      </p>

      <form onSubmit={handlePasswordSubmit} noValidate className="mt-8 flex flex-col gap-4">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className={inputClasses}
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          className={inputClasses}
        />

        <MessageSlot
          reserve={[...Object.values(PASSWORD_STEP_ERRORS), PASSWORD_SET_NOTICE]}
          className="text-sm font-medium"
        >
          {/* One message at a time, so the slot never needs room for two:
              an error replaces the "Password set" notice, which is stale
              once a sign-in has been attempted anyway. */}
          {step === "password" &&
            (error ? (
              <p className="text-red-700">{error}</p>
            ) : (
              notice && <p className="text-amber-700">{notice}</p>
            ))}
        </MessageSlot>

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Continuing…" : "Continue"}
        </Button>

        <button type="button" onClick={handleForgotPassword} className={linkClasses}>
          Forgot your password?
        </button>
      </form>
    </>
  );

  // The one-time QR setup is much taller than the other steps, so it gets
  // its own height rather than padding every ordinary login out to match.
  // Password, code and reset-sent share one stacked height.
  const enrollStep = (
    <>
      <h1 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
        Set up two-factor login
      </h1>
      <p className="mt-2 text-center text-sm text-foreground/60">
        Scan this with Microsoft Authenticator (or any authenticator app).
      </p>

      {qrCode && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qrCode}
          alt="Authenticator app QR code"
          className="mx-auto mt-6 h-44 w-44 rounded-xl border border-foreground/10 bg-white p-2"
        />
      )}

      {secret && (
        <p className="mt-4 text-center text-xs text-foreground/60">
          Can&apos;t scan it? Enter this code manually:{" "}
          <span className="font-mono font-medium text-foreground">{secret}</span>
        </p>
      )}

      <form onSubmit={handleVerifyTotp} noValidate className="mt-6 flex flex-col gap-4">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          placeholder="123456"
          className={`${inputClasses} text-center text-lg tracking-[0.5em]`}
        />

        {totpError}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Confirming…" : "Confirm and continue"}
        </Button>

        <button type="button" onClick={goBackToPassword} className={linkClasses}>
          Use a different email or password
        </button>
      </form>
    </>
  );

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className={cardClasses}>
        {step === "enroll" ? (
          enrollStep
        ) : (
          <StepStack
            active={step}
            steps={{ password: passwordStep, code: codeStep, "reset-sent": resetSentStep }}
          />
        )}
      </div>
    </main>
  );
}
