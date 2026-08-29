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

// £10/month annualizes to £120 — £99/year against that is a 17.5% saving,
// not the reference's 40%. Rounded to the nearest whole percent rather than
// left at the reference's (wrong, for these numbers) figure.
const MONTHLY_PRICE = "£10";
const ANNUAL_PRICE = "£99";
const SAVE_PERCENT = "18%";

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

        {/* appearance-none + border-0 + bg-transparent + p-0 on every native
            <button>: browser UA stylesheets give buttons their own default
            font, padding and border independent of surrounding styles (the
            classic "buttons don't inherit font-family" gotcha) — resetting
            all of it explicitly, rather than trusting inheritance/Preflight
            alone, is what actually guarantees these render in Almarai at
            the intended size instead of silently falling back to the
            system UI font, which was also making this row's width
            (and therefore the gap-4 spacing) unpredictable enough to
            overlap depending on the fallback font's metrics. shrink-0 +
            whitespace-nowrap on every child stops flex from ever
            compressing one element into another as a second line of
            defense. */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setAnnual(false)}
            className={`shrink-0 appearance-none whitespace-nowrap border-0 bg-transparent p-0 font-[inherit] text-sm font-medium transition-colors sm:text-base ${
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
            className="relative h-7 w-12 shrink-0 appearance-none rounded-full border-0 bg-foreground p-0 font-[inherit] transition-colors"
          >
            {/* Explicit left-1/left-6 rather than translate-x-*: the
                translate-x utilities were picking up an extra, unrelated
                left offset from somewhere in this Tailwind build (visible
                via getComputedStyle even with no left-* class present, and
                additive with the translate itself), pushing the thumb ~20px
                past the track's right edge and on top of the "Annual"
                label. Plain left positioning is unambiguous and sidesteps
                it entirely — verified the thumb now stays fully inside the
                track in both states. */}
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-background-muted transition-[left] duration-300 ${
                annual ? "left-6" : "left-1"
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => setAnnual(true)}
            className={`shrink-0 appearance-none whitespace-nowrap border-0 bg-transparent p-0 font-[inherit] text-sm font-medium transition-colors sm:text-base ${
              annual ? "text-foreground" : "text-foreground-muted"
            }`}
          >
            Annual
          </button>

          {/* Same always-mounted/toggle-visibility pattern as the "Billed in
              one annual payment" caption below — only relevant once Annual
              is selected, but conditionally mounting it would change this
              row's total width and shift the centered Monthly/toggle/Annual
              group sideways every time it appeared or disappeared. */}
          <span
            className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-foreground/20 bg-background-muted px-3 py-1 text-xs font-medium text-foreground ${
              annual ? "visible" : "invisible"
            }`}
            aria-hidden={!annual}
          >
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

          {/* Always mounted (never conditionally rendered) so it always
              reserves its own line — toggling opacity/visibility instead of
              mounting/unmounting is what keeps the card a fixed height
              across both states; the previous conditional-render version
              made the card grow/shrink by this line's height every time
              the toggle switched. */}
          <p
            className={`mt-4 text-center text-xs text-foreground-muted ${
              annual ? "visible" : "invisible"
            }`}
            aria-hidden={!annual}
          >
            Billed in one annual payment.
          </p>
        </div>
      </div>
    </section>
  );
}
