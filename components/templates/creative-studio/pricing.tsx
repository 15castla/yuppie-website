"use client";

import { useState } from "react";
import Link from "next/link";

import { NoiseOverlay, WordsPullUpMultiStyle } from "./primitives";

const HEADING_SEGMENTS = [
  { text: "Pricing that makes", className: "font-normal" },
  {
    text: "sense.",
    className: "italic [font-family:var(--font-instrument-serif)]",
  },
];

// £10/month annualizes to £120 — £100/year against that is a 16.67% saving,
// not the reference's 40%. Rounded to the nearest whole percent rather than
// left at the reference's (wrong, for these numbers) figure.
const MONTHLY_PRICE = "£10";
const ANNUAL_PRICE = "£100";
const SAVE_PERCENT = "17%";

export function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <section className="relative overflow-hidden bg-background px-4 py-20 sm:px-6 sm:py-28 md:py-32">
      <NoiseOverlay variant="bg" className="opacity-[0.12]" />

      <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <span className="inline-flex items-center rounded-full border border-foreground/20 px-4 py-1.5 text-xs font-medium text-foreground">
          Pricing
        </span>

        <h2 className="text-3xl leading-[0.95] text-foreground sm:text-4xl sm:leading-[0.9] md:text-5xl">
          <WordsPullUpMultiStyle segments={HEADING_SEGMENTS} />
        </h2>

        <p className="max-w-md text-sm text-foreground-muted sm:text-base">
          We&apos;ve designed our pricing in a way that it scales with your
          business.
        </p>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setAnnual(false)}
            className={`text-sm font-medium transition-colors sm:text-base ${
              annual ? "text-foreground-muted" : "text-foreground"
            }`}
          >
            Monthly
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={annual}
            aria-label="Toggle monthly or annual pricing"
            onClick={() => setAnnual((prev) => !prev)}
            className="relative h-7 w-12 shrink-0 rounded-full bg-foreground transition-colors"
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-background-muted transition-transform duration-300 ${
                annual ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => setAnnual(true)}
            className={`text-sm font-medium transition-colors sm:text-base ${
              annual ? "text-foreground" : "text-foreground-muted"
            }`}
          >
            Annual
          </button>

          <span className="inline-flex items-center rounded-full border border-foreground/20 bg-background-muted px-3 py-1 text-xs font-medium text-foreground">
            Save {SAVE_PERCENT}
          </span>
        </div>

        <div className="mt-6 w-full max-w-md rounded-2xl border border-foreground/10 bg-background-muted p-8 text-left sm:p-10">
          <p className="text-foreground">
            <span className="text-4xl font-medium sm:text-5xl">
              {annual ? ANNUAL_PRICE : MONTHLY_PRICE}
            </span>
            <span className="text-base text-foreground-muted">
              /{annual ? "year" : "month"}
            </span>
          </p>

          <p className="mt-4 text-sm text-foreground-muted sm:text-base">
            The ultimate membership for Yuppie&apos;s private social club
          </p>

          <Link
            href="/apply"
            className="mt-8 flex w-full items-center justify-center rounded-full bg-background py-3 text-sm font-medium text-foreground transition-transform duration-300 hover:scale-[1.02] sm:text-base"
          >
            Membership
          </Link>

          {annual ? (
            <p className="mt-4 text-center text-xs text-foreground-muted">
              Billed in one annual payment.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
