"use client";

import { useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";
import { Button } from "@/components/Button";
import { ShowcaseSection } from "./ShowcaseSection";

const ENTRANCE_VARIANTS = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1 },
};

const ENTRANCE_TRANSITION = { duration: 1.5, ease: "easeOut" as const };

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

// Progress split across the pinned frame's 0→1 scroll range, defined by
// three absolute scroll distances (at a 800px-tall viewport):
//   entrance (scrim rise + text fade-in): 100px — untouched, confirmed-good
//     pace since the first version of this sequence.
//   hold: 120px — untouched. A previous pass cut this to 50px to shrink the
//     gap to the next section; that made it too short to read and was
//     reverted, so it's off-limits to further cuts.
//   exit (text fade-out + button fade-in, ending exactly at release): 60px
//     — cut further from 100px specifically to close up the stretch of
//     plain yellow between the club sentence and the app section, since
//     that's the part the hold restore didn't touch.
// Total pin room = 280px, driver height = 135dvh (100dvh viewport + 35dvh).
// ShowcaseSection's own lead-in padding was also trimmed further (see that
// file) to shave a bit more off the post-release reveal.
//   0.000000–0.214286  scrim rises, fully covers the logo
//   0.214286–0.357143  headline + subline fade in (still rising out of the scrim's cover)
//   0.357143–0.785714  hold — nothing animates, full time to read both lines
//   0.785714–1.000000  headline + subline fade out, button fades in over the same span,
//                      both finishing exactly as the pin releases — no idle tail
const SCRIM_RANGE: [number, number] = [0, 0.214286];
const HEADLINE_RANGE: [number, number] = [0.214286, 0.328571];
const SUBLINE_RANGE: [number, number] = [0.257143, 0.357143];
const TEXT_EXIT_RANGE: [number, number] = [0.785714, 1];
const BUTTON_RANGE: [number, number] = [0.785714, 1];

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

// Fraction of `progress` between range[0] and range[1], clamped to [0, 1].
function clampedProgress(progress: number, range: readonly [number, number]) {
  const [start, end] = range;
  if (end === start) return progress >= end ? 1 : 0;
  return Math.min(1, Math.max(0, (progress - start) / (end - start)));
}

function HeroLogo() {
  return (
    <div className="flex flex-col items-center gap-3 sm:gap-4">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={ENTRANCE_VARIANTS}
        transition={{ ...ENTRANCE_TRANSITION, delay: 0.3 }}
      >
        <Image
          src="/yuppie_logo_forte_forward.png"
          alt="Yuppie"
          width={1942}
          height={641}
          priority
          className="h-auto w-[85vw] max-w-[900px]"
        />
      </motion.div>

      <motion.p
        initial="hidden"
        animate="visible"
        variants={ENTRANCE_VARIANTS}
        transition={{ ...ENTRANCE_TRANSITION, delay: 0.3 }}
        className="max-w-md text-lg text-foreground/70 sm:text-xl"
      >
        Your Social Life, Curated
      </motion.p>
    </div>
  );
}

