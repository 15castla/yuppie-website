"use client";

// A bottom sheet on a phone, a centred dialog from 768px. Kit counterpart:
// .sheet + .scrim (the scrim and sheet are position:fixed to the viewport in
// app/members/members.css). Used by the Open Invite moments (success,
// withdraw, report) and by every payment sheet.
//
// Behaviour a design cannot draw: Escape closes, focus moves into the sheet
// and is kept there, the page behind is inert (not read, not tabbable, not
// clickable) and does not scroll, and focus goes back to what opened it. The
// scrim closes it unless `dismissable` is false (a payment that is being
// taken).
//
// useModalFocus below is the one piece that does this. The payment hand-off
// outlines (the stand-in bank and Stripe screens) use it too.
//
// needs_device_check: position:fixed sizing against Safari's collapsing
// toolbars, the keyboard pushing a sheet up, the bottom safe area.

import "./invite.css";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

import { Icon } from "@/components/members/kit";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** The close buttons: the sheet's own corner button and the pay sheet's header button. Never the first thing to act on. */
const CLOSE_BUTTONS = "[data-sheet-x],.pay-x";

/** Elements that are never made inert: the sheet's own scrim (it closes the sheet) and anything that is not page content. */
const KEEP_LIVE = "[data-keep-live]";
const NOT_PAGE = /^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT)$/;

/** Can this element take focus right now? Not display:none (or inside it), not visibility:hidden, not zero-sized. */
function canTakeFocus(el: HTMLElement): boolean {
  if (typeof el.checkVisibility === "function") {
    if (!el.checkVisibility({ visibilityProperty: true })) return false;
  } else if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") {
    return false;
  }
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

/**
 * The tab stops inside `root`, in order. Browsers visit one radio per group
 * (the checked one, else the first), so the others are left out: the trap's
 * first and last stop must be places Tab really lands.
 */
export function tabStops(root: HTMLElement): HTMLElement[] {
  const visible = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(canTakeFocus);
  const checked = new Set(
    visible.filter((el): el is HTMLInputElement => el instanceof HTMLInputElement && el.type === "radio" && el.checked).map((el) => el.name),
  );
  const seen = new Set<string>();
  return visible.filter((el) => {
    if (!(el instanceof HTMLInputElement) || el.type !== "radio" || el.name === "") return true;
    if (checked.has(el.name)) return el.checked;
    if (seen.has(el.name)) return false;
    seen.add(el.name);
    return true;
  });
}

/** The first thing to act on: the first tab stop that is not a close button, else the first stop, else the container itself. */
function firstAction(root: HTMLElement): HTMLElement {
  const stops = tabStops(root);
  return stops.find((el) => !el.matches(CLOSE_BUTTONS)) ?? stops[0] ?? root;
}

/** The ancestors of `el`, nearest first, stopping below <main>: the places to look for a control when `el` itself is gone. */
function placesAround(el: HTMLElement | null): HTMLElement[] {
  const places: HTMLElement[] = [];
  for (let up = el?.parentElement ?? null; up && up !== document.body && up.tagName !== "MAIN"; up = up.parentElement) places.push(up);
  return places;
}

/**
 * The last control that took focus (outside a dialog), with the places around it. A control that the click replaces
 * (the free "I'm in" turns into "You're in" a moment before the sheet shows) has already dropped focus by the time
 * the sheet opens, so the sheet cannot ask the page who had it.
 */
let lastFocus: { el: HTMLElement; nearby: HTMLElement[] } | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (event) => {
      const el = event.target;
      if (el instanceof HTMLElement && !el.closest("[role=dialog]")) lastFocus = { el, nearby: placesAround(el) };
    },
    true,
  );
}

/** Everything around the modal (its siblings, and its ancestors' siblings, up to <body>) stops being part of the page. Returns the undo. */
function makeRestInert(node: HTMLElement): () => void {
  const made: HTMLElement[] = [];
  let current: HTMLElement | null = node;
  while (current && current !== document.body && current.parentElement) {
    const parent: HTMLElement = current.parentElement;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === current || !(sibling instanceof HTMLElement)) continue;
      if (sibling.inert || sibling.matches(KEEP_LIVE) || NOT_PAGE.test(sibling.tagName)) continue;
      // Custom elements (the dev overlay, the route announcer) are not page content either.
      if (sibling.tagName.includes("-")) continue;
      sibling.inert = true;
      made.push(sibling);
    }
    current = parent;
  }
  return () => {
    for (const el of made) el.inert = false;
  };
}

