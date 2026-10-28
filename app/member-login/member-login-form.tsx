"use client";

// The website's sign-in form. The native app has its own full copy
// (member-login-form-native.tsx) so each can change independently;
// don't re-share code between them beyond site-wide components and the
// error reading in login-errors.ts (both must read Supabase's answers the
// same way).
//
// Every state of r2a section 6: email, sending, not an email, too many
// attempts, no connection, not recognised (with the A-D5 line), code step,
// verifying, wrong code, expired code, too many tries, new code sent; and the
// two notices of B-D1 (?state=logged-out, ?state=session-ended).

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { Check, CircleAlert, Info, LogOut, WifiOff } from "lucide-react";

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
import {
  NOTICE_WORDS,
  classifySendError,
  classifyVerifyError,
  looksLikeEmail,
  type LoginNotice,
  type SendErrorKey,
  type VerifyErrorKey,
} from "./login-errors";

// Every message the screen can show (r2a section 6, the strings table).
// Shown under the input (MessageSlot), growing in when one appears.
const MESSAGES: Record<SendErrorKey | VerifyErrorKey, string> = {
  required: "Email is required.",
  invalid: "That doesn’t look like a valid email address.",
  "not-found": "We don’t recognise that email as a Club Yuppie member. Check for typos, or apply to join below.",
  rate: "Too many attempts. Please wait a few minutes and try again.",
  network: "We couldn’t reach Club Yuppie. Check your connection and try again.",
  // Auth answered with something unexpected (a 5xx): the network words, the nearest designed line (r2b: never
  // "Something went wrong").
  generic: "We couldn’t reach Club Yuppie. Check your connection and try again.",
  "code-required": "Enter the 6-digit code from your email.",
  wrong: "That code isn’t right. Check the email and try again.",
  expired: "That code has expired. Send a new code and try again.",
  "too-many": "Too many tries. Wait a few minutes, then send a new code.",
};
// Decision A-D5: someone who applied but is not a member yet.
const APPLIED_LINE = "Applied already? We’ll email you when you’re approved.";
// Not in the designs: Auth answered with something unexpected while checking a code.
const VERIFY_GENERIC = "We couldn’t reach Club Yuppie. Check your connection and try again.";

const EMAIL_STEP_HELPER = "Enter your email and we’ll send you a one-time code.";

// The submit button's label crossfade (Send login code -> Sending… ->
// Verify code).
const LABEL_FADE_MS = 180;

type ErrorKey = SendErrorKey | VerifyErrorKey;

function messageFor(key: ErrorKey, step: "email" | "code"): string {
  if (key === "generic" && step === "code") return VERIFY_GENERIC;
  return MESSAGES[key];
}

