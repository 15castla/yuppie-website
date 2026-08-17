"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/Button";

const inputClasses =
  "w-full rounded-xl border-2 border-foreground/20 bg-[#F5F3E7] px-4 py-3.5 text-base text-foreground placeholder:text-foreground/40 outline-none transition-colors focus:border-foreground";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
    });

    setSubmitting(false);

    if (signInError) {
      setError("Something went wrong sending the login code. Please try again.");
      return;
    }

    setStep("code");
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!code.trim()) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });

    if (verifyError) {
      setSubmitting(false);
      setError("That code is incorrect or has expired. Please try again.");
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  if (step === "code") {
    return (
      <main className="flex flex-1 items-center justify-center bg-background px-6 py-16 text-foreground">
        <div className="w-full max-w-sm rounded-3xl border border-foreground/10 bg-[#F5F3E7] p-8">
          <h1 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Enter your code
          </h1>
          <p className="mt-2 text-center text-sm text-foreground/60">
            We sent a 6-digit code to {email}.
          </p>

          <form
            onSubmit={handleVerifyCode}
            noValidate
            className="mt-8 flex flex-col gap-4"
          >
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, ""))
              }
              placeholder="123456"
              className={`${inputClasses} text-center text-lg tracking-[0.5em]`}
            />

            {error && (
              <p className="text-sm font-medium text-red-700">{error}</p>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Verifying…" : "Verify code"}
            </Button>

            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              className="text-sm font-medium text-foreground/50 outline-none transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
            >
              Use a different email
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
          Enter your email to receive a login code.
        </p>

        <form
          onSubmit={handleSendCode}
          noValidate
          className="mt-8 flex flex-col gap-4"
        >
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className={inputClasses}
          />

          {error && (
            <p className="text-sm font-medium text-red-700">{error}</p>
          )}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Sending…" : "Send login code"}
          </Button>
        </form>
      </div>
    </main>
  );
}
