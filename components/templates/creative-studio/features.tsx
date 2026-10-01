"use client";

import type { ReactNode } from "react";
import {
  Calendar,
  Key,
  MessageCircle,
  Percent,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type InfoCard = {
  title: string;
  Icon: LucideIcon;
  description: string;
};

const INFO_CARDS: InfoCard[] = [
  {
    title: "Members' Events.",
    Icon: Calendar,
    description:
      "Dinners, wellness sessions, sport and new experiences, put on regularly across London with members who turned up for the same reason as you. Think supper clubs, Padel & Pints, wellness retreats and nights out you won't find anywhere else.",
  },
  {
    title: "Members' Discounts.",
    Icon: Percent,
    description:
      "On top of the events, real discounts with partners across the city: restaurants and bars, barbers, gyms, sports clubs and more, all offering our members savings you won't get walking in off the street.",
  },
  {
    title: "Members' Access.",
    Icon: Key,
    description:
      "And the doors that aren't open to the public: skip-the-queue entry at partner venues, access to London's members' clubs, invite-only parties, and first dibs before things sell out.",
  },
  {
    title: "Members' Concierge.",
    Icon: MessageCircle,
    description:
      "And when you can't decide where to go: a chat built into the app that knows our own curated list of restaurants and bars, never the open internet. Ask what you're in the mood for and get a straight answer back, from places we'd actually send a friend to. Landing in the app.",
  },
];

function FeatureCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl", className)}>
      {children}
    </div>
  );
}

export function Features() {
  return (
    <section className="relative overflow-hidden bg-background pb-20 sm:pb-28 md:pb-32">
      <div className="relative container flex flex-col gap-12 md:gap-16">
        <div className="flex flex-col items-center gap-6 text-center">
          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-foreground sm:text-xs optical-trim">
            THE PERKS
          </span>
          <h2 className="mx-auto max-w-3xl text-xl leading-[0.95] text-foreground sm:text-2xl sm:leading-[0.9] md:text-3xl lg:text-4xl font-extrabold optical-trim">
            A club for London&apos;s most social
            <br />
            <em className="italic [font-family:var(--font-instrument-serif)] font-normal">
              built for fun, powered by convenience.
            </em>
          </h2>
        </div>

        {/* 1-up on mobile, 2-up from sm, 4-up at lg: with exactly 4 cards
            this divides evenly at every step, so no card is ever stranded
            alone on its own row the way a 3-card grid would be. Cards size
            to their own copy via a min-height floor rather than a fixed
            height, which was tuned for the removed video card's short
            caption and would have either clipped or left dead space under
            this much text. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {INFO_CARDS.map((card) => (
            <FeatureCard
              key={card.title}
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
