"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/Button";

const inputClasses =
  "w-full rounded-xl border-2 border-foreground/20 bg-[#F5F3E7] px-4 py-3.5 text-base text-foreground placeholder:text-foreground/40 outline-none transition-colors focus:border-foreground";

// Reached via the link in a Supabase password-recovery email (see
// resetPasswordForEmail in app/admin/login/page.tsx). That link logs the
// browser in automatically when opened (createBrowserClient's default
// detectSessionInUrl), so this page waits for that sign-in rather than
// gating on anything itself. This is also how each admin sets their very
// first password, since none exist yet. Deliberately signs back out and
// sends them through the real password + TOTP login afterward, rather
// than letting a password-only (aal1) session from the recovery link
// straight into /admin.
export default function UpdatePasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

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

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="w-full max-w-sm rounded-3xl border border-foreground/10 bg-[#F5F3E7] p-8">
        <h1 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
          Set your password
        </h1>
        <p className="mt-2 text-center text-sm text-foreground/60">
          {ready
            ? "Choose a password for your admin account."
            : "Confirming your reset link…"}
        </p>

        {ready && (
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

            {error && (
              <p className="text-sm font-medium text-red-700">{error}</p>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Saving…" : "Set password"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