export function MemberLoginForm({ notice = null }: { notice?: LoginNotice | null }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [resent, setResent] = useState(false);
  // When the code now in use was sent: Auth answers the same for a wrong code and an expired one (login-errors.ts).
  const sentAt = useRef<number | null>(null);

  async function sendCode(address: string): Promise<SendErrorKey | null> {
    const supabase = createClient();
    try {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: address,
        options: { shouldCreateUser: false },
      });
      if (signInError) {
        console.error("signInWithOtp error:", signInError);
        return classifySendError(signInError);
      }
      sentAt.current = Date.now();
      return null;
    } catch (err) {
      console.error("signInWithOtp threw:", err);
      return classifySendError({ name: "AuthRetryableFetchError", status: 0 });
    }
  }

  async function handleSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();

    if (!address) {
      setError("required");
      return;
    }
    if (!looksLikeEmail(address)) {
      setError("invalid");
      return;
    }

    setError(null);
    setSubmitting(true);
    const failure = await sendCode(address);
    setSubmitting(false);

    if (failure) {
      setError(failure);
      return;
    }
    setResent(false);
    setStep("code");
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!code.trim()) {
      setError("code-required");
      return;
    }

    setError(null);
    setResent(false);
    setSubmitting(true);

    const supabase = createClient();
    let verifyError: Parameters<typeof classifyVerifyError>[0] = null;
    try {
      ({ error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code,
        type: "email",
      }));
    } catch (err) {
      console.error("verifyOtp threw:", err);
      verifyError = { name: "AuthRetryableFetchError", status: 0 };
    }

    if (verifyError) {
      console.error("verifyOtp error:", verifyError);
      setSubmitting(false);
      setError(classifyVerifyError(verifyError, sentAt.current));
      return;
    }

    router.push("/members");
  }

  async function handleResend() {
    if (resending || submitting) return;
    setResending(true);
    setResent(false);
    const failure = await sendCode(email.trim());
    setResending(false);
    if (failure) {
      setError(failure);
      return;
    }
    setError(null);
    setCode("");
    setResent(true);
    inputRef.current?.focus({ preventScroll: true });
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

  const codeStepHelper = `We sent a 6-digit code to ${email.trim()}.`;
  const errorId = useId();
  const inputId = useId();
  // "Send a new code" is the way on once the code has expired or there were too many tries (r2a: ink, not muted).
  const resendOn = error === "expired" || error === "too-many";

  let errorBody: ReactNode = null;
  if (error) {
    const Mark = error === "network" ? WifiOff : CircleAlert;
    errorBody = (
      <p className="m-0 flex items-start justify-center gap-1.5 text-center">
        <Mark aria-hidden size={16} strokeWidth={2} className="mt-[1px] shrink-0" />
        <span>
          {messageFor(error, step)}
          {error === "not-found" ? <span className="mt-1.5 block text-foreground">{APPLIED_LINE}</span> : null}
        </span>
      </p>
    );
  }

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
          {/* r2a: two lines at every width, so 38px under 360 (the public h1 is 44px there and wraps). */}
          <h1 className={cn(PAGE_H1_CLASS, "max-[359px]:text-[38px]!")}>
            Welcome back.
            <br />
            <span className={HEADLINE_ACCENT_CLASS}>Let’s see what’s on.</span>
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

          {/* B-D1 (r2b section 7): where Log out and an expired session land. */}
          {notice && isEmailStep ? (
            <div
              role="status"
              className="mt-1 flex w-full items-start gap-3 self-stretch rounded-2xl border-[1.5px] border-foreground bg-background-muted px-4 py-3.5 text-left text-[15px] leading-[1.4] md:max-w-[440px] md:self-center"
            >
              {notice === "logged-out" ? (
                <LogOut aria-hidden size={22} strokeWidth={2} className="mt-[1px] shrink-0" />
              ) : (
                <Info aria-hidden size={22} strokeWidth={2} className="mt-[1px] shrink-0" />
              )}
              <div>
                <b className="block text-base font-extrabold">{NOTICE_WORDS[notice].title}</b>
                {NOTICE_WORDS[notice].body}
              </div>
            </div>
          ) : null}

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
                  // The code step's digits: 28px, bold, letter-spaced (r2a .lg-code); the placeholder stays light.
                  !isEmailStep && "text-center text-[28px]! font-extrabold! tracking-[0.38em] pl-[calc(14px+0.38em)]! placeholder:font-normal!",
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
                {errorBody}
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
                <div className="message-grow-in [--message-gap-to:4px]">
                  <div className="flex flex-col items-center">
                    <p aria-live="polite" className="m-0 w-full">
                      {resent ? (
                        <span className="flex min-h-7 items-center justify-center gap-1.5 text-sm font-bold text-[#2F6B3A]">
                          <Check aria-hidden size={16} strokeWidth={2} />
                          New code sent.
                        </span>
                      ) : null}
                    </p>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resending}
                      className={cn(
                        "block min-h-11 border-0 bg-transparent text-sm font-bold underline underline-offset-2 outline-none hover:text-foreground focus-visible:text-foreground focus-visible:decoration-[3px]",
                        resendOn ? "text-foreground" : "text-site-muted",
                      )}
                    >
                      {resending ? "Sending…" : "Send a new code"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStep("email");
                        setCode("");
                        setError(null);
                        setResent(false);
                      }}
                      className="block min-h-11 border-0 bg-transparent text-sm font-bold text-site-muted underline underline-offset-2 outline-none hover:text-foreground focus-visible:text-foreground focus-visible:decoration-[3px]"
                    >
                      Use a different email
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>

          <p className="m-0 mt-2 text-[15px]">
            New to Club Yuppie?{" "}
            <Link href="/apply" className={cn(TEXT_LINK_CLASS, "inline-block px-1 py-3.5 -mx-1 -my-3.5")}>
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
