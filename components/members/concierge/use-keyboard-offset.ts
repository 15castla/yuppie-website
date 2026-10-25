"use client";

// Keeps a bottom-anchored bar (the composer) above the on-screen keyboard.
//
// The app's WebView has no Keyboard plugin, so when the keyboard opens iOS
// leaves the layout viewport as it was and only shrinks (and may pan) the
// VISUAL viewport: a fixed or sticky bar at the bottom edge would sit behind
// the keyboard. This sets --cn-kb on the bar to how much of the layout
// viewport's foot the keyboard covers, and the stylesheet lifts the bar by
// that much (transform: translateY(calc(-1 * var(--cn-kb)))). Browsers that
// resize the layout viewport for the keyboard (Android Chrome) report 0 here
// and need nothing. Pinch zoom also changes the visual viewport, so a zoomed
// page is left alone.
//
// needs_device_check: no keyboard exists in the build sandbox.

import { useEffect, type RefObject } from "react";

export function useKeyboardOffset(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const viewport = window.visualViewport;
    const node = ref.current;
    if (!viewport || !node) return;

    const update = () => {
      const covered =
        viewport.scale > 1.01
          ? 0
          : Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
      node.style.setProperty("--cn-kb", `${covered}px`);
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      node.style.removeProperty("--cn-kb");
    };
  }, [ref]);
}
