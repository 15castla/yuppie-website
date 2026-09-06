"use client";

import {
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type MouseEvent,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";

import { cn } from "@/lib/utils";
import { Button } from "@/components/Button";
import {
  almarai,
  instrumentSerif,
} from "@/components/templates/creative-studio/fonts";
import { SiteNav } from "@/components/templates/creative-studio/site-nav";
import { submitApplication } from "./actions";

const inputClasses =
  "w-full rounded-xl border-2 border-foreground/20 bg-[#F5F3E7] px-4 py-3.5 text-base text-foreground placeholder:text-foreground/40 outline-none transition-colors focus:border-foreground";

const labelClasses =
  "text-left text-xs font-semibold uppercase tracking-wider text-foreground/60";

const fieldHover = { scale: 1.02 };
const fieldTransition = { type: "spring" as const, stiffness: 400, damping: 25 };

const REQUIRED_FIELDS: { name: string; label: string }[] = [
  { name: "full_name", label: "Full name" },
  { name: "email", label: "Email" },
  { name: "phone", label: "Phone" },
  { name: "instagram_username", label: "Instagram username" },
  { name: "employer", label: "Employer" },
  { name: "role_title", label: "Role / job title" },
  { name: "linkedin_url", label: "LinkedIn URL" },
];

const CARD_SHADOW = "0 25px 50px -12px rgba(0,0,0,0.15)";
const CARD_SHADOW_HOVER =
  "0 25px 50px -12px rgba(0,0,0,0.15), 0 0 45px 8px rgba(255,217,4,0.45)";

const TILT_QUERY = "(hover: hover) and (pointer: fine)";

// Same curve as Hero/member-login's entrance animation, reused here so
// /apply's arrival reads as the same transition as the rest of the site.
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

function subscribeToTiltSupport(callback: () => void) {
  const mediaQuery = window.matchMedia(TILT_QUERY);
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getTiltSupport() {
  return window.matchMedia(TILT_QUERY).matches;
}

function getTiltSupportServerSnapshot() {
  return false;
}

function Watermark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 bottom-0 select-none"
    >
      <Image
        src="/yuppie_logo_forte_forward.png"
        alt=""
        width={1942}
        height={641}
        className="h-auto w-full opacity-10"
      />
    </div>
  );
}

