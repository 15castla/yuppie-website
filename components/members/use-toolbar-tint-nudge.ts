"use client";

import { useEffect } from "react";

// iOS Safari 26's bottom-toolbar tint (which colors its floating chrome
// to match a qualifying fixed/sticky element's background, see
// members-nav.tsx's MembersBottomBar) is reliable on a page's first ever
// computation for a given URL, but has a documented, still-open WebKit
// bug where it doesn't correctly recompute on a plain reload afterwards,
// confirmed on a real device even from a fully cleared Safari cache.
// Developers report the one thing that reliably "unsticks" it is any
// viewport-geometry change, most commonly rotating the device. This
// nudges the scroll position by a single pixel and back immediately
// after mount to try to trigger that same recomputation programmatically,
// without requiring the user to actually rotate their phone. Cheap and
// harmless if it turns out not to help: a 1px scroll and back is not
// visible to a user.
export function useToolbarTintNudge() {
  useEffect(() => {
    const raf1 = requestAnimationFrame(() => {
      window.scrollTo(window.scrollX, window.scrollY + 1);
      requestAnimationFrame(() => {
        window.scrollTo(window.scrollX, window.scrollY - 1);
      });
    });
    return () => cancelAnimationFrame(raf1);
  }, []);
}
