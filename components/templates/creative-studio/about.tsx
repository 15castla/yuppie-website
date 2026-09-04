"use client";

import { ScrollRevealText, WordsPullUpMultiStyle } from "./primitives";

const HEADING_SEGMENTS = [
  { text: "Yuppie is a club," },
  {
    text: "born from the refusal to stay in.",
    className: "italic [font-family:var(--font-instrument-serif)]",
  },
];

const BODY =
  "An app full of things worth doing, and people actually worth meeting, every time you show up.";

export function About() {
  return (
    <section className="bg-background px-4 pt-20 pb-20 sm:px-6 sm:pt-0 sm:pb-28 md:pb-32">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-8 rounded-[2rem] bg-background-muted px-6 pt-8 pb-12 text-center sm:px-10 sm:pb-16 md:px-16 md:pb-20">
        <div className="flex flex-col items-center gap-6">
          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-foreground sm:text-xs">
            THE CLUB
          </span>

          <h2 className="mx-auto max-w-[840px] text-[clamp(2rem,4.4vw,4.25rem)] font-extrabold leading-[1.04] text-foreground">
            <WordsPullUpMultiStyle segments={HEADING_SEGMENTS} />
          </h2>
        </div>

        <ScrollRevealText
          text={BODY}
          className="mx-auto max-w-2xl text-xs leading-relaxed text-foreground sm:text-sm md:text-base"
        />
      </div>
    </section>
  );
}
