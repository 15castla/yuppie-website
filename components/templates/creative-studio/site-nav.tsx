"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { isNativeAppCookie } from "@/lib/native-app";

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
  if (isNativeApp) {
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
