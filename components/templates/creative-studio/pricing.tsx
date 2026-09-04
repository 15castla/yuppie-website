"use client";

import Link from "next/link";

import { WordsPullUpMultiStyle } from "./primitives";

const HEADING_SEGMENTS = [
  { text: "One membership." },
  {
    text: "No catch.",
    className: "italic [font-family:var(--font-instrument-serif)]",
  },
];

const MONTHLY_PRICE = "£10";

export function Pricing() {
  return (
    <section className="relative overflow-hidden bg-background px-4 pb-20 sm:px-6 sm:pb-28 md:pb-32">
      <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-6">
          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-foreground sm:text-xs">
            PRICING
          </span>

          <h2 className="text-xl leading-[0.95] text-foreground sm:text-2xl sm:leading-[0.9] md:text-3xl lg:text-4xl font-extrabold">
            <WordsPullUpMultiStyle segments={HEADING_SEGMENTS} />
          </h2>
        </div>

        <p className="max-w-md text-sm text-foreground-muted sm:text-base">
          Cancel whenever life gets too fun.
        </p>

        <div className="mt-6 w-full max-w-md rounded-2xl border border-foreground/10 bg-background-muted p-8 text-left sm:p-10">
          <p className="text-foreground">
            <span className="text-4xl font-extrabold sm:text-5xl">
              {MONTHLY_PRICE}
            </span>
            <span className="text-base text-foreground-muted">/month</span>
          </p>

          <p className="mt-4 text-sm text-foreground-muted sm:text-base">
            Full access to every event, discount and door across London.
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
