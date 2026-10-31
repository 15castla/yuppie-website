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
  | "openInviteApp"
  | "concierge"
  | "messages"
  | "notifications"
  | "photoGate"
  | "paidPlans";

export type Flags = Record<FlagName, boolean>;

export const FLAG_NAMES: readonly FlagName[] = [
  "openInvite",
  "openInviteApp",
  "concierge",
  "messages",
  "notifications",
  "photoGate",
  "paidPlans",
];

export const flags: Flags = {
  openInvite: process.env.NEXT_PUBLIC_MEMBERS_OPEN_INVITE === "on",
  // Open Invite decision 6: on for the web first, hidden in the app until the feed is busier. The app shows Open
  // Invite only when both this and openInvite are on (openInviteOn below). Default off.
  openInviteApp: process.env.NEXT_PUBLIC_MEMBERS_OPEN_INVITE_APP === "on",
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
    openInviteApp: false,
    concierge: false,
    messages: false,
    notifications: false,
    photoGate: false,
    paidPlans: false,
  };
}

// Is Open Invite on for this shell? The web: openInvite. The app: openInvite AND openInviteApp (decision 6).
export function openInviteOn(mode: "web" | "app", f: Pick<Flags, "openInvite" | "openInviteApp"> = flags): boolean {
  return f.openInvite && (mode === "web" || f.openInviteApp);
}

// Is Messages on for this shell? Every chat belongs to an Open Invite, so in the app Messages follows Open Invite:
// while Open Invite is hidden there (decision 6), so is Messages (no route, no icon, no actions). The web: messages.
export function messagesOn(mode: "web" | "app", f: Pick<Flags, "messages" | "openInvite" | "openInviteApp"> = flags): boolean {
  return f.messages && (mode === "web" || openInviteOn(mode, f));
}
