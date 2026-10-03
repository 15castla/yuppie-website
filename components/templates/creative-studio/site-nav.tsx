"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { isNativeAppUserAgent } from "@/lib/native-app";

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

// navigator.userAgent never changes mid-session, so there's nothing to
// subscribe to — this only exists to give useSyncExternalStore a stable
// no-op subscription.
function subscribeToNothing() {
  return () => {};
}

// getServerSnapshot (and therefore the client's first render, before
// hydration) returns true: the safe side, hiding this nav, since the
// native app's "YuppieNativeApp" UA marker (see capacitor.config.ts's
// appendUserAgent) is only knowable once navigator is available. That
// keeps server and client's first paint identical — no hydration
// mismatch — and the native app's ~3s splash screen (see
// capacitor.config.ts's SplashScreen plugin) covers the moment the real
// value takes over right after mount, so there's no visible flash of this
// nav in practice.
function useIsNativeApp(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => isNativeAppUserAgent(navigator.userAgent),
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
