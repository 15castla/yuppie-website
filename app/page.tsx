"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";
import { buttonBaseClasses } from "@/components/Button";
import { ShowcaseSection } from "./ShowcaseSection";

const ENTRANCE_VARIANTS = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1 },
};

const ENTRANCE_TRANSITION = { duration: 1.5, ease: "easeOut" as const };

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

// Progress split across the pinned frame's 0→1 scroll range, defined by
// absolute scroll distances (at a 800px-tall viewport). This is the only
// pinned/scroll-linked stage on the page — everything after it (the "The
// App" heading, the phone mockups, and whatever else follows) is plain,
// unpinned document flow, no scrim, no scroll-linked animation.
//   0–90     scrim rises, fully covers the logo
//   90–130   headline + subline fade in on top of the (now solid) scrim
//   130–250  hold — nothing animates, full time to read both lines, then
//            the pin releases immediately into normal scrolling
// Total pin room = 250px, driver height = 131.25dvh (100dvh viewport + 31.25dvh).
const SCRIM_RANGE: [number, number] = [0, 0.36];
const HEADLINE_RANGE: [number, number] = [0.36, 0.488];
const SUBLINE_RANGE: [number, number] = [0.408, 0.52];

// Largest scroll delta a single wheel/touch input is allowed to apply while
// inside the hero's own range — see the interception effect below.
const MAX_STEP_PX = 40;

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

// Module-level store for "has the user scrolled or tapped yet" — a one-time
// flag, not a value that should ever revert, so it deliberately lives
// outside React state: once true it stays true, independent of scroll
// position, including if the user scrolls back up to the top afterward.
let hasInteracted = false;
const interactionListeners = new Set<() => void>();

function markInteracted() {
  if (hasInteracted) return;
  hasInteracted = true;
  window.removeEventListener("scroll", markInteracted);
  window.removeEventListener("touchstart", markInteracted);
  window.removeEventListener("click", markInteracted);
  interactionListeners.forEach((listener) => listener());
}

function subscribeToInteraction(callback: () => void) {
  interactionListeners.add(callback);
  if (!hasInteracted) {
    window.addEventListener("scroll", markInteracted, { passive: true });
    window.addEventListener("touchstart", markInteracted, { passive: true });
    window.addEventListener("click", markInteracted);
  }
  return () => {
    interactionListeners.delete(callback);
  };
}

function getHasInteracted() {
  return hasInteracted;
}

