"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";

import { cn } from "@/lib/utils";
import { isNativeAppCookie } from "@/lib/native-app";
import { ArrowRightIcon, CloseXIcon, CoupesDrawing, MenuLinesIcon } from "@/components/site/icons";
import {
  CURRENT_LINK_CLASS,
  FOCUS_UNDERLINE_CLASS,
  NO_BOX_CLASS,
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
  // Has its own shell: phone bar, computer header and tab bar
  // (components/members/shell, from app/members/layout.tsx) —
  // this nav rendering on top of it is exactly the collision reported
  // against the "Hey, {firstName}." header.
  "/members",
  // The members preview harness (app/dev-preview, a 404 unless
  // MEMBERS_PREVIEW=1) renders members screens inside the members shell.
  "/dev-preview",
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

// The phone menu (round 2, menu A): the club first, in big type, then the
// site's pages in small type. The club links go to the home page's
// sections, in the home page's order; the ids belong to
// components/site/home.tsx (Perks, OpenInvite, Membership), so if they
// change there they must change here.
const MENU_CLUB_ITEMS: { label: string; id: string }[] = [
  { label: "Perks", id: "perks" },
  { label: "Open Invite", id: "open-invite" },
  { label: "Membership", id: "membership" },
];

const MENU_PAGE_ITEMS: { label: string; href: string }[] = [
  { label: "FAQs", href: "/faq" },
  { label: "Contact", href: "/contact" },
  { label: "Members Area", href: SIGN_IN_PATH },
];

// A home section's top in the page once the page has settled. A page
// arriving from another route fades up from 12px lower (app/template.tsx
// moves its wrapper with a transform), so scrolling to where the section is
// mid-fade would leave its top 12px above the screen once it settles: take
// the ancestors' vertical translation back out. (offsetTop also ignores
// transforms, but rounds to whole pixels, which hid 1px of a section.)
function documentTop(element: HTMLElement): number {
  let top = element.getBoundingClientRect().top + window.scrollY;
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { transform } = getComputedStyle(node);
    if (transform !== "none") top -= new DOMMatrixReadOnly(transform).m42;
  }
  return top;
}

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

// Whether the page has scrolled at all, for the desktop header's rule.
// The server (and so the first render, before hydration) says no, which is
// also the state of a page that opens at its top.
function subscribeToScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

function usePageScrolled(): boolean {
  return useSyncExternalStore(
    subscribeToScroll,
    () => window.scrollY > 0,
    () => false,
  );
}