export default function Home() {
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotion,
    getReducedMotionServerSnapshot,
  );

  const heroRef = useRef<HTMLDivElement>(null);
  // "end end" (not "end start") so progress 0→1 spans exactly the CSS-sticky
  // frame's real pinned window (driver height − viewport height). "end start"
  // instead spans the driver's *full* height, which is 2x too long here —
  // it made every stage run at half speed and let the sticky frame release
  // mid-"hold", before the progress-driven content had finished animating.
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end end"],
  });

  // Function-form useTransform (not the [inputRange, outputRange] array
  // form) deliberately: this framer-motion version silently offloads
  // array-form range transforms into a native WAAPI ViewTimeline animation
  // for GPU acceleration, and that native timeline does not reproduce this
  // useScroll's custom offset ("start start" → "end end") correctly — it
  // substitutes a different progress source, so opacity/position went out
  // of sync with the real scroll position. An arbitrary JS callback can't
  // be expressed as a static native keyframe timeline, which forces the
  // plain per-frame JS update path and keeps every value tied to the exact
  // same scrollYProgress number.
  const scrimY = useTransform(
    scrollYProgress,
    (p) => `${(1 - clampedProgress(p, SCRIM_RANGE)) * 100}%`,
  );
  // Enter (fade in) multiplied by the inverse of exit (fade out): 1 while
  // holding between the two ranges, ramping correctly at either end even
  // where they'd otherwise overlap.
  const headlineOpacity = useTransform(
    scrollYProgress,
    (p) =>
      clampedProgress(p, HEADLINE_RANGE) *
      (1 - clampedProgress(p, TEXT_EXIT_RANGE)),
  );
  const headlineY = useTransform(
    scrollYProgress,
    (p) => (1 - clampedProgress(p, HEADLINE_RANGE)) * 32,
  );
  const sublineOpacity = useTransform(
    scrollYProgress,
    (p) =>
      clampedProgress(p, SUBLINE_RANGE) *
      (1 - clampedProgress(p, TEXT_EXIT_RANGE)),
  );
  const sublineY = useTransform(
    scrollYProgress,
    (p) => (1 - clampedProgress(p, SUBLINE_RANGE)) * 32,
  );

  const buttonOpacity = useTransform(scrollYProgress, (p) =>
    clampedProgress(p, BUTTON_RANGE),
  );
  const buttonPointerEvents = useTransform(scrollYProgress, (value) =>
    value >= BUTTON_RANGE[1] ? "auto" : "none",
  );

  return (
    <>
      <main className="bg-background text-foreground">
        {prefersReducedMotion ? (
          <>
            <div
              ref={heroRef}
              className="flex min-h-dvh flex-col items-center justify-center gap-10 px-6 py-24 text-center sm:gap-12"
            >
              <HeroLogo />
            </div>

            <motion.section
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="flex flex-col items-center gap-4 px-6 py-24 text-center"
            >
              <h2 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
                A Club for Those Who Are Too Fun to Stay at Home.
              </h2>
              <p className="max-w-md text-base text-foreground/80 sm:text-lg">
                Gain access to the events, the doors, and the people that
                make it worth going out for.
              </p>
            </motion.section>
          </>
        ) : (
          <div ref={heroRef} className="relative h-[135dvh]">
            {/*
              Pure CSS `position: sticky` pin: this inner frame sticks to
              top:0 for the full height of the h-[135dvh] driver above it,
              then releases back into normal flow once the driver's bottom
              edge reaches the viewport top. Framer's useScroll/useTransform
              below only compute a 0→1 progress value off that same driver
              ref to drive the scrim/text styles — they do not do the
              pinning themselves.
            */}
            <div className="sticky top-0 flex h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
              <HeroLogo />

              {/*
                Height is 130% of the frame, bottom-anchored, so that at y:"0%"
                the div overshoots past the top of the frame. That pushes the
                gradient's transparent-to-opaque fade band entirely above the
                visible area, guaranteeing solid, fully opaque yellow across
                the whole frame at full coverage — no residual fade line.
              */}
              <motion.div
                aria-hidden
                className="absolute inset-x-0 bottom-0"
                style={{
                  height: "130%",
                  y: scrimY,
                  willChange: "transform",
                  backgroundImage:
                    "linear-gradient(to bottom, rgba(255, 217, 4, 0) 0%, rgba(255, 217, 4, 1) 20%, rgba(255, 217, 4, 1) 100%)",
                }}
              />

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 px-6">
                <motion.h2
                  style={{
                    opacity: headlineOpacity,
                    y: headlineY,
                    willChange: "transform, opacity",
                  }}
                  className="max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl"
                >
                  A Club for Those Who Are Too Fun to Stay at Home.
                </motion.h2>
                <motion.p
                  style={{
                    opacity: sublineOpacity,
                    y: sublineY,
                    willChange: "transform, opacity",
                  }}
                  className="max-w-md text-base text-foreground/80 sm:text-lg"
                >
                  Gain access to the events, the doors, and the people that
                  make it worth going out for.
                </motion.p>
              </div>
            </div>
          </div>
        )}

        <ShowcaseSection />
      </main>

      <motion.div
        style={{
          opacity: prefersReducedMotion ? 1 : buttonOpacity,
          pointerEvents: prefersReducedMotion ? "auto" : buttonPointerEvents,
          willChange: prefersReducedMotion ? undefined : "opacity",
        }}
        className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2"
      >
        <Button href="/apply">Membership</Button>
      </motion.div>

      <Link
        href="/member-login"
        className="fixed right-4 top-4 z-40 text-sm font-medium text-foreground/50 outline-none transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline sm:right-6 sm:top-6"
      >
        Sign in
      </Link>
    </>
  );
}
