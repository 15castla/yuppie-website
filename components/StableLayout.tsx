import { Children, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

// Layout helpers for the login cards. StepStack keeps a card the same
// height across its steps; MessageSlot shows a form message without a
// permanently reserved gap.

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

// A form message (error or notice) that takes no space until there is
// one, then grows in (.message-grow-in in globals.css) rather than
// popping in or sitting in a permanently reserved, empty slot.
//
// Screen readers: a live region only reliably announces changes inside a
// region already in the page, not one that mounts holding its message.
// So the text is rendered twice: into a visually hidden live region that
// is always mounted (absolutely positioned, so it takes no space and adds
// no flex gap), which is what gets announced, and into the visible,
// animated copy, which is aria-hidden so it isn't read twice. Pass `id`
// to point an input's aria-describedby at the announced text.
//
// `parentGap` (px): inside a flex column with its own `gap`, a message
// mounting would add that whole gap at once. This animates its margin
// from -gap (cancelling it) to 8px - gap instead, so it still grows from
// nothing and ends 8px below whatever is above it.
export function MessageSlot({
  id,
  className,
  parentGap = 0,
  children,
}: {
  id?: string;
  className?: string;
  parentGap?: number;
  children?: ReactNode;
}) {
  const hasMessage = Children.toArray(children).some((child) => child !== "");
  const gapStyle = parentGap
    ? ({
        "--message-gap-from": `${-parentGap}px`,
        "--message-gap-to": `${8 - parentGap}px`,
      } as CSSProperties)
    : undefined;
  return (
    <>
      <div id={id} aria-live="polite" aria-atomic="true" className="sr-only">
        {children}
      </div>
      {hasMessage && (
        <div aria-hidden className={cn("message-grow-in", className)} style={gapStyle}>
          <div>{children}</div>
        </div>
      )}
    </>
  );
}
