"use client";

// A modal dialog's keyboard behaviour, for the memory sheet and its confirm:
// focus moves in when it opens (to `initialFocus`, else the dialog itself),
// Tab stays inside it, Escape asks to close. `lockScroll` stops the page
// behind it scrolling. Mount the dialog only while it is open: the effect runs
// on mount and its cleanup on unmount. Putting focus back where it came from
// is the caller's job (it knows which control opened the dialog; capturing
// document.activeElement here breaks under React's double-invoked effects).

import { useEffect, useRef, type KeyboardEvent } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useDialog<T extends HTMLElement>({
  onClose,
  initialFocus,
  lockScroll = false,
}: {
  onClose: () => void;
  /** A selector inside the dialog for the control that gets focus first. */
  initialFocus?: string;
  lockScroll?: boolean;
}) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const node = ref.current;
    const target = (initialFocus ? node?.querySelector<HTMLElement>(initialFocus) : null) ?? node;
    target?.focus({ preventScroll: true });

    const root = document.documentElement;
    const overflow = root.style.overflow;
    if (lockScroll) root.style.overflow = "hidden";

    return () => {
      if (lockScroll) root.style.overflow = overflow;
    };
  }, [initialFocus, lockScroll]);

  function onKeyDown(event: KeyboardEvent<T>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const node = ref.current;
    if (!node) return;
    const stops = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (stops.length === 0) {
      event.preventDefault();
      return;
    }
    const first = stops[0];
    const last = stops[stops.length - 1];
    const active = document.activeElement;
    // Shift+Tab from the dialog itself, its first stop, or a heading that took focus by script (the memory sheet
    // moves focus there once the last item is removed) wraps to the end instead of leaving the dialog.
    if (event.shiftKey && (active === first || active === node || !stops.includes(active as HTMLElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return { ref, onKeyDown };
}
