"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/Button";
import { MessageSlot } from "@/components/StableLayout";
import { useKeyboardReveal } from "./use-keyboard-reveal";
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

// The submit button's label crossfade (Send login code -> Sending… ->
// Verify code).
const LABEL_FADE_MS = 180;

export function MemberLoginForm({ isNativeApp }: { isNativeApp: boolean }) {
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

  // One input and one button serve both steps (only their content
  // changes), so on a step change focus goes back to that same input,
  // now asking for the code (or the email again).
  //
  // Deferred until the button's label crossfade has finished: iOS Safari
  // does enough work on focus to block a frame for 100-350ms (measured),
  // which froze the crossfade mid-way when focus happened in the same
  // frame as the step change. preventScroll keeps focusing from moving
  // the page.
  //
  // Compared against the previous step (not a first-render flag) so
  // focus never moves on mount, even when Strict Mode re-runs effects.
  const inputRef = useRef<HTMLInputElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    const timer = setTimeout(
      () => inputRef.current?.focus({ preventScroll: true }),
      LABEL_FADE_MS,
    );
    return () => clearTimeout(timer);
  }, [step]);

  const keyboardSpacerRef = useRef<HTMLDivElement>(null);
  useKeyboardReveal(inputRef, keyboardSpacerRef, !!reduce);

  const isEmailStep = step === "email";
  const buttonLabel = isEmailStep
    ? submitting
      ? "Sending…"
      : "Send login code"
    : submitting
      ? "Verifying…"
      : "Verify code";

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
          {/* The app shows its own icon, the website the wordmark. Both sit
              in the same 60px-tall box so everything below lands at the
              same position either way.

              The icon's ink keyline isn't decorative: the icon's own
              background is the same yellow as the page, so without it the
              icon's edges disappear. Cream was tried and read as a smear
              (too close to yellow in lightness). Radius is ~22% of the
              width, the ratio iOS masks icons with. */}
          <motion.div {...fade(0.1)} className="flex h-[60px] items-center">
            {isNativeApp ? (
              <Image
                src="/yuppie_app_icon_1024.png"
                alt="Yuppie"
                // 3x the 60px display size, so phones get a crisp source.
                width={180}
                height={180}
                priority
                className="h-[60px] w-[60px] rounded-[22%] border-[3px] border-foreground shadow-[0_8px_16px_rgba(27,21,18,0.28)]"
              />
            ) : (
              <Image
                src="/yuppie_logo_forte_forward.png"
                alt="Yuppie"
                // 3x the 150px display width (keeping the file's 1942x641
                // ratio), so phones get a crisp source without downloading
                // a 3840px one.
                width={450}
                height={149}
                priority
                className="h-auto w-[150px]"
              />
            )}
          </motion.div>

          <motion.span
            {...fade(0.2)}
            className="mt-6 text-[10px] font-bold uppercase tracking-[0.24em] text-foreground optical-trim"
          >
            {isNativeApp ? "Members App" : "Members Area"}
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
            {/* A single form, input and button for both steps, so they're
                literally the same boxes: only their content changes. h-14
                pins the input at exactly 56px whatever the text styling
                inside it (the code step's larger, letter-spaced digits). */}
            <form
              onSubmit={isEmailStep ? handleSendCode : handleVerifyCode}
              noValidate
              className="flex flex-col gap-4"
            >
              <input
                ref={inputRef}
                type={isEmailStep ? "email" : "text"}
                inputMode={isEmailStep ? "email" : "numeric"}
                autoComplete={isEmailStep ? "email" : "one-time-code"}
                maxLength={isEmailStep ? undefined : 6}
                aria-label={isEmailStep ? "Email address" : "6-digit code"}
                value={isEmailStep ? email : code}
                onChange={(event) =>
                  isEmailStep
                    ? setEmail(event.target.value)
                    : setCode(event.target.value.replace(/\D/g, ""))
                }
                placeholder={isEmailStep ? "you@example.com" : "123456"}
                className={cn(
                  inputClasses,
                  "h-14",
                  !isEmailStep && "text-center text-lg tracking-[0.5em]",
                )}
              />

              {/* The label crossfades in place (Send login code -> Sending…
                  -> Verify code); stacking old and new in one grid cell keeps
                  the button's size independent of either label. */}
              <Button type="submit" disabled={submitting} className="w-full">
                <span className="grid">
                  <AnimatePresence initial={false}>
                    <motion.span
                      key={buttonLabel}
                      className="[grid-area:1/1]"
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6 }}
                      transition={{ duration: LABEL_FADE_MS / 1000, ease: "easeOut" }}
                    >
                      {buttonLabel}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </Button>

              {/* Always rendered so its row is reserved on the email step
                  too, and the card's height never changes. Hidden by
                  opacity (and inert) rather than visibility so it can fade
                  in alongside the button's label. */}
              <button
                type="button"
                inert={isEmailStep}
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
                className={cn(
                  "text-sm font-medium text-foreground/50 outline-none transition-[color,opacity] duration-200 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline motion-reduce:transition-none",
                  isEmailStep && "opacity-0",
                )}
              >
                Use a different email
              </button>
            </form>
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
        {/* Extra scroll room while the keyboard covers part of the screen;
            0px otherwise. Sized by useKeyboardReveal. */}
        <div ref={keyboardSpacerRef} aria-hidden className="shrink-0" />
      </section>
    </div>
  );
}
