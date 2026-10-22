"use client";

import { forwardRef, useEffect, useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
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
import { LockIcon, VelvetRopeDrawing } from "@/components/site/icons";
import { MessageSlot } from "@/components/StableLayout";
import { CONTACT_EMAIL } from "@/components/site/links";
import {
  CARD_CLASS,
  FIELD_ERROR_CLASS,
  INPUT_CLASS,
  INPUT_ERROR_CLASS,
  LABEL_CLASS,
  INNER_PAGE_H1_CLASS,
  PRIMARY_BUTTON_CLASS,
  HEADLINE_ACCENT_CLASS,
  SERIF_ACCENT_CLASS,
  SITE_CONTAINER_CLASS,
  SITE_FONT_STYLE,
  INNER_MAIN_PADDING_CLASS,
  INNER_MAIN_PADDING_TOP_CLASS,
  NO_BOX_CLASS,
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
  (props, ref) => (
    <input {...props} ref={ref} className={cn(INPUT_CLASS, props["aria-invalid"] && INPUT_ERROR_CLASS)} />
  ),
);
ApplyPhoneNumberField.displayName = "ApplyPhoneNumberField";

const FIELD_CLASS = "flex min-w-0 flex-col gap-2";

// Each of the form's three numbered cards: the shared card (24px top and
// bottom padding on phones), its shadow ending on the container edge
// (6px right margin on phones, 8px from md, RULE-05), the fields 18px
// apart in one column, two columns from md.
const STEP_CARD_CLASS = cn(
  CARD_CLASS,
  "mr-1.5 grid grid-cols-1 gap-y-[18px] max-md:py-6 md:mr-2 md:grid-cols-2 md:gap-x-5",
);

// The three cards' titles, in order: the cards' heads and, from 1024, the
// index beside them.
const APPLY_CARD_TITLES = ["About you", "For the committee", "Payment details"];

// A card's head: the serif numeral (as the site's other 1, 2, 3) and the
// title, 21px/800 on phones and 24px/800 from md (the perk-title tokens).
// The id names the card's group (aria-labelledby) and is where the index
// links land, with the card's top edge 128px down, level with the sticky
// summary. The head sits the 2px border plus the card's top padding below
// that edge, so it must stop 130px plus the padding down. The page's
// scroll-padding-top (96px from 768, app/globals.css, for the sticky
// header) already gives 96 of that, so the head's own margin is the
// other 34 plus the padding.
function StepCardHead({ step, icon }: { step: number; icon?: ReactNode }) {
  return (
    <h2
      id={`apply-step-${step}`}
      className="col-span-full m-0 flex items-baseline gap-3 lg:scroll-mt-[calc(34px+clamp(28px,3vw,40px))]"
    >
      <span aria-hidden className={cn(SERIF_ACCENT_CLASS, "min-w-4 text-[30px] leading-none md:text-[32px]")}>
        {step}
      </span>
      <span className="inline-flex items-center gap-2 text-[21px] font-extrabold leading-[1.2] tracking-[-0.01em] md:text-2xl">
        {APPLY_CARD_TITLES[step - 1]}
        {icon}
      </span>
    </h2>
  );
}

// In the order the fields appear on the page (on phones and desktop alike),
// which is the order the first invalid one is focused in.
const REQUIRED_FIELDS = [
  { name: "full_name", label: "Full name" },
  { name: "email", label: "Email" },
  { name: "phone", label: "Phone" },
  { name: "instagram_username", label: "Instagram username" },
  { name: "employer", label: "Employer" },
  { name: "role_title", label: "Role / job title" },
  { name: "linkedin_url", label: "LinkedIn URL" },
] as const;

type FieldName = (typeof REQUIRED_FIELDS)[number]["name"];
type FieldErrors = Partial<Record<FieldName, string>>;

function isFieldName(name: string): name is FieldName {
  return REQUIRED_FIELDS.some((field) => field.name === name);
}

const APPLY_STEPS = ["Apply", "Committee reviews", "Hear back by text and email"];

// The velvet rope's viewBox cropped to its ink (as the home page's closing
// band), so its post bases sit on the SVG's bottom edge.
const ROPE_VIEWBOX = "16.5 52.5 167 125";

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
  // Per-field validation messages, shown under the field they are about.
  // `error` above is only for the form-level failures (Stripe, the server).
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [phone, setPhone] = useState<string | undefined>();

  function clearFieldError(name: string) {
    if (!isFieldName(name)) return;
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  // The attributes a field carries while it has a message (the message's
  // announced text is the MessageSlot with the matching id).
  function invalidProps(name: FieldName) {
    return {
      "aria-invalid": fieldErrors[name] ? (true as const) : undefined,
      "aria-describedby": fieldErrors[name] ? `${name}-error` : undefined,
    };
  }

  function inputClass(name: FieldName) {
    return cn(INPUT_CLASS, fieldErrors[name] && INPUT_ERROR_CLASS);
  }

  function fieldError(name: FieldName) {
    return (
      <MessageSlot id={`${name}-error`} parentGap={8} className={FIELD_ERROR_CLASS}>
        {fieldErrors[name]}
      </MessageSlot>
    );
  }

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

    const form = event.currentTarget;
    const formData = new FormData(form);
    // phone is now controlled React state rather than read live off the
    // DOM (react-phone-number-input doesn't leave a plain uncontrolled
    // <input>), so the form's own submitted value has to be synced in
    // explicitly before anything else reads it, including the
    // required-field check right below and the sessionStorage draft
    // built further down.
    formData.set("phone", phone ?? "");

    // Every check runs and every failure is kept, so each field shows its own
    // message at once. A field that is empty gets "{label} is required.";
    // the format checks run on the ones that are not.
    const errors: FieldErrors = {};

    for (const { name, label } of REQUIRED_FIELDS) {
      const value = formData.get(name);
      if (typeof value !== "string" || !value.trim()) errors[name] = `${label} is required.`;
    }

    if (!errors.email) {
      const email = formData.get("email");
      const atIndex = typeof email === "string" ? email.indexOf("@") : -1;
      const emailValid =
        typeof email === "string" &&
        atIndex > 0 &&
        email.indexOf(".", atIndex) > atIndex;
      if (!emailValid) errors.email = "That email doesn’t look right.";
    }

    if (!errors.phone && !isValidPhoneNumber(phone ?? "")) {
      errors.phone = "That phone number doesn’t look right for the country you picked.";
    }

    if (!errors.instagram_username) {
      const instagramUsernameRaw = formData.get("instagram_username");
      const instagramUsername =
        typeof instagramUsernameRaw === "string"
          ? instagramUsernameRaw.replace(/^@/, "")
          : "";
      if (!instagramUsername || !/^[A-Za-z0-9._]+$/.test(instagramUsername)) {
        errors.instagram_username =
          "Instagram username should only contain letters, numbers, periods and underscores.";
      }
    }

    if (!errors.linkedin_url) {
      const linkedinUrl = formData.get("linkedin_url");
      let linkedinUrlValid =
        typeof linkedinUrl === "string" &&
        (linkedinUrl.startsWith("http://") || linkedinUrl.startsWith("https://"));
      if (linkedinUrlValid) {
        try {
          new URL(linkedinUrl as string);
        } catch {
          linkedinUrlValid = false;
        }
      }
      if (!linkedinUrlValid) {
        errors.linkedin_url =
          "LinkedIn URL should be a full link, like https://linkedin.com/in/yourname.";
      }
    }

    setError(null);
    setFieldErrors(errors);

    // Take the user to the first problem, in page order. Focusing it scrolls
    // it into view and raises the right keyboard on a phone.
    const firstInvalid = REQUIRED_FIELDS.find(({ name }) => errors[name]);
    if (firstInvalid) {
      form.querySelector<HTMLElement>(`#${firstInvalid.name}`)?.focus();
      return;
    }

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
    <form
      onSubmit={handleSubmit}
      onInput={(event) => clearFieldError((event.target as HTMLInputElement).name)}
      noValidate
      className="flex flex-col gap-6 md:gap-8"
    >
      {/* Three numbered cards at every width: 1 About you, 2 For the
          committee, 3 Payment details. The fields keep their order (the
          order REQUIRED_FIELDS focuses errors in). */}
      <div role="group" aria-labelledby="apply-step-1" className={STEP_CARD_CLASS}>
        <StepCardHead step={1} />
        <div className={cn(FIELD_CLASS, "md:col-span-2")}>
          <label htmlFor="full_name" className={LABEL_CLASS}>
            Full name
          </label>
          <input id="full_name" name="full_name" type="text" autoComplete="name" autoCapitalize="words" enterKeyHint="next" placeholder="e.g. Marcus Smith" {...invalidProps("full_name")} className={inputClass("full_name")} />
          {fieldError("full_name")}
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor="email" className={LABEL_CLASS}>
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" placeholder="e.g. marcus@example.com" {...invalidProps("email")} className={inputClass("email")} />
          {fieldError("email")}
        </div>
        <div className={cn(FIELD_CLASS, "site-phone")}>
          <label htmlFor="phone" className={LABEL_CLASS}>
            Phone
          </label>
          <PhoneInput
            id="phone"
            name="phone"
            autoComplete="tel"
            inputMode="tel"
            enterKeyHint="next"
            placeholder="e.g. 07123 456789"
            value={phone}
            onChange={(value) => {
              setPhone(value);
              clearFieldError("phone");
            }}
            defaultCountry="GB"
            international
            inputComponent={ApplyPhoneNumberField}
            {...invalidProps("phone")}
          />
          {fieldError("phone")}
        </div>
      </div>

      <div role="group" aria-labelledby="apply-step-2" className={STEP_CARD_CLASS}>
        <StepCardHead step={2} />
        {/* Why we ask and who sees the answers, beside the questions they
            are about (both moved up from the small print under the
            button): 6px under the head on phones, 8px from md. */}
        <p className="col-span-full m-0 -mt-3 text-sm leading-[1.45] text-site-muted md:-mt-2.5 md:mb-1 md:max-w-[520px] md:text-[15px] md:leading-normal">
          We ask for your Instagram, employer and LinkedIn so our membership
          committee can review your application properly. We won’t share
          your details with anyone outside Club Yuppie.
        </p>
        <div className={cn(FIELD_CLASS, "md:col-span-2")}>
          <label htmlFor="instagram_username" className={LABEL_CLASS}>
            Instagram username
          </label>
          <input id="instagram_username" name="instagram_username" type="text" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" placeholder="@yourhandle" {...invalidProps("instagram_username")} className={inputClass("instagram_username")} />
          {fieldError("instagram_username")}
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor="employer" className={LABEL_CLASS}>
            Employer
          </label>
          <input id="employer" name="employer" type="text" autoComplete="organization" autoCapitalize="words" enterKeyHint="next" placeholder="e.g. ABC LLP" {...invalidProps("employer")} className={inputClass("employer")} />
          {fieldError("employer")}
        </div>
        <div className={FIELD_CLASS}>
          <label htmlFor="role_title" className={LABEL_CLASS}>
            Role / job title
          </label>
          <input id="role_title" name="role_title" type="text" autoComplete="organization-title" autoCapitalize="words" enterKeyHint="next" placeholder="e.g. Associate" {...invalidProps("role_title")} className={inputClass("role_title")} />
          {fieldError("role_title")}
        </div>
        {/* Full width from md, so its placeholder is never clipped. */}
        <div className={cn(FIELD_CLASS, "md:col-span-2")}>
          <label htmlFor="linkedin_url" className={LABEL_CLASS}>
            LinkedIn URL
          </label>
          <input id="linkedin_url" name="linkedin_url" type="url" autoComplete="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" placeholder="https://linkedin.com/in/yourname" {...invalidProps("linkedin_url")} className={inputClass("linkedin_url")} />
          {fieldError("linkedin_url")}
        </div>
      </div>

      <div role="group" aria-labelledby="apply-step-3" className={STEP_CARD_CLASS}>
        <StepCardHead step={3} icon={<LockIcon />} />
        {/* The price again where the card goes in (from the intro): 6px
            under the head on phones, 8px from md; the note 4px under it;
            the card block 18px under the note. */}
        <p className="col-span-full m-0 -mt-3 text-base font-bold leading-[1.35] md:-mt-2.5 md:text-[17px]">
          £10 a month. Cancel any time.
        </p>
        <p className="col-span-full m-0 -mt-3.5 text-sm leading-[1.45] text-site-muted md:text-[15px] md:leading-normal">
          You won’t be charged until your application is approved.
        </p>
        <div className="col-span-full">
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
            error.isDuplicate ? "text-foreground" : "text-[#B3261E]",
          )}
        >
          {error.message}
        </p>
      )}

      {/* 32px under card 3 (or under the error line) at every width. */}
      <button type="submit" disabled={submitting} className={cn(PRIMARY_BUTTON_CLASS, "w-full max-md:mt-2")}>
        {submitting ? "Submitting…" : "Send application"}
      </button>

      <p className="m-0 -mt-2 text-center text-[13px] md:-mt-4">
        By applying, you agree to our{" "}
        <Link href="/privacy" className={TEXT_LINK_CLASS}>
          Privacy policy
        </Link>
        .
      </p>

      {/* One small print at every width: the why-we-ask and the
          won't-share sentences have moved up into card 2. 16px under
          the button for the privacy line, 12px more for this. */}
      <p className="m-0 -mt-3 text-[13px] leading-[1.55] text-site-muted md:-mt-5 md:max-w-[560px]">
        Your card is saved securely with Stripe and isn’t charged now:
        we only take payment if you’re approved, and you can
        cancel any time after that. Want your data deleted? Just email
        us.
      </p>
    </form>
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
  const thanksHeadingRef = useRef<HTMLHeadingElement>(null);

  // When the form is replaced by the thank-you view, start at the top of it
  // and move focus to its heading. The new view is shorter than the form,
  // so otherwise the browser keeps the user near the bottom.
  useEffect(() => {
    if (!submitted) return;
    window.scrollTo(0, 0);
    thanksHeadingRef.current?.focus({ preventScroll: true });
  }, [submitted]);

  return (
    <div className={cn(almarai.variable, instrumentSerif.variable, SITE_PAGE_CLASS)} style={SITE_FONT_STYLE}>
      {submitted ? (
        // One 3px rule under the whole view, at every width, and the rope
        // standing on it: you are outside the rope until the committee says
        // yes. Phones: the rope is centred 24px under the button. From md:
        // words on the left, the rope on the right edge (as the home page's
        // closing band), and only the words have bottom padding.
        <section className="border-b-[3px] border-foreground">
          <main
            className={cn(
              SITE_CONTAINER_CLASS,
              INNER_MAIN_PADDING_TOP_CLASS,
              "flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-x-12",
            )}
          >
            <div className="flex flex-col gap-5 md:gap-7 md:pb-[clamp(56px,6vw,88px)]">
              <h1 ref={thanksHeadingRef} tabIndex={-1} className={cn(INNER_PAGE_H1_CLASS, "outline-none")}>
                Thanks for applying.{" "}
                <br />
                <span className={HEADLINE_ACCENT_CLASS}>We’ll be in touch.</span>
              </h1>
              <p className="m-0 max-w-[560px] text-[17px] leading-normal md:text-[19px]">
                Your application is with our membership committee now. If
                you’re in, you’ll hear from us by text and email.
              </p>
              {/* Where you are now: 1 done, 2 current, 3 next. Phones: one
                  row of three. Desktop: three columns. */}
              <StepRow steps={APPLY_STEPS} current={1} className="md:hidden" />
              <div className="hidden md:mt-1 md:block">
                <StepList steps={APPLY_STEPS} current={1} className="md:max-w-[560px]" />
              </div>
              <div>
                <Link href="/" className={cn(PRIMARY_BUTTON_CLASS, "w-full md:w-auto")}>
                  Back to home
                </Link>
              </div>
            </div>
            <div className="flex justify-center pt-6 md:justify-end md:pt-0">
              <VelvetRopeDrawing
                size={300}
                viewBox={ROPE_VIEWBOX}
                width={300}
                height={(300 * 125) / 167}
                className="block h-auto w-[170px] md:w-[clamp(200px,24vw,300px)]"
              />
            </div>
          </main>
        </section>
      ) : (
        // The deal and the way in for members first, then the three cards.
        // The 1, 2, 3 of what happens next is on the sent view. One column
        // up to 1023. From 1024 (lg, the one annotated RULE-45 exception):
        // the summary on the left, sticky 128px from the top (the 94px bar
        // plus 34), beside the cards in a column capped at 600px. It only
        // sticks in a window at least 700px tall: the summary is up to 556px
        // (at 1060 wide), so in a shorter window (a 1366x768 laptop shows
        // about 660) a stuck summary would hide "Log in" until the end of
        // the form. There it scrolls with the page instead.
        <main
          className={cn(
            SITE_CONTAINER_CLASS,
            INNER_MAIN_PADDING_CLASS,
            "flex flex-col gap-[22px] md:gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,600px)] lg:items-start lg:gap-x-[clamp(48px,6vw,80px)]",
          )}
        >
          <div className="flex min-w-0 flex-col gap-[18px] md:gap-6 lg:top-32 lg:self-start [@media(min-width:1024px)_and_(min-height:700px)]:sticky">
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
            {/* The deal, in bold on arrival (the perk-title size, 21px on
                phones and 24px from md), then the committee line. */}
            <div>
              <p className="m-0 text-[21px] font-extrabold leading-[1.2] tracking-[-0.01em] [text-wrap:balance] md:text-2xl">
                £10 a month. Cancel any time.
              </p>
              <p className="m-0 mt-1.5 text-base leading-[1.45] md:mt-2 md:max-w-[440px] md:text-[19px] md:leading-normal">
                Every application is reviewed by our membership committee
                before you’re approved.
              </p>
            </div>
            {/* From 1024: a map of the form, the cards' numerals and titles
                on 1.5px rules; each row jumps to its card. Keyboard focus
                underlines the title (RULE-35), never a box. Only when the
                form is there: if card setup fails there are no cards. */}
            {clientSecret && (
              <ol className="m-0 mt-2 hidden max-w-[440px] list-none border-b-[1.5px] border-foreground p-0 lg:block">
                {APPLY_CARD_TITLES.map((title, index) => (
                  <li key={title}>
                    <a
                      href={`#apply-step-${index + 1}`}
                      className={cn(
                        "group flex min-h-[52px] items-baseline gap-3.5 border-t-[1.5px] border-foreground py-3 text-foreground no-underline hover:opacity-70",
                        NO_BOX_CLASS,
                      )}
                    >
                      <span aria-hidden className={cn(SERIF_ACCENT_CLASS, "min-w-4 text-[26px] leading-none")}>
                        {index + 1}
                      </span>
                      <span className="text-base font-bold group-focus-visible:underline group-focus-visible:decoration-[3px] group-focus-visible:underline-offset-[6px]">
                        {title}
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            )}
            {/* For a member who tapped Apply by mistake. The link box is 44px
                tall; the negative margins keep that box 10px from the deal
                and from card 1 on phones. */}
            <p className="m-0 -mt-2 -mb-3 text-[15px] md:mb-0">
              Already a member?{" "}
              <Link href="/member-login" className={cn(TEXT_LINK_CLASS, "inline-flex min-h-11 items-center")}>
                Log in
              </Link>
            </p>
          </div>

          <div className="min-w-0">
            {clientSecret ? (
              <Elements
                stripe={stripePromise}
                options={{ clientSecret, appearance: APPLY_STRIPE_APPEARANCE }}
              >
                <ApplicationForm onSubmitted={() => setSubmitted(true)} />
              </Elements>
            ) : (
              <p role="alert" className={cn(CARD_CLASS, "m-0 mr-1.5 text-[15px] font-bold text-[#B3261E] md:mr-2")}>
                {setupError}
              </p>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
