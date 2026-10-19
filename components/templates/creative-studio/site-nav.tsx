"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

import { cn } from "@/lib/utils";
import { isNativeAppCookie } from "@/lib/native-app";
import { ArrowRightIcon, CloseIcon } from "@/components/site/icons";
import {
  CURRENT_LINK_CLASS,
  PRIMARY_BUTTON_CLASS,
  SITE_CONTAINER_CLASS,
  SITE_FONT_STYLE,
} from "@/components/site/ui";
import { almarai, instrumentSerif } from "./fonts";

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
  // (/member-login is deliberately not listed: on the website it keeps
  // the public nav so visitors arriving via "Members Area" can get back.
  // Inside the native app, where it's the entry screen, SiteNav already
  // renders nothing at all; see useIsNativeApp below.)
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

const SIGN_IN_PATH = "/member-login";

const MENU_ITEMS: { label: string; href: string }[] = [
  { label: "Home", href: "/" },
  { label: "FAQs", href: "/faq" },
  { label: "Contact", href: "/contact" },
  { label: "Members Area", href: SIGN_IN_PATH },
];

// The is-native-app cookie never changes mid-session, so there's nothing
// to subscribe to — this only exists to give useSyncExternalStore a
// stable no-op subscription.
function subscribeToNothing() {
  return () => {};
}

// The real value is read from the is-native-app cookie proxy.ts sets on
// every request, not from navigator.userAgent. It arrives with the same
// HTTP response as the document itself, so there's no
// WKWebView-configuration timing to race: see lib/native-app.ts for why
// navigator.userAgent alone wasn't reliable on a cold launch's very first
// page.
//
// getServerSnapshot (and so the client's first render, before hydration)
// returns false, so the website's header is in the server HTML and the
// page doesn't jump down when it hydrates (the header is in the page's
// flow, not overlaid). Inside the native app that server-rendered header
// is never seen: app/layout.tsx's inline head script marks
// <html data-native-app> from the same cookie before the first paint, and
// globals.css hides [data-site-header] under it. After hydration this
// returns true there and the header isn't rendered at all.
function useIsNativeApp(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => isNativeAppCookie(document.cookie),
    () => false,
  );
}

function Wordmark({ className }: { className: string }) {
  return (
    <Image
      src="/yuppie_logo_forte_forward.png"
      alt="Yuppie"
      width={1942}
      height={641}
      loading="eager"
      className={cn("block w-auto", className)}
    />
  );
}

function isCurrent(pathname: string, href: string) {
  return pathname === href;
}

export function SiteNav() {
  // The native app is members-only end to end (see proxy.ts's
  // NATIVE_APP_REDIRECT_PATHS and mobile/capacitor.config.ts's
  // server.url) — it should never expose a path to the public
  // marketing/signup site, on any screen, including pre-login. These
  // links lead only to that public site, so the fix is to not render this
  // nav at all inside the native app, rather than trying to make its
  // individual links behave correctly there.
  const isNativeApp = useIsNativeApp();
  const pathname = usePathname();
  if (isNativeApp || isNavExcludedRoute(pathname)) {
    return null;
  }
  return <SiteHeader pathname={pathname} />;
}

