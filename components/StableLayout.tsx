import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Both components stack their layers in a single grid cell, so the cell
// is always as tall as its tallest layer at the current width (text
// wrapping included) without measuring anything in JS. Used by the login
// cards so they don't resize when an error appears or the step changes.

// Renders every step at once, showing only `active`. The others keep
// their space but are invisible and inert (not focusable, hidden from
// assistive tech), so switching steps never changes the container's
// height. Steps are top-aligned so controls shared between steps (an
// input, a submit button) sit at the same position in each.
//
// Transitions are switched off inside hidden layers: `visibility` is
// inherited and animatable, so a descendant with `transition-all` (e.g.
// <Button>) would otherwise keep showing for its whole transition after
// its step is hidden, overlapping the next step's controls.
export function StepStack<K extends string>({
  active,
  steps,
}: {
  active: K;
  steps: Record<K, ReactNode>;
}) {
  return (
    <div className="grid">
      {(Object.keys(steps) as K[]).map((key) => (
        <div
          key={key}
          inert={key !== active}
          className={cn(
            "[grid-area:1/1]",
            key !== active && "invisible [&_*]:transition-none",
          )}
        >
          {steps[key]}
        </div>
      ))}
    </div>
  );
}

// Reserves room for the longest of `reserve` (every message this slot can
// show), so a message appearing or disappearing doesn't change the
// height. `children` is what's currently shown; it's a polite live
// region, which works now that the slot is always in the DOM.
export function MessageSlot({
  reserve,
  className,
  children,
}: {
  reserve: string[];
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`grid ${className ?? ""}`}>
      {reserve.map((message) => (
        <p key={message} aria-hidden className="invisible [grid-area:1/1]">
          {message}
        </p>
      ))}
      <div aria-live="polite" className="[grid-area:1/1]">
        {children}
      </div>
    </div>
  );
}
