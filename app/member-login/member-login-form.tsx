"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/Button";
import { MessageSlot, StepStack } from "@/components/StableLayout";
import {
  almarai,
  instrumentSerif,
} from "@/components/templates/creative-studio/fonts";
// Every error the screen can show, in one place so the helper-text
// MessageSlot above the card can reserve room for the longest.
const SEND_CODE_ERRORS = {
  required: "Email is required.",
  notMember:
    "We don't recognise that email as a Yuppie member. Check for typos, or apply to join below.",
  rateLimited: "Too many attempts. Please wait a few minutes and try again.",
  invalidEmail: "That doesn't look like a valid email address.",
  generic: "Something went wrong sending the login code. Please try again.",
};
const VERIFY_CODE_ERRORS = {
  required: "Enter the 6-digit code from your email.",
  incorrect: "That code is incorrect or has expired. Please try again.",
};

const EMAIL_STEP_HELPER = "Enter your email and we'll send you a one-time code.";

const inputClasses =
  "w-full rounded-xl border-2 border-foreground/20 bg-[#F5F3E7] px-4 py-3.5 text-base text-foreground placeholder:text-foreground/40 outline-none transition-colors focus:border-foreground";

// Same curve/pattern as Hero's entrance animation
// (components/templates/creative-studio/hero.tsx), reused here so
// member-login's arrival reads as the same transition as the homepage.
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export function MemberLoginForm({ eyebrow }: { eyebrow: string }) {
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
      setError(SEND_CODE_ERRORS.required);
      return;
    }

    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    setSubmitting(false);

    if (signInError) {
      // Logged so we can see the real shape of Supabase's error during
      // testing and tighten the checks below if the wording differs.
      console.error("signInWithOtp error:", signInError);

      const code = (signInError as { code?: string }).code;
      const message = signInError.message?.toLowerCase() ?? "";

      if (
        code === "otp_disabled" ||
        message.includes("signup") ||
        message.includes("not allowed")
      ) {
        setError(SEND_CODE_ERRORS.notMember);
      } else if (signInError.status === 429 || message.includes("rate limit")) {
        setError(SEND_CODE_ERRORS.rateLimited);
      } else if (message.includes("invalid") || message.includes("valid email")) {
        setError(SEND_CODE_ERRORS.invalidEmail);
      } else {
        setError(SEND_CODE_ERRORS.generic);
      }
      return;
    }

    setStep("code");
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!code.trim()) {
      setError(VERIFY_CODE_ERRORS.required);
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
      setError(VERIFY_CODE_ERRORS.incorrect);
      return;
    }

    router.push("/members");
  }

  const codeStepHelper = `We sent a 6-digit code to ${email}.`;

  return (
    <div
      className={cn(
        almarai.variable,
        instrumentSerif.variable,
        "flex min-h-dvh flex-1 flex-col bg-background text-foreground antialiased",
      )}
      style={{
        fontFamily: "var(--font-almarai), ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <section className="relative flex flex-1 flex-col">
        <main className="relative z-10 flex flex-1 flex-col items-center px-4 pt-[calc(4.5rem+var(--safe-top))] pb-20 sm:px-6 sm:pb-28 md:pb-32">
          {/* The shipped app icon. The ink keyline isn't decorative: the
              icon's own background is the same yellow as the page, so
              without it the icon's edges disappear. Cream was tried and
              read as a smear (too close to yellow in lightness). Radius is
              ~22% of the width, the ratio iOS masks icons with. */}
          <motion.div {...fade(0.1)}>
            <Image
              src="/yuppie_app_icon_1024.png"
              alt="Yuppie"
              // 3x the 60px display size, so phones get a crisp source.
              width={180}
              height={180}
              priority
              className="h-[60px] w-[60px] rounded-[22%] border-[3px] border-foreground shadow-[0_8px_16px_rgba(27,21,18,0.28)]"
            />
          </motion.div>

          <motion.span
            {...fade(0.2)}
            className="mt-6 text-[10px] font-bold uppercase tracking-[0.24em] text-foreground optical-trim"
          >
            {eyebrow}
          </motion.span>

          {/* Static across both steps; only the helper text below and the
              card's contents change when a code is sent. */}
          <motion.h1
            {...fade(0.3)}
            className="mt-5 text-center text-3xl font-extrabold leading-[0.95] text-foreground sm:text-4xl sm:leading-[0.9] md:text-5xl optical-trim"
          >
            Welcome back.
            <br />
            <em className="italic [font-family:var(--font-instrument-serif)] font-normal">
              Let&apos;s see what&apos;s on.
            </em>
          </motion.h1>
          {/* Errors show here, in place of the helper text, rather than
              inside the card: this line already changes per step, so
              reserving room for the longest message costs no extra space,
              and the card itself never resizes. font-medium on the slot
              (undone on the helper) makes the hidden reserve copies match
              the error's slightly wider weight, so the reserve can only
              overestimate a wrap. The code-step helper includes the typed
              email, so it's only reserved once on that step. */}
          <motion.div {...fade(0.45)} className="mx-auto mt-4 w-full max-w-[380px]">
            <MessageSlot
              reserve={[
                ...Object.values(SEND_CODE_ERRORS),
                ...Object.values(VERIFY_CODE_ERRORS),
                EMAIL_STEP_HELPER,
                ...(step === "code" ? [codeStepHelper] : []),
              ]}
              className="text-center text-sm font-medium sm:text-base"
            >
              {error ? (
                <p className="text-red-700">{error}</p>
              ) : (
                <p className="font-normal text-foreground-muted">
                  {step === "email" ? EMAIL_STEP_HELPER : codeStepHelper}
                </p>
              )}
            </MessageSlot>
          </motion.div>

          <motion.div
            {...fade(0.6)}
            className="mt-6 w-full max-w-sm rounded-2xl border border-foreground/10 bg-background-muted p-8 shadow-[0_24px_48px_-28px_rgba(27,21,18,0.45)]"
          >
            <StepStack
              active={step}
              align="center"
              steps={{
                email: (
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

                    <Button type="submit" disabled={submitting} className="w-full">
                      {submitting ? "Sending…" : "Send login code"}
                    </Button>
                  </form>
                ),
                code: (
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
                ),
              }}
            />
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
