// Internal links go through next/link (client navigation, prefetch); anything
// else (mailto:, tel:, https:) is a plain anchor. Every kit primitive that
// takes an href uses this, so a builder never has to choose.

import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";

export type KitLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
};

export function KitLink({ href, children, ...rest }: KitLinkProps) {
  if (href.startsWith("/")) {
    return (
      <Link href={href} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
