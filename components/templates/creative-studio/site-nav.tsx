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

// navigator.userAgent never changes mid-session, so there's nothing to
// subscribe to — this only exists to give useSyncExternalStore a stable
// no-op subscription.
function subscribeToNothing() {
  return () => {};
}

// getServerSnapshot (and therefore the client's first render, before
// hydration) returns true: the safe side, forcing a hard navigation,
// since the native app's "YuppieNativeApp" UA marker (see
// capacitor.config.ts's appendUserAgent) is only knowable once navigator
// is available. That keeps server and client's first paint identical — no
// hydration mismatch — with the real value taking over immediately after.
function useForceHardNavigation(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => isNativeAppUserAgent(navigator.userAgent),
    () => true,
  );
}

function NavLinkItem({
  label,
  href,
  forceHardNavigation,
}: {
  label: string;
  href: string;
  forceHardNavigation: boolean;
}) {
  const className =
    "text-xs text-foreground/80 transition-colors hover:text-foreground md:text-sm";

  // A plain <a>, not <Link>, either because href is already external or
  // because forceHardNavigation says we're in the native app: see the
  // comment on useForceHardNavigation above for why a native tap needs a
  // full reload here instead of Next's client-side transition.
  if (!href.startsWith("/") || forceHardNavigation) {
    return (
      <li className="shrink-0">
        <a href={href} className={className}>
          {label}
        </a>
      </li>
    );
  }

  return (
    <li className="shrink-0">
      <Link href={href} className={className}>
        {label}
      </Link>
    </li>
  );
}

export function SiteNav() {
  // These links point at the public marketing/signup site and the member
  // login entry point. In the native app, proxy.ts's
  // NATIVE_APP_REDIRECT_PATHS check (which keeps the native shell
  // members-only) only ever sees an actual network request — a <Link>
  // tap that the client router resolves without one bypasses it
  // entirely, which is exactly how a logged-in member could reach the
  // public homepage or signup form from inside the app. Rendering these
  // as plain <a> tags instead, only inside the native app, forces every
  // tap into a full document navigation, so that existing redirect
  // applies exactly as it does on a cold launch. Ordinary web visitors
  // are unaffected and keep the normal client-side transitions.
  const forceHardNavigation = useForceHardNavigation();

  return (
    <nav className="absolute left-1/2 top-2 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-b-2xl bg-background md:top-4 md:max-w-none md:rounded-b-3xl">
      <ul
        className="flex items-center gap-5 overflow-x-auto whitespace-nowrap px-5 py-2.5 sm:gap-7 md:gap-9 md:px-9 lg:gap-11 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {NAV_ITEMS.map((item) => (
          <NavLinkItem
            key={item.label}
            {...item}
            forceHardNavigation={forceHardNavigation}
          />
        ))}
      </ul>
    </nav>
  );
}
