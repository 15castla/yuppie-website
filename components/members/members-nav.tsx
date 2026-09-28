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
// visible Safari toolbar seam). position: sticky, not fixed, on this
// wrapper specifically: fixed glitches/disappears momentarily during
// active scrolling on real iOS Safari (a well-known old WebKit issue:
// fixed-position elements composite separately from scrolled content),
// which sticky doesn't have since it's part of normal document flow.
// The separate Safari-tinting strip below this function's return needs
// to be genuinely position: fixed itself (that's what Safari's own
// detection wants), which is why it's rendered as this wrapper's sibling
// rather than nested inside it.
export function MembersBottomBar() {
  const pathname = usePathname();
  const hideTabBar = isEventDetailPath(pathname);

  if (hideTabBar) return null;

  return (
    <>
      {/* Safari 26 (iOS 26) dropped theme-color entirely: it now derives
          its browser chrome color from body's own background-color, or
          from a qualifying position: fixed element's background-color if
          one exists near a viewport edge. This has to be a genuinely
          top-level fixed element, not nested inside the sticky scrim
          wrapper below: Safari's own detection for this is still actively
          changing and buggy as of iOS 26/27 (well documented externally),
          and nesting the qualifying element inside another
          positioned/sticky ancestor is a reported cause of it picking the
          wrong color or missing it entirely, even though position: fixed
          itself always escapes to the true viewport regardless of
          ancestors. Rendered as its own sibling here rather than inside
          the scrim wrapper for that reason. Height is
          env(safe-area-inset-bottom) (with a 1rem floor for devices with
          no inset), not a flat value: the true safe-area zone on
          notched/Dynamic Island iPhones (commonly ~34px) needs covering,
          not just Safari's own minimum (~6px) to be recognized at all. */}
      <div
        aria-hidden
        className="fixed inset-x-0 bottom-0 z-20 h-[max(1rem,env(safe-area-inset-bottom))] bg-background md:hidden"
      />
      <div className="pointer-events-none sticky bottom-0 z-20 h-36 md:hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_top,var(--background)_0%,var(--background)_35%,color-mix(in_oklab,var(--background)_65%,transparent)_55%,color-mix(in_oklab,var(--background)_30%,transparent)_75%,transparent_100%)]"
        />
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
    </>
  );
}
