"use client";

import * as React from "react";
import { Calendar, Key, Percent, type LucideIcon } from "lucide-react";
import { motion, useInView, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

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
    <section className="relative min-h-screen overflow-hidden bg-background pb-20 sm:pb-28 md:pb-32">
      <div className="relative container flex flex-col gap-12 md:gap-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-foreground sm:text-xs">
            THE PERKS
          </span>
          <h2 className="mx-auto max-w-3xl text-xl leading-[0.95] text-foreground sm:text-2xl sm:leading-[0.9] md:text-3xl lg:text-4xl font-extrabold">
            A club for London&apos;s most social
            <br />
            <em className="italic [font-family:var(--font-instrument-serif)] font-normal">
              built for fun, powered by convenience.
            </em>
          </h2>
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
              className="min-h-[280px] border border-foreground/10 bg-background-muted"
            >
              <div className="flex h-full flex-col gap-4 p-6 sm:p-8">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background sm:h-12 sm:w-12">
                  <card.Icon className="h-5 w-5 text-foreground sm:h-6 sm:w-6" />
                </div>

                <h3 className="text-base font-bold text-foreground">
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
