"use client";

import Link from "next/link";

// "#" for FAQ's, which doesn't have a page yet — the other three link to
// their real, already-built routes rather than sitting dead, matching how
// the footer's matching labels are wired.
const NAV_ITEMS: { label: string; href: string }[] = [
  { label: "Home", href: "/" },
  { label: "Members Area", href: "/member-login" },
  { label: "Membership", href: "/apply" },
  { label: "FAQ's", href: "#" },
];

function NavLinkItem({ label, href }: { label: string; href: string }) {
  return href.startsWith("/") ? (
    <li className="shrink-0">
      <Link
        href={href}
        className="text-xs text-foreground/80 transition-colors hover:text-foreground md:text-sm"
      >
        {label}
      </Link>
    </li>
  ) : (
    <li className="shrink-0">
      <a
        href={href}
        className="text-xs text-foreground/80 transition-colors hover:text-foreground md:text-sm"
      >
        {label}
      </a>
    </li>
  );
}

export function SiteNav() {
  return (
    <nav className="absolute left-1/2 top-0 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-b-2xl bg-background md:max-w-none md:rounded-b-3xl">
      <ul
        className="flex items-center gap-5 overflow-x-auto whitespace-nowrap px-5 py-2.5 sm:gap-7 md:gap-9 md:px-9 lg:gap-11 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {NAV_ITEMS.map((item) => (
          <NavLinkItem key={item.label} {...item} />
        ))}
      </ul>
    </nav>
  );
}
