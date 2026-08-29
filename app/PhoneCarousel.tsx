"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PhoneFrame } from "./PhoneMockups";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const AUTO_ROTATE_MS = 4000;

// Same useSyncExternalStore pattern page.tsx uses for this same check — it's
// module-private there, so duplicated here rather than exported cross-file
// plumbing for something this small.
function subscribeToReducedMotion(callback: () => void) {
  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getReducedMotion() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotion,
    getReducedMotionServerSnapshot,
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M7 5v14l12-7z" />
    </svg>
  );
}

// Per-slot transform "roles" a phone can be in relative to the active index:
// 0 = center/prominent, 1 = next (peeking from the right), 2 = previous
// (peeking from the left, since -1 mod 3 === 2). Cycling `active` rotates
// which physical phone occupies which role, rather than reordering the DOM —
// that's what makes this read as a carousel turning in place, not a list
// scrolling past.
const ROLE_STYLE = {
  0: { x: "0%", scale: 1, rotateY: 0, opacity: 1, zIndex: 3, filter: "none" },
  1: {
    x: "58%",
    scale: 0.78,
    rotateY: -24,
    opacity: 0.55,
    zIndex: 2,
    filter: "grayscale(0.2) brightness(0.92)",
  },
  2: {
    x: "-58%",
    scale: 0.78,
    rotateY: 24,
    opacity: 0.55,
    zIndex: 2,
    filter: "grayscale(0.2) brightness(0.92)",
  },
} as const;

export function PhoneCarousel({
  screens,
}: {
  screens: { label: string; content: ReactNode }[];
}) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const count = screens.length;

  useEffect(() => {
    if (prefersReducedMotion || paused) return;
    const id = window.setInterval(() => {
      setActive((current) => (current + 1) % count);
    }, AUTO_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [prefersReducedMotion, paused, count]);

  function goTo(next: number) {
    setActive(((next % count) + count) % count);
  }

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative h-[360px] w-full sm:h-[420px] md:h-[460px]"
        style={{ perspective: 1400 }}
      >
        {screens.map((screen, i) => {
          const role = ((i - active + count) % count) as 0 | 1 | 2;
          const style = ROLE_STYLE[role];
          return (
            <motion.div
              key={screen.label}
              className="absolute inset-0 m-auto h-full w-[190px] sm:w-[215px] md:w-[235px]"
              animate={{
                x: style.x,
                scale: style.scale,
                rotateY: style.rotateY,
                opacity: style.opacity,
                filter: style.filter,
              }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.6,
                ease: "easeInOut",
              }}
              style={{ zIndex: style.zIndex }}
            >
              <PhoneFrame>{screen.content}</PhoneFrame>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center gap-5">
        <button
          type="button"
          onClick={() => goTo(active - 1)}
          aria-label="Previous screen"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1B1512] text-[#FFD904] transition-transform hover:scale-105"
        >
          <ChevronIcon direction="left" />
        </button>

        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Resume auto-rotate" : "Pause auto-rotate"}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1B1512] text-[#FFD904] transition-transform hover:scale-105"
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </button>

        <button
          type="button"
          onClick={() => goTo(active + 1)}
          aria-label="Next screen"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1B1512] text-[#FFD904] transition-transform hover:scale-105"
        >
          <ChevronIcon direction="right" />
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={screens[active].label}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
          className="mt-3 text-sm font-semibold text-foreground/70"
        >
          {screens[active].label}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
