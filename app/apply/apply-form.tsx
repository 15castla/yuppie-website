"use client";

import { forwardRef, useEffect, useState, type ComponentProps, type FormEvent } from "react";
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

import { cn } from "@/lib/utils";
import {
  almarai,
  instrumentSerif,
} from "@/components/templates/creative-studio/fonts";
import { StepList, StepRow } from "@/components/site/step-list";
import { LockIcon } from "@/components/site/icons";
import { CONTACT_EMAIL } from "@/components/site/links";
import {
  CARD_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  INNER_PAGE_H1_CLASS,
  PRIMARY_BUTTON_CLASS,
  HEADLINE_ACCENT_CLASS,
  SITE_CONTAINER_CLASS,
  SITE_FONT_STYLE,
  INNER_MAIN_PADDING_CLASS,
  SITE_PAGE_CLASS,
  TEXT_LINK_CLASS,
} from "@/components/site/ui";
import { STRIPE_APPEARANCE, getStripeErrorMessage } from "@/lib/stripe-ui";
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

const FALLBACK_ERROR = "We couldn’t save your card. Have another go.";

// The shared Stripe look (lib/stripe-ui.ts, also used by the members'
// event payment form) with this page's 1.5px ink borders and 14px bold
// labels.
const APPLY_STRIPE_APPEARANCE = {
  ...STRIPE_APPEARANCE,
  rules: {
    ...STRIPE_APPEARANCE.rules,
    ".Input": {
      border: "1.5px solid #1b1512",
      padding: "14px 16px",
    },
    ".Input:focus": {
      border: "1.5px solid #1b1512",
      boxShadow: "0 0 0 2px #1b1512",
    },
    ".Label": {
      fontSize: "14px",
      fontWeight: "700",
      color: "#1b1512",
    },
  },
};

// The phone number's own input, in this page's field style. (The shared
// components/PhoneNumberField.tsx keeps the members profile editor's.)
const ApplyPhoneNumberField = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  (props, ref) => <input {...props} ref={ref} className={INPUT_CLASS} />,
);
ApplyPhoneNumberField.displayName = "ApplyPhoneNumberField";

const FIELD_CLASS = "flex min-w-0 flex-col gap-2";

const REQUIRED_FIELDS: { name: string; label: string }[] = [
  { name: "full_name", label: "Full name" },
  { name: "email", label: "Email" },
  { name: "phone", label: "Phone" },
  { name: "instagram_username", label: "Instagram username" },
  { name: "employer", label: "Employer" },
  { name: "role_title", label: "Role / job title" },
  { name: "linkedin_url", label: "LinkedIn URL" },
];

const APPLY_STEPS = ["Apply", "Committee reviews", "Hear back by text and email"];

// Bridges the gap when confirmSetup ends up doing a full browser redirect
// (Apple Pay, some 3D Secure checks) instead of resolving in place: the
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

