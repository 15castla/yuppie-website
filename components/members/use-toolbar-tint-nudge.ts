"use client";

import { useEffect } from "react";

// iOS Safari 26's bottom-toolbar tint (which colors its floating chrome
// to match a qualifying fixed/sticky element's background, see
// members-nav.tsx's MembersBottomBar) is reliable on a page's first ever
// computation for a given URL, but has a documented, still-open WebKit
// bug where it doesn't correctly recompute on a plain reload afterwards,
// confirmed on a real device even from a fully cleared Safari cache.
// Developers report the one thing that reliably "unsticks" it is any
// viewport-geometry change, most commonly rotating the device.
//
// A plain scroll nudge (tried first, see git history) didn't measurably
// help. This instead briefly toggles the viewport meta tag's
// viewport-fit value from cover to auto and back, which is the specific
// setting controlling env(safe-area-inset-*) and the "obscured content
// inset" this toolbar behavior is keyed off, forcing the browser to
// recompute that geometry from scratch rather than nudging something
// only incidentally related to it.
export function useToolbarTintNudge() {
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;

    const original = meta.getAttribute("content");
    if (!original || !original.includes("viewport-fit=cover")) return;

    const toggled = original.replace("viewport-fit=cover", "viewport-fit=auto");
    meta.setAttribute("content", toggled);

    const timeoutId = setTimeout(() => {
      meta.setAttribute("content", original);
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      meta.setAttribute("content", original);
    };
  }, []);
}
