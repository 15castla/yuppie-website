"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Zap, Building2, Sparkles, type LucideIcon } from "lucide-react";

import { MOCK_PERKS, type PartnerPerk } from "@/components/members/mock-perks";
import { CARD_CLASS, EYEBROW_CLASS } from "@/components/members/ui";
import { cn } from "@/lib/utils";

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

const ACCESS_PERKS = MOCK_PERKS.filter((perk) => perk.type === "access");

const SECTIONS: { kind: PartnerPerk["access_kind"]; label: string; Icon: LucideIcon }[] = [
  { kind: "skip_queue", label: "Skip the queue", Icon: Zap },
  { kind: "members_club", label: "Members' clubs", Icon: Building2 },
  { kind: "first_dibs", label: "First dibs", Icon: Sparkles },
];

export default function MembersAccessPage() {
  const reduce = useReducedMotion();
  const fade = (delay: number) => ({
    initial: reduce ? false : { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: 0.8, delay, ease: EASE_OUT_EXPO },
  });

  return (
    <main className="relative z-10 flex flex-1 flex-col px-4 pt-28 pb-[130px] sm:px-6 sm:pt-32 md:pb-20">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <motion.div {...fade(0.1)} className="flex flex-col gap-3">
          <span className={EYEBROW_CLASS}>MEMBERS&apos; ACCESS</span>
          <h1 className="text-2xl font-extrabold leading-[1.1] text-foreground sm:text-3xl optical-trim">
            The doors that
            <br />
            <em className="italic [font-family:var(--font-instrument-serif)] font-normal">
              aren&apos;t open to the public.
            </em>
          </h1>
        </motion.div>

        <motion.div
          {...fade(0.2)}
          className="rounded-2xl bg-foreground p-6"
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-background/70">
            INVITE ONLY
          </span>
          <p className="mt-2 text-lg font-extrabold text-background">
            Rooftop Closing Party
          </p>
          <p className="mt-1 text-sm text-background/60">
            Invites drop 1 October. Keep notifications on.
          </p>
        </motion.div>

        {SECTIONS.map((section, index) => {
          const perks = ACCESS_PERKS.filter((perk) => perk.access_kind === section.kind);
          if (perks.length === 0) return null;

          return (
            <motion.section
              key={section.kind}
              {...fade(0.3 + index * 0.1)}
              className="flex flex-col gap-3"
            >
              <span className="text-xs font-bold uppercase tracking-wider text-foreground-muted">
                {section.label}
              </span>
              <div className="flex flex-col gap-3">
                {perks.map((perk) => (
                  <div
                    key={perk.id}
                    className={cn(CARD_CLASS, "flex items-center gap-4 p-4")}
                  >
                    <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-background">
                      <section.Icon className="h-5 w-5 text-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-bold text-foreground">
                        {perk.name}
                      </p>
                      <p className="mt-1 text-xs text-foreground-muted">
                        {perk.headline}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.section>
          );
        })}
      </div>
    </main>
  );
}