function ApplicationForm({ onSubmitted }: { onSubmitted: () => void }) {
  const stripe = useStripe();
  const elements = useElements();

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
        if (redirectStatus !== "succeeded" && redirectStatus !== "failed") return;

        setSubmitting(true);

        const { setupIntent, error: retrieveError } =
          await stripe!.retrieveSetupIntent(setupIntentClientSecret!);

        if (redirectStatus === "failed") {
          // Retrieved (rather than assumed generic) so the specific
          // reason on the SetupIntent's own last_setup_error, if
          // there is one, can be shown instead of a one-size-fits-all
          // message regardless of why it actually failed.
          setError({
            message: getStripeErrorMessage(setupIntent?.last_setup_error, FALLBACK_ERROR),
            isDuplicate: false,
          });
          return;
        }

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
            message: "We couldn’t confirm your card. Have another go.",
            isDuplicate: false,
          });
          return;
        }

        const draft = readDraft();

        if (!draft) {
          setError({
            message:
              "Your card is confirmed, but we lost your application details on this device. Fill the form in again.",
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
        setError({
          message: `We couldn’t confirm your application. Have another go, or email ${CONTACT_EMAIL} if it keeps happening.`,
          isDuplicate: false,
        });
      } finally {
        setSubmitting(false);
        clearRedirectReturnState();
      }
    }

    handleRedirectReturn();
    // Only re-run if the Stripe instance itself changes (e.g. becomes
    // available after initial load). This reads a one-time URL param
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
    // explicitly before anything else reads it, including the
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
      setError({ message: "That email doesn’t look right.", isDuplicate: false });
      return;
    }

    if (!isValidPhoneNumber(phone ?? "")) {
      setError({
        message: "That phone number doesn’t look right for the country you picked.",
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
          message: getStripeErrorMessage(stripeError, FALLBACK_ERROR),
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
      setError({
        message: `We couldn’t send your application. Have another go, or email ${CONTACT_EMAIL} if it keeps happening.`,
        isDuplicate: false,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={cn(CARD_CLASS, "max-md:py-6")}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-[18px] md:gap-[22px]">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-x-5 gap-y-[18px]">
          <div className={FIELD_CLASS}>
            <label htmlFor="full_name" className={LABEL_CLASS}>
              Full name
            </label>
            <input id="full_name" name="full_name" type="text" placeholder="e.g. Marcus Smith" className={INPUT_CLASS} />
          </div>
          <div className={FIELD_CLASS}>
            <label htmlFor="email" className={LABEL_CLASS}>
              Email
            </label>
            <input id="email" name="email" type="email" placeholder="e.g. marcus@example.com" className={INPUT_CLASS} />
          </div>
          <div className={cn(FIELD_CLASS, "site-phone")}>
            <label htmlFor="phone" className={LABEL_CLASS}>
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
              inputComponent={ApplyPhoneNumberField}
            />
          </div>
          <div className={FIELD_CLASS}>
            <label htmlFor="instagram_username" className={LABEL_CLASS}>
              Instagram username
            </label>
            <input id="instagram_username" name="instagram_username" type="text" placeholder="@yourhandle" className={INPUT_CLASS} />
          </div>
          <div className={FIELD_CLASS}>
            <label htmlFor="employer" className={LABEL_CLASS}>
              Employer
            </label>
            <input id="employer" name="employer" type="text" placeholder="e.g. ABC LLP" className={INPUT_CLASS} />
          </div>
          <div className={FIELD_CLASS}>
            <label htmlFor="role_title" className={LABEL_CLASS}>
              Role / job title
            </label>
            <input id="role_title" name="role_title" type="text" placeholder="e.g. Associate" className={INPUT_CLASS} />
          </div>
        </div>

        <div className={FIELD_CLASS}>
          <label htmlFor="linkedin_url" className={LABEL_CLASS}>
            LinkedIn URL
          </label>
          <input id="linkedin_url" name="linkedin_url" type="url" placeholder="https://linkedin.com/in/yourname" className={INPUT_CLASS} />
        </div>

        {/* Phones: its own section, under a 1.5px rule with a 17px heading. */}
        <div className="flex flex-col gap-2 pt-1 md:pt-1.5 max-md:mt-1 max-md:gap-0 max-md:border-t-[1.5px] max-md:border-foreground max-md:pt-5">
          <span className={cn(LABEL_CLASS, "inline-flex items-center gap-2 max-md:text-[17px] max-md:font-extrabold")}>
            <LockIcon />
            Payment details
          </span>
          <p className="m-0 text-sm leading-[1.45] text-site-muted max-md:mt-1.5 max-md:mb-3">
            You won&apos;t be charged until your application is approved.
          </p>
          <div className="mt-1 max-md:mt-0">
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
        </div>

        {error && (
          <p
            role="alert"
            className={cn(
              "m-0 text-sm font-bold",
              error.isDuplicate ? "text-foreground" : "text-red-700",
            )}
          >
            {error.message}
          </p>
        )}

        <button type="submit" disabled={submitting} className={cn(PRIMARY_BUTTON_CLASS, "w-full")}>
          {submitting ? "Submitting…" : "Send application"}
        </button>

        <p className="m-0 text-center text-[13px]">
          By applying, you agree to our{" "}
          <Link href="/privacy" className={TEXT_LINK_CLASS}>
            Privacy policy
          </Link>
          .
        </p>

        <p className="m-0 text-[13px] leading-[1.55] text-site-muted">
          We ask for your Instagram, employer and LinkedIn so our
          membership committee can review your application properly. Your
          card is saved securely with Stripe and isn’t charged now:
          we only take payment if you’re approved, and you can
          cancel any time after that. We won’t share your details
          with anyone outside Club Yuppie. Want your data deleted? Just email
          us.
        </p>
      </form>
    </div>
  );
}

export default function ApplyForm({
  clientSecret,
  setupError,
}: {
  clientSecret: string | null;
  setupError: string | null;
}) {
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className={cn(almarai.variable, instrumentSerif.variable, SITE_PAGE_CLASS)} style={SITE_FONT_STYLE}>
      {submitted ? (
        <main className={cn(SITE_CONTAINER_CLASS, INNER_MAIN_PADDING_CLASS, "flex flex-col gap-5 md:gap-7")}>
          <h1 className={INNER_PAGE_H1_CLASS}>
            Thanks for applying.{" "}
            <span className={HEADLINE_ACCENT_CLASS}>We&apos;ll be in touch.</span>
          </h1>
          <p className="m-0 max-w-[560px] text-[17px] leading-normal md:text-[19px]">
            Your application is with our membership committee now. If
            you’re in, you’ll hear from us by text and email.
          </p>
          <div>
            <Link href="/" className={cn(PRIMARY_BUTTON_CLASS, "w-full md:w-auto")}>
              Back to home
            </Link>
          </div>
        </main>
      ) : (
        <main
          className={cn(
            SITE_CONTAINER_CLASS,
            INNER_MAIN_PADDING_CLASS,
            "flex flex-col gap-[22px] md:flex-row md:flex-wrap md:items-start md:gap-x-20 md:gap-y-14",
          )}
        >
          <div className="flex min-w-0 flex-col gap-[18px] md:flex-[1_1_420px] md:gap-7">
            <h1 className={cn(INNER_PAGE_H1_CLASS, "flex flex-wrap items-baseline gap-x-[0.22em]")}>
              <span>Apply to</span>
              <Image
                src="/yuppie_logo_forte_forward.png"
                alt="Club Yuppie"
                width={1942}
                height={641}
                loading="eager"
                className="mt-[0.08em] block h-[0.95em] w-auto self-center"
              />
            </h1>
            <p className="m-0 text-[17px] leading-normal md:max-w-[440px] md:text-[19px]">
              £10 a month. Cancel any time. Every application is
              reviewed by our membership committee before you&apos;re
              approved.
            </p>
            {/* Desktop: the stacked steps. Phones: one row of three. */}
            <div className="hidden md:block">
              <StepList steps={APPLY_STEPS} className="md:mt-2 md:max-w-[520px]" />
            </div>
            <StepRow steps={APPLY_STEPS} className="mt-3.5 md:hidden" />
          </div>

          <div className="mt-3.5 mr-1.5 flex min-w-0 flex-col gap-6 md:mt-0 md:mr-0 md:max-w-[600px] md:flex-[1_1_520px]">
            {clientSecret ? (
              <Elements
                stripe={stripePromise}
                options={{ clientSecret, appearance: APPLY_STRIPE_APPEARANCE }}
              >
                <ApplicationForm onSubmitted={() => setSubmitted(true)} />
              </Elements>
            ) : (
              <p role="alert" className={cn(CARD_CLASS, "m-0 text-[15px] font-bold text-red-700")}>
                {setupError}
              </p>
            )}

            <p className="m-0 text-center text-[15px]">
              Already a member?{" "}
              <Link href="/member-login" className={cn(TEXT_LINK_CLASS, "inline-flex min-h-11 items-center")}>
                Log in
              </Link>
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
