"use client";

// Media queries read through useSyncExternalStore: the server and the first
// client render say false (no hydration mismatch), then it settles. Only
// behaviour needs them (what counts as read, whether a drawer is modal); the
// layout itself is CSS.

import { useSyncExternalStore } from "react";

export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** From 1024px the inbox and the open chat sit side by side. */
export function useTwoPanes(): boolean {
  return useMinWidth(1024);
}

/** From 768px a sheet is a drawer inside the thread card, and the page behind it stays usable. */
export function useDrawer(): boolean {
  return useMinWidth(768);
}
