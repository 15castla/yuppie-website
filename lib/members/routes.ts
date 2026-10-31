// The one list of members-area routes (BUILD_BRIEF section 6), and what the
// shell needs to know about each: which tab is lit, whether the messages icon
// shows, whether the tab bar is replaced by the page's own docked bar, and
// which feature flag hides the route. Links and redirects use ROUTES and the
// href helpers, never a hand-typed "/members/..." string.
//
// Pure data and string functions (no React, no next/*), so the server layout,
// the client shell and the preview harness all use it.
//
// Adding a route: add it to ROUTES, then one entry to ROUTE_TABLE. The shell
// picks the tab, the messages icon and the dock up from the table.

import { flags as liveFlags, openInviteOn, type FlagName, type Flags } from "./flags";

export type TabKey = "invite" | "events" | "concierge" | "discounts" | "access";

export const ROUTES = {
  /** Not a page: redirects to the landing page (see landingPath). */
  root: "/members",
  openInvite: "/members/open-invite",
  openInviteNew: "/members/open-invite/new",
  /** "Posted.": the page after posting, so the tab bar comes back (the form has its own docked button). */
  openInviteDone: "/members/open-invite/new/done",
  openInviteYours: "/members/open-invite/yours",
  events: "/members/events",
  /** Your plans: the club events you have booked. A sub page of Events. */
  plans: "/members/plans",
  discounts: "/members/discounts",
  access: "/members/access",
  concierge: "/members/concierge",
  messages: "/members/messages",
  you: "/members/you",
  youNotifications: "/members/you/notifications",
  youPayments: "/members/you/payments",
  youBlocked: "/members/you/blocked",
  /** In-app Help (the native app redirects the public /faq, /contact and /privacy out of the app). */
  youHelp: "/members/you/help",
  youHelpFaq: "/members/you/help/faq",
  youHelpContact: "/members/you/help/contact",
  youHelpPrivacy: "/members/you/help/privacy",
  /** Change photo (from You). */
  youPhoto: "/members/you/photo",
  /** The photo gate: full screen, no tabs, shown until a photo is saved. */
  photo: "/members/photo",
  /** The membership gate (A-D4): a paused or ended member sees this and nothing else. Full screen, no tabs. */
  membership: "/members/membership",
  /** Not a page: opens the Stripe billing portal (Manage, Update card; the payment-failed email links here). */
  billing: "/members/billing",
  /** Kept: edit your details. Not renamed, so saved links keep working. */
  profileEdit: "/members/profile/edit",
  /** Legacy: redirects to You. Do not link to it. */
  profile: "/members/profile",
} as const;

// Dynamic routes.
export const openInviteHref = (id: string) => `${ROUTES.openInvite}/${encodeURIComponent(id)}`;
/** An event's calendar file (Add to calendar; the booking email links here). */
export const eventCalendarHref = (slug: string) => `${eventHref(slug)}/calendar.ics`;
/** The host's edit form for their plan (the post form again). A sub page of the plan. */
export const openInviteEditHref = (id: string) => `${openInviteHref(id)}/edit`;
/** A paid plan's receipt (paid plans flag). A sub page of the plan. */
export const openInviteReceiptHref = (id: string) => `${openInviteHref(id)}/receipt`;
/** One paid plan's payments, for its host (You > Payments > a plan). */
export const youPaymentsPlanHref = (id: string) => `${ROUTES.youPayments}/${encodeURIComponent(id)}`;
export const eventHref = (slug: string) => `${ROUTES.events}/${encodeURIComponent(slug)}`;
export const messageThreadHref = (chatId: string) =>
  `${ROUTES.messages}/${encodeURIComponent(chatId)}`;

