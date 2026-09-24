"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  CalendarDays,
  Percent,
  Key,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; Icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/admin/applications", label: "Applications", Icon: ClipboardList },
  { href: "/admin/members", label: "Members", Icon: Users },
  { href: "/admin/events", label: "Events", Icon: CalendarDays },
  { href: "/admin/discounts", label: "Discounts", Icon: Percent },
  { href: "/admin/access", label: "Access", Icon: Key },
];

// Same yellow-page/cream-pill pairing as the member bottom tab bar
// (components/members/members-nav.tsx's MembersBottomBar): a cream pill
// sitting on the brand-yellow header, with the active tab picked out as a
// solid near-black pill. Icons are shown at every width; labels drop below
// sm so the bar stays a single row next to the logo on narrow admin
// windows instead of wrapping awkwardly.
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1 rounded-full bg-cream p-1 shadow-[0_1px_2px_rgba(27,21,18,0.08)]">
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const isActive = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream",
              isActive
                ? "bg-foreground text-background"
                : "text-foreground/60 hover:text-foreground",
            )}
          >
            <Icon size={15} strokeWidth={2.25} />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
