// Kit counterparts: .card (pale, 2px ink border, 20px radius, hard 6px ink
// shadow; 8px from 768) and .tile (the same without the shadow). The card has
// a 6px right margin so its shadow stays inside the gutter (8px from 768):
// keep it, and see the RULE-10 note in the Open Invite spec when a card
// touches a rule.

import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type CardTone = "pale" | "yellow" | "cream";

export function Card({
  tone = "pale",
  tight = false,
  as: Tag = "div",
  className,
  children,
  ...rest
}: {
  tone?: CardTone;
  /** 16px 18px padding instead of the roomy one. */
  tight?: boolean;
  as?: ElementType;
  className?: string;
  children: ReactNode;
} & Record<string, unknown>) {
  return (
    <Tag
      className={cn(
        "mk-card",
        tone === "yellow" && "mk-yellow",
        tone === "cream" && "mk-cream",
        tight && "mk-tight",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function Tile({
  as: Tag = "div",
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
} & Record<string, unknown>) {
  return (
    <Tag className={cn("mk-tile", className)} {...rest}>
      {children}
    </Tag>
  );
}