export type RouteDef = {
  /** Stable id, for the preview harness and notes. */
  id: string;
  /** Path with [param] segments, as in the app directory. */
  pattern: string;
  /** The feature flag that must be on, else the page 404s (requireFlag). */
  flag?: FlagName;
  /** The tab that is lit (null: none, e.g. You, Messages). */
  tab: TabKey | null;
  /** The messages icon: "show" on Open Invite pages, "current" on the Messages pages themselves, "none" elsewhere. */
  messages: "none" | "show" | "current";
  /** "tabs": the shell's tab bar. "own": the page draws its own docked bar in the same slot (event bar, plan bar, composer), so the shell draws none. */
  dock: "tabs" | "own";
  /** "bare": no bar, header or dock at all (the photo gate). */
  chrome?: "full" | "bare";
  /** The member's photo button is the current page (You and its sub pages). */
  you?: boolean;
};

export const ROUTE_TABLE: readonly RouteDef[] = [
  { id: "openInvite", pattern: ROUTES.openInvite, flag: "openInvite", tab: "invite", messages: "show", dock: "tabs" },
  { id: "openInviteNew", pattern: ROUTES.openInviteNew, flag: "openInvite", tab: "invite", messages: "none", dock: "own" },
  { id: "openInviteDone", pattern: ROUTES.openInviteDone, flag: "openInvite", tab: "invite", messages: "none", dock: "tabs" },
  { id: "openInviteYours", pattern: ROUTES.openInviteYours, flag: "openInvite", tab: "invite", messages: "show", dock: "tabs" },
  { id: "openInviteDetail", pattern: `${ROUTES.openInvite}/[id]`, flag: "openInvite", tab: "invite", messages: "show", dock: "own" },
  { id: "openInviteEdit", pattern: `${ROUTES.openInvite}/[id]/edit`, flag: "openInvite", tab: "invite", messages: "none", dock: "own" },
  { id: "openInviteReceipt", pattern: `${ROUTES.openInvite}/[id]/receipt`, flag: "paidPlans", tab: "invite", messages: "show", dock: "tabs" },
  { id: "events", pattern: ROUTES.events, tab: "events", messages: "none", dock: "tabs" },
  { id: "eventDetail", pattern: `${ROUTES.events}/[slug]`, tab: "events", messages: "none", dock: "own" },
  { id: "plans", pattern: ROUTES.plans, tab: "events", messages: "none", dock: "tabs" },
  { id: "discounts", pattern: ROUTES.discounts, tab: "discounts", messages: "none", dock: "tabs" },
  { id: "access", pattern: ROUTES.access, tab: "access", messages: "none", dock: "tabs" },
  { id: "concierge", pattern: ROUTES.concierge, flag: "concierge", tab: "concierge", messages: "none", dock: "tabs" },
  { id: "messages", pattern: ROUTES.messages, flag: "messages", tab: null, messages: "current", dock: "own" },
  { id: "messageThread", pattern: `${ROUTES.messages}/[chatId]`, flag: "messages", tab: null, messages: "current", dock: "own" },
  { id: "you", pattern: ROUTES.you, tab: null, messages: "none", dock: "tabs", you: true },
  { id: "youNotifications", pattern: ROUTES.youNotifications, flag: "notifications", tab: null, messages: "none", dock: "tabs", you: true },
  { id: "youPayments", pattern: ROUTES.youPayments, flag: "paidPlans", tab: null, messages: "none", dock: "tabs", you: true },
  { id: "youPaymentsPlan", pattern: `${ROUTES.youPayments}/[id]`, flag: "paidPlans", tab: null, messages: "none", dock: "tabs", you: true },
  { id: "youBlocked", pattern: ROUTES.youBlocked, flag: "messages", tab: null, messages: "none", dock: "tabs", you: true },
  { id: "youHelp", pattern: ROUTES.youHelp, tab: null, messages: "none", dock: "tabs", you: true },
  { id: "youHelpFaq", pattern: ROUTES.youHelpFaq, tab: null, messages: "none", dock: "tabs", you: true },
  { id: "youHelpContact", pattern: ROUTES.youHelpContact, tab: null, messages: "none", dock: "tabs", you: true },
  { id: "youHelpPrivacy", pattern: ROUTES.youHelpPrivacy, tab: null, messages: "none", dock: "tabs", you: true },
  { id: "youPhoto", pattern: ROUTES.youPhoto, flag: "photoGate", tab: null, messages: "none", dock: "tabs", you: true },
  { id: "photo", pattern: ROUTES.photo, flag: "photoGate", tab: null, messages: "none", dock: "own", chrome: "bare" },
  { id: "membership", pattern: ROUTES.membership, tab: null, messages: "none", dock: "own", chrome: "bare" },
  { id: "profileEdit", pattern: ROUTES.profileEdit, tab: null, messages: "none", dock: "tabs", you: true },
];

