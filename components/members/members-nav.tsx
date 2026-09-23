"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Calendar,
  Percent,
  Key,
  CircleUserRound,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = { label: string; href: string; Icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/members", Icon: Home },
  { label: "Events", href: "/members/events", Icon: Calendar },
  { label: "Discounts", href: "/members/discounts", Icon: Percent },
  { label: "Access", href: "/members/access", Icon: Key },
  { label: "Profile", href: "/members/profile", Icon: CircleUserRound },
];

function isActive(pathname: string, href: string) {
  if (href === "/members") return pathname === "/members";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isEventDetailPath(pathname: string) {
  // Event detail pages (e.g. /members/events/padel-and-pints) render their
  // own price + RSVP bar in the same slot the standard tab bar normally
  // occupies (see the fixed bar in event-detail-view.tsx). This matches
  // "/members/events/<slug>" but not the events list page itself
  // ("/members/events" or "/members/events/").
  return /^\/members\/events\/[^/]+\/?$/.test(pathname);
}

// Desktop: floating top pill nav, same visual pattern as SiteNav. Rendered
// before {children} in app/members/layout.tsx, same as always. This was
// never position: fixed to begin with (absolute against <section>, not the
// viewport), so it's untouched by the mobile bar's fixed->sticky
// restructuring below.
export function MembersNav() {
  const pathname = usePathname();

  return (
    <nav className="absolute left-1/2 top-0 z-20 hidden max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-b-2xl bg-background md:flex md:max-w-none md:rounded-b-3xl">
      <ul className="flex items-center gap-2 px-5 py-2.5 md:px-6 lg:px-9">
        {NAV_ITEMS.map(({ label, href }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "block rounded-full px-3 py-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  active
                    ? "bg-foreground font-semibold text-background"
                    : "text-foreground/80 hover:text-foreground",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Mobile: fade scrim + tab bar, as one element (scrim and nav merged into
// one sticky container rather than two independently-positioned layers;
// two independently-fixed layers near the bottom previously caused a
// visible Safari toolbar seam). position: sticky, not fixed: fixed
// glitches/disappears momentarily during active scrolling on real iOS
// Safari (a well-known old WebKit issue: fixed-position elements
// composite separately from scrolled content), which sticky doesn't have
// since it's part of normal document flow. Sticky was tried once before
// and reverted (see git history) over a suspected dvh-geometry safe-area
// bug, but that bug's real cause turned out to be unrelated: Safari 26
// toolbar tinting needing a background-color on a qualifying element,
// fixed separately below and independent of this wrapper's own
// positioning. So sticky no longer carries that risk.
export function MembersBottomBar() {
  const pathname = usePathname();
  const hideTabBar = isEventDetailPath(pathname);

  if (hideTabBar) return null;

  return (
    <div className="pointer-events-none sticky bottom-0 z-20 h-36 md:hidden">
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(to_top,var(--background)_0%,var(--background)_35%,color-mix(in_oklab,var(--background)_65%,transparent)_55%,color-mix(in_oklab,var(--background)_30%,transparent)_75%,transparent_100%)]"
      />
      {/* Safari 26 (iOS 26) dropped theme-color entirely. It now scans
          fixed/sticky elements within ~3px of a viewport edge, at least
          80% wide and 3px tall, for a literal background-color CSS
          property to tint its toolbar. The gradient above is a
          background-image, which doesn't qualify, and this wrapper has
          no background-color of its own, so Safari found nothing here
          and fell back to something else, hence every theme-color and
          gradient-flat-zone test having zero effect. This strip exists
          purely so there's a real background-color for Safari to read;
          it's visually redundant since the gradient above is already
          opaque at the very bottom. */}
      <div aria-hidden className="fixed inset-x-0 bottom-0 h-4 bg-background" />
      <nav
        className="pointer-events-auto absolute left-3.5 right-3.5 bottom-[max(0.875rem,env(safe-area-inset-bottom))] flex items-center justify-around rounded-[26px] bg-cream p-2 shadow-[0_10px_20px_-12px_rgba(27,21,18,0.18)]"
        aria-label="Members navigation"
      >
        {NAV_ITEMS.map(({ label, href, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-[3px] rounded-[18px] px-3 py-[7px] transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "text-foreground-muted",
              )}
            >
              <Icon size={21} strokeWidth={2.25} />
              <span className="text-[9.5px] font-bold uppercase tracking-wider">
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
