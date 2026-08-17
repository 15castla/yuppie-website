"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/members", label: "Members" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-6">
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              isActive
                ? "rounded-full bg-foreground px-3 py-1.5 text-sm font-semibold text-background outline-none transition-colors focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F5F3E7]"
                : "rounded-full px-3 py-1.5 text-sm font-semibold text-foreground/50 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F5F3E7]"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