function normalise(pathname: string): string {
  const path = pathname.split(/[?#]/)[0];
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

// Static segments beat [param] segments, so /members/open-invite/new is never
// read as an invite whose id is "new".
function matchScore(pattern: string, path: string): number {
  const want = pattern.split("/");
  const have = path.split("/");
  if (want.length !== have.length) return -1;
  let score = 0;
  for (let i = 0; i < want.length; i += 1) {
    if (want[i].startsWith("[") && want[i].endsWith("]")) {
      if (have[i] === "") return -1;
    } else if (want[i] === have[i]) {
      score += 1;
    } else {
      return -1;
    }
  }
  return score;
}

export function matchRoute(pathname: string): RouteDef | null {
  const path = normalise(pathname);
  let best: RouteDef | null = null;
  let bestScore = -1;
  for (const route of ROUTE_TABLE) {
    const score = matchScore(route.pattern, path);
    if (score > bestScore) {
      best = route;
      bestScore = score;
    }
  }
  return best;
}

// Where a member lands after login: Open Invite when it is on, else Events.
// With a mode, the app follows its own switch (openInviteApp, Open Invite decision 6); without one, the web.
export function landingPath(f: Pick<Flags, "openInvite"> & Partial<Pick<Flags, "openInviteApp">> = liveFlags, mode: "web" | "app" = "web"): string {
  return openInviteOn(mode, { openInvite: f.openInvite, openInviteApp: f.openInviteApp ?? false }) ? ROUTES.openInvite : ROUTES.events;
}

// What a "back to the start" link calls the landing page.
export function landingLabel(f: Pick<Flags, "openInvite"> & Partial<Pick<Flags, "openInviteApp">> = liveFlags, mode: "web" | "app" = "web"): string {
  return landingPath(f, mode) === ROUTES.openInvite ? "Open Invite" : "Events";
}

export function activeTabFor(pathname: string): TabKey | null {
  return matchRoute(pathname)?.tab ?? null;
}

// The messages icon: only ever on Open Invite pages (and the Messages pages
// themselves, where it is the current page). Callers also require
// flags.messages, because the icon opens a flagged route.
export function messagesIconFor(pathname: string): "none" | "show" | "current" {
  return matchRoute(pathname)?.messages ?? "none";
}

// True on /members/events/<slug> only. The event page draws its own fixed
// price and booking bar in the tab bar's slot, so the dock is hidden there.
// Same rule as the old members-nav.tsx; kept identical.
export function isEventDetailPath(pathname: string): boolean {
  return /^\/members\/events\/[^/]+\/?$/.test(pathname);
}

// Whether the shell draws its own dock (the tab bar) on this path.
export function dockFor(pathname: string): "tabs" | "own" {
  if (isEventDetailPath(pathname)) return "own";
  return matchRoute(pathname)?.dock ?? "tabs";
}

export function chromeFor(pathname: string): "full" | "bare" {
  return matchRoute(pathname)?.chrome ?? "full";
}

// The photo button is the current page on You and its sub pages.
export function isYouPath(pathname: string): boolean {
  return matchRoute(pathname)?.you === true;
}

// The flag a path needs, if any (for tests and for the shell; each page still
// calls requireFlag itself).
export function flagFor(pathname: string): FlagName | undefined {
  return matchRoute(pathname)?.flag;
}
