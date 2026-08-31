"use client";

import { ScrollRevealText, WordsPullUpMultiStyle } from "./primitives";

const HEADING_SEGMENTS = [
  { text: "Yuppie is a club,", className: "font-normal" },
  {
    text: "born from the refusal to stay in.",
    className: "italic [font-family:var(--font-instrument-serif)]",
  },
  {
    text: "We'll shape your social life so you don't have to.",
    className: "font-normal",
  },
];

const BODY =
  "We have partnered with over 42 restaurants, brands and hospitality outlets across the city and beyond, to create a unique list of events, access and discounts for our members.";

export function About() {
  return (
    <section className="bg-background px-4 py-20 sm:px-6 sm:py-28 md:py-32">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-10 rounded-[2rem] bg-background-muted px-6 py-12 text-center sm:px-10 sm:py-16 md:px-16 md:py-20">
        <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-foreground sm:text-xs">
          THE CLUB
        </span>

        <h2 className="mx-auto max-w-[840px] text-[clamp(2rem,4.4vw,4.25rem)] leading-[1.04] text-foreground">
          <WordsPullUpMultiStyle segments={HEADING_SEGMENTS} />
        </h2>

        <ScrollRevealText
          text={BODY}
          className="mx-auto max-w-2xl text-xs leading-relaxed text-foreground sm:text-sm md:text-base"
        />
      </div>
    </section>
  );
}
