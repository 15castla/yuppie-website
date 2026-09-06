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
import { motion, useMotionValue, useTransform } from "framer-motion";
import { Button } from "@/components/Button";
import { cn } from "@/lib/utils";
import {
  almarai,
  instrumentSerif,
} from "@/components/templates/creative-studio/fonts";
import { SiteNav } from "@/components/templates/creative-studio/site-nav";
import { submitApplication } from "./actions";

const inputClasses =
  "w-full rounded-xl border-2 border-foreground/20 bg-background-muted px-4 py-3.5 text-base text-foreground placeholder:text-foreground/40 outline-none transition-colors focus:border-foreground";

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

export default function ApplyPage() {
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

  if (submitted) {
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
        <SiteNav />

        <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-background px-6 py-24 text-center text-foreground">
          <Image
            src="/yuppie_logo_forte_forward.png"
            alt="Yuppie"
            width={1942}
            height={641}
            className="h-auto w-[60vw] max-w-[420px]"
          />
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Thanks for applying!
          </h1>
          <p className="max-w-md text-lg text-foreground-muted">
            Your application is with our membership committee now. If
            you&apos;re approved, you&apos;ll get a text from Yuppie letting
            you know.
          </p>
        </main>
      </div>
    );
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
      <SiteNav />

      <main className="flex flex-1 items-center justify-center bg-background px-6 py-16 text-foreground">
        <div className="flex w-full max-w-md flex-col items-center">
          <motion.div
            ref={cardRef}
            onMouseMove={handleCardMouseMove}
            onMouseLeave={handleCardMouseLeave}
            initial={{ opacity: 0, y: 20, boxShadow: CARD_SHADOW }}
            animate={{ opacity: 1, y: 0, boxShadow: CARD_SHADOW }}
            whileHover={{
              boxShadow: CARD_SHADOW_HOVER,
              transition: { duration: 0.3 },
            }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={
              supportsTilt
                ? { rotateX, rotateY, transformPerspective: 1000 }
                : undefined
            }
            className="w-full max-w-md rounded-3xl border border-foreground/10 bg-background-muted p-8 sm:p-12"
          >
            <div className="mt-8 text-center">
              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-foreground sm:text-xs optical-trim">
                MEMBERSHIP
              </span>

              <h1 className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-3xl font-bold tracking-tight sm:text-4xl">
                <span>Apply to</span>
                <Image
                  src="/yuppie_logo_forte_forward.png"
                  alt="Yuppie"
                  width={1942}
                  height={641}
                  priority
                  className="h-[1em] w-auto translate-y-[10%]"
                />
              </h1>

              <p className="mx-auto mt-4 max-w-md text-center text-sm text-foreground-muted sm:text-base">
                £10 a month. Cancel any time. Every application is reviewed
                by our membership committee before you&apos;re approved.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              noValidate
              className="mt-10 flex flex-col gap-7"
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

              <p className="text-center text-sm text-foreground-muted">
                Got questions? Check the{" "}
                <Link
                  href="/faq"
                  className="font-bold text-foreground underline underline-offset-2"
                >
                  FAQ
                </Link>
              </p>

              <p className="text-center text-xs leading-relaxed text-foreground/50">
                We ask for your Instagram, employer and LinkedIn so our
                membership committee can review your application properly.
                We won&apos;t share your details with anyone outside Yuppie,
                and we&apos;ll only use them to assess your application and
                set up your membership if you&apos;re approved. Want your
                data deleted? Just email us.
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
        </div>
      </main>
    </div>
  );
}
