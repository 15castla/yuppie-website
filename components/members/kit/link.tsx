"use client";

// Internal links go through next/link (client navigation, prefetch); anything
// else (mailto:, tel:, https:) is a plain anchor. Every kit primitive that
// takes an href uses this, so a builder never has to choose.
//
// Whole pages only (Albert, 7 Nov 2026: "Any way to make the whole page
// instantly?"). The members routes have no loading screens: a tap keeps the
// current page until the new one is ready, then it appears in one go. So the
// tap still shows at once, a link whose page is on its way carries
// data-nav-pending (members.css: the tab lights up, a row or card dims a
// little) until the new page is there. A page that was prefetched in full (the
// tabs, Messages and You: prefetch) opens at once, with no pending state.

import Link, { useLinkStatus } from "next/link";
import { useEffect, useRef, type AnchorHTMLAttributes, type RefObject } from "react";

export type KitLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  /** true: fetch the whole page ahead (the tabs, Messages, You), so a tap opens it at once. */
  prefetch?: boolean;
};

/** Marks its link while the page it opens is on its way. Renders nothing, so the link's contents are untouched. */
function PendingMark({ anchor }: { anchor: RefObject<HTMLAnchorElement | null> }) {
  const { pending } = useLinkStatus();
  useEffect(() => {
    const el = anchor.current;
    if (!el) return;
    if (pending) el.setAttribute("data-nav-pending", "");
    else el.removeAttribute("data-nav-pending");
    return () => el.removeAttribute("data-nav-pending");
  }, [pending, anchor]);
  return null;
}

export function KitLink({ href, prefetch, children, ...rest }: KitLinkProps) {
  const anchor = useRef<HTMLAnchorElement>(null);
  if (href.startsWith("/")) {
    return (
      <Link href={href} ref={anchor} prefetch={prefetch ? true : undefined} {...rest}>
        {children}
        <PendingMark anchor={anchor} />
      </Link>
    );
  }
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