/**
 * Makes `ref` a modal dialog for the keyboard and for screen readers:
 *  - on open, focus moves to the first thing to act on (not the close button);
 *  - Tab and Shift+Tab stay inside, and wrap;
 *  - the page behind is inert and does not scroll;
 *  - Escape calls `onEscape` (leave it out when the dialog must not close);
 *  - when the focused control disappears (a sheet that changes state under its
 *    own button) focus moves to the first action again, not to the page top;
 *  - on close, focus goes back to what was focused when it opened (or, if the
 *    page changed under it, to the nearest control that is still there).
 */
export function useModalFocus(ref: RefObject<HTMLElement | null>, onEscape?: () => void): void {
  const escapeRef = useRef(onEscape);
  // Keep the latest handler for the key listener without re-running the focus effect.
  useEffect(() => {
    escapeRef.current = onEscape;
  });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const opener =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    // Where the opener sat, nearest first (below <main>): if the page changes under it (Get paid becomes ready, the card flips to "You're in")
    // and it is gone when the sheet closes, focus goes to the first control in the nearest of these that still has one. If the opener
    // was already gone when the sheet opened, the last control that had focus stands in for it.
    const nearby = opener ? placesAround(opener) : lastFocus && !document.contains(lastFocus.el) ? lastFocus.nearby : [];
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const restoreRest = makeRestInert(node);
    // A sheet that is already open when the page loads (the preview harness) has no keyboard behind it: focus goes in, but no ring is drawn.
    // Anything opened by a person has an opener (or a last focused control) and the browser decides the ring as usual.
    const quiet = !opener && !lastFocus;
    firstAction(node).focus({ preventScroll: true, ...(quiet ? { focusVisible: false } : {}) } as FocusOptions);

    function onKey(event: KeyboardEvent) {
      if (!node) return;
      if (event.key === "Escape") {
        if (escapeRef.current) {
          event.stopPropagation();
          escapeRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const stops = tabStops(node);
      if (stops.length === 0) {
        event.preventDefault();
        node.focus({ preventScroll: true });
        return;
      }
      const head = stops[0];
      const tail = stops[stops.length - 1];
      const active = document.activeElement;
      const inside = active instanceof HTMLElement && node.contains(active) && active !== node;
      if (!inside || (event.shiftKey && active === head) || (!event.shiftKey && active === tail)) {
        event.preventDefault();
        const target = event.shiftKey ? tail : head;
        // A lone control that already has focus (the hand-off screens) would keep a quiet focus: let go first so the ring shows now a key is in use.
        if (target === active) target.blur();
        target.focus({ preventScroll: true });
      }
    }
    document.addEventListener("keydown", onKey);

    // A sheet changes under its own button (Try again, Paying, You're in): when that
    // takes the focused control away, put focus on the new first action.
    const watcher = new MutationObserver(() => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      firstAction(node).focus({ preventScroll: true });
    });
    watcher.observe(node, { childList: true, subtree: true });

    return () => {
      watcher.disconnect();
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      restoreRest();
      if (opener && document.contains(opener)) {
        opener.focus({ preventScroll: true });
        return;
      }
      for (const place of nearby) {
        if (!document.contains(place)) continue;
        const stop = tabStops(place)[0];
        if (stop) {
          stop.focus({ preventScroll: true });
          return;
        }
      }
    };
  }, [ref]);
}

export function Sheet({
  labelledBy,
  onClose,
  dismissable = true,
  variant = "oi",
  className,
  children,
}: {
  /** The id of the heading inside, for the dialog's name. */
  labelledBy: string;
  onClose: () => void;
  dismissable?: boolean;
  /** Width and padding on a computer: oi is 480px, pay is 520px. */
  variant?: "oi" | "pay";
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref, dismissable ? onClose : undefined);

  return (
    <>
      <div
        className="mk-scrim"
        aria-hidden="true"
        data-keep-live=""
        onClick={() => {
          if (dismissable) onClose();
        }}
      />
      <div
        ref={ref}
        className={cn("mk-sheet inv-sheet", variant === "pay" ? "pay-sheet" : "oi-sheet", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-needs-device-check="true"
      >
        <div className="mk-grab" />
        {dismissable ? (
          <button
            type="button"
            className="mk-icon-btn inv-sheet-x"
            aria-label="Close"
            data-sheet-x=""
            onClick={onClose}
          >
            <Icon name="x" size={22} />
          </button>
        ) : null}
        {children}
      </div>
    </>
  );
}
