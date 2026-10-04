"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { isNativeAppCookie } from "@/lib/native-app";

// Routes with their own top-level nav/chrome (or that should render with
// no top chrome at all), which this public marketing nav would otherwise
// render on top of. Prefix-matched so nested routes (e.g. /members/profile,
// /admin/applications) are covered without listing each one — route groups
// like app/admin/(protected) don't appear in the URL, so a plain prefix
// check already reaches everything under them.
const NAV_EXCLUDED_PREFIXES = [
  // Has its own MembersNav/MembersBottomBar (app/members/layout.tsx) —
  // this nav rendering on top of it is exactly the collision reported
  // against the "Hey, {firstName}." header.
  "/members",
  // Per spec, renders with no top menu bar at all — also the native
  // app's own server.url entry point (mobile/capacitor.config.ts), so it
  // needs to look chrome-free on the web too, not just in-app.
  "/member-login",
  // Internal staff area (login, password reset, and the authenticated
  // (protected) group) with its own sticky AdminNav header
  // (app/admin/(protected)/layout.tsx) — never part of the public
  // marketing/signup surface this nav links to.
  "/admin",
];

function isNavExcludedRoute(pathname: string): boolean {
  return NAV_EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

const NAV_ITEMS: { label: string; href: string }[] = [
  { label: "Home", href: "/" },
  { label: "Members Area", href: "/member-login" },
  { label: "Membership", href: "/apply" },
  { label: "FAQ's", href: "/faq" },
];

function NavLinkItem({ label, href }: { label: string; href: string }) {
  return href.startsWith("/") ? (
    <li className="shrink-0">
      <Link
        href={href}
        className="text-xs text-foreground/80 transition-colors hover:text-foreground md:text-sm"
      >
        {label}
      </Link>
    </li>
  ) : (
    <li className="shrink-0">
      <a
        href={href}
        className="text-xs text-foreground/80 transition-colors hover:text-foreground md:text-sm"
      >
        {label}
      </a>
    </li>
  );
}

// The is-native-app cookie never changes mid-session, so there's nothing
// to subscribe to — this only exists to give useSyncExternalStore a
// stable no-op subscription.
function subscribeToNothing() {
  return () => {};
}

// getServerSnapshot (and therefore the client's first render, before
// hydration) returns true: the safe side, hiding this nav, since
// document.cookie isn't available during SSR. That keeps server and
// client's first paint identical — no hydration mismatch. The real value
// — read from the is-native-app cookie proxy.ts sets on every request,
// not from navigator.userAgent — arrives with the same HTTP response as
// the document itself, so unlike an earlier version of this check, there
// is no WKWebView-configuration timing left to race: see
// lib/native-app.ts for why navigator.userAgent alone wasn't reliable on
// a cold launch's very first page.
function useIsNativeApp(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => isNativeAppCookie(document.cookie),
    () => true,
  );
}

export function SiteNav() {
  // The native app is members-only end to end (see proxy.ts's
  // NATIVE_APP_REDIRECT_PATHS and mobile/capacitor.config.ts's
  // server.url, which points straight at /member-login) — it should
  // never expose a path to the public marketing/signup site, on any
  // screen, including pre-login. These links lead only to that public
  // site, so the fix is to not render this nav at all inside the native
  // app, rather than trying to make its individual links behave
  // correctly there.
  const isNativeApp = useIsNativeApp();
  const pathname = usePathname();
  if (isNativeApp || isNavExcludedRoute(pathname)) {
    return null;
  }

  return (
    <nav className="absolute left-1/2 top-2 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-b-2xl bg-background md:top-4 md:max-w-none md:rounded-b-3xl">
      <ul
        className="flex items-center gap-5 overflow-x-auto whitespace-nowrap px-5 py-2.5 sm:gap-7 md:gap-9 md:px-9 lg:gap-11 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {NAV_ITEMS.map((item) => (
          <NavLinkItem key={item.label} {...item} />
        ))}
      </ul>
    </nav>
  );
}
