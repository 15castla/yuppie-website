"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  CalendarDays,
  Percent,
  Key,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; Icon: LucideIcon };

// Below sm, only these three fit in the pill alongside the logo and
// account button (measured: logo + all 6 items + account button is wider
// than any common phone viewport, 375-430px, can hold in one row). The
// rest live behind the "More" trigger on narrow screens: see
// OVERFLOW_ITEMS below.
const PRIMARY_ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/admin/applications", label: "Applications", Icon: ClipboardList },
  { href: "/admin/members", label: "Members", Icon: Users },
];

// Rendered inline (unchanged) at sm and up; tucked behind the "More"
// trigger below sm.
const OVERFLOW_ITEMS: NavItem[] = [
  { href: "/admin/events", label: "Events", Icon: CalendarDays },
  { href: "/admin/discounts", label: "Discounts", Icon: Percent },
  { href: "/admin/access", label: "Access", Icon: Key },
];

function isItemActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

// Deliberately excludes `flex`/`hidden`. Callers supply their own
// display utility (see PRIMARY_ITEMS/OVERFLOW_ITEMS below) so a bare
// `flex` and a responsive `hidden sm:flex` are never both present on the
// same element, which is ambiguous once Tailwind resolves the cascade.
function navLinkClasses(isActive: boolean) {
  return cn(
    "items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream",
    isActive ? "bg-foreground text-background" : "text-foreground/60 hover:text-foreground",
  );
}

// Same yellow-page/cream-pill pairing as the member bottom tab bar
// (components/members/members-nav.tsx's MembersBottomBar): a cream pill
// sitting on the brand-yellow header, with the active tab picked out as a
// solid near-black pill. Icons are shown at every width; labels drop below
// sm so the bar stays a single row next to the logo on narrow admin
// windows instead of wrapping awkwardly.
//
// `trailing` renders as the last item inside this same pill (see
// AdminUserMenu, passed in from layout.tsx) rather than as a separate
// element next to it: keeping the account button inside the one bg-cream
// container is what keeps the whole header to a single row on mobile.
export function AdminNav({ trailing }: { trailing?: React.ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const overflowHasActive = OVERFLOW_ITEMS.some((item) => isItemActive(pathname, item.href));

  useEffect(() => {
    if (!moreOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [moreOpen]);

  return (
    <nav className="flex flex-wrap items-center gap-1 rounded-full bg-cream p-1 shadow-[0_1px_2px_rgba(27,21,18,0.08)]">
      {PRIMARY_ITEMS.map(({ href, label, Icon }) => {
        const isActive = isItemActive(pathname, href);

        return (
          <Link key={href} href={href} className={cn("flex", navLinkClasses(isActive))}>
            <Icon size={15} strokeWidth={2.25} />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}

      {OVERFLOW_ITEMS.map(({ href, label, Icon }) => {
        const isActive = isItemActive(pathname, href);

        return (
          <Link
            key={href}
            href={href}
            className={cn("hidden sm:flex", navLinkClasses(isActive))}
          >
            <Icon size={15} strokeWidth={2.25} />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}

      {/* Only below sm, where OVERFLOW_ITEMS above are hidden. Picks up
          the same active styling a regular item would (rather than a
          separate dot) when the active page is one of the items hidden
          inside it, so it's clear at a glance where "here" is. */}
      <div ref={moreRef} className="relative sm:hidden">
        <button
          type="button"
          onClick={() => setMoreOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          aria-label="More navigation"
          className={cn("flex", navLinkClasses(overflowHasActive))}
        >
          <MoreHorizontal size={15} strokeWidth={2.25} />
        </button>

        {moreOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-40 mt-2 w-48 rounded-xl border border-foreground/10 bg-background p-2 shadow-[0_10px_24px_-10px_rgba(27,21,18,0.25)]"
          >
            {OVERFLOW_ITEMS.map(({ href, label, Icon }) => {
              const isActive = isItemActive(pathname, href);

              return (
                <Link
                  key={href}
                  href={href}
                  role="menuitem"
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium outline-none transition-colors",
                    isActive
                      ? "bg-foreground text-background"
                      : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground focus-visible:bg-foreground/5 focus-visible:text-foreground",
                  )}
                >
                  <Icon size={15} strokeWidth={2.25} />
                  {label}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {trailing}
    </nav>
  );
}
