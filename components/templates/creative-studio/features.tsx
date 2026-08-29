"use client";

import * as React from "react";
import { Calendar, Key, Percent, type LucideIcon } from "lucide-react";
import { motion, useInView, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { NoiseOverlay, WordsPullUp } from "./primitives";

const EASE_CARD: [number, number, number, number] = [0.22, 1, 0.36, 1];

type InfoCard = {
  index: number;
  title: string;
  Icon: LucideIcon;
  description: string;
};

const INFO_CARDS: InfoCard[] = [
  {
    index: 0,
    title: "Members' Events.",
    Icon: Calendar,
    description:
      "Dinners, wellness sessions, sport and new experiences, put on regularly across London so there's always something worth going out for. Think supper clubs, Padel & Pints, wellness retreats and nights out you won't find anywhere else.",
  },
  {
    index: 1,
    title: "Members' Discounts.",
    Icon: Percent,
    description:
      "We've partnered with over 40 restaurants, bars and hospitality outlets across the city to get our members real, ongoing discounts. Think 30% off at partner restaurants, complimentary drinks at select bars, and preferential rates you won't get walking in off the street.",
  },
  {
    index: 2,
    title: "Members' Access.",
    Icon: Key,
    description:
      "The doors, events and experiences that aren't open to the public. Think skip-the-queue entry at partner venues, access to London's members' clubs, invite-only parties and first access to experiences before they sell out.",
  },
];

function FeatureCard({
  index,
  className,
  children,
}: {
  index: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const reduce = useReducedMotion();
  const show = reduce || inView;
  return (
    <motion.div
      ref={ref}
      initial={reduce ? false : { scale: 0.95, opacity: 0 }}
      animate={show ? { scale: 1, opacity: 1 } : undefined}
      transition={{ duration: 0.6, delay: index * 0.15, ease: EASE_CARD }}
      className={cn("relative overflow-hidden rounded-2xl", className)}
    >
      {children}
    </motion.div>
  );
}

export function Features() {
  return (
    // bg-background-muted (not bg-background): About's section above this
    // one has its own vertical padding around its pale box, so its bottom
    // edge is vivid --background right up until the section boundary —
    // butted directly against this section's own vivid top region (before
    // the cards), that reads as one uninterrupted flat-yellow block with no
    // visible seam. Flipping this section's own background to the pale
    // token creates a hard, deliberate two-tone boundary right at that
    // edge without needing to touch About at all.
    <section className="relative min-h-screen overflow-hidden bg-background-muted py-20 sm:py-28 md:py-32">
      {/* mix-blend-overlay added to match Hero's own NoiseOverlay treatment
          (hero.tsx uses `opacity-[0.7] mix-blend-overlay`) — without a blend
          mode, this noise's near-black grain (see primitives.tsx) composites
          via plain alpha over the vivid yellow, which flattens/desaturates
          it toward a muddy olive rather than reading as grain. Overlay blend
          mode affects luminosity while preserving the base hue, which is
          what keeps Hero's background looking like clean yellow with
          texture instead of a murky tint. */}
      <NoiseOverlay variant="bg" className="opacity-[0.15] mix-blend-overlay" />

      <div className="relative container flex flex-col gap-12 md:gap-16">
        <div className="flex flex-col items-center gap-1 text-center">
          <WordsPullUp
            text="A club for London's most social."
            className="justify-center text-xl font-normal text-foreground sm:text-2xl md:text-3xl lg:text-4xl"
          />
          <WordsPullUp
            text="Built for fun. Powered by convenience."
            className="justify-center text-xl font-normal text-foreground-muted sm:text-2xl md:text-3xl lg:text-4xl"
          />
        </div>

        {/* 1-up until md, then straight to 3-up — no intermediate 2-up step,
            which with exactly 3 cards would always leave the third one
            stranded alone on its own row instead of redistributing cleanly.
            Cards size to their own (now much longer) copy via a min-height
            floor rather than the old grid's fixed lg:h-[480px], which was
            tuned for the removed video card's short caption and would have
            either clipped or left a lot of dead space under this much text. */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {INFO_CARDS.map((card) => (
            <FeatureCard
              key={card.title}
              index={card.index}
              className="min-h-[280px] border border-foreground/10 bg-background"
            >
              <div className="flex h-full flex-col gap-4 p-6 sm:p-8">
                {/* Both flipped from the section's own pre-existing pattern
                    now that the section itself sits on bg-background-muted:
                    cards need to be the vivid token to read as distinct
                    surfaces against their now-pale backdrop, which in turn
                    means the icon tile needs to flip back to the pale token
                    to stay visible against its now-vivid card — same
                    two-token contrast relationship, just inverted one level
                    deeper. */}
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background-muted sm:h-12 sm:w-12">
                  <card.Icon className="h-5 w-5 text-foreground sm:h-6 sm:w-6" />
                </div>

                <h3 className="text-base font-medium text-foreground">
                  {card.title}
                </h3>

                <p className="text-sm leading-relaxed text-foreground-muted">
                  {card.description}
                </p>
              </div>
            </FeatureCard>
          ))}
        </div>
      </div>
    </section>
  );
}
