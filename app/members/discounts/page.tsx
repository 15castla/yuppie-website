"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { MOCK_PERKS, type PartnerPerk } from "@/components/members/mock-perks";
import { CARD_CLASS, EYEBROW_CLASS, MEMBERS_MAIN_CLASS } from "@/components/members/ui";
import { cn } from "@/lib/utils";

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

type Filter = "All" | PartnerPerk["category"];
const FILTERS: Filter[] = ["All", "Food & Drink", "Fitness", "Grooming", "Wellness"];

const DISCOUNTS = MOCK_PERKS.filter((perk) => perk.type === "discount");

export default function MembersDiscountsPage() {
  const reduce = useReducedMotion();
  const fade = (delay: number) => ({
    initial: reduce ? false : { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { duration: 0.8, delay, ease: EASE_OUT_EXPO },
  });

  const [filter, setFilter] = useState<Filter>("All");
  const filtered = useMemo(
    () => DISCOUNTS.filter((perk) => filter === "All" || perk.category === filter),
    [filter],
  );

  return (
    <main className={MEMBERS_MAIN_CLASS}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <motion.div {...fade(0.1)} className="flex flex-col gap-3">
          <span className={EYEBROW_CLASS}>MEMBERS&apos; DISCOUNTS</span>
          <h1 className="text-2xl font-extrabold text-foreground sm:text-3xl optical-trim">
            Discounts.
          </h1>
          <p className="text-sm text-foreground-muted">
            Real savings with partners across London. Just mention Yuppie.
          </p>
        </motion.div>

        <motion.div
          {...fade(0.2)}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-colors",
                filter === item
                  ? "bg-foreground text-background"
                  : "border border-foreground/20 bg-transparent text-foreground",
              )}
            >
              {item}
            </button>
          ))}
        </motion.div>

        <motion.div {...fade(0.3)} className="flex flex-col gap-3">
          {filtered.map((perk) => (
            <div key={perk.id} className={cn(CARD_CLASS, "flex items-center gap-4 p-4")}>
              <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-background text-lg font-bold text-foreground">
                {perk.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-bold text-foreground">
                  {perk.name}
                </p>
                <p className="truncate text-[11.5px] text-foreground-muted">
                  {perk.category} · {perk.area}
                </p>
                <p className="mt-1 text-xs text-foreground">{perk.headline}</p>
              </div>
              {perk.badge && (
                <span className="shrink-0 rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background">
                  {perk.badge}
                </span>
              )}
            </div>
          ))}
        </motion.div>
      </div>
    </main>
  );
}
