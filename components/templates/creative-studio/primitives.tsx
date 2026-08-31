"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

// Grain speckles are tinted with --foreground's own RGB (27,21,18 -> 0-1)
// rather than white — the template's original noise was pure white for a
// dark page; on Yuppie's light-yellow page a dark speckle is the equivalent
// "grain on stock" texture, and it keeps the whole page within the two
// yellows + two near-blacks rule (no third, unaccounted-for color hiding in
// an SVG filter).
function noiseDataUri(baseFrequency: number, numOctaves: number) {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>` +
    `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${baseFrequency}' numOctaves='${numOctaves}' stitchTiles='stitch'/>` +
    `<feColorMatrix values='0 0 0 0 0.1059 0 0 0 0 0.0824 0 0 0 0 0.0706 0 0 0 0.55 0'/></filter>` +
    `<rect width='100%' height='100%' filter='url(#n)'/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

const OVERLAY_NOISE = noiseDataUri(0.85, 3);
const BG_NOISE = noiseDataUri(0.9, 4);

// Same layered-radial-highlight structure the template used, just inverted:
// the template lit soft cream/gold highlights over a near-black base; this
// lights soft pale-yellow (--background-muted, 255 243 176) and near-black
// (--foreground, 27 21 18) accents over the vivid yellow base
// (--background, 255 217 4) instead. Kept as hardcoded rgba (matching how
// the original hardcoded its own palette here rather than reading CSS
// vars) so the alpha blending works — the RGB triples are exactly the two
// tokens above, nothing invented.
const HERO_GRADIENT =
  "radial-gradient(45% 45% at 28% 30%, rgba(27,21,18,0.03), transparent 70%)," +
  "radial-gradient(42% 42% at 73% 62%, rgba(255,243,176,0.55), transparent 72%)," +
  "radial-gradient(70% 55% at 50% 112%, rgba(27,21,18,0.04), transparent 72%)," +
  "#ffd904";

const CARD_GRADIENT =
  "radial-gradient(55% 55% at 32% 28%, rgba(27,21,18,0.03), transparent 70%)," +
  "radial-gradient(50% 50% at 72% 78%, rgba(255,243,176,0.55), transparent 72%)," +
  "#ffd904";

const VIGNETTE =
  "radial-gradient(125% 120% at 50% 0%, transparent 75%, rgba(27,21,18,0.08) 100%)";

export function NoiseOverlay({
  variant = "overlay",
  className,
}: {
  variant?: "overlay" | "bg";
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
      style={{
        backgroundImage: variant === "overlay" ? OVERLAY_NOISE : BG_NOISE,
        backgroundSize: "160px 160px",
      }}
    />
  );
}

export function CinematicBackground({
  variant = "hero",
  className,
}: {
  variant?: "hero" | "card";
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div
      aria-hidden
      className={cn(
        "absolute inset-0 overflow-hidden bg-background",
        className,
      )}
    >
      <motion.div
        className="absolute -inset-1/3"
        style={{
          background: variant === "hero" ? HERO_GRADIENT : CARD_GRADIENT,
          filter: "blur(40px)",
        }}
        animate={
          reduce
            ? undefined
            : {
                x: ["-3%", "3%", "-3%"],
                y: ["-2%", "2%", "-2%"],
                rotate: [0, 6, 0],
                scale: [1, 1.12, 1],
              }
        }
        transition={{
          duration: 34,
          repeat: Infinity,
          repeatType: "mirror",
          ease: "easeInOut",
        }}
      />
      <div className="absolute inset-0" style={{ background: VIGNETTE }} />
    </div>
  );
}

function WithAsterisk({ word }: { word: string }) {
  const chars = Array.from(word);
  const last = chars.pop() ?? "";
  return (
    <>
      {chars.join("")}
      <span className="relative inline-block">
        {last}
        <span className="absolute -end-[0.3em] top-[0.1em] text-[0.31em]">
          *
        </span>
      </span>
    </>
  );
}

export function WordsPullUp({
  text,
  className,
  wordClassName,
  showAsterisk = false,
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  showAsterisk?: boolean;
}) {
  const words = text.split(" ");

  return (
    <span
      className={cn("inline-flex flex-wrap", className)}
      style={{ columnGap: "0.25em" }}
    >
      {words.map((word, i) => {
        const last = i === words.length - 1;
        return (
          <span key={i} className={cn("inline-block", wordClassName)}>
            {last && showAsterisk ? <WithAsterisk word={word} /> : word}
          </span>
        );
      })}
    </span>
  );
}

export type StyledSegment = { text: string; className?: string };

export function WordsPullUpMultiStyle({
  segments,
  className,
}: {
  segments: StyledSegment[];
  className?: string;
}) {
  return (
    <span className={className}>
      {segments.map((seg, i) => (
        <React.Fragment key={i}>
          {i > 0 ? " " : null}
          <span className={seg.className}>{seg.text}</span>
        </React.Fragment>
      ))}
    </span>
  );
}

export function ScrollRevealText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <p aria-label={text} className={className}>
      {text}
    </p>
  );
}
