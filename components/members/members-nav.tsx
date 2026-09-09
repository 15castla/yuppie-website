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
  // occupies — see the fixed bar in event-detail-view.tsx. This matches
  // "/members/events/<slug>" but not the events list page itself
  // ("/members/events" or "/members/events/").
  return /^\/members\/events\/[^/]+\/?$/.test(pathname);
}

export function MembersNav() {
  const pathname = usePathname();
  const hideTabBar = isEventDetailPath(pathname);

  return (
    <>
      {/* Soft fade so scrolling content resolves to solid background
          before it reaches the bottom nav / Safari's own toolbar, instead
          of getting cut off mid-card. Full width (not inset like the nav
          pill) so it also covers the gaps beside the pill. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[15] h-36 bg-linear-to-t from-background from-60% to-transparent md:hidden"
      />

      {/* Mobile: fixed bottom tab bar. */}
      {!hideTabBar && (
        <nav
          className="fixed left-3.5 right-3.5 bottom-3.5 z-20 flex items-center justify-around rounded-[26px] bg-cream p-2 shadow-[0_10px_20px_-12px_rgba(27,21,18,0.18)] md:hidden"
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
      )}

      {/* Desktop: floating top pill nav, same visual pattern as SiteNav. */}
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
    </>
  );
}