function Wordmark({ className }: { className: string }) {
  return (
    <Image
      src="/yuppie_logo_forte_forward.png"
      alt="Club Yuppie"
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

// Header and menu controls never show a box (NO_BOX_CLASS and
// FOCUS_UNDERLINE_CLASS, in components/site/ui.ts): keyboard focus is a
// 3px underline, offset like the current page's underline (the menu's big
// links use their own 8px offset). The wordmark is an image, so its
// keyboard focus is a 3px line under it instead.
const WORDMARK_FOCUS_CLASS = `${NO_BOX_CLASS} focus-visible:shadow-[0_3px_0_var(--foreground)]`;

// The phone bar's left control ("Menu" in the header, "Close" in the
// menu): a word with a small icon, no circle, at least 44px tall.
const BAR_WORD_BUTTON_CLASS = cn(
  "flex min-h-11 items-center gap-2 justify-self-start border-0 bg-transparent p-0 text-[15px] font-bold text-foreground",
  FOCUS_UNDERLINE_CLASS,
);

// The phone top bar, shared by the header and the open menu's top row so
// the two are identical: one row, 64px tall below the top safe area
// (--site-header-h in globals.css, which includes the 1.5px line along
// its bottom), 20px sides. The grid's equal side columns keep the
// wordmark exactly centred on the screen at any phone width.
function PhoneBar({
  left,
  pathname,
  onNavigate,
}: {
  left: ReactNode;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="grid h-[calc(var(--site-header-h)+var(--safe-top))] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b-[1.5px] border-foreground px-5 pt-[var(--safe-top)] md:hidden">
      {left}
      {/* min-h-11: a 44px tap target around the 30px wordmark. */}
      <Link
        href="/"
        aria-label="Club Yuppie home"
        aria-current={pathname === "/" ? "page" : undefined}
        onClick={onNavigate}
        className={cn("flex min-h-11 items-center", WORDMARK_FOCUS_CLASS)}
      >
        <Wordmark className="h-[30px]" />
      </Link>
      <Link
        href="/apply"
        aria-current={isCurrent(pathname, "/apply") ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          "inline-flex h-11 items-center justify-self-end rounded-full bg-foreground px-4 text-[15px] font-bold text-background no-underline hover:opacity-85",
          FOCUS_UNDERLINE_CLASS,
        )}
      >
        Apply
      </Link>
    </div>
  );
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

  // A club link in the menu (Perks, Open Invite, Membership) lands on its
  // home section from any page. The scroll waits until the menu has closed
  // (it locks the page's scrolling while open) and the home page is
  // showing. From another page Next.js also scrolls to the #id as it
  // arrives; this then corrects for the page's fade-up (see documentTop).
  // On the home page itself MobileMenu skips the navigation, so a link
  // whose #id is already in the address still scrolls. Dropped if the
  // visitor ends up somewhere else.
  const pendingSectionRef = useRef<{ id: string; from: string } | null>(null);
  useEffect(() => {
    const pending = pendingSectionRef.current;
    if (!pending || menuOpen) return;
    if (pathname === "/") {
      pendingSectionRef.current = null;
      const section = document.getElementById(pending.id);
      if (section) window.scrollTo(0, documentTop(section));
    } else if (pathname !== pending.from) {
      pendingSectionRef.current = null;
    }
  }, [menuOpen, pathname]);

  const linkClass = (href: string) =>
    cn(
      "inline-flex min-h-11 items-center no-underline hover:opacity-70",
      FOCUS_UNDERLINE_CLASS,
      isCurrent(pathname, href) && CURRENT_LINK_CLASS,
    );
  // h-11 (not min-h): exactly the menu button's 44px on mobile, so the two
  // can't end up different heights. Its keyboard-focus underline is in its
  // own (yellow) text colour, since an ink line wouldn't show on the pill.
  const applyPillClass = cn(
    "inline-flex h-11 items-center rounded-full bg-foreground text-[15px] font-bold text-background no-underline hover:opacity-85",
    FOCUS_UNDERLINE_CLASS,
  );

  // From 768px (desktop header option B, approved 22 Oct 2026) the header
  // stays at the top of the window while the page scrolls, and a 1.5px ink
  // rule shows under it once the page has moved (data-scrolled), so content
  // never slides under an edgeless bar. The rule is a shadow, not a border,
  // so the bar is 94px in both states (RULE-22) and the top of every page
  // is unchanged. Phones keep the bar as it was: in the page's flow, with
  // its own rule, and data-scrolled does nothing there.
  const scrolled = usePageScrolled();

  return (
    <header
      data-site-header
      data-scrolled={scrolled ? "" : undefined}
      className={cn(
        almarai.variable,
        instrumentSerif.variable,
        "relative z-30 bg-background text-foreground antialiased md:sticky md:top-0 md:data-[scrolled]:shadow-[0_1.5px_0_var(--foreground)]",
      )}
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
          <Link
            href="/"
            aria-label="Club Yuppie home"
            aria-current={pathname === "/" ? "page" : undefined}
            className={cn("block", WORDMARK_FOCUS_CLASS)}
          >
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
            <Link
              href="/apply"
              aria-current={isCurrent(pathname, "/apply") ? "page" : undefined}
              className={cn(applyPillClass, "px-[22px]")}
            >
              Apply
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile: Menu | wordmark | Apply. */}
      <PhoneBar
        pathname={pathname}
        left={
          <button
            ref={menuButtonRef}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            onClick={() => setMenuOpenOn(pathname)}
            className={BAR_WORD_BUTTON_CLASS}
          >
            <MenuLinesIcon />
            Menu
          </button>
        }
      />

      {menuOpen && (
        <MobileMenu
          pathname={pathname}
          onClose={() => setMenuOpenOn(null)}
          onSectionLink={(id) => {
            pendingSectionRef.current = { id, from: pathname };
            setMenuOpenOn(null);
          }}
          returnFocusTo={menuButtonRef}
        />
      )}
    </header>
  );
}

