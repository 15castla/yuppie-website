"use client";

// One partner in a list, on Discounts and Access: a 48px tile (a logo, the
// first letter of the name, or for Access the kind's icon), the name with the
// badge level with it, the offer straight under the name (it is the thing you
// came for), and the category and area last. The whole row is one button that
// opens the redeem card. Design: v3 specs/discounts-access.md, section A.

import { useState, type ReactNode } from "react";

import { Pill } from "@/components/members/kit";
import "./discounts.css";

function Tile({ name, logoUrl, icon }: { name: string; logoUrl?: string | null; icon?: ReactNode }) {
  // A logo that fails to load (removed from storage, a bad address) falls back to the letter.
  const [failed, setFailed] = useState(false);
  let inner: ReactNode;
  if (icon) {
    inner = icon;
  } else if (logoUrl && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    inner = <img src={logoUrl} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  } else {
    inner = name.trim().charAt(0).toLocaleUpperCase("en-GB") || "?";
  }
  return (
    <span className="dc-tile" aria-hidden="true">
      {inner}
    </span>
  );
}

export function PartnerRow({
  name,
  offer,
  meta,
  badge,
  logoUrl,
  icon,
  onOpen,
}: {
  name: string;
  offer: string;
  /** The last line: "Food and drink · Northgate" (Discounts), or the area (Access). */
  meta: string;
  badge?: string | null;
  logoUrl?: string | null;
  /** Access rows: the kind's icon instead of a logo or a letter. */
  icon?: ReactNode;
  onOpen: () => void;
}) {
  return (
    <li>
      <button type="button" className="dc-row" aria-haspopup="dialog" onClick={onOpen}>
        <Tile name={name} logoUrl={logoUrl} icon={icon} />
        <span className="dc-name">{name}</span>
        {badge ? (
          <span className="dc-pill">
            <Pill kind="ink">{badge}</Pill>
          </span>
        ) : null}
        <span className="dc-offer">{offer}</span>
        {meta ? <span className="dc-meta">{meta}</span> : null}
      </button>
    </li>
  );
}

export function PartnerList({ children }: { children: ReactNode }) {
  return <ul className="dc-list">{children}</ul>;
}
