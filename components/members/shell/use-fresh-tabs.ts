"use client";

// Keeps the pages behind the tabs (and You, and Messages where its icon shows) fetched ahead and fresh, so a tap
// on a tab opens the whole page at once (Albert, 7 Nov 2026: whole pages only; components/members/kit/link.tsx).
//
// A page fetched ahead is used for a minute (next.config.ts staleTimes.static), and Next does not fetch it again by
// itself when that minute is up. So at the member's signs of life on the page (a touch, a scroll, a key, the app
// coming back to the front), at most every 15 seconds, the pages are asked for again: one still fresh costs
// nothing (Next answers from its cache), one gone stale is fetched anew. Not on a timer, so a phone left open in a
// pocket asks the server for nothing. If the sign of life is the tap on a tab itself, its page is already on its way.

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type PrefetchOptions = NonNullable<Parameters<ReturnType<typeof useRouter>["prefetch"]>[1]>;
/** The whole page, as Link's prefetch={true} fetches it (the same cache entry). */
const FULL = { kind: "full" as PrefetchOptions["kind"] };
const AT_MOST_EVERY_MS = 15_000;

export function useFreshTabs(hrefs: string[]) {
  const router = useRouter();
  const key = hrefs.join(" ");
  useEffect(() => {
    const list = key ? key.split(" ") : [];
    if (list.length === 0) return;
    let last = Date.now();
    const wake = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < AT_MOST_EVERY_MS) return;
      last = Date.now();
      for (const href of list) router.prefetch(href, FULL);
    };
    for (const href of list) router.prefetch(href, FULL);
    const opts = { capture: true, passive: true } as const;
    window.addEventListener("pointerdown", wake, opts);
    window.addEventListener("keydown", wake, opts);
    window.addEventListener("scroll", wake, opts);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("pointerdown", wake, opts);
      window.removeEventListener("keydown", wake, opts);
      window.removeEventListener("scroll", wake, opts);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [key, router]);
}
