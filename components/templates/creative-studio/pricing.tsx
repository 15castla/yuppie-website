"use client";

import Link from "next/link";

import { WordsPullUpMultiStyle } from "./primitives";

const HEADING_SEGMENTS = [
  { text: "Pricing that makes" },
  {
    text: "sense.",
    className: "italic [font-family:var(--font-instrument-serif)]",
  },
];

const MONTHLY_PRICE = "£10";

export function Pricing() {
  return (
    <section className="relative overflow-hidden bg-background px-4 pt-20 pb-20 sm:px-6 sm:pt-0 sm:pb-28 md:pb-32">
      <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-foreground sm:text-xs">
          PRICING
        </span>

        <h2 className="text-3xl font-extrabold leading-[0.95] text-foreground sm:text-4xl sm:leading-[0.9] md:text-5xl">
          <WordsPullUpMultiStyle segments={HEADING_SEGMENTS} />
        </h2>

        <p className="max-w-md text-sm text-foreground-muted sm:text-base">
          One plan. Every perk. Cancel whenever life gets too fun.
        </p>

        <div className="mt-6 w-full max-w-md rounded-2xl border border-foreground/10 bg-background-muted p-8 text-left sm:p-10">
          <p className="text-foreground">
            <span className="text-4xl font-extrabold sm:text-5xl">
              {MONTHLY_PRICE}
            </span>
            <span className="text-base text-foreground-muted">/month</span>
          </p>

          <p className="mt-4 text-sm text-foreground-muted sm:text-base">
            The ultimate membership for Yuppie&apos;s private social club
          </p>

          <Link
            href="/apply"
            className="mt-8 flex w-full items-center justify-center rounded-full bg-background py-3 text-sm font-bold text-foreground transition-transform duration-300 hover:scale-[1.02] sm:text-base"
          >
            Membership
          </Link>
        </div>
      </div>
    </section>
  );
}
