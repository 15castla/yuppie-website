"use client";

// The native app's sign-in form: a deliberate full copy of the website's
// (member-login-form.tsx) so each can change independently; don't
// re-share code between them beyond site-wide components and the error
// reading in login-errors.ts.
//
// r2a section 7: no public header, no Apply link, no Privacy link (the app
// cannot sell or sign people up). The whole column (badge, "Members App",
// headline, helper, card) is centred above the giant wordmark standing on a
// 3px rule. Every state of the web form, with the app's own "not recognised"
// line. needs_device_check: all of it (the keyboard, the strip under the
// clock, the safe areas).

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { Check, CircleAlert, Info, LogOut, WifiOff } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { MessageSlot } from "@/components/StableLayout";
import { CARD_CLASS, INPUT_CLASS, LABEL_CLASS, PRIMARY_BUTTON_CLASS, TERM_LABEL_CLASS } from "@/components/site/ui";
import { useKeyboardReveal } from "./use-keyboard-reveal-native";
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

// Every message the screen can show (r2a section 7). The app's "not
// recognised" has no "apply to join below": the app has no Apply link.
const MESSAGES: Record<SendErrorKey | VerifyErrorKey, string> = {
  required: "Email is required.",
  invalid: "That doesn’t look like a valid email address.",
  "not-found": "We don’t recognise that email as a Club Yuppie member. Check for typos and try again.",
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
// Decision A-D5.
const APPLIED_LINE = "Applied already? We’ll email you when you’re approved.";
// Not in the designs: Auth answered with something unexpected while checking a code.
const VERIFY_GENERIC = "We couldn’t reach Club Yuppie. Check your connection and try again.";

const EMAIL_STEP_HELPER = "Enter your email and we’ll send you a one-time code.";

// The giant wordmark at the foot (the You page's foot drawing): the file, and the box its ink fills.
const WORDMARK_INK = { left: 16, top: 16, width: 1911, height: 610 };
const WORDMARK_FILE = { width: 1942, height: 641 };

// Same curve/pattern as Hero's entrance animation
// (components/templates/creative-studio/hero.tsx), reused here so
// member-login's arrival reads as the same transition as the homepage.
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

// The submit button's label crossfade (Send login code -> Sending… ->
// Verify code).
const LABEL_FADE_MS = 180;

type ErrorKey = SendErrorKey | VerifyErrorKey;

export function MemberLoginFormNative({ notice = null }: { notice?: LoginNotice | null }) {
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
  const resendOn = error === "expired" || error === "too-many";

  let errorBody: ReactNode = null;
  if (error) {
    const Mark = error === "network" ? WifiOff : CircleAlert;
    const text = error === "generic" && step === "code" ? VERIFY_GENERIC : MESSAGES[error];
    errorBody = (
      <p className="m-0 flex items-start justify-center gap-1.5 text-center">
        <Mark aria-hidden size={16} strokeWidth={2} className="mt-[1px] shrink-0" />
        <span>
          {text}
          {error === "not-found" ? <span className="mt-1.5 block text-foreground">{APPLIED_LINE}</span> : null}
        </span>
      </p>
    );
  }

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
      {/* With the keyboard up the page scrolls under the clock: a solid strip
          keeps it readable (r2a 7, NEW; needs_device_check). Invisible otherwise:
          the same yellow as the page. */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[var(--safe-top)] bg-background" />
      <section className="relative flex min-h-dvh flex-1 flex-col">
        {/* The whole column (badge down to the card) is centred in the space
            between the status area and the wordmark at the foot, keeping at
            least 16px from the top inset and 24px from the foot. With the
            keyboard up, useKeyboardReveal grows the spacer below to make
            scroll room. */}
        <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 pt-[calc(1rem+var(--safe-top))] pb-6 text-center">
          {/* The "y" mark, framed by CSS to read as the app icon (3px ink keyline:
              the art's background is the page's yellow). Radius ~22%, as iOS masks icons. */}
          <motion.div {...fade(0.1)}>
            <Image
              src="/yuppie_app_badge_y.png"
              alt="Club Yuppie"
              // 3x the 60px display size, so phones get a crisp source.
              width={180}
              height={180}
              priority
              className="h-[60px] w-[60px] rounded-[22%] border-[3px] border-foreground"
            />
          </motion.div>

          <motion.span {...fade(0.2)} className={cn(TERM_LABEL_CLASS, "mt-5 block")}>
            Members App
          </motion.span>

          {/* Static across both steps; only the helper text below and the
              card's contents change when a code is sent. */}
          <motion.h1
            {...fade(0.3)}
            className="mt-3 text-center text-[36px] font-extrabold leading-[0.95] tracking-[-0.03em] text-foreground [text-wrap:balance]"
          >
            Welcome back.
            <br />
            <em className="italic [font-family:var(--font-instrument-serif)] font-normal tracking-[-0.01em]">
              Let’s see what’s on.
            </em>
          </motion.h1>
          {/* Purely instructional, never an error. Both steps' lines are
              stacked in one grid cell so swapping them at the step change
              can't move the card below. Polite live region, so the step
              change ("We sent a 6-digit code to…") is announced. */}
          <motion.div
            {...fade(0.45)}
            aria-live="polite"
            className="mx-auto mt-3 grid w-full max-w-[320px] text-center text-[17px] leading-normal [text-wrap:balance]"
          >
            <p aria-hidden className="invisible m-0 [grid-area:1/1]">
              {EMAIL_STEP_HELPER}
            </p>
            {step === "code" && (
              <p aria-hidden className="invisible m-0 break-words [grid-area:1/1]">
                {codeStepHelper}
              </p>
            )}
            <p className="m-0 break-words [grid-area:1/1]">
              {step === "email" ? EMAIL_STEP_HELPER : codeStepHelper}
            </p>
          </motion.div>

          {notice && isEmailStep ? (
            <motion.div
              {...fade(0.5)}
              role="status"
              className="mt-5 flex w-full max-w-[354px] items-start gap-3 rounded-2xl border-[1.5px] border-foreground bg-background-muted px-4 py-3.5 text-left text-[15px] leading-[1.4]"
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
            </motion.div>
          ) : null}

          <motion.div {...fade(0.6)} className={cn(CARD_CLASS, "mt-6 mr-1.5 w-full max-w-[354px] text-left")}>
            {/* A single form, input and button for both steps, so they're
                literally the same boxes: only their content changes. h-[50px]
                pins the input at 50px whatever the text styling inside it. */}
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

              {/* No reserved space: an error mounts under the input and grows in (see MessageSlot). */}
              <MessageSlot
                id={errorId}
                className="text-center text-sm leading-[1.35] text-[#B3261E]"
              >
                {errorBody}
              </MessageSlot>

              <button
                type="submit"
                disabled={submitting}
                className={cn(PRIMARY_BUTTON_CLASS, "mt-4 w-full")}
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

              {/* Code step only: mounts on the code step and grows in like a message. */}
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
                        "block min-h-11 border-0 bg-transparent text-sm font-bold underline underline-offset-2 outline-none focus-visible:text-foreground focus-visible:decoration-[3px]",
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
                      className="block min-h-11 border-0 bg-transparent text-sm font-bold text-site-muted underline underline-offset-2 outline-none focus-visible:text-foreground focus-visible:decoration-[3px]"
                    >
                      Use a different email
                    </button>
                  </div>
                </div>
              )}
            </form>
          </motion.div>
        </main>

        {/* The giant wordmark standing on a 3px rule, above the home indicator. */}
        <div
          aria-hidden
          className="shrink-0"
          style={{ paddingBottom: "var(--native-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="px-5">
            <span
              className="relative block w-full overflow-hidden"
              style={{ aspectRatio: `${WORDMARK_INK.width} / ${WORDMARK_INK.height}` }}
            >
              <Image
                src="/yuppie_logo_forte_forward.png"
                alt=""
                width={WORDMARK_FILE.width}
                height={WORDMARK_FILE.height}
                sizes="100vw"
                className="absolute block h-auto max-w-none"
                style={{
                  width: `${(WORDMARK_FILE.width / WORDMARK_INK.width) * 100}%`,
                  height: `${(WORDMARK_FILE.height / WORDMARK_INK.height) * 100}%`,
                  left: `${(-WORDMARK_INK.left / WORDMARK_INK.width) * 100}%`,
                  top: `${(-WORDMARK_INK.top / WORDMARK_INK.height) * 100}%`,
                }}
              />
            </span>
          </div>
          <hr className="m-0 border-0 border-t-[3px] border-foreground" />
        </div>
        {/* Extra scroll room while the keyboard covers part of the screen;
            0px otherwise. Sized by useKeyboardReveal. */}
        <div ref={keyboardSpacerRef} aria-hidden className="shrink-0" />
      </section>
    </div>
  );
}
