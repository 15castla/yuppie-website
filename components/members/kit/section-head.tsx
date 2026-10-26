// Kit counterparts: .month (SectionHead) and .sh (SectionTitle).

import type { ReactNode } from "react";

import { KitLink } from "./link";

// Kit counterpart: the .month header: a serif italic month ("October") with
// a muted count at the far end ("2 events"). Also the heading of any ruled
// group ("All offers", "5 offers").
export function SectionHead({
  title,
  meta,
  as: Tag = "h2",
}: {
  title: ReactNode;
  meta?: ReactNode;
  as?: "h2" | "h3";
}) {
  return (
    <div className="mk-month">
      <Tag>{title}</Tag>
      {meta ? <span>{meta}</span> : null}
    </div>
  );
}

// Kit counterpart: k2.sh(title, link). A bold 24px section title ("Your
// plans") with one underlined link at the far end ("All plans").
export function SectionTitle({
  title,
  linkLabel,
  linkHref,
}: {
  title: ReactNode;
  linkLabel?: string;
  linkHref?: string;
}) {
  return (
    <div className="mk-sh">
      <h2 className="mk-h2">{title}</h2>
      {linkLabel && linkHref ? (
        <KitLink href={linkHref} className="mk-link">
          {linkLabel}
        </KitLink>
      ) : null}
    </div>
  );
}
