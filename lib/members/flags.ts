// Members area feature flags. Every flag is OFF unless its environment
// variable is exactly "on". They gate screens that are built but have no
// backend yet (see BUILD_BRIEF section 2): switching one on locally or on a
// Vercel preview shows the screen running on its example-data adapter
// (lib/members/mock/). On the live site (VERCEL_ENV=production) the same
// screens still 404 because assertMockAllowed() refuses, unless the server
// switch MEMBERS_SHOW_EXAMPLES=on is set there too: then they show, each
// marked "Example screen" (lib/members/mock/guard.ts, kit/example-note.tsx).
//
// The variables are NEXT_PUBLIC_ so the client-side shell can read the same
// value as the server. Each one is spelled out in full below: Next only
// inlines NEXT_PUBLIC_ variables into the browser bundle when they are
// written as a literal `process.env.NEXT_PUBLIC_X`, never through a lookup.
import { notFound } from "next/navigation";

export type FlagName =
  | "openInvite"
  | "concierge"
  | "messages"
  | "notifications"
  | "photoGate"
  | "paidPlans";

export type Flags = Record<FlagName, boolean>;

export const FLAG_NAMES: readonly FlagName[] = [
  "openInvite",
  "concierge",
  "messages",
  "notifications",
  "photoGate",
  "paidPlans",
];

export const flags: Flags = {
  openInvite: process.env.NEXT_PUBLIC_MEMBERS_OPEN_INVITE === "on",
  concierge: process.env.NEXT_PUBLIC_MEMBERS_CONCIERGE === "on",
  messages: process.env.NEXT_PUBLIC_MEMBERS_MESSAGES === "on",
  notifications: process.env.NEXT_PUBLIC_MEMBERS_NOTIFICATIONS === "on",
  photoGate: process.env.NEXT_PUBLIC_MEMBERS_PHOTO_GATE === "on",
  paidPlans: process.env.NEXT_PUBLIC_MEMBERS_PAID_PLANS === "on",
};

// A hidden route's first line: `requireFlag("openInvite")`. 404s when the
// flag is off, exactly as if the route did not exist.
export function requireFlag(name: FlagName): void {
  if (!flags[name]) notFound();
}

// A Flags object with everything off, for building a custom set
// (the preview harness uses this: app/dev-preview).
export function noFlags(): Flags {
  return {
    openInvite: false,
    concierge: false,
    messages: false,
    notifications: false,
    photoGate: false,
    paidPlans: false,
  };
}
