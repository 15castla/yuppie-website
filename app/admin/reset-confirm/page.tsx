"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/Button";

const inputClasses =
  "w-full rounded-xl border-2 border-foreground/20 bg-[#F5F3E7] px-4 py-3.5 text-base text-foreground placeholder:text-foreground/40 outline-none transition-colors focus:border-foreground";

const linkClasses =
  "text-sm font-medium text-foreground/50 outline-none transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline";

type Stage = "confirm" | "verified" | "invalid";

// Reached via the link in a Supabase password-recovery email. Deliberately
// does NOT call verifyOtp on page load: mail apps commonly prefetch/scan
// links before a person ever clicks them, and a token_hash is one-time-use,
// so an auto-verifying page would silently burn it before the real click.
// Instead this just parses token_hash/type out of the URL on mount and
// waits for an explicit "Continue" click to actually verify. A page
// *load* (even a bot's) can't consume the token, only that click can. The
// Supabase email template has to link straight here with
// ?token_hash={{ .TokenHash }}&type=recovery rather than using the default
// {{ .ConfirmationURL }}, which hits Supabase's own hosted verify endpoint
// (and burns the token) as soon as it's requested, not when it's clicked.
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

    if (!hash || type !== "recovery") {
      setStage("invalid");
      return;
    }

    setTokenHash(hash);
  }, []);

  async function handleContinue() {
    if (!tokenHash) return;

    setError(null);
    setConfirming(true);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });

    setConfirming(false);

    if (verifyError) {
      setStage("invalid");
      setError("This link is invalid, expired, or has already been used.");
      return;
    }

    setStage("verified");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setSubmitting(false);
      setError("Something went wrong setting your password. Please try again.");
      return;
    }

    await supabase.auth.signOut();
    router.push("/admin/login?passwordSet=1");
  }

  if (stage === "invalid") {
    return (
      <main className="flex flex-1 items-center justify-center bg-background px-6 py-16 text-foreground">
        <div className="w-full max-w-sm rounded-3xl border border-foreground/10 bg-[#F5F3E7] p-8">
          <h1 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Link invalid
          </h1>
          <p className="mt-4 text-center text-sm font-medium text-red-700">
            {error ?? "This link is invalid, expired, or has already been used."}
          </p>
          <div className="mt-8 text-center">
            <Link href="/admin/login" className={linkClasses}>
              Back to login to request a new one
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (stage === "verified") {
    return (
      <main className="flex flex-1 items-center justify-center bg-background px-6 py-16 text-foreground">
        <div className="w-full max-w-sm rounded-3xl border border-foreground/10 bg-[#F5F3E7] p-8">
          <h1 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Set your password
          </h1>
          <p className="mt-2 text-center text-sm text-foreground/60">
            Choose a password for your admin account.
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-4">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="New password"
              autoComplete="new-password"
              className={inputClasses}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm password"
              autoComplete="new-password"
              className={inputClasses}
            />

            {error && <p className="text-sm font-medium text-red-700">{error}</p>}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Saving…" : "Set password"}
            </Button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="w-full max-w-sm rounded-3xl border border-foreground/10 bg-[#F5F3E7] p-8">
        <h1 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
          Continue to set your admin password
        </h1>

        {error && (
          <p className="mt-4 text-center text-sm font-medium text-red-700">{error}</p>
        )}

        <Button
          type="button"
          onClick={handleContinue}
          disabled={!tokenHash || confirming}
          className="mt-8 w-full"
        >
          {confirming ? "Confirming…" : "Continue"}
        </Button>
      </div>
    </main>
  );
}
