"use client";

// Page-entrance fade-up transition, applied on every route via Next's
// template.tsx re-mount behavior.

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

// Same curve Hero already uses for its own entrance animation
// (components/templates/creative-studio/hero.tsx) — reusing it here keeps
// every page's arrival feeling consistent with the homepage.
const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function Template({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();

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