export default function ApplyPage() {
  const reduce = useReducedMotion();
  const fade = (delay: number) => ({
    initial: reduce ? false : { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: 0.8, delay, ease: EASE_OUT_EXPO },
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{
    message: string;
    isDuplicate: boolean;
  } | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const supportsTilt = useSyncExternalStore(
    subscribeToTiltSupport,
    getTiltSupport,
    getTiltSupportServerSnapshot,
  );

  const cardRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-0.5, 0.5], [6, -6]);
  const rotateY = useTransform(mouseX, [-0.5, 0.5], [-6, 6]);

  function handleCardMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (!supportsTilt) return;
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseX.set((event.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((event.clientY - rect.top) / rect.height - 0.5);
  }

  function handleCardMouseLeave() {
    mouseX.set(0);
    mouseY.set(0);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    const missingField = REQUIRED_FIELDS.find(({ name }) => {
      const value = formData.get(name);
      return typeof value !== "string" || !value.trim();
    });

    if (missingField) {
      setError({ message: `${missingField.label} is required.`, isDuplicate: false });
      return;
    }

    setError(null);
    setSubmitting(true);

    const result = await submitApplication(formData);

    setSubmitting(false);

    if (!result.success) {
      setError({ message: result.error, isDuplicate: Boolean(result.isDuplicate) });
      return;
    }

    setSubmitted(true);
  }

  const heading =
    "text-3xl font-extrabold leading-[0.95] text-foreground sm:text-4xl sm:leading-[0.9] md:text-5xl optical-trim";
  const eyebrow =
    "text-[10px] font-bold uppercase tracking-[0.24em] text-foreground sm:text-xs optical-trim";

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
        <Watermark />
        <SiteNav />

        {submitted ? (
          <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-24 text-center sm:px-6">
            <motion.span {...fade(0.15)} className={eyebrow}>
              Membership
            </motion.span>

            <motion.h1 {...fade(0.3)} className={cn("mt-3", heading)}>
              Thanks for applying.{" "}
              <em className="italic [font-family:var(--font-instrument-serif)] font-normal">
                We&apos;ll be in touch.
              </em>
            </motion.h1>

            <motion.p
              {...fade(0.45)}
              className="mx-auto mt-4 max-w-md text-sm text-foreground-muted sm:text-base"
            >
              Your application is with our membership committee now. If
              you&apos;re approved, you&apos;ll get a text from Yuppie
              letting you know.
            </motion.p>

            <motion.div {...fade(0.6)}>
              <Link
                href="/"
                className="mt-6 inline-block text-sm font-bold text-foreground underline underline-offset-2"
              >
                Back to home
              </Link>
            </motion.div>
          </main>
        ) : (
          <main className="relative z-10 flex flex-1 flex-col items-center px-4 pt-28 pb-20 sm:px-6 sm:pt-32 sm:pb-28 md:pb-32">
            <div className="flex w-full max-w-md flex-col items-center gap-3 text-center">
              <motion.span {...fade(0.15)} className={eyebrow}>
                Membership
              </motion.span>

              <motion.h1
                {...fade(0.3)}
                className={cn(
                  "flex flex-wrap items-center justify-center gap-x-2 gap-y-1",
                  heading,
                )}
              >
                <span>Apply to</span>
                <Image
                  src="/yuppie_logo_forte_forward.png"
                  alt="Yuppie"
                  width={1942}
                  height={641}
                  priority
                  className="h-[1em] w-auto translate-y-[10%]"
                />
              </motion.h1>

              <motion.p
                {...fade(0.45)}
                className="max-w-sm text-sm text-foreground-muted sm:text-base"
              >
                £10 a month. Cancel any time. Every application is
                reviewed by our membership committee before you&apos;re
                approved.
              </motion.p>
            </div>

            <motion.div
              ref={cardRef}
              onMouseMove={handleCardMouseMove}
              onMouseLeave={handleCardMouseLeave}
              initial={reduce ? false : { opacity: 0, y: 20, boxShadow: CARD_SHADOW }}
              animate={{ opacity: 1, y: 0, boxShadow: CARD_SHADOW }}
              whileHover={{
                boxShadow: CARD_SHADOW_HOVER,
                transition: { duration: 0.3 },
              }}
              transition={{ duration: 0.6, delay: 0.6, ease: "easeOut" }}
              style={
                supportsTilt
                  ? { rotateX, rotateY, transformPerspective: 1000 }
                  : undefined
              }
              className="mt-8 w-full max-w-md rounded-2xl border border-foreground/10 bg-background-muted p-8 sm:p-12"
            >
              <form
                onSubmit={handleSubmit}
                noValidate
                className="flex flex-col gap-7"
              >
                <div className="flex flex-col gap-2.5">
                  <label htmlFor="full_name" className={labelClasses}>
                    Full name
                  </label>
                  <motion.input
                    id="full_name"
                    name="full_name"
                    type="text"
                    placeholder="e.g. Marcus Smith"
                    whileHover={fieldHover}
                    transition={fieldTransition}
                    className={inputClasses}
                  />
                </div>

                <div className="flex flex-col gap-2.5">
                  <label htmlFor="email" className={labelClasses}>
                    Email
                  </label>
                  <motion.input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="e.g. marcus@example.com"
                    whileHover={fieldHover}
                    transition={fieldTransition}
                    className={inputClasses}
                  />
                </div>

                <div className="flex flex-col gap-2.5">
                  <label htmlFor="phone" className={labelClasses}>
                    Phone
                  </label>
                  <motion.input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="e.g. 07123 456789"
                    whileHover={fieldHover}
                    transition={fieldTransition}
                    className={inputClasses}
                  />
                </div>

                <div className="flex flex-col gap-2.5">
                  <label htmlFor="instagram_username" className={labelClasses}>
                    Instagram username
                  </label>
                  <motion.input
                    id="instagram_username"
                    name="instagram_username"
                    type="text"
                    placeholder="@yourhandle"
                    whileHover={fieldHover}
                    transition={fieldTransition}
                    className={inputClasses}
                  />
                </div>

                <div className="flex flex-col gap-2.5">
                  <label htmlFor="employer" className={labelClasses}>
                    Employer
                  </label>
                  <motion.input
                    id="employer"
                    name="employer"
                    type="text"
                    placeholder="e.g. ABC LLP"
                    whileHover={fieldHover}
                    transition={fieldTransition}
                    className={inputClasses}
                  />
                </div>

                <div className="flex flex-col gap-2.5">
                  <label htmlFor="role_title" className={labelClasses}>
                    Role / job title
                  </label>
                  <motion.input
                    id="role_title"
                    name="role_title"
                    type="text"
                    placeholder="e.g. Associate"
                    whileHover={fieldHover}
                    transition={fieldTransition}
                    className={inputClasses}
                  />
                </div>

                <div className="flex flex-col gap-2.5">
                  <label htmlFor="linkedin_url" className={labelClasses}>
                    LinkedIn URL
                  </label>
                  <motion.input
                    id="linkedin_url"
                    name="linkedin_url"
                    type="url"
                    placeholder="https://linkedin.com/in/yourname"
                    whileHover={fieldHover}
                    transition={fieldTransition}
                    className={inputClasses}
                  />
                </div>

                {error && (
                  <p
                    className={
                      error.isDuplicate
                        ? "text-sm font-medium text-foreground/70"
                        : "text-sm font-medium text-red-700"
                    }
                  >
                    {error.message}
                  </p>
                )}

                <Button type="submit" disabled={submitting} className="mt-2">
                  {submitting ? "Submitting…" : "Submit application"}
                </Button>

                <p className="text-center text-xs leading-relaxed text-foreground-muted">
                  We ask for your Instagram, employer and LinkedIn so our
                  membership committee can review your application
                  properly. We won&apos;t share your details with anyone
                  outside Yuppie, and we&apos;ll only use them to assess
                  your application and set up your membership if
                  you&apos;re approved. Want your data deleted? Just
                  email us.
                </p>
              </form>
            </motion.div>

            <p className="mt-6 text-center text-sm text-foreground-muted">
              Already a member?{" "}
              <Link
                href="/member-login"
                className="font-bold text-foreground underline underline-offset-2"
              >
                Log in
              </Link>
            </p>
            <p className="mt-2 text-center text-sm text-foreground-muted">
              Got questions? Check the{" "}
              <Link
                href="/faq"
                className="font-bold text-foreground underline underline-offset-2"
              >
                FAQ
              </Link>
            </p>
          </main>
        )}
      </section>
    </div>
  );
}
