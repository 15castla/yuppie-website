"use client";

import { ScrollRevealText, WordsPullUpMultiStyle } from "./primitives";

const HEADING_SEGMENTS = [
  { text: "Yuppie is a club,", className: "font-normal" },
  {
    text: "born from the refusal to stay in.",
    className: "italic [font-family:var(--font-instrument-serif)]",
  },
  {
    text: "We shape every part of a social life, dinners, wellness, sport, experiences, growth, into one club worth showing up for.",
    className: "font-normal",
  },
];

const BODY =
  "We have partnered with over 42 restaurants, brands and hospitality outlets across the city and beyond, to create a unique list of events, access and discounts for our members.";

export function About() {
  return (
    <section className="bg-background px-4 py-20 sm:px-6 sm:py-28 md:py-32">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-10 rounded-[2rem] bg-background-muted px-6 py-16 text-center sm:px-10 sm:py-20 md:px-16 md:py-24">
        <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-foreground sm:text-xs">
          THE CLUB
        </span>

        <h2 className="mx-auto max-w-3xl text-3xl leading-[0.95] text-foreground sm:text-4xl sm:leading-[0.9] md:text-5xl lg:text-6xl xl:text-7xl">
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
