"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/Button";

const inputClasses =
  "w-full rounded-xl border-2 border-foreground/20 bg-[#F5F3E7] px-4 py-3.5 text-base text-foreground placeholder:text-foreground/40 outline-none transition-colors focus:border-foreground";

const linkClasses =
  "text-sm font-medium text-foreground/50 outline-none transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline";

type Step = "password" | "reset-sent" | "enroll" | "code";

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
      setNotice("Password set. You can log in below.");
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
      setError("Email and password are required.");
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
      setError("Incorrect email or password.");
      return;
    }

    const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();

    if (factorsError) {
      setSubmitting(false);
      setError("Something went wrong checking your two-factor setup. Please try again.");
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
        setError("Something went wrong setting up two-factor authentication. Please try again.");
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
      setError("Enter the 6-digit code from your authenticator app.");
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
      setError("That code is incorrect or has expired. Please try again.");
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError("Enter your email first.");
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
      setError("Something went wrong sending the reset email. Please try again.");
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

  if (step === "reset-sent") {
    return (
      <main className="flex flex-1 items-center justify-center bg-background px-6 py-16 text-foreground">
        <div className="w-full max-w-sm rounded-3xl border border-foreground/10 bg-[#F5F3E7] p-8">
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
        </div>
      </main>
    );
  }

  if (step === "enroll") {
    return (
      <main className="flex flex-1 items-center justify-center bg-background px-6 py-16 text-foreground">
        <div className="w-full max-w-sm rounded-3xl border border-foreground/10 bg-[#F5F3E7] p-8">
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

            {error && <p className="text-sm font-medium text-red-700">{error}</p>}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Confirming…" : "Confirm and continue"}
            </Button>

            <button type="button" onClick={goBackToPassword} className={linkClasses}>
              Use a different email or password
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (step === "code") {
    return (
      <main className="flex flex-1 items-center justify-center bg-background px-6 py-16 text-foreground">
        <div className="w-full max-w-sm rounded-3xl border border-foreground/10 bg-[#F5F3E7] p-8">
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

            {error && <p className="text-sm font-medium text-red-700">{error}</p>}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Verifying…" : "Verify code"}
            </Button>

            <button type="button" onClick={goBackToPassword} className={linkClasses}>
              Use a different email or password
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="w-full max-w-sm rounded-3xl border border-foreground/10 bg-[#F5F3E7] p-8">
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

          {notice && <p className="text-sm font-medium text-amber-700">{notice}</p>}
          {error && <p className="text-sm font-medium text-red-700">{error}</p>}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Continuing…" : "Continue"}
          </Button>

          <button type="button" onClick={handleForgotPassword} className={linkClasses}>
            Forgot your password?
          </button>
        </form>
      </div>
    </main>
  );
}
