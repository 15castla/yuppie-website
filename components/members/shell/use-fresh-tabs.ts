"use client";

// Keeps the pages behind the tabs (and You, and Messages where its icon shows) fetched ahead and fresh, so a tap
// on a tab opens the whole page at once (Albert, 7 Nov 2026: whole pages only; components/members/kit/link.tsx).
//
// A page fetched ahead is used for a minute (next.config.ts staleTimes.static), and Next does not fetch it again by
// itself when that minute is up: a tap on a tab gone stale waits for the server (15 Nov 2026, Albert: "a bit of a
// lag between picking a page and it actually being displayed"). So the pages are asked for again often: one still
// fresh costs nothing (Next answers from its cache, no request), one gone stale is fetched anew, so each page is
// fetched about once a minute while the member uses the app.
//   - at the member's signs of life (a touch, a scroll, a key, the app coming back to the front), at most every 3s;
//   - every 5s while the page is on screen and there was a sign of life in the last 2 minutes, so reading a long
//     page without touching it still finds the tabs ready.
// Nothing after 2 minutes without a sign of life, so a phone left open in a pocket asks the server for nothing. If
// the sign of life is the tap on a tab itself, its page is already on its way.

import { useRouter } from "next/navigation";
import { useEffect } from "react";

type PrefetchOptions = NonNullable<Parameters<ReturnType<typeof useRouter>["prefetch"]>[1]>;
/** The whole page, as Link's prefetch={true} fetches it (the same cache entry). */
const FULL = { kind: "full" as PrefetchOptions["kind"] };
const AT_MOST_EVERY_MS = 3_000;
const CHECK_EVERY_MS = 5_000;
const ACTIVE_FOR_MS = 120_000;

export function useFreshTabs(hrefs: string[]) {
  const router = useRouter();
  const key = hrefs.join(" ");
  useEffect(() => {
    const list = key ? key.split(" ") : [];
    if (list.length === 0) return;
    let asked = Date.now();
    let lifeAt = Date.now();
    const ask = () => {
      if (document.visibilityState !== "visible" || Date.now() - asked < AT_MOST_EVERY_MS) return;
      asked = Date.now();
      for (const href of list) router.prefetch(href, FULL);
    };
    const wake = () => {
      lifeAt = Date.now();
      ask();
    };
    const tick = () => {
      if (Date.now() - lifeAt < ACTIVE_FOR_MS) ask();
    };
    for (const href of list) router.prefetch(href, FULL);
    const timer = window.setInterval(tick, CHECK_EVERY_MS);
    const opts = { capture: true, passive: true } as const;
    window.addEventListener("pointerdown", wake, opts);
    window.addEventListener("keydown", wake, opts);
    window.addEventListener("scroll", wake, opts);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", wake, opts);
      window.removeEventListener("keydown", wake, opts);
      window.removeEventListener("scroll", wake, opts);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [key, router]);
}