function SiteHeader({ pathname }: { pathname: string }) {
  // The menu belongs to the page it was opened on, so navigating anywhere
  // (a menu link, back/forward) closes it without an effect.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  const menuOpen = menuOpenOn === pathname;
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const showApply = pathname !== SIGN_IN_PATH;

  const linkClass = (href: string) =>
    cn("inline-flex min-h-11 items-center no-underline hover:opacity-70", isCurrent(pathname, href) && CURRENT_LINK_CLASS);
  const applyPillClass =
    "inline-flex min-h-11 items-center rounded-full bg-foreground text-[15px] font-bold text-background no-underline hover:opacity-85";

  return (
    <header
      data-site-header
      className={cn(almarai.variable, instrumentSerif.variable, "relative z-30 bg-background text-foreground antialiased")}
      style={SITE_FONT_STYLE}
    >
      {/* Desktop: FAQs and Contact | wordmark | Members Area and Apply. */}
      <div className={cn(SITE_CONTAINER_CLASS, "hidden pt-[calc(24px+var(--safe-top))] pb-6 md:block")}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-6">
          <nav aria-label="Main" className="flex flex-wrap items-center gap-x-8 gap-y-2 text-[15px] font-bold">
            <Link href="/faq" aria-current={isCurrent(pathname, "/faq") ? "page" : undefined} className={linkClass("/faq")}>
              FAQs
            </Link>
            <Link
              href="/contact"
              aria-current={isCurrent(pathname, "/contact") ? "page" : undefined}
              className={linkClass("/contact")}
            >
              Contact
            </Link>
          </nav>
          <Link href="/" aria-label="Yuppie home" aria-current={pathname === "/" ? "page" : undefined} className="block">
            <Wordmark className="h-[46px]" />
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-x-7 gap-y-2 text-[15px] font-bold">
            <Link
              href={SIGN_IN_PATH}
              aria-current={isCurrent(pathname, SIGN_IN_PATH) ? "page" : undefined}
              className={linkClass(SIGN_IN_PATH)}
            >
              Members Area
            </Link>
            {showApply && (
              <Link
                href="/apply"
                aria-current={isCurrent(pathname, "/apply") ? "page" : undefined}
                className={cn(applyPillClass, "px-[22px]")}
              >
                Apply
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: menu button | wordmark | Apply. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-5 pt-[calc(14px+var(--safe-top))] pb-3.5 md:hidden">
        <button
          ref={menuButtonRef}
          type="button"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="site-menu"
          onClick={() => setMenuOpenOn(pathname)}
          className="flex size-11 flex-col items-center justify-center gap-[5px] justify-self-start rounded-full border-[1.5px] border-foreground bg-transparent p-0"
        >
          <span className="block h-0.5 w-[18px] bg-foreground" />
          <span className="block h-0.5 w-[18px] bg-foreground" />
        </button>
        {/* min-h-11: a 44px tap target around the 32px wordmark. */}
        <Link
          href="/"
          aria-label="Yuppie home"
          aria-current={pathname === "/" ? "page" : undefined}
          className="flex min-h-11 items-center"
        >
          <Wordmark className="h-8" />
        </Link>
        {showApply ? (
          <Link
            href="/apply"
            aria-current={isCurrent(pathname, "/apply") ? "page" : undefined}
            className={cn(applyPillClass, "justify-self-end px-[18px]")}
          >
            Apply
          </Link>
        ) : (
          <span aria-hidden />
        )}
      </div>

      {menuOpen && (
        <MobileMenu
          pathname={pathname}
          onClose={() => setMenuOpenOn(null)}
          returnFocusTo={menuButtonRef}
        />
      )}
    </header>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Full-screen menu (mobile only). A modal dialog: focus moves in and is
// kept inside (Tab and Shift+Tab wrap), Esc closes it, the page behind
// doesn't scroll, and focus goes back to the menu button on close. Closes
// on navigation (see SiteHeader), on any of its links (including the page
// already open), and if the window grows to the desktop layout.
function MobileMenu({
  pathname,
  onClose,
  returnFocusTo,
}: {
  pathname: string;
  onClose: () => void;
  returnFocusTo: RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const returnTarget = returnFocusTo.current;
    closeButtonRef.current?.focus();

    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialogRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    const desktop = window.matchMedia("(min-width: 768px)");
    const onDesktopChange = (event: MediaQueryListEvent) => {
      if (event.matches) onCloseRef.current();
    };

    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener("change", onDesktopChange);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onDesktopChange);
      root.style.overflow = previousOverflow;
      // After a navigation the button may have moved on with the page;
      // only refocus it while it's still in the document.
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
    };
  }, [returnFocusTo]);

  return (
    <div
      ref={dialogRef}
      id="site-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background pb-[env(safe-area-inset-bottom)] text-foreground md:hidden"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-5 pt-[calc(14px+var(--safe-top))] pb-3.5">
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="flex size-11 items-center justify-center justify-self-start rounded-full border-[1.5px] border-foreground bg-foreground p-0 text-background"
        >
          <CloseIcon />
        </button>
        <Link href="/" aria-label="Yuppie home" onClick={onClose} className="flex min-h-11 items-center">
          <Wordmark className="h-8" />
        </Link>
        <span aria-hidden />
      </div>

      <nav aria-label="Menu" className="mx-5 flex flex-col border-b-[1.5px] border-foreground pt-6">
        {MENU_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
            className={cn(
              "flex min-h-[72px] items-center justify-between border-t-[1.5px] border-foreground text-[34px] font-extrabold tracking-[-0.02em] no-underline",
              isCurrent(pathname, item.href) && "underline decoration-[3px] underline-offset-[8px]",
            )}
          >
            {item.label}
            <ArrowRightIcon width={20} height={14} />
          </Link>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-[18px] px-5 pt-6 pb-8">
        <Link href="/apply" onClick={onClose} className={cn(PRIMARY_BUTTON_CLASS, "w-full")}>
          Apply for membership
          <ArrowRightIcon />
        </Link>
      </div>
    </div>
  );
}
