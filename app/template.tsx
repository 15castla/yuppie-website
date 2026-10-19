"use client";

// Page-entrance fade-up transition, applied on every route via Next's
// template.tsx re-mount behavior. Not in the members area: those pages
// appear instantly, like native app screens (and a nested
// app/members/template.tsx couldn't opt out, since this one still wraps
// it). Same prefix check as site-nav.tsx's isNavExcludedRoute.

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";

// Ease-out-expo: fast start, long gentle settle.
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

function isMembersRoute(pathname: string): boolean {
  return pathname === "/members" || pathname.startsWith("/members/");
}

export default function Template({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const pathname = usePathname();

  if (isMembersRoute(pathname)) {
    return <div className="flex flex-1 flex-col">{children}</div>;
  }

  return (
    <motion.div
      className="flex flex-1 flex-col"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
    >
      {children}
    </motion.div>
  );
}
