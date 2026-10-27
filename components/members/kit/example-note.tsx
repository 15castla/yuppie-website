"use client";

// EXAMPLE SCREENS ON THE LIVE SITE. Open Invite, Messages, notifications, paid
// plans and the Concierge have no backend yet: their pages run on invented
// people and places (lib/members/mock). When those pages are switched on for
// real members (MEMBERS_SHOW_EXAMPLES=on, see lib/members/mock/guard.ts) each
// page wraps its view in <ExampleScope>, and the view draws <ExampleNote /> just
// under its title so nobody takes an invented plan for a real one.
//
// Nothing here changes a screen on its own: with no <ExampleScope> above it (the
// preview harness, every real page) ExampleNote draws nothing and useExample()
// is false, so the approved screens and their measurements are untouched.
// When a real backend replaces the adapter for an area, its page drops the
// wrapper, and the note and the "Coming soon" buttons go with it.
//
// NEXT_PUBLIC_MEMBERS_MARK_EXAMPLES=off (lib/members/mock/marking.ts) makes the
// wrapper provide false: the screens then look exactly as they do without it
// (no note, live-looking Pay buttons) while still running on example data.

import { createContext, useContext, type ReactNode } from "react";

import { marksExamples } from "@/lib/members/mock/marking";
import { cn } from "@/lib/utils";

const ExampleContext = createContext(false);

export function ExampleScope({ children }: { children: ReactNode }) {
  return <ExampleContext.Provider value={marksExamples()}>{children}</ExampleContext.Provider>;
}

/** True under an <ExampleScope> that marks its screens as examples (see marking.ts). */
export function useExample(): boolean {
  return useContext(ExampleContext);
}

export const EXAMPLE_WORDS = {
  lead: "Example screen.",
  rest: "The people and places here are made up. Nothing you do is saved, sent or paid yet.",
} as const;

/**
 * `inside`: the note sits in a column that already has the page gutters (a .mk-wrap above it), so it adds none.
 * `lead` and `rest`: other words for a place that is short of room (the chat strip).
 */
export function ExampleNote({
  inside = false,
  lead = EXAMPLE_WORDS.lead,
  rest = EXAMPLE_WORDS.rest,
  className,
}: {
  inside?: boolean;
  lead?: string;
  rest?: string;
  className?: string;
}) {
  if (!useExample()) return null;
  const note = (
    <p className={cn("mk-example", className)} role="note">
      <strong>{lead}</strong> {rest}
    </p>
  );
  return inside ? note : <div className="mk-wrap">{note}</div>;
}
