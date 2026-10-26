// Kit counterpart: k2.row(wd, dn, title, meta, end, href) and k2.rows(items).
// A 76px (minimum) whole-row link: a 44px date column or a leading slot, the
// title and one muted meta line, and a trailing pill. Rows sit between 1.5px
// ink rules (Rows draws the top and bottom ones).

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { KitLink } from "./link";

// Kit counterpart: k2.date_col(wd, dn). "THU" over "29".
export function DateColumn({ weekday, day }: { weekday: string; day: string | number }) {
  return (
    <span className="mk-date">
      <span className="mk-wd">{weekday}</span>
      <span className="mk-dn">{day}</span>
    </span>
  );
}

export function Row({
  href,
  date,
  leading,
  title,
  meta,
  end,
  className,
}: {
  href: string;
  /** The date column: a weekday ("Thu") and a day ("29"). Upper-cased by the CSS. */
  date?: { weekday: string; day: string | number };
  /** Instead of a date: a 48px logo tile, a photo, an icon. */
  leading?: ReactNode;
  title: ReactNode;
  /** One muted line under the title, e.g. "18:30 · Northgate Courts". */
  meta?: ReactNode;
  /** The trailing pill (or pills). */
  end?: ReactNode;
  className?: string;
}) {
  return (
    <KitLink href={href} className={cn("mk-row", className)}>
      {date ? <DateColumn weekday={date.weekday} day={date.day} /> : leading}
      <span className="mk-body">
        <span className="mk-title">{title}</span>
        {meta ? <span className="mk-meta">{meta}</span> : null}
      </span>
      {end ? <span className="mk-end">{end}</span> : null}
    </KitLink>
  );
}

// The ruled list the rows sit in.
export function Rows({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mk-rows", className)}>{children}</div>;
}
