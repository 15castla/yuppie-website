"use client";

// The website's sign-in form. The native app has its own full copy
// (member-login-form-native.tsx) so each can change independently;
// don't re-share code between them beyond site-wide components.

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { MessageSlot } from "@/components/StableLayout";
import {
  CARD_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  PAGE_H1_CLASS,
  PRIMARY_BUTTON_CLASS,
  HEADLINE_ACCENT_CLASS,
  SITE_CONTAINER_CLASS,
  SITE_FONT_STYLE,
  SITE_MAIN_PADDING_CLASS,
  SITE_PAGE_CLASS,
  TEXT_LINK_CLASS,
} from "@/components/site/ui";
import { useKeyboardReveal } from "./use-keyboard-reveal";
import {
  almarai,
  instrumentSerif,
} from "@/components/templates/creative-studio/fonts";
// Every error the screen can show. Shown under the input (MessageSlot),
// growing in when one appears; nothing is reserved for them.
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

// The submit button's label crossfade (Send login code -> Sending… ->
// Verify code).
const LABEL_FADE_MS = 180;

export function MemberLoginForm() {
  const router = useRouter();
  const reduce = useReducedMotion();
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
  const errorId = useId();
  const inputId = useId();

  return (
    <div
      className={cn(almarai.variable, instrumentSerif.variable, SITE_PAGE_CLASS, "min-h-dvh")}
      style={SITE_FONT_STYLE}
    >
      <section className="relative flex flex-1 flex-col">
        <main
          className={cn(
            SITE_CONTAINER_CLASS,
            SITE_MAIN_PADDING_CLASS,
            "flex flex-1 flex-col items-center gap-5 text-center md:gap-6",
          )}
        >
          {/* Static across both steps; only the helper text below and the
              card's contents change when a code is sent. */}
          <h1 className={PAGE_H1_CLASS}>
            Welcome back.
            <br />
            <span className={HEADLINE_ACCENT_CLASS}>Let&apos;s see what&apos;s on.</span>
          </h1>
          {/* Purely instructional, never an error. Both steps' lines are
              stacked in one grid cell so swapping them at the step change
              can't move the card below. The code-step line includes the
              typed email, so it's only reserved once on that step (typing a
              long email can't shift the page). Polite live region, so the
              step change ("We sent a 6-digit code to…") is announced. */}
          <div
            aria-live="polite"
            className="m-0 grid w-full max-w-[560px] text-[17px] leading-normal md:text-[19px]"
          >
            <p aria-hidden className="invisible m-0 [grid-area:1/1]">
              {EMAIL_STEP_HELPER}
            </p>
            {step === "code" && (
              <p aria-hidden className="invisible m-0 [grid-area:1/1]">
                {codeStepHelper}
              </p>
            )}
            <p className="m-0 break-words [grid-area:1/1]">
              {step === "email" ? EMAIL_STEP_HELPER : codeStepHelper}
            </p>
          </div>

          <div className={cn(CARD_CLASS, "mt-3 mr-1.5 w-full self-stretch text-left md:mt-4 md:mr-0 md:max-w-[440px] md:self-center")}>
            {/* A single form, input and button for both steps, so they're
                literally the same boxes: only their content changes (the
                label too, in the same row). h-[50px] pins the input at
                exactly 50px whatever the text styling inside it (the code
                step's larger, letter-spaced digits). */}
            <form
              onSubmit={isEmailStep ? handleSendCode : handleVerifyCode}
              noValidate
              className="flex flex-col"
            >
              <label htmlFor={inputId} className={cn(LABEL_CLASS, "mb-2")}>
                {isEmailStep ? "Email address" : "6-digit code"}
              </label>
              <input
                ref={inputRef}
                id={inputId}
                type={isEmailStep ? "email" : "text"}
                inputMode={isEmailStep ? "email" : "numeric"}
                autoComplete={isEmailStep ? "email" : "one-time-code"}
                maxLength={isEmailStep ? undefined : 6}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                value={isEmailStep ? email : code}
                onChange={(event) =>
                  isEmailStep
                    ? setEmail(event.target.value)
                    : setCode(event.target.value.replace(/\D/g, ""))
                }
                placeholder={isEmailStep ? "you@example.com" : "123456"}
                className={cn(
                  INPUT_CLASS,
                  "h-[50px]",
                  !isEmailStep && "text-center text-lg tracking-[0.5em]",
                  // Important, to win over the base border colour (cn is a
                  // plain join, not a Tailwind conflict merge).
                  error && "border-[#B3261E]!",
                )}
              />

              {/* No reserved space: with no error the button sits the usual
                  gap below the input. An error mounts under the input and
                  grows in (see MessageSlot). */}
              <MessageSlot
                id={errorId}
                className="text-center text-sm leading-[1.35] text-[#B3261E]"
              >
                {error && <p className="m-0">{error}</p>}
              </MessageSlot>

              {/* The label crossfades in place (Send login code -> Sending…
                  -> Verify code); stacking old and new in one grid cell keeps
                  the button's size independent of either label. */}
              <button
                type="submit"
                disabled={submitting}
                className={cn(PRIMARY_BUTTON_CLASS, "mt-4 w-full md:mt-[18px]")}
              >
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
              </button>

              {/* Code step only: mounts on the code step and grows in like
                  a message (.message-grow-in), below the button. */}
              {!isEmailStep && (
                <div className="message-grow-in [--message-gap-to:8px]">
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setStep("email");
                        setCode("");
                        setError(null);
                      }}
                      className="block min-h-11 w-full border-0 bg-transparent text-sm font-bold text-site-muted underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline"
                    >
                      Use a different email
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>

          <p className="m-0 mt-2 text-[15px]">
            New to Yuppie?{" "}
            <Link href="/apply" className={TEXT_LINK_CLASS}>
              Apply for membership
            </Link>
          </p>
          <Link
            href="/privacy"
            className="-mt-3 inline-flex min-h-11 items-center text-sm text-site-muted underline underline-offset-2 hover:text-foreground"
          >
            Privacy policy
          </Link>
        </main>
        {/* Extra scroll room while the keyboard covers part of the screen;
            0px otherwise. Sized by useKeyboardReveal. */}
        <div ref={keyboardSpacerRef} aria-hidden className="shrink-0" />
      </section>
    </div>
  );
}
