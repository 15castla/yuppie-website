"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Zap, Building2, Sparkles, Lock, type LucideIcon } from "lucide-react";

import type { PartnerPerk } from "@/components/members/mock-perks";
import { CARD_CLASS, EYEBROW_CLASS, MEMBERS_MAIN_CLASS } from "@/components/members/ui";
import { cn } from "@/lib/utils";

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Every access_kind the database allows (see the partner_perks check
// constraint) needs a section here. "invite_only" was previously missing,
// which meant a perk saved with that access_kind from /admin/discounts
// would silently never appear anywhere on this page.
const SECTIONS: { kind: PartnerPerk["access_kind"]; label: string; Icon: LucideIcon }[] = [
  { kind: "skip_queue", label: "Skip the queue", Icon: Zap },
  { kind: "members_club", label: "Members' clubs", Icon: Building2 },
  { kind: "first_dibs", label: "First dibs", Icon: Sparkles },
  { kind: "invite_only", label: "Invite only", Icon: Lock },
];

// featureCard is whichever single event, discount, or access perk is
// currently spotlighted (set from the single dropdown on /admin/access,
// see app/admin/feature-card-actions.ts's setFeatureCard), already
// resolved into this normalized display shape by
// app/members/access/page.tsx. Null when nothing is currently featured,
// in which case the card is hidden entirely rather than showing stale or
// placeholder copy.
export function AccessView({
  perks,
  featureCard,
}: {
  perks: PartnerPerk[];
  featureCard: { title: string; subtitle: string; label: string } | null;
}) {
  const reduce = useReducedMotion();
  const fade = (delay: number) => ({
    initial: reduce ? false : { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: 0.8, delay, ease: EASE_OUT_EXPO },
  });

  return (
    <main className={MEMBERS_MAIN_CLASS}>
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

        {featureCard && (
          <motion.div
            {...fade(0.2)}
            className="rounded-2xl bg-foreground p-6"
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-background/70">
              {featureCard.label}
            </span>
            <p className="mt-2 text-lg font-extrabold text-background">
              {featureCard.title}
            </p>
            <p className="mt-1 text-sm text-background/60">
              {featureCard.subtitle}
            </p>
          </motion.div>
        )}

        {SECTIONS.map((section, index) => {
          const sectionPerks = perks.filter((perk) => perk.access_kind === section.kind);
          if (sectionPerks.length === 0) return null;

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
                {sectionPerks.map((perk) => (
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
