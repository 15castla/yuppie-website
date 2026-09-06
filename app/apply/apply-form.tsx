"use client";

import {
  forwardRef,
  useEffect,
  useState,
  type ComponentProps,
  type FormEvent,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { Button } from "@/components/Button";
import {
  almarai,
  instrumentSerif,
} from "@/components/templates/creative-studio/fonts";
import { SiteNav } from "@/components/templates/creative-studio/site-nav";
import { submitApplication } from "./actions";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
  {
    developerTools: {
      assistant: {
        enabled: false,
      },
    },
  },
);

// Approximates the site's input/label styling inside Stripe's own
// Payment Element, which renders in an isolated iframe and can't be
// styled with regular classes.
const STRIPE_APPEARANCE = {
  variables: {
    colorPrimary: "#1b1512",
    colorBackground: "#F5F3E7",
    colorText: "#1b1512",
    colorDanger: "#b91c1c",
    fontFamily: "var(--font-almarai), ui-sans-serif, system-ui, sans-serif",
    borderRadius: "12px",
  },
  rules: {
    ".Input": {
      border: "2px solid rgba(27, 21, 18, 0.2)",
      padding: "14px 16px",
    },
    ".Input:focus": {
      border: "2px solid #1b1512",
      boxShadow: "none",
    },
    ".Label": {
      fontSize: "12px",
      fontWeight: "600",
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
      color: "rgba(27, 21, 18, 0.6)",
    },
  },
};

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

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Bridges the gap when confirmSetup ends up doing a full browser redirect
// (Apple Pay, some 3D Secure checks) instead of resolving in place — the
// form's in-memory state is gone on return, so the field values are
// stashed here just before confirmSetup and read back once we detect the
// redirect-return query params.
const DRAFT_STORAGE_KEY = "yuppie_apply_draft";

function readDraft(): Record<string, string> | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function clearRedirectReturnState() {
  sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  window.history.replaceState(null, "", "/apply");
}

// Keeps the phone field's actual text input looking identical to every
// other field on this form — react-phone-number-input renders this in
// place of its own default input, but doesn't get a say in its styling.
const PhoneNumberField = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  (props, ref) => (
    <input
      {...props}
      ref={ref}
      className="w-full rounded-xl border-2 border-foreground/20 bg-[#F5F3E7] px-4 py-3.5 text-base text-foreground placeholder:text-foreground/40 outline-none transition-colors focus:border-foreground"
    />
  ),
);
PhoneNumberField.displayName = "PhoneNumberField";

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

