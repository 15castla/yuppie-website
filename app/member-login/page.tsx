"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/Button";
import {
  almarai,
  instrumentSerif,
} from "@/components/templates/creative-studio/fonts";
import { SiteNav } from "@/components/templates/creative-studio/site-nav";

const inputClasses =
  "w-full rounded-xl border-2 border-foreground/20 bg-[#F5F3E7] px-4 py-3.5 text-base text-foreground placeholder:text-foreground/40 outline-none transition-colors focus:border-foreground";

// Same curve/pattern as Hero's entrance animation
// (components/templates/creative-studio/hero.tsx) — reused here so
// member-login's arrival reads as the same transition as the homepage.
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function MemberLoginPage() {
  const router = useRouter();
  const reduce = useReducedMotion();

  const fade = (delay: number) => ({
    initial: reduce ? false : { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: 0.8, delay, ease: EASE_OUT_EXPO },
  });
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
      setError(
        "Something went wrong sending the login code. Please try again.",
      );
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

    // No dedicated members dashboard yet — send members to the homepage.
    // Swap for a real destination route if one exists by the time this ships.
    router.push("/");
    router.refresh();
  }

  return (
    <div
      className={cn(
        almarai.variable,
        instrumentSerif.variable,
        "flex flex-1 flex-col bg-background text-foreground antialiased",
      )}
      style={{
        fontFamily: "var(--font-almarai), ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <section className="relative flex flex-1 flex-col overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center select-none"
        >
          <Image
            src="/yuppie_logo_forte_forward.png"
            alt=""
            width={1942}
            height={641}
            className="h-auto w-full max-w-xl opacity-10 sm:max-w-2xl"
          />
        </div>

        <SiteNav />

        <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-24 sm:px-6">
          <motion.span
            {...fade(0.15)}
            className="text-[10px] font-bold uppercase tracking-[0.24em] text-foreground optical-trim"
          >
            Members Area
          </motion.span>

          {step === "email" ? (
            <>
              <motion.h1
                {...fade(0.3)}
                className="mt-6 text-center text-3xl font-extrabold leading-[0.95] text-foreground sm:text-4xl sm:leading-[0.9] md:text-5xl optical-trim"
              >
                Welcome back.{" "}
                <em className="italic [font-family:var(--font-instrument-serif)] font-normal">
                  Let&apos;s see what&apos;s on.
                </em>
              </motion.h1>
              <motion.p
                {...fade(0.45)}
                className="mx-auto mt-4 max-w-[380px] text-center text-sm text-foreground-muted sm:text-base"
              >
                Enter your email and we&apos;ll send you a one-time code.
              </motion.p>
            </>
          ) : (
            <>
              <motion.h1
                {...fade(0.3)}
                className="mt-6 text-center text-3xl font-extrabold leading-[0.95] text-foreground sm:text-4xl sm:leading-[0.9] md:text-5xl optical-trim"
              >
                Check your inbox.{" "}
                <em className="italic [font-family:var(--font-instrument-serif)] font-normal">
                  Almost in.
                </em>
              </motion.h1>
              <motion.p
                {...fade(0.45)}
                className="mx-auto mt-4 max-w-[380px] text-center text-sm text-foreground-muted sm:text-base"
              >
                We sent a 6-digit code to {email}.
              </motion.p>
            </>
          )}

          <motion.div
            {...fade(0.6)}
            className="mt-6 w-full max-w-sm rounded-2xl border border-foreground/10 bg-background-muted p-8 shadow-[0_24px_48px_-28px_rgba(27,21,18,0.45)]"
          >
            {step === "email" ? (
              <form
                onSubmit={handleSendCode}
                noValidate
                className="flex flex-col gap-4"
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
            ) : (
              <form
                onSubmit={handleVerifyCode}
                noValidate
                className="flex flex-col gap-4"
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
                  className={cn(inputClasses, "text-center text-lg tracking-[0.5em]")}
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
            )}
          </motion.div>

          <p className="mt-6 text-center text-sm text-foreground-muted">
            New to Yuppie?{" "}
            <Link
              href="/apply"
              className="font-bold text-foreground underline underline-offset-2"
            >
              Apply for membership
            </Link>
          </p>
        </main>
      </section>
    </div>
  );
}
