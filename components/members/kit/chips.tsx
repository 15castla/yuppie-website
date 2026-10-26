// Kit counterpart: k2.chips(items, active). One row of 44px pill filters;
// it scrolls sideways on a phone and wraps from 768px. Single select: the
// active chip is the filled ink one. A chip is a button, or a link when
// given an href (a filter that lives in the address).

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { KitLink } from "./link";

export function Chip({
  active = false,
  href,
  onClick,
  children,
}: {
  active?: boolean;
  href?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const className = cn("mk-chip", active && "mk-is-active");
  if (href) {
    return (
      <KitLink href={href} className={className} aria-current={active ? "true" : undefined}>
        {children}
      </KitLink>
    );
  }
  return (
    <button type="button" className={className} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}

export function ChipRow({
  label,
  children,
}: {
  /** What the group filters, for screen readers ("Filter by category"). */
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="mk-chips" role="group" aria-label={label}>
      {children}
    </div>
  );
}