function ApplicationForm({ onSubmitted }: { onSubmitted: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const reduce = useReducedMotion();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{
    message: string;
    isDuplicate: boolean;
  } | null>(null);
  const [phone, setPhone] = useState<string | undefined>();

  // Handles the return trip when confirmSetup ended up redirecting the
  // browser away (Apple Pay, some 3D Secure checks) instead of resolving
  // in place. Stripe appends these query params on the way back.
  useEffect(() => {
    if (!stripe) return;

    const params = new URLSearchParams(window.location.search);
    const setupIntentClientSecret = params.get("setup_intent_client_secret");
    const redirectStatus = params.get("redirect_status");

    if (!setupIntentClientSecret || !redirectStatus) return;

    async function handleRedirectReturn() {
      try {
        if (redirectStatus === "failed") {
          setError({
            message: "Your payment method couldn't be confirmed. Please try again.",
            isDuplicate: false,
          });
          return;
        }

        if (redirectStatus !== "succeeded") return;

        setSubmitting(true);

        const { setupIntent, error: retrieveError } =
          await stripe!.retrieveSetupIntent(setupIntentClientSecret!);

        if (
          retrieveError ||
          !setupIntent ||
          typeof setupIntent.payment_method !== "string"
        ) {
          console.error("retrieveSetupIntent failed after redirect:", {
            retrieveError,
            setupIntent,
          });
          setError({
            message:
              "Something went wrong confirming your payment method. Please try again.",
            isDuplicate: false,
          });
          return;
        }

        const draft = readDraft();

        if (!draft) {
          setError({
            message:
              "Your payment method was confirmed, but we lost your application details on this device. Please fill in the form again.",
            isDuplicate: false,
          });
          return;
        }

        const formData = new FormData();
        for (const { name } of REQUIRED_FIELDS) {
          formData.set(name, draft[name] ?? "");
        }
        formData.set("stripe_payment_method_id", setupIntent.payment_method);

        const result = await submitApplication(formData);

        if (!result.success) {
          setError({ message: result.error, isDuplicate: Boolean(result.isDuplicate) });
          return;
        }

        onSubmitted();
      } catch (err) {
        console.error("Unexpected error handling redirect return:", err);
        const detail = err instanceof Error ? err.message : String(err);
        setError({
          message: `Something went wrong confirming your application: ${detail}. Please try again or contact us if this keeps happening.`,
          isDuplicate: false,
        });
      } finally {
        setSubmitting(false);
        clearRedirectReturnState();
      }
    }

    handleRedirectReturn();
    // Only re-run if the Stripe instance itself changes (e.g. becomes
    // available after initial load) — this reads a one-time URL param
    // and clears it, not something that should re-fire on other renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements) return;

    const formData = new FormData(event.currentTarget);
    // phone is now controlled React state rather than read live off the
    // DOM (react-phone-number-input doesn't leave a plain uncontrolled
    // <input>), so the form's own submitted value has to be synced in
    // explicitly before anything else reads it — including the
    // required-field check right below and the sessionStorage draft
    // built further down.
    formData.set("phone", phone ?? "");

    const missingField = REQUIRED_FIELDS.find(({ name }) => {
      const value = formData.get(name);
      return typeof value !== "string" || !value.trim();
    });

    if (missingField) {
      setError({ message: `${missingField.label} is required.`, isDuplicate: false });
      return;
    }

    const email = formData.get("email");
    const atIndex = typeof email === "string" ? email.indexOf("@") : -1;
    const emailValid =
      typeof email === "string" &&
      atIndex > 0 &&
      email.indexOf(".", atIndex) > atIndex;
    if (!emailValid) {
      setError({ message: "Please enter a valid email address.", isDuplicate: false });
      return;
    }

    if (!isValidPhoneNumber(phone ?? "")) {
      setError({
        message: "Please enter a valid phone number for the selected country",
        isDuplicate: false,
      });
      return;
    }

    const instagramUsernameRaw = formData.get("instagram_username");
    const instagramUsername =
      typeof instagramUsernameRaw === "string"
        ? instagramUsernameRaw.replace(/^@/, "")
        : "";
    if (!instagramUsername || !/^[A-Za-z0-9._]+$/.test(instagramUsername)) {
      setError({
        message:
          "Instagram username should only contain letters, numbers, periods and underscores.",
        isDuplicate: false,
      });
      return;
    }

    const linkedinUrl = formData.get("linkedin_url");
    const linkedinUrlError = {
      message:
        "LinkedIn URL should be a full link, like https://linkedin.com/in/yourname.",
      isDuplicate: false,
    };
    if (
      typeof linkedinUrl !== "string" ||
      !(linkedinUrl.startsWith("http://") || linkedinUrl.startsWith("https://"))
    ) {
      setError(linkedinUrlError);
      return;
    }
    try {
      new URL(linkedinUrl);
    } catch {
      setError(linkedinUrlError);
      return;
    }

    setError(null);
    setSubmitting(true);

    const draft: Record<string, string> = {};
    for (const { name } of REQUIRED_FIELDS) {
      draft[name] = (formData.get(name) as string) ?? "";
    }
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));

    try {
      const { error: stripeError, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: "https://clubyuppie.com/apply",
          payment_method_data: {
            billing_details: {
              address: {
                country: "GB",
              },
            },
          },
        },
        redirect: "if_required",
      });

      if (
        stripeError ||
        !setupIntent ||
        typeof setupIntent.payment_method !== "string"
      ) {
        console.error("Stripe confirmSetup failed:", { stripeError, setupIntent });
        setError({
          message:
            stripeError?.message ??
            "Something went wrong saving your card. Please try again.",
          isDuplicate: false,
        });
        return;
      }

      formData.set("stripe_payment_method_id", setupIntent.payment_method);

      const result = await submitApplication(formData);

      if (!result.success) {
        setError({ message: result.error, isDuplicate: Boolean(result.isDuplicate) });
        return;
      }

      sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      onSubmitted();
    } catch (err) {
      console.error("Unexpected error in handleSubmit:", err);
      const detail = err instanceof Error ? err.message : String(err);
      setError({
        message: `Something went wrong submitting your application: ${detail}. Please try again or contact us if this keeps happening.`,
        isDuplicate: false,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 20, boxShadow: CARD_SHADOW }}
      animate={{ opacity: 1, y: 0, boxShadow: CARD_SHADOW }}
      whileHover={{
        boxShadow: CARD_SHADOW_HOVER,
        transition: { duration: 0.3 },
      }}
      transition={{ duration: 0.6, delay: 0.6, ease: "easeOut" }}
      className="mt-8 w-full max-w-md rounded-2xl border border-foreground/10 bg-background-muted p-8 sm:p-12"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-7">
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
          <PhoneInput
            id="phone"
            name="phone"
            placeholder="e.g. 07123 456789"
            value={phone}
            onChange={setPhone}
            defaultCountry="GB"
            international
            inputComponent={PhoneNumberField}
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

        <div className="flex flex-col gap-2.5">
          <span className={labelClasses}>Payment details</span>
          <PaymentElement
            options={{
              layout: { type: "accordion", defaultCollapsed: true },
              wallets: { applePay: "auto", googlePay: "auto" },
              fields: {
                billingDetails: {
                  address: { country: "never", postalCode: "auto" },
                },
              },
            }}
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

        <Button
          type="submit"
          disabled={submitting}
          className="mt-2 disabled:transition-none"
        >
          {submitting ? "Submitting…" : "Submit application"}
        </Button>

        <p className="text-center text-xs leading-relaxed text-foreground-muted">
          We ask for your Instagram, employer and LinkedIn so our
          membership committee can review your application properly. Your
          card is saved securely with Stripe and isn&apos;t charged now,
          we only take payment if you&apos;re approved, and you can
          cancel any time after that. We won&apos;t share your details
          with anyone outside Yuppie. Want your data deleted? Just email
          us.
        </p>
      </form>
    </motion.div>
  );
}

export default function ApplyForm({
  clientSecret,
  setupError,
}: {
  clientSecret: string | null;
  setupError: string | null;
}) {
  const reduce = useReducedMotion();
  const fade = (delay: number) => ({
    initial: reduce ? false : { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: 0.8, delay, ease: EASE_OUT_EXPO },
  });

  const [submitted, setSubmitted] = useState(false);

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

            {clientSecret ? (
              <Elements
                stripe={stripePromise}
                options={{ clientSecret, appearance: STRIPE_APPEARANCE }}
              >
                <ApplicationForm onSubmitted={() => setSubmitted(true)} />
              </Elements>
            ) : (
              <p className="mt-8 max-w-md text-center text-sm font-medium text-red-700">
                {setupError}
              </p>
            )}

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
