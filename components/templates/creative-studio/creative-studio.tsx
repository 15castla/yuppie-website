"use client";

import { cn } from "@/lib/utils";

import { About } from "./about";
import { Features } from "./features";
import { almarai, instrumentSerif } from "./fonts";
import { Footer } from "./footer";
import { Hero } from "./hero";
import { NoiseOverlay } from "./primitives";
import { Pricing } from "./pricing";

export default function CreativeStudio() {
  return (
    <div
      className={cn(
        almarai.variable,
        instrumentSerif.variable,
        "bg-background text-foreground antialiased",
      )}
      style={{
        fontFamily: "var(--font-almarai), ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <Hero />
      {/* About and Features previously each painted their own independent
          flat/gradient background that just happened to abut the next one —
          at the seam, the last pixel of one and the first pixel of the
          other were close but not equal, reading as a hard rendering-glitch
          line rather than an intentional edge. Wrapping both in one shared
          gradient (solid color stops, no alpha) that spans their combined
          height fixes this by construction: there's only one gradient
          function governing the whole span, so there's no boundary to
          mismatch in the first place. Starts and ends on vivid --background
          to hand off cleanly to Hero above (which also rests on vivid) and
          Pricing below (which is still flat vivid), dipping through
          --background-muted in the middle. */}
      <div className="relative bg-gradient-to-b from-background via-background-muted to-background">
        {/* Also moved here from Features' own section: the noise grain was
            previously scoped to Features only, so its texture started
            exactly at the same DOM line as the old per-section backgrounds —
            a small but measurable ~15%-opacity darkening that reintroduced
            a seam even after the background itself became one continuous
            gradient. One NoiseOverlay spanning the whole wrapper keeps the
            grain uniform across both sections too. */}
        <NoiseOverlay variant="bg" className="opacity-[0.15]" />
        <About />
        <Features />
      </div>
      <Pricing />
      <Footer />
    </div>
  );
}