function getHasInteractedServerSnapshot() {
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
    // mb-24 isn't decorative spacing — it reproduces a real layout effect
    // from the original (pre-redesign) homepage: back then the Apply
    // button sat in normal flow directly below this group (revealed later,
    // but still occupying its box even at opacity:0), which pushed the
    // logo visually above dead-center within the centered flex column. The
    // button is `fixed` now and reserves no space, so without this the
    // logo centers exactly in the middle of the viewport instead — measurably
    // lower than the original composition.
    <div className="mb-24 flex flex-col items-center gap-5 sm:gap-6">
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
  const hasInteractedNow = useSyncExternalStore(
    subscribeToInteraction,
    getHasInteracted,
    getHasInteractedServerSnapshot,
  );

  const heroRef = useRef<HTMLDivElement>(null);
  // Zero-height, invisible marker placed in normal flow directly below
  // HeroLogo (after its mb-24 margin — see the comment on HeroLogo). Its
  // viewport-relative top is where the nav button would sit if it were
  // really an in-flow element under the logo. Because the hero frame is
  // `sticky` and stays pinned to the same on-screen position for the whole
  // scroll range this component measures against, this only needs measuring
  // on mount + resize, not per scroll frame — the anchor's screen position
  // is constant throughout the entire pin.
  const buttonAnchorRef = useRef<HTMLDivElement>(null);
  const [buttonAnchorTop, setButtonAnchorTop] = useState(0);

  useEffect(() => {
    function measure() {
      const el = buttonAnchorRef.current;
      if (!el) return;
      setButtonAnchorTop(el.getBoundingClientRect().top);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [prefersReducedMotion]);

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

  // Entrance only — no exit multiplier. The text settles at full opacity
  // once it's in and never fades, scales, or moves on its own again.
  const headlineOpacity = useTransform(scrollYProgress, (p) =>
    clampedProgress(p, HEADLINE_RANGE),
  );
  const headlineY = useTransform(
    scrollYProgress,
    (p) => (1 - clampedProgress(p, HEADLINE_RANGE)) * 32,
  );
  const sublineOpacity = useTransform(scrollYProgress, (p) =>
    clampedProgress(p, SUBLINE_RANGE),
  );
  const sublineY = useTransform(
    scrollYProgress,
    (p) => (1 - clampedProgress(p, SUBLINE_RANGE)) * 32,
  );

  // Nav button travel: tied to the same scrollYProgress driving the
  // scrim/headline above, but only across SCRIM_RANGE rather than the full
  // 0→1 pin — finishing the trip exactly as the scrim finishes rising, so
  // the button is already tucked at the top before the headline starts
  // fading in over that same vertical band. Spanning the button's travel
  // across the entire pin (tried first) let it visibly pass through/clip
  // the headline text mid-scroll, since both occupy the same centered
  // column at the same time. The nav strip itself stays `position: fixed;
  // top: 0` throughout (unchanged from before); this only adds a
  // translateY of buttonAnchorTop at p===0, easing to 0 by the end of
  // SCRIM_RANGE — a GPU-cheap transform rather than animating `top`
  // directly, consistent with scrimY/headlineY/sublineY above. At p===0 the
  // rendered position exactly overlaps the invisible in-flow anchor below
  // HeroLogo, which is what makes it read as "sitting under the logo" even
  // though it's technically fixed the whole time — the sticky hero frame
  // doesn't move during the pin anyway, so a fixed element with the right
  // translateY is visually indistinguishable from a true in-flow one until
  // the pin releases, at which point it needs to actually be fixed to keep
  // tracking the viewport instead of scrolling away.
  const buttonY = useTransform(
    scrollYProgress,
    (p) => buttonAnchorTop * (1 - clampedProgress(p, SCRIM_RANGE)),
  );

  // A hard trackpad flick or a big mouse-wheel scroll can otherwise skip
  // straight past the whole pinned hero in one native scroll jump, landing
  // in ShowcaseSection without the headline ever having appeared — this is
  // all just one continuous document scroll under the hood, so nothing
  // stops it. Rather than correcting after the fact (tried, reverted — it
  // let the text visibly flash past before snapping back, which read as
  // more broken than the skip itself), intercept the *input* directly:
  // deltas at or under MAX_STEP_PX are left completely alone (untouched
  // native scroll, so ordinary scrolling is unaffected), but anything
  // larger gets capped to MAX_STEP_PX and applied manually. A single big
  // input still moves the page, just by a small step instead of hundreds
  // of pixels — a real flick fires many such events in quick succession as
  // its momentum decays, so it still gets through, just over several
  // clamped steps rather than one jump. Only active while scrollY is
  // inside the closed range [0, driverHeight] — inclusive of both edges on
  // purpose: the most common case is starting a flick from exactly
  // scrollY===0, so a strict `y > 0` check would let that very first big
  // event straight through unclamped (caught by testing: a single 800px
  // wheel event from the top landed at scrollY 800 with no interception at
  // all, because `0 > 0` is false). Symmetrically inclusive at the top edge
  // too, so a big upward scroll starting exactly at the release point is
  // still clamped going back in. Once genuinely outside [0, driverHeight],
  // native scroll takes back over. Skipped entirely under
  // prefers-reduced-motion, since that path has no pin to protect — it's
  // normal document flow.
  useEffect(() => {
    if (prefersReducedMotion) return;

    function withinHeroRange() {
      const hero = heroRef.current;
      if (!hero) return false;
      const driverHeight = hero.getBoundingClientRect().height;
      const y = window.scrollY;
      return y >= 0 && y <= driverHeight;
    }

    function clamp(delta: number) {
      return Math.max(-MAX_STEP_PX, Math.min(MAX_STEP_PX, delta));
    }

    function onWheel(event: WheelEvent) {
      if (Math.abs(event.deltaY) <= MAX_STEP_PX) return;
      if (!withinHeroRange()) return;
      event.preventDefault();
      window.scrollBy(0, clamp(event.deltaY));
    }

    let lastTouchY: number | null = null;

    function onTouchStart(event: TouchEvent) {
      lastTouchY = event.touches[0]?.clientY ?? null;
    }

    function onTouchMove(event: TouchEvent) {
      if (lastTouchY === null) return;
      const currentY = event.touches[0]?.clientY;
      if (currentY === undefined) return;
      const delta = lastTouchY - currentY; // finger moving up = scrolling down
      lastTouchY = currentY;
      if (Math.abs(delta) <= MAX_STEP_PX) return;
      if (!withinHeroRange()) return;
      event.preventDefault();
      window.scrollBy(0, clamp(delta));
    }

    // Both need { passive: false } — they call preventDefault(), which a
    // passive listener is not allowed to do (the call would silently no-op
    // and the browser would still scroll natively past the clamp).
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [prefersReducedMotion]);

  // Fixed top nav strip. z-50 is deliberately higher than anything the
  // pinned hero uses (the scrim and text inside it have no explicit
  // z-index, so they sit at the stacking-context default) — `position:
  // fixed` already puts this in the root stacking context regardless of
  // where in the DOM it's mounted, so it renders above the hero's sticky
  // frame throughout the whole pin, not just before/after it. Background is
  // the same `bg-background` yellow as the rest of the page on purpose —
  // it's meant to be invisible as a "bar", just a fixed-position home for
  // the pill button. `top-0` is its permanent resting position; buttonY
  // (see above) rides on top of that via translateY to fake the in-flow
  // start position during the hero pin. Under reduced motion there's no
  // pin/anchor to travel from, so it's just pinned at top-0 the moment it
  // fades in, same as this component's motion-off behavior everywhere else.
  const topNavUi = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: hasInteractedNow ? 1 : 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.5, ease: "easeOut" as const }}
      style={{
        pointerEvents: hasInteractedNow ? "auto" : "none",
        y: prefersReducedMotion ? 0 : buttonY,
        willChange: "transform",
      }}
      className="fixed inset-x-0 top-0 z-50 flex justify-center bg-background px-4 py-3 sm:py-4"
    >
      {/* !-prefixed on px/py/text-size: buttonBaseClasses already sets its
          own unprefixed px-10/py-4/text-base, and Tailwind's compiled
          utility order isn't guaranteed to follow class-string order across
          two unrelated usages — plain overrides here could just as easily
          lose depending on source-scan order (confirmed the hard way on the
          old floating Membership button). !important forces it regardless.
          gap doesn't need it since buttonBaseClasses never sets one. */}
      <div
        className={`${buttonBaseClasses} gap-6 sm:gap-10 !px-6 !py-3 !text-sm sm:!px-10 sm:!py-4 sm:!text-base`}
      >
        <Link
          href="/apply"
          className="outline-none transition-colors hover:underline focus-visible:underline"
        >
          Membership
        </Link>
        <Link
          href="/member-login"
          className="outline-none transition-colors hover:underline focus-visible:underline"
        >
          Members Area
        </Link>
      </div>
    </motion.div>
  );

  return (
    <>
      <main className="bg-background text-foreground">
        {prefersReducedMotion ? (
          <>
            <div
              ref={heroRef}
              className="flex min-h-dvh flex-col items-center justify-center px-6 text-center"
            >
              <HeroLogo />
            </div>

            <section className="flex flex-col items-center gap-4 px-6 py-24 text-center">
              <h2 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
                A Club for Those Who Are Too Fun to Stay at Home.
              </h2>
              <p className="max-w-md text-base text-foreground/80 sm:text-lg">
                Gain access to the events, the doors, and the people that
                make it worth going out for.
              </p>
            </section>
          </>
        ) : (
          <div ref={heroRef} className="relative h-[131.25dvh]">
            {/*
              Pure CSS `position: sticky` pin: this inner frame sticks to
              top:0 for the full height of the h-[131.25dvh] driver above it,
              then releases back into normal flow once the driver's bottom
              edge reaches the viewport top. Framer's useScroll/useTransform
              above only compute a 0→1 progress value off that same driver
              ref to drive the scrim/text styles — they do not do the
              pinning themselves.
            */}
            <div className="sticky top-0 flex h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
              <HeroLogo />
              <div ref={buttonAnchorRef} aria-hidden className="h-0 w-full" />

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

      {topNavUi}
    </>
  );
}
