// Kit counterpart: .seg (the Browse | Yours switch). A 44px-segment pill
// control of links; the current one is ink with yellow text. Not tabs in the
// ARIA sense: each segment is a page of its own, so each is a link with
// aria-current.

import type { ReactNode } from "react";

import { KitLink } from "./link";

export type SegmentedItem = { label: ReactNode; href: string; current?: boolean };

export function Segmented({
  items,
  label,
}: {
  items: SegmentedItem[];
  label?: string;
}) {
  return (
    <nav className="mk-seg" aria-label={label}>
      {items.map((item) => (
        <KitLink
          key={item.href}
          href={item.href}
          aria-current={item.current ? "page" : undefined}
        >
          {item.label}
        </KitLink>
      ))}
    </nav>
  );
}
