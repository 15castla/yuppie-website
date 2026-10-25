"use client";

// True from 1024px up, where the inbox and the open chat sit side by side. A
// media query read through useSyncExternalStore: the server and the first
// client render say false (no hydration mismatch), then it settles. Only the
// "the open chat counts as read" idea needs it; the layout itself is CSS.

import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void): () => void {
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

export function useTwoPanes(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
