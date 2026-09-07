"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Calendar,
  Percent,
  Key,
  CircleUserRound,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { signOutMember } from "@/app/members/profile/actions";

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

export function MembersNav() {
  const pathname = usePathname();
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setLeaveDialogOpen(true)}
        aria-label="Return to clubyuppie.com"
        className="fixed left-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background shadow-[0_8px_20px_-10px_rgba(27,21,18,0.4)] transition-transform hover:scale-105"
      >
        <ExternalLink size={17} />
      </button>

      {leaveDialogOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-foreground/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-background-muted p-6 shadow-[0_24px_48px_-16px_rgba(27,21,18,0.5)]">
            <h3 className="text-base font-bold text-foreground">
              Leave the members area?
            </h3>
            <p className="mt-2 text-sm text-foreground-muted">
              You&apos;ll be signed out and sent back to the main site. You can
              log back in whenever you like.
            </p>
            <div className="mt-6 flex items-center justify-end gap-4">
              <button
                type="button"
                onClick={() => setLeaveDialogOpen(false)}
                className="text-sm font-medium text-foreground/50 underline underline-offset-2 hover:text-foreground"
              >
                Stay signed in
              </button>
              <form action={signOutMember}>
                <button
                  type="submit"
                  className="rounded-full bg-foreground px-5 py-2 text-sm font-bold text-background"
                >
                  Log out &amp; leave
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Mobile: fixed bottom tab bar. */}
      <nav
        className="fixed left-3.5 right-3.5 bottom-3.5 z-20 flex items-center justify-around rounded-[26px] bg-cream p-2 shadow-[0_18px_34px_-18px_rgba(27,21,18,0.55)] md:hidden"
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
                    "block text-sm transition-colors",
                    active
                      ? "rounded-full bg-foreground px-3 py-1 font-semibold text-background"
                      : "px-3 py-1 text-foreground/80 hover:text-foreground",
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
