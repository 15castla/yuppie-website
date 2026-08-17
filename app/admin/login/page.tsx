"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/Button";

const inputClasses =
  "w-full rounded-xl border-2 border-foreground/20 bg-[#F5F3E7] px-4 py-3.5 text-base text-foreground placeholder:text-foreground/40 outline-none transition-colors focus:border-foreground";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    setError(null);
    setSending(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/admin`,
      },
    });

    setSending(false);

    if (signInError) {
      setError("Something went wrong sending the login link. Please try again.");
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-background px-6 py-24 text-center text-foreground">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Check your email
        </h1>
        <p className="max-w-sm text-base text-foreground/70">
          We sent a login link to {email}. Click it to sign in.
        </p>
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
          Enter your email to receive a login link.
        </p>

        <form
          onSubmit={handleSubmit}
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

          <Button type="submit" disabled={sending} className="w-full">
            {sending ? "Sending…" : "Send login link"}
          </Button>
        </form>
      </div>
    </main>
  );
}