// The coupes' ink box in their 200-unit grid (the same crop as the
// homepage's Events perk), so they stand exactly on the rule.
const COUPES_INK_VIEWBOX = "15.25 22.5 169.5 147.5";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Full-screen menu (mobile only). A modal dialog: focus moves in and is
// kept inside (Tab and Shift+Tab wrap), Esc closes it, and the page behind
// doesn't scroll. Closing with Esc or the Close button puts focus back on
// the menu button. Closing by navigating (a menu link, back/forward, see
// SiteHeader) or by the window growing to the desktop layout doesn't move
// focus, so nothing gets a focus ring on the new page.
function MobileMenu({
  pathname,
  onClose,
  onSectionLink,
  returnFocusTo,
}: {
  pathname: string;
  onClose: () => void;
  onSectionLink: (id: string) => void;
  returnFocusTo: RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  // Set only by Esc and the Close button: the closes that should return
  // focus to the menu button.
  const restoreFocusRef = useRef(false);
  const closeAndRestoreFocus = () => {
    restoreFocusRef.current = true;
    onClose();
  };

  useEffect(() => {
    const returnTarget = returnFocusTo.current;
    closeButtonRef.current?.focus();

    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        restoreFocusRef.current = true;
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
      if (restoreFocusRef.current && returnTarget?.isConnected) {
        returnTarget.focus({ preventScroll: true });
      }
    };
  }, [returnFocusTo]);

  return (
    <div
      ref={dialogRef}
      id="site-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background text-foreground md:hidden"
    >
      {/* The same bar as the header's, with "Close" where "Menu" was. */}
      <PhoneBar
        pathname={pathname}
        onNavigate={onClose}
        left={
          <button ref={closeButtonRef} type="button" onClick={closeAndRestoreFocus} className={BAR_WORD_BUTTON_CLASS}>
            <CloseXIcon />
            Close
          </button>
        }
      />

      {/* The club first: the home page's three sections in big rows (never
          marked current). Then the site's pages in small type, 44px tall
          each, the current page underlined as in the desktop header. One
          nav, so one landmark. */}
      <nav aria-label="Menu" className="mt-5">
        <div className="mx-5 flex flex-col border-b-[1.5px] border-foreground">
          {MENU_CLUB_ITEMS.map((item) => (
            <Link
              key={item.id}
              href={`/#${item.id}`}
              onClick={(event) => {
                // A new tab or window: leave it to the browser.
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                // Already on the home page: no navigation, so the section
                // scrolls into view even when its #id is already in the
                // address (SiteHeader scrolls once the menu has closed).
                if (pathname === "/") {
                  event.preventDefault();
                  if (window.location.hash !== `#${item.id}`) window.history.pushState(null, "", `/#${item.id}`);
                }
                onSectionLink(item.id);
              }}
              className={cn(
                "flex min-h-[68px] items-center justify-between border-t-[1.5px] border-foreground text-[36px] font-extrabold tracking-[-0.025em] no-underline",
                NO_BOX_CLASS,
                "focus-visible:underline focus-visible:decoration-[3px] focus-visible:underline-offset-[8px]",
              )}
            >
              {item.label}
              <ArrowRightIcon width={20} height={14} />
            </Link>
          ))}
        </div>
        <div className="mx-5 mt-2 flex flex-wrap gap-x-6">
          {MENU_PAGE_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 min-w-11 items-center text-base font-bold no-underline",
                FOCUS_UNDERLINE_CLASS,
                isCurrent(pathname, item.href) && CURRENT_LINK_CLASS,
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* The two champagne coupes (cropped to their ink) standing on a 3px
          rule, then the price line and the Apply button 16px below the
          rule. (The hero shows the figures large, so the menu doesn't
          repeat them.) Sized by the visible height: 170px wide and 32px
          below the links from 700px; 128px wide and 24px below them from
          650px to 699px (the 170px drawing doesn't fit with the price line
          and the button underneath); left out under 650px so it can't
          crowd the links and the button. At 664 (iPhone 390 with Safari's
          toolbars) the space between the small links and the coupes is
          46px. The menu is full screen behind Safari's floating toolbar,
          so the button keeps the bottom safe area plus 56px under it. */}
      <div className="mt-auto">
        <div className="mx-5 flex justify-center border-b-[3px] border-foreground pt-6 [@media(min-height:700px)]:pt-8 [@media(max-height:649.98px)]:hidden">
          <CoupesDrawing
            size={170}
            viewBox={COUPES_INK_VIEWBOX}
            width={170}
            height={(170 * 147.5) / 169.5}
            className="block h-auto w-[128px] [@media(min-height:700px)]:w-[170px]"
          />
        </div>
        <div className="px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+56px)]">
          {/* Centred over the centred button label and coupes (RULE-12,
              allowed 22 Oct 2026). */}
          <p className="m-0 mb-3 text-center text-[15px] font-bold leading-[1.4]">£10 a month. Cancel any time.</p>
          <Link href="/apply" onClick={onClose} className={cn(PRIMARY_BUTTON_CLASS, "w-full", FOCUS_UNDERLINE_CLASS)}>
            Apply for membership
            <ArrowRightIcon />
          </Link>
        </div>
      </div>
    </div>
  );
}
